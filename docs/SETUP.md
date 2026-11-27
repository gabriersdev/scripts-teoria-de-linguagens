# Guia de Instalacao, Ambiente e Testes

Instrucoes para configuracao do ambiente local, instalacao de dependencias e procedimentos de verificacao e testes dos scripts do repositorio.

---

## 1. Requisitos do Sistema

O projeto integra rotinas em TypeScript (Node.js), Python, Julia, Java e .NET (C#). Para a execucao do pipeline principal de mineracao e extracao em TypeScript, os requisitos basicos sao:

- Node.js: versao 20 LTS ou superior.
- npm: versao 10 ou superior.

Para execucao do pipeline completo de analise multilíngue (`npm run analyze:all`):
- Python 3.10 ou superior (com `pip install -r requirements.txt`).
- Julia 1.10 ou superior.
- Java JDK 21 ou superior.
- .NET SDK 8.0 ou superior.

---

## 2. Instalacao do Node.js (Windows)

### Opcao A: Instalador Oficial (MSI)

1. Baixe o instalador LTS para Windows (64-bit) em: [https://nodejs.org/pt-br/download](https://nodejs.org/pt-br/download).
2. Execute o instalador baixado.
3. Avance pelas etapas padrao mantendo as configuracoes recomendadas.
4. Confirme que a opcao "Add to PATH" permanece selecionada.
5. Conclua a instalacao.

### Opcao B: Windows Package Manager (winget)

Execute no PowerShell:
```powershell
winget install OpenJS.NodeJS.LTS
```

---

## 3. Verificacao da Instalacao

Abra um terminal (PowerShell ou Command Prompt) e execute:

```bash
node -v
npm -v
```

As versoes instaladas serao exibidas (ex.: `v20.x.x` ou `v22.x.x`).

---

## 4. Instalacao de Dependencias

Na raiz do projeto, instale as dependencias declaradas no `package.json`:

```bash
npm install
```

Caso queira executar os scripts de analise de dados em Python (`data-analysis/`):

```bash
pip install -r requirements.txt
```

---

## 5. Procedimentos de Testes e Validacao

O repositorio possui rotinas de auditoria, deteccao de anomalias, verificacao de integridade e analise de paridade entre motores de regex.

### 5.1. Auditoria de Qualidade da Base

Verifica a completude dos metadados e letras em relacao as listas estaticas de `/lyrics-list`:

```bash
# Relatorio de completude no console
npm run audit

# Auditoria com sincronizacao automatica da flag 'complete' nos JSONs
npm run audit:sync
```

### 5.2. Verificacao de Duplicatas e Colisoes

Localiza IDs colididos, duplicatas no mesmo genero e duplicatas cruzadas entre generos distintos:

```bash
# Relatorio de duplicatas
npm run duplicates

# Modo com substituicao automatica de duplicatas por placeholders pendentes
npm run duplicates:replace
```

### 5.3. Teste por Amostragem de Letras

Valida o funcionamento dos provedores de letra (LRCLIB, lyrics.ovh, Genius) com faixas aleatorias:

```bash
# Testa 5 faixas aleatorias do corpus geral
npm run verify:lyrics -- 5

# Testa 10 faixas filtrando apenas o genero trap
npm run verify:lyrics -- 10 trap
```

### 5.4. Teste de Paridade Multilingue e Benchmarks

Executa em sequencia os scripts das 4 linguagens (Julia, TypeScript, Java, C#), valida a paridade de saida MD5 e reconstrói os datasets consolidados:

```bash
npm run analyze:all
```

### 5.5. Testes Pontuais dos Scripts de Mascaramento em Julia

```bash
# Executa a suite de analise oficial com exportacao do catalogo de matches
julia analysis/julia/maskSwearWords.jl --export-analysis

# Executa o utilitario pontual para uma faixa especifica
julia analysis/julia/terminalLyricsCensor.jl 98001
```

---

## 6. Scripts Operacionais de Extracao

Para execucao do fluxo de mineracao continua:

```bash
# Executa o pipeline mestre de extracao
npm run extract

# Consulta pontual de metadados de uma musica
npm run lookup:metadata -- "Nome da Musica" "Nome do Artista"

# Consulta pontual de letra de uma musica
npm run lookup:lyrics -- "Nome da Musica" "Nome do Artista"

# Higienizacao de marcadores temporais nas letras salvas
npm run sanitize:lyrics
```
