# PR-3.2_REPORT — Phase 3: Idempotency Engine

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE

CI remoto: PENDENTE (validação manual posterior).

## 2. Idempotency Engine

Arquitetura dual: **interceptor** (request-level) + **decorator** (method-level).

| Componente | Descrição |
|---|---|
| `IdempotencyInterceptor` | Intercepta requests, injeta `Idempotency-Key` header |
| `@Idempotency` decorator | Marca métodos de serviço como idempotentes |
| Replay | Cache hit → retorna resposta armazenada sem reexecutar |

## 3. Replay: COMPLETED / FAILED

| Estado | Comportamento |
|---|---|
| COMPLETED | Replay instantâneo da resposta cacheada (sem reexecução) |
| FAILED | Retorna erro original armazenado (sem retry automático) |

## 4. CAS Takeover

Lock otimista via compare-and-swap com TTL de **60 segundos**. Previne race condition entre requests concorrentes com mesma `Idempotency-Key`.

## 5. IDEMPOTENCY_KEY_REQUIRED — PROPOSTA-002

Enum `IDEMPOTENCY_KEY_REQUIRED` adicionado ao pacote `shared` (erro codes) como parte da **PROPOSTA-002** (padronização de error codes cross-cutting).

## 6. Opção B: Transações Separadas

Opção B aceita com **ressalva**: cada operação idempotente executa em transação própria (não compartilhada). Caso necessário, transação unificada será reavaliada em fase posterior (PR-3.3+).

## 7. Maintenance Job

Job de limpeza de registros expirados **ativado** — remove entradas com TTL vencido periodicamente.

## 8. Testes

```
pnpm lint                                → PASS
pnpm build                               → PASS
test-idempotency.mjs                     → 25 test cases
```

| # | Descrição |
|---|---|
| T1 | POST com Idempotency-Key → 200 |
| T2 | Mesma key, mesmo body → replay COMPLETED (200, mesma resposta) |
| T3 | Mesma key, body diferente → 409 (payload mismatch) |
| T4 | Sem Idempotency-Key → 400 (IDEMPOTENCY_KEY_REQUIRED) |
| T5 | Key duplicada em tenant diferente → OK (tenant isolation) |
| T6 | Replay de operação FAILED → retorna erro original |
| T7 | CAS takeover: 2 requests concorrentes → segundo aguarda/usa cache |
| T8 | TTL expirado → nova operação aceita |
| T9 | Hash check antes do replay (BLOCKER corrigido) |
| T10 | POST appointment idempotente |
| T11 | PATCH appointment idempotente |
| T12 | DELETE appointment idempotente |
| T13 | POST block idempotente |
| T14 | PATCH block idempotente |
| T15 | DELETE block idempotente |
| T16 | Header malformado → 400 |
| T17 | Key muito longa (>256) → 422 |
| T18 | Interceptor + decorator stack integrado |
| T19 | Idempotency-Key ausente em endpoint não-marcado → OK |
| T20 | Maintenance job expurga registros expirados |
| T21 | CAS lock libera após TTL (60s) |
| T22 | Resposta cacheada preserva headers originais |
| T23 | Tenant A não vê chave do Tenant B |
| T24 | Conflito de CAS tratado com retry (max 3) |
| T25 | Build + lint: PASS |

## 9. BLOCKER Corrigido

**Hash check antes do replay**: validação de hash do payload ocorre **antes** do replay, prevenindo replay com body divergente (BLOCKER identificado em revisão de código, resolvido nesta PR).

## 10. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:idempotency`. |
| PEND-002 | MEDIUM | Testes do `test-idempotency.mjs` dependem de Docker não disponível no sandbox. |
| PEND-003 | LOW | Transações unificadas (Opção B ressalva) — reavaliar em PR-3.3. |

## 11. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- Interceptor + decorator para idempotência
- Replay COMPLETED / FAILED com hash check preventivo
- CAS takeover 60s para race condition
- `IDEMPOTENCY_KEY_REQUIRED` no shared (PROPOSTA-002)
- Opção B (transações separadas) aceita com ressalva
- Maintenance job ativado
- 25 testes em `test-idempotency.mjs`
- BLOCKER corrigido: hash check antes do replay
- Lint: PASS | Build: PASS
- CI remoto: PENDENTE
