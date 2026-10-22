import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {LyricsService} from './lyrics-service.js';

interface LyricItem {
  id: number | string;
  name: string;
  artists?: string;
  complete?: boolean | number;
}

interface LyricsListFile {
  complete: boolean;
  id: string;
  source: string[];
  lyrics: LyricItem[];
}

interface TrackSample {
  id: number | string;
  name: string;
  artists: string;
  genre: string;
}

export class SampleLyricsVerifier {
  private lyricsService = new LyricsService();

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  public async run(sampleSize = 5, genreFilter?: string): Promise<void> {
    const listDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lyrics-list');
    const files = await fs.readdir(listDir);
    let jsonFiles = files.filter(f => f.endsWith('.json'));

    if (genreFilter) {
      const normalizedGenre = genreFilter.toLowerCase();
      jsonFiles = jsonFiles.filter(f => f.toLowerCase().includes(normalizedGenre));
      if (jsonFiles.length === 0) {
        console.error(`Nenhuma lista encontrada para o genero/filtro: "${genreFilter}".`);
        return;
      }
    }

    const allTracks: TrackSample[] = [];

    for (const file of jsonFiles) {
      const genre = file.replace('-list.json', '').replace('.json', '');
      const filePath = path.join(listDir, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(raw);

      for (const group of data) {
        if (!group.lyrics || !Array.isArray(group.lyrics)) continue;
        for (const item of group.lyrics) {
          if (item.name) {
            allTracks.push({
              id: item.id,
              name: item.name,
              artists: item.artists || '',
              genre: genre
            });
          }
        }
      }
    }

    if (allTracks.length === 0) {
      console.warn("Nenhuma faixa disponivel para teste nas listas selecionadas.");
      return;
    }

    const targetSize = Math.min(sampleSize, allTracks.length);
    const selectedTracks = this.shuffle(allTracks).slice(0, targetSize);

    console.info(`Inspecao por amostragem iniciada (${targetSize} faixas de ${allTracks.length} disponiveis${genreFilter ? `, genero: ${genreFilter}` : ''}).`);

    let successCount = 0;
    const providerStats: Record<string, number> = {
      lrclib: 0,
      genius: 0,
      "lyrics.ovh": 0
    };

    for (let i = 0; i < selectedTracks.length; i++) {
      const track = selectedTracks[i];
      const indexStr = `[${i + 1}/${targetSize}]`;
      console.info();
      console.info(`${indexStr} Teste (${track.genre}): ${track.name} - ${track.artists || "Sem Artista"}`);

      const result = await this.lyricsService.getLyrics(track.name, track.artists);

      if (result && result.lyrics) {
        successCount++;
        providerStats[result.source] = (providerStats[result.source] || 0) + 1;
        console.info(`Letra encontrada (${result.source}).`);
      } else {
        console.warn(`Letra nao encontrada.`);
      }

      if (i < selectedTracks.length - 1) {
        await this.delay(1500);
      }
    }

    const successRate = ((successCount / targetSize) * 100).toFixed(1);

    console.info();
    console.info(`Amostragem finalizada. Sucesso: ${successCount}/${targetSize} (${successRate}%).`);
    console.info(`Provedores: LRCLIB (${providerStats.lrclib}), Genius (${providerStats.genius}), lyrics.ovh (${providerStats["lyrics.ovh"]}).`);
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  let sampleSize = 5;
  let genreFilter: string | undefined = undefined;

  if (arg1) {
    const parsedNumber = parseInt(arg1, 10);
    if (!isNaN(parsedNumber)) {
      sampleSize = parsedNumber;
      genreFilter = arg2;
    } else {
      genreFilter = arg1;
      if (arg2) sampleSize = parseInt(arg2, 10) || 5;
    }
  }

  const verifier = new SampleLyricsVerifier();
  verifier.run(sampleSize, genreFilter).catch(console.error);
}
