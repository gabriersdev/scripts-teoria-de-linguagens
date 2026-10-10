import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {TrackMetadataService} from './track-metadata-service.js';
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

export class PipelineExtractor {
  private metadataService = new TrackMetadataService();
  private lyricsService = new LyricsService();
  
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  public async run() {
    const listDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lyrics-list');
    const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lyrics-data');
    const lyricsDataDir = path.join(dataDir, 'lyrics');
    
    await fs.mkdir(dataDir, {recursive: true});
    await fs.mkdir(lyricsDataDir, {recursive: true});
    
    const files = await fs.readdir(listDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.info("Orquestrador de extracao (Pipeline) iniciado.");
    
    let totalPendingFull = 0;
    let totalPendingPartial = 0;
    
    for (const file of jsonFiles) {
      const filePath = path.join(listDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(fileContent);
      
      for (const list of data) {
        if (!list.lyrics || !Array.isArray(list.lyrics)) continue;
        
        for (const lyric of list.lyrics) {
          if (lyric.complete === true) continue;
          
          if (lyric.complete === 1) totalPendingPartial++;
          else totalPendingFull++;
        }
      }
    }
    
    const totalToProcess = totalPendingFull + totalPendingPartial;
    console.info(`Faixas a processar: ${totalToProcess} (${totalPendingFull} totais, ${totalPendingPartial} parciais).`);
    
    if (totalToProcess === 0) {
      console.info("Nenhuma faixa pendente. Processo finalizado.");
      return;
    }
    
    let processedCount = 0;
    
    for (const file of jsonFiles) {
      const filePath = path.join(listDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(fileContent);
      
      let fileUpdated = false;
      
      for (const list of data) {
        if (!list.lyrics || !Array.isArray(list.lyrics)) continue;
        
        for (const lyric of list.lyrics) {
          if (lyric.complete === true) continue;
          
          processedCount++;
          const isPartial = (lyric.complete === 1);
          const processingType = isPartial ? "PARCIAL" : "TOTAL";
          
          console.log();
          console.log(`[${processedCount}/${totalToProcess}] Extracao ${processingType}: ${lyric.name} - ${lyric.artists || "Desconhecido"}`);
          
          let metadataSuccess = false;
          let lyricsSuccess = false;
          
          if (!isPartial) {
            const metadata = await this.metadataService.fetchMetadata(lyric.name, lyric.artists);
            
            if (metadata.isrc || metadata.durationMs) {
              metadataSuccess = true;
              console.info(`Metadados encontrados.`);
              
              const trackId = lyric.id.toString();
              const jsonOutput = [
                {
                  id: lyric.id,
                  metadata: metadata,
                  lyricPath: `/lyrics/${trackId}.txt`
                }
              ];
              
              await fs.writeFile(path.join(dataDir, `${trackId}.json`), JSON.stringify(jsonOutput, null, 2), 'utf-8');
            }
            
            //
            else console.warn(`Metadados insuficientes.`);
            
            //
          } else {
            metadataSuccess = true;
            console.info(`Metadados ja existentes (Pulado).`);
          }
          
          const lyricsResult = await this.lyricsService.getLyrics(lyric.name, lyric.artists || "");
          
          if (lyricsResult && lyricsResult.lyrics) {
            lyricsSuccess = true;
            console.info(`Letra encontrada (${lyricsResult.source}).`);
            const trackId = lyric.id.toString();
            await fs.writeFile(path.join(lyricsDataDir, `${trackId}.txt`), lyricsResult.lyrics, 'utf-8');
          }
          
          //
          else console.warn(`Letra nao encontrada.`);
          
          if (metadataSuccess && lyricsSuccess) lyric.complete = true;
          else if (metadataSuccess && !lyricsSuccess) lyric.complete = 1;
          else lyric.complete = false;
          
          fileUpdated = true;
          
          await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
          console.info(`Status atualizado (complete: ${lyric.complete}).`);
          
          await this.delay(2000);
        }
      }
    }
    
    console.info();
    console.info(`Pipeline finalizado. Faixas processadas: ${processedCount}.`);
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  const pipeline = new PipelineExtractor();
  pipeline.run().catch(console.error);
}
