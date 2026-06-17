Você é o executor de um único PR/documentação do projeto `nexos-booking`.

Tarefa atual: atualizar `docs/EXECUTION_PROMPT_PROTOCOL.md` para `v1.1`.

Implemente exclusivamente esta alteração documental.

Não implemente código. Não altere migrations. Não altere `apps/`, `packages/`, schema, API, auth, RLS, CI ou qualquer feature. Não avance para PR-1.1. Não faça commit.

## Fontes obrigatórias

Antes de alterar o arquivo, leia:

* `docs/EXECUTION_PROMPT_PROTOCOL.md`
* `docs/MVP_EXECUTION_PLAN.md`
* `docs/IMPLEMENTATION_ROADMAP.md`
* `docs/ARCHITECTURE_DECISIONS.md`
* `docs/BUGFIX_LOG.md`
* `docs/pr/PR-0.2_REPORT.md`
* `docs/pr/PR-0.3_REPORT.md`

## Objetivo

Atualizar o protocolo de prompts para `v1.1`, formalizando o modelo canônico de 13 blocos usado daqui para frente.

A mudança principal é adicionar a auditoria de desenho com parada obrigatória antes de qualquer alteração de arquivo, além de tornar obrigatórias a prova negativa quando aplicável e a trava documental.

## Escopo permitido

Alterar somente:

* `docs/EXECUTION_PROMPT_PROTOCOL.md`

A alteração deve incluir:

1. Identificação do executor e do PR.
2. Regra central: um PR só, sem antecipar escopo, sem commit automático.
3. Fontes obrigatórias de leitura.
4. Ordem de autoridade documental.
5. Auditoria de estado.
6. Auditoria de desenho com parada obrigatória.
7. Objetivo do PR.
8. Escopo permitido.
9. Escopo proibido.
10. Arquivos esperados.
11. Validações obrigatórias com prova positiva e prova negativa quando aplicável.
12. Relatório obrigatório.
13. Regras de parada.
14. Entrega final esperada.

Observação: pode manter a numeração como 13 blocos se a auditoria for dividida em `5a` e `5b`.

## Regras específicas do v1.1

A auditoria de estado deve exigir, no mínimo:

* `git status --short`;
* confirmação de PR anterior `PASS`;
* relatório do PR anterior existente;
* working tree limpo ou alteração pré-existente explicitamente isolada;
* confirmação de que o PR atual começa do estado correto.

A auditoria de desenho deve exigir parada obrigatória antes de alterar arquivos.

Antes de implementar, o executor deve devolver um mapa do que pretende construir ou alterar, ancorado nas fontes canônicas. Para PRs de banco, esse mapa deve listar tabelas, colunas, nullability, constraints, índices, FKs, policies, triggers, functions e resolvers. Para PRs de contrato, deve listar tipos, payloads, códigos e helpers. Para PRs de UI/API, deve listar rotas, componentes, DTOs, estados e efeitos.

O executor não deve continuar para implementação enquanto essa auditoria de desenho não estiver registrada no relatório ou explicitamente aprovada, conforme o prompt do PR.

A ordem de autoridade deve ficar clara:

1. `ARCHITECTURE_DECISIONS.md`
2. `DATABASE_SCHEMA_V2.md`
3. `API_CONTRACTS.md`
4. `PLANNING.md`
5. `IMPLEMENTATION_ROADMAP.md`
6. `POST_MVP_PRODUCT_ROADMAP.md` apenas como orientação futura

`MVP_EXECUTION_PLAN.md` organiza a execução. `EXECUTION_PROMPT_PROTOCOL.md` define o protocolo operacional. Eles não substituem ADR, schema ou contrato HTTP.

A prova negativa deve virar regra obrigatória quando o PR criar gate, constraint, validação, type-check, migration runner, política de segurança ou qualquer mecanismo que precise falhar diante de caso inválido.

Exemplos:

* migration inválida deve quebrar o runner;
* ausência de `ErrorCode` deve quebrar type-check;
* operação proibida por RLS deve falhar;
* `UPDATE`/`DELETE` em `audit_logs` deve falhar quando append-only for implementado;
* payload inválido deve falhar validação quando houver validação implementada.

A trava documental deve dizer:

* não alterar documento canônico silenciosamente para fazer o código “bater”;
* divergência entre documentos deve parar a execução;
* divergência deve ser registrada no `BUGFIX_LOG.md` ou proposta como ADR, conforme severidade;
* só depois da decisão registrada o PR pode continuar.

O papel do executor deve continuar sendo restritivo:

* usar “executor de um único PR”;
* não usar “engenheiro sênior” como moldura principal;
* não autorizar refactor, antecipação, melhoria oportunista ou preparação de futuro fora do escopo do PR.

## Escopo proibido

Não alterar:

* `docs/ARCHITECTURE_DECISIONS.md`
* `docs/DATABASE_SCHEMA_V2.md`
* `docs/API_CONTRACTS.md`
* `docs/PLANNING.md`
* `docs/IMPLEMENTATION_ROADMAP.md`
* `docs/MVP_EXECUTION_PLAN.md`
* `docs/BUGFIX_LOG.md`
* `apps/**`
* `packages/**`
* `.github/**`
* migrations
* scripts
* lockfile

Não criar prompt do PR-1.1 neste mesmo passo.

## Validações

Executar:

```bash
git status --short
```

Se houver alteração pré-existente fora de `docs/EXECUTION_PROMPT_PROTOCOL.md`, registrar e não tocar nela.

Se houver ferramenta de markdown/lint já configurada no repo para docs, executar. Se não houver, registrar `N/A — sem lint específico de markdown configurado`.

## Relatório final

Ao final, responder com:

* status final;
* arquivo alterado;
* resumo exato do que mudou no protocolo;
* confirmação de que nenhum código foi alterado;
* confirmação de que nenhum documento canônico foi alterado;
* confirmação de que o PR-1.1 não foi iniciado;
* confirmação de que nenhum commit foi feito.

