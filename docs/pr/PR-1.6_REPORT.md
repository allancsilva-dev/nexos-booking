# PR-1.6_REPORT — RBAC: authorization + organizations + invitations

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE. CI remoto: PENDENTE (validação manual posterior)

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-1.4 | PASS confirmado | `docs/pr/PR-1.4_REPORT.md` — 36/36 auth, 24/24 HTTP, 14/14 RLS |
| PR-1.5 | PASS_PROVISÓRIO_CI_PENDENTE confirmado | `docs/pr/PR-1.5_REPORT.md` — 40 testes implementados, verificação de e-mail + reset/troca de senha + notificações |

## 3. Auditoria de Desenho

### 3.1 Mapa 5b v3 — 25 arquivos (18 criados + 7 modificados)

```
Criados (C1-C18):
  C1:  apps/api/src/authorization/index.ts
  C2:  apps/api/src/authorization/authorization.module.ts
  C3:  apps/api/src/authorization/guards/roles.guard.ts
  C4:  apps/api/src/authorization/decorators/roles.decorator.ts
  C5:  apps/api/src/organizations/index.ts
  C6:  apps/api/src/organizations/organizations.module.ts
  C7:  apps/api/src/organizations/organizations.controller.ts
  C8:  apps/api/src/organizations/organizations.service.ts
  C9:  apps/api/src/organizations/organizations.repository.ts
  C10: apps/api/src/organizations/slug-generator.ts
  C11: apps/api/src/organizations/invitations/invitations.service.ts
  C12: apps/api/src/organizations/invitations/invitations.repository.ts
  C13: apps/api/src/organizations/dto/invite-member.dto.ts
  C14: apps/api/src/organizations/dto/update-organization.dto.ts
  C15: apps/api/src/organizations/dto/update-member.dto.ts
  C16: apps/api/src/auth/dto/accept-invite.dto.ts
  C17: apps/api/src/common/exceptions/domain.exception.ts
  C18: apps/api/scripts/test-org.mjs

Modificados (M1-M7):
  M1: apps/api/src/app.module.ts                              — +OrganizationsModule, +AuthorizationModule
  M2: apps/api/src/auth/auth.controller.ts                    — +accept-invite endpoint
  M3: apps/api/src/auth/auth.module.ts                        — +forwardRef(OrganizationsModule)
  M4: apps/api/src/auth/auth.service.ts                       — +acceptInvite delegado a InvitationsService
  M5: apps/api/src/auth/guards/tenant.guard.ts                — +role no TenantContext, query DB retorna role
  M6: apps/api/src/auth/notifications/resend-sender.ts        — +template invitation
  M7: apps/api/src/common/filters/http-exception.filter.ts    — +DomainException (code preservation)

Também modificados (fora do mapa principal):
  packages/shared/package.json                                — +dep zod
  packages/shared/src/index.ts                                — +OrganizationSchema, MemberSchema, InvitationSchema, AcceptInviteSchema
  packages/shared/src/dto/organization.dto.ts                 — Zod schemas de OrganizationDTO, MemberDTO, InvitationDTO
  packages/shared/src/dto/accept-invite.dto.ts                — Zod schema de AcceptInviteInput
  docs/BUGFIX_LOG.md                                          — +BUG-007 (AuthService.generateSlug check-then-insert)
  pnpm-lock.yaml                                              — +zod
```

### 3.2 Módulos implementados (3)

#### 3.2.1 `authorization` (4 arquivos)

- **Module:** `AuthorizationModule` (`@Global()`) — provedor `RolesGuard` disponível globalmente sem imports repetidos
- **Guard:** `RolesGuard` (deny-by-default) — sem `@Roles()` → 403 AUTHZ_DENIED; com `@Roles()` → verifica se `tenant.role` está na lista permitida
- **Decorator:** `@Roles(...roles: string[])` — `SetMetadata(ROLES_KEY, roles)`
- **Audit:** `AUTHZ_DENIED` registrado em `audit_logs` no branch de negação (fire-and-forget, `.catch(() => {})`)

#### 3.2.2 `organizations` (8 endpoints + service + repository)

- **Module:** `OrganizationsModule` — importa `AuthModule` via `forwardRef` (dependência circular: AuthModule → OrganizationsModule → AuthModule)
- **Service:** `OrganizationsService` — CRUD de orgs, listagem de membros, update de membro com proteção LAST_OWNER
- **Repository:** `OrganizationsRepository` — queries com `FOR UPDATE` para lock, join com users para membros
- **SlugGenerator:** `generateSlugCandidates()` + `isReservedSlug()` + lista de slugs reservados
- **DTOs:** `UpdateOrganizationInput`, `UpdateMemberInput`, `InviteMemberInput` (interfaces TypeScript, sem decorators)

#### 3.2.3 `invitations` (service + repository para fluxo completo)

- **Service:** `InvitationsService` — create (com reenvio), list, revoke, accept (com registro opcional)
- **Repository:** `InvitationsRepository` — CRUD de invitations + criação de user/membership no accept
- **Token:** SHA-256 hash no banco, `randomBytes(32).toString("hex")` como token cru (apenas em memória e no e-mail)
- **TTL:** 7 dias (`expires_at`)
- **Consumo atômico:** `markAccepted` usa `UPDATE ... WHERE accepted_at IS NULL` + verificação `rowCount === 1`
- **Accept registrando:** se `name` + `password` fornecidos, cria usuário (se não existir) + membership + sessão JWT
- **Audit:** `MEMBER_INVITED`, `INVITATION_REVOKED`, `INVITATION_ACCEPTED`

### 3.3 Resultado da auditoria de desenho

**APTA PARA IMPLEMENTAÇÃO** — alinhado com ADR-004, ADR-006, ADR-009, ADR-011, ADR-012, ADR-020, ADR-021.

## 4. Endpoints Implementados (9)

| # | Método | Rota | Auth | Roles | Descrição |
|---|---|---|---|---|---|
| 1 | GET | /api/v1/organizations/me | Bearer | — | Lista organizações do usuário logado |
| 2 | GET | /api/v1/organizations/:id | Bearer + TenantGuard | OWNER, MANAGER, PROFESSIONAL | Detalhes da organização |
| 3 | PATCH | /api/v1/organizations/:id | Bearer + TenantGuard | OWNER | Atualiza nome, timezone, slotIntervalMin |
| 4 | GET | /api/v1/organizations/:id/members | Bearer + TenantGuard | OWNER, MANAGER | Lista membros da organização |
| 5 | PATCH | /api/v1/organizations/:id/members/:userId | Bearer + TenantGuard | OWNER | Altera role/status de membro (LAST_OWNER protegido) |
| 6 | GET | /api/v1/organizations/:id/invitations | Bearer + TenantGuard | OWNER | Lista convites pendentes |
| 7 | POST | /api/v1/organizations/:id/members/invite | Bearer + TenantGuard | OWNER | Convida membro (exige e-mail verificado) |
| 8 | DELETE | /api/v1/organizations/:id/invitations/:invitationId | Bearer + TenantGuard | OWNER | Revoga convite pendente |
| 9 | POST | /api/v1/auth/accept-invite | Public (opcional Bearer) | — | Aceita convite (com ou sem registro) |

## 5. Resultado dos Testes

```
pnpm lint                                  → PASS (3/3 tasks)
pnpm build                                 → PASS (3/3 tasks)
Testes Docker-dependentes                  → NÃO EXECUTADOS (sem Docker no sandbox)
test:db (14/14)                            → Expected PASS (sem alterações em migrations ou schema RLS)
test:http (24/24)                          → Expected PASS (novos endpoints não quebram existentes)
test:auth (36/36)                          → Expected PASS (PR-1.6 não altera fluxos PR-1.4)
test:auth-email (40/40)                    → Expected PASS (sem alterações nos fluxos de e-mail)
test-org.mjs                               → 52 testes implementados em 10 grupos, aguardam execução com Docker
```

### Testes de organizations/invitations/authorization implementados (52 — aguardam execução)

| Group | Tests | Descrição |
|---|---|---|
| 1 — Organizations | T1-T6 | GET me, GET :id própria, GET :id outra org (404), GET :id sem membership (404), GET :id sem Bearer (401) |
| 2 — Organization PATCH | T7-T11 | PATCH válido, timezone inválido (422), slotIntervalMin inválido (422), name gera novo slug, sem Bearer (401) |
| 3 — Members | T12-T20 | list members OWNER/MANAGER, list sem role (403), update role, demote last OWNER (409 LAST_OWNER), DISABLE last OWNER (409 LAST_OWNER), DISABLE membro revoga sessões, DISABLE com status inválido |
| 4 — Invitations: Create | T21-T27 | invite válido (201), invite sem e-mail verificado (403 EMAIL_NOT_VERIFIED), invite duplicado reusa token, invite sem OWNER (403), rate-limit invite IP, rate-limit invite por token prefix |
| 5 — Invitations: Accept (existing user) | T28-T33 | aceite por usuário existente (200), token inválido (410), token expirado (410), token reusado (410), usuário já membro (409), sem token (400) |
| 6 — Invitations: Accept (register-by-invite) | T34-T38 | registro por convite (201 + tokens), senha curta (410), name vazio, e-mail já existe → vincula ao existente, envelope CREATED |
| 7 — Invitations: Revoke | T39-T41 | revoke válido, revoke com token inválido, revoke sem OWNER (403) |
| 8 — Tenant Isolation | T42-T44 | :id de outra org → 404, membro de org A não vê members de org B, convite criado em org A não aparece em org B |
| 9 — Authorization Guards | T45-T48 | rota com @Roles sem papel → 403, rota sem @Roles → 403 (deny-by-default), TenantGuard seta role, role errada → 403 |
| 10 — Audit Logs | T49-T52 | ORGANIZATION_UPDATED, MEMBER_DISABLED + SESSION_REVOKED, MEMBER_INVITED, INVITATION_ACCEPTED |

## 6. Regras Críticas Verificadas (R1-R5)

| Regra | Descrição | Status | Evidência |
|---|---|---|---|
| R1 | LAST_OWNER não pode ser removido (mudança de role ou DISABLED) | IMPLEMENTADO | `lockActiveOwners` com `FOR UPDATE`, verificação `owners.length === 1 && owners[0].id === targetMembership.id`, lança `LastOwnerException` (409). Duas branches: mudança de role e DISABLED. |
| R2 | Slug retry-on-conflict com SAVEPOINTs | IMPLEMENTADO | `organizations.service.ts:119-159` — loop com `SAVEPOINT slug_attempt`, tenta UPDATE, captura `code === "23505"`, `ROLLBACK TO SAVEPOINT` e próximo candidato. Esgota candidatos → `SlugTakenException` (409). |
| R3 | :id mismatch → 404 (não 200 com dados errados) | IMPLEMENTADO | `validateOrgId()` em `organizations.controller.ts:40-45` — compara `tenant.orgId !== paramId` e lança `NotFoundException` antes de qualquer query. |
| R4 | Deny-by-default no RolesGuard | IMPLEMENTADO | `RolesGuard.canActivate()` linha 34-36: sem `@Roles()` ou array vazio → `ForbiddenException`. Linha 46-48: role do tenant não está na lista → `ForbiddenException` + `AUTHZ_DENIED` em audit. |
| R5 | Invite token com consumo atômico | IMPLEMENTADO | `markAccepted()` em `invitations.repository.ts:96-107` — `UPDATE ... WHERE accepted_at IS NULL` + verificação `rowCount === 1`. Se `rowCount !== 1`, retorna false → `InviteTokenInvalidException` (410). |

## 7. Provas Negativas

| # | Prova | Evidência |
|---|---|---|
| N1 | Slug retry-on-conflict nunca resulta em 500 | `SAVEPOINT slug_attempt` captura apenas `code === "23505"`, outros erros propagam. Esgota 10 candidatos → `SlugTakenException` (409), nunca erro bruto. |
| N2 | LAST_OWNER verificação usa FOR UPDATE (previne race) | `lockActiveOwners()` usa `.for("update")` — lock pessimista impede TOCTOU entre SELECT e UPDATE. |
| N3 | :id mismatch → 404 antes de qualquer query de negócio | `validateOrgId()` é chamada como primeira instrução em todos os handlers com `:id`. |
| N4 | RolesGuard deny-by-default — sem @Roles → 403 | `if (!requiredRoles \|\| requiredRoles.length === 0) throw new ForbiddenException(...)` — linha 34-36. |
| N5 | DomainException preserva errorCode (não cai em INTERNAL_ERROR) | `HttpExceptionFilter` linha 54-64: `exception instanceof DomainException` → `code: exception.errorCode as ErrorCode`. Codes: `LAST_OWNER`, `SLUG_TAKEN`, `ALREADY_MEMBER`, `INVITE_TOKEN_INVALID`, `INVITE_TOKEN_EXPIRED`, `EMAIL_NOT_VERIFIED`. |
| N6 | Invite token accept é atômico (race-condition) | `markAccepted` usa `UPDATE ... WHERE accepted_at IS NULL` + `rowCount === 1`. Duas chamadas simultâneas → apenas uma sucede. |
| N7 | Invite token nunca persiste cru no banco | `tokenHash = createHash("sha256").update(plainToken).digest("hex")` — armazenado como SHA-256. `plainToken` usado apenas em memória e no e-mail. |
| N8 | Invite notification não bloqueia transação | `this.notification.send(...).catch(() => {})` — fire-and-forget, captura erros silenciosamente. |
| N9 | Reenvio de convite (mesmo e-mail) atualiza token existente | `findPendingByEmail` + `updateToken` — não gera múltiplos registros para o mesmo e-mail pendente. |
| N10 | Accept-invite com registro cria user atômico na mesma transação | User + membership + session + audit criados em única transação. Rollback em qualquer etapa desfaz tudo. |
| N11 | Disable de membro revoga todas as sessões do usuário | `session.revokeAllForUser(tx, targetUserId)` + audit `SESSION_REVOKED` — linha 259-262 de organizations.service.ts. |
| N12 | AUTHZ_DENIED audit em RolesGuard não quebra resposta | `.catch(() => {})` no `writeAudit` — linha 61 de roles.guard.ts. |

## 8. Divergências e Decisões

### DIV-001: DomainException class preserva error.code (alinhado com padrão existente)

**Motivo:** `RateLimitException` e `ValidationException` (PR-1.4 e PR-1.5) já usam o padrão de exceção customizada com código de erro. `DomainException` segue o mesmo padrão — `HttpExceptionFilter` recebeu uma branch dedicada:
```typescript
if (exception instanceof DomainException) {
  response.status(exception.getStatus()).json(
    buildErrorEnvelope({
      code: exception.errorCode as ErrorCode,
      message: exception.message,
      requestId,
    }),
  );
  return;
}
```

Sem esta branch, `DomainException` cairia no handler genérico de `HttpException`, que usaria `getResponse()` e perderia o `errorCode` customizado.

### DIV-002: RolesGuard usa throw em vez de return false

**Observação:** `RolesGuard.canActivate()` usa `throw new ForbiddenException(...)` em vez de `return false`. O NestJS trata ambos como negação de acesso (impede a execução do handler), mas `throw` é usado para garantir que a mensagem `"Authorization denied"` e o status 403 sejam explícitos, em vez de depender do comportamento padrão do NestJS para `return false`.

**Decisão:** Funcionalmente equivalente. Mantido para consistência com o `TenantGuard` que também usa `throw`.

### DIV-003: Role obtido de query DB no TenantGuard (dívida herdada do PR-1.4)

**Observação:** O `TenantGuard` agora consulta `organization_users.role` a cada request para popular `tenant.role`. Isto significa um SELECT extra por request tenant-scoped. ADR-020 permite esta consulta, mas observa que é uma dívida de performance.

**Decisão:** Aceito como dívida herdada. A role no JWT (claim `org_role`) foi considerada mas rejeitada por invalidação imediata de tokens quando role muda (sem mecanismo de revogação seletiva). Migração para cache (Redis) na Fase 2.

### DIV-004: Slug retry-on-conflict usando SAVEPOINTs (ADR-011)

**Implementação:** O `OrganizationsService.update()` usa `SAVEPOINT slug_attempt` dentro da transação:
1. Tenta `UPDATE organizations SET slug = candidate`
2. Se `23505` (unique violation) → `ROLLBACK TO SAVEPOINT` + próximo candidato
3. Se outro erro → propaga (não captura)
4. Esgota 10 candidatos → `SlugTakenException` (409)

Este padrão é a referência correta (ADR-011). O `AuthService.generateSlug()` no registro de empresa (PR-1.4) ainda usa check-then-insert (BUG-007), que será corrigido em PR de remediação.

### DIV-005: H1 — LAST_OWNER_REJECTED audit em conexão separada (sobrevive a rollback)

**Fix:** No `updateMember()`, o audit `LAST_OWNER_REJECTED` é inserido via `this.db.client.insert(auditLogs)` (conexão separada fora da transação `tx`) antes do `throw new LastOwnerException()`. Isto garante que o registro de auditoria sobreviva ao rollback da transação.

### DIV-006: M1 — AUTHZ_DENIED audit no RolesGuard (fire-and-forget)

**Fix:** `RolesGuard.writeAudit()` usa `this.db.client.insert(auditLogs).values({...}).catch(() => {})` — conexão separada, não bloqueia a resposta 403. O `.catch(() => {})` garante que falhas de auditoria não propaguem erros.

### DIV-007: forwardRef para dependência circular AuthModule ↔ OrganizationsModule

**Motivo:** `AuthModule` precisa de `InvitationsService` (do `OrganizationsModule`) para o endpoint `accept-invite`. `OrganizationsModule` precisa de `AuthModule` para guards, JWT, sessions, password, notifications.

**Solução:** Ambos os módulos usam `forwardRef(() => OtherModule)`. NestJS resolve a dependência circular em runtime.

### DIV-008: DTOs como TS interfaces (sem class-validator)

**Decisão:** Seguindo padrão do PR-1.4 e PR-1.5. DTOs são interfaces TypeScript. Validação ocorre manualmente no service. Zod schemas em `@nexos/shared` fornecem validação para o contrato HTTP.

## 9. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:org`. Validação completa depende de push + GitHub Actions. |
| PEND-002 | MEDIUM | Testes Docker-dependentes (`test:db`, `test:http`, `test:auth`, `test:auth-email`, `test:org`) não executados localmente por indisponibilidade do Docker no sandbox. |
| PEND-003 | HIGH | BUG-007: `AuthService.generateSlug()` usa check-then-insert (SELECT → INSERT), viola ADR-011. Colisão de slug pode virar 500. Documentado em `docs/BUGFIX_LOG.md`. Correção pendente em PR de remediação. |
| PEND-004 | MEDIUM | TenantGuard consulta `organization_users.role` a cada request (ADR-020). Dívida de performance herdada do PR-1.4. Migração para cache na Fase 2. |

## 10. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- Schema / migrations (nenhuma migration nova — schema do PR-1.5 reutilizado)
- Auth guards (`AuthGuard`, `CsrfGuard` preservados sem alteração, exceto `TenantGuard` com adição mínima de `role`)
- JWT service (sem alterações em sign/verify)
- Password service (sem alterações em hash/verify)
- Rate limiter core (mesmo `MemoryRateLimiter` do PR-1.4)
- Notifications core (`NotificationSender` interface preservada, `ResendSender` apenas +template `invitation`)
- /health, /ready (sem alterações)
- Docs canônicos (ADR, decision records)
- PR-1.7 (UI / apps/web)
- PR-1.8 (jobs de manutenção)
- Fase 2+ (Redis, real-time, public booking)

## 11. Arquivos Tocados (lista completa)

```
Criados (20):
  apps/api/src/authorization/index.ts
  apps/api/src/authorization/authorization.module.ts
  apps/api/src/authorization/guards/roles.guard.ts
  apps/api/src/authorization/decorators/roles.decorator.ts
  apps/api/src/organizations/index.ts
  apps/api/src/organizations/organizations.module.ts
  apps/api/src/organizations/organizations.controller.ts
  apps/api/src/organizations/organizations.service.ts
  apps/api/src/organizations/organizations.repository.ts
  apps/api/src/organizations/slug-generator.ts
  apps/api/src/organizations/invitations/invitations.service.ts
  apps/api/src/organizations/invitations/invitations.repository.ts
  apps/api/src/organizations/dto/invite-member.dto.ts
  apps/api/src/organizations/dto/update-organization.dto.ts
  apps/api/src/organizations/dto/update-member.dto.ts
  apps/api/src/auth/dto/accept-invite.dto.ts
  apps/api/src/common/exceptions/domain.exception.ts
  apps/api/scripts/test-org.mjs
  packages/shared/src/dto/organization.dto.ts
  packages/shared/src/dto/accept-invite.dto.ts

Modificados (11):
  apps/api/src/app.module.ts
  apps/api/src/auth/auth.controller.ts
  apps/api/src/auth/auth.module.ts
  apps/api/src/auth/auth.service.ts
  apps/api/src/auth/guards/tenant.guard.ts
  apps/api/src/auth/notifications/resend-sender.ts
  apps/api/src/common/filters/http-exception.filter.ts
  docs/BUGFIX_LOG.md
  packages/shared/package.json
  packages/shared/src/index.ts
  pnpm-lock.yaml
```

## 12. Dependências Adicionadas

| Pacote | Versão | Propósito |
|---|---|---|
| `zod` | latest | Schemas de validação para DTOs compartilhados (`OrganizationSchema`, `MemberSchema`, `InvitationSchema`, `AcceptInviteSchema`) |

## 13. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- Auditoria de estado: APTA (PR-1.4 PASS confirmado, PR-1.5 PASS_PROVISÓRIO_CI_PENDENTE confirmado)
- Auditoria de desenho: APTA (25 arquivos, 9 endpoints, 3 módulos, 5 regras críticas implementadas)
- Lint: PASS (3/3 tasks)
- Build: PASS (3/3 tasks)
- Testes: 52 implementados em `test-org.mjs` (10 grupos), aguardam execução com Docker
- Testes herdados: 14 test:db + 24 test:http + 36 test:auth + 40 test:auth-email expected PASS
- Provas negativas: 12 verificações de segurança e consistência implementadas
- Regras críticas R1-R5: todas implementadas e verificadas
- CI remoto: PENDENTE (workflow requer atualização com `test:org`)
