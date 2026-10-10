import {SpotifyApiClient} from '../lib/spotify-api-client.js';

export class SpotifyAlbumService {
  private client = new SpotifyApiClient();
  
  public async getAlbumTracks(albumUrl: string) {
    const albumId = this.client.extractSpotifyId(albumUrl, 'album');
    if (!albumId) {
      throw new Error("URL de álbum do Spotify inválida.");
    }
    
    const tracks = await this.client.fetchAlbumTracks(albumId);
    if (tracks.length === 0) {
      throw new Error("A API não retornou as faixas do álbum.");
    }
    
    return tracks;
  }
}

async function main() {
  const albumUrl = process.argv[2];
  if (!albumUrl) {
    console.error("Uso: npx tsx scripts/spotify-album-service.ts <url-do-album>");
    process.exit(1);
  }
  
  try {
    const service = new SpotifyAlbumService();
    const tracks = await service.getAlbumTracks(albumUrl);
    
    for (const track of tracks) {
      console.log(`${track.title} - ${track.artists.join(", ")}`);
    }
  } catch (error) {
    console.error(`Erro: ${error}`);
    process.exit(1);
  }
}

import {fileURLToPath} from 'url';

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  main().then();
}
