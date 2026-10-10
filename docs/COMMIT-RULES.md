# Regras de Commit

## Padrão de Commits

Utilizamos o padrão [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) para manter o histórico legível e gerar changelogs automaticamente.

Formato:
```
<tipo>[escopo opcional]: <descrição>

[corpo opcional]

[rodapé opcional]
```

### Tipos Permitidos

*   **feat**: Nova feature
*   **fix**: Correção de bug
*   **docs**: Mudanças na documentação
*   **style**: Mudanças que não afetam o código (espaçamento, formatação)
*   **refactor**: Mudança que não corrige bug nem adiciona feature
*   **perf**: Melhoria de performance
*   **test**: Adição ou correção de testes
*   **chore**: Mudanças em build, dependências

## Hooks de Pré-Commit

O projeto executa os seguintes hooks antes de cada commit:

1.  **Testes**: Roda todos os testes para garantir que não há regressões.
2.  **Linting**: Valida se a mensagem de commit segue o padrão Conventional Commits.
