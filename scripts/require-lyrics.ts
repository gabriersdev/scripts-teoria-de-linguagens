// @ts-ignore
import 'dotenv/config';

export interface LyricsResult {
  lyrics: string;
  source: "lrclib" | "lyrics.ovh" | "genius";
  syncedLyrics?: string | null;
}

interface LrclibResult {
  trackName: string;
  artistName: string;
  albumName: string;
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
    songName: string,
  ): Promise<LyricsResult | null> {
    const url = new URL("https://lrclib.net/api/search");
    
    url.searchParams.set("q", songName);
    
    const results = await this.#fetchJson<LrclibResult[]>(url.toString());
    if (!results?.length) return null;
    
    const result = results.find((item) => {
      return !item.instrumental &&
        (item.syncedLyrics || item.plainLyrics);
    });
    
    if (!result) return null;
    
    return {
      lyrics: result.plainLyrics ?? result.syncedLyrics!,
      syncedLyrics: result.syncedLyrics,
      source: "lrclib",
    };
  }
  
  async #getFromLyricsOvh(
    songName: string,
  ): Promise<LyricsResult | null> {
    const suggestUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(songName)}`;
    
    const suggestResult = await this.#fetchJson<{ data: Array<{ title: string, artist: { name: string } }> }>(suggestUrl);
    if (!suggestResult?.data?.length) return null;
    
    const bestMatch = suggestResult.data[0];
    const artist = bestMatch.artist.name;
    const title = bestMatch.title;
    
    const apiUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    
    const result = await this.#fetchJson<{ lyrics: string }>(apiUrl);
    if (!result?.lyrics?.trim()) return null;
    
    return {
      lyrics: result.lyrics.trim(),
      source: "lyrics.ovh",
    };
  }
  
  async #searchGenius(
    songName: string,
  ): Promise<GeniusSearchResult | null> {
    if (!this.geniusAccessToken) {
      console.warn("O TOKEN de acesso à Genius não foi configurado. Continuando o processo.",);
      return null;
    }
    
    const url = new URL("https://api.genius.com/search");
    url.searchParams.set("q", songName);
    
    const result = await this.#fetchJson<GeniusSearchResponse>(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${this.geniusAccessToken}`,
        },
      },
    );
    
    const hit = result?.response?.hits.find((item) => {
      return item.type === "song";
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
    songName: string,
  ): Promise<LyricsResult | null> {
    const song = await this.#searchGenius(songName);
    if (!song) return null;
    
    const lyrics = await this.#getLyricsFromGeniusPage(song.url);
    if (!lyrics) return null;
    
    return {
      lyrics,
      source: "genius",
    };
  }
  
  public async getLyrics(
    songName: string,
  ): Promise<LyricsResult | null> {
    const lrclib = await this.#getFromLrclib(songName);
    if (lrclib) return lrclib;
    
    const lyricsOvh = await this.#getFromLyricsOvh(songName);
    if (lyricsOvh) return lyricsOvh;
    
    const genius = await this.#getFromGenius(songName);
    if (genius) return genius;
    
    return null;
  }
}
