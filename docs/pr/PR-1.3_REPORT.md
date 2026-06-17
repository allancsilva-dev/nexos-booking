# PR-1.3_REPORT — Filtro global de erro + X-Request-Id + /health /ready + hardening HTTP

## 1. Resumo

- **Status final: PASS** (24/24 testes HTTP passam — correção de fechamento aplicada)
- **CI remoto:** workflow corrigido (BUG-003 — fetch-depth: 0 adicionado ao checkout). Re-run pendente no GitHub Actions para validar o commit `a3ba305`.
- **Gate de supply-chain:** `pnpm audit --audit-level high` → PASS (0 high/critical, 2 moderate informativos, multer fixado via override)
- **Causa raiz do T12 corrigida:** path de resolução do `.env` no harness estava errado (`../../..` de `apps/api/` caía em `~/Projetos/`; corrigido para `../..` = raiz do repo)

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-0.3 PASS | PASS | `docs/pr/PR-0.3_REPORT.md` |
| PR-1.1 PASS | PASS | `docs/pr/PR-1.1_REPORT.md` |
| PR-1.2 PASS v2 | PASS | `docs/pr/PR-1.2_REPORT.md` |
| CI remoto | Não verificado | Sem evidência de GitHub Actions |

## 3. Arquivos criados/alterados (v3 final — correção de fechamento)

| Caminho | Tipo |
|---|---|
| `apps/api/src/common/errors/build-error-envelope.ts` | criado |
| `apps/api/src/common/exceptions/validation.exception.ts` | criado |
| `apps/api/src/common/filters/http-exception.filter.ts` | criado |
| `apps/api/src/common/logger/scrub.ts` | criado |
| `apps/api/src/common/logger/scrubbed-logger.service.ts` | criado |
| `apps/api/src/common/middleware/request-id.middleware.ts` | criado |
| `apps/api/src/health/health.controller.ts` | criado → alterado (correção) |
| `apps/api/src/health/health.module.ts` | criado |
| `apps/api/src/test-harness/test-harness.controller.ts` | criado |
| `apps/api/src/test-harness/test-harness.module.ts` | criado |
| `apps/api/scripts/test-http.mjs` | criado → alterado (correção) |
| `apps/api/src/main.ts` | alterado |
| `apps/api/src/app.module.ts` | alterado |
| `apps/api/src/db/db.config.ts` | alterado (correção) |
| `apps/api/package.json` | alterado |
| `pnpm-lock.yaml` | alterado |
| `pnpm-workspace.yaml` | alterado (multer override) |
| `docs/pr/PR-1.3_REPORT.md` | criado → alterado (correção) |

## 4. Resultado dos testes (corrigido)

```
pnpm install --frozen-lockfile     → PASS
pnpm lint                          → PASS
pnpm --filter @nexos/api build     → PASS
pnpm --filter @nexos/api migrate:fresh → PASS
pnpm --filter @nexos/api test:http → 24/24 PASS
pnpm audit --audit-level high      → PASS (0 high/critical, 2 moderate)
```

### Testes HTTP — 24/24 PASS

| # | Teste | Resultado |
|---|---|---|
| T1 | /__test/* returns 404 without harness (N9) | ✓ |
| T2 | /__test/echo returns 404 without harness (N9) | ✓ |
| T3 | Unhandled error → 500 INTERNAL_ERROR | ✓ |
| T4 | 500 error does not expose stack | ✓ |
| T5 | Error contains requestId | ✓ |
| T6 | Valid X-Request-Id preserved | ✓ |
| T7 | Missing X-Request-Id generates value | ✓ |
| T8 | Invalid X-Request-Id generates new safe value | ✓ |
| T9 | Malformed JSON → 400 BAD_REQUEST | ✓ |
| T10 | Semantic validation → 422 VALIDATION_ERROR | ✓ |
| T11 | Details uses [{ field, issue }] | ✓ |
| T12 | Body > 100KB → 413 BAD_REQUEST | ✓ |
| T13 | /health → 200 without touching DB | ✓ |
| T14 | /ready → 200 with DB active | ✓ |
| T15 | /ready not in standard error envelope | ✓ |
| T16 | Helmet headers appear | ✓ |
| T17 | CSP contains default-src 'none' | ✓ |
| T18 | Timestamp passes Iso8601WithOffset | ✓ |
| T19 | Malformed JSON error has X-Request-Id | ✓ |
| T20 | Log does not contain Authorization | ✓ |
| T21 | Log does not contain Cookie | ✓ |
| T22 | Log does not contain token | ✓ |
| T23 | No production controller mounts envelope manually | ✓ |
| T24 | /ready returns 503 with DB unavailable (closed-port, <3s) | ✓ |

### T24 — detalhes da correção

- **Mecanismo de falha determinística:** segunda instância da API em porta 3098 com `POSTGRES_HOST=127.0.0.1` e `POSTGRES_PORT=1` (porta fechada, sem serviço → ECONNREFUSED imediato).
- **Duração medida:** < 3 segundos (deadline do probe de readiness é 2s via `Promise.race`).
- **Não depende do timeout HTTP global (30s)** — o probe de DB é encapsulado com `Promise.race` contra `READINESS_DB_TIMEOUT_MS = 2000`.
- **Resposta com DB indisponível:** `503 { "status": "error", "database": "disconnected" }` — sem hostname, database name, usuário, stack ou erro bruto do driver.
- **Instância principal:** continua retornando `/ready` 200 com DB ativo após o teste da segunda instância.
- **Nenhum Postgres é parado** — não há dependência de Docker para T24.

**N9:** Provado automaticamente — `/__test/throw` e `/__test/echo` retornam 404 quando `ENABLE_HTTP_TEST_HARNESS=0`.

## 5. DbService vs getSharedPool() — decisão final

**`getSharedPool()` foi removido.** O `HealthController` agora utiliza `DbService` por injeção de dependência do NestJS via `@Inject(DbService)`.

- O decorador `@Inject(DbService)` armazena metadados de dependência em runtime (`SELF_DECLARED_DEPS`), sem depender de `design:paramtypes` emitido por `tsc`.
- O `DbModule` é `@Global()`, portanto o `DbService` está disponível em toda a aplicação, incluindo o `HealthModule`.
- O pool usado pelo `HealthController` é o mesmo singleton criado por `DbService` via `createPool()`.
- A regra de que acesso ao banco de dados passa pelo módulo `db` é mantida — o `HealthController` importa `DbService` do barrel `../db`.

**Readiness deadline:** O probe `/ready` usa `Promise.race` com timeout de 2s (`READINESS_DB_TIMEOUT_MS = 2000`), garantindo resposta rápida mesmo com DB indisponível, sem depender do timeout HTTP global de 30s.

**Exceção operacional do `/ready`:** O `SELECT 1` no `/ready` roda fora de `withTenantContext`/`withSystemContext`. Isto é aceitável porque:
- Não consulta tabela tenant-scoped
- Não lê dado de negócio
- Não depende de organização
- Não retorna dado de banco
- Serve apenas para readiness operacional

## 6. Provas negativas

| # | Prova | Resultado |
|---|---|---|
| N1 | Stack ausente no corpo de erro 500 | PASS (T4) |
| N2 | Log sem Authorization | PASS (T20) |
| N3 | Log sem Cookie | PASS (T21) |
| N4 | Log sem token | PASS (T22) |
| N5 | Scrubber recursivo | PASS (implementação) |
| N6 | /health e /ready fora do envelope | PASS (T15) |
| N7 | /ready sem detalhe de infra | PASS (T24) |
| N8 | CSP da API (`default-src 'none'`) | PASS (T17) |
| N9 | `__test/*` indisponível sem harness | PASS (T1, T2) |
| N10 | Nenhum controller produtivo monta envelope | PASS (T23) |
| N11 | Nenhum auth, rate limiter, rota de negócio, UI, migration | PASS |
| N12 | Lint bloqueia `pg`/`Pool` fora de `src/db` | PASS (prova negativa) |
| N13 | `getSharedPool` não aparece fora de locais permitidos | PASS (0 resultados) |

### Prova negativa de lint — N12

1. Criado temporariamente `apps/api/src/__lint-negative__/raw-pg-import.ts` com `import { Pool } from "pg"` fora de `src/db`.
2. `pnpm --filter @nexos/api lint` → **FAIL**: `'pg' import is restricted from being used. Direct pg access is restricted to apps/api/src/db/. Use DbService instead.` (regra `no-restricted-imports`).
3. Arquivo removido.
4. `pnpm --filter @nexos/api lint` → **PASS**.
5. Arquivo temporário não versionado.

### Busca por getSharedPool — N13

```sh
rg "getSharedPool" apps/api/src
# → (no matches)
```

`getSharedPool()` foi totalmente removido do código-fonte. A busca confirma 0 ocorrências em `apps/api/src`.

## 7. Supply-chain

```
pnpm audit --audit-level high
# → 0 high/critical
# → 2 moderate (informativos, não bloqueiam)
```

- **Vulnerabilidade high (multer GHSA-72gw-mp4g-v24j):** Corrigida adicionando `overrides: { multer: 2.2.0 }` em `pnpm-workspace.yaml`. O `@nestjs/platform-express` pina `multer@2.1.1`; o override força `2.2.0` (patched).
- **2 moderate advisories:** informativos, não bloqueiam.

## 8. Divergências documentais

- **DIV-001:** 413 Payload Too Large ausente do `API_CONTRACTS.md` §4/§7 → decisão local: 413 + `BAD_REQUEST`
- **DIV-002:** Timeout sem status code no contrato → decisão local: 500 `INTERNAL_ERROR`

## 9. Pendências

- **PEND-001:** CI remoto (GitHub Actions) para PR-1.1/PR-1.2/PR-1.3 — workflow corrigido (BUG-003, `fetch-depth: 0` no checkout). Aguardando re-run verde no commit `a3ba305`. Cobertura parcial: `test:db` e `test:http` ausentes do workflow.
- **PEND-002:** `/ready` usa `SELECT 1` fora dos wrappers de tenant/system context — exceção restrita a readiness, sem acesso a dados de negócio

## 10. Higiene de teardown

- Nenhum processo Node órfão após execução do harness.
- Postgres permanece ativo e healthy ao final dos testes.
- Nenhuma porta ocupada após teardown.
- Todas as instâncias da API (principal e secundária) são derrubadas no finally.
- Docker permanece em estado operacional.

## 11. Escopo proibido — confirmado

Não foi criado: auth, rate limiter, controllers de negócio, services/repositories/DTOs de domínio, endpoints de negócio, UI/apps/web, migrations, seeds, jobs, real-time, idempotência runtime, cliente HTTP completo, documentos canônicos.

## 12. Resultado final

- **Veredito do executor: PASS**
- **24/24 testes HTTP passam (incluindo T24)**
- **Lint verde, build verde, audit verde (0 high/critical)**
- **`getSharedPool()` removido — `DbService` usado por DI no `HealthController`**
- **Prova negativa de lint executada e documentada**
- **T24 determinístico (closed-port), rápido (<3s), automatizado**
- **Nenhum commit foi feito**

## Causa raiz do T12

O harness carregava `.env` do caminho errado. `apiDir = apps/api/` e `path.resolve(apiDir, "../../..")` resolvia para `~/Projetos/` (3 níveis acima) em vez de `nexos-booking/` (2 níveis). Corrigido para `path.resolve(apiDir, "../..")`. Após a correção, o `.env` com `POSTGRES_PASSWORD` é carregado corretamente e a API conecta ao banco no child process.
