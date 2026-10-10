import * as fs from 'fs/promises';
import * as path from 'path';
import {fileURLToPath} from 'url';
import {SpotifyApiClient} from '../lib/spotify-api-client.js';

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
  private client = new SpotifyApiClient();
  
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        const playlistUrls = list.source.filter(url => url.includes('/playlist/'));
        
        if (albumUrls.length > 0 || playlistUrls.length > 0) {
          console.log()
          console.log(`Processando lista "${list.id}"`);
          console.log(`Encontrados ${albumUrls.length} álbuns e ${playlistUrls.length} playlists. Iniciando download com delay de 10s...`);
          
          for (const url of albumUrls) {
            const albumId = this.client.extractSpotifyId(url, 'album');
            if (albumId) {
              console.log(`Buscando álbum ID: ${albumId}`);
              const tracks = await this.client.fetchAlbumTracks(albumId);
              pool.push(...tracks.map(t => ({title: t.title, artists: t.artists.join(", ")})));
              
              console.log(`Aguardando 10 segundos...`);
              await this.delay(10000);
            }
          }
          
          for (const url of playlistUrls) {
            const playlistId = this.client.extractSpotifyId(url, 'playlist');
            if (playlistId) {
              console.log(`Buscando playlist ID: ${playlistId}`);
              const tracks = await this.client.fetchPlaylistTracks(playlistId);
              pool.push(...tracks.map(t => ({title: t.title, artists: t.artists.join(", ")})));
              
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
