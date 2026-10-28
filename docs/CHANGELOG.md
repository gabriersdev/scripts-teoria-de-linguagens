# Changelog

Todas as alterações relevantes deste projeto são documentadas neste arquivo.

## [1.3.2] - 2026-10-28

### Adicionado
- Script auditor `scripts/duplicate-verifier.ts`:
  - Detecção de colisões de identificador (mesmo `id` atribuído a faixas distintas em listas diferentes).
  - Identificação de faixas duplicadas no mesmo gênero e faixas duplicadas em múltiplos gêneros com base em título limpo e artista primário sanitizados.
  - Suporte a filtros via argumentos de CLI: `--same-genre`, `--cross-genre`, `--fuzzy` e filtro por gênero (`<nome-do-genero>`).
  - Saída limpa e estruturada no terminal via `console.info` e `console.warn` sem caracteres decorativos desnecessários.

## [1.3.1] - 2026-10-28

### Modificado
- `scripts/pipeline-extractor.ts`:
  - Atualização da regra de marcação de status: faixas com letra extraída com sucesso passam a receber `complete: true` mesmo quando os metadados técnicos forem parciais ou insuficientes.
- `scripts/dataset-audit.ts`:
  - Sincronização (`--sync`) atualizada para marcar faixas com arquivo de letra existente em disco como `complete: true`.
- Listas JSON (`/lyrics-list`):
  - Sincronização das 15 faixas com letra e metadados incompletos/ausentes para `complete: true`, elevando o total de faixas completas para 999.
- `docs/BUSINESS-RULES.md` e `docs/DATA-SCHEMA.md`:
  - Atualização da Regra 2 documentando a primazia da letra sobre os metadados técnicos para atribuição do estado `complete: true`.

## [1.3.0] - 2026-10-26

### Adicionado
- Sistema de ordenação bidirecional (crescente/decrescente) em todas as tabelas de `index.html`:
  - Tabela "Detalhamento por Gênero": ordenação por Gênero (alfabético), Total, Completo, Só Metadados, Só Letra, Nenhum e Concluído (%) (numérico).
  - Tabela "Consulta Global de Músicas": ordenação por ID (numérico), Música, Artistas, Gênero e Status (alfabético por rótulo amigável).
  - Componentização do botão de ordenação (`SortButton` / `<sort-button>`): unificação dos botões em um único elemento reutilizável com o ícone `bi-arrows-expand` quando inativo e indicadores direcionais (`bi-arrow-up` / `bi-arrow-down`) quando ativo.
  - Reset automático da página corrente para a página 1 ao alterar o critério de ordenação na consulta global.

## [1.2.0] - 2026-10-22

### Adicionado
- Assistente dedicado `scripts/sample-lyrics-verifier.ts`:
  - Sorteio aleatório de $N$ faixas de `/lyrics-list` (algoritmo Fisher-Yates) com suporte a filtro opcional por gênero (ex.: `trap`, `funk`, `rock`).
  - Execução sequencial com delay ético de 1.5s entre requisições para validação de integridade.
  - Saídas limpas e padronizadas no terminal via `console.info`, `console.warn` e `console.error` (sem poluição gráfica), com sumário estatístico final de assertividade e distribuição por provedor.
- Auditor de integridade `scripts/dataset-audit.ts`:
  - Varredura de integridade física cruzando identificadores de `/lyrics-list` com `/lyrics-data/metadata` e `/lyrics-data/lyrics`.
  - Contabilização precisa de faixas 100% completas, pendentes de letra, pendentes de metadados, totalmente pendentes e sem artistas.
  - Relatório tabular limpo no terminal, com suporte a filtro por gênero e flag de sincronização (`--sync`) para atualização atômica de `item.complete` nas listas JSON.
- Interface Web `index.html`:
  - Painel simples em Bootstrap 5.3 nativo e Vue 3 para exploração das 1.150 faixas e visualização das métricas de integridade.
  - Consumo direto dos arquivos JSON em `/lyrics-list/` via `fetch()`, sem clonagem ou duplicação de dados.
  - Consulta global em tempo real (título e artistas) com restrição por gênero e paginação leve.
  - Design estritamente sem badges, utilizando indicadores textuais e pontos semânticos limpos.

### Modificado
- `scripts/pipeline-extractor.ts`:
  - Padronização do caminho de leitura e gravação de arquivos de metadados exclusivamente para `lyrics-data/metadata/{id}.json` (em vez da raiz de `lyrics-data/`).
- `scripts/dataset-audit.ts`:
  - Varredura de metadados direcionada estritamente para o subdiretório `lyrics-data/metadata/`.
- `scripts/lyrics-service.ts`:
  - Inclusão de `AbortSignal.timeout(8000)` nas requisições HTTP para evitar congelamento por conexões penduradas ou APIs lentas.
  - Remoção automática de marcações de tempo (*timestamp stripping*) em `syncedLyrics` do LRCLIB quando `plainLyrics` não estiver disponível.
  - Normalização de espaços exóticos do Unicode (`\u2005`, `\u200B`, etc.) e quebras de linha no extrator do Genius.
  - Implementação de fallback duplo inteligente: busca alternativa no LRCLIB ativada sempre que a primeira consulta não produzir candidato válido, e fallback por título isolado no Genius com filtragem pós-busca por colaboradores cadastrados.
- `scripts/text-sanitizer.ts`:
  - Elevação do ratio mínimo de similaridade de títulos para `0.75`.
  - Expansão do conjunto de pronomes da língua portuguesa e vocabulário internacional.
  - Ajuste no limiar de descarte de termos estrangeiros para `foreignScore > 30`, protegendo faixas nacionais de rap/trap com anglicismos urbanos.

## [1.1.0] - 2026-10-13

### Adicionado
- Utilitário `scripts/text-sanitizer.ts`:
  - `parseArtists`: extração de múltiplos artistas e isolamento de artista primário com proteção por *token masking* para nomes com vírgula própria (`Ryu, the Runner`, `Tyler, the Creator`, etc.).
  - `sanitizeTitle`: limpeza de ruídos em títulos (`(Ao Vivo)`, `[Ao Vivo]`, `(Remastered)`, menções de `feat`).
  - `matchArtist`: validação bidirecional normalizada (relação N-para-1) entre artista retornado por APIs e a lista de colaboradores.
  - `isTitleSimilar`: comparação tolerante de títulos baseada em tokens.
  - `isPortugueseLyrics`: validador de sanidade de letras baseado na densidade de stopwords em português vs. idiomas estrangeiros e descarte de placeholders.
- Suporte a execução CLI direta em `scripts/lyrics-service.ts` (`npx tsx scripts/lyrics-service.ts "<Musica>" "<Artistas>"`).
- Suporte a execução CLI direta em `scripts/track-metadata-service.ts` (`npx tsx scripts/track-metadata-service.ts "<Musica>" "<Artistas>"`).
- Documento `docs/DATA-SCHEMA.md` com os contratos completos de atributos de `/lyrics-list`, faixas e metadados (`/lyrics-data`).
- Guia passo a passo de instalação do Node.js (Windows) e execução com `npx tsx` no `README.md`.
- Regras de negócio 7, 8 e 9 em `docs/BUSINESS-RULES.md`.
- Documentos de planejamento `docs/planning/LYRICS-SANITY.md` e `docs/planning/METADATA-SANITY.md`.

### Modificado
- `request-genius.js`:
  - Carregamento de variáveis de ambiente via `dotenv/config` para obtenção de `GENIUS_ACCESS_TOKEN` e validação de token ausente.
- `scripts/track-metadata-service.ts`:
  - Documentação detalhada em cabeçalho contínuo explicando o fluxo de enriquecimento e cascata.
  - Consultas estruturadas com sintaxe Lucene no MusicBrainz (`recording:... AND artist:...`) com `limit=5`.
  - Consultas com parâmetros específicos e `limit=5` no iTunes e Deezer.
  - Filtragem de candidatos evitando a aceitação cega do primeiro resultado retornado (`Index 0`).
  - Salvaguarda no `mergeMetadata` impedindo a fusão de faixas quando há discrepância de duração superior a 15 segundos.
- `scripts/lyrics-service.ts`:
  - Correção na raspagem HTML de páginas do Genius: substituição de regex gulosa simples por parser com profundidade balanceada de tags `<div>`, prevenindo corte prematuro causado por cabeçalhos internos de colaboradores (`Contributors`) e garantindo a extração integral de intros e primeiras estrofes.
  - Decodificação de entidades HTML (`&#x27;`, `&quot;`, etc.) e remoção de metadados visuais do Genius no início da letra.
  - Envio obrigatório de artista primário e faixa no LRCLIB, Genius e lyrics.ovh.
  - Validação de correspondência de artista (N-para-1) e tolerância de duração cruzada.
  - Rejeição automática de letras em idiomas estrangeiros ou de músicas homônimas, promovendo fallback limpo na cascata.
- `scripts/pipeline-extractor.ts`:
  - Propagação de `knownDurationMs` (obtido tanto na extração atual quanto recuperado de arquivos `.json` existentes em extrações parciais) para validação cruzada no serviço de letras.
- `docs/ARCHITECTURE.md`:
  - Inclusão dos novos componentes na topologia do projeto.
