import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LyricItem {
  id: number | string;
  name: string;
}

interface LyricsListFile {
  id: string;
  source: string[];
  lyrics: LyricItem[];
}

export class LyricsIdUpdaterService {
  private currentId: number;

  constructor(startId: number) {
    this.currentId = startId;
  }

  public async updateIdsInDirectory(directoryPath: string): Promise<void> {
    try {
      const files = await fs.readdir(directoryPath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(directoryPath, file);
        await this.updateIdsInFile(filePath);
      }
      
      console.log(`Todos os arquivos foram atualizados. Próximo ID livre: ${this.currentId}`);
    } catch (error) {
      console.error(`Erro ao atualizar diretório: ${error}`);
    }
  }

  public async updateIdsInFile(filePath: string): Promise<void> {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data: LyricsListFile[] = JSON.parse(fileContent);

      let updatedCount = 0;

      for (const list of data) {
        if (!list.lyrics || !Array.isArray(list.lyrics)) continue;

        for (const lyric of list.lyrics) {
          lyric.id = this.currentId++;
          updatedCount++;
        }
      }

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Atualizado ${filePath} (${updatedCount} itens)`);
    } catch (error) {
      console.error(`Erro ao atualizar arquivo ${filePath}: ${error}`);
    }
  }
}

async function main() {
  const startIdArg = process.argv[2];
  const startId = startIdArg ? parseInt(startIdArg, 10) : 98001;

  if (isNaN(startId)) {
    console.error("Erro: O ID inicial fornecido não é um número válido.");
    process.exit(1);
  }

  const directoryPath = path.resolve(__dirname, '../lyrics-list');
  const service = new LyricsIdUpdaterService(startId);
  
  await service.updateIdsInDirectory(directoryPath);
}

const isCLI = typeof process !== 'undefined' && process.argv && process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCLI) {
  main();
}
