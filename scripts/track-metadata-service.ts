import {
  parseArtists,
  sanitizeTitle,
  matchArtist,
  isTitleSimilar
} from "./text-sanitizer.js";

export interface TrackMetadata {
  title: string;
  artists: string[];
  album: string | null;
  releaseDate: string | null;
  durationMs: number | null;
  genres: string[];
  isrc: string | null;
  coverUrl: string | null;
  sources: Partial<
    Record<
      "musicbrainz" | "itunes" | "deezer",
      string
    >
  >;
}

export class TrackMetadataService {
  private userAgent = "TrackMetadataFetcher/1.0 (local-test)";
  
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private mergeMetadata(current: TrackMetadata, newH: Partial<TrackMetadata>) {
    if (current.durationMs && newH.durationMs) {
      const durationDiff = Math.abs(current.durationMs - newH.durationMs);
      if (durationDiff > 15000) {
        return;
      }
    }

    if (!current.title && newH.title) current.title = newH.title;
    if (current.artists.length === 0 && newH.artists && newH.artists.length > 0) current.artists = newH.artists;
    if (!current.album && newH.album) current.album = newH.album;
    if (!current.releaseDate && newH.releaseDate) current.releaseDate = newH.releaseDate;
    if (!current.durationMs && newH.durationMs) current.durationMs = newH.durationMs;
    if (current.genres.length === 0 && newH.genres && newH.genres.length > 0) current.genres = newH.genres;
    if (!current.isrc && newH.isrc) current.isrc = newH.isrc;
    if (!current.coverUrl && newH.coverUrl) current.coverUrl = newH.coverUrl;
    
    if (newH.sources) current.sources = {...current.sources, ...newH.sources};
  }
  
  private isComplete(data: TrackMetadata): boolean {
    return !!(
      (data.title && data.artists.length > 0) &&
      (data.album && data.releaseDate && data.durationMs) &&
      (data.genres.length > 0 && data.isrc && data.coverUrl)
    );
  }
  
  public async fetchMetadata(queryTitle: string, queryArtist?: string, manualGenresInfo?: string[]): Promise<TrackMetadata> {
    const { primaryArtist, allArtists } = parseArtists(queryArtist);
    const cleanTitle = sanitizeTitle(queryTitle);

    const meta: TrackMetadata = {
      title: queryTitle,
      artists: allArtists.length > 0 ? allArtists : (queryArtist ? [queryArtist] : []),
      album: null,
      releaseDate: null,
      durationMs: null,
      genres: [],
      isrc: null,
      coverUrl: null,
      sources: {}
    };

    const isSingleWord = !cleanTitle.includes(" ");
    const hasNoArtist = allArtists.length === 0;
    const shouldSkipMusicBrainzFirst = isSingleWord && hasNoArtist;
    
    // 1. MusicBrainz (se não for título ambíguo sem artista)
    if (!shouldSkipMusicBrainzFirst) {
      const mbData = await this.#searchMusicBrainz(cleanTitle, primaryArtist, allArtists);
      if (mbData) this.mergeMetadata(meta, mbData);
      if (this.isComplete(meta)) return meta;
    }
    
    // 2. iTunes
    const itunesData = await this.#searchItunes(cleanTitle, primaryArtist, allArtists);
    if (itunesData) this.mergeMetadata(meta, itunesData);
    if (this.isComplete(meta)) return meta;
    
    // 3. Deezer
    const deezerData = await this.#searchDeezer(cleanTitle, primaryArtist, allArtists);
    if (deezerData) this.mergeMetadata(meta, deezerData);
    
    if (manualGenresInfo && meta.genres.length === 0) {
      meta.genres = [...manualGenresInfo];
    }
    
    return meta;
  }
  
  async #searchMusicBrainz(title: string, primaryArtist: string, allArtists: string[]): Promise<Partial<TrackMetadata> | null> {
    try {
      const sanitizedTitleQuery = title.replace(/"/g, "");
      let query = `recording:"${sanitizedTitleQuery}"`;

      if (primaryArtist) {
        const sanitizedArtist = primaryArtist.replace(/"/g, "");
        query = `recording:"${sanitizedTitleQuery}" AND artist:"${sanitizedArtist}"`;
      }

      const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&inc=releases+isrcs+tags&fmt=json&limit=5`;
      
      await this.delay(1000);
      
      const response = await fetch(url, {headers: {'User-Agent': this.userAgent}});
      if (!response.ok) return null;
      
      const data = await response.json();
      if (!data.recordings || data.recordings.length === 0) return null;
      
      const candidate = data.recordings.find((rec: any) => {
        const recArtists: string[] = rec['artist-credit']?.map((ac: any) => ac.name) || [];
        const artistMatched = allArtists.length === 0 || recArtists.some(a => matchArtist(a, allArtists));
        const titleMatched = isTitleSimilar(title, rec.title);
        return artistMatched && titleMatched;
      });

      if (!candidate) return null;
      
      const release = candidate.releases && candidate.releases.length > 0 ? candidate.releases[0] : null;
      
      return {
        title: candidate.title,
        artists: candidate['artist-credit']?.map((ac: any) => ac.name) || [],
        album: release ? release.title : null,
        releaseDate: release ? release.date : null,
        durationMs: candidate.length || null,
        genres: candidate.tags?.map((t: any) => t.name) || [],
        isrc: candidate.isrcs && candidate.isrcs.length > 0 ? candidate.isrcs[0] : null,
        sources: {musicbrainz: `https://musicbrainz.org/recording/${candidate.id}`}
      };
    } catch {
      return null;
    }
  }
  
  async #searchItunes(title: string, primaryArtist: string, allArtists: string[]): Promise<Partial<TrackMetadata> | null> {
    try {
      const term = primaryArtist ? `${title} ${primaryArtist}` : title;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`;
      
      const response = await fetch(url);
      if (!response.ok) return null;
      
      const data = await response.json();
      if (!data.results || data.results.length === 0) return null;
      
      const candidate = data.results.find((rec: any) => {
        const artistMatched = allArtists.length === 0 || matchArtist(rec.artistName, allArtists);
        const titleMatched = isTitleSimilar(title, rec.trackName);
        return artistMatched && titleMatched;
      });

      if (!candidate) return null;

      const coverUrl = candidate.artworkUrl100 ? candidate.artworkUrl100.replace('100x100bb', '1000x1000bb') : null;
      
      return {
        title: candidate.trackName,
        artists: [candidate.artistName],
        album: candidate.collectionName,
        releaseDate: candidate.releaseDate,
        durationMs: candidate.trackTimeMillis,
        genres: candidate.primaryGenreName ? [candidate.primaryGenreName] : [],
        coverUrl: coverUrl,
        sources: {itunes: candidate.trackViewUrl}
      };
    } catch {
      return null;
    }
  }
  
  async #searchDeezer(title: string, primaryArtist: string, allArtists: string[]): Promise<Partial<TrackMetadata> | null> {
    try {
      let queryUrl = `https://api.deezer.com/search?q=${encodeURIComponent(`${title} ${primaryArtist}`.trim())}&limit=5`;
      if (primaryArtist) {
        queryUrl = `https://api.deezer.com/search?q=${encodeURIComponent(`track:"${title}" artist:"${primaryArtist}"`)}&limit=5`;
      }
      
      let response = await fetch(queryUrl);
      if (!response.ok) return null;
      
      let data = await response.json();
      if ((!data.data || data.data.length === 0) && primaryArtist) {
        const fallbackUrl = `https://api.deezer.com/search?q=${encodeURIComponent(`${title} ${primaryArtist}`)}&limit=5`;
        response = await fetch(fallbackUrl);
        if (response.ok) {
          data = await response.json();
        }
      }

      if (!data.data || data.data.length === 0) return null;
      
      const candidate = data.data.find((rec: any) => {
        const artistMatched = allArtists.length === 0 || matchArtist(rec.artist?.name, allArtists);
        const titleMatched = isTitleSimilar(title, rec.title);
        return artistMatched && titleMatched;
      });

      if (!candidate) return null;
      
      const trackUrl = `https://api.deezer.com/track/${candidate.id}`;
      const trackRes = await fetch(trackUrl);
      
      let isrc = null;
      let releaseDate = null;
      
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        isrc = trackData.isrc || null;
        releaseDate = trackData.release_date || null;
      }
      
      return {
        title: candidate.title,
        artists: [candidate.artist?.name || ""],
        album: candidate.album?.title || null,
        releaseDate: releaseDate,
        durationMs: candidate.duration ? candidate.duration * 1000 : null,
        isrc: isrc,
        coverUrl: candidate.album?.cover_xl || candidate.album?.cover_large || null,
        sources: {deezer: candidate.link}
      };
    } catch {
      return null;
    }
  }
}
