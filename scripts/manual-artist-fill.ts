import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query: string): Promise<string> => {
  return new Promise(resolve => rl.question(query, resolve));
};

async function fetchSuggestions(trackName: string): Promise<string[]> {
  try {
    // Utiliza a API do iTunes por ser extremamente rapida, confiavel e nao requerer API Key
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trackName)}&entity=song&limit=4`;
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.results) return [];
    
    // Utiliza Set para garantir que os artistas sugeridos sejam unicos (evita repeticao)
    const artists = new Set<string>();
    for (const res of data.results) {
      if (res.artistName) artists.add(res.artistName);
    }
    
    return Array.from(artists);
  } catch {
    return [];
  }
}

async function main() {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lyrics-list');
  const files = await fs.readdir(dir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  let totalPending = 0;
  
  // Pre-processamento: Contagem
  for (const file of jsonFiles) {
    const filePath = path.join(dir, file);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data: LyricsListFile[] = JSON.parse(fileContent);
    
    for (const list of data) {
      if (list.complete) continue;
      if (!list.lyrics || !Array.isArray(list.lyrics)) continue;
      
      for (const lyric of list.lyrics) {
        if (lyric.complete) continue;
        if (!lyric.artists || lyric.artists.trim() === "") {
          totalPending++;
        }
      }
    }
  }
  
  console.info("Assistente de preenchimento manual iniciado.");
  console.info(`Faixas pendentes de artistas: ${totalPending}\n`);
  
  if (totalPending === 0) {
    rl.close();
    console.info("Nenhuma faixa pendente encontrada. Processo finalizado.");
    return;
  }
  
  let currentCount = 0;
  
  for (const file of jsonFiles) {
    const filePath = path.join(dir, file);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data: LyricsListFile[] = JSON.parse(fileContent);
    
    for (const list of data) {
      if (list.complete) continue;
      if (!list.lyrics || !Array.isArray(list.lyrics)) continue;
      
      for (const lyric of list.lyrics) {
        if (lyric.complete) continue;
        
        if (!lyric.artists || lyric.artists.trim() === "") {
          currentCount++;
          console.log(`\n[${currentCount}/${totalPending}] Arquivo: ${file} | Lista: ${list.id}`);
          console.log(`Faixa: ${lyric.name}`);
          
          console.info("Buscando sugestoes...");
          const suggestions = await fetchSuggestions(lyric.name);
          
          if (suggestions.length > 0) {
            console.log("Sugestoes encontradas:");
            suggestions.forEach((s, idx) => {
              console.log(`  ${idx + 1}. ${s}`);
            });
          } else {
            console.log("Nenhuma sugestao automatica encontrada para essa faixa.");
          }
          
          const prompt = suggestions.length > 0
            ? `Artistas (1-${suggestions.length} para escolher | Texto para digitar | Enter para pular | :q sair): `
            : `Artistas (Texto para digitar | Enter para pular | :q sair): `;
          
          const answer = await question(prompt);
          
          if (answer.trim() === ':q') {
            rl.close();
            console.info("Processo interrompido pelo usuario. Saindo.");
            return;
          }
          
          if (answer.trim() !== "") {
            const num = parseInt(answer.trim(), 10);
            
            // Verifica se o usuario digitou um numero e se ele eh valido nas sugestoes
            if (!isNaN(num) && num >= 1 && num <= suggestions.length) {
              lyric.artists = suggestions[num - 1];
            } else {
              // Se nao for numero valido, assume que ele digitou o texto na mao
              lyric.artists = answer.trim();
            }
            
            // SALVAMENTO A QUENTE (Garante persistencia imediata apos resposta)
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.info("Arquivo atualizado a quente.");
          }
        }
      }
    }
  }
  
  rl.close();
  console.log();
  console.info("Processo finalizado.");
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  main().catch(console.error);
}
