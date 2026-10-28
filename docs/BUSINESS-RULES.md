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

