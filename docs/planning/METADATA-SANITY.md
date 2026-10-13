# Planejamento: Validação e Sanidade de Metadados (Metadata Sanity)

## 1. Contexto e Diagnóstico

Na extração atual de metadados (`TrackMetadataService`), ocorrem problemas semelhantes aos observados nas letras:
- Metadados vinculados a gravações incorretas ou homônimas de outros artistas.
- "Frankenstein" de metadados: partes dos metadados (ISRC, capa, ano, duração) vindas de faixas completamente diferentes, unificadas cegamente via `mergeMetadata`.
- Alto índice de falhas (`Metadados insuficientes`) em faixas com muitos colaboradores (feats).

### Análise da Causa Raiz Técnica no `track-metadata-service.ts`

| Problema Identificado | Trecho / Comportamento Atual | Consequência |
| :--- | :--- | :--- |
| **1. String Bruta Poluída** | `const query = artist ? `${title} ${artist}` : title;` passando toda a string de artistas (ex.: `"Cacife Clandestino, WC no Beat, Felp 22, Medellin..."`) | O motor de busca das APIs (Lucene no MusicBrainz, Search da Apple e Deezer) recebe dezenas de tokens e vírgulas, degradando o score e retornando compilações irrelevantes ou 0 resultados. |
| **2. Falta de Filtros Estruturados** | MusicBrainz usa busca simples sem sintaxe de campos; Deezer não usa `track:"..." artist:"..."`. | A busca vira texto livre impreciso, favorecendo palavras soltas em vez de par exato artista/faixa. |
| **3. Seleção Cega do Primeiro Item (`Index 0`)** | `data.recordings[0]`, `limit=1` no iTunes (`results[0]`) e `limit=1` no Deezer (`data[0]`). | Se a primeira faixa retornada for homônima ou errada, ela é aceita imediatamente sem conferir título ou artista. |
| **4. Fusão Não-Validada (`mergeMetadata`)** | Provedor 2 preenche campos vazios deixados pelo Provedor 1 sem checar se ambos referenciam a mesma música. | Pode gravar o ISRC de uma banda e a capa de álbum de outra banda no mesmo arquivo `.json`. |
| **5. Ruído em Títulos** | Títulos com sufixos como `(Ao Vivo)`, `- Ao Vivo`, `(Remastered)`, `feat. X`. | Reduz a chance de match em bancos rígidos como o MusicBrainz. |

---

## 2. Arquitetura Proposta da Solução

```
[Entrada: Título + String de Artistas]
                  │
                  ▼
┌────────────────────────────────────────────────────────┐
│ 1. Pré-processamento e Sanitização de Entrada          │
│    - Token masking de exceções ("Ryu, the Runner")     │
│    - Extração: Artista Primário + Lista de Artistas    │
│    - Limpeza de Título (remoção de sufixos de ruído)   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Consultas Estruturadas por API                      │
│    - MusicBrainz: Sintaxe Lucene (recording + artist)  │
│    - iTunes: Busca por Artista Primário + Faixa        │
│    - Deezer: Sintaxe estruturada track:... artist:...  │
│    - Buscar múltiplos resultados (limit: 5 a 10)       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Filtro e Scoring de Candidatos                      │
│    - Validar similaridade de título (mín. 70%)         │
│    - Validar artista retornado vs. Qualquer da lista   │
│    - Selecionar o melhor candidato (não o cego index 0)│
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Fusão Segura de Metadados (Cross-Validation)        │
│    - Provedor B só agrega ao Provedor A se duração     │
│      for consistente (±10s) e artista for compatível   │
└────────────────────────────────────────────────────────┘
```

---

## 3. Detalhamento Técnico das Etapas

### Etapa 1: Pré-processamento e Sanitização

1. **Separação Confiável de Artistas:**
   - Aplicar a mesma lógica de *Token Masking* (`LYRICS-SANITY.md`):
     - Mascarar nomes com vírgula própria (`Ryu, the Runner`, `Tyler, the Creator`).
     - Quebrar por vírgula para gerar array limpo de artistas.
     - Isolar `primaryArtist` (`artists[0]`) e `allArtists`.
2. **Normalização de Títulos:**
   - Criar uma versão "limpa" para busca:
     - Remover sufixos: `(Ao Vivo)`, `[Ao Vivo]`, `- Ao Vivo`, `(Live)`, `(Remastered)`.
     - Remover menções de feat embutidas no título: `(feat. ...)`, `(ft. ...)`.
   - Manter o título original preservado para registro final.

---

### Etapa 2: Estratégias Específicas por Provedor

#### A. MusicBrainz
- **Problema atual:** Envia string livre com vírgulas no parâmetro `query`.
- **Estratégia melhorada:**
  - Utilizar sintaxe de campos Lucene:
    ```
    recording:"<titleClean>" AND artist:"<primaryArtist>"
    ```
  - Se retornar vazio e houver colaboradores secundários, tentar fallback com `artist:"<secondaryArtist>"`.
  - Trazer até 5 gravações (`limit=5`) para ranquear a melhor correspondência em vez de pegar apenas a primeira.

#### B. iTunes
- **Problema atual:** Passa `limit=1` e concatena todos os artistas na query.
- **Estratégia melhorada:**
  - Passar `term=<titleClean> <primaryArtist>&entity=song&limit=5`.
  - Percorrer a lista de resultados e escolher o primeiro cujo `artistName` case com qualquer artista da faixa cadastrada e cujo `trackName` seja similar ao título procurado.

#### C. Deezer
- **Problema atual:** Busca genérica livre sem prefixos com `limit=1`.
- **Estratégia melhorada:**
  - Usar busca estruturada: `q=track:"<titleClean>" artist:"<primaryArtist>"&limit=5`.
  - Fallback: Se não encontrar com busca estruturada, usar query combinada limpa: `q=<titleClean> <primaryArtist>&limit=5`.
  - Validar artista e título nos itens retornados antes de consultar o endpoint de detalhe `/track/{id}`.

---

### Etapa 3: Validador de Sanidade do Candidato (Sanity Check)

Ao receber a lista de resultados de qualquer API, iterar sobre os candidatos e aprovar apenas o que passar pelas regras:

1. **Validação de Título:**
   - Normalizar strings (remover acentuação, caracteres especiais e caixa alta).
   - O título retornado deve ter alta similaridade com o título buscado (ou conter um ao outro).
2. **Validação de Artista (Relação N-para-1):**
   - O artista retornado pela API deve corresponder a **qualquer um** dos colaboradores da faixa (comparação normalizada).
   - Se o resultado for de outro artista não listado na música, o candidato é descartado.
3. **Validação de Duração (se já houver duração prévia de outro provedor):**
   - Tolerância de até `±12 segundos`. Diferença superior sugere regravação, versão estendida ou erro.

---

### Etapa 4: Fusão Consistente (`mergeMetadata`)

Modificar o `mergeMetadata` para operar com segurança:
- **Não misturar faixas divergentes:** Antes de incorporar campos de um provedor secundário (ex.: iTunes) sobre metadados iniciados por outro (ex.: MusicBrainz), verificar se:
  - O artista retornado pelo provedor secundário é compatível com os artistas já estabelecidos.
  - A duração difere em menos de 10 segundos (caso ambos tenham duração).
- Se houver inconsistência grave, descartar os dados adicionais desse provedor secundário para não contaminar a integridade dos metadados já confirmados.

---

## 4. Matriz de Decisão: Busca e Seleção de Metadados

| Cenário | Consulta Enviada | Critério de Aceite | Ação em caso de Falha |
| :--- | :--- | :--- | :--- |
| **Artista Único** | `Faixa + Artista` | Título similar + Artista compatível | Tenta próxima API da cascata |
| **Múltiplos Artistas (Feats)** | `Faixa + Artista Primário` | Título similar + Artista da API bate com qualquer um da lista | Tenta 2º artista ou próxima API da cascata |
| **Artista com vírgula própria** | Preserva nome via máscara na busca | Título similar + Artista compatível | Tenta busca sem máscara ou próxima API |
| **Título com sufixo (Ao Vivo/Remaster)** | Busca com título limpo | Título da API similar ao título limpo | Tenta título bruto ou próxima API |
| **Divergência entre APIs** | Fusão de Provedores | Duração com variação menor que 10s | Rejeita dados secundários, mantém o primeiro |

---

## 5. Checklist de Tarefas Propostas

- [x] Integrar utilitário compartilhado de token masking e normalização de artistas em `TrackMetadataService`.
- [x] Implementar limpador de títulos para remoção de ruídos (`(Ao Vivo)`, `feat.`, etc.).
- [x] Atualizar consulta do MusicBrainz para sintaxe Lucene estruturada (`recording:... AND artist:...`) com `limit=5`.
- [x] Atualizar consulta do iTunes para usar título limpo + artista primário e `limit=5`.
- [x] Atualizar consulta do Deezer para sintaxe `track:... artist:...` e `limit=5`.
- [x] Implementar função de scoring e seleção do melhor candidato entre os resultados retornados.
- [x] Implementar salvaguarda em `mergeMetadata` para evitar união de faixas com durações ou artistas divergentes.
- [x] Atualizar orquestrador `pipeline-extractor.ts` com validação cruzada de metadados e duração.
