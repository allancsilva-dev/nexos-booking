# PR-2.1_REPORT — Phase 2: Professionals Module (CRUD)

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE. CI remoto: PENDENTE (validação manual posterior)

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-1.6 | PASS_PROVISÓRIO_CI_PENDENTE | `docs/pr/PR-1.6_REPORT.md` — slug-generator (`generateSlugCandidates`) |
| PR-1.7 | PASS_PROVISÓRIO_CI_PENDENTE | `docs/pr/PR-1.7_REPORT.md` — frontend shell |
| PR-1.8 | PASS_PROVISÓRIO_CI_PENDENTE | `docs/pr/PR-1.8_REPORT.md` — cron jobs de manutenção |

## 3. Auditoria de Desenho

### 3.1 Phase 2 kickoff — 14 arquivos (9 criados + 5 modificados)

```
Criados (C1-C9):
  C1: apps/api/src/professionals/index.ts
  C2: apps/api/src/professionals/professionals.module.ts
  C3: apps/api/src/professionals/professionals.controller.ts
  C4: apps/api/src/professionals/professionals.service.ts
  C5: apps/api/src/professionals/professionals.repository.ts
  C6: apps/api/src/professionals/dto/create-professional.dto.ts
  C7: apps/api/src/professionals/dto/update-professional.dto.ts
  C8: apps/api/scripts/test-professionals.mjs
  C9: packages/shared/src/dto/professional.dto.ts

Modificados (M1-M5):
  M1: apps/api/src/app.module.ts                    — +ProfessionalsModule
  M2: packages/shared/src/error-code.ts             — +PROFESSIONAL_USER_TAKEN
  M3: packages/shared/src/__contract-tests__/error-code.contract-test.ts — +PROFESSIONAL_USER_TAKEN
  M4: apps/api/src/common/exceptions/domain.exception.ts — +ProfessionalUserTakenException
  M5: pnpm-lock.yaml                                 — lockfile synchronized
```

### 3.2 Endpoints (3)

| # | Method | Path | Roles | Descrição |
|---|---|---|---|---|
| 1 | GET | `/professionals` | OWNER, MANAGER, PROFESSIONAL | Lista profissionais da org ativa |
| 2 | POST | `/professionals` | OWNER, MANAGER | Cria profissional (slug auto-generated ou explícito) |
| 3 | PATCH | `/professionals/:id` | OWNER, MANAGER | Atualiza name, slug, active, userId |

### 3.3 Slug retry-on-conflict

Criação e atualização com slug auto-generated usam `generateSlugCandidates` importado do slug-generator do PR-1.6 (`apps/api/src/organizations/slug-generator.ts`). Algoritmo: tenta `name-sanitized`, `name-sanitized-2`, …, `name-sanitized-N` (até `SLUG_MAX_RETRIES = 10`) com `SAVEPOINT` por tentativa. Em caso de colisão, faz `ROLLBACK TO SAVEPOINT` e tenta próximo candidato. Slug explícito: tenta uma única vez; se tomado → 409 `SLUG_TAKEN`.

### 3.4 Resultado da auditoria de desenho

**APTA PARA IMPLEMENTAÇÃO** — 3 endpoints REST, slug retry reutilizando infraestrutura do PR-1.6, `PROFESSIONAL_USER_TAKEN` no shared package, schema Drizzle alinhado com migration 0003 (unique partial `professionals_org_user_uk`).

## 4. Implementação

### 4.1 GET /professionals (`professionals.controller.ts:44-50`)

- `@UseGuards(AuthGuard, TenantGuard, RolesGuard)` + `@Roles("OWNER", "MANAGER", "PROFESSIONAL")`
- Delega a `ProfessionalsService.findAll(orgId)` — transação de leitura, retorna lista mapeada via `mapProfessional`
- Inclui profissionais inativos (`active: false`) — sem filtro por status

### 4.2 POST /professionals (`professionals.service.ts:89-172`)

- `@Roles("OWNER", "MANAGER")`
- Validação de membership: se `userId` fornecido, verifica `organization_users` com `status = 'ACTIVE'`; se não, 422 `VALIDATION_ERROR`
- Slug: explícito (validado contra `isReservedSlug`) ou auto-generated via `generateSlugCandidates`
- Retry loop com `SAVEPOINT slug_attempt` + `ROLLBACK TO SAVEPOINT` em colisão
- Constraint `professionals_org_user_uk` violada → 409 `PROFESSIONAL_USER_TAKEN`
- Audit log: `PROFESSIONAL_CREATED` com `metadata: { professionalId }` (sem PII)

### 4.3 PATCH /professionals/:id (`professionals.service.ts:174-338`)

- `@Roles("OWNER", "MANAGER")`
- Partial update: `name`, `slug`, `active`, `userId` — campos não enviados são preservados
- Name alterado + slug não fornecido → re-gera slug auto
- Name alterado + slug explícito → usa slug fornecido
- Apenas slug alterado (name inalterado) → atualiza slug diretamente
- `active` toggle independente dos demais campos
- `userId`: mesma validação de membership que o POST; constraint `professionals_org_user_uk` → 409
- Audit log: `PROFESSIONAL_UPDATED` com `metadata: { professionalId, changedFields }` (sem PII)
- Cross-tenant: `findById` filtra por `organization_id` → 404 se não pertence à org ativa

## 5. Dependências Novas

Nenhuma. Nenhum pacote novo adicionado.

## 6. Resultado dos Testes

```
pnpm lint                                  → PASS
pnpm build                                 → PASS
test-professionals.mjs                      → 11 test cases implementados, aguardam Docker
```

### Testes implementados (11 — aguardam execução)

| # | Descrição |
|---|---|
| T1 | OWNER creates professional → 201, slug auto-generated |
| T2 | MANAGER creates professional → 201 |
| T3 | PROFESSIONAL tries to create → 403 AUTHZ_DENIED |
| T4 | Cross-tenant PATCH → 404 |
| T5 | Slug collision → auto-retry to unique slug |
| T6 | PATCH with explicit taken slug → 409 SLUG_TAKEN |
| T7 | PATCH active:false → still in GET list |
| T8 | Create with valid userId → 201 |
| T9a | Create with non-member userId → 422 VALIDATION_ERROR |
| T9b | Create with DISABLED member userId → 422 VALIDATION_ERROR |
| T10 | Duplicate userId in same org → 409 PROFESSIONAL_USER_TAKEN |
| T11 | PATCH unknown id → 404 |

## 7. Regras Críticas Verificadas

| Regra | Descrição | Status | Evidência |
|---|---|---|---|
| R1 | `PROFESSIONAL_USER_TAKEN` registrado no catálogo canônico do shared | IMPLEMENTADO | `error-code.ts:52` — `"PROFESSIONAL_USER_TAKEN"` no array `ERROR_CODES` |
| R2 | Schema Drizzle alinhado com migration 0003 | IMPLEMENTADO | `schema/index.ts:101-117` — unique partial `professionals_org_user_uk WHERE user_id IS NOT NULL` espelha migration `0003_advanced_constraints.sql:140-142` |
| R3 | Slug retry reusa `generateSlugCandidates` do PR-1.6 | IMPLEMENTADO | `professionals.service.ts:19,117,255` — import e uso direto do slug-generator |
| R4 | Audit logs sem PII | IMPLEMENTADO | `professionals.service.ts:161-168,327-334` — metadata contém apenas `professionalId` e `changedFields`, sem nome, email ou userId |
| R5 | Cross-tenant opacity | IMPLEMENTADO | `professionals.repository.ts:17-27` — `findById` filtra `organization_id`, PATCH retorna 404 para org diferente |

## 8. Divergências e Decisões

### DIV-001: Slug retry-on-conflict importado do PR-1.6

**Observação:** `generateSlugCandidates` foi originalmente implementado no módulo de organizations (`apps/api/src/organizations/slug-generator.ts`). O módulo de professionals importa diretamente esta função sem duplicação.

**Decisão:** Reuso sem alterações. O algoritmo de slug é compartilhado entre organizations e professionals, mantendo consistência de formato e comportamento.

### DIV-002: `PROFESSIONAL_USER_TAKEN` como novo error code no shared

**Observação:** A constraint `professionals_org_user_uk` (unique partial em `(organization_id, user_id) WHERE user_id IS NOT NULL`) exige um error code dedicado para o frontend distinguir de `SLUG_TAKEN`.

**Decisão:** Adicionado `PROFESSIONAL_USER_TAKEN` ao catálogo canônico `ERROR_CODES` em `packages/shared/src/error-code.ts:52`. Exception correspondente em `domain.exception.ts:70-77` com HTTP 409.

## 9. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:professionals`. Validação completa depende de push + GitHub Actions. |
| PEND-002 | MEDIUM | Testes Docker-dependentes (`test-professionals.mjs`) não executados localmente por indisponibilidade do Docker no sandbox. |

## 10. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- Endpoints de DELETE (profissionais são desativados via `active: false`, não removidos)
- Módulos de services, clients, appointments (fases posteriores da Phase 2)
- Schema / migrations (tabela `professionals` pré-existente, sem alterações)
- Redis ou cache externo
- Guards (`AuthGuard`, `CsrfGuard`, `TenantGuard`, `RolesGuard` preservados sem alteração)
- Auth endpoints, organizations endpoints, invitations endpoints
- Docs canônicos (ADR, decision records)

## 11. Arquivos Tocados (lista completa)

```
Criados (9):
  apps/api/src/professionals/index.ts
  apps/api/src/professionals/professionals.module.ts
  apps/api/src/professionals/professionals.controller.ts
  apps/api/src/professionals/professionals.service.ts
  apps/api/src/professionals/professionals.repository.ts
  apps/api/src/professionals/dto/create-professional.dto.ts
  apps/api/src/professionals/dto/update-professional.dto.ts
  apps/api/scripts/test-professionals.mjs
  packages/shared/src/dto/professional.dto.ts

Modificados (5):
  apps/api/src/app.module.ts
  packages/shared/src/error-code.ts
  packages/shared/src/__contract-tests__/error-code.contract-test.ts
  apps/api/src/common/exceptions/domain.exception.ts
  pnpm-lock.yaml
```

## 12. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- Auditoria de estado: APTA (PR-1.6, PR-1.7, PR-1.8 PASS_PROVISÓRIO_CI_PENDENTE confirmados)
- Auditoria de desenho: APTA (14 arquivos, 3 endpoints, slug retry de PR-1.6, sem violação de escopo)
- Lint: PASS
- Build: PASS
- Testes: 11 implementados em `test-professionals.mjs`, aguardam execução com Docker
- Regras críticas R1-R5: todas implementadas e verificadas
- Nenhuma dependência nova
- CI remoto: PENDENTE
