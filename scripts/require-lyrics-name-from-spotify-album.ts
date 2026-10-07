const spotifyAlbumUrl = process.argv[2];

if (!spotifyAlbumUrl) {
  console.error("Uso: node require-lyrics-name-from-spotify-album.ts <url-do-album>");
  process.exit(1);
}

function extractAlbumId(url: string) {
  try {
    const parsedUrl = new URL(url);
    
    if (parsedUrl.hostname !== "open.spotify.com") {
      throw new Error("A URL não é do Spotify.");
    }
    
    const [, type, id] = parsedUrl.pathname.split("/");
    
    if (type !== "album" || !id) {
      throw new Error("A URL precisa apontar para um álbum do Spotify.");
    }
    
    return id;
  } catch {
    throw new Error("URL de álbum do Spotify inválida.");
  }
}

async function getAlbumTracks(albumId: string) {
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
    title: track.title,
    artists: track.artist
      .split(",")
      .map((artist: string) => artist.trim())
  }));
}

async function main() {
  try {
    const albumId = extractAlbumId(spotifyAlbumUrl);
    const tracks = await getAlbumTracks(albumId);
    
    for (const track of tracks) {
      console.log(`${track.title} — ${track.artists.join(", ")}`);
    }
  } catch (error) {
    console.error(`Erro: ${error}`);
    process.exit(1);
  }
}

main().then();
