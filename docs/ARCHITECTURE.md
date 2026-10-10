# Arquitetura do Projeto

## Estrutura de Diretórios

- **`/docs`**: Documentação oficial (guias de código, regras de negócio, changelogs e arquitetura). Atualize a cada mudança estrutural.
- **`/lib`**: Bibliotecas e clientes base reutilizados pelo sistema.
  - `spotify-api-client.ts`: Motor orientado a objetos para lidar com requisições HTTP à API do Spotify (via endpoint xwolf).
- **`/lyrics-list`**: Listas JSON estáticas (separadas por gênero, como `funk-list.json`). Guardam faixas, IDs, artistas e URLs de origem.
- **`/scripts`**: Serviços e assistentes de CLI para extração e mineração de dados.
- **`/util`**: Scripts utilitários de manutenção executados fora do fluxo principal.

## Scripts (`/scripts`)

- **`lyrics-service.ts`**: Extrai letras musicais de fontes externas.
- **`track-metadata-service.ts`**: Motor de metadados. Consome MusicBrainz, iTunes e Deezer para extrair ISRC, duração, lançamento e gênero. Faz merge inteligente para não perder dados ausentes em uma plataforma.
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
