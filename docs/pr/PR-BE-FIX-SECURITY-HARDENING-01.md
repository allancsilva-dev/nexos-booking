# 2026-06-29 PR-BE-FIX-SECURITY-HARDENING-01 — Plano de Ação

## Status

**IMPLEMENTADO_NO_BRANCH** (validado por build + smokes; commit é gate humano)

## Resultado da execução (2026-06-29)

- `pnpm --filter @nexos/shared build` → PASS.
- `pnpm --filter @nexos/api build` → PASS.
- `node apps/api/scripts/smoke-conformance.mjs` → **36/36** (sem regressão de contrato).
- `node apps/api/scripts/smoke-security-hardening.mjs` → **13/13** (over-limit/senha curta/tipo inválido → `422`).
- BUG-021/022/023/025: IMPLEMENTADO_NO_BRANCH. BUG-024: ACEITO_COMO_PENDÊNCIA (rate-limiter em memória mantido para VPS single-node).
- Pendência operacional para o deploy: definir `CORS_ORIGINS` conforme topologia (same-origin proxy vs. domínio separado).

## Auditoria `security-auditor` (2026-06-29) — `PASS_COM_RESSALVA`

Sem BLOCKER. Confirmado: todo endpoint de escrita valida em runtime; política de senha em todos os fluxos; JWT (HS256 allowlist, iss/aud/exp/iat), CSRF na `/auth/refresh`, cookie de refresh, rate limit, scrub/anonimização e ausência de bypass de tenant — todos PASS. Itens tratados:

- **SHOULD_FIX (corrigido):** `POST /public/cancel/preview` e `POST /public/cancel` liam `token` do body só por presença, sem `max` (rotas anônimas). Agora validam via `CancelPreviewInputSchema`/`CancelInputSchema` (`token` `min(1).max(512)`). Smoke cobre token > max e ausência de token → `422`.
- **NOTE (corrigido):** bootstrap rejeita `CORS_ORIGINS="*"` explicitamente (evita allowlist ampla com `credentials:true`).
- **NOTE (aceito):** `invitations.service.ts` mantém `password.length < 8` como defesa-em-profundidade (mesmo limiar do `passwordSchema`, sem divergência).
- **Pendência de deploy:** garantir `TRUST_PROXY_HOPS` no VPS atrás de proxy reverso (sem isso, buckets de rate limit público colapsam no IP do proxy — over-block, não bypass).

Re-validação pós-ajuste: `smoke-security-hardening.mjs` **15/15**, `smoke-conformance.mjs` **36/36**, builds PASS.

## Contexto

Varredura de segurança pré-exposição em VPS (internet pública). Objetivo: fechar furos de
**validação de entrada**, **política de senha** e **limites de campo** antes de abrir o sistema
a tráfego anônimo. Achados registrados em `docs/BUGFIX_LOG.md` como `BUG-021`..`BUG-025`.

Hierarquia preservada: este PR **não muda contrato** (`API_CONTRACTS.md`), apenas torna efetiva
a validação que o contrato já pressupõe. Onde um limite numérico novo é introduzido (ex.: `max`
de string), ele é defensivo e não altera shapes existentes.

## Achados que originam o PR

| ID | Severidade | Resumo |
|---|---|---|
| BUG-021 | BLOQUEANTE | Endpoints CRUD autenticados aceitam body não validado (DTOs são interfaces TS, apagadas em runtime; sem zod/ValidationPipe). |
| BUG-022 | BLOQUEANTE | `password/reset`, `password/change`, `accept-invite` não aplicam política de senha; regra `min(8)` só existe em `register`. |
| BUG-023 | ALTA | Campos string de entrada (incl. booking público `client.name`/`phone`) sem `max` → risco de estouro/abuso. |
| BUG-024 | MÉDIA | Rate-limiter apenas em memória: zera no restart e não cobre múltiplas instâncias. |
| BUG-025 | BAIXA | CORS não configurado explicitamente no bootstrap; verificar topologia de deploy antes de expor. |

## Escopo permitido

- `packages/shared/src/dto/**` — criar/estender **schemas zod de entrada** com `min`/`max`/tipos.
- `apps/api/src/**/dto/**` — substituir interfaces de entrada por `import` dos schemas/tipos do shared.
- `apps/api/src/**/*.controller.ts` — aplicar `safeParse` + `ValidationException` (padrão já usado
  em `auth.controller.ts` register/login).
- `apps/api/src/main.ts` — CORS allowlist por env (BUG-025), sem afetar same-origin.
- Testes/smokes que provem rejeição de entrada inválida.

## Fora de escopo (não tocar neste PR)

- Contrato HTTP (`API_CONTRACTS.md`), schema de banco, RLS/migrations.
- Troca do rate-limiter por backend persistente (BUG-024) — registrar como pendência; o limiter
  em memória é aceitável para VPS single-node de MVP. **Decisão de produto, não deste PR.**
- Política de complexidade de senha além de `min(8)/max(128)` (sem lista de senhas vazadas no MVP).

## Plano de execução (fases)

**Fase 1 — Schemas de entrada (shared)**
- Definir constantes de limite: `NAME_MAX=120`, `PASSWORD_MIN=8`, `PASSWORD_MAX=128`,
  `PHONE_MAX=32`, `SLUG_MAX=64`, `REASON_MAX` (já 500), `NOTE_MAX` (já 2000).
- Criar/ajustar schemas zod de input para: profissional (create/update), serviço (create/update),
  organização (update), membro (invite/update), cliente (update), bloco, working-hours.
- Adicionar `.max()` em `public-booking` `client.name` e validar `client.phone` (regex/tamanho).
- Criar schemas para `reset-password`, `password-change`, `accept-invite`, `forgot-password`,
  `verify-email` com `min(8).max(128)` na senha e `email()`/`token` validados.

**Fase 2 — Controllers (api)**
- Trocar `@Body() body: XInput` por `@Body() body: unknown` + `Schema.safeParse(body)` +
  `ValidationException(validationDetails(...))`, espelhando `auth.controller.ts`.
- Endpoints alvo: professionals, services, organizations, clients, scheduling/blocks,
  working-hours, e os de senha/convite/verify no `auth.controller.ts`.

**Fase 3 — Bootstrap**
- CORS allowlist via `CORS_ORIGINS` (lista separada por vírgula); `credentials: true`; métodos e
  headers do contrato (`X-Request-Id`, `Idempotency-Key`, `If-Match`, `X-CSRF`, `Authorization`).
- Sem `CORS_ORIGINS` → não habilita CORS (assume same-origin via proxy).

**Fase 4 — Provas**
- `pnpm --filter @nexos/api build` → PASS.
- Smoke de entrada inválida: nome > max → `422`; senha curta no reset/change → `422`;
  body lixo em CRUD → `422`; booking público nome gigante → `422`.
- `node apps/api/scripts/smoke-conformance.mjs` mantém 36/36 (sem regressão de contrato).

## Critério de aceite

- Nenhum endpoint de escrita aceita body não validado.
- `reset`/`change`/`accept-invite` rejeitam senha `< 8` ou `> 128`.
- Toda string de entrada tem teto explícito.
- Contrato e smokes existentes seguem verdes.

## Pendências derivadas (não bloqueiam VPS single-node)

- **BUG-024:** migrar rate-limiter para store persistente/compartilhado quando houver multi-instância.
- **BUG-025:** confirmar topologia (same-origin proxy vs. domínio separado) no provisionamento do VPS.
