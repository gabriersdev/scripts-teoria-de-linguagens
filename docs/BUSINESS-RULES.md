# Regras de Negócio

## 1. Blindagem de Dados (`artists`)
Scripts automatizados (como `populate-artists.ts`) não podem sobrescrever um campo `artists` que contenha texto. A automação atua apenas se o campo for nulo, indefinido ou vazio (`""`). 

## 2. Escopo da Flag `"complete"`
A flag `"complete"` possui funções distintas:
- **Nível Raiz (Lista):** Indica se a curadoria de títulos e artistas da lista terminou. Se `true`, scripts de povoamento ignoram o arquivo.
- **Nível de Faixa (Música):** Controla a extração de dados (`pipeline-extractor.ts`).
  - `true`: Sucesso na extração da letra (mesmo com metadados técnicos ausentes ou incompletos, a presença da letra valida a faixa como completa).
  - `1`: Sucesso parcial (Metadados extraídos, sem letra).
  - `false`: Falha total ou pendência (sem letra e sem metadados).

## 3. Fallback em Cascata
Não descarte metadados no `track-metadata-service.ts` se um provedor falhar. Siga o modelo de fusão em ordem técnica:
1. **MusicBrainz** (Prioridade técnica, ISRC e Tags).
2. **iTunes** (Prioridade secundária, lançamentos e capas).
3. **Deezer** (Fallback final e durações em milissegundos).

Se a primeira API não retornar todos os campos (ex: sem capa), consulte as subsequentes apenas para completar as chaves faltantes.

## 4. Prevenção de Ambiguidade
Se uma música tiver título genérico ou de uma palavra e não houver artista mapeado (ex: "VENOM"), não busque em provedores técnicos (MusicBrainz). O retorno será impreciso.
Use primeiro APIs comerciais (iTunes ou Deezer) para encontrar a música baseada em popularidade global.

## 5. Rate Limiting Obrigatório
O consumo de APIs gratuitas (XWolf, iTunes, MusicBrainz) exige pausas (Delay). Em extrações pesadas de álbuns e playlists, aplique 10 segundos de delay entre as requisições para evitar HTTP 429.

## 6. Salvamento Imediato (Hot Reload)
Em scripts de terminal interativos (`manual-artist-fill.ts`), o salvamento do arquivo JSON (I/O) ocorre de forma atômica a cada confirmação (Enter) do usuário. Não adie salvamentos para o final do lote (batch save).

## 7. Token Masking e Parsing de Artistas
A quebra de colaboradores pelo separador vírgula (`","`) deve proteger nomes próprios com vírgula intrínseca (`"Ryu, the Runner"`, `"Tyler, the Creator"`, etc.) por meio de mascaramento temporário de token, isolando o artista primário para consultas e preservando a integridade dos nomes.

## 8. Validação N-para-1 e Tolerância Temporal
Ao validar retornos de provedores externos (MusicBrainz, iTunes, Deezer, LRCLIB):
- O resultado é aceito se o artista da API corresponder a qualquer um dos colaboradores cadastrados na faixa (relação N-para-1).
- Caso haja duração prévia conhecida, divergências superiores a 15 segundos desqualificam o candidato, evitando fusões espúrias entre faixas homônimas ou regravações.

## 9. Sanidade Textual e Idioma das Letras
Para integrar o corpus de pesquisa em língua portuguesa:
- Textos com predomínio de vocabulário ou stopwords em idioma estrangeiro (inglês/espanhol) devem ser rejeitados e submetidos ao próximo provedor da cascata.
- Avisos de placeholder ("instrumental", "letra não disponível") desclassificam o resultado.
- **Higienização de Marcadores Temporais:** Letras sincronizadas (LRC) contendo marcadores de linha (`[mm:ss.xxx]`), de palavra/sílaba (`<mm:ss.xxx>`) ou metadados de cabeçalho (`[ar:...]`) devem ser limpas (`sanitizeLyrics`), expurgando ruídos numéricos e temporais antes de salvar o arquivo definitivo em disco.

## 10. Análise Lexical e Filtragem do Corpus (`incidence-words.ts`)
Na apuração de frequência de palavras sobre `/lyrics-data/lyrics`:
- **Remoção de tags estruturais:** Marcações editoriais ou de seção entre colchetes (ex.: `[Refrão]`, `[Verso 1]`, `[Intro]`, `[?]`) são descartadas por padrão antes da tokenização para não inflar contagens com metadados textuais (preservável via `--keep-tags`).
- **Stopwords por padrão (`lib/ignore-words.json`):** Artigos, preposições, contrações, conjunções, pronomes e verbos auxiliares/ligação de alta frequência da língua portuguesa catalogados em `lib/ignore-words.json` são ignorados por padrão na contagem (incluíveis via `--all-words`).
- **Classificação de `lib/swear-words.json`:** Os termos catalogados permanecem contabilizados e sinalizados no relatório padrão, podendo ser isolados (`--only-swear` / `swear`) ou excluídos (`--exclude-swear` / `no-swear`).

## 11. Busca com Expansão Elástica de Caracteres (`lyrics-regex-search.ts`)
Na varredura de termos sobre letras cantadas:
- **Alongamento Fonético/Rítmico:** Em gêneros musicais, caracteres são frequentemente repetidos para coincidir com a métrica e o tempo da melodia (ex.: `puuuuta`, `putaaaa`, `vadiiiia`).
- **Construção de Padrão Elástico:** A busca elástica converte cada caractere da palavra base no quantificador de repetição positiva $c+$ (1 ou mais repetições) e tolera a terminação plural opcional ($s*$), capturando termos estendidos e formas no plural (ex.: `puta` casa com `puuuta`, `putas` e `puuutasss`).

## 12. Identificação e Mascaramento de Palavrões nas 4 Linguagens (`analysis/`)
Na etapa de detecção e mascaramento (A05 / F2) em TypeScript, Julia, Java e C#:
- **Geração Dinâmica de Regex:** Nenhuma expressão regular é hardcoded; cada linguagem lê `/lib/swear-words.json` e constrói o padrão dinamicamente por funções dedicadas.
- **Regras de Composição do Padrão:**
  - **Repetição de caracteres:** Cada letra recebe o quantificador `+` (1 ou mais ocorrências), ex.: `puta` -> `p+...t+a+`.
  - **Plural opcional:** Terminação `s*` adicionada ao final quando o termo base não termina em `s` (ex.: `putas`, `vadias`).
  - **Censura da 2ª letra:** A segunda letra de cada termo (exceto hífen) aceita substituição por `*` ou `#` via `(?:<letra>+|[*#]+)` (ex.: `p*ta`, `p#ta`, `c*`).
  - **Acentuação opcional:** Caracteres acentuados expandem para classe com e sem acento (ex.: `xerecão` -> `xerec[aã]+o+`, `cú` -> `c+(?:[uú]+|[*#]+)`).
  - **Flexão de gênero `[X]`:** O marcador `[X]` é expandido para `[ao]+` (ex.: `arrombad[X]` -> `arrombad[ao]+`).
  - **Case-insensitive:** Todas as engines utilizam flag ignore-case (`i`), preservando a capitalização original do texto fora dos termos mascarados.
  - **Operador de borda Unicode:** Fronteiras `(?<![\p{L}\p{N}_])` e `(?![\p{L}\p{N}_])` garantem correspondência apenas de palavras inteiras, evitando falsos positivos (ex.: `cu` não casa em `curtir` nem `cúpula`) e suportando termos censurados no final (ex.: `c*`).
- **Regra de Mascaramento:** Mantém o primeiro caractere (code point Unicode) e substitui todos os demais caracteres do termo encontrado por `*` (ex.: `puta` -> `p***`, `PUTAS` -> `P****`, `cú` -> `c*`).
- **Isolamento de E/S e Métricas Experimentais:** Cada linguagem lê de `analysis/<lang>/input/lyrics-data/lyrics/*.txt`, persiste os arquivos mascarados em `analysis/<lang>/output/lyrics/*.txt`, grava métricas consolidadas em `analysis/<lang>/output/summary.json` (tempo de compilação da regex, tempo puro de matching em ms/ns, `ns/char`, throughput em `chars/ms` e `MB/s`, além da correlação linear de Pearson $r$ e $R^2$) e exporta a série por faixa em `analysis/<lang>/output/linearity-metrics.csv` (`file,characters,bytes,matches,matching_us,ns_per_char`) para gráficos de dispersão $O(n)$.


