export interface SpotifyTrack {
  title: string;
  artists: string[];
}

export class SpotifyApiClient {
  public extractSpotifyId(url: string, type: 'album' | 'playlist'): string | null {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname !== "open.spotify.com") return null;
      const parts = parsedUrl.pathname.split("/");
      const typeIndex = parts.indexOf(type);
      if (typeIndex === -1 || typeIndex === parts.length - 1) return null;
      return parts[typeIndex + 1];
    } catch {
      return null;
    }
  }

  public async fetchAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
    try {
      const response = await fetch(`https://spotify.xwolf.space/api/album/${albumId}`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.success || !data.album?.tracks) return [];
      
      return data.album.tracks.map((track: any) => ({
        title: track.title.trim(),
        artists: track.artist.split(",").map((a: string) => a.trim())
      }));
    } catch (e) {
      console.error(`Falha ao buscar álbum ${albumId}:`, e);
      return [];
    }
  }

  public async fetchPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    try {
      const response = await fetch(`https://spotify.xwolf.space/api/playlist/${playlistId}`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.success || !data.playlist?.tracks) return [];
      
      return data.playlist.tracks.map((track: any) => ({
        title: track.title.trim(),
        artists: track.artist.split(",").map((a: string) => a.trim())
      }));
    } catch (e) {
      console.error(`Falha ao buscar playlist ${playlistId}:`, e);
      return [];
    }
  }
}
