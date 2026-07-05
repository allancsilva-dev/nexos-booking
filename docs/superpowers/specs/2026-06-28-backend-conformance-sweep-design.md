# Backend Conformance Sweep — Design

Data: 2026-06-28
Branch base: fix/appointments-list-snapshot

## Objetivo

Garantir que **todo endpoint da API que o front já consome** esteja 100%:
funcional, conforme `docs/API_CONTRACTS.md`, e entregando os campos que os
hooks do front realmente leem. Sistema ainda pequeno = melhor momento.

## Decisões (brainstorming 2026-06-28)

- **Entregável:** auditoria + correção (não só relatório).
- **Escopo:** apenas o que o front consome hoje (8 hooks).
- **Verificação:** estático (código vs contrato vs expectativa do front) **+
  smoke real** (sobe API+DB, bate cada endpoint).
- **Governança:** direto (sem disparar conductor/guardians por fix). Commit é
  humano — não commitar.

## Superfície (endpoints atrás dos hooks)

- auth: `login`, `logout`, `me`, `register`, `switch-org`
- appointments: `GET/POST /appointments`, `POST /appointments/:id/cancel`,
  remarcação `PATCH /appointments/:id`
- clients: `GET/POST /clients`, `GET/PATCH/DELETE /clients/:id`
- organizations: `GET/PATCH /organizations/:id`
- professionals: `GET/POST`, `:id GET/PATCH/DELETE`, `/services`,
  `/working-hours`, `/blocks`, `/availability`
- services: `GET/POST`, `:id GET/PATCH/DELETE`

## Oráculo — "100%" por endpoint (4 dimensões)

1. **Contrato HTTP** — envelope de erro único (§2), `error.code` do catálogo
   (§7/§22), status corretos (§4), headers obrigatórios (X-Request-Id,
   Idempotency-Key §5, If-Match §6).
2. **Funcional** — request do front bate com DTO; happy path 200/201; response
   carrega campos que o hook consome.
3. **Tenant/segurança** — RLS ativo, sem `organization_id` livre, sem credencial
   em path/query, sem PII em log.
4. **Front-fit** — cada campo lido pelo hook existe na response (ex.: snapshot
   de serviço em appointments — bug já visto, padrão a caçar).

## Harness

Estender `apps/api/scripts/test-http.mjs` (já sobe API :3099, carrega `.env`,
conta pass/fail). DB via docker-compose Postgres + `migrate:fresh -- --database
<gate>` (evita footgun POSTGRES_DB). Seed: org + admin + professional + service
+ working-hours.

## Execução em ondas (dependência primeiro)

1. auth → 2. organizations → 3. professionals (+services/working-hours/blocks/
availability) → 4. services → 5. clients → 6. appointments (idempotência §5 +
optimistic lock §6) → 7. availability (§15).

Cada onda: smoke → quebra/diverge? leio código → corrijo → re-smoke verde →
próxima.

## Entregável

Tabela endpoint × status (✅ ok / 🔧 corrigido / ⚠️ gap aberto) + script de
smoke reproduzível + lista de fixes. Sem commit.
