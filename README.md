# Scripts para Teoria de Linguagens

Repositório destinado à mineração, tratamento, curadoria e análise de dados (letras, metadados musicais e ISRC) para uso integrado em estudos de teoria de linguagens.

## 📚 Documentação do Projeto

O repositório está fortemente baseado em diretrizes arquiteturais e regras de negócio para assegurar escalabilidade sem chaves de API pagas. **Toda a documentação pertinente para pesquisar ou entender o funcionamento do código reside no diretório `/docs`.**

Por favor, consulte os documentos abaixo antes de modificar lógicas estruturais:

- [Arquitetura e Estrutura de Diretórios (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md): Entenda como as pastas estão divididas, qual a função de cada script (em `/scripts` e `/util`) e como é o fluxo de vida (pipeline) da mineração dos metadados.
- [Regras de Negócio (`docs/BUSINESS-RULES.md`)](docs/BUSINESS-RULES.md): Critérios de validação, limites de consumo (rate limits), preenchimento de campos e o papel vital de controle da flag `"complete"`.
- [Diretrizes de Código JavaScript/TS (`docs/CODING-GUIDELINES-JS.md`)](docs/CODING-GUIDELINES-JS.md): Regras rígidas sobre escopo, assincronismo e formatação para TypeScript e Node.
- [Regras de Commit (`docs/COMMIT-RULES.md`)](docs/COMMIT-RULES.md): Padrões obrigatórios de prefixos e mensagens para o versionamento do projeto.
- [Estruturação de Dados (`docs/DATABASE-GUIDELINES.md`)](docs/DATABASE-GUIDELINES.md): Padrões caso venha a adotar banco de dados relacionais para o JSON estático.
