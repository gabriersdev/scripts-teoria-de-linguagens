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
    const meta: TrackMetadata = {
      title: queryTitle,
      artists: queryArtist ? [queryArtist] : [],
      album: null,
      releaseDate: null,
      durationMs: null,
      genres: [],
      isrc: null,
      coverUrl: null,
      sources: {}
    };
    
    // MusicBrainz
    const mbData = await this.#searchMusicBrainz(queryTitle, queryArtist);
    if (mbData) this.mergeMetadata(meta, mbData);
    if (this.isComplete(meta)) return meta;
    
    // iTunes
    const itunesData = await this.#searchItunes(queryTitle, queryArtist);
    if (itunesData) this.mergeMetadata(meta, itunesData);
    if (this.isComplete(meta)) return meta;
    
    // Deezer
    const deezerData = await this.#searchDeezer(queryTitle, queryArtist);
    if (deezerData) this.mergeMetadata(meta, deezerData);
    
    if (manualGenresInfo && !meta.genres) meta.genres = [...manualGenresInfo];
    
    return meta;
  }
  
  async #searchMusicBrainz(title: string, artist?: string): Promise<Partial<TrackMetadata> | null> {
    try {
      const query = artist ? `${title} ${artist}` : title;
      const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&inc=releases+isrcs+tags&fmt=json`;
      
      await this.delay(1000);
      
      const response = await fetch(url, {headers: {'User-Agent': this.userAgent}});
      if (!response.ok) return null;
      
      const data = await response.json();
      if (!data.recordings || data.recordings.length === 0) return null;
      
      const rec = data.recordings[0];
      const release = rec.releases && rec.releases.length > 0 ? rec.releases[0] : null;
      
      return {
        title: rec.title,
        artists: rec['artist-credit']?.map((ac: any) => ac.name) || [],
        album: release ? release.title : null,
        releaseDate: release ? release.date : null,
        durationMs: rec.length || null,
        genres: rec.tags?.map((t: any) => t.name) || [],
        isrc: rec.isrcs && rec.isrcs.length > 0 ? rec.isrcs[0] : null,
        sources: {musicbrainz: `https://musicbrainz.org/recording/${rec.id}`}
      };
    } catch {
      return null;
    }
  }
  
  async #searchItunes(title: string, artist?: string): Promise<Partial<TrackMetadata> | null> {
    try {
      const term = artist ? `${title} ${artist}` : title;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`;
      
      const response = await fetch(url);
      if (!response.ok) return null;
      
      const data = await response.json();
      if (!data.results || data.results.length === 0) return null;
      
      const rec = data.results[0];
      const coverUrl = rec.artworkUrl100 ? rec.artworkUrl100.replace('100x100bb', '1000x1000bb') : null;
      
      return {
        title: rec.trackName,
        artists: [rec.artistName],
        album: rec.collectionName,
        releaseDate: rec.releaseDate,
        durationMs: rec.trackTimeMillis,
        genres: rec.primaryGenreName ? [rec.primaryGenreName] : [],
        coverUrl: coverUrl,
        sources: {itunes: rec.trackViewUrl}
      };
    } catch {
      return null;
    }
  }
  
  async #searchDeezer(title: string, artist?: string): Promise<Partial<TrackMetadata> | null> {
    try {
      // Busca sem prefixos forçados para ser mais flexível
      const query = artist ? `${title} ${artist}` : title;
      const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;
      
      const response = await fetch(url);
      if (!response.ok) return null;
      
      const data = await response.json();
      if (!data.data || data.data.length === 0) return null;
      
      const rec = data.data[0];
      
      const trackUrl = `https://api.deezer.com/track/${rec.id}`;
      const trackRes = await fetch(trackUrl);
      
      let isrc = null;
      let releaseDate = null;
      
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        isrc = trackData.isrc;
        releaseDate = trackData.release_date;
      }
      
      return {
        title: rec.title,
        artists: [rec.artist.name],
        album: rec.album.title,
        releaseDate: releaseDate,
        durationMs: rec.duration ? rec.duration * 1000 : null,
        isrc: isrc,
        coverUrl: rec.album.cover_xl || rec.album.cover_large || null,
        sources: {deezer: rec.link}
      };
    } catch {
      return null;
    }
  }
}
