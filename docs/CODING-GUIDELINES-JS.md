# Diretrizes de Codificação (JavaScript/TypeScript)

## Padrões de Nomenclatura

- Arquivos e Diretórios: 
    - Componentes React/UI: `PascalCase.jsx` ou `PascalCase.tsx` (ex: `UserCard.tsx`).
    - Estilos e Utilitários: `kebab-case.js` ou `camelCase.ts` (ex: `date-utils.ts`, `apiClient.js`).
- Variáveis e Funções: `camelCase` (ex: `getUserData`).
- Classes e Componentes: `PascalCase` (ex: `UserService`, `Button()`).
- Constantes Globais: `UPPER_SNAKE_CASE` (ex: `API_BASE_URL`).
- Nomeie variáveis e funções em inglês (US).

## Organização de Código

- Uso de Variáveis: Use `const`. Use `let` apenas para reatribuição. Nunca use `var`.
- Funções Puras e Imutabilidade: Evite mutações diretas em objetos e arrays. Use `map`, `filter`, `reduce` ou `spread` (`...`).
- Funções Assíncronas: Use `async/await` em vez de callbacks ou `.then().catch()`.
- Retorno Antecipado: Evite `if/else` profundo. Inverta a lógica para retornar erros mais cedo.
- Desestruturação: Extraia valores de forma limpa. Ex: `const { name, age } = user;`.

## Padrões para Front-end / React

- Hooks: Use React Hooks (`useState`, `useEffect`) em vez de componentes de classe.
- Componentização: Quebre componentes grandes (mais de 100 linhas) em menores e reutilizáveis.
- Estilização: Se utilizar bibliotecas de UI (Tailwind, Material-UI), evite criar classes CSS personalizadas sem necessidade. Centralize layouts em componentes genéricos.

## Padronização

- Estilo de Código: Use `ESLint` para sintaxe e `Prettier` para formatação.
- Indentação: 2 espaços.
- Armazenamento Local: Adote um prefixo padrão do projeto no `localStorage` ou `sessionStorage` (ex: `nome-do-projeto-chave`) para evitar conflitos.

## Testes Automatizados

- Escreva testes unitários para funções com `Jest` ou `Vitest`.
- Use `React Testing Library` para componentes de interface.
- Implemente testes E2E com `Cypress` ou `Playwright` para fluxos críticos.
