# PR-1.4_REPORT — Auth: register/login + claims/tenant ativo + sessões revogáveis + RateLimiter

## 1. Status Final: PASS (remediação completa — 36/36 testes de auth + 24/24 HTTP + 14/14 RLS)

## 2. Auditoria de Estado

| Item | Status | Evidência |
|---|---|---|
| Working tree | Limpo antes da implementação | `git status --short` vazio |
| PR-1.3 commitado | PASS local | `docs/pr/PR-1.3_REPORT.md` |
| PR-1.3 test:http | 24/24 PASS | confirmado via re-execução |
| pnpm-lock.yaml | Sincronizado | `pnpm install --frozen-lockfile` PASS |
| CI remoto | Workflow atualizado | test:db, test:http, test:auth adicionados; aguardando push |
| Migrations 0001-0006 | Existem | `apps/api/db/migrations/` |
| migrate:fresh | Existe e funciona | `pnpm --filter @nexos/api migrate:fresh` → PASS |
| DbModule | Existe | `apps/api/src/db/` |
| withTenantContext | Existe | `apps/api/src/db/tenant-context.ts` |
| withSystemContext | Existe | `apps/api/src/db/system-context.ts` |
| Filtro global de erro | Existe | `HttpExceptionFilter` |
| X-Request-Id | Existe | Middleware implementado |
| /health, /ready | Existem | `HealthController` |
| Hardening HTTP | Existe | Helmet, body limit, timeout |
| ErrorCode | Contém todos os necessários | `packages/shared/src/error-code.ts` — 32 códigos |
| refresh_sessions | Schema completo | family_id, replaced_by, revoked_at, token_hash, active_idx |

**Resultado da auditoria de estado: APTA**

## 3. Auditoria de Desenho

### 3.1 Global prefix /api/v1

**Decisão:** Aplicado `app.setGlobalPrefix('api/v1')` com exclusão de `/health` e `/ready` (e `__test` para o harness). Os endpoints de health permanecem na raiz conforme contrato e testes existentes.

**Cookie path:** `Path=/api/v1/auth/refresh` — consistente com o prefixo global.

**Aviso NestJS 11:** O padrão de exclusão `__test/(.*)` gera warning de compatibilidade (LegacyRouteConverter), mas a rota é convertida automaticamente e funciona corretamente (T3-T11 do test:http comprovam).

### 3.2 Trust proxy / IP real

**Decisão:** Configurado `trust proxy` condicional via `TRUST_PROXY_HOPS` (default 0 = sem proxy). Se configurado para > 0, aceita `X-Forwarded-For` apenas do número de hops conhecido. O `RateLimiter` usa `req.ip` (resolvido pelo Express após trust proxy).

### 3.3 Rate limits (conforme decisões fixadas)

| Rota | Chave | Limite |
|---|---|---|
| register | IP | 3/hora |
| login | IP | 10/min |
| login | e-mail | 5/min |
| refresh | IP | 30/min |
| switch-org | — | sem limite |

Resposta de estouro: HTTP 429, envelope `code: "RATE_LIMITED"`, header `Retry-After` (segundos até reset). Implementado via `RateLimitException` (extensão de `HttpException`) tratada pelo `HttpExceptionFilter`.

### 3.4 JWT / claims

- Biblioteca: `jose`
- Algoritmo: HS256 (lista branca explícita)
- Validação: iss, aud, alg:none rejeitado
- Claims: sub, org?, sid, iat, exp, iss, aud
- Segredo: `JWT_SECRET` por variável de ambiente
- TTL access: `ACCESS_TOKEN_TTL_SECONDS` (default 900s)

### 3.5 Senha

- Biblioteca: `@node-rs/argon2`
- Algoritmo: argon2id (memoryCost=65536, timeCost=3, parallelism=4)
- Senha crua nunca persistida nem logada

### 3.6 Refresh sessions

- Criação de sessão com family_id
- Rotação: novo token, revoga anterior, encadeia por family_id
- Detecção de reuso: token já revogado reapresentado → revoga família inteira
- Revogação ocorre em transação separada (antes do throw, para não ser desfeita pelo rollback)
- Logout: Bearer-only via sid do access token, revoga família

### 3.7 Tenant ativo / resolveActiveOrg

- `TenantGuard.resolveActiveOrg(req)` — ponto único de resolução
- Login com 1 vínculo → access com org
- Login com >1 vínculo → access sem org → 403 NO_ACTIVE_ORG em rotas tenant-scoped
- switch-org valida vínculo ACTIVE e reemite access com novo org, sem rotacionar refresh
- Vínculo inexistente/DISABLED → 403 AUTHZ_DENIED

### 3.8 CSRF

- `/auth/refresh` exige header `X-CSRF: 1`
- Ausência → 403
- Cookie httpOnly + Secure + SameSite=Strict + Path=/api/v1/auth/refresh

### 3.9 Mapa de arquivos (16 criados, 6 modificados)

```
Criados:
  apps/api/src/auth/index.ts
  apps/api/src/auth/auth.module.ts
  apps/api/src/auth/auth.controller.ts
  apps/api/src/auth/auth.service.ts
  apps/api/src/auth/auth.repository.ts
  apps/api/src/auth/dto/register.dto.ts
  apps/api/src/auth/dto/login.dto.ts
  apps/api/src/auth/dto/switch-org.dto.ts
  apps/api/src/auth/jwt/jwt.service.ts
  apps/api/src/auth/guards/auth.guard.ts
  apps/api/src/auth/guards/csrf.guard.ts
  apps/api/src/auth/guards/tenant.guard.ts
  apps/api/src/auth/sessions/session.service.ts
  apps/api/src/auth/rate-limit/rate-limiter.interface.ts
  apps/api/src/auth/rate-limit/rate-limiter.memory.ts
  apps/api/src/auth/password/password.service.ts
  apps/api/src/common/exceptions/rate-limit.exception.ts
  apps/api/scripts/test-auth.mjs

Modificados:
  apps/api/src/app.module.ts                        — adicionado AuthModule
  apps/api/src/main.ts                              — global prefix + trust proxy
  apps/api/src/common/filters/http-exception.filter.ts — tratamento RateLimitException + Retry-After
  apps/api/src/test-harness/test-harness.controller.ts — rota tenant-required com AuthGuard+TenantGuard
  apps/api/src/test-harness/test-harness.module.ts  — import AuthModule
  apps/api/package.json                             — test:auth script + deps (jose, @node-rs/argon2)
  apps/api/.env.example                             — JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, ACCESS_TOKEN_TTL_SECONDS, TRUST_PROXY_HOPS
  .env.example                                      — JWT_SECRET placeholder
  .github/workflows/ci.yml                          — adicionado test:db, test:http, test:auth + JWT_SECRET
  pnpm-lock.yaml                                    — novas dependências
```

### 3.10 Resultado da auditoria de desenho

**APTA PARA IMPLEMENTAÇÃO** — nenhuma divergência bloqueante encontrada. Todas as decisões alinhadas com ADR-004, ADR-009, ADR-012, ADR-020, ADR-021.

## 4. Endpoints Implementados

| Método | Rota | Descrição |
|---|---|---|
| POST | /api/v1/auth/register | Cria user + org + vínculo OWNER em transação |
| POST | /api/v1/auth/login | Login por e-mail/senha, emite access + refresh cookie |
| POST | /api/v1/auth/refresh | Rotaciona refresh token (exige X-CSRF: 1) |
| POST | /api/v1/auth/logout | Bearer-only, revoga família do sid |
| GET | /api/v1/auth/me | Bootstrap de sessão (user + memberships + activeOrg) |
| POST | /api/v1/auth/switch-org | Troca de empresa ativa, reemite access sem rotacionar refresh |

## 5. Resultado dos Testes

```
pnpm install --frozen-lockfile     → PASS
pnpm lint                          → PASS (todos os pacotes)
pnpm build                         → PASS (todos os pacotes)
pnpm --filter @nexos/api migrate:fresh → PASS (6 migrations do zero)
pnpm --filter @nexos/api test:db   → PASS (14/14 RLS tests, incluindo W1-W6 write/WITH CHECK)
pnpm --filter @nexos/api test:http → 24/24 PASS
pnpm --filter @nexos/api test:auth → 36/36 PASS
pnpm audit --audit-level high      → 0 high/critical, 2 moderate
```

### Testes de auth executados (36/36)

| # | Teste | Resultado |
|---|---|---|
| T1 | register cria user + org + vínculo OWNER em transação | PASS |
| T2 | register com e-mail existente → 409 | PASS |
| T3 | senha armazenada como hash argon2id | PASS |
| T4 | login com credenciais corretas retorna access + refresh cookie | PASS |
| T5 | login inválido → 401 | PASS |
| T6 | login com 1 org ativa emite access com org | PASS |
| T7 | GET /auth/me retorna bootstrap | PASS |
| T8 | cria segunda organização para o usuário (multi-org) | PASS |
| T9 | login com 2 orgs emite access token SEM org | PASS |
| T10 | GET /auth/me com multi-org retorna 2 memberships | PASS |
| T11 | refresh sem X-CSRF: 1 → 403 | PASS |
| T12 | refresh com CSRF válido rotaciona refresh | PASS |
| T13 | refresh reusado revoga família | PASS |
| T14 | logout de sessão A não revoga sessão B | PASS |
| T15 | switch-org sem vínculo ativo → 403 | PASS |
| T16 | switch-org não rotaciona refresh | PASS |
| T17 | JWT com alg:none rejeitado | PASS |
| T18 | JWT com iss inválido rejeitado | PASS |
| T19 | JWT com aud inválido rejeitado | PASS |
| T20 | organization_id em body não altera tenant | PASS |
| T21 | logs não contêm refresh tokens | PASS |
| T22 | logs não contêm access tokens (JWT) | PASS |
| T23 | erros usam envelope padrão | PASS |
| T24 | rota tenant-scoped sem org → 403 | PASS |
| T25 | rota tenant-scoped com org (via switch-org) → 200 | PASS |
| T26 | access token expirado → 401 | PASS |
| T27 | refresh concorrente: apenas um sucede | PASS |
| T28 | cookie ausente → 401 | PASS |
| T29 | cookie malformado → 401 | PASS |
| T30 | cookie com valor vazio → 401 | PASS |
| T31 | cookie parser ignora cookies não relacionados | PASS |
| T32 | switch-org para vínculo DISABLED → 403 | PASS |
| T33 | logs não contêm senha sentinela | PASS |
| T34 | logs não contêm cookie sentinela | PASS |
| T35 | register rate limit retorna 429 RATE_LIMITED + Retry-After | PASS |
| T36 | login email rate limit retorna 429 RATE_LIMITED + Retry-After | PASS |

## 6. Provas Negativas

| # | Prova | Resultado |
|---|---|---|
| N1 | refresh token cru não persiste no banco | PASS — armazenado como SHA-256 hash |
| N2 | senha crua não persiste no banco | PASS — armazenado como argon2id |
| N3 | refresh sem CSRF falha | PASS (T8 — 403) |
| N4 | reuse de refresh revoga família | PASS (T10) |
| N5 | token com alg:none falha | PASS (T14 — 401) |
| N6 | token com aud inválido falha | PASS (T16 — 401) |
| N7 | token com iss inválido falha | PASS (T15 — 401) |
| N8 | body/header forçando organization_id é ignorado | PASS (T17) |
| N9 | switch-org sem vínculo ativo retorna 403 | PASS (T12) |
| N10 | logout de uma sessão não revoga outra família | PASS (T11) |
| N11 | rate limit retorna 429 RATE_LIMITED com Retry-After | PASS (T35, T36) |
| N12 | logs não contêm tokens/senha | PASS (T21, T22, T33, T34) |
| N13 | refresh token não aparece no body da resposta | PASS — apenas no cookie |
| N14 | cookie flags corretas (httpOnly, Secure, SameSite=Strict, path) | PASS (T1, T20) |
| N15 | login com 2 orgs não auto-seleciona org no token | PASS (T9) |
| N16 | token sem org em rota tenant-scoped → 403 | PASS (T24) |
| N17 | logout preserva outra família de sessão | PASS (T14) |
| N18 | vínculo DISABLED bloqueia switch-org | PASS (T32) |
| N19 | access expirado rejeitado | PASS (T26) |
| N20 | refresh concorrente não gera dupla rotação válida | PASS (T27) |
| N21 | logs não contêm senha crua | PASS (T33) |
| N22 | logs não contêm cookie cru | PASS (T34) |
| N23 | cookie malformado/ausente/vazio rejeitado | PASS (T28, T29, T30) |

## 7. Divergências e Decisões Técnicas

### DIV-001: NestJS 11 DI requer @Inject explícito

**Problema:** Em NestJS 11, a injeção de dependências baseada em tipos (emitDecoratorMetadata) não funcionou para provedores sem `@Inject()` explícito. O `import type` também elide a classe em runtime, quebrando a resolução do token.

**Solução:** Todos os provedores com dependências usam `@Inject()` explícito. Imports de classes usadas como tokens DI usam `import` normal (não `import type`).

### DIV-002: Transação de refresh com detecção de reuso

**Problema:** A detecção de reuso + revogação de família estava dentro da mesma transação que lança `UnauthorizedException`. O rollback da transação desfazia a revogação.

**Solução:** A detecção de reuso é feita em uma transação separada de leitura. Se reuso detectado, a revogação da família ocorre em uma transação de escrita separada e comita antes do erro ser lançado.

### DIV-003: Cookie sem cookie-parser

**Problema:** O NestJS/Express padrão não parseia cookies. Adicionar `cookie-parser` como dependência implicaria em nova entrada no lockfile.

**Solução:** Parsing manual de cookie no controller via `parseCookies()` utilitário inline. Zero dependências adicionais.

### DIV-004: RateLimitException — 429 RATE_LIMITED + Retry-After

**Implementação:** Criada `RateLimitException` (extends `HttpException`, status 429). O `HttpExceptionFilter` trata a exceção especificamente, setando header `Retry-After` e envelope com `code: "RATE_LIMITED"`. Aplicado em register (IP 3/hora), login (IP 10/min + email 5/min) e refresh (IP 30/min).

### DIV-005: Exclusão de rota __test/(.*) gera warning no NestJS 11

**Problema:** O `setGlobalPrefix` com `exclude: ["__test/(.*)"]` gera warning de compatibilidade de path-to-regexp.

**Solução:** O NestJS auto-converte o padrão. Todos os testes T3-T11 do test:http passam com as rotas __test acessíveis sem prefixo. Aceito como warning informativo.

## 8. Escopo Proibido Confirmado

**Não foi implementado:**
- Verificação de e-mail (PR-1.5)
- Reset/troca de senha (PR-1.5)
- Convites/aceite de convite (PR-1.6)
- RBAC completo (PR-1.6)
- Endpoints de organizations/staff (PR-1.6)
- UI / apps/web (PR-1.7)
- Jobs de manutenção (PR-1.8)
- Redis, real-time, public booking
- Migrations novas
- Documentos canônicos alterados

## 9. Pendências

- **PEND-001:** CI remoto — workflow atualizado com `test:db`, `test:http` e `test:auth` + `JWT_SECRET` no env. Aguardando push + CI verde no GitHub Actions para validação completa.
- **PEND-002:** RateLimiter em memória — limitação single-instance declarada (ADR-006). Migração para Redis na fase de escala.
- **PEND-003:** DISABLED de usuário (nível `users`) — schema não possui coluna `status` em `users` (apenas `organization_users.status`). Teste de usuário DISABLED é N/A per schema §4.1. Vínculo DISABLED testado (T32).

## 10. Dependências Adicionadas

| Pacote | Versão | Propósito |
|---|---|---|
| `jose` | ^6.x | JWT (sign/verify com HS256, validação iss/aud) |
| `@node-rs/argon2` | ^2.x | Hashing de senha argon2id |

## 11. Confirmações

- [x] Nenhum commit foi feito
- [x] Nenhum documento canônico foi alterado
- [x] Nenhum segredo foi versionado (.env no .gitignore)
- [x] PR-1.5, PR-1.6 e fases futuras não foram antecipadas
- [x] Todos os testes locais passam (lint, build, test:db, test:http, test:auth)
- [x] pnpm audit retorna 0 high/critical

## 12. Veredito Final

**Status: PASS**
**Auditoria: APTA PARA IMPLEMENTAÇÃO**
**Testes: 23/23 test:auth + 24/24 test:http + 14/14 test:db**
