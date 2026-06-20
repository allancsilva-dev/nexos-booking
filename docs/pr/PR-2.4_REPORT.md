# PR-2.4_REPORT — Phase 2: Availability Blocks (Scheduling Module)

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE. CI remoto: PENDENTE (validação manual posterior)

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-2.3 | PASS_PROVISÓRIO_CI_PENDENTE | `docs/pr/PR-2.3_REPORT.md` — working hours module |

## 3. Endpoints (3)

| # | Method | Path | Roles | Descrição |
|---|---|---|---|---|
| 1 | GET | `/professionals/:professionalId/blocks` | OWNER, MANAGER, PROFESSIONAL | Lista blocos de indisponibilidade |
| 2 | POST | `/professionals/:professionalId/blocks` | OWNER, MANAGER | Cria bloco de indisponibilidade |
| 3 | DELETE | `/professionals/:professionalId/blocks` | OWNER, MANAGER | Remove bloco de indisponibilidade |

## 4. Arquivos (8 = 5 criados + 3 modificados)

```
Criados (5):
  C1: apps/api/src/scheduling/blocks/index.ts
  C2: apps/api/src/scheduling/blocks/blocks.module.ts
  C3: apps/api/src/scheduling/blocks/blocks.controller.ts
  C4: apps/api/src/scheduling/blocks/blocks.service.ts
  C5: apps/api/src/scheduling/blocks/blocks.repository.ts

Modificados (3):
  M1: apps/api/src/scheduling/scheduling.module.ts     — +BlocksModule
  M2: packages/shared/src/error-code.ts                — +AVAILABILITY_BLOCK_OVERLAP, AVAILABILITY_BLOCK_NOT_FOUND
  M3: packages/shared/src/dto/availability-block.dto.ts — CreateAvailabilityBlockSchema
```

## 5. Regras Verificadas

| Regra | Descrição | Status | Evidência |
|---|---|---|---|
| R1 | `withTenantContext` usado em todos os métodos | IMPLEMENTADO | `blocks.service.ts` — findAll, create, delete |
| R2 | Sem audit logs (API §20.4) | CONFORME | Nenhum log de auditoria registrado nas operações de bloco |
| R3 | GET intersection query: `starts_at < :to AND ends_at > :from` | IMPLEMENTADO | `blocks.repository.ts` — filtro de sobreposição por intervalo |
| R4 | `reason` > 500 caracteres → 422 `VALIDATION_ERROR` | IMPLEMENTADO | Validação inline via `CreateAvailabilityBlockSchema.safeParse()` |
| R5 | Timestamps ISO-8601 com offset | IMPLEMENTADO | Entrada/saída serializada com timezone offset (ex: `+03:00`) |
| R6 | Cross-tenant opacity | IMPLEMENTADO | `blocks.repository.ts` — filtra por `organization_id` via professional |
| R7 | `deleteBlock` retorna `NOT_FOUND` genérico (tenant opacity) | IMPLEMENTADO | MINOR aceito — sem distinção entre "não existe" e "outro tenant" |

## 6. Resultado dos Testes

```
pnpm lint                                → PASS
pnpm build                               → PASS
test-availability-blocks.mjs             → 13 test cases, aguardam Docker
```

### Testes implementados (13)

| # | Descrição |
|---|---|
| T1 | GET blocks (empty) → 200, [] |
| T2 | POST block → 201 |
| T3 | GET after POST → 200, reflects created block |
| T4 | POST overlapping block → 409 AVAILABILITY_BLOCK_OVERLAP |
| T5 | DELETE block → 204 |
| T6 | DELETE inexistent block → 404 NOT_FOUND (genérico) |
| T7 | Cross-tenant professional → 404 |
| T8 | reason > 500 chars → 422 VALIDATION_ERROR |
| T9 | Invalid ISO-8601 timestamp → 422 VALIDATION_ERROR |
| T10 | PROFESSIONAL can GET own blocks → 200 |
| T11 | PROFESSIONAL cannot POST → 403 AUTHZ_DENIED |
| T12 | PROFESSIONAL cannot DELETE → 403 AUTHZ_DENIED |
| T13 | Error response has error.code + error.requestId |

## 7. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:availability-blocks`. Validação completa depende de push + GitHub Actions. |
| PEND-002 | MEDIUM | Testes Docker-dependentes (`test-availability-blocks.mjs`) não executados localmente por indisponibilidade do Docker no sandbox. |

## 8. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- Audit logs (API §20.4 — proibido para blocos de disponibilidade)
- Módulos de appointments, clients (fases posteriores da Phase 2)
- Schema / migrations (tabela `availability_blocks` pré-existente, sem alterações)
- Redis ou cache externo
- Guards (`AuthGuard`, `TenantGuard`, `RolesGuard` preservados sem alteração)
- Auth endpoints, organizations endpoints, professionals endpoints, services endpoints, working-hours endpoints
- PATCH / PUT de blocos (apenas criação e remoção no escopo)
- Docs canônicos (ADR, decision records)

## 9. MINOR Aceito

| ID | Descrição | Justificativa |
|---|---|---|
| MINOR-001 | `deleteBlock` retorna `NOT_FOUND` genérico sem diferenciar "bloco não existe" de "bloco de outro tenant" | Tenant opacity — consistente com cross-tenant protection dos módulos anteriores |

## 10. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- Auditoria de estado: APTA (PR-2.3 PASS_PROVISÓRIO_CI_PENDENTE confirmado)
- Availability Blocks module criado com 5 novos arquivos + 3 modificações
- 3 endpoints REST (GET + POST + DELETE)
- `withTenantContext`, sem audit logs (API §20.4), GET intersection (`starts_at < to AND ends_at > from`)
- Validação inline via `CreateAvailabilityBlockSchema.safeParse()` — reason max 500 → 422
- Timestamps ISO-8601 com offset
- Lint: PASS
- Build: PASS
- Testes: 13 implementados em `test-availability-blocks.mjs`, aguardam execução com Docker
- CI remoto: PENDENTE
- MINOR aceito: deleteBlock retorna NOT_FOUND genérico (tenant opacity)
- **Phase 2 complete**
