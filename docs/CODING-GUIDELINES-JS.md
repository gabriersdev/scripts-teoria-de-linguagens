# Diretrizes de Codificação

Este documento fornece diretrizes para manter o padrão de código no projeto em JavaScript e TypeScript.

## Padrões de Nomenclatura

- Arquivos e Diretórios: 
    - Componentes React/UI: `PascalCase.jsx` ou `PascalCase.tsx` (ex: `UserCard.tsx`).
    - Estilos e Utilitários: `kebab-case.js` ou `camelCase.ts` (ex: `date-utils.ts` ou `apiClient.js`).
- Variáveis e Funções: Utilize `camelCase` (ex: `getUserData`, `isLoggedIn`).
- Classes e Componentes: Utilize `PascalCase` (ex: `class UserService`, `function Button()`).
- Constantes Globais: Utilize `UPPER_SNAKE_CASE` (ex: `API_BASE_URL`).
- Prefira nomear variáveis e funções em inglês (US) para manter a uniformidade com bibliotecas externas.

## Boas Práticas e Organização de Código

- Uso de Variáveis: Use `const` por padrão. Use `let` apenas se a variável precisar ser reatribuída. Nunca use `var`.
- Funções Puras e Imutabilidade: Prefira escrever funções puras e evite mutações diretas em objetos e arrays. Utilize métodos como `map`, `filter`, `reduce` ou o operador *spread* (`...`).
- Funções Assíncronas: Utilize `async/await` ao invés de callbacks ou `.then().catch()` encadeados para melhorar a legibilidade e o controle de erros.
- Early Return (Retorno Antecipado): Evite aninhamentos profundos de blocos `if/else`. Inverta a lógica de checagem para retornar erros ou casos base o mais cedo possível.
- Desestruturação: Utilize a desestruturação (destructuring) de objetos e arrays para extrair valores de forma mais limpa.
    - Ex: `const { name, age } = user;` em vez de `const name = user.name;`

## Padrões Específicos para Front-end / React

- Hooks: Utilize sempre os React Hooks (`useState`, `useEffect`, etc.) para gerenciar estado e ciclo de vida ao invés de componentes de classe.
- Componentização: Quebre componentes muito grandes (especialmente os com mais de 100 linhas) em componentes menores e reutilizáveis, compondo-os posteriormente.
- Estilização: Se utilizar classes utilitárias ou bibliotecas de UI (como Bootstrap, Tailwind, Material-UI), evite criar classes CSS personalizadas, a menos que seja estritamente necessário. Centralize lógica complexa de grid ou flexbox em componentes de layout genéricos.

## Padronização

- Estilo de Código: Utilize ferramentas como `ESLint` para garantir a consistência de sintaxe e regras da equipe, e `Prettier` para formatação automática de código.
- Indentação: O padrão da comunidade é utilizar 2 espaços.
- Armazenamento Local: Ao utilizar `localStorage` ou `sessionStorage`, adote um prefixo padrão do projeto (ex: `nome-do-projeto-chave`) para evitar conflitos com outros projetos que rodem no mesmo domínio.

## Testes Automatizados

- Escreva testes unitários para funções utilitárias e regras de negócio usando bibliotecas como `Jest` ou `Vitest`.
- Para componentes de interface (UI), utilize `React Testing Library` ou equivalentes.
- Para fluxos críticos e páginas inteiras, implemente testes End-to-End (E2E) com `Cypress` ou `Playwright`.
