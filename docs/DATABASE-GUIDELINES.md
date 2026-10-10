# Diretrizes de Banco de Dados

## Padrões de Nomenclatura

Nomeie entidades físicas em inglês usando `camelCase`.

### Tabelas e Colunas

* Tabelas: Substantivos no singular.
* *Correto:* `user`, `purchaseOrder`, `paymentMethod`
* *Incorreto:* `users`, `PurchaseOrders`, `payment_methods`

* Colunas: Descreva o dado de forma clara sem repetir o nome da tabela.
* *Correto:* `firstName`, `birthDate`, `documentNumber`

* Chaves Primárias (PK): A coluna chama-se `id`. A *constraint* usa o prefixo `pk` + NomeDaTabela.
* *Constraint:* `pkUser`, `pkPurchaseOrder`

* Chaves Estrangeiras (FK): A coluna usa o nome da tabela destino no singular + `Id`. A *constraint* usa o prefixo `fk` + TabelaOrigem + TabelaDestino.
* *Coluna:* `userId`, `purchaseOrderId`
* *Constraint:* `fkOrderUser`

### Índices e Restrições

* Índices (Indexes): `idx` + NomeDaTabela + Coluna. Ex: `idxUserEmail`.
* Restrições Únicas (Unique): `uq` + NomeDaTabela + Coluna. Ex: `uqUserEmail`.
* Validações (Check): `chk` + NomeDaTabela + Regra. Ex: `chkOrderTotalAmount`.

## Padrões de Auditoria e Rastreabilidade

Implemente rastreabilidade em duas camadas para manter um histórico confiável.

### Camada 1: Colunas de Auditoria 

Toda tabela com dados de negócio deve ter as seguintes colunas:

| Coluna      | Tipo | Descrição |
|-------------|------|-----------|
| `createdAt` | `TIMESTAMP` | Data/hora da inserção. |
| `updatedAt` | `TIMESTAMP` | Data/hora da última alteração. Atualizada por *Trigger* ou ORM. |
| `createdBy` | `UUID/INT` | ID de quem criou (FK para `user`). |
| `updatedBy` | `UUID/INT` | ID de quem modificou. |
| `isActive`  | `BOOLEAN` | Define se o registro está ativo. Use Soft Delete (alterando esta flag) no lugar de `DELETE`. |
| `deletedAt` | `TIMESTAMP` | Marcador da exclusão lógica. Preenchido apenas quando `isActive` fica falso. |

### Camada 2: Tabela de Logs (Audit Trail)

Para sistemas financeiros ou com exigências da LGPD/GDPR, crie uma tabela central `auditLog` ou tabelas de histórico separadas para registrar o estado dos dados antes das alterações.

Estrutura da tabela `auditLog`:
* `id` (PK)
* `tableName` (Nome da tabela afetada, ex: "purchaseOrder")
* `recordId` (ID do registro afetado)
* `action` ("INSERT", "UPDATE", "DELETE")
* `oldData` (Estado do registro ANTES da alteração - JSON)
* `newData` (Estado do registro DEPOIS da alteração - JSON)
* `performedBy` (ID de quem executou a ação)
* `performedAt` (Timestamp)

**Regra de Auditoria**: Insira no `auditLog` preferencialmente via *Triggers* no banco de dados. Isso garante a geração incondicional de logs, independentemente da camada de aplicação.
