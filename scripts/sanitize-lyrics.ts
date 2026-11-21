/**
 * Utilitario de higienizacao e purificacao do corpus de letras (/lyrics-data/lyrics).
 *
 * Varre todos os arquivos de letras (.txt), detecta marcadores de sincronia e timestamps
 * (ex.: <00:08.880>, [01:23.45], [ar:...]) originados de letras sincronizadas (LRC)
 * e regrava os arquivos purificados sem contaminacao numerica ou temporal.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeLyrics } from './text-sanitizer.js';

export interface SanitizeItemDetail {
  fileName: string;
  tagsRemoved: number;
}

export interface SanitizeCorpusReport {
  totalFiles: number;
  sanitizedFilesCount: number;
  totalTagsRemoved: number;
  details: SanitizeItemDetail[];
}

export interface SanitizeOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

const TIMESTAMP_REGEX = /<\d{1,2}:\d{2}(?:\.\d{1,3})?>|\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]|\[(?:ti|ar|al|by|offset|length|re|ve):[^\]]*\]/gi;

export async function sanitizeCorpus(options: SanitizeOptions = {}): Promise<SanitizeCorpusReport> {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const lyricsDir = path.resolve(baseDir, '../lyrics-data/lyrics');

  const files = (await fs.readdir(lyricsDir))
    .filter(file => file.endsWith('.txt'))
    .sort();

  const details: SanitizeItemDetail[] = [];
  let totalTagsRemoved = 0;

  for (const file of files) {
    const filePath = path.join(lyricsDir, file);
    const content = await fs.readFile(filePath, 'utf-8');

    const matches = content.match(TIMESTAMP_REGEX);
    if (!matches || matches.length === 0) {
      continue;
    }

    const tagsCount = matches.length;
    totalTagsRemoved += tagsCount;
    details.push({
      fileName: file,
      tagsRemoved: tagsCount
    });

    const cleanContent = sanitizeLyrics(content);

    if (!options.dryRun) {
      await fs.writeFile(filePath, cleanContent, 'utf-8');
    }
  }

  return {
    totalFiles: files.length,
    sanitizedFilesCount: details.length,
    totalTagsRemoved,
    details
  };
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const verbose = args.includes('--verbose') || args.includes('-v');

  console.info();
  console.info(`Higienizacao de Marcadores de Tempo no Corpus de Letras ${dryRun ? '(MODO SIMULACAO --dry-run)' : ''}`);
  console.info('-----------------------------------------------------------------------------');

  sanitizeCorpus({ dryRun, verbose })
    .then(report => {
      console.info(`Total de arquivos analisados:        ${report.totalFiles}`);
      console.info(`Arquivos com marcadores de tempo:    ${report.sanitizedFilesCount}`);
      console.info(`Total de tags de tempo expurgadas:   ${report.totalTagsRemoved}`);
      console.info();

      if (report.details.length > 0) {
        console.info('Arquivos Processados:');
        for (const item of report.details) {
          console.info(`  - ${item.fileName}: ${item.tagsRemoved} marcador(es) removido(s)`);
        }
        console.info();
        if (dryRun) {
          console.info('Simulacao concluida. Nenhum arquivo foi modificado em disco.');
        } else {
          console.info('Higienizacao concluida com sucesso em disco.');
        }
      } else {
        console.info('Nenhum arquivo no corpus contem marcadores de tempo residuais.');
      }
      console.info();
    })
    .catch(err => {
      console.error(`Erro ao executar higienizacao: ${err.message}`);
      process.exit(1);
    });
}
