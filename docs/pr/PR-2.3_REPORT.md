# PR-2.3_REPORT — Phase 2: Working Hours (Scheduling Module)

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE. CI remoto: PENDENTE (validação manual posterior)

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-2.2 | PASS_PROVISÓRIO_CI_PENDENTE | `docs/pr/PR-2.2_REPORT.md` — services module |

## 3. Endpoints (2)

| # | Method | Path | Roles | Descrição |
|---|---|---|---|---|
| 1 | GET | `/professionals/:professionalId/working-hours` | OWNER, MANAGER, PROFESSIONAL | Lista horários de trabalho do profissional |
| 2 | PUT | `/professionals/:professionalId/working-hours` | OWNER, MANAGER | Define/atualiza horários (atomic DELETE+INSERT) |

## 4. Arquivos (9 = 6 criados + 3 modificados)

```
Criados (6):
  C1: apps/api/src/scheduling/index.ts
  C2: apps/api/src/scheduling/scheduling.module.ts
  C3: apps/api/src/scheduling/scheduling.controller.ts
  C4: apps/api/src/scheduling/scheduling.service.ts
  C5: apps/api/src/scheduling/scheduling.repository.ts
  C6: apps/api/scripts/test-working-hours.mjs

Modificados (3):
  M1: apps/api/src/app.module.ts               — +SchedulingModule
  M2: packages/shared/src/error-code.ts         — +WORKING_HOURS_CONFLICT
  M3: packages/shared/src/dto/working-hours.dto.ts — WorkingHoursSchema
```

**Nota:** `zod-validation-pipe` foi removido do escopo. Validação inline via `WorkingHoursSchema.safeParse()`.

## 5. Regras Verificadas

| Regra | Descrição | Status | Evidência |
|---|---|---|---|
| R1 | `withTenantContext` usado em todos os métodos | IMPLEMENTADO | `scheduling.service.ts` — findAll, set |
| R2 | Atomic DELETE+INSERT na operação PUT | IMPLEMENTADO | `scheduling.service.ts` — transação com delete + insert batch |
| R3 | `no_shift_overlap` → 409 `WORKING_HOURS_CONFLICT` | IMPLEMENTADO | Constraint check via validação; erro 409 com código canônico |
| R4 | Validação via `WorkingHoursSchema.safeParse()` inline | IMPLEMENTADO | `scheduling.service.ts` — parse sem pipe compartilhado |
| R5 | Cross-tenant opacity | IMPLEMENTADO | `scheduling.repository.ts` — filtra por `organization_id` via professional |

## 6. Resultado dos Testes

```
pnpm lint                              → PASS
pnpm build                             → PASS
test-working-hours.mjs                 → 15 test cases, aguardam Docker
```

### Testes implementados (15)

| # | Descrição |
|---|---|
| T1 | GET working-hours (empty) → 200, [] |
| T2 | PUT working-hours → 204 |
| T3 | GET after PUT → 200, reflects set data |
| T4 | PUT overlapping shifts → 409 WORKING_HOURS_CONFLICT |
| T5 | Cross-tenant professional → 404 |
| T6 | Invalid dayOfWeek → 422 VALIDATION_ERROR |
| T7 | Invalid time format → 422 VALIDATION_ERROR |
| T8 | Negative dayOfWeek → 422 VALIDATION_ERROR |
| T9 | startH >= endH → 422 VALIDATION_ERROR |
| T10 | PROFESSIONAL can GET own hours → 200 |
| T11 | PROFESSIONAL cannot PUT → 403 AUTHZ_DENIED |
| T12 | PUT replaces all existing hours (atomic) |
| T13 | Multiple days with multiple shifts → 204 |
| T14 | Single shift across full day → 204 |
| T15 | Error response has error.code + error.requestId |

## 7. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:working-hours`. Validação completa depende de push + GitHub Actions. |
| PEND-002 | MEDIUM | Testes Docker-dependentes (`test-working-hours.mjs`) não executados localmente por indisponibilidade do Docker no sandbox. |

## 8. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- `zod-validation-pipe` compartilhado (removido do escopo; validação inline)
- Módulos de appointments, clients (fases posteriores da Phase 2)
- Schema / migrations (tabela `working_hours` pré-existente, sem alterações)
- Redis ou cache externo
- Guards (`AuthGuard`, `TenantGuard`, `RolesGuard` preservados sem alteração)
- Auth endpoints, organizations endpoints, professionals endpoints, services endpoints
- Docs canônicos (ADR, decision records)

## 9. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- Auditoria de estado: APTA (PR-2.2 PASS_PROVISÓRIO_CI_PENDENTE confirmado)
- Scheduling module criado com 6 novos arquivos + 3 modificações
- 2 endpoints REST (GET + PUT)
- `withTenantContext`, atomic DELETE+INSERT, `no_shift_overlap` → 409 `WORKING_HOURS_CONFLICT`
- Validação via `WorkingHoursSchema.safeParse()` inline (sem pipe compartilhado)
- Lint: PASS
- Build: PASS
- Testes: 15 implementados em `test-working-hours.mjs`, aguardam execução com Docker
- CI remoto: PENDENTE
