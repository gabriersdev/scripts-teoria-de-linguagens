# Diretrizes de Codificação

Este documento fornece diretrizes para manter o padrão de código no projeto, baseadas no [Style Guide Oficial do Julia](https://docs.julialang.org/en/v1/manual/style-guide/).

## Padrões de Nomenclatura

- Módulos e Tipos: Utilize inicial maiúscula e `CamelCase`.
    - Exemplos: `module SparseArrays`, `struct UnitRange`.
- Funções: Utilize apenas letras minúsculas. Quando legível, junte múltiplas palavras sem separadores. Se for estritamente necessário para a legibilidade, use sublinhados (`_`).
    - Exemplos: `maximum`, `isequal`, `haskey`.
- Funções Mutáveis (Convenção Bang): Adicione o sufixo `!` (ponto de exclamação) aos nomes das funções que modificam os seus próprios argumentos.
    - Exemplos: `sort!(x)`, `push!(arr, item)`.
- Macros: Utilize letras minúsculas com sublinhados separando palavras.
    - Exemplo: `@timeit_all`.
- Prefira nomear variáveis e funções em inglês (US) para manter a uniformidade com bibliotecas externas.

## Boas Práticas e Organização de Código

- Escreva funções, não apenas scripts: O código em nível superior (top-level) em Julia não é otimizado da mesma forma que o código dentro de funções. Coloque sempre a lógica de execução dentro de funções.
- Escreva docstrings: Documente suas funções, tipos e métodos usando strings de documentação imediatamente antes de suas definições.
- Não especifique tipos desnecessariamente: Evite escrever tipos excessivamente específicos nas assinaturas de funções, a menos que seja necessário para o "multiple dispatch" (despachos múltiplos). Prefira tipos abstratos.
    - Exemplo: Use `AbstractArray` ao invés de exigir `Array`.
- Não use `try-catch` em excesso: Diferente de algumas linguagens onde exceções são usadas para controle de fluxo, em Julia capturar erros diminui a performance. Previna os erros no código lógico.
- Não coloque condições entre parênteses:
    - Errado: `if (a == b)`
    - Correto: `if a == b`

## Design de Interface e Tipos

- Ordem dos argumentos de funções: Siga o padrão do Julia Base. Se a função modifica um argumento, ele deve ser o primeiro da lista. Se a função recebe uma outra função como argumento (ex: `map`, `filter`), a função deve ser o primeiro argumento.
- Prefira métodos exportados ao invés de acesso direto a campos: Não acesse os campos internos de um tipo diretamente (como `x.field`) se houver métodos definidos para obter essas informações.
- Evite pirataria de tipos (Type Piracy): Não estenda funções do Julia Base para tipos do Julia Base. Estenda funções do Base apenas para os seus próprios tipos customizados.
- Evite tipos `Union` complexos e contêineres muito elaborados: Mantenha a simplicidade no design de tipos para ajudar o compilador a inferir e otimizar.

## Padronização

- Indentação: O padrão da comunidade é utilizar 4 espaços.
- Segredos e Credenciais: Nunca adicione senhas, tokens ou client secrets diretamente no código fonte. Utilize arquivos de configuração ou variáveis de ambiente.

## Testes Automatizados

- Todas as alterações significativas de lógica devem ter testes automatizados correspondentes no diretório de testes.
- Utilize a biblioteca padrão do Julia, o pacote `Test`, e organize-os usando blocos `@testset` e `@test`.
