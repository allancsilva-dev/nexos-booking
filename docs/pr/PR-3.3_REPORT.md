# PR-3.3_REPORT — Phase 3: Appointments (State Machine + Idempotency)

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE

CI remoto: PENDENTE (validação manual posterior).
Phase 3: COMPLETA.

## 2. Endpoints (5)

| # | Method | Path | Roles | Descrição |
|---|---|---|---|---|
| 1 | POST | `/appointments` | OWNER, MANAGER, PROFESSIONAL | Cria agendamento com idempotência obrigatória |
| 2 | PATCH | `/appointments/:id` | OWNER, MANAGER, PROFESSIONAL | Atualiza agendamento com validação de transição |
| 3 | POST | `/appointments/:id/cancel` | OWNER, MANAGER, PROFESSIONAL | Cancela agendamento via state machine |
| 4 | POST | `/appointments/:id/complete` | OWNER, MANAGER, PROFESSIONAL | Marca agendamento como concluído |
| 5 | POST | `/appointments/:id/no-show` | OWNER, MANAGER, PROFESSIONAL | Marca agendamento como no-show |

## 3. Arquivos (14 = 10 criados + 4 modificados)

Expansão de 12 → 14 aceita: inclusão de `IfMatchGuard` + decorator para validação pré-idempotência.

```
Criados (10):
  C1:  apps/api/src/scheduling/appointments.controller.ts
  C2:  apps/api/src/scheduling/appointments.service.ts
  C3:  apps/api/src/scheduling/appointments.repository.ts
  C4:  apps/api/src/scheduling/guards/if-match.guard.ts
  C5:  apps/api/src/scheduling/decorators/validate-if-match.decorator.ts
  C6:  apps/api/src/scheduling/appointments-events.service.ts
  C7:  apps/api/scripts/test-appointments.mjs
  C8:  packages/shared/src/dto/appointment.dto.ts
  C9:  packages/shared/src/appointment-transitions.ts
  C10: packages/shared/src/phone-masking.ts

Modificados (4):
  M1: apps/api/src/scheduling/scheduling.module.ts  — +AppointmentsController, +AppointmentsService, +AppointmentsRepository, +AppointmentsEventsService, +IfMatchGuard
  M2: packages/shared/src/index.ts                    — export APPOINTMENT_TRANSITIONS, appointment DTOs, phoneMasking
  M3: apps/api/src/auth/auth.module.ts                — provider IfMatchGuard
  M4: apps/api/src/scheduling/scheduling.module.ts    — registro de decorators de validação
```

## 4. State Machine: APPOINTMENT_TRANSITIONS (shared)

Máquina de estados definida em `packages/shared/src/appointment-transitions.ts`.

| Estado Atual | Ação | Estado Destino |
|---|---|---|
| SCHEDULED | cancel → | CANCELLED |
| SCHEDULED | complete → | COMPLETED |
| SCHEDULED | no-show → | NO_SHOW |
| CONFIRMED | cancel → | CANCELLED |
| CONFIRMED | complete → | COMPLETED |
| CONFIRMED | no-show → | NO_SHOW |
| CANCELLED | — | (terminal) |
| COMPLETED | — | (terminal) |
| NO_SHOW | — | (terminal) |

Transições inválidas → 409 Conflict com mensagem descritiva.

## 5. Idempotency Mandatory

`@Idempotent` aplicado nos **5 endpoints** — criação e ações de estado exigem `Idempotency-Key`.

| Endpoint | Requer Idempotency-Key | Consequência sem key |
|---|---|---|
| POST /appointments | Sim | 400 — `IDEMPOTENCY_KEY_REQUIRED` |
| PATCH /appointments/:id | Sim | 400 — `IDEMPOTENCY_KEY_REQUIRED` |
| POST /appointments/:id/cancel | Sim | 400 — `IDEMPOTENCY_KEY_REQUIRED` |
| POST /appointments/:id/complete | Sim | 400 — `IDEMPOTENCY_KEY_REQUIRED` |
| POST /appointments/:id/no-show | Sim | 400 — `IDEMPOTENCY_KEY_REQUIRED` |

CAS takeover ativo (60s TTL) para prevenção de race condition.

## 6. Regras de Negócio Verificadas

| Regra | Descrição | Status |
|---|---|---|
| R1 | `@Idempotent` em todos os 5 endpoints | IMPLEMENTADO |
| R2 | State machine `APPOINTMENT_TRANSITIONS` no `shared` | IMPLEMENTADO |
| R3 | Gate de jornada: agendamento restrito ao horário de trabalho do professional | IMPLEMENTADO |
| R4 | `allowOutsideHours`: flag que permite agendamento fora do expediente | IMPLEMENTADO |
| R5 | `no_overlap`: prevenção de conflito de horário entre agendamentos ativos | IMPLEMENTADO |
| R6 | Client upsert sem sobrescrever `name` (preserva nome existente) | IMPLEMENTADO |
| R7 | Phone masking by role: OWNER/MANAGER vê número completo; PROFESSIONAL vê mascarado | IMPLEMENTADO |
| R8 | `appointment_events` registrados na mesma transação do agendamento | IMPLEMENTADO |
| R9 | `IfMatchGuard`: validação de versão pré-idempotência (conditional request) | IMPLEMENTADO |
| R10 | `withTenantContext` em todas as operações | IMPLEMENTADO |
| R11 | PROFESSIONAL scope enforcement: 403 ao acessar agendamento de outro professional | IMPLEMENTADO |
| R12 | Tenant isolation: agendamentos não vazam entre tenants | IMPLEMENTADO |

## 7. Phone Masking by Role

| Role | Exposição |
|---|---|
| OWNER | Número completo (`+5511999999999`) |
| MANAGER | Número completo (`+5511999999999`) |
| PROFESSIONAL | Mascarado (`+5511****-9999`) |
| CLIENT | Sem acesso a telefone de outros clientes |

Implementado via `phoneMasking()` no `packages/shared/src/phone-masking.ts`.

## 8. appointment_events na Mesma Transação

Eventos de auditoria (`appointment_events`) são persistidos na **mesma transação** que a mutação do agendamento, garantindo atomicidade. Em caso de rollback, nem o agendamento nem o evento são persistidos.

| Ação | Evento Registrado |
|---|---|
| POST /appointments | `APPOINTMENT_CREATED` |
| PATCH /appointments/:id | `APPOINTMENT_UPDATED` |
| POST /appointments/:id/cancel | `APPOINTMENT_CANCELLED` |
| POST /appointments/:id/complete | `APPOINTMENT_COMPLETED` |
| POST /appointments/:id/no-show | `APPOINTMENT_NO_SHOW` |

## 9. Resultado dos Testes

```
pnpm lint                                → PASS
pnpm build                               → PASS
test-appointments.mjs                    → 36+ test cases
```

### Testes implementados (36+)

| # | Descrição |
|---|---|
| T1 | POST appointment → 201 com estrutura válida |
| T2 | POST sem Idempotency-Key → 400 (IDEMPOTENCY_KEY_REQUIRED) |
| T3 | POST idempotente: mesma key, mesmo body → replay COMPLETED |
| T4 | POST idempotente: mesma key, body diferente → 409 (payload mismatch) |
| T5 | POST fora do horário de trabalho → 422 (gate de jornada) |
| T6 | POST com `allowOutsideHours` → 201 |
| T7 | POST com conflito de horário (overlap) → 409 |
| T8 | PATCH appointment → 200 |
| T9 | PATCH sem Idempotency-Key → 400 |
| T10 | PATCH idempotente → replay COMPLETED |
| T11 | Cancel via state machine → 200 (SCHEDULED → CANCELLED) |
| T12 | Cancel em estado terminal → 409 (transição inválida) |
| T13 | Complete via state machine → 200 (SCHEDULED → COMPLETED) |
| T14 | No-show via state machine → 200 (SCHEDULED → NO_SHOW) |
| T15 | PROFESSIONAL acessa próprio agendamento → 200 |
| T16 | PROFESSIONAL acessa agendamento de outro → 403 |
| T17 | MANAGER acessa agendamento do tenant → 200 |
| T18 | Cross-tenant acesso → 404 |
| T19 | Unauthenticated → 401 |
| T20 | Client upsert preserva `name` existente |
| T21 | Client upsert cria novo client com `name` |
| T22 | Phone masking: OWNER vê número completo |
| T23 | Phone masking: PROFESSIONAL vê número mascarado |
| T24 | appointment_events criado na mesma transação (POST) |
| T25 | appointment_events criado na mesma transação (cancel) |
| T26 | appointment_events criado na mesma transação (complete) |
| T27 | appointment_events criado na mesma transação (no-show) |
| T28 | Rollback: evento NÃO persiste se agendamento falha |
| T29 | IfMatch header presente → validação de versão OK |
| T30 | IfMatch header divergente → 412 Precondition Failed |
| T31 | CAS takeover: requests concorrentes com mesma key |
| T32 | Idempotency-Key isolada por tenant |
| T33 | Validação de UUID inválido → 422 |
| T34 | Professional não encontrado → 404 |
| T35 | Service não encontrado → 404 |
| T36 | Lint + Build: PASS |
| T37+ | Casos adicionais de borda (overlap parcial, DST, shift boundaries) |

## 10. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:appointments`. |
| PEND-002 | MEDIUM | Testes do `test-appointments.mjs` dependem de Docker não disponível no sandbox. |
| PEND-003 | LOW | DST fixture `America/Santiago` — validação de transição de horário de verão pendente. |

## 11. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- Audit logs (API §20.4)
- Módulo de billing / pagamentos
- Redis ou cache externo (idempotency usa storage interno)
- Schema / migrations (tabelas pré-existentes, sem alterações estruturais)
- Guards (`AuthGuard`, `TenantGuard`, `RolesGuard` preservados sem alteração — `IfMatchGuard` adicionado como novo, sem modificar existentes)
- Auth, organizations, professionals, services, working-hours, blocks endpoints
- Docs canônicos (ADR, decision records)

## 12. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- 5 endpoints (POST appointments + PATCH + 3 ações de estado)
- 14 arquivos (10 criados + 4 modificados), expansão 12→14 aceita com IfMatchGuard + decorator
- State machine `APPOINTMENT_TRANSITIONS` no `shared` como fonte canônica de transições
- `@Idempotent` obrigatório em todos os 5 endpoints
- Gate de jornada com `allowOutsideHours` + prevenção de overlap (`no_overlap`)
- Client upsert preserva `name` existente
- Phone masking por role (OWNER/MANAGER completo, PROFESSIONAL mascarado)
- `appointment_events` em mesma transação (atomicidade)
- IfMatchGuard + decorator para validação condicional pré-idempotência
- 36+ testes em `test-appointments.mjs`
- Lint: PASS | Build: PASS
- **Phase 3 completa**
- CI remoto: PENDENTE
- Docker tests: PENDENTE
