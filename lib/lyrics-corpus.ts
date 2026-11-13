/**
 * Shared corpus repository for reading track catalog metadata (/lyrics-list)
 * and plain-text song lyrics (/lyrics-data/lyrics).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';

export interface LyricItem {
  id: number | string;
  name: string;
  artists?: string;
  complete?: boolean | number;
}

export interface LyricsListFile {
  complete: boolean;
  id: string;
  source: string[];
  lyrics: LyricItem[];
}

export interface TrackInfo {
  id: number | string;
  name: string;
  artists: string;
  genre: string;
}

export interface CorpusLyricEntry {
  fileName: string;
  track: TrackInfo;
  content: string;
}

export interface LoadCorpusOptions {
  genreFilter?: string;
}

export interface LyricsCorpusConfig {
  listDir?: string;
  lyricsDir?: string;
}

export class LyricsCorpus {
  private readonly listDir: string;
  private readonly lyricsDir: string;

  constructor(config: LyricsCorpusConfig = {}) {
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    this.listDir = config.listDir ?? path.resolve(baseDir, '../lyrics-list');
    this.lyricsDir = config.lyricsDir ?? path.resolve(baseDir, '../lyrics-data/lyrics');
  }

  public async loadTrackIndex(): Promise<Map<string, TrackInfo>> {
    const files = (await fs.readdir(this.listDir))
      .filter((file) => file.endsWith('.json'))
      .sort();

    const trackMap = new Map<string, TrackInfo>();

    for (const file of files) {
      const genre = file.replace('-list.json', '').replace('.json', '');
      const filePath = path.join(this.listDir, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(raw);

      for (const group of data) {
        if (!group.lyrics || !Array.isArray(group.lyrics)) {
          continue;
        }

        for (const item of group.lyrics) {
          if (item.id === undefined || item.id === null) {
            continue;
          }

          trackMap.set(String(item.id), {
            id: item.id,
            name: item.name || `Faixa #${item.id}`,
            artists: item.artists || 'Sem Artista',
            genre
          });
        }
      }
    }

    return trackMap;
  }

  public async getAvailableGenres(existingTrackIndex?: Map<string, TrackInfo>): Promise<string[]> {
    const trackIndex = existingTrackIndex ?? (await this.loadTrackIndex());
    return Array.from(new Set(Array.from(trackIndex.values()).map((track) => track.genre))).sort();
  }

  public async *iterateLyrics(options: LoadCorpusOptions = {}): AsyncGenerator<CorpusLyricEntry> {
    const trackIndex = await this.loadTrackIndex();

    let lyricFiles: string[] = [];
    try {
      lyricFiles = (await fs.readdir(this.lyricsDir))
        .filter((file) => file.endsWith('.txt'))
        .sort();
    } catch {
      throw new Error(`Diretorio de letras nao encontrado em: ${this.lyricsDir}`);
    }

    const knownGenres = new Set(Array.from(trackIndex.values()).map((track) => track.genre.toLowerCase()));
    const normalizedFilter = options.genreFilter?.trim().toLowerCase();
    const isExactGenre = normalizedFilter ? knownGenres.has(normalizedFilter) : false;

    for (const file of lyricFiles) {
      const id = file.replace('.txt', '');
      const track = trackIndex.get(id) ?? {
        id,
        name: `Faixa #${id}`,
        artists: 'Desconhecido',
        genre: 'desconhecido'
      };

      if (normalizedFilter) {
        const trackGenre = track.genre.toLowerCase();
        const matches = isExactGenre
          ? trackGenre === normalizedFilter
          : trackGenre.includes(normalizedFilter);

        if (!matches) {
          continue;
        }
      }

      const filePath = path.join(this.lyricsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');

      yield {
        fileName: file,
        track,
        content
      };
    }
  }

  public async loadLyrics(options: LoadCorpusOptions = {}): Promise<CorpusLyricEntry[]> {
    const entries: CorpusLyricEntry[] = [];

    for await (const entry of this.iterateLyrics(options)) {
      entries.push(entry);
    }

    return entries;
  }
}

