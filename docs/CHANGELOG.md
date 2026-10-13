# Changelog

Todas as alterações relevantes deste projeto são documentadas neste arquivo.

## [1.1.0] - 2026-10-13

### Adicionado
- Utilitário `scripts/text-sanitizer.ts`:
  - `parseArtists`: extração de múltiplos artistas e isolamento de artista primário com proteção por *token masking* para nomes com vírgula própria (`Ryu, the Runner`, `Tyler, the Creator`, etc.).
  - `sanitizeTitle`: limpeza de ruídos em títulos (`(Ao Vivo)`, `[Ao Vivo]`, `(Remastered)`, menções de `feat`).
  - `matchArtist`: validação bidirecional normalizada (relação N-para-1) entre artista retornado por APIs e a lista de colaboradores.
  - `isTitleSimilar`: comparação tolerante de títulos baseada em tokens.
  - `isPortugueseLyrics`: validador de sanidade de letras baseado na densidade de stopwords em português vs. idiomas estrangeiros e descarte de placeholders.
- Suporte a execução CLI direta em `scripts/lyrics-service.ts` (`npx tsx scripts/lyrics-service.ts "<Musica>" "<Artistas>"`).
- Regras de negócio 7, 8 e 9 em `docs/BUSINESS-RULES.md`.
- Documentos de planejamento `docs/planning/LYRICS-SANITY.md` e `docs/planning/METADATA-SANITY.md`.

### Modificado
- `scripts/track-metadata-service.ts`:
  - Consultas estruturadas com sintaxe Lucene no MusicBrainz (`recording:... AND artist:...`) com `limit=5`.
  - Consultas com parâmetros específicos e `limit=5` no iTunes e Deezer.
  - Filtragem de candidatos evitando a aceitação cega do primeiro resultado retornado (`Index 0`).
  - Salvaguarda no `mergeMetadata` impedindo a fusão de faixas quando há discrepância de duração superior a 15 segundos.
- `scripts/lyrics-service.ts`:
  - Envio obrigatório de artista primário e faixa no LRCLIB, Genius e lyrics.ovh.
  - Validação de correspondência de artista (N-para-1) e tolerância de duração cruzada.
  - Rejeição automática de letras em idiomas estrangeiros ou de músicas homônimas, promovendo fallback limpo na cascata.
- `scripts/pipeline-extractor.ts`:
  - Propagação de `knownDurationMs` (obtido tanto na extração atual quanto recuperado de arquivos `.json` existentes em extrações parciais) para validação cruzada no serviço de letras.
- `docs/ARCHITECTURE.md`:
  - Inclusão dos novos componentes na topologia do projeto.
