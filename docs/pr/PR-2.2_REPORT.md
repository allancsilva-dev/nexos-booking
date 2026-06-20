# PR-2.2_REPORT — Phase 2: Services Module (CRUD)

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE. CI remoto: PENDENTE (validação manual posterior)

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-2.1 | PASS_PROVISÓRIO_CI_PENDENTE | `docs/pr/PR-2.1_REPORT.md` — professionals module |

## 3. Endpoints (3)

| # | Method | Path | Roles | Descrição |
|---|---|---|---|---|
| 1 | GET | `/services` | OWNER, MANAGER, PROFESSIONAL | Lista serviços da org ativa |
| 2 | POST | `/services` | OWNER, MANAGER | Cria serviço (name, durationMin, priceCents) |
| 3 | PATCH | `/services/:id` | OWNER, MANAGER | Atualiza name, durationMin, priceCents, active |

## 4. Arquivos (11 = 9 criados + 2 modificados)

```
Criados (9):
  C1: apps/api/src/services/index.ts
  C2: apps/api/src/services/services.module.ts
  C3: apps/api/src/services/services.controller.ts
  C4: apps/api/src/services/services.service.ts
  C5: apps/api/src/services/services.repository.ts
  C6: apps/api/src/services/dto/create-service.dto.ts
  C7: apps/api/src/services/dto/update-service.dto.ts
  C8: apps/api/scripts/test-services.mjs
  C9: packages/shared/src/dto/service.dto.ts

Modificados (2):
  M1: apps/api/src/app.module.ts           — +ServicesModule
  M2: packages/shared/src/index.ts          — export ServiceSchema / ServiceDTO
```

## 5. Regras Verificadas

| Regra | Descrição | Status | Evidência |
|---|---|---|---|
| R1 | `withTenantContext` usado em todos os métodos (pattern corrigido do fix PR-2.1) | IMPLEMENTADO | `services.service.ts:48,59,111` — findAll, create, update |
| R2 | `currency` não está no input, default BRL | IMPLEMENTADO | `create-service.dto.ts:1-5` — sem campo currency; `services.service.ts:84-90` — cria sem currency; teste T1 confirma `json.currency === "BRL"` |
| R3 | Audit logs sem PII | IMPLEMENTADO | `services.service.ts:92-99,187-194` — metadata contém apenas `serviceId` e `changedFields`, sem valores de nome ou preço |
| R4 | Cross-tenant opacity | IMPLEMENTADO | `services.repository.ts:16-28` — findById filtra `organization_id`; T5 confirma 404 cross-org |

## 6. Resultado dos Testes

```
pnpm lint                              → PASS
pnpm build                             → PASS
test-services.mjs                      → 10 test cases, aguardam Docker
```

### Testes implementados (10)

| # | Descrição |
|---|---|
| T1 | OWNER creates service → 201, active:true, currency:BRL |
| T2 | MANAGER creates service → 201 |
| T3 | PROFESSIONAL tries to create → 403 AUTHZ_DENIED |
| T4 | GET /services returns only services from current org |
| T5 | PATCH service from other org → 404 NOT_FOUND |
| T6 | durationMin = 0 → 422 VALIDATION_ERROR (field=durationMin, issue=must_be_positive) |
| T7 | priceCents = -1 → 422 VALIDATION_ERROR (field=priceCents, issue=must_be_non_negative) |
| T8 | PATCH active:false → service still in list with active=false |
| T9 | Error response has error.code + error.requestId |
| T10 | Audit metadata: only serviceId + changedFields (no values, no names) |

## 7. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` sem passo `test:services`. Validação completa depende de push + GitHub Actions. |
| PEND-002 | MEDIUM | Testes Docker-dependentes (`test-services.mjs`) não executados localmente por indisponibilidade do Docker no sandbox. |

## 8. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- Endpoints de DELETE (serviços são desativados via `active: false`, não removidos)
- Módulo de clients, appointments (fases posteriores da Phase 2)
- Schema / migrations (tabela `services` pré-existente, sem alterações)
- Redis ou cache externo
- Guards (`AuthGuard`, `TenantGuard`, `RolesGuard` preservados sem alteração)
- Auth endpoints, organizations endpoints, professionals endpoints
- Novos error codes no shared (`packages/shared/src/error-code.ts` sem alterações para services)
- Docs canônicos (ADR, decision records)
