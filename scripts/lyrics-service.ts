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
        signal: options?.signal ?? AbortSignal.timeout(8000),
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
    const findCandidate = (results: LrclibResult[]): { candidate: LrclibResult; cleanLyrics: string } | null => {
      for (const item of results) {
        if (item.instrumental) continue;
        
        const hasLyrics = Boolean(item.syncedLyrics || item.plainLyrics);
        if (!hasLyrics) continue;
        
        const artistMatched = allArtists.length === 0 || matchArtist(item.artistName, allArtists);
        if (!artistMatched) continue;
        
        const titleMatched = isTitleSimilar(cleanTitle, item.trackName);
        if (!titleMatched) continue;
        
        if (expectedDurationMs && item.duration) {
          const diffMs = Math.abs(item.duration * 1000 - expectedDurationMs);
          if (diffMs > 15000) continue;
        }
        
        const rawText = item.plainLyrics ?? item.syncedLyrics!.replace(/^\[\d{2}:\d{2}(?:\.\d{2,3})?\]\s*/gm, "");
        const cleanLyrics = rawText.trim();
        if (!cleanLyrics || !isPortugueseLyrics(cleanLyrics)) {
          continue;
        }
        
        return { candidate: item, cleanLyrics };
      }
      return null;
    };

    const url = new URL("https://lrclib.net/api/search");
    if (primaryArtist) {
      url.searchParams.set("track_name", cleanTitle);
      url.searchParams.set("artist_name", primaryArtist);
    } else {
      url.searchParams.set("q", cleanTitle);
    }
    
    let results = await this.#fetchJson<LrclibResult[]>(url.toString());
    let match = results?.length ? findCandidate(results) : null;
    
    if (!match && primaryArtist) {
      const fallbackUrl = new URL("https://lrclib.net/api/search");
      fallbackUrl.searchParams.set("q", `${primaryArtist} ${cleanTitle}`.trim());
      const fallbackResults = await this.#fetchJson<LrclibResult[]>(fallbackUrl.toString());
      if (fallbackResults?.length) {
        match = findCandidate(fallbackResults);
      }
    }
    
    if (!match) return null;
    
    return {
      lyrics: match.cleanLyrics,
      syncedLyrics: match.candidate.syncedLyrics,
      source: "lrclib",
    };
  }
  
  async #searchGenius(
    cleanTitle: string,
    primaryArtist: string,
    allArtists: string[]
  ): Promise<GeniusSearchResult | null> {
    const findSongHit = (hits: Array<{ type: string; result: GeniusSearchResult }>) => {
      return hits.find((item) => {
        if (item.type !== "song") return false;
        const artistMatched = allArtists.length === 0 || matchArtist(item.result.primary_artist?.name, allArtists);
        const titleMatched = isTitleSimilar(cleanTitle, item.result.title);
        return artistMatched && titleMatched;
      })?.result ?? null;
    };

    let matchedSong: GeniusSearchResult | null = null;

    if (this.geniusAccessToken) {
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
      
      matchedSong = result?.response?.hits ? findSongHit(result.response.hits) : null;
      
      if (!matchedSong && primaryArtist) {
        const fallbackUrl = new URL("https://api.genius.com/search");
        fallbackUrl.searchParams.set("q", cleanTitle);
        const fallbackResult = await this.#fetchJson<GeniusSearchResponse>(
          fallbackUrl.toString(),
          {
            headers: {
              Authorization: `Bearer ${this.geniusAccessToken}`,
            },
          },
        );
        if (fallbackResult?.response?.hits) {
          matchedSong = findSongHit(fallbackResult.response.hits);
        }
      }
    }

    // Fallback: endpoint publico do Genius (sem necessidade de token / contorna rate limit 429)
    if (!matchedSong) {
      const publicSearchTerms = [`${primaryArtist} ${cleanTitle}`.trim(), cleanTitle];
      for (const query of publicSearchTerms) {
        if (!query) continue;
        const publicUrl = `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`;
        const publicRes = await this.#fetchJson<{
          response?: {
            sections?: Array<{
              type: string;
              hits?: Array<{
                type: string;
                result: GeniusSearchResult;
              }>;
            }>;
          };
        }>(publicUrl);

        for (const section of publicRes?.response?.sections || []) {
          if (section.type === "song" || section.type === "top_hit") {
            matchedSong = findSongHit(section.hits || []);
            if (matchedSong) break;
          }
        }
        if (matchedSong) break;
      }
    }

    return matchedSong;
  }
  
  async #getLyricsFromGeniusPage(
    url: string,
  ): Promise<string | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": this.userAgent,
        },
      });
      
      if (!response.ok) return null;
      
      const html = await response.text();
      const marker = 'data-lyrics-container="true"';
      const containers: string[] = [];
      let searchPos = 0;
      
      while (true) {
        const markerIdx = html.indexOf(marker, searchPos);
        if (markerIdx === -1) break;
        
        const openTagStart = html.lastIndexOf('<div', markerIdx);
        if (openTagStart === -1) break;
        
        const openTagEnd = html.indexOf('>', markerIdx);
        if (openTagEnd === -1) break;
        
        let depth = 1;
        let currentPos = openTagEnd + 1;
        let containerEnd = -1;
        
        while (currentPos < html.length && depth > 0) {
          const nextOpen = html.indexOf('<div', currentPos);
          const nextClose = html.indexOf('</div>', currentPos);
          
          if (nextClose === -1) break;
          
          if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            currentPos = nextOpen + 4;
          } else {
            depth--;
            if (depth === 0) {
              containerEnd = nextClose;
              break;
            }
            currentPos = nextClose + 6;
          }
        }
        
        if (containerEnd !== -1) {
          containers.push(html.slice(openTagEnd + 1, containerEnd));
          searchPos = containerEnd + 6;
        } else {
          searchPos = openTagEnd + 1;
        }
      }
      
      if (containers.length === 0) return null;
      
      const cleanedContainers = containers
        .map((containerHtml) => {
          let cleaned = containerHtml.replace(/<br\s*\/?>/gi, "\n");
          cleaned = cleaned.replace(/<[^>]+>/g, "");
          
          cleaned = cleaned
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, "/")
            .replace(/&nbsp;/g, " ")
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
            .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          
          return cleaned.trim();
        })
        .filter(Boolean);
      
      let finalLyrics = cleanedContainers.join("\n\n").trim();
      finalLyrics = finalLyrics.replace(/^[\s\S]*?\bLyrics\s*(\[Letra|\n|\[Intro|\[Verso|\[Refrão|\[Ponte)/i, "$1");
      finalLyrics = finalLyrics.replace(/^\d+\s+Contributors\s*/i, "");
      finalLyrics = finalLyrics
        .replace(/[\u2000-\u200B\u202F\u205F\u00A0]/g, " ")
        .replace(/\r\n/g, "\n");
      
      return finalLyrics.trim() || null;
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
  
  public async getLyrics(
    songName: string,
    artists?: string,
    expectedDurationMs?: number | null
  ): Promise<LyricsResult | null> {
    const {primaryArtist, allArtists} = parseArtists(artists);
    const cleanTitle = sanitizeTitle(songName);
    
    const lrclib = await this.#getFromLrclib(cleanTitle, primaryArtist, allArtists, expectedDurationMs);
    if (lrclib) return lrclib;
    
    const genius = await this.#getFromGenius(cleanTitle, primaryArtist, allArtists);
    if (genius) return genius;
    
    const lyricsOvh = await this.#getFromLyricsOvh(cleanTitle, primaryArtist, allArtists);
    if (lyricsOvh) return lyricsOvh;
    
    return null;
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  
  if (arg1 === '--sample' || arg1 === '-s') {
    console.log("Para inspecionar por amostragem aleatoria, utilize o script dedicado:");
    console.log(`  npx tsx scripts/sample-lyrics-verifier.ts ${arg2 || "5"}`);
    process.exit(0);
  }
  
  if (!arg1) {
    console.log("Uso:");
    console.log("  Consulta individual:   npx tsx scripts/lyrics-service.ts \"<Nome da Musica>\" \"<Artista(s)>\"");
    console.log("  Inspecao por amostra:  npx tsx scripts/sample-lyrics-verifier.ts [quantidade] [genero]");
    process.exit(1);
  }
  
  const service = new LyricsService();
  service.getLyrics(arg1, arg2).then((res) => {
    if (res) {
      console.log(`\nLetra encontrada via ${res.source}:\n`);
      console.log(res.lyrics);
    } else {
      console.log("\nNenhuma letra correspondente encontrada.");
    }
  }).catch(console.error);
}

