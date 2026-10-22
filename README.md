# Scripts para Teoria de Linguagens

Repositório destinado à mineração, tratamento, curadoria e análise de dados (letras, metadados musicais e ISRC) para uso integrado em pesquisas de teoria de linguagens.

---

## 📚 Documentação do Projeto

O repositório é orientado por regras de negócio rígidas e contratos de dados estáticos para garantir reprodutibilidade sem dependência de planos pagos de APIs. Toda a documentação técnica reside em `/docs`:

- [**Esquema de Dados e Atributos (`docs/DATA-SCHEMA.md`)**](docs/DATA-SCHEMA.md): Especificação completa dos atributos de listas (`/lyrics-list`), faixas musicais, ciclo de vida da flag `complete` e metadados gerados (`/lyrics-data`).
- [**Arquitetura e Diretórios (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md): Organização do ecossistema de pastas (`/lib`, `/scripts`, `/lyrics-list`, `/lyrics-data`) e fluxo do pipeline de dados.
- [**Regras de Negócio (`docs/BUSINESS-RULES.md`)**](docs/BUSINESS-RULES.md): Critérios de integridade, token masking de nomes com vírgula, fallback em cascata, rate limits e semântica de flags.
- [**Diretrizes de Código (`docs/CODING-GUIDELINES-JS.md`)**](docs/CODING-GUIDELINES-JS.md): Padrões de código para TypeScript/JavaScript (nomenclatura, funções puras, ES Modules e formatação).
- [**Regras de Commit (`docs/COMMIT-RULES.md`)**](docs/COMMIT-RULES.md): Padrões e prefixos de mensagens para commits no Git.
- [**Changelog do Projeto (`docs/CHANGELOG.md`)**](docs/CHANGELOG.md): Histórico de entregas, refatorações e adições de features.

---

## 🚀 Como Instalar o Node.js e Executar o Projeto

Para executar os scripts em TypeScript (`.ts`) deste repositório, é necessário ter o ambiente de execução **Node.js** instalado no computador.

### Passo 1: Download e Instalação do Node.js (Windows)

#### Opção A: Pelo Instalador Oficial (Recomendado)
1. Acesse o site oficial do Node.js: [https://nodejs.org/pt-br/download](https://nodejs.org/pt-br/download).
2. Baixe a versão marcada como **LTS (Long Term Support)** para Windows (instalador `.msi` 64-bit).
3. Execute o arquivo `.msi` baixado.
4. Na tela de instalação, avance clicando em **Next**, aceite os termos de licença e mantenha os caminhos padrão.
5. Na etapa de seleção de recursos, certifique-se de que a opção **"Add to PATH"** esteja selecionada (ativada por padrão).
6. Conclua a instalação clicando em **Install** e depois em **Finish**.

#### Opção B: Pelo Windows Terminal (Winget)
Se preferir instalar via linha de comando, abra o PowerShell e execute:
```powershell
winget install OpenJS.NodeJS.LTS
```

---

### Passo 2: Verificar a Instalação

Abra uma nova janela do terminal (PowerShell, CMD ou Git Bash) e execute:
```bash
node -v
npm -v
```
Se a instalação ocorreu corretamente, as versões do Node.js (ex.: `v20.x` ou `v22.x`) e do npm serão exibidas.

---

### Passo 3: Instalar as Dependências do Projeto

No terminal, navegue até a pasta raiz do projeto e instale as dependências executando:
```bash
npm install
```

---

### Passo 4: Executar os Scripts

Os scripts TypeScript utilizam a ferramenta `tsx` para execução sob demanda (sem necessidade de compilar manualmente arquivos para JavaScript).

#### 1. Executar o Pipeline Mestre de Extração (Metadados e Letras)
Processa automaticamente as faixas pendentes nos arquivos de `/lyrics-list`:
```bash
npx tsx scripts/pipeline-extractor.ts
```

#### 2. Consultar Metadados de uma Música Específica
Consulta e consolida ISRC, duração, ano e capa nos provedores (MusicBrainz, iTunes e Deezer):
```bash
npx tsx scripts/track-metadata-service.ts "A Minha Menina" "Os Mutantes"
```

#### 3. Consultar Letra de uma Música Específica
Consulta LRCLIB, lyrics.ovh e Genius com filtros de idioma em português:
```bash
npx tsx scripts/lyrics-service.ts "A Minha Menina" "Os Mutantes"
```

#### 4. Inspecionar por Amostragem Aleatória de Letras
Sorteia faixas das listas para testar a taxa de assertividade e os provedores:
```bash
# Sorteia 5 faixas de qualquer gênero
npx tsx scripts/sample-lyrics-verifier.ts 5

# Sorteia 10 faixas filtrando apenas listas de trap
npx tsx scripts/sample-lyrics-verifier.ts 10 trap
```

#### 5. Assistente Interativo de Preenchimento Manual de Artistas
Auxilia na curadoria humana com sugestões em tempo real do iTunes para artistas vazios:
```bash
npx tsx scripts/manual-artist-fill.ts
```

