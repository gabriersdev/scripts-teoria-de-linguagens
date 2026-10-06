// @ts-ignore
import 'dotenv/config';

interface LyricsResult {
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

const geniusAccessToken = process.env.GENIUS_ACCESS_TOKEN;
const userAgent = "LyricsFetcher/1.0";

async function fetchJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": userAgent,
        ...options?.headers,
      },
    });
    
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function getFromLrclib(
  songName: string,
): Promise<LyricsResult | null> {
  const url = new URL("https://lrclib.net/api/search");
  
  url.searchParams.set("q", songName);
  
  const results = await fetchJson<LrclibResult[]>(url.toString());
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

async function getFromLyricsOvh(
  songName: string,
): Promise<LyricsResult | null> {
  const suggestUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(songName)}`;
  
  const suggestResult = await fetchJson<{ data: Array<{ title: string, artist: { name: string } }> }>(suggestUrl);
  if (!suggestResult?.data?.length) return null;
  
  const bestMatch = suggestResult.data[0];
  const artist = bestMatch.artist.name;
  const title = bestMatch.title;
  
  const apiUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  
  const result = await fetchJson<{ lyrics: string }>(apiUrl);
  if (!result?.lyrics?.trim()) return null;
  
  return {
    lyrics: result.lyrics.trim(),
    source: "lyrics.ovh",
  };
}

async function searchGenius(
  songName: string,
): Promise<GeniusSearchResult | null> {
  if (!geniusAccessToken) {
    console.warn("O TOKEN de acesso à Genius não foi configurado. Continuando o processo.",);
    return null;
  }
  
  const url = new URL("https://api.genius.com/search");
  url.searchParams.set("q", songName);
  
  const result = await fetchJson<GeniusSearchResponse>(
    url.toString(),
    {
      headers: {
        Authorization: `Bearer ${geniusAccessToken}`,
      },
    },
  );
  
  const hit = result?.response?.hits.find((item) => {
    return item.type === "song";
  });
  
  return hit?.result ?? null;
}

async function getLyricsFromGeniusPage(
  url: string,
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
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

async function getFromGenius(
  songName: string,
): Promise<LyricsResult | null> {
  const song = await searchGenius(songName);
  if (!song) return null;
  
  const lyrics = await getLyricsFromGeniusPage(song.url);
  if (!lyrics) return null;
  
  return {
    lyrics,
    source: "genius",
  };
}

async function saveLyricInFile() {
  //
}

export async function getLyrics(
  songName: string,
): Promise<LyricsResult | null> {
  console.log(`Procurando: por ${songName}`);
  
  console.log("Consultando o LRCLIB...");
  const lrclib = await getFromLrclib(songName);
  
  if (lrclib) {
    console.log("Encontrado no LRCLIB!");
    return lrclib;
  }
  
  console.log("Consultando o Lyrics.ovh...");
  const lyricsOvh = await getFromLyricsOvh(songName);
  
  if (lyricsOvh) {
    console.log("Encontrado no Lyrics.ovh!");
    return lyricsOvh;
  }
  
  console.log("Consultando o Genius...");
  const genius = await getFromGenius(songName);
  
  if (genius) {
    console.log("Encontrado no Genius!");
    return genius;
  }
  
  console.log("Letra não encontrada");
  return null;
}

const songName = process.argv.slice(2).join(" ");

if (!songName) {
  console.error("Uso: npx tsx lyrics.ts \"Artista - Música\"",);
  process.exit(1);
}

const result = await getLyrics(songName);
if (!result) process.exit(1);

console.log()
console.log("Fonte:", result?.source);
console.log()
console.log(result?.lyrics);
