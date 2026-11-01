import fs from "node:fs";
import path from "node:path";

const directory = process.argv[2];

if (!directory || !fs.existsSync(directory)) {
  console.error("Informe um diretório válido.");
  process.exit(1);
}

let totalFiles = 0;
let totalLines = 0;
// let totalCharacters = 0;

function scanDirectory(currentPath: string): void {
  const entries = fs.readdirSync(currentPath, {
    withFileTypes: true,
  });
  
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }
    
    if (!entry.isFile()) continue;
    
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      
      // Ignora arquivos com conteúdo binário
      if (content.includes("\u0000")) continue;
      
      const lines = content.split(/\r\n|\r|\n/);
      
      totalFiles++;
      totalLines += lines.filter(line => line.trim().length > 0).length;
      // totalCharacters += content.replace(/\s/g, "").length;
      
    } catch (error) {
      console.warn(`Erro ao ler: ${fullPath}`);
    }
  }
}

scanDirectory(directory);

console.log("Resultado");
console.log(`Arquivos analisados: ${totalFiles.toLocaleString()}`);
console.log(`Linhas com conteúdo: ${totalLines.toLocaleString()}`);
// console.log(`Caracteres (sem espaços): ${totalCharacters}`);
