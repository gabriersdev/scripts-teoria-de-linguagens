# Scripts para Teoria de Linguagens

Repositorio destinado a mineracao, tratamento, curadoria e analise de dados (letras, metadados musicais e ISRC) para uso integrado em pesquisas de teoria de linguagens.

---

## Documentacao Tecnica

O projeto segue especificacoes de arquitetura, contratos estaticos de dados e diretrizes de desenvolvimento detalhadas no diretorio `/docs`:

- [**Instalacao, Ambiente e Testes (`docs/SETUP.md`)**](docs/SETUP.md): Instrucoes detalhadas para instalacao do Node.js, configuracao de dependencias e execucao de testes e rotinas de auditoria.
- [**Esquema de Dados e Atributos (`docs/DATA-SCHEMA.md`)**](docs/DATA-SCHEMA.md): Especificacao dos atributos das listas (`/lyrics-list`), faixas musicais, semantica da flag `complete` e metadados (`/lyrics-data`).
- [**Arquitetura e Diretorios (`docs/ARCHITECTURE.md`)**](docs/ARCHITECTURE.md): Mapeamento dos diretorios (`/analysis`, `/data-analysis`, `/lib`, `/scripts`, `/lyrics-data`) e fluxo do pipeline.
- [**Regras de Negocio (`docs/BUSINESS-RULES.md`)**](docs/BUSINESS-RULES.md): Criterios de integridade, mascaramento de colaboradores, fallback de APIs, limites de requisicao e regras de deteccao de termos.
- [**Regras de Commit (`docs/COMMIT-RULES.md`)**](docs/COMMIT-RULES.md): Convencoes baseadas em Conventional Commits para mensagens de historico.
- [**Changelog do Projeto (`docs/CHANGELOG.md`)**](docs/CHANGELOG.md): Registro cronologico de entregas, refatoracoes e correcoes.

### Diretrizes de Codificacao por Linguagem

- [**TypeScript / JavaScript (`docs/CODING-GUIDELINES-JS.md`)**](docs/CODING-GUIDELINES-JS.md)
- [**Julia (`docs/CODING-GUIDELINES-JULIA.md`)**](docs/CODING-GUIDELINES-JULIA.md)
- [**Python (`docs/CODING-GUIDELINES-PY.md`)**](docs/CODING-GUIDELINES-PY.md)
- [**Java (`docs/CODING-GUIDELINES-JAVA.md`)**](docs/CODING-GUIDELINES-JAVA.md)
- [**C# (`docs/CODING-GUIDELINES-CSHARP.md`)**](docs/CODING-GUIDELINES-CSHARP.md)

---

## Inicio Rapido

Para o passo a passo completo de instalacao do Node.js e execucao dos testes e auditorias do sistema, consulte o guia dedicado em [**`docs/SETUP.md`**](docs/SETUP.md).

### Comandos Principais

```bash
# Instalacao de dependencias
npm install

# Auditoria de completude do corpus
npm run audit

# Verificacao e deteccao de faixas duplicadas
npm run duplicates

# Teste por amostragem de extracao de letras
npm run verify:lyrics -- 5

# Execucao do pipeline multilingue de mascaramento e geracao de datasets
npm run analyze:all
```
