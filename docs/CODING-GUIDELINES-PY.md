# Diretrizes de Codificação

Este documento fornece diretrizes para manter o padrão de código no projeto Eskimozin Bot Lives Discord.

## Padrões de Nomenclatura
- **Arquivos e Classes:** Utilize o padrão `PascalCase`.
  - *Exemplos:* `Database.py`, `MessageUpdater.py`, `class KickStreamManager:`
- **Funções, Métodos e Variáveis:** Utilize o padrão `snake_case`.
  - *Exemplos:* `def verify_stream()`, `stream_status`, `message_id`
- **Constantes:** Utilize `UPPER_SNAKE_CASE`.
  - *Exemplos:* `MAX_RETRIES`, `DEFAULT_TIMEOUT`
- Prefira nomear variáveis e funções em inglês (US) para manter a uniformidade com bibliotecas externas.

## Organização de Código
- Toda lógica complexa e regras de negócios devem residir na pasta `lib/` e serem instanciadas no `Main.py`.
- O código deve ser modular. Evite arquivos monolíticos; se uma classe assumir múltiplas responsabilidades, extraia a lógica para um módulo dedicado (como foi feito com `EmbedCreator.py` e `MessageUpdater.py`).
- **Segredos e Credenciais:** Nunca adicione senhas, tokens ou client secrets diretamente no código fonte. Utilize variáveis de ambiente lidas a partir do arquivo `.env` (via `python-dotenv`).

## Boas Práticas Python
- O projeto usa Python 3.12+, então prefira o uso de tipagem (Type Hints) em assinaturas de funções para clareza e auto-complete na IDE (`def my_func(user_id: int) -> bool:`).
- Feche sempre as conexões de rede, cursores e conexões de banco de dados (`Database.py`) e encerre o `WebDriver` quando o processo de scraping finalizar.
- Trate as exceções com blocos `try/except` pontuais, principalmente em chamadas de API (`requests`) e manipulação do Selenium.

## Padronização e Linting
- O código deve estar de acordo com o PEP 8 (padrão de codificação do ecossistema Python).
- Um arquivo `.flake8` está presente na raiz para linting e análise estática de qualidade.

## Testes Automatizados
- Todas as alterações significativas de lógica, especialmente regras de anti-spam, atualizações de status offline ou formatação de embeds, devem ter testes automatizados adicionados ou atualizados em `/tests/`.
- Executamos os testes via `pytest`. Mantenha as dependências externas isoladas nos testes, se necessário, usando *mocks*.
