import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeString,
  sanitizeTitle,
  parseArtists,
  isTitleSimilar,
  matchArtist
} from './text-sanitizer.js';

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

export interface TrackRecord {
  id: number | string;
  name: string;
  rawArtists: string;
  cleanTitle: string;
  primaryArtist: string;
  allArtists: string[];
  genre: string;
  file: string;
}

export interface DuplicateCluster {
  key: string;
  title: string;
  artist: string;
  genres: string[];
  tracks: TrackRecord[];
  isCrossGenre: boolean;
}

export interface IdCollision {
  id: string | number;
  tracks: TrackRecord[];
}

export interface FuzzyDuplicatePair {
  trackA: TrackRecord;
  trackB: TrackRecord;
}

export interface DuplicateReport {
  totalTracks: number;
  idCollisions: IdCollision[];
  sameGenreClusters: DuplicateCluster[];
  crossGenreClusters: DuplicateCluster[];
  fuzzyPairs: FuzzyDuplicatePair[];
}

export interface VerifierOptions {
  genreFilter?: string;
  sameGenreOnly?: boolean;
  crossGenreOnly?: boolean;
  includeFuzzy?: boolean;
}

export class DuplicateVerifier {
  private listDir: string;

  constructor() {
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    this.listDir = path.resolve(baseDir, '../lyrics-list');
  }

  public async loadAllTracks(): Promise<TrackRecord[]> {
    const files = (await fs.readdir(this.listDir))
      .filter(f => f.endsWith('.json'))
      .sort();

    const tracks: TrackRecord[] = [];

    for (const file of files) {
      const genre = file.replace('-list.json', '').replace('.json', '');
      const filePath = path.join(this.listDir, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(raw);

      for (const group of data) {
        if (!group.lyrics || !Array.isArray(group.lyrics)) continue;

        for (const item of group.lyrics) {
          if (!item.name) continue;

          const parsed = parseArtists(item.artists);
          tracks.push({
            id: item.id,
            name: item.name,
            rawArtists: item.artists || '',
            cleanTitle: normalizeString(sanitizeTitle(item.name)),
            primaryArtist: normalizeString(parsed.primaryArtist),
            allArtists: parsed.allArtists,
            genre,
            file
          });
        }
      }
    }

    return tracks;
  }

  public async run(options: VerifierOptions = {}): Promise<DuplicateReport> {
    let tracks = await this.loadAllTracks();

    if (options.genreFilter) {
      const filter = options.genreFilter.toLowerCase();
      tracks = tracks.filter(t => t.genre.toLowerCase().includes(filter));
    }

    // 1. Identificar Colisões de ID
    const idMap = new Map<string | number, TrackRecord[]>();
    for (const t of tracks) {
      if (!idMap.has(t.id)) {
        idMap.set(t.id, []);
      }
      idMap.get(t.id)!.push(t);
    }

    const idCollisions: IdCollision[] = [];
    for (const [id, grouped] of idMap.entries()) {
      if (grouped.length > 1) {
        idCollisions.push({ id, tracks: grouped });
      }
    }

    // 2. Agrupar por Título Limpo + Artista Primário
    const clusterMap = new Map<string, TrackRecord[]>();
    for (const t of tracks) {
      if (t.name.startsWith('Substituir faixa') || t.rawArtists === 'Adicionar artista') {
        continue;
      }
      const key = `${t.cleanTitle} ::: ${t.primaryArtist}`;
      if (!clusterMap.has(key)) {
        clusterMap.set(key, []);
      }
      clusterMap.get(key)!.push(t);
    }

    const sameGenreClusters: DuplicateCluster[] = [];
    const crossGenreClusters: DuplicateCluster[] = [];

    for (const [key, group] of clusterMap.entries()) {
      if (group.length > 1) {
        const genres = Array.from(new Set(group.map(t => t.genre)));
        const isCrossGenre = genres.length > 1;

        const cluster: DuplicateCluster = {
          key,
          title: group[0].name,
          artist: group[0].rawArtists || 'Sem Artista',
          genres,
          tracks: group,
          isCrossGenre
        };

        if (isCrossGenre) {
          if (!options.sameGenreOnly) {
            crossGenreClusters.push(cluster);
          }
        } else {
          if (!options.crossGenreOnly) {
            sameGenreClusters.push(cluster);
          }
        }
      }
    }

    // 3. Verificação Difusa (Fuzzy Matching) se solicitada
    const fuzzyPairs: FuzzyDuplicatePair[] = [];
    if (options.includeFuzzy) {
      for (let i = 0; i < tracks.length; i++) {
        for (let j = i + 1; j < tracks.length; j++) {
          const a = tracks[i];
          const b = tracks[j];
          if (a.id === b.id) continue;

          // Se já for match exato de chave, pula
          if (a.cleanTitle === b.cleanTitle && a.primaryArtist === b.primaryArtist) {
            continue;
          }

          const similarTitle = isTitleSimilar(a.name, b.name);
          const artistMatches = matchArtist(a.primaryArtist, b.allArtists) || matchArtist(b.primaryArtist, a.allArtists);

          if (similarTitle && artistMatches) {
            fuzzyPairs.push({ trackA: a, trackB: b });
          }
        }
      }
    }

    const report: DuplicateReport = {
      totalTracks: tracks.length,
      idCollisions,
      sameGenreClusters,
      crossGenreClusters,
      fuzzyPairs
    };

    this.printCleanReport(report, options);
    return report;
  }

  private printCleanReport(report: DuplicateReport, options: VerifierOptions): void {
    console.info();
    console.info(`Auditoria de Duplicatas do Corpus Musical (${report.totalTracks} faixas analisadas)`);
    console.info();

    console.info('Resumo Geral:');
    console.info(`  Total de Faixas Analisadas:           ${report.totalTracks}`);
    console.info(`  Colisoes de Identificador (ID):        ${report.idCollisions.length}`);
    console.info(`  Grupos Duplicados no Mesmo Genero:     ${report.sameGenreClusters.length}`);
    console.info(`  Grupos Duplicados em Generos Cruzados: ${report.crossGenreClusters.length}`);
    if (options.includeFuzzy) {
      console.info(`  Correspondencias Aproximadas (Fuzzy):  ${report.fuzzyPairs.length}`);
    }
    console.info();

    // Secao 1: Colisoes de ID
    if (report.idCollisions.length > 0) {
      console.warn(`Colisoes de ID Detectadas (${report.idCollisions.length} casos):`);
      for (const col of report.idCollisions) {
        console.warn(`  ID ${col.id}:`);
        for (const t of col.tracks) {
          console.warn(`    - [${t.genre}] "${t.name}" (${t.rawArtists}) em ${t.file}`);
        }
      }
      console.info();
    }

    // Secao 2: Duplicatas no Mesmo Genero
    if (!options.crossGenreOnly && report.sameGenreClusters.length > 0) {
      console.info(`Duplicatas no Mesmo Genero (${report.sameGenreClusters.length} grupos):`);
      for (const cl of report.sameGenreClusters) {
        const idList = cl.tracks.map(t => `${t.id}`).join(', ');
        console.info(`  [${cl.genres[0]}] "${cl.title}" - ${cl.artist}`);
        console.info(`    IDs: ${idList} (${cl.tracks.length} ocorrencias)`);
      }
      console.info();
    }

    // Secao 3: Duplicatas Cruzadas
    if (!options.sameGenreOnly && report.crossGenreClusters.length > 0) {
      console.info(`Duplicatas Cruzadas entre Generos (${report.crossGenreClusters.length} grupos):`);
      for (const cl of report.crossGenreClusters) {
        const occurrences = cl.tracks
          .map(t => `${t.id} [${t.genre}]`)
          .join(', ');
        console.info(`  "${cl.title}" - ${cl.artist}`);
        console.info(`    Ocorrencias: ${occurrences}`);
      }
      console.info();
    }

    // Secao 4: Fuzzy
    if (options.includeFuzzy && report.fuzzyPairs.length > 0) {
      console.info(`Correspondencias Aproximadas / Fuzzy (${report.fuzzyPairs.length} pares):`);
      for (const pair of report.fuzzyPairs) {
        console.info(`  "${pair.trackA.name}" [${pair.trackA.genre}, ID ${pair.trackA.id}]`);
        console.info(`  vs. "${pair.trackB.name}" [${pair.trackB.genre}, ID ${pair.trackB.id}] (${pair.trackA.rawArtists})`);
      }
      console.info();
    }
  }

  public async replaceDuplicates(options: VerifierOptions = {}): Promise<TrackRecord[]> {
    const report = await this.run({ ...options, includeFuzzy: false });
    const allClusters = [...report.sameGenreClusters, ...report.crossGenreClusters];

    const toReplaceMap = new Map<number | string, TrackRecord>();
    for (const cluster of allClusters) {
      for (let i = 1; i < cluster.tracks.length; i++) {
        const tr = cluster.tracks[i];
        toReplaceMap.set(tr.id, tr);
      }
    }

    if (toReplaceMap.size === 0) {
      console.info('Nenhuma duplicata encontrada para substituir.');
      return [];
    }

    const files = (await fs.readdir(this.listDir))
      .filter(f => f.endsWith('.json'))
      .sort();

    const replacedTracks: TrackRecord[] = [];

    for (const file of files) {
      const filePath = path.join(this.listDir, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(raw);
      let fileModified = false;

      for (const group of data) {
        if (!group.lyrics || !Array.isArray(group.lyrics)) continue;

        for (const item of group.lyrics) {
          if (toReplaceMap.has(item.id)) {
            const tr = toReplaceMap.get(item.id)!;
            item.name = `Substituir faixa #${item.id}`;
            item.artists = 'Adicionar artista';
            item.complete = false;
            fileModified = true;
            replacedTracks.push(tr);
          }
        }
      }

      if (fileModified) {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      }
    }

    // Criar backup e desvincular arquivos fisicos obsoletos em lyrics-data
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    const dataDir = path.resolve(baseDir, '../lyrics-data');
    const metadataDir = path.join(dataDir, 'metadata');
    const lyricsDir = path.join(dataDir, 'lyrics');
    const backupDir = path.join(dataDir, 'backup-duplicates');

    await fs.mkdir(path.join(backupDir, 'metadata'), { recursive: true });
    await fs.mkdir(path.join(backupDir, 'lyrics'), { recursive: true });

    let backedUpMetadata = 0;
    let backedUpLyrics = 0;

    for (const tr of replacedTracks) {
      const metaFile = path.join(metadataDir, `${tr.id}.json`);
      const lyricFile = path.join(lyricsDir, `${tr.id}.txt`);

      try {
        await fs.access(metaFile);
        await fs.rename(metaFile, path.join(backupDir, 'metadata', `${tr.id}.json`));
        backedUpMetadata++;
      } catch {
        // Arquivo nao existe
      }

      try {
        await fs.access(lyricFile);
        await fs.rename(lyricFile, path.join(backupDir, 'lyrics', `${tr.id}.txt`));
        backedUpLyrics++;
      } catch {
        // Arquivo nao existe
      }
    }

    console.info('Substituicao de duplicatas concluida com sucesso:');
    console.info(`  Total de faixas duplicadas substituidas: ${replacedTracks.length}`);
    console.info(`  Arquivos de metadados movidos para backup: ${backedUpMetadata}`);
    console.info(`  Arquivos de letra movidos para backup:     ${backedUpLyrics}`);
    console.info(`  Destino do backup:                        ${backupDir}`);
    console.info();

    return replacedTracks;
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const args = process.argv.slice(2);
  const sameGenreOnly = args.includes('--same-genre');
  const crossGenreOnly = args.includes('--cross-genre');
  const includeFuzzy = args.includes('--fuzzy');
  const doReplace = args.includes('--replace') || args.includes('--substitute');
  const genreArg = args.find(a => !a.startsWith('--'));

  const verifier = new DuplicateVerifier();
  if (doReplace) {
    verifier.replaceDuplicates({
      genreFilter: genreArg,
      sameGenreOnly,
      crossGenreOnly
    }).catch(console.error);
  } else {
    verifier.run({
      genreFilter: genreArg,
      sameGenreOnly,
      crossGenreOnly,
      includeFuzzy
    }).catch(console.error);
  }
}

