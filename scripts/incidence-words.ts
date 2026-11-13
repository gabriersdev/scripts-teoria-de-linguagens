/**
 * Analisador de incidencia lexical sobre o corpus de letras (/lyrics-data/lyrics).
 *
 * Reutiliza LyricsCorpus (/lib/lyrics-corpus.ts) para carregar faixas e generos,
 * aplica tokenizacao limpa com filtragem padrao via lib/ignore-words.json e
 * integracao com lib/swear-words.json (/lib/word-filters.ts).
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { LyricsCorpus } from '../lib/lyrics-corpus.js';
import {
  buildWordSet,
  DEFAULT_MIN_WORD_LENGTH,
  loadIgnoreWords,
  loadSwearWords,
  tokenizeLyricWords
} from '../lib/word-filters.js';

export const DEFAULT_WORD_LIMIT = 30;
export const DEFAULT_GENRE_TOP_LIMIT = 5;

export type SwearFilterMode = 'highlight' | 'only' | 'exclude';

export interface IncidenceOptions {
  genreFilter?: string;
  limit?: number;
  minLength?: number;
  includeStopwords?: boolean;
  normalizeAccents?: boolean;
  keepSectionTags?: boolean;
  ignoreWords?: string[];
  swearMode?: SwearFilterMode;
  genreTopLimit?: number;
  summaryOnly?: boolean;
  outputJson?: boolean;
}

export interface WordIncidenceEntry {
  rank: number;
  word: string;
  occurrences: number;
  trackCount: number;
  trackCoveragePercent: string;
  sharePercent: string;
  isSwearWord: boolean;
}

export interface GenreIncidenceSummary {
  genre: string;
  totalTracks: number;
  rawTokenCount: number;
  filteredTokenCount: number;
  uniqueWordCount: number;
  swearOccurrences: number;
  swearSharePercent: string;
  topWords: WordIncidenceEntry[];
}

export interface IncidenceReport {
  genreFilter: string | null;
  includeStopwords: boolean;
  normalizeAccents: boolean;
  keepSectionTags: boolean;
  minLength: number;
  swearMode: SwearFilterMode;
  customIgnoredWords: string[];
  totalTracksAnalyzed: number;
  totalRawTokens: number;
  totalFilteredTokens: number;
  uniqueWordsCount: number;
  totalSwearOccurrences: number;
  swearSharePercent: string;
  genreSummaries: GenreIncidenceSummary[];
  topWords: WordIncidenceEntry[];
}

interface WordAccumulator {
  occurrences: number;
  trackCount: number;
}

interface GenreAccumulator {
  totalTracks: number;
  rawTokenCount: number;
  filteredTokenCount: number;
  swearOccurrences: number;
  wordMap: Map<string, WordAccumulator>;
}

function formatPercent(part: number, total: number, decimals = 1): string {
  if (total <= 0) {
    return `${(0).toFixed(decimals)}%`;
  }
  return `${((part / total) * 100).toFixed(decimals)}%`;
}

function buildRankedWords(
  wordMap: Map<string, WordAccumulator>,
  totalTracks: number,
  totalFilteredTokens: number,
  swearWordsSet: ReadonlySet<string>,
  limit: number
): WordIncidenceEntry[] {
  const sortedEntries = Array.from(wordMap.entries()).sort((a, b) => {
    const [, statsA] = a;
    const [, statsB] = b;
    return (
      statsB.occurrences - statsA.occurrences ||
      statsB.trackCount - statsA.trackCount ||
      a[0].localeCompare(b[0], 'pt-BR')
    );
  });

  const slicedEntries = limit > 0 ? sortedEntries.slice(0, limit) : sortedEntries;

  return slicedEntries.map(([word, stats], index) => ({
    rank: index + 1,
    word,
    occurrences: stats.occurrences,
    trackCount: stats.trackCount,
    trackCoveragePercent: formatPercent(stats.trackCount, totalTracks, 1),
    sharePercent: formatPercent(stats.occurrences, totalFilteredTokens, 2),
    isSwearWord: swearWordsSet.has(word)
  }));
}

export class WordIncidenceAnalyzer {
  private readonly corpus: LyricsCorpus;
  private readonly swearWordsPath?: string;
  private readonly ignoreWordsPath?: string;

  constructor(corpus = new LyricsCorpus(), swearWordsPath?: string, ignoreWordsPath?: string) {
    this.corpus = corpus;
    this.swearWordsPath = swearWordsPath;
    this.ignoreWordsPath = ignoreWordsPath;
  }

  public async analyze(options: IncidenceOptions = {}): Promise<IncidenceReport> {
    const limit = options.limit ?? DEFAULT_WORD_LIMIT;
    const genreTopLimit = options.genreTopLimit ?? DEFAULT_GENRE_TOP_LIMIT;
    const minLength = options.minLength ?? DEFAULT_MIN_WORD_LENGTH;
    const includeStopwords = options.includeStopwords ?? false;
    const shouldNormalizeAccents = options.normalizeAccents ?? false;
    const keepSectionTags = options.keepSectionTags ?? false;
    const swearMode: SwearFilterMode = options.swearMode ?? 'highlight';
    const customIgnoredList = options.ignoreWords ?? [];

    const swearWordsSet = await loadSwearWords(this.swearWordsPath, shouldNormalizeAccents);
    const stopwordSet = includeStopwords
      ? new Set<string>()
      : await loadIgnoreWords(this.ignoreWordsPath, shouldNormalizeAccents);
    const customIgnoreSet = buildWordSet(customIgnoredList, shouldNormalizeAccents);

    const globalWordMap = new Map<string, WordAccumulator>();
    const genreMap = new Map<string, GenreAccumulator>();

    let totalTracksAnalyzed = 0;
    let totalRawTokens = 0;
    let totalFilteredTokens = 0;
    let totalSwearOccurrences = 0;

    for await (const { track, content } of this.corpus.iterateLyrics({ genreFilter: options.genreFilter })) {
      totalTracksAnalyzed++;

      if (!genreMap.has(track.genre)) {
        genreMap.set(track.genre, {
          totalTracks: 0,
          rawTokenCount: 0,
          filteredTokenCount: 0,
          swearOccurrences: 0,
          wordMap: new Map<string, WordAccumulator>()
        });
      }

      const genreAcc = genreMap.get(track.genre)!;
      genreAcc.totalTracks++;

      const tokens = tokenizeLyricWords(content, {
        stripSectionTags: !keepSectionTags,
        normalizeAccents: shouldNormalizeAccents,
        minLength
      });

      totalRawTokens += tokens.length;
      genreAcc.rawTokenCount += tokens.length;

      const seenInTrack = new Set<string>();

      for (const word of tokens) {
        if (stopwordSet.has(word) || customIgnoreSet.has(word)) {
          continue;
        }

        const isSwear = swearWordsSet.has(word);
        if (swearMode === 'only' && !isSwear) {
          continue;
        }
        if (swearMode === 'exclude' && isSwear) {
          continue;
        }

        totalFilteredTokens++;
        genreAcc.filteredTokenCount++;

        if (isSwear) {
          totalSwearOccurrences++;
          genreAcc.swearOccurrences++;
        }

        const isFirstInTrack = !seenInTrack.has(word);
        if (isFirstInTrack) {
          seenInTrack.add(word);
        }

        const globalAcc = globalWordMap.get(word);
        if (globalAcc) {
          globalAcc.occurrences++;
          if (isFirstInTrack) {
            globalAcc.trackCount++;
          }
        } else {
          globalWordMap.set(word, { occurrences: 1, trackCount: 1 });
        }

        const genreWordAcc = genreAcc.wordMap.get(word);
        if (genreWordAcc) {
          genreWordAcc.occurrences++;
          if (isFirstInTrack) {
            genreWordAcc.trackCount++;
          }
        } else {
          genreAcc.wordMap.set(word, { occurrences: 1, trackCount: 1 });
        }
      }
    }

    const genreSummaries: GenreIncidenceSummary[] = Array.from(genreMap.entries())
      .map(([genre, acc]) => ({
        genre,
        totalTracks: acc.totalTracks,
        rawTokenCount: acc.rawTokenCount,
        filteredTokenCount: acc.filteredTokenCount,
        uniqueWordCount: acc.wordMap.size,
        swearOccurrences: acc.swearOccurrences,
        swearSharePercent: formatPercent(acc.swearOccurrences, acc.filteredTokenCount, 1),
        topWords: buildRankedWords(
          acc.wordMap,
          acc.totalTracks,
          acc.filteredTokenCount,
          swearWordsSet,
          genreTopLimit
        )
      }))
      .sort((a, b) => b.filteredTokenCount - a.filteredTokenCount || a.genre.localeCompare(b.genre));

    const topWords = buildRankedWords(
      globalWordMap,
      totalTracksAnalyzed,
      totalFilteredTokens,
      swearWordsSet,
      limit
    );

    return {
      genreFilter: options.genreFilter ?? null,
      includeStopwords,
      normalizeAccents: shouldNormalizeAccents,
      keepSectionTags,
      minLength,
      swearMode,
      customIgnoredWords: Array.from(customIgnoreSet).sort(),
      totalTracksAnalyzed,
      totalRawTokens,
      totalFilteredTokens,
      uniqueWordsCount: globalWordMap.size,
      totalSwearOccurrences,
      swearSharePercent: formatPercent(totalSwearOccurrences, totalFilteredTokens, 1),
      genreSummaries,
      topWords
    };
  }

  public printReport(report: IncidenceReport, options: IncidenceOptions = {}): void {
    if (options.outputJson) {
      console.info(JSON.stringify(report, null, 2));
      return;
    }

    const stopwordsLabel = report.includeStopwords ? 'incluidas' : 'ignoradas';
    const swearLabelMap: Record<SwearFilterMode, string> = {
      highlight: 'destacados',
      only: 'somente',
      exclude: 'excluidos'
    };
    const accentsLabel = report.normalizeAccents ? 'normalizados' : 'preservados';
    const genreLabel = report.genreFilter ?? 'todos';

    console.info();
    console.info('Analise de Incidencia de Palavras no Corpus de Letras');
    console.info(
      `Filtros: genero=${genreLabel} | stopwords=${stopwordsLabel} | swear-words=${swearLabelMap[report.swearMode]} | min_len=${report.minLength} | acentos=${accentsLabel}`
    );
    if (report.customIgnoredWords.length > 0) {
      console.info(`Ignoradas extras: ${report.customIgnoredWords.join(', ')}`);
    }
    console.info();

    if (report.totalTracksAnalyzed === 0) {
      console.info('Nenhuma faixa localizada com os filtros informados.');
      console.info();
      return;
    }

    console.info('Resumo Geral:');
    console.info(`  Faixas Analisadas:               ${report.totalTracksAnalyzed.toString().padStart(8)}`);
    console.info(`  Tokens Brutos Extraidos:         ${report.totalRawTokens.toString().padStart(8)}`);
    console.info(`  Palavras Contabilizadas:         ${report.totalFilteredTokens.toString().padStart(8)}`);
    console.info(`  Vocabulario Unico:               ${report.uniqueWordsCount.toString().padStart(8)}`);
    if (report.swearMode !== 'exclude') {
      console.info(
        `  Termos de swear-words.json:      ${report.totalSwearOccurrences.toString().padStart(8)} (${report.swearSharePercent} das contabilizadas)`
      );
    }
    console.info();

    if (report.genreSummaries.length > 0) {
      console.info('Detalhamento por Genero:');
      const genreHeader =
        `  ${'Genero'.padEnd(14)} ${'Faixas'.padStart(6)} ${'Contabilizadas'.padStart(16)} ` +
        `${'Vocab. Unico'.padStart(14)} ${'Swear-Words'.padStart(15)}    Top Palavras`;
      console.info(genreHeader);
      console.info(`  ${'-'.repeat(107)}`);

      for (const summary of report.genreSummaries) {
        const gName = summary.genre.padEnd(14);
        const tracksStr = summary.totalTracks.toString().padStart(6);
        const filteredStr = summary.filteredTokenCount.toString().padStart(16);
        const uniqueStr = summary.uniqueWordCount.toString().padStart(14);
        const swearStr = report.swearMode === 'exclude'
          ? '-'.padStart(15)
          : `${summary.swearOccurrences} (${summary.swearSharePercent})`.padStart(15);
        const topPreview = summary.topWords.length > 0
          ? summary.topWords.map((entry) => `${entry.word} (${entry.occurrences})`).join(', ')
          : '-';

        console.info(`  ${gName} ${tracksStr} ${filteredStr} ${uniqueStr} ${swearStr}    ${topPreview}`);
      }
      console.info(`  ${'-'.repeat(107)}`);
      console.info();
    }

    if (options.summaryOnly) {
      return;
    }

    if (report.topWords.length === 0) {
      console.info('Nenhuma palavra contabilizada com os criterios selecionados.');
      console.info();
      return;
    }

    const limitLabel = report.topWords.length === report.uniqueWordsCount
      ? `todas as ${report.uniqueWordsCount} palavras`
      : `Top ${report.topWords.length} de ${report.uniqueWordsCount} palavras`;

    const wordColWidth = Math.max(24, ...report.topWords.map((entry) => entry.word.length + 2));
    const rankingHeader =
      `  ${'Pos'.padStart(3)}   ${'Palavra'.padEnd(wordColWidth)} ${'Ocorrencias'.padStart(11)} ` +
      `${'Faixas'.padStart(9)} ${'Difusao'.padStart(10)} ${'Partic.'.padStart(10)}    Swear`;
    const rankingDivider = `  ${'-'.repeat(rankingHeader.length - 2)}`;

    console.info(`Ranking Global (${limitLabel}):`);
    console.info(rankingHeader);
    console.info(rankingDivider);

    for (const entry of report.topWords) {
      const posStr = entry.rank.toString().padStart(3);
      const wordStr = entry.word.padEnd(wordColWidth);
      const occStr = entry.occurrences.toString().padStart(11);
      const tracksStr = entry.trackCount.toString().padStart(9);
      const covStr = entry.trackCoveragePercent.padStart(10);
      const shareStr = entry.sharePercent.padStart(10);
      const swearFlag = entry.isSwearWord ? 'sim' : '-';

      console.info(`  ${posStr}   ${wordStr} ${occStr} ${tracksStr} ${covStr} ${shareStr}    ${swearFlag}`);
    }

    console.info(rankingDivider);
    console.info();

    if (report.topWords.length < report.uniqueWordsCount) {
      console.info(
        `(Exibindo as ${report.topWords.length} palavras mais incidentes. Use --limit=N ou --all para expandir)`
      );
      console.info();
    }
  }
}

function showHelp(): void {
  console.info('Uso:');
  console.info('  npm run incidence:words [genero] [limite|all] [swear|no-swear] [all-words] [summary]');
  console.info('  npm run incidence:words \'--\' [opcoes com --]');
  console.info();
  console.info('Exemplos (sem necessidade de flags --):');
  console.info('  npm run incidence:words');
  console.info('  npm run incidence:words funk 50');
  console.info('  npm run incidence:words sertanejo summary');
  console.info('  npm run incidence:words trap swear');
  console.info('  npm run incidence:words rap no-swear');
  console.info('  npm run incidence:words all-words 30');
  console.info();
  console.info('Opcoes via flag (quando usar \'--\'):');
  console.info('  --genre=<nome>, -g      Filtra por genero (funk, rap, rock, sertanejo, trap, trap-extra)');
  console.info(`  --limit=<N>, -l         Quantidade de palavras no ranking global (padrao: ${DEFAULT_WORD_LIMIT})`);
  console.info('  --all, -a               Exibe todas as palavras do vocabulario sem limite');
  console.info(`  --min-length=<N>, -m    Tamanho minimo da palavra (padrao: ${DEFAULT_MIN_WORD_LENGTH})`);
  console.info(`  --genre-top=<N>         Quantidade de palavras no preview por genero (padrao: ${DEFAULT_GENRE_TOP_LIMIT})`);
  console.info('  --ignore=<p1,p2>, -i    Lista extra de palavras ignoradas separadas por virgula');
  console.info('  --all-words             Inclui termos de lib/ignore-words.json (stopwords do portugues)');
  console.info('  --only-swear            Contabiliza apenas palavras presentes em lib/swear-words.json');
  console.info('  --exclude-swear         Remove palavras de lib/swear-words.json da contagem');
  console.info('  --no-accents            Normaliza acentos (agrupa ex.: "nao" e "não")');
  console.info('  --keep-tags             Mantem tags estruturais entre colchetes (ex.: [Refrão])');
  console.info('  --summary               Exibe apenas resumo geral e detalhamento por genero');
  console.info('  --json                  Retorna o relatorio estruturado em formato JSON');
  console.info('  --help, -h              Exibe esta mensagem de ajuda');
}

function parsePositiveInt(rawValue: string, flagName: string, allowZero = false): number {
  const parsed = Number.parseInt(rawValue, 10);
  const minimum = allowZero ? 0 : 1;
  if (Number.isNaN(parsed) || parsed < minimum) {
    throw new Error(`Valor invalido para ${flagName}: "${rawValue}".`);
  }
  return parsed;
}

export function parseCliArgs(args: string[]): { showHelpOnly: boolean; options: IncidenceOptions } {
  if (args.includes('--help') || args.includes('-h')) {
    return { showHelpOnly: true, options: {} };
  }

  const options: IncidenceOptions = {};
  const extraIgnored: string[] = [];
  let hasOnlySwear = false;
  let hasExcludeSwear = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') {
      continue;
    }

    if (arg.startsWith('--genre=')) {
      options.genreFilter = arg.slice('--genre='.length);
    } else if (arg.startsWith('-g=')) {
      options.genreFilter = arg.slice('-g='.length);
    } else if ((arg === '--genre' || arg === '-g') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      options.genreFilter = args[++i];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInt(arg.slice('--limit='.length), '--limit', true);
    } else if (arg.startsWith('-l=')) {
      options.limit = parsePositiveInt(arg.slice('-l='.length), '-l', true);
    } else if ((arg === '--limit' || arg === '-l') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      options.limit = parsePositiveInt(args[++i], arg, true);
    } else if (arg.startsWith('--min-length=')) {
      options.minLength = parsePositiveInt(arg.slice('--min-length='.length), '--min-length', false);
    } else if ((arg === '--min-length' || arg === '-m') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      options.minLength = parsePositiveInt(args[++i], arg, false);
    } else if (arg.startsWith('--genre-top=')) {
      options.genreTopLimit = parsePositiveInt(arg.slice('--genre-top='.length), '--genre-top', false);
    } else if (arg.startsWith('--ignore=')) {
      extraIgnored.push(...arg.slice('--ignore='.length).split(',').map((w) => w.trim()).filter(Boolean));
    } else if ((arg === '--ignore' || arg === '-i') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      extraIgnored.push(...args[++i].split(',').map((w) => w.trim()).filter(Boolean));
    } else if (arg === '--all' || arg === '-a') {
      options.limit = 0;
    } else if (arg === '--all-words' || arg === '--no-stopwords' || arg === '--include-stopwords') {
      options.includeStopwords = true;
    } else if (arg === '--only-swear' || arg === '--swear-only') {
      hasOnlySwear = true;
      options.swearMode = 'only';
    } else if (arg === '--exclude-swear' || arg === '--no-swear') {
      hasExcludeSwear = true;
      options.swearMode = 'exclude';
    } else if (arg === '--no-accents' || arg === '--normalize-accents') {
      options.normalizeAccents = true;
    } else if (arg === '--keep-tags') {
      options.keepSectionTags = true;
    } else if (arg === '--summary' || arg === '--summary-only') {
      options.summaryOnly = true;
    } else if (arg === '--json') {
      options.outputJson = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Opcao desconhecida: ${arg}`);
    } else {
      const lower = arg.toLowerCase();
      if (lower === 'all') {
        options.limit = 0;
      } else if (lower === 'summary') {
        options.summaryOnly = true;
      } else if (lower === 'all-words' || lower === 'stopwords') {
        options.includeStopwords = true;
      } else if (lower === 'swear' || lower === 'only-swear') {
        hasOnlySwear = true;
        options.swearMode = 'only';
      } else if (lower === 'no-swear' || lower === 'exclude-swear') {
        hasExcludeSwear = true;
        options.swearMode = 'exclude';
      } else if (lower === 'no-accents') {
        options.normalizeAccents = true;
      } else if (lower === 'json') {
        options.outputJson = true;
      } else if (/^\d+$/.test(arg)) {
        options.limit = parsePositiveInt(arg, 'limite posicional', true);
      } else if (!options.genreFilter) {
        options.genreFilter = arg;
      }
    }
  }

  if (hasOnlySwear && hasExcludeSwear) {
    throw new Error('As opcoes --only-swear e --exclude-swear nao podem ser usadas juntas.');
  }

  if (extraIgnored.length > 0) {
    options.ignoreWords = extraIgnored;
  }

  return { showHelpOnly: false, options };
}

async function main(): Promise<void> {
  try {
    const { showHelpOnly, options } = parseCliArgs(process.argv.slice(2));
    if (showHelpOnly) {
      showHelp();
      return;
    }

    const analyzer = new WordIncidenceAnalyzer();
    const report = await analyzer.analyze(options);
    analyzer.printReport(report, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Erro: ${message}`);
    process.exit(1);
  }
}

const isCLI =
  typeof process !== 'undefined' &&
  Boolean(process.argv?.[1]) &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isCLI) {
  void main();
}
