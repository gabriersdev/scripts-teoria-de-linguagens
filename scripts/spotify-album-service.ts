export interface SpotifyTrack {
  title: string;
  artists: string[];
}

export class SpotifyAlbumService {
  #extractAlbumId(url: string): string {
    try {
      const parsedUrl = new URL(url);
      
      if (parsedUrl.hostname !== "open.spotify.com") {
        throw new Error("A URL não é do Spotify.");
      }
      
      const parts = parsedUrl.pathname.split("/");
      const albumIndex = parts.indexOf("album");
      
      if (albumIndex === -1 || albumIndex === parts.length - 1) {
        throw new Error("A URL precisa apontar para um álbum do Spotify.");
      }
      
      return parts[albumIndex + 1];
    } catch {
      throw new Error("URL de álbum do Spotify inválida.");
    }
  }
  
  public async getAlbumTracks(albumUrl: string): Promise<SpotifyTrack[]> {
    const albumId = this.#extractAlbumId(albumUrl);
    
    const response = await fetch(
      `https://spotify.xwolf.space/api/album/${albumId}`
    );
    
    if (!response.ok) {
      throw new Error(
        `Erro na API: ${response.status} ${response.statusText}`
      );
    }
    
    const data = await response.json();
    
    if (!data.success || !data.album?.tracks) {
      throw new Error("A API não retornou as faixas do álbum.");
    }
    
    return data.album.tracks.map((track: { title: string, artist: string }) => ({
      title: track.title.trim(),
      artists: track.artist
        .split(",")
        .map((artist: string) => artist.trim())
    }));
  }
}
