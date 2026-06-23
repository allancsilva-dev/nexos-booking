# 2026-06-20 Auth/Register Fixes — Relatório

## Status

**PASS_PROVISORIO_CI_PENDENTE_COM_PENDENCIAS**

## Resumo

- **Escopo:** remediação pós-MVP do diagnóstico de cadastro online/auth/register.
- **Áreas corrigidas:** bootstrap da API, contratos de auth, schemas compartilhados, fallback de error codes, idempotência, build web sem Google Fonts remoto e bootstrap de sessão no frontend.
- **Arquivos:** 24 modificados + 1 criado.
- **Sem feature nova:** mudanças restritas a drift operacional/contratual e wiring de módulos/providers.
- **Commit:** não realizado.

## Causa Raiz

### ECONNREFUSED

A API não permanecia de pé. O web recebia `ECONNREFUSED` porque o processo Nest falhava durante bootstrap/runtime antes de atender o fluxo de cadastro.

### Bootstrap da API

O primeiro erro era DI no `RolesGuard` (`Reflector` indefinido). Após corrigir, apareceram outros drifts de wiring que estavam escondidos pela primeira falha:

- `IdempotencyInterceptor` global sem DI explícita de `Reflector`/`DbService`;
- `OrganizationsModule` consumindo providers de auth não exportados;
- `AppointmentsModule` consumindo publisher do realtime sem importar `RealtimeModule`;
- `SchedulingModule` usando guards de auth sem importar `AuthModule`;
- `AppointmentsGateway` com injeção/lifecycle frágil para `KickService`/server.

## Correções Por Problema

### P0 — API não sobe por DI no RolesGuard

- **Sintoma:** `Nest can't resolve dependencies of the RolesGuard (?, DbService)`.
- **Causa:** `Reflector` dependia de metadata implícita em runtime.
- **Correção:** `@Inject(Reflector)` no `RolesGuard`; correções equivalentes em `IdempotencyInterceptor` e `AppointmentsGateway`; exports/imports mínimos de módulos.
- **Validação:** `pnpm --filter @nexos/api build` PASS; API dev escuta em `localhost:3001`.

### P1 — códigos de erro de auth divergentes

- **Sintoma:** auth podia cair em `UNAUTHENTICATED`, `AUTHZ_DENIED` ou fallback genérico.
- **Causa:** uso de exceptions genéricas no service/guards.
- **Correção:** `DomainException` específicas para `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `REFRESH_REUSED`, `NO_ACTIVE_ORG`, `TOKEN_EXPIRED`.
- **Validação:** register duplicado retorna `409 EMAIL_TAKEN`; login inválido retorna `401 INVALID_CREDENTIALS`; refresh sem cookie retorna `401 UNAUTHENTICATED`.

### P1 — schemas de auth no shared

- **Sintoma:** web tinha schemas locais e backend aceitava payload sem validação runtime padrão.
- **Causa:** DTOs de auth ausentes do `packages/shared`.
- **Correção:** criado `packages/shared/src/dto/auth.dto.ts` com `RegisterInputSchema`, `LoginInputSchema`, `SwitchOrgInputSchema`, `MeResponseSchema`; web reexporta do shared; API valida `register`, `login`, `switch-org`.
- **Validação:** payload inválido de register retorna `422 VALIDATION_ERROR`.

### P1/P2 — fallback genérico de status amplo demais

- **Sintoma:** `409` genérico podia virar `APPOINTMENT_CONFLICT`.
- **Causa:** filtro/interceptor inferiam código por status sem domínio.
- **Correção:** filtro/interceptor preservam `DomainException` e códigos explícitos no body; fallback não converte todo `409` em agenda.
- **Validação:** `EMAIL_TAKEN` permanece `EMAIL_TAKEN`; catálogo confirma `PHONE_TAKEN`, `ALREADY_ANONYMIZED`, `IDEMPOTENCY_KEY_REUSED`, `APPOINTMENT_CONFLICT`.

### P2 — idempotência não aguarda gravação de falha

- **Sintoma:** `FAILED` era gravado com `withTenantContext(...).catch(() => {})`, sem await.
- **Causa:** persistência fire-and-forget antes de relançar a exceção original.
- **Correção:** gravação de `FAILED` agora é aguardada; falha de persistência loga sem key/PII; exceção original é preservada.
- **Validação:** build/lint PASS; `test:idempotency` executado parcialmente, mas falha em fixture/heurística legadas (detalhes em Pendências).

### P1 — build web dependia de Google Fonts remoto

- **Sintoma:** `next/font/google` podia quebrar build sem rede/cache.
- **Causa:** import de `Plus_Jakarta_Sans`.
- **Correção:** removido `next/font/google`; CSS usa stack local/sistema.
- **Validação:** `pnpm --filter @nexos/web build` PASS; sem tentativa de fetch Google Fonts.

### P2 — bootstrap web confunde anônimo/sessão/API indisponível

- **Sintoma:** qualquer falha em `/auth/refresh` virava `"Session expired"`.
- **Causa:** tratamento único para `!refreshRes.ok`.
- **Correção:** `401 UNAUTHENTICATED` sem cookie vira `idle`; `TOKEN_EXPIRED`/`REFRESH_REUSED` vira sessão expirada; `5xx`/network vira indisponibilidade.
- **Validação:** refresh sem cookie retorna `401 UNAUTHENTICATED`, compatível com estado anônimo.

## Arquivos Alterados

### API

- `apps/api/src/authorization/guards/roles.guard.ts`
- `apps/api/src/common/interceptors/idempotency.interceptor.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/api/src/common/exceptions/domain.exception.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/dto/register.dto.ts`
- `apps/api/src/auth/dto/login.dto.ts`
- `apps/api/src/auth/dto/switch-org.dto.ts`
- `apps/api/src/auth/guards/tenant.guard.ts`
- `apps/api/src/appointments/appointments.module.ts`
- `apps/api/src/scheduling/scheduling.module.ts`
- `apps/api/src/realtime/websocket.gateway.ts`

### Web

- `apps/web/app/layout.tsx`
- `apps/web/app/globals.css`
- `apps/web/app/providers.tsx`
- `apps/web/lib/auth-schemas.ts`

### Shared

- `packages/shared/src/dto/auth.dto.ts`
- `packages/shared/src/index.ts`
- `packages/shared/package.json`
- `pnpm-lock.yaml`

### Observação

Já havia alterações locais pré-existentes em `apps/api/src/app.module.ts`, `docs/BUGFIX_LOG.md`, `apps/web/next-env.d.ts`, `packages/shared/src/__contract-tests__/error-code.contract-test.ts` e arquivos não versionados. Elas foram preservadas.

## Validações

| Comando / Validação | Resultado |
|---|---|
| `pnpm lint` | PASS |
| `pnpm --filter @nexos/shared build` | PASS |
| `pnpm --filter @nexos/api build` | PASS |
| `pnpm --filter @nexos/web build` | PASS fora do sandbox |
| `pnpm --filter @nexos/api dev` | PASS fora do sandbox |
| `curl /health` | `200 {"status":"ok"}` |
| `curl /ready` | `200 {"status":"ok","database":"connected"}` com `.env` carregado |
| `POST /auth/register` payload inválido | `422 VALIDATION_ERROR` |
| `POST /auth/register` válido | `201 Created` |
| `POST /auth/register` e-mail duplicado | `409 EMAIL_TAKEN` |
| `POST /auth/login` inválido | `401 INVALID_CREDENTIALS` |
| `POST /auth/refresh` sem cookie | `401 UNAUTHENTICATED` |
| `pnpm dev` | web `3000` e api `3001` sobem; encerrado manualmente |

## Códigos Conferidos

- `EMAIL_TAKEN`
- `INVALID_CREDENTIALS`
- `REFRESH_REUSED`
- `NO_ACTIVE_ORG`
- `PHONE_TAKEN`
- `ALREADY_ANONYMIZED`
- `IDEMPOTENCY_KEY_REUSED`
- `APPOINTMENT_CONFLICT`

## Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-REL-001 | MEDIA | CI remoto pendente. (Renomeado de `PEND-001` para resolver colisão: `PEND-001` é canonicamente a paridade da role de runtime/RLS — ver BUG-012 no `BUGFIX_LOG.md`.) |
| PEND-002 | MEDIA | Teste em navegador não executado; validação feita via build, `pnpm dev` e curl. |
| PEND-003 | MEDIA | `test:idempotency` falhou em T18b por heurística textual ampla e em T24 por fixture FK ausente (`organization_id` inexistente). As checagens T1–T17, T18a, T19–T23 passaram. |
| PEND-004 | BAIXA | `pnpm --filter @nexos/web build` e `pnpm --filter @nexos/api dev` precisam rodar fora do sandbox local por restrições de Turbopack/tsx a bind/IPC. |

## Veredito

**PASS_PROVISORIO_CI_PENDENTE_COM_PENDENCIAS**

- API sobe e responde `/health` e `/ready`.
- Web build passa sem Google Fonts remoto.
- Auth usa códigos canônicos para os fluxos validados.
- Schemas de auth estão no shared e são usados por API e web.
- Idempotência aguarda persistência de falha antes de relançar a exceção original.
- Bootstrap web diferencia anônimo, sessão expirada e indisponibilidade da API.
- Sem commit automático.
