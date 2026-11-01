/**
 * O LyricsRegexSearch realiza varreduras textuais no corpus de letras
 * (/lyrics-data/lyrics) a partir de expressoes regulares ou palavras-chave.
 *
 * O serviço cruza os identificadores dos arquivos com os metadados das listas
 * (/lyrics-list), contabilizando ocorrencias globais e por genero musical, alem
 * de extrair linhas contextuais e calcular taxas de difusao e frequencia.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';

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

export interface TrackInfo {
  id: number | string;
  name: string;
  artists: string;
  genre: string;
}

export interface LineMatch {
  lineNumber: number;
  lineText: string;
  matchCount: number;
}

export interface TrackSearchResult {
  track: TrackInfo;
  occurrences: number;
  matchingLines: LineMatch[];
}

export interface GenreStat {
  genre: string;
  totalWithLyrics: number;
  matchingTracks: number;
  occurrences: number;
  coveragePercent: string;
  averageDensity: string;
}

export interface SearchReport {
  pattern: string;
  flags: string;
  totalAnalyzed: number;
  totalMatchingTracks: number;
  totalOccurrences: number;
  genreStats: GenreStat[];
  results: TrackSearchResult[];
}

export interface SearchOptions {
  genreFilter?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  limit?: number;
  summaryOnly?: boolean;
  outputJson?: boolean;
}

export class LyricsRegexSearch {
  private listDir: string;
  private lyricsDir: string;
  
  constructor() {
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    this.listDir = path.resolve(baseDir, '../lyrics-list');
    this.lyricsDir = path.resolve(baseDir, '../lyrics-data/lyrics');
  }
  
  public async loadTrackIndex(): Promise<Map<string, TrackInfo>> {
    const files = (await fs.readdir(this.listDir))
      .filter(f => f.endsWith('.json'))
      .sort();
    
    const trackMap = new Map<string, TrackInfo>();
    
    for (const file of files) {
      const genre = file.replace('-list.json', '').replace('.json', '');
      const filePath = path.join(this.listDir, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(raw);
      
      for (const group of data) {
        if (!group.lyrics || !Array.isArray(group.lyrics)) continue;
        
        for (const item of group.lyrics) {
          if (item.id !== undefined && item.id !== null) {
            trackMap.set(String(item.id), {
              id: item.id,
              name: item.name || `Faixa #${item.id}`,
              artists: item.artists || 'Sem Artista',
              genre
            });
          }
        }
      }
    }
    
    return trackMap;
  }
  
  public parsePattern(rawInput: string, options: SearchOptions): RegExp {
    let pattern = rawInput.trim();
    let flags = options.caseSensitive ? 'g' : 'gi';
    
    // Tratamento para Git Bash / MSYS no Windows:
    // O Git Bash converte argumentos iniciados com barra (ex: "/\btermo\b/") para "//btermo/b/"
    if (pattern.startsWith('//b') && pattern.endsWith('/b/')) {
      pattern = `\\b${pattern.slice(3, -3)}\\b`;
    } else if (pattern.startsWith('/b') && pattern.endsWith('/b/')) {
      pattern = `\\b${pattern.slice(2, -3)}\\b`;
    } else if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      // Suporte a sintaxe literal de expressao regular: /padrao/flags
      const lastSlashIdx = pattern.lastIndexOf('/');
      const extractedPattern = pattern.slice(1, lastSlashIdx);
      const extractedFlags = pattern.slice(lastSlashIdx + 1);
      
      pattern = extractedPattern;
      if (extractedFlags) {
        // Garante a presenca da flag global para contabilizacao completa
        flags = extractedFlags.includes('g') ? extractedFlags : `${extractedFlags}g`;
      }
    }
    
    if (options.wholeWord) {
      pattern = `\\b(?:${pattern})\\b`;
    }
    
    try {
      return new RegExp(pattern, flags);
    } catch (err: any) {
      throw new Error(`Expressao regular invalida: ${err.message}`);
    }
  }
  
  public async search(patternInput: string, options: SearchOptions = {}): Promise<SearchReport> {
    const regex = this.parsePattern(patternInput, options);
    const trackIndex = await this.loadTrackIndex();
    
    let lyricFiles: string[] = [];
    try {
      lyricFiles = (await fs.readdir(this.lyricsDir))
        .filter(f => f.endsWith('.txt'))
        .sort();
    } catch {
      throw new Error(`Diretorio de letras nao encontrado em: ${this.lyricsDir}`);
    }
    
    const genreStatsMap = new Map<string, { totalWithLyrics: number; matchingTracks: number; occurrences: number }>();
    const results: TrackSearchResult[] = [];
    let totalAnalyzed = 0;
    let totalOccurrences = 0;
    
    const knownGenres = new Set(Array.from(trackIndex.values()).map(t => t.genre.toLowerCase()));
    const normalizedFilter = options.genreFilter?.trim().toLowerCase();
    const isExactGenre = normalizedFilter ? knownGenres.has(normalizedFilter) : false;
    
    for (const file of lyricFiles) {
      const id = file.replace('.txt', '');
      const track = trackIndex.get(id) || {
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
      
      totalAnalyzed++;
      
      if (!genreStatsMap.has(track.genre)) {
        genreStatsMap.set(track.genre, {totalWithLyrics: 0, matchingTracks: 0, occurrences: 0});
      }
      const genreStat = genreStatsMap.get(track.genre)!;
      genreStat.totalWithLyrics++;
      
      const filePath = path.join(this.lyricsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      
      let trackOccurrences = 0;
      const matchingLines: LineMatch[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        if (!lineText.trim()) continue;
        
        // Reset regex lastIndex para execucao global
        regex.lastIndex = 0;
        const matches = lineText.match(regex);
        
        if (matches && matches.length > 0) {
          const matchCount = matches.length;
          trackOccurrences += matchCount;
          matchingLines.push({
            lineNumber: i + 1,
            lineText: lineText.trim(),
            matchCount
          });
        }
      }
      
      if (trackOccurrences > 0) {
        genreStat.matchingTracks++;
        genreStat.occurrences += trackOccurrences;
        totalOccurrences += trackOccurrences;
        
        results.push({
          track,
          occurrences: trackOccurrences,
          matchingLines
        });
      }
    }
    
    // Ordenacao decrescente pelo numero de ocorrencias
    results.sort((a, b) => b.occurrences - a.occurrences || Number(a.track.id) - Number(b.track.id));
    
    const genreStats: GenreStat[] = Array.from(genreStatsMap.entries())
      .map(([genre, stats]) => {
        const coverage = stats.totalWithLyrics > 0
          ? ((stats.matchingTracks / stats.totalWithLyrics) * 100).toFixed(1)
          : '0.0';
        const density = stats.matchingTracks > 0
          ? (stats.occurrences / stats.matchingTracks).toFixed(1)
          : '0.0';
        
        return {
          genre,
          totalWithLyrics: stats.totalWithLyrics,
          matchingTracks: stats.matchingTracks,
          occurrences: stats.occurrences,
          coveragePercent: `${coverage}%`,
          averageDensity: density
        };
      })
      .sort((a, b) => b.occurrences - a.occurrences || a.genre.localeCompare(b.genre));
    
    return {
      pattern: regex.source,
      flags: regex.flags,
      totalAnalyzed,
      totalMatchingTracks: results.length,
      totalOccurrences,
      genreStats,
      results
    };
  }
  
  public printReport(report: SearchReport, options: SearchOptions = {}): void {
    if (options.outputJson) {
      console.info(JSON.stringify(report, null, 2));
      return;
    }
    
    console.info();
    console.info(`Busca Textual por Expressao Regular no Corpus de Letras`);
    console.info(`Padrao: /${report.pattern}/${report.flags}`);
    console.info();
    
    console.info('Resumo Geral:');
    const coverageOverall = report.totalAnalyzed > 0
      ? ((report.totalMatchingTracks / report.totalAnalyzed) * 100).toFixed(1)
      : '0.0';
    
    console.info(`  Total de Faixas Analisadas:      ${report.totalAnalyzed.toString().padStart(5)}`);
    console.info(`  Faixas com Ocorrencias:          ${report.totalMatchingTracks.toString().padStart(5)} (${coverageOverall}%)`);
    console.info(`  Total de Ocorrencias do Termo:   ${report.totalOccurrences.toString().padStart(5)}`);
    console.info();
    
    if (report.genreStats.length > 0) {
      console.info('Detalhamento por Genero:');
      console.info('  Genero          Total    Com Ocorr.    Ocorrencias    Difusao (%)    Densidade');
      console.info('  -----------------------------------------------------------------------------');
      
      for (const stat of report.genreStats) {
        const genreStr = stat.genre.padEnd(14);
        const totalStr = stat.totalWithLyrics.toString().padStart(5);
        const matchStr = stat.matchingTracks.toString().padStart(11);
        const occStr = stat.occurrences.toString().padStart(14);
        const covStr = stat.coveragePercent.padStart(14);
        const denStr = stat.averageDensity.padStart(12);
        
        console.info(`  ${genreStr} ${totalStr} ${matchStr} ${occStr} ${covStr} ${denStr}`);
      }
      console.info('  -----------------------------------------------------------------------------');
      console.info();
    }
    
    if (options.summaryOnly) {
      return;
    }
    
    if (report.results.length === 0) {
      console.info('Nenhuma ocorrencia localizada com o padrao informado.');
      console.info();
      return;
    }
    
    const limit = options.limit !== undefined ? options.limit : 20;
    const displayedResults = limit > 0 ? report.results.slice(0, limit) : report.results;
    
    console.info(`Listagem de Faixas (${displayedResults.length} de ${report.results.length} exibidas):`);
    console.info();
    
    for (const res of displayedResults) {
      const occLabel = res.occurrences === 1 ? '1 ocorrencia' : `${res.occurrences} ocorrencias`;
      console.info(`  [${res.track.genre}] #${res.track.id} "${res.track.name}" - ${res.track.artists} (${occLabel})`);
      
      const snippetLimit = 3;
      const linesToShow = res.matchingLines.slice(0, snippetLimit);
      
      for (const lm of linesToShow) {
        console.info(`    L.${lm.lineNumber.toString().padEnd(3)} ${lm.lineText}`);
      }
      
      if (res.matchingLines.length > snippetLimit) {
        const remaining = res.matchingLines.length - snippetLimit;
        console.info(`    ... (+${remaining} linha${remaining > 1 ? 's' : ''} com correspondencia)`);
      }
      
      console.info();
    }
    
    if (limit > 0 && report.results.length > limit) {
      console.info(`(Exibindo as primeiras ${limit} faixas com mais ocorrencias. Use --all para exibir todas)`);
      console.info();
    }
  }
}

function showHelp(): void {
  console.info('Uso:');
  console.info('  npm run search:lyrics "<padrao-ou-palavra>" [genero] [all] [summary] [word]');
  console.info('  npm run search:lyrics \'--\' "<padrao-ou-palavra>" [opcoes com --]');
  console.info();
  console.info('Exemplos (Sem necessidade de flags -- ou aspas especiais):');
  console.info('  npm run search:lyrics "/\\bputa\\b/" trap-extra all');
  console.info('  npm run search:lyrics "puta" trap-extra word all');
  console.info('  npm run search:lyrics "amor" sertanejo');
  console.info('  npm run search:lyrics "/(?:dinheiro|grana)/i" rap all');
  console.info('  npm run search:lyrics "favela" all summary');
  console.info();
  console.info('Opcoes via flag (quando usar \'--\'):');
  console.info('  --genre=<nome>, -g    Filtra a busca por um genero especifico (funk, rock, rap, sertanejo, etc.)');
  console.info('  --word, -w            Garante correspondencia de palavra inteira (adiciona delimitadores \\b)');
  console.info('  --case-sensitive, -c  Diferencia maiusculas de minusculas (padrao: case-insensitive)');
  console.info('  --limit=<N>, -l       Limite de faixas detalhadas a exibir (padrao: 20)');
  console.info('  --all, -a             Exibe todas as faixas sem limite');
  console.info('  --summary             Exibe apenas o resumo estatistico sem linhas detalhadas');
  console.info('  --json                Retorna o resultado estruturado em formato JSON');
  console.info('  --help, -h            Exibe esta mensagem de ajuda');
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  let patternArg: string | undefined;
  const options: SearchOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--genre=')) {
      options.genreFilter = arg.replace('--genre=', '');
    } else if ((arg === '--genre' || arg === '-g') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      options.genreFilter = args[++i];
    } else if (arg.startsWith('-g=')) {
      options.genreFilter = arg.replace('-g=', '');
    } else if (arg === '--word' || arg === '-w') {
      options.wholeWord = true;
    } else if (arg === '--case-sensitive' || arg === '-c') {
      options.caseSensitive = true;
    } else if (arg === '--summary' || arg === '--summary-only') {
      options.summaryOnly = true;
    } else if (arg === '--all' || arg === '-a') {
      options.limit = 0;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.replace('--limit=', ''), 10);
    } else if ((arg === '--limit' || arg === '-l') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--json') {
      options.outputJson = true;
    } else if (!patternArg && !arg.startsWith('-')) {
      patternArg = arg;
    } else if (!arg.startsWith('-')) {
      const lower = arg.toLowerCase();
      if (lower === 'all') {
        options.limit = 0;
      } else if (lower === 'summary') {
        options.summaryOnly = true;
      } else if (lower === 'word') {
        options.wholeWord = true;
      } else if (!options.genreFilter) {
        options.genreFilter = arg;
      }
    }
  }
  
  if (!patternArg) {
    console.error('Erro: Nenhum padrao ou palavra fornecido para busca.');
    console.info('Execute com --help para instrucoes de uso.');
    process.exit(1);
  }
  
  const searcher = new LyricsRegexSearch();
  searcher.search(patternArg, options)
    .then(report => {
      searcher.printReport(report, options);
    })
    .catch(err => {
      console.error(`Erro: ${err.message}`);
      process.exit(1);
    });
}

