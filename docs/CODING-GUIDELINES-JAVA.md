# Diretrizes de Codificação

Este documento fornece diretrizes para manter o padrão de código no projeto, baseadas nas boas práticas do ecossistema Java.

## Padrões de Nomenclatura

- Pacotes: Utilize apenas letras minúsculas e formato reverso de domínio. Ex: `com.projeto.util`.
- Classes e Interfaces: Utilize inicial maiúscula e `PascalCase`.
    - Exemplos: `class UserManager`, `interface List`.
- Métodos e Variáveis: Utilize inicial minúscula e `camelCase`.
    - Exemplos: `calculateTotal()`, `firstName`.
- Constantes: Utilize todas as letras maiúsculas separadas por sublinhado (`_`).
    - Exemplos: `MAX_RETRIES`, `DEFAULT_TIMEOUT`.
- Prefira nomear variáveis, classes e métodos em inglês (US) para manter a uniformidade com bibliotecas externas.

## Boas Práticas e Organização de Código

- Escreva classes coesas: Siga os princípios SOLID. Cada classe deve ter uma única responsabilidade.
- Escreva Javadoc: Documente suas classes, interfaces e métodos públicos, especialmente aqueles que definem APIs.
- Evite aninhamentos profundos: Retorne cedo ("early return") em métodos para evitar estruturas `if-else` muito complexas.
- Utilize coleções apropriadas: Escolha a estrutura de dados correta (`List`, `Set`, `Map`) e prefira as interfaces na declaração de variáveis (ex: `List<String> list = new ArrayList<>()`).
- Tratamento de Exceções: 
    - Não ignore exceções (evite blocos `catch` vazios).
    - Prefira lançar exceções específicas ao invés de classes genéricas como `Exception` ou `RuntimeException`.
    - Utilize `try-with-resources` para garantir o fechamento de recursos (arquivos, conexões de banco de dados).

## Design de Classes e Interfaces

- Prefira composição sobre herança: Use herança apenas quando houver uma verdadeira relação "é-um". Em outros casos, prefira composição.
- Encapsulamento: Mantenha os campos da classe privados e forneça métodos de acesso (getters e setters) apenas quando necessário.
- Modificadores de acesso: Utilize o modificador mais restritivo possível. Evite usar `public` indiscriminadamente.
- Classes Imutáveis: Sempre que possível, crie classes imutáveis (usando `final` nos campos e não fornecendo setters), pois são mais seguras em ambientes multithread (ex: `record` no Java 14+).

## Padronização

- Indentação: O padrão da comunidade é utilizar 4 espaços.
- Agrupamento de Importações: Mantenha as importações organizadas. Ferramentas como o IntelliJ IDEA ou Eclipse podem formatar isso automaticamente.
- Segredos e Credenciais: Nunca adicione senhas, tokens ou client secrets diretamente no código fonte. Utilize variáveis de ambiente ou arquivos de configuração seguros.

## Testes Automatizados

- Todas as alterações significativas de lógica devem ter testes automatizados correspondentes (Testes Unitários e/ou de Integração).
- Utilize bibliotecas padrão da comunidade como `JUnit` e `Mockito` para criação de mocks.
- Mantenha os testes independentes uns dos outros. A execução de um teste não deve afetar o resultado de outro.
