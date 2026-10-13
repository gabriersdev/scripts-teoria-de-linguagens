import {SpotifyApiClient} from '../lib/spotify-api-client.js';

export class SpotifyPlaylistService {
  private client = new SpotifyApiClient();
  
  public async getPlaylistTracks(playlistUrl: string) {
    const playlistId = this.client.extractSpotifyId(playlistUrl, 'playlist');
    if (!playlistId) {
      throw new Error("URL de playlist do Spotify inválida.");
    }
    
    const tracks = await this.client.fetchPlaylistTracks(playlistId);
    if (tracks.length === 0) {
      throw new Error("A API não retornou as faixas da playlist.");
    }
    
    return tracks;
  }
}

async function main() {
  const playlistUrl = process.argv[2];
  if (!playlistUrl) {
    console.error("Uso: npx tsx scripts/spotify-playlist-service.ts <url-da-playlist>");
    process.exit(1);
  }
  
  try {
    const service = new SpotifyPlaylistService();
    const tracks = await service.getPlaylistTracks(playlistUrl);
    
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
