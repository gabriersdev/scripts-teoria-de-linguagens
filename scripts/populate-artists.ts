import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';

interface LyricItem {
  id: number | string;
  name: string;
  artists?: string;
  complete?: boolean;
}

interface LyricsListFile {
  complete: boolean;
  id: string;
  source: string[];
  lyrics: LyricItem[];
}

export class PopulateArtistsService {
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private extractAlbumId(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname !== "open.spotify.com") return null;
      const parts = parsedUrl.pathname.split("/");
      const albumIndex = parts.indexOf("album");
      if (albumIndex === -1 || albumIndex === parts.length - 1) return null;
      return parts[albumIndex + 1];
    } catch {
      return null;
    }
  }
  
  private async fetchAlbumTracks(albumId: string): Promise<{ title: string, artists: string }[]> {
    try {
      const response = await fetch(`https://spotify.xwolf.space/api/album/${albumId}`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.success || !data.album?.tracks) return [];
      
      return data.album.tracks.map((track: any) => ({
        title: track.title.trim(),
        artists: track.artist.split(",").map((a: string) => a.trim()).join(", ")
      }));
    } catch (e) {
      console.error(`Falha ao buscar álbum ${albumId}:`, e);
      return [];
    }
  }
  
  public async run(directoryPath: string) {
    const files = await fs.readdir(directoryPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    for (const file of jsonFiles) {
      const filePath = path.join(directoryPath, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(fileContent);
      
      let fileUpdated = false;
      
      for (const list of data) {
        // Ignora a lista inteira se o atributo complete for true
        if (list.complete) continue;
        
        if (!list.lyrics || !Array.isArray(list.lyrics)) continue;
        
        // Verifica se há faixas que precisam de processamento (não completas e sem artista preenchido)
        const hasIncomplete = list.lyrics.some(lyric => lyric.complete !== true && (!lyric.artists || lyric.artists.trim() === ""));
        if (!hasIncomplete) continue;
        
        const pool: { title: string, artists: string }[] = [];
        const albumUrls = list.source.filter(url => url.includes('/album/'));
        
        if (albumUrls.length > 0) {
          console.log()
          console.log(`Processando lista "${list.id}"`);
          console.log(`Encontrados ${albumUrls.length} links de álbuns. Iniciando download com delay de 10s...`);
          
          for (const url of albumUrls) {
            const albumId = this.extractAlbumId(url);
            if (albumId) {
              console.log(`Buscando álbum ID: ${albumId}`);
              const tracks = await this.fetchAlbumTracks(albumId);
              pool.push(...tracks);
              
              console.log(`Aguardando 10 segundos...`);
              await this.delay(10000);
            }
          }
        }
        
        // Processo de Correspondência (Matching exato e ignorando cases)
        let matchedCount = 0;
        let unmatchedCount = 0;
        
        for (const lyric of list.lyrics) {
          if (lyric.complete === true) continue;
          
          // Só processa se o artista ainda não foi criado/preenchido no JSON
          if (!lyric.artists || lyric.artists.trim() === "") {
            const match = pool.find(p => p.title.toLowerCase() === lyric.name.trim().toLowerCase());
            
            if (match) {
              lyric.artists = match.artists;
              matchedCount++;
            } else {
              lyric.artists = "";
              unmatchedCount++;
            }
          }
        }
        
        console.log(`Lista "${list.id}" - ${matchedCount} correspondências preenchidas. ${unmatchedCount} ficaram em branco.`);
        fileUpdated = true;
      }
      
      if (fileUpdated) {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`Arquivo salvo com sucesso: ${file}`);
      }
    }
    
    console.log();
    console.log(`Processo finalizado.`);
  }
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  import('path').then(path => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lyrics-list');
    const service = new PopulateArtistsService();
    service.run(dir).then();
  });
}
