# Arquitetura do Projeto

Este documento descreve a topologia, diretórios estruturais e o fluxo principal de dados do repositório.

## 1. Estrutura de Diretórios

- **`/docs`**: Contém toda a documentação oficial do projeto (guias de código, regras de negócio, changelogs e arquitetura). Deve ser mantida atualizada a cada mudança estrutural.
- **`/lib`**: Abriga bibliotecas e clientes base que são reutilizados pelo sistema.
  - `spotify-api-client.ts`: Motor central orientado a objetos para lidar estritamente com as requisições HTTP à API do Spotify (via endpoint xwolf).
- **`/lyrics-list`**: Diretório de banco de dados estático onde residem as listas em formato JSON (separadas por gênero, como `funk-list.json`, `rock-list.json`). Estas listas guardam as faixas, IDs, artistas e as fontes de origem (URLs).
- **`/scripts`**: Contém a inteligência principal, composta por scripts executáveis (serviços e assistentes de CLI) para manipulação, extração e mineração de dados.
- **`/util`**: Scripts utilitários e de manutenção primária do repositório, executados pontualmente fora do fluxo pesado de extração.

---

## 2. Descrição dos Scripts (`/scripts`)

- **`lyrics-service.ts`**: Serviço orientado a objetos especializado na extração de letras musicais de fontes externas.
- **`track-metadata-service.ts`**: Motor principal de metadados complexos. Consome simultaneamente MusicBrainz, iTunes e Deezer para extrair ISRC, durações, datas de lançamento e gêneros. Possui lógica de mescla (merge) inteligente para nunca perder um dado ausente em uma das plataformas.
- **`populate-artists.ts`**: Automação de varredura. Ele lê todos os JSONs em `/lyrics-list`, extrai os links de álbuns e playlists do atributo `source`, conecta no Spotify e cruza essas listas massivas para auto-preencher nomes de artistas ausentes nas listas (onde `"artists": ""`).
- **`manual-artist-fill.ts`**: Assistente interativo de terminal (CLI wizard) para curadoria humana. Ele encontra as músicas pendentes, utiliza a API do iTunes para exibir sugestões em tempo real, capta a escolha do usuário e realiza um "salvamento a quente" no JSON, prevenindo perda de progresso.
- **`spotify-album-service.ts` / `spotify-playlist-service.ts`**: Scripts de terminal dedicados a permitir o teste rápido ou consulta visual de faixas de um álbum ou playlist específica a partir de sua URL.

---

## 3. Descrição dos Utilitários (`/util`)

- **`update-lyrics-list-ids.ts`**: Ferramenta de integridade estrutural. Varre todas as listas no `/lyrics-list` analisando o total de itens, concatenando e atribuindo sequencialmente identificadores (IDs) numéricos únicos (ex: `98001, 98002...`) para as faixas, garantindo controle em banco de dados futuro.

---

## 4. Fluxo de Vida dos Metadados

1. O projeto é alimentado com dados crus e incompletos nos arquivos de `/lyrics-list`.
2. O `util/update-lyrics-list-ids.ts` garante que todos os itens tenham um ID matemático relacional.
3. O `scripts/populate-artists.ts` intercepta as listas usando links oficiais e cruza os títulos automatizando 80% do preenchimento de artistas.
4. Os 20% restantes que possuem nomenclaturas complexas são filtrados pelo `scripts/manual-artist-fill.ts`, finalizando a curadoria.
5. Com Título + Artista puros em mãos e a lista blindada, o `scripts/track-metadata-service.ts` atua coletando as propriedades musicais técnicas definitivas (ISRC, capa, tempo).
