# Planejamento: Expansão de Métricas e Insights Analíticos

Este documento especifica a inclusão de novas dimensões estatísticas, linguísticas e computacionais no notebook `data-analysis/swearWordsDataAnalysis.ipynb` e nos relatórios de análise, aproveitando dados consolidados já disponíveis em `/data-analysis/datasets/` e `/lyrics-data/metadata/` que não foram incorporados na versão inicial.

---

## 1. Diagnóstico: Cobertura Atual vs. Potencial dos Dados

| Dimensão Analítica | Estado Atual no Notebook | Dados Disponíveis Não Utilizados | Ganho com a Expansão |
| :--- | :--- | :--- | :--- |
| **Nível de Faixa (Track-level)** | Omitido. Análise apenas agregada por gênero/década/artista. | `tracksDataset.csv` (1.150 faixas com contagem, densidade e termos únicos). | Identificação de músicas recordistas, outliers de densidade e amplitude vocabular. |
| **Colaborações (Feats vs. Solo)** | Omitido. Artistas analisados isoladamente em ranking simples. | Lista de colaboradores por faixa via `split_artists` em `tracksDataset.csv`. | Demonstração do impacto de parcerias e cyphers no aumento da taxa de explicitude. |
| **Morfologia e Regex** | Omitido. Apenas contagem dos termos canônicos agregados. | `swearMatchesDetail.csv` (5.244 correspondências exatas em `matched_text`). | Estudo de alongamentos fonéticos, autocensura gráfica (`*`/`#`) e flexão de gênero. |
| **Concentração Lexical (Pareto)** | Gráfico de barras simples com Top 25 termos isolados. | `swearWordsOverall.csv` com difusão e participação percentual de 159 termos. | Curva de Pareto acumulada (80/20) e auditoria de 60 termos com zero ocorrências. |
| **Riqueza Vocabular (TTR)** | Tabelas desconectadas de top palavras do vocabulário. | `genreSummary.csv` com `raw_tokens`, `filtered_tokens` e `unique_words`. | Cálculo do *Type-Token Ratio* (TTR) cruzado com a proporção de termos obscenos. |
| **Efeito Época vs. Efeito Estilo** | Gráficos temporais agregados que distorcem a evolução real. | `decadeByGenreSummary.csv` cruzando década e gênero musical. | Desacoplamento analítico: comprovar se o aumento temporal decorre do gênero ou da época. |
| **Latência dos Compiladores** | Apenas média geral e dispersão com linha de tendência. | `benchmarkLinearity.csv` com 4.600 execuções individuais (4 linguagens x 1.150 faixas). | Estatística de cauda longa (P50, P95, P99), detecção de pausas de GC e JIT warm-up. |

---

## 2. Especificação Técnica dos Novos Módulos

### Módulo 1: Análise Individual de Faixas e Casos Extremos

#### Origem dos Dados
- Arquivo: `data-analysis/datasets/tracksDataset.csv`
- Colunas: `track_id`, `title`, `primary_artist`, `genre`, `characters`, `swear_count`, `unique_swear_terms`, `swear_density_per_1k_chars`.

#### Métricas e Fórmulas
1. **Densidade Normalizada:**
   $$\text{swear\_density\_per\_1k\_chars} = \left( \frac{\text{swear\_count}}{\text{characters}} \right) \times 1000$$
2. **Índice de Concentração Ofensiva:**
   $$\text{offensive\_repetition\_ratio} = \frac{\text{swear\_count}}{\text{unique\_swear_terms}}$$
   - Mede se a faixa utiliza palavrões de forma repetitiva (refrão em loop) ou se possui repertório lexical variado.

#### Casos de Referência Identificados no Corpus
- **Maior Volume Absoluto:** *Nada Pra Fazer (Casa das P\*)* (MC GP / Funk) — 191 ocorrências, 13 termos distintos.
- **Maior Densidade Relativa:** *Olha o Tamanho Dessa Onda* (d.silvestre / Funk) — 47,48 ocorrências / 1.000 caracteres (~4,7% do texto total).
- **Maior Diversidade Lexical:** *Nada Pra Fazer (Casa das P\*)* — 13 termos únicos do catálogo.

#### Entregáveis Visuais
- Tabela formatada das Top 10 faixas em volume absoluto e Top 10 em densidade por 1.000 caracteres.
- Gráfico de dispersão: Tamanho da Letra (`characters`) no eixo X vs. Volume de Obscenidades (`swear_count`) no eixo Y, colorido por gênero.

---

### Módulo 2: O "Efeito Feat" (Faixas Solo vs. Colaborações)

#### Origem dos Dados
- Arquivo: `data-analysis/datasets/tracksDataset.csv`
- Variável derivada: `is_feat = artists.str.contains(",")` (com aplicação de máscara para exceções como `"Ryu, the Runner"`).

#### Métricas de Comparação no Corpus Atual (1.150 faixas)

| Categoria | Faixas | Prevalência (% com palavrão) | Média de Palavrões/Faixa | Densidade Média (/1k chars) |
| :--- | :---: | :---: | :---: | :---: |
| **Música Solo** | 610 | **37,21%** | **2,89** | 1,52 |
| **Colaboração (Feat)** | 540 | **75,74%** | **6,45** | 2,97 |

#### Entregáveis Visuais
- Gráfico de barras duplas comparando Prevalência (%) e Média de Ocorrências entre Solo vs. Feat.
- Boxplot comparativo da distribuição de densidade em escala logarítmica.

---

### Módulo 3: Variações Morfológicas, Fonéticas e Autocensura

#### Origem dos Dados
- Arquivo: `data-analysis/datasets/swearMatchesDetail.csv`
- Colunas: `track_id`, `genre`, `matched_text`, `canonical_term`.

#### Frentes de Investigação
1. **Alongamento Fonético:**
   - Detecção de repetição de caracteres pelo padrão regex elástico $c+$.
   - Contagem de variantes gráficas por termo canônico (ex.: `foda` com 5 formas registradas; `puta` com 5 formas).
2. **Presença de Autocensura Textual na Origem:**
   - Filtragem de ocorrências contendo caracteres de máscara: `matched_text.str.contains(r"[\*#]")`.
   - Ocorrências identificadas: `p*ta` (3 ocorrências), `F*DA` (1), `k*ralho` (1), `p*rra` (1).
3. **Distribuição de Flexão de Gênero (`[X]`):**
   - Agrupamento das capturas terminadas em `-o`/`-os` versus `-a`/`-as` para termos flexionáveis como `arrombad[X]`, `fudid[X]` e `tarad[X]`.

#### Entregáveis Visuais
- Tabela das variantes morfológicas mais comuns com frequência relativa.
- Painel de auditoria das correspondências capturadas com autocensura editorial.

---

### Módulo 4: Curva de Pareto e Assertividade do Catálogo

#### Origem dos Dados
- Arquivo: `data-analysis/datasets/swearWordsOverall.csv`
- Colunas: `canonical_term`, `occurrences`, `tracks_with_term`, `diffusion_pct`, `share_of_swears_pct`.

#### Métricas Calculadas
1. **Concentração Acumulada:**
   $$\text{cumsum\_share}_k = \sum_{i=1}^{k} \text{share\_of\_swears\_pct}_i$$
   - **Top 5 termos:** Concentram **43,8%** de todas as ocorrências (`puta`, `senta`, `foda`, `caralho`, `porra`).
   - **Top 10 termos:** Concentram **59,5%** do volume total.
   - **Ponto de Corte 80%:** Atingido com **23 termos** (14,4% do dicionário de 159 termos).
2. **Índice de Ociosidade do Dicionário:**
   $$\text{idle\_terms\_pct} = \left( \frac{\text{termos com } 0 \text{ ocorrências}}{\text{total de termos}} \right) \times 100 = \frac{60}{159} \times 100 = \mathbf{37,7\%}$$

#### Entregáveis Visuais
- Gráfico de Pareto: Barras verticais para os Top 30 termos com linha de porcentagem acumulada sobreposta no eixo secundário e linha horizontal de corte em 80%.
- Tabela resumo dos termos com zero ocorrências categorizados por hipótese (regionalismo, arcaísmo ou vocábulo formal).

---

### Módulo 5: Riqueza Lexical (TTR) vs. Explicitude

#### Origem dos Dados
- Arquivo: `data-analysis/datasets/genreSummary.csv`
- Colunas: `genre`, `raw_tokens`, `filtered_tokens`, `unique_words`, `total_swears`.

#### Métricas
1. **Type-Token Ratio (TTR):**
   $$\text{TTR} = \left( \frac{\text{unique\_words}}{\text{filtered\_tokens}} \right) \times 100$$
2. **Fração Obscena do Vocabulário:**
   $$\text{swear\_token\_share} = \left( \frac{\text{total\_swears}}{\text{raw\_tokens}} \right) \times 100$$

#### Matriz de Comportamento Lexical por Gênero

| Gênero | TTR (%) | Swear Token Share (%) | Palavras Únicas | Classificação Lexical |
| :--- | :---: | :---: | :---: | :--- |
| **Rock** | **22,68%** | 0,44% | 4.368 | Alta diversidade lexical / Baixa explicitude |
| **Rap** | **20,91%** | 0,69% | 11.301 | Alta diversidade lexical / Baixa explicitude |
| **Trap** | **20,25%** | 1,61% | 7.701 | Média diversidade / Média explicitude |
| **Trap Extra** | **20,19%** | 1,48% | 6.366 | Média diversidade / Média explicitude |
| **Sertanejo** | **14,68%** | 0,30% | 3.382 | Baixa diversidade / Mínima explicitude |
| **Funk** | **13,96%** | **3,20%** | 5.433 | Baixa diversidade (alta repetição) / Máxima explicitude |

#### Entregáveis Visuais
- Gráfico de quadrantes (Scatter plot): TTR (%) no eixo X vs. Swear Token Share (%) no eixo Y, demarcando os quatro perfis de estilo musical.

---

### Módulo 6: Decomposição Temporal Controlada (Época vs. Gênero)

#### Origem dos Dados
- Arquivo: `data-analysis/datasets/decadeByGenreSummary.csv`
- Colunas: `decade`, `genre`, `total_tracks`, `tracks_with_swear`, `tracks_with_swear_pct`, `total_swears`, `avg_swears_per_track`.

#### Hipótese e Diagnóstico
A análise agregada por década sugere erroneamente que toda a produção musical brasileira se tornou mais explícita a partir de 2010. A matriz controlada por gênero isola os fatores:
- O Rock manteve média histórica estável entre 2000s (0,53), 2010s (0,56) e 2020s (0,57).
- O Sertanejo permaneceu praticamente isento até a década de 2010 (0,11), com discreta elevação nos anos 2020 (1,09).
- A elevação acentuada no corpus pós-2010 decorre da consolidação de dois novos gêneros ausentes nas décadas anteriores da amostragem: Funk (saltando de 5,95 para 12,57) e Trap (5,55 a 8,08).

#### Entregáveis Visuais
- Mapa de calor (*heatmap*): Linhas = Décadas, Colunas = Gêneros, Valores = `avg_swears_per_track`.
- Gráfico de linhas multifacetado mostrando a trajetória individual de cada gênero ao longo das décadas.

---

### Módulo 7: Estatística de Compiladores e Latência em Cauda Longa

#### Origem dos Dados
- Arquivo: `data-analysis/datasets/benchmarkLinearity.csv`
- Colunas: `language`, `characters`, `matching_us`, `ns_per_char`.

#### Métricas de Distribuição de Tempo de Busca ($\mu s$)

| Linguagem | P50 (Mediana) | P95 | P99 | Máximo | Relação Máximo / P50 | Diagnóstico do Runtime |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Julia** | **23,9 $\mu s$** | **56,0 $\mu s$** | **79,8 $\mu s$** | **128,6 $\mu s$** | **5,4x** | Alta previsibilidade; motor PCRE com overhead mínimo de alocação. |
| **TypeScript** | 24,7 $\mu s$ | 93,1 $\mu s$ | 161,0 $\mu s$ | 2.427,5 $\mu s$ | **98,3x** | Mediana excelente no V8, mas suscetível a pausas de otimização/GC. |
| **Java** | 132,9 $\mu s$ | 420,8 $\mu s$ | 613,0 $\mu s$ | 5.008,6 $\mu s$ | **37,7x** | Custo de aquecimento de JIT (C2 compiler) e pausas de Stop-The-World. |
| **C#** | 247,6 $\mu s$ | 579,4 $\mu s$ | 818,9 $\mu s$ | 3.770,3 $\mu s$ | **15,2x** | Instabilidade moderada de warm-up na engine de regex gerenciada. |

#### Entregáveis Visuais
- Boxplots com escala logarítmica comparando as distribuições de tempo de busca das 4 engines.
- Tabela analítica com os percentis P50, P75, P90, P95 e P99.

---

## 3. Checklist de Implementação no Notebook

- [ ] **Seção 2 (Benchmark):** Inserir célula de cálculo e visualização de percentis (P50 a P99) em boxplot logarítmico a partir de `benchmarkLinearity.csv`.
- [ ] **Seção 3 (Frequência e Difusão):** Inserir gráfico de Pareto com linha de corte em 80% e tabela analítica dos termos com zero ocorrências.
- [ ] **Seção 3.1 (Morfologia):** Inserir carregamento de `swearMatchesDetail.csv` com tabela das variantes fonéticas mais frequentes e levantamento de correspondências com autocensura.
- [ ] **Seção 4 (Gênero e Década):** Substituir a visão temporal simples pelo heatmap cruzado de `decadeByGenreSummary.csv` e pelo gráfico de dispersão TTR vs. Densidade de Obscenidade.
- [ ] **Seção 4.1 (Artistas e Colaborações):** Adicionar análise comparativa de faixas Solo vs. Feat (prevalência, média e densidade).
- [ ] **Seção 4.2 (Músicas Extremas):** Inserir tabela de recordistas por faixa (`tracksDataset.csv`) ranqueada por total de ocorrências e densidade por 1.000 caracteres.
