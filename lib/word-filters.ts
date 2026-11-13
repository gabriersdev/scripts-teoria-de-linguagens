/**
 * Reusable lexical utilities for Portuguese lyric tokenization, accent normalization,
 * and word-list loading from JSON files (lib/ignore-words.json and lib/swear-words.json).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';

export const DEFAULT_MIN_WORD_LENGTH = 2;

export interface TokenizeOptions {
  stripSectionTags?: boolean;
  normalizeAccents?: boolean;
  minLength?: number;
}

export function normalizeAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeWordToken(word: string, shouldNormalizeAccents = false): string {
  const lowered = word.trim().toLowerCase().replace(/’/g, "'");
  return shouldNormalizeAccents ? normalizeAccents(lowered) : lowered;
}

export function buildWordSet(words: Iterable<string>, shouldNormalizeAccents = false): Set<string> {
  const result = new Set<string>();

  for (const word of words) {
    const normalized = normalizeWordToken(word, shouldNormalizeAccents);
    if (normalized) {
      result.add(normalized);
    }
  }

  return result;
}

async function loadWordListFromJson(
  defaultFileName: string,
  jsonKey: string,
  customPath?: string,
  shouldNormalizeAccents = false
): Promise<Set<string>> {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const resolvedPath = customPath ?? path.resolve(baseDir, defaultFileName);

  let rawContent: string;
  try {
    rawContent = await fs.readFile(resolvedPath, 'utf-8');
  } catch (error) {
    if (customPath) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Nao foi possivel ler arquivo de termos em ${resolvedPath}: ${message}`);
    }
    return new Set<string>();
  }

  const parsed = JSON.parse(rawContent) as unknown;
  let rawList: unknown[] = [];

  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const candidate = (parsed as Record<string, unknown>)[jsonKey];
    if (Array.isArray(candidate)) {
      rawList = candidate;
    }
  }

  const wordList = rawList.filter((entry): entry is string => typeof entry === 'string');
  return buildWordSet(wordList, shouldNormalizeAccents);
}

export async function loadIgnoreWords(
  customPath?: string,
  shouldNormalizeAccents = false
): Promise<Set<string>> {
  return loadWordListFromJson('ignore-words.json', 'ignore-words', customPath, shouldNormalizeAccents);
}

export async function loadSwearWords(
  customPath?: string,
  shouldNormalizeAccents = false
): Promise<Set<string>> {
  return loadWordListFromJson('swear-words.json', 'swear-words', customPath, shouldNormalizeAccents);
}

export function tokenizeLyricWords(text: string, options: TokenizeOptions = {}): string[] {
  if (!text) {
    return [];
  }

  const stripSectionTags = options.stripSectionTags ?? true;
  const shouldNormalizeAccents = options.normalizeAccents ?? false;
  const minLength = options.minLength ?? DEFAULT_MIN_WORD_LENGTH;

  const cleanedText = stripSectionTags ? text.replace(/\[[^\]]*\]/g, ' ') : text;
  const rawMatches = cleanedText.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];

  return rawMatches
    .map((token) => normalizeWordToken(token, shouldNormalizeAccents))
    .filter((token) => token.length >= minLength && /\p{L}/u.test(token));
}
