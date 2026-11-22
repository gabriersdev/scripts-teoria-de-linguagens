# Esquema de Dados e Atributos

Este documento descreve os contratos de dados dos arquivos JSON armazenados em `/lyrics-list` e os arquivos de saída gerados em `/lyrics-data`.

---

## 1. Estrutura dos Arquivos de Lista (`/lyrics-list/*.json`)

Cada arquivo dentro de `/lyrics-list/` (ex.: `funk-list.json`, `rap-list.json`, `rock-list.json`) é representado por uma lista (array) contendo objetos de agrupamento temático/gênero musical.

```json
[
  {
    "id": "Lista de Músicas do gênero Rock",
    "complete": false,
    "source": [
      "https://open.spotify.com/playlist/5Me9UnTwWnPA2FuTgUKzIy",
      "https://open.spotify.com/intl-pt/album/0HU62E1P8fLUxiFLn1gajG"
    ],
    "lyrics": [
      {
        "id": 98401,
        "name": "A Minha Menina",
        "artists": "Os Mutantes",
        "complete": false
      }
    ]
  }
]
```

### Atributos da Lista (Nível Raiz)

| Atributo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `string` | Título ou identificador textual legível da lista (ex.: `"Lista de Músicas do gênero Rock"`). |
| `complete` | `boolean` | Flag de status geral da lista. Indica se a curadoria de títulos e artistas de todas as músicas já foi finalizada. Quando marcada como `true`, scripts de enriquecimento automático de nomes (como `populate-artists.ts`) ignoram o arquivo para não reprocessar itens consolidados. |
| `source` | `string[]` | Conjunto de URLs de referência (links de playlists, álbuns ou perfis de artistas do Spotify) utilizados para minerar ou validar as músicas do gênero. |
| `lyrics` | `object[]` | Coleção contendo os itens individuais de faixas musicais pertencentes àquela lista. |

---

### Atributos dos Itens de Música (`lyrics[i]`)

Cada objeto contido dentro da propriedade `lyrics` representa uma faixa musical a ser minerada e analisada:

| Atributo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `number` \| `string` | Identificador numérico sequencial único da faixa (ex.: `98401`). Gerado pelo utilitário `util/update-lyrics-list-ids.ts`. Serve como chave primária estática para vincular metadados (`/lyrics-data/metadata/{id}.json`) e letras brutas (`/lyrics-data/lyrics/{id}.txt`). |
| `name` | `string` | Nome ou título da música cadastrada. Durante o pipeline, passa por higienização para remover sufixos de ruído (ex.: "(Ao Vivo)", "(Remaster)"). |
| `artists` | `string` | Nome do artista principal ou colaboradores separados por vírgula (ex.: `"Cacife Clandestino, WC no Beat, Felp 22"`). Nomes com vírgula própria (ex.: `"Ryu, the Runner"`) são protegidos por máscara de token para não sofrerem quebra indevida. |
| `complete` | `boolean` \| `number` | Flag de estado e ciclo de vida da extração no `pipeline-extractor.ts`:<br>• `true`: Sucesso na extração da letra (mesmo com metadados técnicos ausentes ou incompletos, a presença da letra valida a faixa como completa).<br>• `1`: Sucesso parcial (Metadados extraídos e salvos em JSON, mas a letra não foi encontrada ou falhou na validação de sanidade).<br>• `false` (ou omitido): Faixa pendente ou falha crítica (sem letra e sem metadados). |

---

## 2. Estrutura dos Arquivos de Metadados (`/lyrics-data/metadata/{id}.json`)

Gerados automaticamente pelo `pipeline-extractor.ts` quando os metadados são resolvidos:

```json
[
  {
    "id": 98401,
    "metadata": {
      "title": "A Minha Menina",
      "artists": [
        "Os Mutantes"
      ],
      "album": "Millennium: Tropicália",
      "releaseDate": "1999",
      "durationMs": 281000,
      "genres": [
        "rock",
        "mpb",
        "brazilian",
        "psychedelic rock"
      ],
      "isrc": "BRPGD6800016",
      "coverUrl": "https://is1-ssl.mzstatic.com/image/thumb/...",
      "sources": {
        "musicbrainz": "https://musicbrainz.org/recording/...",
        "itunes": "https://music.apple.com/...",
        "deezer": "https://www.deezer.com/track/..."
      }
    },
    "lyricPath": "/lyrics/98401.txt"
  }
]
```

### Atributos do Objeto de Metadados

| Atributo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `number` \| `string` | ID correspondente da faixa na lista de origem. |
| `metadata.title` | `string` | Título consolidado da música. |
| `metadata.artists` | `string[]` | Array com os nomes dos artistas/intérpretes identificados. |
| `metadata.album` | `string` \| `null` | Álbum oficial ou coletânea onde a faixa foi publicada. |
| `metadata.releaseDate`| `string` \| `null` | Data ou ano de lançamento oficial. |
| `metadata.durationMs` | `number` \| `null` | Duração da faixa em milissegundos. |
| `metadata.genres` | `string[]` | Tags ou gêneros musicais catalogados nas bases. |
| `metadata.isrc` | `string` \| `null` | Código ISRC (International Standard Recording Code) exclusivo da gravação. |
| `metadata.coverUrl` | `string` \| `null` | Link da arte da capa do álbum em alta resolução (1000x1000). |
| `metadata.sources` | `object` | URLs diretas para os registros nos provedores consultados (`musicbrainz`, `itunes`, `deezer`). |
| `lyricPath` | `string` | Caminho relativo apontando para o arquivo de texto puro com a letra (`/lyrics/{id}.txt`). |

---

## 3. Datasets Analíticos Consolidados (`/data-analysis/datasets/`)

Gerados automaticamente pelo orquestrador `data-analysis/runAnalysisPipeline.py` (`npm run analyze:all`) e pelo consolidador `data-analysis/buildDatasets.py`, estes arquivos estruturam os resultados de desempenho das 4 engines de expressões regulares e a análise linguística das obscenidades no corpus.

### 3.1. Benchmark e Desempenho das Engines de Regex

#### `benchmarkSummary.csv`
- **Granularidade:** 1 linha por linguagem (`Julia`, `TypeScript`, `Java`, `C#`).
- **Colunas:** `language`, `swear_words_loaded`, `files_processed`, `files_with_matches`, `total_matches`, `total_characters`, `total_bytes`, `regex_compile_ms`, `matching_time_ms`, `matching_time_ns`, `elapsed_ms`, `ns_per_char`, `chars_per_ms`, `throughput_mbs`, `pearson_r`, `r_squared`.
- **O que possibilita extrair:**
  - Comparação direta de velocidade entre as 4 engines isolando o matching puro (`matching_time_ms`) do tempo total com I/O (`elapsed_ms`) e do custo de compilação (`regex_compile_ms`).
  - Custo médio por caractere (`ns_per_char`) e vazão normalizada (`chars_per_ms` e `throughput_mbs`), anulando distorções de tamanho de texto.
  - Validação de paridade entre as engines (`files_with_matches`, `total_matches`, `total_characters`) e resumo estatístico da linearidade $O(n)$ (`pearson_r` e `r_squared`).

#### `benchmarkLinearity.csv`
- **Granularidade:** 1 linha por faixa por linguagem (4 × 1.150 = 4.600 linhas).
- **Colunas:** `language`, `file`, `characters`, `bytes`, `matches`, `matching_us`, `ns_per_char`.
- **O que possibilita extrair:**
  - Gráficos de dispersão $O(n)$ cruzando tamanho da letra (`characters`) × tempo de execução (`matching_us`) para cada engine.
  - Detecção de outliers de *Garbage Collection* / aquecimento de JIT, cálculo de regressão linear, percentis (P50, P95, P99) e estabilidade do tempo por caractere (`ns_per_char`).

#### `pipelineMetricsSnapshot.json` e `pipelineRunsHistory.json`
- **Granularidade:** Última execução completa (`pipelineMetricsSnapshot.json`) e série histórica cumulativa de execuções (`pipelineRunsHistory.json`).
- **Estrutura:** `executedAtUtc`, objeto `parity` (`isConsistent`, `mismatches`, totais do corpus) e lista `languages` com o retorno completo de cada engine.
- **O que possibilita extrair:**
  - Auditoria de reprodutibilidade e histórico evolutivo entre diferentes versões do catálogo `lib/swear-words.json` ou otimizações de regex.

---

### 3.2. Corpus Mestre e Ocorrências Detalhadas

#### `tracksDataset.csv`
- **Granularidade:** 1 linha por faixa do corpus (1.150 faixas).
- **Colunas:** `track_id`, `title`, `artists`, `primary_artist`, `genre`, `release_date`, `release_year`, `decade`, `characters`, `bytes`, `swear_count`, `has_swear`, `unique_swear_terms`, `swear_density_per_1k_chars`.
- **O que possibilita extrair:**
  - Visão unificada de cada música cruzando letra, gênero, artistas, data/década de lançamento e incidência de obscenidades.
  - Rankings de faixas mais explícitas, distribuição de densidade (`swear_density_per_1k_chars`), correlação entre tamanho da letra e quantidade de obscenidades, e qualquer recorte customizado (ex.: filtrar por ano exato ou diversidade de termos por música via `unique_swear_terms`).

#### `swearMatchesDetail.csv`
- **Granularidade:** 1 linha por ocorrência individual encontrada pela regex no corpus (ex.: 5.280 linhas).
- **Colunas:** `track_id`, `title`, `artists`, `genre`, `release_year`, `decade`, `matched_text`, `canonical_term`.
- **O que possibilita extrair:**
  - Auditoria exata de cada correspondência encontrada (`matched_text`) e seu mapeamento ao termo base do catálogo (`canonical_term`).
  - Estudo de variações morfológicas, alongamentos fonéticos (ex.: `puuuuta`, `putas`), uso de censura na 2ª letra (`p*ta`, `c*`), acentuação e flexões de gênero (`[X]`) por gênero musical ou década.

---

### 3.3. Incidência, Difusão e Participação por Termo

#### `swearWordsOverall.csv`
- **Granularidade:** 1 linha por termo canônico de `lib/swear-words.json` (incluindo termos com 0 ocorrências).
- **Colunas:** `canonical_term`, `occurrences`, `tracks_with_term`, `diffusion_pct`, `share_of_swears_pct`.
- **O que possibilita extrair:**
  - Ranking global das obscenidades mais frequentes, identificação de termos do catálogo ausentes no corpus (`occurrences = 0`), concentração (ex.: quantos % do total os Top 10 termos representam) e contraste entre frequência bruta (`occurrences`) e alcance em músicas distintas (`diffusion_pct`).

#### `swearWordsByGenre.csv`
- **Granularidade:** 1 linha por par `(genre, canonical_term)` com ao menos 1 ocorrência.
- **Colunas:** `genre`, `canonical_term`, `occurrences`, `tracks_with_term`, `genre_total_tracks`, `diffusion_in_genre_pct`, `share_in_genre_swears_pct`.
- **O que possibilita extrair:**
  - Assinatura lexical de cada gênero musical (quais obscenidades dominam o funk vs trap vs rap vs rock vs sertanejo), mapas de calor (*heatmaps*) termo × gênero e difusão relativa dentro de cada gênero.

#### `swearWordsByDecade.csv`
- **Granularidade:** 1 linha por par `(decade, canonical_term)` com ao menos 1 ocorrência.
- **Colunas:** `decade`, `canonical_term`, `occurrences`, `tracks_with_term`, `decade_total_tracks`, `diffusion_in_decade_pct`, `share_in_decade_swears_pct`.
- **O que possibilita extrair:**
  - Evolução temporal do vocabulário obsceno (quais termos surgem, crescem ou perdem participação entre as décadas de 1960s a 2020s).

---

### 3.4. Agregações por Gênero, Década e Artista

#### `genreSummary.csv`
- **Granularidade:** 1 linha por gênero (`funk`, `trap`, `trap-extra`, `rap`, `rock`, `sertanejo`).
- **Colunas:** `genre`, `total_tracks`, `tracks_with_swear`, `tracks_with_swear_pct`, `total_swears`, `share_of_corpus_swears_pct`, `avg_swears_per_track`, `avg_swears_per_swear_track`, `total_characters`, `swear_density_per_1k_chars`, `raw_tokens`, `filtered_tokens`, `unique_words`.
- **O que possibilita extrair:**
  - Comparação completa entre gêneros: prevalência (% de faixas com obscenidades), volume absoluto e participação no corpus, média geral vs média condicional (`avg_swears_per_swear_track`), densidade normalizada por 1.000 caracteres e riqueza vocabular (`unique_words` vs `filtered_tokens`).

#### `decadeSummary.csv`
- **Granularidade:** 1 linha por década (`1960s` a `2020s` + `Desconhecida`).
- **Colunas:** `decade`, `total_tracks`, `tracks_with_swear`, `tracks_with_swear_pct`, `total_swears`, `share_of_corpus_swears_pct`, `avg_swears_per_track`, `avg_swears_per_swear_track`, `total_characters`, `swear_density_per_1k_chars`.
- **O que possibilita extrair:**
  - Séries temporais da evolução da explicitude nas letras musicais brasileiras (crescimento do % de faixas com obscenidades, média por faixa e densidade por 1.000 caracteres ao longo das décadas).

#### `decadeByGenreSummary.csv`
- **Granularidade:** 1 linha por combinação `(decade, genre)`.
- **Colunas:** `decade`, `genre`, `total_tracks`, `tracks_with_swear`, `tracks_with_swear_pct`, `total_swears`, `avg_swears_per_track`.
- **O que possibilita extrair:**
  - Análise controlada para separar efeito de época e efeito de gênero (ex.: verificar se o aumento na década de 2020s decorre da maior presença de funk/trap ou se gêneros tradicionais como rock/sertanejo também mudaram ao longo do tempo).

#### `artistSummary.csv`
- **Granularidade:** 1 linha por artista individual (colaborações separadas com proteção para nomes com vírgula própria, como `"Ryu, the Runner"`).
- **Colunas:** `artist`, `total_tracks`, `tracks_with_swear`, `tracks_with_swear_pct`, `total_swears`, `avg_swears_per_track`, `genres`.
- **O que possibilita extrair:**
  - Rankings de artistas por total de obscenidades, por média por faixa e por percentual de faixas com obscenidades (com possibilidade de filtrar artistas recorrentes, ex.: `total_tracks >= 5`).

---

### 3.5. Vocabulário Geral (`incidence:words`)

#### `incidenceTopWordsGlobal.csv`, `incidenceTopWordsByGenre.csv` e `incidenceWordsReport.json`
- **Granularidade:** Top 200 palavras úteis globais (`incidenceTopWordsGlobal.csv`), Top 100 palavras úteis por gênero (`incidenceTopWordsByGenre.csv`) e relatório JSON integral (`incidenceWordsReport.json`).
- **Colunas dos CSVs:** `(genre,) rank`, `word`, `occurrences`, `track_count`, `diffusion_pct`, `share_pct`, `is_swear_word`.
- **O que possibilita extrair:**
  - Identificação de quais obscenidades (`is_swear_word = true`) competem diretamente com o vocabulário mais comum da língua portuguesa nas letras musicais, tanto no ranking global quanto dentro de cada gênero, com posição exata (`rank`), incidência, difusão (%) e participação (%) sobre as palavras úteis contabilizadas.

