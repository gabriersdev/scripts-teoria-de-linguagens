# Diretrizes de Codificação (C#)

Baseadas nas [C# Coding Conventions oficiais da Microsoft](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions).

## Padrões de Nomenclatura

- Namespaces, Classes, Records, Structs, Interfaces e Métodos: `PascalCase`. Ex: `SwearWordMasker`, `BuildWordPattern()`.
- Interfaces: Prefixo `I` seguido de `PascalCase`. Ex: `IPatternBuilder`.
- Variáveis locais e parâmetros: `camelCase`. Ex: `filePath`, `matchCount`.
- Campos privados (`private`): `_camelCase` com sublinhado inicial. Ex: `_swearPattern`.
- Constantes (`const` e `static readonly`): `PascalCase`. Ex: `DefaultMaskCharacter`.
- Nomeie variáveis, classes, métodos e propriedades em inglês (US).

## Organização de Código

- Coesão e Responsabilidade Única: Separe construção de expressões regulares, mascaramento textual, leitura/escrita de arquivos e orquestração em classes ou métodos coesos.
- Documentação XML: Documente classes e métodos públicos com comentários XML (`/// <summary>`).
- Retorno Antecipado: Utilize guard clauses e retorno antecipado para evitar aninhamento profundo de `if/else`.
- Imutabilidade e `record`: Prefira `record` para DTOs e estruturas de resultado imutáveis.
- Recursos gerenciáveis: Utilize declarações `using` para recursos descartáveis (`IDisposable`).
- Tipos implícitos (`var`): Utilize `var` quando o tipo ficar evidente no lado direito da atribuição; caso contrário, declare o tipo explicitamente.

## Tratamento de Exceções e Coleções

- Não utilize blocos `catch` vazios.
- Lance ou trate exceções específicas (ex: `FileNotFoundException`, `InvalidOperationException`).
- Prefira interfaces ou tipos abstratos nas assinaturas públicas (`IReadOnlyList<string>`, `IEnumerable<string>`, `IReadOnlyDictionary<string, int>`).

## Padronização

- Indentação: 4 espaços.
- Chaves no estilo Allman (abertura de `{` em nova linha para classes, métodos e blocos).
- Habilite `<Nullable>enable</Nullable>` e `<ImplicitUsings>enable</ImplicitUsings>` no `.csproj`.
- Segredos e Credenciais: Não versione senhas ou tokens; utilize variáveis de ambiente ou configuração externa.

## Testes Automatizados

- Escreva testes unitários com `xUnit` ou `NUnit` para lógica crítica.
- Mantenha testes independentes e determinísticos.
