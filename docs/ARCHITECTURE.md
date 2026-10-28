# Arquitetura do Projeto

## Estrutura de Diretórios

- **`/docs`**: Documentação oficial (guias de código, contratos de dados em `DATA-SCHEMA.md`, regras de negócio, changelogs e arquitetura). Atualize a cada mudança estrutural.
- **`/lib`**: Bibliotecas e clientes base reutilizados pelo sistema.
  - `spotify-api-client.ts`: Motor orientado a objetos para lidar com requisições HTTP à API do Spotify (via endpoint xwolf).
- **`/lyrics-list`**: Listas JSON estáticas (separadas por gênero, como `funk-list.json`). Guardam faixas, IDs, artistas e URLs de origem (detalhadas em `docs/DATA-SCHEMA.md`).
- **`/lyrics-data`**: Dados minerados e estruturados contendo subpasta `/metadata` (`{id}.json`) com metadados técnicos consolidados e pasta `/lyrics` contendo as letras (`{id}.txt`).
- **`/scripts`**: Serviços e assistentes de CLI para extração e mineração de dados.
- **`/util`**: Scripts utilitários de manutenção executados fora do fluxo principal.
- **`index.html`**: Interface web monólita em Bootstrap 5 e Vue 3 para visualização de métricas de integridade e consulta global de músicas consumindo diretamente os arquivos de `/lyrics-list`.

## Scripts (`/scripts`)

- **`text-sanitizer.ts`**: Utilitário de sanitização textual. Trata separação de múltiplos colaboradores com token masking para exceções com vírgula própria (ex.: "Ryu, the Runner"), remove ruídos em títulos (ex.: "Ao Vivo", "Remaster"), calcula similaridade de títulos/artistas e valida idioma da letra por densidade de stopwords em português.
- **`lyrics-service.ts`**: Extrai letras musicais em cascata (LRCLIB, lyrics.ovh, Genius) com validação rígida de idioma, artista e tolerância de duração.
- **`track-metadata-service.ts`**: Motor de metadados. Consome MusicBrainz (Lucene), iTunes e Deezer para extrair ISRC, duração, lançamento e gênero, com validação de candidatos e merge seguro contra inconsistências.
- **`pipeline-extractor.ts`**: Orquestrador mestre de extração contínua. Percorre os arquivos em `/lyrics-list`, processa faixas pendentes e gera arquivos de metadados (`/lyrics-data/metadata/{id}.json`) e letras (`/lyrics-data/lyrics/{id}.txt`).
- **`sample-lyrics-verifier.ts`**: Verificador e auditor de amostragem. Seleciona aleatoriamente $N$ faixas de `/lyrics-list` (com suporte a filtro por gênero), testa o motor de letras e gera um relatório estatístico com taxa de assertividade e distribuição por provedor.
- **`dataset-audit.ts`**: Auditor e extrator de qualidade da base. Cruza as listas em `/lyrics-list` com os arquivos físicos em `/lyrics-data/metadata` e `/lyrics-data/lyrics`, gerando relatórios de completude (Completos, apenas metadados, apenas letras, dados zerados e ausência de artistas) no geral e por gênero, com suporte opcional a sincronização das flags `complete` (`--sync`).
- **`duplicate-verifier.ts`**: Auditor e detector de duplicatas no corpus. Identifica colisões de identificador (IDs repetidos com músicas distintas), duplicações dentro do mesmo gênero e duplicações cruzadas entre diferentes gêneros a partir de título e artista sanitizados, com suporte opcional a *fuzzy matching*.
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
