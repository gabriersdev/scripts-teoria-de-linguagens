import * as fs from 'fs/promises';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SWEAR_WORDS_PATH = path.resolve(SCRIPT_DIR, '../../lib/swear-words.json');
const DEFAULT_INPUT_DIR = path.resolve(SCRIPT_DIR, 'input/lyrics-data/lyrics');
const DEFAULT_OUTPUT_DIR = path.resolve(SCRIPT_DIR, 'output/lyrics');
const DEFAULT_SUMMARY_PATH = path.resolve(SCRIPT_DIR, 'output/summary.json');

const MASK_CHAR = '*';
const CENSORED_SECOND_LETTER_PATTERN = '[*#]+';
const WORD_BOUNDARY_START = '(?<![\\p{L}\\p{N}_])';
const WORD_BOUNDARY_END = '(?![\\p{L}\\p{N}_])';
const GENDER_PLACEHOLDER = '[x]';

const ACCENT_EQUIVALENTS: Readonly<Record<string, string>> = {
  á: '[aá]',
  à: '[aà]',
  â: '[aâ]',
  ã: '[aã]',
  ä: '[aä]',
  é: '[eé]',
  è: '[eè]',
  ê: '[eê]',
  ë: '[eë]',
  í: '[ií]',
  ì: '[iì]',
  î: '[iî]',
  ï: '[iï]',
  ó: '[oó]',
  ò: '[oò]',
  ô: '[oô]',
  õ: '[oõ]',
  ö: '[oö]',
  ú: '[uú]',
  ù: '[uù]',
  û: '[uû]',
  ü: '[uü]',
  ç: '[cç]',
};

interface SwearWordsFile {
  'swear-words'?: unknown;
}

interface PatternTrieNode {
  readonly children: Map<string, PatternTrieNode>;
  isTerminal: boolean;
  terminalSuffix: string;
}

interface WordPatternParts {
  readonly tokenPatterns: ReadonlyArray<string>;
  readonly pluralSuffix: string;
}

interface MaskResult {
  readonly maskedText: string;
  readonly matchCount: number;
  readonly matchedTerms: ReadonlyArray<string>;
}

interface ExecutionSummary {
  readonly language: string;
  readonly swearWordsLoaded: number;
  readonly filesProcessed: number;
  readonly filesWithMatches: number;
  readonly totalMatches: number;
  readonly elapsedMs: number;
  readonly outputDir: string;
}

function escapeRegexChar(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeSwearWord(rawWord: string): ReadonlyArray<string> {
  const normalized = rawWord.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const chars = Array.from(normalized);
  const tokens: string[] = [];
  let index = 0;

  while (index < chars.length) {
    if (
      index + 2 < chars.length &&
      chars[index] === '[' &&
      chars[index + 1] === 'x' &&
      chars[index + 2] === ']'
    ) {
      tokens.push(GENDER_PLACEHOLDER);
      index += 3;
      continue;
    }

    tokens.push(chars[index]);
    index += 1;
  }

  return tokens;
}

function buildTokenPattern(token: string): string {
  if (token === GENDER_PLACEHOLDER) {
    return '[ao]+';
  }

  if (token === '-') {
    return '-';
  }

  const accentClass = ACCENT_EQUIVALENTS[token];
  if (accentClass) {
    return `${accentClass}+`;
  }

  return `${escapeRegexChar(token)}+`;
}

function buildWordTokenPatterns(rawWord: string): WordPatternParts {
  const tokens = tokenizeSwearWord(rawWord);
  if (tokens.length === 0) {
    return { tokenPatterns: [], pluralSuffix: '' };
  }

  const tokenPatterns = tokens.map((token, index) => {
    const basePattern = buildTokenPattern(token);
    const shouldAllowCensoredSecondChar = index === 1 && token !== '-';

    if (shouldAllowCensoredSecondChar) {
      return `(?:${basePattern}|${CENSORED_SECOND_LETTER_PATTERN})`;
    }

    return basePattern;
  });

  const lastToken = tokens[tokens.length - 1];
  const pluralSuffix = lastToken === 's' ? '' : 's*';

  return { tokenPatterns, pluralSuffix };
}

function createTrieNode(): PatternTrieNode {
  return {
    children: new Map<string, PatternTrieNode>(),
    isTerminal: false,
    terminalSuffix: '',
  };
}

function insertIntoTrie(root: PatternTrieNode, parts: WordPatternParts): void {
  let current = root;

  for (const tokenPattern of parts.tokenPatterns) {
    let next = current.children.get(tokenPattern);
    if (!next) {
      next = createTrieNode();
      current.children.set(tokenPattern, next);
    }
    current = next;
  }

  current.isTerminal = true;
  if (!current.terminalSuffix) {
    current.terminalSuffix = parts.pluralSuffix;
  }
}

function serializeTrieNode(node: PatternTrieNode): string {
  const sortedEntries = [...node.children.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );

  const branches = sortedEntries.map(
    ([tokenPattern, childNode]) => `${tokenPattern}${serializeTrieNode(childNode)}`
  );

  if (node.isTerminal) {
    if (branches.length === 0) {
      return node.terminalSuffix;
    }

    if (!node.terminalSuffix) {
      return branches.length === 1
        ? `(?:${branches[0]})?`
        : `(?:${branches.join('|')})?`;
    }

    branches.push(node.terminalSuffix);
  }

  if (branches.length === 1) {
    return branches[0];
  }

  return `(?:${branches.join('|')})`;
}

export function buildSwearWordPattern(rawWord: string): string | null {
  const parts = buildWordTokenPatterns(rawWord);
  if (parts.tokenPatterns.length === 0) {
    return null;
  }

  return `${parts.tokenPatterns.join('')}${parts.pluralSuffix}`;
}

export function buildSwearWordsRegex(words: ReadonlyArray<string>): RegExp {
  const root = createTrieNode();
  let insertedCount = 0;

  for (const rawWord of words) {
    const trimmed = rawWord.trim();
    if (!trimmed) {
      continue;
    }

    const parts = buildWordTokenPatterns(trimmed);
    if (parts.tokenPatterns.length === 0) {
      continue;
    }

    insertIntoTrie(root, parts);
    insertedCount += 1;
  }

  if (insertedCount === 0) {
    throw new Error('No valid swear word patterns were generated.');
  }

  const triePattern = serializeTrieNode(root);
  const combinedPattern = `${WORD_BOUNDARY_START}(?:${triePattern})${WORD_BOUNDARY_END}`;
  return new RegExp(combinedPattern, 'giu');
}

export function maskMatchedTerm(term: string): string {
  const chars = Array.from(term);
  if (chars.length <= 1) {
    return term;
  }

  return `${chars[0]}${MASK_CHAR.repeat(chars.length - 1)}`;
}

export function maskText(text: string, regex: RegExp): MaskResult {
  const matchedTerms: string[] = [];

  const maskedText = text.replace(regex, (match) => {
    matchedTerms.push(match);
    return maskMatchedTerm(match);
  });

  return {
    maskedText,
    matchCount: matchedTerms.length,
    matchedTerms,
  };
}

async function loadSwearWords(filePath: string): Promise<ReadonlyArray<string>> {
  const rawContent = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(rawContent) as SwearWordsFile | unknown[];

  if (Array.isArray(parsed)) {
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  }

  const candidate = parsed['swear-words'];
  if (!Array.isArray(candidate)) {
    throw new Error(`Invalid swear-words JSON structure in ${filePath}`);
  }

  return candidate.filter((entry): entry is string => typeof entry === 'string');
}

async function main(): Promise<void> {
  const startTime = performance.now();

  const swearWords = await loadSwearWords(DEFAULT_SWEAR_WORDS_PATH);
  const swearRegex = buildSwearWordsRegex(swearWords);

  await fs.mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });

  const directoryEntries = await fs.readdir(DEFAULT_INPUT_DIR, { withFileTypes: true });
  const lyricFiles = directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  let filesWithMatches = 0;
  let totalMatches = 0;

  for (const fileName of lyricFiles) {
    const inputPath = path.join(DEFAULT_INPUT_DIR, fileName);
    const outputPath = path.join(DEFAULT_OUTPUT_DIR, fileName);

    const content = await fs.readFile(inputPath, 'utf-8');
    const result = maskText(content, swearRegex);

    if (result.matchCount > 0) {
      filesWithMatches += 1;
      totalMatches += result.matchCount;
    }

    await fs.writeFile(outputPath, result.maskedText, 'utf-8');
  }

  const elapsedMs = Number((performance.now() - startTime).toFixed(2));
  const summary: ExecutionSummary = {
    language: 'TypeScript',
    swearWordsLoaded: swearWords.length,
    filesProcessed: lyricFiles.length,
    filesWithMatches,
    totalMatches,
    elapsedMs,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  await fs.writeFile(DEFAULT_SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');

  console.log('[TypeScript] Swear word masking completed.');
  console.log(`  Swear words loaded : ${summary.swearWordsLoaded}`);
  console.log(`  Files processed    : ${summary.filesProcessed}`);
  console.log(`  Files with matches : ${summary.filesWithMatches}`);
  console.log(`  Total matches      : ${summary.totalMatches}`);
  console.log(`  Elapsed time (ms)  : ${summary.elapsedMs}`);
  console.log(`  Output directory   : ${summary.outputDir}`);
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[TypeScript] Execution failed: ${message}`);
    process.exit(1);
  });
}
