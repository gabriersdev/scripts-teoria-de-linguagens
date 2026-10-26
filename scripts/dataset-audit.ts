import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';

interface LyricItem {
  id: number | string;
  name: string;
  artists?: string;
  complete?: boolean | number;
}

interface LyricsListGroup {
  complete: boolean;
  id: string;
  source: string[];
  lyrics: LyricItem[];
}

interface GenreStats {
  genre: string;
  total: number;
  both: number;
  metaOnly: number;
  lyricsOnly: number;
  neither: number;
  noArtist: number;
}

interface AuditSummary {
  total: number;
  both: number;
  metaOnly: number;
  lyricsOnly: number;
  neither: number;
  noArtist: number;
  genres: GenreStats[];
}

export class DatasetAudit {
  private listDir: string;
  private dataDir: string;
  private lyricsDir: string;
  private metadataDir: string;
  
  constructor() {
    const baseDir = path.dirname(fileURLToPath(import.meta.url));
    this.listDir = path.resolve(baseDir, '../lyrics-list');
    this.dataDir = path.resolve(baseDir, '../lyrics-data');
    this.lyricsDir = path.join(this.dataDir, 'lyrics');
    this.metadataDir = path.join(this.dataDir, 'metadata');
  }
  
  private async fileExistsAndNonEmpty(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  }
  
  public async run(options: { genreFilter?: string; syncFlags?: boolean } = {}): Promise<AuditSummary> {
    const files = await fs.readdir(this.listDir);
    let jsonFiles = files.filter(f => f.endsWith('.json')).sort();
    
    if (options.genreFilter) {
      const filter = options.genreFilter.toLowerCase();
      jsonFiles = jsonFiles.filter(f => f.toLowerCase().includes(filter));
      if (jsonFiles.length === 0) {
        console.error(`Nenhuma lista encontrada para o filtro: "${options.genreFilter}".`);
        return {
          total: 0,
          both: 0,
          metaOnly: 0,
          lyricsOnly: 0,
          neither: 0,
          noArtist: 0,
          genres: []
        };
      }
    }
    
    const summary: AuditSummary = {
      total: 0,
      both: 0,
      metaOnly: 0,
      lyricsOnly: 0,
      neither: 0,
      noArtist: 0,
      genres: []
    };
    
    for (const file of jsonFiles) {
      const genre = file.replace('-list.json', '').replace('.json', '');
      const filePath = path.join(this.listDir, file);
      const raw = await fs.readFile(filePath, 'utf-8');
      const groups: LyricsListGroup[] = JSON.parse(raw);
      
      const genreStat: GenreStats = {
        genre,
        total: 0,
        both: 0,
        metaOnly: 0,
        lyricsOnly: 0,
        neither: 0,
        noArtist: 0
      };
      
      let listMutated = false;
      
      for (const group of groups) {
        if (!group.lyrics || !Array.isArray(group.lyrics)) continue;
        
        for (const item of group.lyrics) {
          if (!item.name) continue;
          
          genreStat.total++;
          summary.total++;
          
          const idStr = String(item.id);
          const hasMetadata = await this.fileExistsAndNonEmpty(path.join(this.metadataDir, `${idStr}.json`));
          const hasLyrics = await this.fileExistsAndNonEmpty(path.join(this.lyricsDir, `${idStr}.txt`));
          const hasArtist = Boolean(item.artists && item.artists.trim().length > 0);
          
          if (!hasArtist) {
            genreStat.noArtist++;
            summary.noArtist++;
          }
          
          if (hasMetadata && hasLyrics) {
            genreStat.both++;
            summary.both++;
            if (options.syncFlags && item.complete !== true) {
              item.complete = true;
              listMutated = true;
            }
          } else if (hasMetadata && !hasLyrics) {
            genreStat.metaOnly++;
            summary.metaOnly++;
            if (options.syncFlags && item.complete !== 1) {
              item.complete = 1;
              listMutated = true;
            }
          } else if (!hasMetadata && hasLyrics) {
            genreStat.lyricsOnly++;
            summary.lyricsOnly++;
            if (options.syncFlags && item.complete !== false) {
              item.complete = false;
              listMutated = true;
            }
          } else {
            genreStat.neither++;
            summary.neither++;
            if (options.syncFlags && item.complete !== false) {
              item.complete = false;
              listMutated = true;
            }
          }
        }
      }
      
      if (options.syncFlags && listMutated) {
        await fs.writeFile(filePath, JSON.stringify(groups, null, 2), 'utf-8');
      }
      
      summary.genres.push(genreStat);
    }
    
    this.printCleanReport(summary, options.syncFlags);
    return summary;
  }
  
  private printCleanReport(summary: AuditSummary, wasSynced?: boolean): void {
    if (summary.total === 0) return;
    
    const calcPercent = (val: number, total: number) => {
      if (total === 0) return '0.0%';
      return `${((val / total) * 100).toFixed(1)}%`;
    };
    
    console.info();
    console.info(`Auditoria de Integridade do Corpus Musical (${summary.total} faixas analisadas)`);
    console.info();
    console.info(`Resumo Geral:`);
    console.info(`  Completo (Metadados e Letra):        ${summary.both.toString().padStart(5)} (${calcPercent(summary.both, summary.total)})`);
    console.info(`  Apenas Metadados (Falta Letra):      ${summary.metaOnly.toString().padStart(5)} (${calcPercent(summary.metaOnly, summary.total)})`);
    console.info(`  Apenas Letra (Falta Metadados):      ${summary.lyricsOnly.toString().padStart(5)} (${calcPercent(summary.lyricsOnly, summary.total)})`);
    console.info(`  Nenhum Dado Extraido:                ${summary.neither.toString().padStart(5)} (${calcPercent(summary.neither, summary.total)})`);
    console.info(`  Sem Artista Cadastrado:              ${summary.noArtist.toString().padStart(5)} (${calcPercent(summary.noArtist, summary.total)})`);
    console.info();
    
    console.info('Detalhamento por Genero:');
    console.info('  Genero          Total    100%    So Meta    So Letra    Nenhum    Concluido');
    console.info('  ---------------------------------------------------------------------------');
    
    for (const g of summary.genres) {
      const genreLabel = g.genre.padEnd(14);
      const totalStr = g.total.toString().padStart(6);
      const bothStr = g.both.toString().padStart(7);
      const metaStr = g.metaOnly.toString().padStart(10);
      const lyricsStr = g.lyricsOnly.toString().padStart(11);
      const neitherStr = g.neither.toString().padStart(9);
      const pctStr = calcPercent(g.both, g.total).padStart(12);
      
      console.info(`  ${genreLabel} ${totalStr} ${bothStr} ${metaStr} ${lyricsStr} ${neitherStr} ${pctStr}`);
    }
    
    console.info('  ---------------------------------------------------------------------------');
    const totalLabel = 'Total'.padEnd(14);
    const sumTotalStr = summary.total.toString().padStart(6);
    const sumBothStr = summary.both.toString().padStart(7);
    const sumMetaStr = summary.metaOnly.toString().padStart(10);
    const sumLyricsStr = summary.lyricsOnly.toString().padStart(11);
    const sumNeitherStr = summary.neither.toString().padStart(9);
    const sumPctStr = calcPercent(summary.both, summary.total).padStart(12);
    
    console.info(`  ${totalLabel} ${sumTotalStr} ${sumBothStr} ${sumMetaStr} ${sumLyricsStr} ${sumNeitherStr} ${sumPctStr}`);
    console.info();
    
    if (wasSynced) {
      console.info("Sincronizacao concluida: flags 'complete' atualizadas nas listas JSON de acordo com o disco.");
      console.info();
    }
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const args = process.argv.slice(2);
  const syncFlags = args.includes('--sync');
  const genreArg = args.find(a => !a.startsWith('--'));
  
  const auditor = new DatasetAudit();
  auditor.run({genreFilter: genreArg, syncFlags}).catch(console.error);
}
