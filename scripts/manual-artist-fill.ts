import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

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

async function main() {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lyrics-list');
  const files = await fs.readdir(dir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  let totalPending = 0;
  
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
    
    let fileUpdated = false;

    for (const list of data) {
      if (list.complete) continue;
      if (!list.lyrics || !Array.isArray(list.lyrics)) continue;

      for (const lyric of list.lyrics) {
        if (lyric.complete) continue;
        
        if (!lyric.artists || lyric.artists.trim() === "") {
          currentCount++;
          console.log(`[${currentCount}/${totalPending}] Arquivo: ${file} | Lista: ${list.id}`);
          console.log(`Faixa: ${lyric.name}`);
          
          const answer = await question(`Artistas (Enter para pular | :q para salvar e sair): `);
          
          if (answer.trim() === ':q') {
            if (fileUpdated) {
              await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
              console.info(`Alteracoes salvas no arquivo: ${file}`);
            }
            rl.close();
            console.info("Processo interrompido pelo usuario. Saindo.");
            return;
          }

          if (answer.trim() !== "") {
            lyric.artists = answer.trim();
            fileUpdated = true;
          }
          console.log("");
        }
      }
    }

    if (fileUpdated) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.info(`Arquivo salvo: ${file}\n`);
    }
  }

  rl.close();
  console.info("Processo finalizado.");
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCLI) {
  main().catch(console.error);
}
