import 'dotenv/config';

const accessToken = process.env.GENIUS_ACCESS_TOKEN;

if (!accessToken) {
  console.error("Erro: GENIUS_ACCESS_TOKEN nao configurado no arquivo .env");
  process.exit(1);
}

const query = process.argv.slice(2).join(" ");

if (!query) {
  console.error('Uso: node request-genius.js "PUCA - Ark King"');
  process.exit(1);
}

const url = new URL("https://api.genius.com/search");
url.searchParams.set("q", query);

try {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  const data = await response.json();
  
  const songs = data.response.hits.map(({ result }) => ({
    id: result.id,
    title: result.title,
    artist: result.primary_artist.name,
    album: result.album?.name ?? null,
    releaseDate: result.release_date_for_display ?? null,
    url: result.url,
    thumbnail: result.song_art_image_thumbnail_url,
  }));
  
  console.log(JSON.stringify(songs, null, 2));
} catch (error) {
  console.error("Erro:", error.message);
}
