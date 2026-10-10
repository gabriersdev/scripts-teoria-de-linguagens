# Regras de Negócio (Business Rules)

Este documento define as regras lógicas e os critérios inegociáveis de extração, salvamento e validação de dados em todo o ecossistema do projeto. Nenhuma implementação futura deve contrariar os preceitos abaixo.

## 1. Regra de Blindagem de Dados (`artists`)
Scripts e rotinas automatizadas (como o `populate-artists.ts`) NUNCA devem sobrescrever um campo `artists` que já possua texto. A automação só tem permissão para atuar e escrever se o campo for nulo, indefinido ou possuir uma string vazia (`""`). Isso garante que o trabalho manual humano ou curadorias passadas nunca sejam destruídas por atualizações em massa.

## 2. O Poder e Escopo da Flag `"complete"`
A flag booleana `"complete"` atua como mecanismo primordial de controle de processamento:
- **Nível de Faixa:** Se marcada como `true` no objeto da música, a música está finalizada e imutável. Os scripts não podem gastar processamento com ela.
- **Nível Raiz (Lista):** Atua como uma chave mestra (*master switch*). Se marcada como `true` na raiz de um JSON (ex: `rock-list.json`), significa que aquele gênero e todo o seu conteúdo interno já foram consolidados. TODOS os scripts (seja automação em massa ou assistente manual) devem abortar a leitura e pular o arquivo inteiro para economizar CPU e proteger a integridade da lista.

## 3. Estratégia de APIs em Cascata (*Fallback / Merge*)
Nenhum metadado musical complexo (no `track-metadata-service.ts`) deve ser descartado em caso de falha de um único provedor. A extração segue um modelo de fusão progressiva em ordem técnica estrita:
1. **MusicBrainz** (Prioridade técnica, rico em ISRC e Tags).
2. **iTunes** (Prioridade secundária, excelente para datas de lançamento e capas).
3. **Deezer** (Excelente para fallback final e durações em milissegundos).

Se a primeira API não retornar todos os campos requeridos (ex: ausência de Capa URL), as subsequentes devem ser consultadas unicamente para completar as chaves faltantes no objeto.

## 4. Prevenção de Ambiguidade por Popularidade
Se uma música possuir um título muito genérico ou composto de apenas uma palavra e não houver um artista mapeado no arquivo JSON (ex: "VENOM", "BACKSTAGE"), a busca inicial não deve ser atirada contra provedores técnicos brutos (MusicBrainz), pois o retorno será impreciso e não-ranqueado.
Neste cenário específico, o script deve invocar primariamente APIs comerciais globais (iTunes ou Deezer) para "fisgar" a música baseada nos "Top Charts / Popularidade global", resolvendo a ambiguidade.

## 5. Rate Limiting Ético Obrigatório
Qualquer consumo ou *scraping* de APIs gratuitas e/ou não-oficiais (como o endpoint XWolf, iTunes ou MusicBrainz) exige a implementação obrigatória de Pausas Artificiais (*Delay*). No caso de extrações pesadas de álbuns e playlists, aplica-se a regra rígida de 10 segundos de delay entre as requisições para evitar recusa de servidor ou penalizações permanentes por IP (HTTP 429).

## 6. Salvamento a Quente (*Hot Reload*) Estrito
Em scripts interativos de terminal e assistentes em CLI que exijam resposta humana (`manual-artist-fill.ts`), o salvamento do arquivo JSON (I/O) deve ocorrer de forma atômica e imediata a cada tecla de confirmação (Enter) do usuário. O projeto proíbe salvamentos postergados ao final do bloco (batch save) nesses cenários, impedindo a perda de curadoria em casos de *crash* ou encerramento súbito do terminal.
