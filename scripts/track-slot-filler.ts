/**
 * O TrackSlotFiller gerencia o preenchimento e substituicao de vagas
 * nos arquivos de listas musicais (/lyrics-list).
 *
 * O fluxo permite substituir tanto vagas reservadas ("Substituir faixa #{ID}")
 * quanto faixas incompletas (complete: false) ou parciais (complete: 1 - sem letra),
 * consumindo diretamente as faixas de uma URL de album ou playlist do Spotify.
 *
 * Para cada slot processado, o serviço:
 * 1. Aplica trava anti-duplicata contra o corpus completo.
 * 2. Consulta previa em tempo real de metadados tecnicos (MusicBrainz, iTunes, Deezer) em memoria.
 * 3. Consulta previa em tempo real de letras musicais (LRCLIB, Genius, lyrics.ovh) em memoria.
 * 4. Ao confirmar a substituicao, limpa eventuais arquivos fisicos obsoletos, grava imediatamente
 *    os novos arquivos de metadados (/lyrics-data/metadata/{id}.json) e letra (/lyrics-data/lyrics/{id}.txt),
 *    atualiza a lista JSON com a flag de completude calculada (true, 1 ou false) e registra
 *    a URL no atributo `source` da lista.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { TrackMetadataService, TrackMetadata } from './track-metadata-service.js';
import { LyricsService, LyricsResult } from './lyrics-service.js';
import { SpotifyApiClient, SpotifyTrack } from '../lib/spotify-api-client.js';
import {
  normalizeString,
  sanitizeTitle,
  parseArtists,
  matchArtist,
  isTitleSimilar
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

export type SlotType = 'placeholder' | 'incomplete' | 'partial';

export interface PendingSlot {
  id: number | string;
  genre: string;
  file: string;
  originalName: string;
  originalArtists: string;
  slotType: SlotType;
}

interface ExistingTrack {
  id: number | string;
  name: string;
  cleanTitle: string;
  artists: string;
  primaryArtist: string;
  allArtists: string[];
  genre: string;
}

export interface FillerRunOptions {
  genre?: string;
  url?: string;
  scope?: 'all' | 'placeholders' | 'partial' | 'incomplete';
}

export class TrackSlotFiller {
  private listDir: string;
  private dataDir: string;
  private metadataDir: string;
  private lyricsDir: string;
  private metadataService: TrackMetadataService;
  private lyricsService: LyricsService;
  private spotifyClient: SpotifyApiClient;
  private rl: readline.Interface;
  private isClosed = false;

  constructor() {
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    this.listDir = path.resolve(baseDir, '../lyrics-list');
    this.dataDir = path.resolve(baseDir, '../lyrics-data');
    this.metadataDir = path.join(this.dataDir, 'metadata');
    this.lyricsDir = path.join(this.dataDir, 'lyrics');

    this.metadataService = new TrackMetadataService();
    this.lyricsService = new LyricsService();
    this.spotifyClient = new SpotifyApiClient();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  private question(query: string): Promise<string> {
    if (this.isClosed) return Promise.resolve('');
    return new Promise(resolve => {
      this.rl.question(query, answer => {
        resolve(answer);
      });
    });
  }

  public close(): void {
    if (!this.isClosed) {
      this.isClosed = true;
      this.rl.close();
    }
  }

  private isPlaceholder(name?: string, artists?: string): boolean {
    if (!name) return false;
    const nameMatch = name.startsWith('Substituir faixa');
    const artistMatch = artists === 'Adicionar artista';
    return nameMatch || artistMatch;
  }

  public async loadCorpusData(scope: 'all' | 'placeholders' | 'partial' | 'incomplete' = 'all'): Promise<{
    slots: PendingSlot[];
    existingTracks: ExistingTrack[];
  }> {
    const files = (await fs.readdir(this.listDir))
      .filter(f => f.endsWith('.json'))
      .sort();

    const slots: PendingSlot[] = [];
    const existingTracks: ExistingTrack[] = [];

    for (const file of files) {
      const genre = file.replace('-list.json', '').replace('.json', '');
      const filePath = path.join(this.listDir, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(raw);

      for (const group of data) {
        if (!group.lyrics || !Array.isArray(group.lyrics)) continue;

        for (const item of group.lyrics) {
          const isPlace = this.isPlaceholder(item.name, item.artists);
          const isCompleteFalse = item.complete === false;
          const isComplete1 = item.complete === 1;

          let slotType: SlotType | null = null;
          if (isPlace) slotType = 'placeholder';
          else if (isComplete1) slotType = 'partial';
          else if (isCompleteFalse) slotType = 'incomplete';

          if (slotType) {
            const matchesScope =
              scope === 'all' ||
              (scope === 'placeholders' && slotType === 'placeholder') ||
              (scope === 'partial' && slotType === 'partial') ||
              (scope === 'incomplete' && slotType === 'incomplete');

            if (matchesScope) {
              slots.push({
                id: item.id,
                genre,
                file,
                originalName: item.name || '',
                originalArtists: item.artists || '',
                slotType
              });
            }
          }

          if (item.name && !isPlace) {
            const parsed = parseArtists(item.artists);
            existingTracks.push({
              id: item.id,
              name: item.name,
              cleanTitle: normalizeString(sanitizeTitle(item.name)),
              artists: item.artists || '',
              primaryArtist: normalizeString(parsed.primaryArtist),
              allArtists: parsed.allArtists,
              genre
            });
          }
        }
      }
    }

    return { slots, existingTracks };
  }

  public findCorpusDuplicates(title: string, artists: string, existingTracks: ExistingTrack[]): ExistingTrack[] {
    const cleanInputTitle = normalizeString(sanitizeTitle(title));
    const parsedInput = parseArtists(artists);
    const primaryInput = normalizeString(parsedInput.primaryArtist);

    return existingTracks.filter(t => {
      const exactTitle = t.cleanTitle === cleanInputTitle;
      const similarTitle = isTitleSimilar(title, t.name);
      const artistMatch = matchArtist(primaryInput, t.allArtists) || matchArtist(t.primaryArtist, parsedInput.allArtists);

      return (exactTitle || similarTitle) && artistMatch;
    });
  }

  public async fetchSpotifyTracks(url: string): Promise<SpotifyTrack[]> {
    const isAlbum = url.includes('/album/');
    const isPlaylist = url.includes('/playlist/');

    if (isAlbum) {
      const id = this.spotifyClient.extractSpotifyId(url, 'album');
      if (!id) return [];
      return this.spotifyClient.fetchAlbumTracks(id);
    }

    if (isPlaylist) {
      const id = this.spotifyClient.extractSpotifyId(url, 'playlist');
      if (!id) return [];
      return this.spotifyClient.fetchPlaylistTracks(id);
    }

    return [];
  }

  public async deletePhysicalFiles(slotId: number | string): Promise<{ deletedMeta: boolean; deletedLyrics: boolean }> {
    const metaFile = path.join(this.metadataDir, `${slotId}.json`);
    const lyricFile = path.join(this.lyricsDir, `${slotId}.txt`);
    let deletedMeta = false;
    let deletedLyrics = false;

    try {
      await fs.unlink(metaFile);
      deletedMeta = true;
    } catch {
      // Arquivo nao existia
    }

    try {
      await fs.unlink(lyricFile);
      deletedLyrics = true;
    } catch {
      // Arquivo nao existia
    }

    return { deletedMeta, deletedLyrics };
  }

  public async writePhysicalFiles(
    slotId: number | string,
    metadata: TrackMetadata | null,
    lyricsResult: LyricsResult | null
  ): Promise<{ wroteMeta: boolean; wroteLyrics: boolean }> {
    await fs.mkdir(this.metadataDir, { recursive: true });
    await fs.mkdir(this.lyricsDir, { recursive: true });

    let wroteMeta = false;
    let wroteLyrics = false;
    const trackId = slotId.toString();

    if (metadata && (metadata.isrc || metadata.durationMs || metadata.album)) {
      const jsonOutput = [
        {
          id: slotId,
          metadata: metadata,
          lyricPath: `/lyrics/${trackId}.txt`
        }
      ];
      await fs.writeFile(
        path.join(this.metadataDir, `${trackId}.json`),
        JSON.stringify(jsonOutput, null, 2),
        'utf-8'
      );
      wroteMeta = true;
    }

    if (lyricsResult && lyricsResult.lyrics) {
      await fs.writeFile(
        path.join(this.lyricsDir, `${trackId}.txt`),
        lyricsResult.lyrics,
        'utf-8'
      );
      wroteLyrics = true;
    }

    return { wroteMeta, wroteLyrics };
  }

  public async saveSlot(
    file: string,
    slotId: number | string,
    newTitle: string,
    newArtists: string,
    complete: boolean | number,
    sourceUrl?: string
  ): Promise<boolean> {
    const filePath = path.join(this.listDir, file);
    const raw = await fs.readFile(filePath, 'utf-8');
    const data: LyricsListFile[] = JSON.parse(raw);
    let updated = false;

    for (const group of data) {
      if (!group.lyrics || !Array.isArray(group.lyrics)) continue;

      for (const item of group.lyrics) {
        if (item.id === slotId) {
          item.name = newTitle.trim();
          item.artists = newArtists.trim();
          item.complete = complete;
          updated = true;
          break;
        }
      }

      if (updated) {
        if (sourceUrl && Array.isArray(group.source) && !group.source.includes(sourceUrl)) {
          group.source.push(sourceUrl);
        }
        break;
      }
    }

    if (updated) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    }

    return updated;
  }

  public async run(options: FillerRunOptions = {}): Promise<void> {
    const scope = options.scope || 'all';
    const { slots, existingTracks } = await this.loadCorpusData(scope);

    if (slots.length === 0) {
      console.info('Nenhuma vaga elegivel encontrada no corpus.');
      this.close();
      return;
    }

    const genreSlotMap = new Map<string, PendingSlot[]>();
    for (const slot of slots) {
      if (!genreSlotMap.has(slot.genre)) {
        genreSlotMap.set(slot.genre, []);
      }
      genreSlotMap.get(slot.genre)!.push(slot);
    }

    let selectedSlots: PendingSlot[] = [];

    if (options.genre) {
      const filterLower = options.genre.toLowerCase().trim();
      const matchedGenre = Array.from(genreSlotMap.keys()).find(
        g => g.toLowerCase() === filterLower || g.toLowerCase().includes(filterLower)
      );

      if (matchedGenre && genreSlotMap.has(matchedGenre)) {
        selectedSlots = genreSlotMap.get(matchedGenre)!;
      } else {
        console.warn(`Genero nao encontrado: "${options.genre}".`);
        for (const [g, list] of genreSlotMap.entries()) {
          console.info(`  ${g}: ${list.length} vagas`);
        }
        this.close();
        return;
      }
    } else {
      const availableGenres = Array.from(genreSlotMap.entries());
      console.info('Vagas elegiveis por genero:');
      availableGenres.forEach(([g, list], idx) => {
        console.info(`  ${idx + 1}. ${g} (${list.length})`);
      });
      console.info(`  0. Todos (${slots.length})`);

      const choiceRaw = await this.question('Opcao (:q sair): ');
      const choice = choiceRaw.trim();

      if (choice === ':q') {
        this.close();
        return;
      }

      const choiceNum = parseInt(choice, 10);
      if (isNaN(choiceNum) || choiceNum < 0 || choiceNum > availableGenres.length) {
        console.warn('Opcao invalida.');
        this.close();
        return;
      }

      if (choiceNum === 0) {
        selectedSlots = slots;
      } else {
        const [, genreSlots] = availableGenres[choiceNum - 1];
        selectedSlots = genreSlots;
      }
    }

    let currentUrl = options.url?.trim() || '';
    let spotifyQueue: SpotifyTrack[] = [];

    const loadUrlTracks = async (url: string): Promise<boolean> => {
      const tracks = await this.fetchSpotifyTracks(url);
      if (tracks.length === 0) {
        console.warn('Nenhuma faixa localizada para a URL informada (verifique se e um album ou playlist valida).');
        return false;
      }
      spotifyQueue = tracks;
      currentUrl = url;
      console.info(`${tracks.length} faixas carregadas do Spotify.`);
      return true;
    };

    if (currentUrl) {
      const ok = await loadUrlTracks(currentUrl);
      if (!ok) currentUrl = '';
    }

    let processedCount = 0;
    let filledCount = 0;

    for (const slot of selectedSlots) {
      processedCount++;
      let slotResolved = false;

      while (!slotResolved) {
        while (spotifyQueue.length === 0) {
          const inputUrl = await this.question(
            `URL Spotify para vaga #${slot.id} (${slot.genre}) [:q sair, Enter pular]: `
          );
          const trimmedUrl = inputUrl.trim();

          if (trimmedUrl === ':q') {
            console.info(`Encerrado. Vagas substituidas: ${filledCount}.`);
            this.close();
            return;
          }

          if (trimmedUrl === '') {
            slotResolved = true;
            break;
          }

          const loaded = await loadUrlTracks(trimmedUrl);
          if (!loaded) continue;
        }

        if (slotResolved) break;

        const candidate = spotifyQueue.shift()!;
        const artistsStr = candidate.artists.join(', ');

        // 1. Verificacao de Duplicata no Corpus (ignora o proprio slot se for o mesmo ID)
        const duplicates = this.findCorpusDuplicates(candidate.title, artistsStr, existingTracks).filter(
          d => d.id !== slot.id
        );
        if (duplicates.length > 0) {
          const dup = duplicates[0];
          console.warn(`Duplicata no corpus ignorada: "${candidate.title}" (${artistsStr}) -> ID ${dup.id} [${dup.genre}].`);
          continue;
        }

        // 2. Consulta de Metadados em Memoria
        let metadata: TrackMetadata | null = null;
        try {
          metadata = await this.metadataService.fetchMetadata(candidate.title, artistsStr);
        } catch {
          metadata = null;
        }

        // 3. Consulta de Letra em Memoria
        let lyricsResult: LyricsResult | null = null;
        try {
          lyricsResult = await this.lyricsService.getLyrics(candidate.title, artistsStr, metadata?.durationMs);
        } catch {
          lyricsResult = null;
        }

        const metaSummary = metadata
          ? `Sim (${[metadata.album ? `Album: ${metadata.album}` : null, metadata.releaseDate ? `${metadata.releaseDate}` : null].filter(Boolean).join(', ') || 'OK'})`
          : 'Nao';

        const lyricsSummary = lyricsResult
          ? `Sim (${lyricsResult.source}, ${lyricsResult.lyrics.split('\n').filter(l => l.trim().length > 0).length} linhas)`
          : 'Nao';

        const statusLabel =
          slot.slotType === 'placeholder'
            ? 'Vaga reservada'
            : slot.slotType === 'partial'
              ? `Atual: "${slot.originalName}" - "${slot.originalArtists}" (complete: 1 - sem letra)`
              : `Atual: "${slot.originalName}" - "${slot.originalArtists}" (complete: false)`;

        console.info();
        console.info(`[${processedCount}/${selectedSlots.length}] ID ${slot.id} (${slot.genre}) | ${statusLabel}`);
        console.info(`Candidata: "${candidate.title}" - "${artistsStr}"`);
        console.info(`Metadados: ${metaSummary} | Letra: ${lyricsSummary}`);

        const confirm = await this.question(`Confirmar substituicao #${slot.id}? (S/n/p/sair): `);
        const confirmAnswer = confirm.trim().toLowerCase();

        if (confirmAnswer === ':q' || confirmAnswer === 'sair') {
          console.info(`Encerrado. Vagas substituidas: ${filledCount}.`);
          this.close();
          return;
        }

        if (confirmAnswer === 'p') {
          spotifyQueue.unshift(candidate);
          slotResolved = true;
          break;
        }

        if (confirmAnswer === '' || confirmAnswer === 's' || confirmAnswer === 'sim') {
          // 1. Remove arquivos fisicos obsoletos anteriores
          await this.deletePhysicalFiles(slot.id);

          // 2. Grava imediatamente os novos arquivos fisicos de metadados e letra
          const { wroteMeta, wroteLyrics } = await this.writePhysicalFiles(slot.id, metadata, lyricsResult);

          // 3. Calcula o status de completude oficial
          let completeStatus: boolean | number = false;
          if (wroteLyrics) {
            completeStatus = true;
          } else if (wroteMeta) {
            completeStatus = 1;
          } else {
            completeStatus = false;
          }

          // 4. Salva a faixa na lista JSON
          const saved = await this.saveSlot(slot.file, slot.id, candidate.title, artistsStr, completeStatus, currentUrl);

          if (saved) {
            filledCount++;
            const createdNotes = [
              wroteMeta ? 'metadados gravados' : null,
              wroteLyrics ? 'letra gravada' : null
            ].filter(Boolean);
            const statusLabel = completeStatus === true ? 'completo' : completeStatus === 1 ? 'so metadados' : 'pendente';
            const detailsMsg = createdNotes.length > 0 ? ` (${statusLabel}: ${createdNotes.join(', ')})` : ` (${statusLabel})`;
            console.info(`ID ${slot.id} gravado em ${slot.file}${detailsMsg}.`);

            // Atualiza catalogo em memoria: remove a musica antiga deste ID e inclui a nova
            const existingIndex = existingTracks.findIndex(t => t.id === slot.id);
            if (existingIndex !== -1) {
              existingTracks.splice(existingIndex, 1);
            }

            const parsed = parseArtists(artistsStr);
            existingTracks.push({
              id: slot.id,
              name: candidate.title,
              cleanTitle: normalizeString(sanitizeTitle(candidate.title)),
              artists: artistsStr,
              primaryArtist: normalizeString(parsed.primaryArtist),
              allArtists: parsed.allArtists,
              genre: slot.genre
            });
          } else {
            console.error(`Falha ao gravar ID ${slot.id}.`);
          }
          slotResolved = true;
        } else {
          console.info('Faixa descartada. Avaliando proxima da fila...');
        }
      }
    }

    console.info();
    console.info(`Finalizado. Vagas substituidas: ${filledCount}/${selectedSlots.length}.`);
    this.close();
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const args = process.argv.slice(2);
  let genreArg: string | undefined;
  let urlArg: string | undefined;
  let scopeArg: 'all' | 'placeholders' | 'partial' | 'incomplete' = 'all';

  for (const arg of args) {
    if (arg.startsWith('http') || arg.includes('spotify.com')) {
      urlArg = arg;
    } else if (arg === '--placeholders') {
      scopeArg = 'placeholders';
    } else if (arg === '--partial') {
      scopeArg = 'partial';
    } else if (arg === '--incomplete') {
      scopeArg = 'incomplete';
    } else if (!genreArg && !arg.startsWith('--')) {
      genreArg = arg;
    }
  }

  const filler = new TrackSlotFiller();
  filler.run({ genre: genreArg, url: urlArg, scope: scopeArg }).catch((err) => {
    if (err?.code !== 'ERR_USE_AFTER_CLOSE') {
      console.error('Erro na execucao:', err);
    }
    filler.close();
  });
}
