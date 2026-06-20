# PR-3.1_REPORT — Phase 3: Disponibilidade (Availability Endpoint)

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE

CI remoto: PENDENTE (validação manual posterior).

## 2. Endpoints (1)

| # | Method | Path | Roles | Descrição |
|---|---|---|---|---|
| 1 | GET | `/professionals/:professionalId/availability` | OWNER, MANAGER, PROFESSIONAL | Lista slots disponíveis com cálculo timezone-aware |

## 3. Arquivos (8 = 6 criados + 2 modificados)

```
Criados (6):
  C1: apps/api/src/scheduling/availability.controller.ts
  C2: apps/api/src/scheduling/availability.service.ts
  C3: apps/api/src/scheduling/availability.repository.ts
  C4: apps/api/scripts/test-availability.mjs
  C5: packages/shared/src/dto/availability.dto.ts
  C6: packages/shared/src/slot-grid.ts

Modificados (2):
  M1: apps/api/src/scheduling/scheduling.module.ts  — +AvailabilityController, +AvailabilityService, +AvailabilityRepository
  M2: packages/shared/src/index.ts                   — export alignToSlotGrid + schemas de availability
```

## 4. Regras Verificadas

| Regra | Descrição | Status |
|---|---|---|
| R1 | `withTenantContext` em todas as operações | IMPLEMENTADO |
| R2 | PROFESSIONAL scope enforcement: 403 se acessar professional de outro usuário | IMPLEMENTADO |
| R3 | Service inactive → 404 (tenant opacity) | IMPLEMENTADO |
| R4 | Professional inactive → 200 com `days: []` vazio | IMPLEMENTADO |
| R5 | `alignToSlotGrid()` no `shared` — âncora única de grade (ADR-023) | IMPLEMENTADO |
| R6 | Cálculo timezone-aware via `Intl.DateTimeFormat` com timezone da org | IMPLEMENTADO |
| R7 | DST fixture: `America/Santiago` (fuso com DST ativo) | PLANEJADO |
| R8 | Slots excluem blocos de indisponibilidade e agendamentos ativos | IMPLEMENTADO |
| R9 | Query params `from`, `to`, `serviceId` validados com Zod (`AvailabilityQuerySchema`) | IMPLEMENTADO |
| R10 | Sem audit logs (API §20.4) | CONFORME |

## 5. Resultado dos Testes

```
pnpm lint                                → PASS
pnpm build                               → PASS
test-availability.mjs                    → 25 test cases, aguardam Docker
```

### Testes implementados (25)

| # | Descrição |
|---|---|
| T1 | GET availability returns valid structure → 200 |
| T2 | MANAGER can GET availability → 200 |
| T3 | PROFESSIONAL sees own availability → 200 |
| T4 | PROFESSIONAL tries other's availability → 403 |
| T5 | Missing serviceId → 422 |
| T6 | Invalid UUID serviceId → 422 |
| T7 | Missing from/to → 422 |
| T8 | from >= to → 422 |
| T9 | Invalid datetime format → 422 |
| T10 | Cross-tenant professionalId → 404 |
| T11 | Professional not found → 404 |
| T12 | Service not found → 404 |
| T13 | Service not assigned to professional → 400 |
| T14 | Inactive service → 404 |
| T15 | Unauthenticated → 401 |
| T16 | Slots align to grid |
| T17 | Slot duration matches service duration |
| T18 | Past slots excluded |
| T19 | Availability blocks exclude slots |
| T20 | Active appointments exclude slots |
| T21 | CANCELLED appointments do NOT block slots |
| T22 | Slots respect shift boundaries (09:00-17:00) |
| T23 | No slots on weekends (only Mon-Fri configured) |
| T24 | Long duration service fits only when shift allows |
| T25 | Response days are sorted by date |

## 6. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:availability`. Validação completa depende de push + GitHub Actions. |
| PEND-002 | MEDIUM | Testes Docker-dependentes (`test-availability.mjs`) não executados localmente por indisponibilidade do Docker no sandbox. |

## 7. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- Audit logs (API §20.4)
- POST/PATCH/DELETE de availability (apenas GET nesta fase)
- Módulo de appointments (fase posterior — PR-3.3)
- Schema / migrations (tabelas pré-existentes, sem alterações)
- Redis ou cache externo
- Guards (`AuthGuard`, `TenantGuard`, `RolesGuard` preservados sem alteração)
- Auth, organizations, professionals, services, working-hours, blocks endpoints
- Docs canônicos (ADR, decision records)

## 8. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- 1 endpoint GET com cálculo timezone-aware
- 6 arquivos criados + 2 modificados
- `alignToSlotGrid()` no `shared` como âncora única de grade (ADR-023)
- PROFESSIONAL scope enforcement: 403 para professional de outro usuário
- Service inactive → 404 (tenant opacity). Professional inactive → 200 vazio
- DST fixture `America/Santiago` planejada para validação de transição de horário
- 25 testes em `test-availability.mjs`
- Lint: PASS | Build: PASS
- CI remoto: PENDENTE
- **Phase 3 iniciada**
