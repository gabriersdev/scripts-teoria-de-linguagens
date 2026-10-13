/**
 * O LyricsService é responsável pela busca, extração e validação de letras musicais
 * direcionadas ao corpus de análise textual em língua portuguesa. O serviço opera por meio
 * de uma arquitetura de fallback em cascata cooperativa com três provedores externos: LRCLIB (provedor prioritário
 * com suporte a letras sincronizadas e puras), lyrics.ovh (segunda camada de consulta direta e sugestão)
 * e Genius API com raspagem HTML semântica (camada de contingência final).
 *
 * Para contornar desvios decorrentes de faixas homônimas ou cadastros divergentes nas plataformas,
 * as buscas são higienizadas previamente pelo text-sanitizer. O serviço efetua correspondência N-para-1 entre o autor
 * retornado pelo provedor e qualquer um dos colaboradores da música, respeitando exceções de grafia
 * artística e conferindo tolerâncias de tempo de reprodução caso a duração já tenha sido identificada nos metadados.
 *
 * Como critério de qualidade e integridade do corpus de pesquisa, todas as letras retornadas
 * são submetidas a uma validação estatística de vocabulário, descartando automaticamente textos
 * predominantemente redigidos em outros idiomas, respostas vazias ou marcadores de faixa instrumental.
 * Se um provedor fornecer um conteúdo inválido, a requisição é reprovada silenciosamente e o fluxo
 * transita para o próximo elo da cascata até encontrar uma correspondência autêntica ou esgotar as fontes.
 */

// @ts-ignore
import 'dotenv/config';
import {fileURLToPath} from 'url';
import {
  parseArtists,
  sanitizeTitle,
  matchArtist,
  isTitleSimilar,
  isPortugueseLyrics
} from './text-sanitizer.js';

export interface LyricsResult {
  lyrics: string;
  source: "lrclib" | "lyrics.ovh" | "genius";
  syncedLyrics?: string | null;
}

interface LrclibResult {
  trackName: string;
  artistName: string;
  albumName: string;
  duration?: number;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  instrumental: boolean;
}

interface GeniusSearchResult {
  id: number;
  title: string;
  full_title: string;
  url: string;
  primary_artist: {
    name: string;
  };
}

interface GeniusSearchResponse {
  response: {
    hits: Array<{
      type: string;
      result: GeniusSearchResult;
    }>;
  };
}

export class LyricsService {
  private geniusAccessToken = process.env.GENIUS_ACCESS_TOKEN;
  private userAgent = "LyricsFetcher/1.0";
  
  async #fetchJson<T>(
    url: string,
    options?: RequestInit,
  ): Promise<T | null> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": this.userAgent,
          ...options?.headers,
        },
      });
      
      if (!response.ok) return null;
      return await response.json() as T;
    } catch {
      return null;
    }
  }
  
  async #getFromLrclib(
    cleanTitle: string,
    primaryArtist: string,
    allArtists: string[],
    expectedDurationMs?: number | null
  ): Promise<LyricsResult | null> {
    const url = new URL("https://lrclib.net/api/search");
    
    if (primaryArtist) {
      url.searchParams.set("track_name", cleanTitle);
      url.searchParams.set("artist_name", primaryArtist);
    } else {
      url.searchParams.set("q", cleanTitle);
    }
    
    let results = await this.#fetchJson<LrclibResult[]>(url.toString());
    
    if ((!results || results.length === 0) && primaryArtist) {
      const fallbackUrl = new URL("https://lrclib.net/api/search");
      fallbackUrl.searchParams.set("q", `${primaryArtist} ${cleanTitle}`.trim());
      results = await this.#fetchJson<LrclibResult[]>(fallbackUrl.toString());
    }

    if (!results?.length) return null;
    
    const candidate = results.find((item) => {
      if (item.instrumental) return false;
      
      const hasLyrics = Boolean(item.syncedLyrics || item.plainLyrics);
      if (!hasLyrics) return false;
      
      const artistMatched = allArtists.length === 0 || matchArtist(item.artistName, allArtists);
      if (!artistMatched) return false;

      const titleMatched = isTitleSimilar(cleanTitle, item.trackName);
      if (!titleMatched) return false;

      if (expectedDurationMs && item.duration) {
        const diffMs = Math.abs(item.duration * 1000 - expectedDurationMs);
        if (diffMs > 15000) return false;
      }

      const lyricsCandidate = item.plainLyrics ?? item.syncedLyrics;
      if (!lyricsCandidate || !isPortugueseLyrics(lyricsCandidate)) {
        return false;
      }

      return true;
    });
    
    if (!candidate) return null;
    
    return {
      lyrics: candidate.plainLyrics ?? candidate.syncedLyrics!,
      syncedLyrics: candidate.syncedLyrics,
      source: "lrclib",
    };
  }
  
  async #getFromLyricsOvh(
    cleanTitle: string,
    primaryArtist: string,
    allArtists: string[]
  ): Promise<LyricsResult | null> {
    if (primaryArtist) {
      const directUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist)}/${encodeURIComponent(cleanTitle)}`;
      const directResult = await this.#fetchJson<{ lyrics: string }>(directUrl);
      if (directResult?.lyrics?.trim() && isPortugueseLyrics(directResult.lyrics.trim())) {
        return {
          lyrics: directResult.lyrics.trim(),
          source: "lyrics.ovh",
        };
      }
    }

    const suggestUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(`${primaryArtist} ${cleanTitle}`.trim())}`;
    const suggestResult = await this.#fetchJson<{ data: Array<{ title: string, artist: { name: string } }> }>(suggestUrl);
    if (!suggestResult?.data?.length) return null;
    
    const bestMatch = suggestResult.data.find(item => {
      const artistMatched = allArtists.length === 0 || matchArtist(item.artist?.name, allArtists);
      const titleMatched = isTitleSimilar(cleanTitle, item.title);
      return artistMatched && titleMatched;
    });

    if (!bestMatch) return null;

    const artist = bestMatch.artist.name;
    const title = bestMatch.title;
    
    const apiUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const result = await this.#fetchJson<{ lyrics: string }>(apiUrl);
    if (!result?.lyrics?.trim()) return null;
    
    if (!isPortugueseLyrics(result.lyrics.trim())) return null;

    return {
      lyrics: result.lyrics.trim(),
      source: "lyrics.ovh",
    };
  }
  
  async #searchGenius(
    cleanTitle: string,
    primaryArtist: string,
    allArtists: string[]
  ): Promise<GeniusSearchResult | null> {
    if (!this.geniusAccessToken) {
      return null;
    }
    
    const searchTerm = `${primaryArtist} ${cleanTitle}`.trim();
    const url = new URL("https://api.genius.com/search");
    url.searchParams.set("q", searchTerm);
    
    const result = await this.#fetchJson<GeniusSearchResponse>(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${this.geniusAccessToken}`,
        },
      },
    );
    
    if (!result?.response?.hits) return null;

    const hit = result.response.hits.find((item) => {
      if (item.type !== "song") return false;
      const artistMatched = allArtists.length === 0 || matchArtist(item.result.primary_artist?.name, allArtists);
      const titleMatched = isTitleSimilar(cleanTitle, item.result.title);
      return artistMatched && titleMatched;
    });
    
    return hit?.result ?? null;
  }
  
  async #getLyricsFromGeniusPage(
    url: string,
  ): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
        },
      });
      
      if (!response.ok) return null;
      
      const html = await response.text();
      
      const matches = [
        ...html.matchAll(
          /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi,
        ),
      ];
      
      if (!matches.length) return null;
      
      const lyrics = matches
        .map((match) => {
          return match[1]
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
        })
        .filter(Boolean)
        .join("\n\n");
      
      return lyrics || null;
    } catch {
      return null;
    }
  }
  
  async #getFromGenius(
    cleanTitle: string,
    primaryArtist: string,
    allArtists: string[]
  ): Promise<LyricsResult | null> {
    const song = await this.#searchGenius(cleanTitle, primaryArtist, allArtists);
    if (!song) return null;
    
    const lyrics = await this.#getLyricsFromGeniusPage(song.url);
    if (!lyrics || !isPortugueseLyrics(lyrics)) return null;
    
    return {
      lyrics,
      source: "genius",
    };
  }
  
  public async getLyrics(
    songName: string,
    artists?: string,
    expectedDurationMs?: number | null
  ): Promise<LyricsResult | null> {
    const { primaryArtist, allArtists } = parseArtists(artists);
    const cleanTitle = sanitizeTitle(songName);

    const lrclib = await this.#getFromLrclib(cleanTitle, primaryArtist, allArtists, expectedDurationMs);
    if (lrclib) return lrclib;
    
    const lyricsOvh = await this.#getFromLyricsOvh(cleanTitle, primaryArtist, allArtists);
    if (lyricsOvh) return lyricsOvh;
    
    const genius = await this.#getFromGenius(cleanTitle, primaryArtist, allArtists);
    if (genius) return genius;
    
    return null;
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const songArg = process.argv[2];
  const artistArg = process.argv[3];

  if (!songArg) {
    console.log("Uso: npx tsx scripts/lyrics-service.ts \"<Nome da Musica>\" \"<Artista(s)>\"");
    process.exit(1);
  }

  const service = new LyricsService();
  service.getLyrics(songArg, artistArg).then((res) => {
    if (res) {
      console.log(`\nLetra encontrada via ${res.source}:\n`);
      console.log(res.lyrics);
    } else {
      console.log("\nNenhuma letra correspondente encontrada.");
    }
  }).catch(console.error);
}
