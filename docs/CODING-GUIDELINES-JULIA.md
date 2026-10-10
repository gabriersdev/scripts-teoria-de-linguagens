# Diretrizes de Codificação (Julia)

Baseadas no [Style Guide Oficial do Julia](https://docs.julialang.org/en/v1/manual/style-guide/).

## Padrões de Nomenclatura

- Módulos e Tipos: `CamelCase`. Ex: `module SparseArrays`, `struct UnitRange`.
- Funções: Letras minúsculas. Junte palavras sem separadores se legível, ou use sublinhados (`_`) se estritamente necessário. Ex: `maximum`, `isequal`.
- Funções Mutáveis (Convenção Bang): Adicione `!` às funções que modificam os próprios argumentos. Ex: `sort!(x)`.
- Macros: Letras minúsculas com sublinhados. Ex: `@timeit_all`.
- Nomeie variáveis e funções em inglês (US).

## Organização de Código

- Escreva funções: Código top-level em Julia não é otimizado como o código dentro de funções. Coloque sempre a lógica dentro de funções.
- Escreva docstrings: Documente funções, tipos e métodos com docstrings imediatamente antes das definições.
- Não especifique tipos desnecessariamente: Evite tipos super específicos nas assinaturas, a não ser que o multiple dispatch exija. Prefira tipos abstratos (ex: `AbstractArray` em vez de `Array`).
- Não abuse do `try-catch`: Em Julia, capturar erros diminui a performance. Previna os erros na lógica.
- Não use parênteses em condições:
    - Errado: `if (a == b)`
    - Correto: `if a == b`

## Design de Interface e Tipos

- Ordem dos argumentos: Siga o Julia Base. Se a função modifica um argumento, ele é o primeiro. Se recebe uma função (ex: `map`, `filter`), a função é o primeiro argumento.
- Exporte métodos em vez de acesso direto a campos: Não acesse `x.field` se houver métodos disponíveis.
- Evite Type Piracy: Não estenda funções do Julia Base para tipos do Julia Base.
- Evite tipos `Union` complexos: Mantenha os tipos simples para ajudar o compilador a otimizar.

## Padronização

- Indentação: 4 espaços.
- Segredos e Credenciais: Não coloque senhas ou tokens no código. Use arquivos de configuração ou variáveis de ambiente.

## Testes Automatizados

- Altere lógica significativa com testes no diretório de testes.
- Use a biblioteca padrão `Test` com blocos `@testset` e `@test`.
