# Arquitetura do Projeto

## Estrutura de Diretórios

- **`/analysis`**: Scripts de análise e mascaramento de palavrões (atividade A05 / F2) implementados nas quatro linguagens escolhidas, cada qual com subdiretórios próprios `/input/lyrics-data` (entrada) e `/output/lyrics`, `/output/summary.json` (métricas consolidadas de desempenho, throughput e linearidade) e `/output/linearity-metrics.csv` (série por faixa para dispersão $O(n)$), consumindo dinamicamente `/lib/swear-words.json`:
  - `analysis/typescript/mask-swear-words.ts`: Implementação em TypeScript (`RegExp` com flags `giu`).
  - `analysis/julia/maskSwearWords.jl`: Implementação em Julia (`SwearWordMasker`, PCRE2 com flag `i`), com flag opcional `--export-analysis` para exportar `output/matches-catalog.csv` mapeando cada ocorrência ao termo canônico.
  - `analysis/julia/censorLyrics.jl`: Utilitário interativo e via CLI (`censorLyrics.jl [ID]`) para consulta e mascaramento individual de faixas com relatório no console.
  - `analysis/julia/censorLyricsLegacy.jl`: Versão legada recuperada de S3rvulo mantida para histórico e testes pontuais.
  - `analysis/java/SwearWordMasker.java`: Implementação em Java (`Pattern` com `CASE_INSENSITIVE | UNICODE_CASE | UNICODE_CHARACTER_CLASS`).
  - `analysis/csharp/`: Projeto .NET 8 em C# (`SwearWordMasker.csproj`, `SwearWordRegexBuilder.cs`, `SwearWordMaskerService.cs`, `Program.cs`) utilizando `RegexOptions.IgnoreCase | RegexOptions.CultureInvariant`.
- **`/data-analysis`**: Camada de consolidação e análise exploratória dos resultados experimentais:
  - `data-analysis/runAnalysisPipeline.py` (atalho `npm run analyze:all`): Orquestrador único que executa sequencialmente os 4 scripts de análise (`Julia --export-analysis`, `TypeScript`, `Java` e `C# -c Release`), valida a paridade entre as engines, exporta o relatório JSON de `incidence:words`, reconstrói todos os CSVs via `buildDatasets.py` e persiste o snapshot/histórico consolidado das métricas em `data-analysis/datasets/pipelineMetricsSnapshot.json` e `pipelineRunsHistory.json`.
  - `data-analysis/buildDatasets.py`: Gerador em Python (stdlib) que cruza os benchmarks das 4 linguagens, `analysis/julia/output/matches-catalog.csv`, `/lyrics-list/*.json`, `/lyrics-data/metadata/*.json` e o retorno JSON de `scripts/incidence-words.ts`, produzindo 14 datasets estruturados em `camelCase` em `data-analysis/datasets/`.
  - `data-analysis/swearWordsDataAnalysis.ipynb`: Notebook Jupyter Python (`pandas` + `matplotlib`) com dicionário de métricas, tabelas comparativas e gráficos de benchmark, linearidade $O(n)$, incidência/difusão/participação por termo, gênero, década, artista e vocabulário geral (`incidence:words`).
- **`/docs`**: Documentação oficial (guias de código incluindo JS/TS, Java, Julia e C#, contratos de dados em `DATA-SCHEMA.md`, regras de negócio, changelogs e arquitetura). Atualize a cada mudança estrutural.
- **`/lib`**: Bibliotecas e clientes base reutilizados pelo sistema.
  - `spotify-api-client.ts`: Motor orientado a objetos para lidar com requisições HTTP à API do Spotify (via endpoint xwolf).
  - `lyrics-corpus.ts`: Repositório compartilhado para indexação de faixas (`/lyrics-list/*.json`) e carregamento/iteração das letras em texto puro (`/lyrics-data/lyrics/*.txt`) com filtro por gênero musical.
  - `word-filters.ts`: Utilitários reutilizáveis para tokenização lexical de letras (remoção de tags estruturais entre colchetes), normalização de acentos e leitura das listas estáticas em JSON (`ignore-words.json` e `swear-words.json`).
  - `ignore-words.json`: Catálogo estático em JSON com os termos ignorados por padrão (stopwords em português) na análise lexical.
  - `swear-words.json`: Catálogo estático de termos chulos/palavrões em português utilizado para classificação e filtragem na análise lexical.
- **`/lyrics-list`**: Listas JSON estáticas (separadas por gênero, como `funk-list.json`). Guardam faixas, IDs, artistas e URLs de origem (detalhadas em `docs/DATA-SCHEMA.md`).
- **`/lyrics-data`**: Dados minerados e estruturados contendo subpasta `/metadata` (`{id}.json`) com metadados técnicos consolidados, pasta `/lyrics` contendo as letras (`{id}.txt`) e pasta `/backup-duplicates` para arquivamento seguro de arquivos de faixas desvinculadas ou substituídas.
- **`/scripts`**: Serviços e assistentes de CLI para extração e mineração de dados.
- **`/util`**: Scripts utilitários de manutenção executados fora do fluxo principal.
- **`index.html`**: Interface web monólita em Bootstrap 5 e Vue 3 para visualização de métricas de integridade e consulta global de músicas consumindo diretamente os arquivos de `/lyrics-list`.

## Scripts (`/scripts`)

- **`text-sanitizer.ts`**: Utilitário de sanitização textual. Trata separação de múltiplos colaboradores com token masking para exceções com vírgula própria (ex.: "Ryu, the Runner"), remove ruídos em títulos (ex.: "Ao Vivo", "Remaster"), calcula similaridade de títulos/artistas, valida idioma da letra por densidade de stopwords em português, purifica letras contra marcadores temporais LRC (`sanitizeLyrics`) e provê gerador de padrões regex elásticos com repetição de caracteres e suporte a plural (`buildElasticWordPattern`).
- **`lyrics-service.ts`**: Extrai letras musicais em cascata (LRCLIB, lyrics.ovh, Genius com raspagem semântica e fallback público anti-429) com validação rígida de idioma, artista, tolerância de duração e higienização automática contra marcadores de tempo e sincronização.
- **`track-metadata-service.ts`**: Motor de metadados. Consome MusicBrainz (Lucene), iTunes e Deezer para extrair ISRC, duração, lançamento e gênero, com validação de candidatos e merge seguro contra inconsistências.
- **`pipeline-extractor.ts`**: Orquestrador mestre de extração contínua. Percorre os arquivos em `/lyrics-list`, processa faixas pendentes e gera arquivos de metadados (`/lyrics-data/metadata/{id}.json`) e letras (`/lyrics-data/lyrics/{id}.txt`).
- **`sanitize-lyrics.ts`**: Utilitário de purificação do corpus em lote. Varre `/lyrics-data/lyrics/*.txt`, detecta tags e marcadores de tempo residuais (`<mm:ss.xxx>` e `[mm:ss.xxx]`) e regrava os arquivos limpos atomicamente, com suporte a simulação (`--dry-run`).
- **`sample-lyrics-verifier.ts`**: Verificador e auditor de amostragem. Seleciona aleatoriamente $N$ faixas de `/lyrics-list` (com suporte a filtro por gênero), testa o motor de letras e gera um relatório estatístico com taxa de assertividade e distribuição por provedor.
- **`dataset-audit.ts`**: Auditor e extrator de qualidade da base. Cruza as listas em `/lyrics-list` com os arquivos físicos em `/lyrics-data/metadata` e `/lyrics-data/lyrics`, gerando relatórios de completude (Completos, apenas metadados, apenas letras, dados zerados e ausência de artistas) no geral e por gênero, com suporte opcional a sincronização das flags `complete` (`--sync`).
- **`duplicate-verifier.ts`**: Auditor e detector de duplicatas no corpus. Identifica colisões de identificador (IDs repetidos com músicas distintas), duplicações dentro do mesmo gênero e duplicações cruzadas entre diferentes gêneros a partir de título e artista sanitizados, com suporte a *fuzzy matching* e modo de substituição automática (`--replace`) para resetar segundas ocorrências a placeholders pendentes (`complete: false`), com backup de dados físicos.
- **`track-slot-filler.ts`**: Assistente interativo para preenchimento e substituição de vagas (placeholders "Substituir faixa #{ID}", faixas incompletas `complete: false` e parciais `complete: 1`) a partir de URLs de álbuns ou playlists do Spotify. Consome faixas oficiais da API do Spotify eliminando digitação manual, descarta automaticamente duplicatas existentes no corpus, executa consultas prévias em memória de metadados e letras, grava de imediato os arquivos físicos definitivos (`/lyrics-data/metadata/{id}.json` e `/lyrics-data/lyrics/{id}.txt`) ao confirmar a substituição e calcula a flag de completude (`true`, `1` ou `false`).
- **`lyrics-regex-search.ts`**: Mecanismo de busca textual por expressoes regulares e palavras-chave sobre o corpus de letras (`/lyrics-data/lyrics`), consumindo `lib/lyrics-corpus.ts`. Cruza as faixas com seus metadados de catalogo, apura estatisticas agregadas de difusao e frequencia por genero musical, extrai trechos e linhas correspondentes e suporta busca elástica (`--elastic` / `elastic`) para casar letras alongadas e plurais.
- **`incidence-words.ts`**: Analisador de incidência lexical sobre o corpus de letras, reutilizando `lib/lyrics-corpus.ts` e `lib/word-filters.ts`. Contabiliza as palavras mais frequentes no geral e por gênero musical, ignora stopwords do português por padrão (com flags para inclusão completa, lista customizada e filtragem/destaque via `lib/swear-words.json`), calcula cobertura por faixa (difusão) e exporta relatórios em tabela ou JSON.
- **`populate-artists.ts`**: Lê JSONs em `/lyrics-list`, extrai links de álbuns/playlists do atributo `source`, conecta ao Spotify e cruza dados para preencher nomes de artistas ausentes (`"artists": ""`).
- **`manual-artist-fill.ts`**: Assistente de terminal interativo. Encontra músicas pendentes, busca sugestões no iTunes em tempo real, capta a escolha do usuário e salva no JSON imediatamente, prevenindo perda de progresso.
- **`spotify-album-service.ts` / `spotify-playlist-service.ts`**: Consulta e testa faixas de um álbum ou playlist a partir da URL.

## Utilitários (`/util`)

- **`update-lyrics-list-ids.ts`**: Varre as listas em `/lyrics-list`, analisa o total de itens e atribui IDs numéricos sequenciais (ex: `98001`, `98002`) para controle em banco de dados.

## Fluxo de Vida dos Metadados

1. O projeto recebe dados crus e incompletos em `/lyrics-list`.
2. O `util/update-lyrics-list-ids.ts` atribui IDs a todos os itens.
3. O `scripts/populate-artists.ts` usa links oficiais para preencher automaticamente 80% dos artistas.
4. O `scripts/manual-artist-fill.ts` filtra os 20% restantes (nomenclaturas complexas) para curadoria humana.
5. Com Título e Artista puros, o `scripts/track-metadata-service.ts` coleta as propriedades musicais definitivas (ISRC, capa, tempo).
