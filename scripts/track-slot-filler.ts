/**
 * O TrackSlotFiller gerencia o preenchimento de vagas marcadas
 * como "Substituir faixa #{ID}" nos arquivos de listas musicais (/lyrics-list).
 *
 * O fluxo opera consumindo faixas diretamente de uma URL de álbum ou playlist do Spotify,
 * eliminando a necessidade de digitação manual e mitigando inconsistências de catálogo.
 * Para cada slot pendente, o serviço consome as músicas retornadas pela API do Spotify e:
 * 1. Aplica trava anti-duplicata contra o corpus completo.
 * 2. Consulta prévia em tempo real de metadados técnicos (MusicBrainz, iTunes, Deezer) em memória.
 * 3. Consulta prévia em tempo real de letras musicais (LRCLIB, Genius, lyrics.ovh) em memória.
 *
 * Ao receber a confirmação do operador, o arquivo JSON correspondente é persistido
 * imediatamente (salvamento a quente), mantendo o status `complete: false` e registrando
 * a URL de origem no atributo `source` da lista.
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

interface PendingSlot {
  id: number | string;
  genre: string;
  file: string;
  originalName: string;
  originalArtists: string;
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

export class TrackSlotFiller {
  private listDir: string;
  private metadataService: TrackMetadataService;
  private lyricsService: LyricsService;
  private spotifyClient: SpotifyApiClient;
  private rl: readline.Interface;
  private isClosed = false;

  constructor() {
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    this.listDir = path.resolve(baseDir, '../lyrics-list');
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

  public async loadCorpusData(): Promise<{ slots: PendingSlot[]; existingTracks: ExistingTrack[] }> {
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
          if (this.isPlaceholder(item.name, item.artists)) {
            slots.push({
              id: item.id,
              genre,
              file,
              originalName: item.name,
              originalArtists: item.artists || ''
            });
          } else if (item.name) {
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

  public async saveSlot(
    file: string,
    slotId: number | string,
    newTitle: string,
    newArtists: string,
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
          item.complete = false;
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

  public async run(genreArg?: string, urlArg?: string): Promise<void> {
    const { slots, existingTracks } = await this.loadCorpusData();

    if (slots.length === 0) {
      console.info('Nenhuma vaga pendente no corpus.');
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

    if (genreArg) {
      const filterLower = genreArg.toLowerCase().trim();
      const matchedGenre = Array.from(genreSlotMap.keys()).find(g => g.toLowerCase() === filterLower || g.toLowerCase().includes(filterLower));

      if (matchedGenre && genreSlotMap.has(matchedGenre)) {
        selectedSlots = genreSlotMap.get(matchedGenre)!;
      } else {
        console.warn(`Genero nao encontrado: "${genreArg}".`);
        for (const [g, list] of genreSlotMap.entries()) {
          console.info(`  ${g}: ${list.length} vagas`);
        }
        this.close();
        return;
      }
    } else {
      const availableGenres = Array.from(genreSlotMap.entries());
      console.info('Vagas pendentes por genero:');
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

    let currentUrl = urlArg?.trim() || '';
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
          const inputUrl = await this.question(`URL Spotify para preencher #${slot.id} (${slot.genre}) [:q sair, Enter pular]: `);
          const trimmedUrl = inputUrl.trim();

          if (trimmedUrl === ':q') {
            console.info(`Encerrado. Vagas preenchidas: ${filledCount}.`);
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

        // 1. Verificacao de Duplicata no Corpus
        const duplicates = this.findCorpusDuplicates(candidate.title, artistsStr, existingTracks);
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

        console.info();
        console.info(`[${processedCount}/${selectedSlots.length}] ID ${slot.id} (${slot.genre})`);
        console.info(`Candidata: "${candidate.title}" - "${artistsStr}"`);
        console.info(`Metadados: ${metaSummary} | Letra: ${lyricsSummary}`);

        const confirm = await this.question(`Confirmar #${slot.id}? (S/n/p/sair): `);
        const confirmAnswer = confirm.trim().toLowerCase();

        if (confirmAnswer === ':q' || confirmAnswer === 'sair') {
          console.info(`Encerrado. Vagas preenchidas: ${filledCount}.`);
          this.close();
          return;
        }

        if (confirmAnswer === 'p') {
          // Pula a vaga mantendo a faixa candidata para o proximo slot
          spotifyQueue.unshift(candidate);
          slotResolved = true;
          break;
        }

        if (confirmAnswer === '' || confirmAnswer === 's' || confirmAnswer === 'sim') {
          const saved = await this.saveSlot(slot.file, slot.id, candidate.title, artistsStr, currentUrl);
          if (saved) {
            filledCount++;
            console.info(`ID ${slot.id} gravado em ${slot.file}.`);

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
          // 'n' descarta esta musica candidata e busca a proxima da fila do Spotify para o mesmo slot
          console.info('Faixa descartada. Avaliando proxima da fila...');
        }
      }
    }

    console.info();
    console.info(`Finalizado. Vagas preenchidas: ${filledCount}/${selectedSlots.length}.`);
    this.close();
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const args = process.argv.slice(2);
  let genreArg: string | undefined;
  let urlArg: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('http') || arg.includes('spotify.com')) {
      urlArg = arg;
    } else if (!genreArg) {
      genreArg = arg;
    }
  }

  const filler = new TrackSlotFiller();
  filler.run(genreArg, urlArg).catch((err) => {
    if (err?.code !== 'ERR_USE_AFTER_CLOSE') {
      console.error('Erro na execucao:', err);
    }
    filler.close();
  });
}
