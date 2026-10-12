# Planejamento: Validação e Sanidade de Letras (Lyrics Sanity)

## 1. Contexto e Diagnóstico

Durante a extração automatizada de letras (`pipeline-extractor.ts`), observou-se a ocorrência de falsos positivos:
- Letras em idiomas estrangeiros (inglês, espanhol, etc.) atribuídas a faixas brasileiras.
- Músicas homônimas de outros artistas (ex.: faixas com títulos comuns como "Aquário", "Coração", "Intro" vinculadas ao primeiro resultado retornado pelas APIs).

### Causa Raiz Técnica
1. **Busca cega por título:** O método `getLyrics(songName, p0)` em `LyricsService` recebe a string de artistas no segundo parâmetro, mas não a utiliza nas requisições.
2. **Falta de parâmetros dedicados:** A chamada ao LRCLIB utiliza `?q=${songName}` em vez de especificar `track_name` e `artist_name`.
3. **Seleção do primeiro resultado:** O retorno da API é consumido pegando o primeiro item não-instrumental (`results.find(...)`), sem conferir se o artista bate com o artista original da faixa.
4. **Ausência de filtros textuais:** Não há validação de idioma ou conferência de duração antes de gravar o arquivo `.txt` em disco.

---

## 2. Arquitetura da Solução em 4 Camadas

```
[Entrada: Faixa + Artistas]
          │
          ▼
┌────────────────────────────────────────┐
│ 1. Refinamento de Busca (Origem)       │  -> Query composta (Artista Primário + Faixa)
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 2. Validação de Metadados da Resposta  │  -> Match de artista retornado + Duração
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 3. Validação Textual e Idioma          │  -> Análise de Stopwords (PT-BR)
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 4. Fluxo de Cascata e Decisão          │  -> Aceite (.txt) ou Fallback para próxima API
└────────────────────────────────────────┘
```

---

## 3. Detalhamento das Camadas

### Camada 1: Refinamento de Busca na Origem
- **Tratamento de Múltiplos Artistas e Nomes com Vírgula:**
  - A base de faixas armazena colaboradores separados por vírgula (ex.: `"Cacife Clandestino, WC no Beat, Felp 22"`).
  - **Exceções de Nomes Próprios com Vírgula:** Artistas como `"Ryu, the Runner"`, `"Tyler, the Creator" (apenas e.g.)` ou `"Earth, Wind & Fire" (apenas e.g.)` possuem vírgulas intrínsecas ao nome artístico. Um `split(',')` direto quebraria o nome em fragmentos inválidos (`"Ryu"` e `"the Runner"`).
  - **Estratégia de Token Masking (Pré-Split):**
    - Manter uma lista de exceções conhecidas (`['Ryu, the Runner', 'Tyler, the Creator', 'Earth, Wind & Fire']`).
    - Substituir temporariamente a vírgula desses nomes por um placeholder seguro (ex.: `__COMMA__`).
    - Executar o split por vírgula nos separadores reais e restaurar o placeholder nos itens resultantes.
    - O resultado é uma lista estruturada de candidatos limpos: `["Cacife Clandestino", "WC no Beat", "Felp 22"]` ou `["Ryu, the Runner", "Veigh"]`.
- **Definição da Busca:**
  - **Artista Primário:** O primeiro artista da lista estruturada (`artists[0]`) é o alvo prioritário de consulta nas APIs.
  - **LRCLIB:** Utilizar os parâmetros dedicados `track_name` e `artist_name=${primaryArtist}`, ou query composta `q=${primaryArtist} ${songName}`.
  - **Genius:** Buscar por `${primaryArtist} ${songName}`.
  - **Lyrics.ovh:** Enviar explicitamente o artista primário no endpoint.

### Camada 2: Validação de Metadados do Provedor (Relação 1:N)
Na maioria dos casos, APIs como LRCLIB registram apenas **um** artista (o autor principal ou o produtor), enquanto nossa base pode ter de 3 a 5 colaboradores:
- **Critério de Validação N-para-1:**
  - O retorno da API não precisa conter todos os colaboradores.
  - O resultado é considerado válido se o `artistName` retornado pela API corresponder a **qualquer um** dos artistas válidos da faixa obtidos no split limpo (com preferência pelo artista primário, mas aceitando colaboradores creditados).
- **Correspondência de Artista:**
  - Normalizar ambas as strings (remover acentos, pontuações extras e converter para minúsculas).
  - Verificar contenção bidirecional: o artista retornado da API contém ou está contido em um dos artistas da faixa (ex.: se a faixa tem `["Cacife Clandestino", "WC no Beat"]` e o LRCLIB retorna `"WC no Beat"`, a correspondência é aceita).
  - Se o retorno da API não bater com nenhum dos artistas da lista, descartar imediatamente.
- **Conferência de Duração (LRCLIB):**
  - O LRCLIB retorna a duração em segundos (`duration`).
  - Caso os metadados da faixa já possuam a duração (via Deezer/iTunes em segundos), comparar os valores.
  - Tolerância aceitável: margem de até `±10 segundos`. Diferenças maiores indicam faixas homônimas, remixes ou versões estendidas.

### Camada 3: Validação Textual e Detecção de Idioma
Garantir que o conteúdo do texto seja condizente com o corpus da pesquisa:
- **Detecção de Idioma via Stopwords:**
  - Analisar a frequência de termos estruturais do português: `que`, `não`, `com`, `para`, `você`, `se`, `um`, `uma`, `do`, `da`.
  - Comparar com a presença de termos exclusivos do inglês (`the`, `you`, `and`, `to`, `is`) ou espanhol (`los`, `las`, `del`, `pero`).
  - Se a densidade de stopwords em língua estrangeira for superior à do português, a letra é descartada.
- **Filtro de Placeholders:**
  - Rejeitar textos curtos que contenham apenas avisos como *"Instrumental"*, *"Paroles non disponibles"*, *"Lyrics not found"*.

### Camada 4: Gestão do Fluxo de Cascata
- **Rejeição Inteligente (Fallback):**
  - Se a letra obtida no `lrclib` for reprovada em qualquer camada, a execução **não é abortada**.
  - O pipeline avança automaticamente para o próximo provedor na ordem:
    1. `lrclib`
    2. `lyrics.ovh`
    3. `genius`
- **Integridade da Base:**
  - Caso nenhum provedor entregue uma letra aprovada em todos os critérios, o arquivo `.txt` **não é criado**.
  - A faixa recebe o status `complete: 1` (metadados salvos, letra pendente para intervenção ou novas fontes).

---

## 4. Matriz de Decisão e Critérios de Aceite

| Etapa                   | Critério                                                                        | Ação em caso de Sucesso                                       | Ação em caso de Falha                             |
|:------------------------|:--------------------------------------------------------------------------------|:--------------------------------------------------------------|:--------------------------------------------------|
| **Parsing de Artistas** | Token masking de exceções (ex.: "Ryu, the Runner") antes de quebrar por vírgula | Gera array consistente de artistas candidatos                 | N/A (usa string integral se não houver vírgula)   |
| **Artista**             | Artista retornado da API corresponde a qualquer um dos colaboradores da faixa   | Prossegue para validação de duração/texto                     | Descarta resultado e tenta próxima API da cascata |
| **Duração**             | Duração da API difere em até `±10s` dos metadados da faixa                      | Prossegue para validação textual                              | Descarta resultado e tenta próxima API da cascata |
| **Idioma**              | Predomínio de vocabulário e stopwords em português                              | Salva `/lyrics-data/lyrics/{id}.txt` e marca `complete: true` | Descarta resultado e tenta próxima API da cascata |
| **Cascata Esgotada**    | Todas as fontes foram consultadas e nenhuma foi aprovada                        | N/A                                                           | Não grava arquivo `.txt`, define `complete: 1`    |

---

## 5. Checklist de Tarefas Propostas

- [ ] Criar lista de exceções de artistas com vírgula no nome (`Ryu, the Runner`, `Tyler, the Creator`, etc.).
- [ ] Implementar utilitário de split inteligente com *token masking* para transformar string de artistas em array limpo.
- [ ] Ajustar assinatura de `getLyrics` em `scripts/lyrics-service.ts` para receber e utilizar `artists`.
- [ ] Atualizar chamadas das APIs para incluir artista primário e título nas buscas (LRCLIB, Lyrics.ovh, Genius).
- [ ] Implementar validador de correspondência multi-artista N-para-1 (aceita match com qualquer colaborador da faixa).
- [ ] Implementar validador de tolerância de duração (LRCLIB vs. Metadados salvos).
- [ ] Implementar validador leve de idioma baseado em stopwords do português.
- [ ] Atualizar logs de terminal para sinalizar descartes com clareza (ex.: `Letra descartada (artista divergente)` ou `Letra descartada (idioma estrangeiro)`).
