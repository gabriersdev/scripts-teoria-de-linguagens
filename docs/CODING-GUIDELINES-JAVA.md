# Diretrizes de Codificação (Java)

## Padrões de Nomenclatura

- Pacotes: Letras minúsculas e formato reverso de domínio. Ex: `com.projeto.util`.
- Classes e Interfaces: `PascalCase`. Ex: `UserManager`, `List`.
- Métodos e Variáveis: `camelCase`. Ex: `calculateTotal()`, `firstName`.
- Constantes: Maiúsculas separadas por sublinhado (`_`). Ex: `MAX_RETRIES`.
- Nomeie variáveis, classes e métodos em inglês (US).

## Organização de Código

- Escreva classes coesas: Siga os princípios SOLID. Uma responsabilidade por classe.
- Escreva Javadoc: Documente classes, interfaces e métodos públicos de APIs.
- Retorne cedo: Use "early return" para evitar `if-else` complexo.
- Utilize coleções apropriadas: Escolha a estrutura correta (`List`, `Set`, `Map`) e prefira as interfaces na declaração (ex: `List<String> list = new ArrayList<>()`).
- Tratamento de Exceções: 
    - Não deixe blocos `catch` vazios.
    - Lance exceções específicas (evite `Exception` ou `RuntimeException`).
    - Use `try-with-resources` para fechar arquivos e conexões.

## Design de Classes e Interfaces

- Prefira composição sobre herança: Use herança apenas para "é-um".
- Encapsulamento: Mantenha campos privados e forneça getters/setters apenas quando necessário.
- Modificadores de acesso: Use o modificador mais restritivo possível.
- Classes Imutáveis: Crie classes imutáveis (usando `final` sem setters) para segurança multithread (ex: `record` no Java 14+).

## Padronização

- Indentação: 4 espaços.
- Agrupamento de Importações: Mantenha imports organizados via IDE.
- Segredos e Credenciais: Não versione senhas ou tokens. Use variáveis de ambiente ou configuração segura.

## Testes Automatizados

- Altere lógica significativa com testes correspondentes (Unitários/Integração).
- Use `JUnit` e `Mockito`.
- Mantenha os testes independentes. A execução de um teste não afeta o outro.
