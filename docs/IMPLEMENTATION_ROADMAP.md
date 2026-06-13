# IMPLEMENTATION_ROADMAP — PRs executáveis (MVP de Agendamento)

> Transforma as fases do `PLANNING.md` §14 em **PRs pequenos, ordenados e verificáveis**. Cada PR tem
> objetivo, entrega, dependências e **critério de aceite** (o que precisa passar para fazer merge).
> Os gates de qualidade vêm do `PLANNING.md` §16; as decisões, do `ARCHITECTURE_DECISIONS.md` (v3); os
> contratos, do `API_CONTRACTS.md`.
> Status: **v4** (par do `PLANNING.md` v11, `ARCHITECTURE_DECISIONS.md` v4, `DATABASE_SCHEMA_V2.md` v5).

### Changelog v3 → v4 (rodada de continuidade)

- **PR-3.1 ganha o ADR-023:** âncora da grade = início da jornada do dia (fuso da empresa);
  `alignToSlotGrid()` no `shared`; gate de DST passa a testar **coerência POST↔availability**.
- **PR-3.3 ganha o ADR-022/025:** gate de jornada de service (público rejeita; painel aceita encaixe com
  `allowOutsideHours` → evento marca `outsideWorkingHours`); decisão **sem soft-hold** reafirmada (corrida
  resolve no commit).
- **PR-4.2 ganha o ADR-022/024:** antecedência mínima pública de **15 min** (`MIN_SCHEDULE_NOTICE_MIN`);
  gate de jornada **sempre rejeita** no público (sem `allowOutsideHours`).
- **PR-1.5/PR-6.1 (nota — ADR-026):** o envio nasce atrás de `NotificationSender` (canal-agnóstico),
  Resend como 1ª impl.
- **"NÃO entra" atualizado:** soft-hold registrado como futuro aditivo; grade por serviço idem.

### Changelog v2 → v3 (sync ADR v3)

- **PR-1.1 ganha A3 + B1:** policies da 0006 leem GUC com `NULLIF`/`COALESCE` (anti-`22P02` sob pooling);
  0003 ganha o unique parcial `professionals (org, user_id) WHERE user_id IS NOT NULL`.
- **PR-1.2:** `withTenantContext` usa `set_config(name, $1, true)` **parametrizado** (não `SET LOCAL`
  interpolado).
- **PR-1.4 ganha o ADR-020:** claims `org`+`sid` no access; login >1 vínculo → access sem `org`
  (`403 NO_ACTIVE_ORG`); `POST /auth/switch-org`; logout **Bearer-only via `sid`**; CSRF **`X-CSRF: 1`**
  (double-submit descartado).
- **PR-1.5 ganha `POST /auth/password/change`** (autenticado; revoga todas as famílias exceto a atual).
- **PR-1.6 ganha o invariante do último OWNER** (`409 LAST_OWNER`).
- **PR-3.3:** alinhamento de `startsAt` à grade do `slot_interval_min`; remarcação atualiza
  `public_cancel_token_expires_at = novo startsAt`; **idempotência obrigatória também no painel**.
- **PR-4.2:** cancelamento público sobre estado terminal → **`410`**; predicado do `ON CONFLICT` no
  upsert + política de nome divergente.
- **PR-5.2 ganha o kick de socket** sob revogação/`DISABLED` (via `sid`).
- **PR-6.3:** anonimização também limpa `appointments.note` (scrub de texto livre).
- **"NÃO entra" atualizado:** buffers/overrides em `professional_services` e availability org-level
  registrados como futuro (com a regra de ocupação dos buffers).

### Changelog v1 → v2 (revisão pré-código)

- **PR-1.1/1.2 absorvem o ADR-017:** migration 0006 ganha os resolvers `SECURITY DEFINER` e as policies
  `tenant_or_system`/`global_security_events`; o módulo `db` entrega `withSystemContext` junto do
  `withTenantContext`. Sem isso, rota pública, cancelamento por token e relay **não funcionam** sob RLS.
- **`RateLimiter` antecipado para a Fase 1 (PR-1.4):** a superfície de auth exige limites (ADR-009
  emendada — login/forgot sem limite é credential stuffing/flooding barato). O PR-4.1 passa a só
  **aplicar os limites públicos** à interface já existente.
- **ADR-012 fechada (Opção A):** PR-1.4 não tem mais condicional de cookie; inclui `trust proxy` + IP real.
- **PR-1.6 reescrito (ADR-019):** convite via tabela `invitations` + `POST /auth/accept-invite` —
  o fluxo anterior parava no envio do e-mail e não cobria convidado sem conta.
- **PR-1.8 (novo) — jobs de manutenção:** as limpezas citadas como "job periódico" agora têm dono.
- **PR-3.3 ganha a máquina de estados (ADR-018):** nasce `CONFIRMED`; matriz única no `shared`;
  teste de `409 INVALID_STATUS_TRANSITION`.
- **PR-4.2:** token de cancelamento no **body** da API; validações públicas (`startsAt` futuro,
  horizonte de 90 dias, expiração `= startsAt`).
- **PR-5.1:** relay com `FOR UPDATE SKIP LOCKED` (ADR-014) sob `withSystemContext`.
- **Fase 6 ganha PR-6.3:** gestão de clientes (busca/edição) + anonimização LGPD (API §20.5).

**Princípio de fatiamento:** PR pequeno, uma responsabilidade, sempre verde no CI. Nada de "PR fase
inteira". Um PR que não tem critério de aceite testável não entra.

**Ordem inegociável:** a fundação de banco/contexto/erro vem **antes** de qualquer feature. Sem RLS e
sem `withTenantContext`, toda query nasce vazando ou negando tudo (ADR-001).

---

## Fase 0 — Fundação do repositório (antes de qualquer feature)

### PR-0.1 — Monorepo + tooling
- **Entrega:** pnpm workspaces + Turborepo; `apps/web`, `apps/api`, `packages/shared`, `packages/config`
  (eslint/tsconfig/prettier compartilhados). Docker Compose com PostgreSQL. **Segurança (ADR-021):**
  segredos por **injeção de ambiente** (`.env.example` só com placeholders, `.env` no `.gitignore`);
  **Renovate/Dependabot** configurado; install com **`--frozen-lockfile`**.
- **Aceite:** `pnpm install` + `docker compose up` sobem web (Next vazio), api (Nest vazio) e Postgres;
  `pnpm lint` e `pnpm build` passam em todos os pacotes; **nenhum segredo commitado**.

### PR-0.2 — Gate de migrations "aplica do zero" **antes de existir schema** ⚠️
- **Entrega:** job de CI que, em banco limpo, roda a sequência completa de migrations (Drizzle + SQL
  manual) e falha se qualquer passo quebrar. Migration 0001 (extensões/tipos/enums) como primeira prova.
  **Segurança no CI (ADR-021):** `pnpm audit` (falha em alta/crítica) + **scan de segredo** (ex.: gitleaks)
  como steps do pipeline.
- **Por que agora:** a ordem 0002→0003 (FK composta depende do `UNIQUE (org,id)` existir antes) é
  exatamente o tipo de erro que só aparece em banco limpo (PLANNING §16, gate "migrations do zero").
  Rodar o gate na **semana 1** custa nada; descobrir na Fase 3 custa retrabalho.
- **Aceite:** CI verde com 0001 aplicada do zero; o job está pronto para crescer com 0002–0006;
  `pnpm audit` e o scan de segredo rodam e barram o merge.
- **Depende de:** PR-0.1. **Decisão:** ADR-003, ADR-007, **ADR-021**.

### PR-0.3 — `packages/shared`: envelope de erro + `ErrorCode` + helpers de data/dinheiro
- **Entrega:** `ErrorEnvelope`, union `ErrorCode` (catálogo API §7 + adições §22), helpers ISO-8601 e
  centavos. Sem lógica de negócio — só o contrato base.
- **Aceite:** `shared` compila e é importável por web e api; testes de tipo do `ErrorCode`.
- **Depende de:** PR-0.1. **Contrato:** API §2, §12, §21.

---

## Fase 1 — Banco, contexto de tenant, erro e observabilidade

### PR-1.1 — Migrations 0002–0006 (schema completo, incluindo ADR-017)
- **Entrega:** tabelas/enums/índices (Drizzle 0002, **incluindo `invitations`**) + constraints avançadas,
  FKs compostas tenant-safe, `EXCLUDE`, uniques parciais (0003) + índices de leitura (0004) + triggers
  (0005) + `app_is_member`, **resolvers públicos (`app_resolve_org_by_slug`,
  `app_resolve_appointment_by_cancel_hash`, `app_resolve_invitation_by_hash`)**, RLS com policies
  `tenant_isolation`, **`tenant_or_system`** (eventos/idempotência/convites) e
  **`global_security_events`** (`audit_logs`) — tudo na 0006 (ADR-017). **Toda leitura de GUC nas
  policies usa `NULLIF(current_setting(...), '')` / `COALESCE(...,false)`** (A3 — anti-`22P02` quando o
  pooling deixa o GUC placeholder como `''`). A 0003 inclui o **unique parcial `professionals (org,
  user_id) WHERE user_id IS NOT NULL`** (B1 — mapeamento 1:1 user→profissional). Provisionamento da role
  `app_runtime` documentado como pré-requisito de infra (fora da migration). **Hardening de segurança do
  banco na 0006 (ADR-021, §10.9):** `REVOKE ALL ON SCHEMA public FROM PUBLIC`, **`audit_logs` append-only**
  (`REVOKE UPDATE, DELETE … FROM app_runtime`), `statement_timeout`/`idle_in_transaction_session_timeout`
  na role.
- **Aceite:** gate do PR-0.2 verde com a sequência **inteira** do zero; `no_overlap`, `no_shift_overlap`,
  FKs compostas, resolvers, policies e **uniques parciais (cancel token, `clients`, `professionals`)**
  existem (verificadas por query ao catálogo do Postgres); **`UPDATE`/`DELETE` em `audit_logs` pela role
  `app_runtime` falha** (append-only).
- **Depende de:** PR-0.2. **Schema:** §3–§12. **Decisão:** ADR-002, ADR-003, **ADR-017, ADR-021**.

### PR-1.2 — Módulo `db`: `withTenantContext` + `withSystemContext`
- **Entrega:** `withTenantContext(orgId, userId, fn)` — abre transação, define os dois GUCs via
  **`set_config(name, $1, true)` parametrizado** (não `SET LOCAL` interpolado — A3, schema §10.1),
  executa o callback — e **`withSystemContext(fn)`** (GUC `app.is_system`, uso restrito a relay/jobs —
  ADR-017). **Acesso ao banco fora deles é proibido** (lint/review barra conexão crua e barra
  `withSystemContext` fora dos módulos de relay/manutenção).
- **Aceite:** teste de **isolamento RLS** — query sem contexto nega linhas; query com `orgId` de outro
  tenant nega linhas; query com contexto correto retorna. Teste do **ADR-017** — resolvers resolvem
  sem contexto; acesso **direto** às tabelas sem contexto continua negado; leitura cross-tenant de
  `appointment_events`/`idempotency_keys` só funciona sob `withSystemContext` (PLANNING §16).
- **Depende de:** PR-1.1. **Decisão:** ADR-001, **ADR-017**. **Schema:** §10.

### PR-1.3 — Filtro global de erro + `X-Request-Id` + `/health` e `/ready` + hardening HTTP
- **Entrega:** exception filter global do Nest produzindo o envelope (API §2); middleware de
  `X-Request-Id` (propaga se vier, gera se não); `/health` (liveness) e `/ready` (checa DB); logs
  estruturados que **mascaram telefone** (ADR-010) **e fazem scrub de segredos** (`Authorization`,
  cookies, tokens — ADR-021) e error tracking (ex.: Sentry). **Hardening HTTP (ADR-021):** **Helmet**
  (HSTS/CSP/`nosniff`/`Referrer-Policy`/`frame-ancestors 'none'`), **limite de body** (ex.: 100 KB JSON),
  **timeout de requisição** e `max` de page size padrão nos `GET` com cursor.
- **Aceite:** erro não tratado sai como `INTERNAL_ERROR` `500` **sem stack** ao cliente, com `requestId`;
  `VALIDATION_ERROR` traz `details`; `/health` não toca DB, `/ready` falha se DB cair; **body acima do
  limite → `413`**; resposta carrega os cabeçalhos do Helmet; **nenhum segredo/token aparece no log**.
- **Depende de:** PR-0.3, PR-1.2. **Contrato:** API §2, §3. **Decisão:** ADR-021.

### PR-1.4 — Auth: register/login + claims/tenant ativo + sessões revogáveis + `RateLimiter`
- **Entrega:** `/auth/register` (cria user + 1ª org + vínculo OWNER em transação; e-mail já existente →
  `409 EMAIL_TAKEN`), `/auth/login`, `/auth/refresh` (rotação + detecção de reuso → revoga família),
  `/auth/logout` (**Bearer-only, revoga a família do `sid`** — ADR-004 v3), `GET /auth/me` (bootstrap,
  com `activeOrg`). **Claims do access `sub`/`org?`/`sid` + tenant ativo (ADR-020):** login com 1 vínculo
  → access com `org`; com >1 → access **sem** `org` e **`POST /auth/switch-org`** (valida vínculo, reemite
  access sem rotacionar refresh); rota tenant-scoped sem `org` → `403 NO_ACTIVE_ORG`. **Guard de tenant lê
  o tenant de um ponto único (`resolveActiveOrg`).** `refresh_sessions` ativo. Cookie de refresh conforme
  **ADR-012** (same-origin via proxy, `SameSite=Strict`, `Path=/api/v1/auth/refresh`) + `trust proxy` no
  hop conhecido; **CSRF `/auth/refresh` via header fixo `X-CSRF: 1`** (double-submit descartado — ADR-012
  v3). **Interface `RateLimiter` + impl em memória** na superfície de auth (API §19 — ADR-009). Senha com
  **argon2id** (schema §1). **JWT (ADR-021):** assinatura verificada com **lista branca de algoritmo**
  (rejeita `alg:none`/confusão), `iss`/`aud` validados, `exp`/`iat` presentes; MVP HS256 simétrico.
- **Aceite:** teste de **sessão** — `DISABLED`/reset revoga tudo; **logout (via `sid`) revoga só a família
  apresentada** (outra sessão segue válida); reuso de token revogado mata a família. **Tenant ativo** —
  usuário com 2 vínculos recebe access sem `org`, rota tenant-scoped → `403 NO_ACTIVE_ORG`, `switch-org`
  emite access com `org` e **não** derruba o refresh. `/auth/refresh` sem `X-CSRF: 1` → `403`. Login
  estourando o limite → `429 RATE_LIMITED` + `Retry-After` no envelope (PLANNING §16).
- **Depende de:** PR-1.3. **Decisão:** ADR-004, ADR-009, ADR-012, **ADR-020**. **Contrato:** API §3, §8, §19.

### PR-1.5 — Verificação de e-mail (+ reenvio) + reset de senha (Resend)
- **Entrega:** `verification_tokens` (hash SHA-256, uso único, `purpose`, expiração); `/auth/verify-email`,
  **`/auth/verify-email/resend`** (emite novo token, invalida o anterior, rate-limitado),
  `/auth/password/forgot` (sempre `202`, rate-limitado por e-mail), `/auth/password/reset` (revoga todas
  as sessões), **`/auth/password/change`** (autenticado; valida a senha atual, troca o hash, **revoga
  todas as famílias exceto a atual** — a do `sid`; ADR-004 v3). Integração Resend com **retry/backoff** no
  envio (resiliência) e fallback de log se o provedor cair.
- **Aceite:** token expirado/usado → `410`; reset revoga sessões ativas; **`password/change` com senha
  atual errada → `401`, e a sessão que trocou a senha segue válida** (as outras caem); `forgot` não revela
  se o e-mail existe; reenvio gera token novo e o antigo deixa de valer.
- **Depende de:** PR-1.4. **Decisão:** ADR-004. **Contrato:** API §8. **Schema:** §4.3.

### PR-1.6 — Authorization centralizada + organizations/staff + convites (ADR-019)
- **Entrega:** guards/policies (não `if (role===)` espalhado); `/organizations/me`, `/organizations/:id`
  (PATCH OWNER — valida `timezone` IANA e `slotIntervalMin`); `/members` + PATCH role/status (`DISABLED`
  derruba sessões). **Fluxo de convite completo:** `POST /members/invite` cria `invitation` (token
  hasheado, reenvio substitui o pendente; **exige e-mail verificado do remetente** — `403
  EMAIL_NOT_VERIFIED`, API §8.1) + `POST /auth/accept-invite` (lookup via resolver — ADR-017; usuário
  existente aceita logado; sem conta, registra pelo mesmo token na mesma transação; vínculo nasce
  `ACTIVE`; **já é membro → `409 ALREADY_MEMBER`**). **Invariante do último OWNER:** `PATCH /members/:userId`
  recusa rebaixar/`DISABLED` o único OWNER ativo → **`409 LAST_OWNER`** (antes do UPDATE). Slug com
  **retry-on-conflict** (ADR-011). Auditoria mínima (`LOGIN_*`, `AUTHZ_DENIED`, `MEMBER_INVITED`).
  **Revalidação de vínculo (ADR-021):** gestão de membros e troca de papel **reconferem o vínculo
  `ACTIVE` no servidor**, sem confiar só no claim — fecha a janela do access curto de um membro
  recém-`DISABLED`.
- **Aceite:** papel sem permissão → `403 AUTHZ_DENIED`; recurso de outro tenant → `404` (não `403`);
  slug colidido → `409 SLUG_TAKEN` (nunca `500`); **convite aceito cria vínculo `ACTIVE` (com e sem
  conta prévia); token expirado/usado → `410`; rebaixar/desativar o único OWNER → `409 LAST_OWNER`;
  membro `DISABLED` com access ainda válido não consegue gerir membros** (PLANNING §16).
- **Depende de:** PR-1.4, PR-1.5. **Decisão:** ADR-011, **ADR-019, ADR-021**. **Contrato:** API §8, §9.

### PR-1.7 — Web shell + auth UI (escopo enxuto)
- **Entrega:** no `apps/web` — layout autenticado base, telas de **login/register**, integração básica
  com a auth de backend (access em memória + refresh por cookie; no load, `/auth/refresh` →
  `GET /auth/me` recompõe a sessão), **tratamento global de erro** consumindo o envelope padrão (lê
  `error.code`, mostra mensagem por `requestId`), tokens visuais iniciais (design tokens) e os três
  estados em toda chamada (loading/erro/vazio — princípio de UX). TanStack Query + cliente HTTP do
  `shared` (headers `X-Request-Id`/`Idempotency-Key`/`If-Match`). Proxy reverso `/api/*` → Nest
  (ADR-012) configurado no dev e documentado para produção.
- **Fora de escopo:** nenhum módulo operacional (agenda, cadastros) — só o shell e o fluxo de entrar.
- **Por que aqui:** o front nasce junto da Fase 1 e não espera a Fase 4; mas **depois** da auth de
  backend, senão integraria com uma API que ainda muda embaixo dele.
- **Aceite:** usuário registra, faz login e vê o painel vazio autenticado; refresh da página mantém a
  sessão (refresh + me); erro de API aparece tratado (não tela branca); navegação básica por teclado.
- **Depende de:** PR-1.4, PR-1.6, PR-0.3. **Decisão:** ADR-004, ADR-012. **Contrato:** API §2, §8.

### PR-1.8 — Jobs de manutenção (`@Cron` in-process)
- **Entrega:** módulo `maintenance` com limpezas periódicas sob **`withSystemContext`** (ADR-017):
  `refresh_sessions` e `verification_tokens` expirados (globais), `invitations` expirados;
  o job de `idempotency_keys` entra aqui mas só é ligado junto do PR-3.2. In-process (ADR-006 —
  single-instance; sem Redis/BullMQ).
- **Aceite:** linhas expiradas somem após o ciclo; o job **não** lê/apaga nada fora do critério de
  expiração; falha do job alerta (error tracking) sem derrubar a API.
- **Depende de:** PR-1.2, PR-1.5, PR-1.6. **Decisão:** ADR-006, ADR-017.

> **DoD da Fase 1 (PLANNING §14):** usuário cria conta/empresa e entra no painel; guard barra papel sem
> permissão; query sem contexto é negada pela RLS; sessão revogada derruba acesso; convite aceito cria
> vínculo; login estourando limite recebe `429`; erro sai no envelope com `requestId`. Cobertos por
> PR-1.2/1.3/1.4/1.5/1.6, com o shell de entrada no PR-1.7 e a manutenção no PR-1.8.

---

## Fase 2 — Cadastro operacional

### PR-2.1 — Professionals (CRUD) + PR-2.2 — Services (CRUD)
- **Entrega:** rotas de API §20.1/§20.2; slug de profissional retry-on-conflict; `active` boolean
  (desativar não cancela agendamentos futuros — decisão consciente, schema §6.1).
- **Aceite:** OWNER/MANAGER cadastra; PROFESSIONAL não cadastra (`403`); `durationMin>0`/`priceCents>=0`
  rejeitam com `422`.

### PR-2.3 — Working-hours (`PUT` substitui jornada) + PR-2.4 — Availability-blocks
- **Entrega:** API §20.3/§20.4; `no_shift_overlap` traduzido em **`409 WORKING_HOURS_CONFLICT`** com `details` (ADR-015).
- **Aceite:** pausa = duas linhas no mesmo `weekday`; turno sobreposto rejeitado pelo banco; bloqueio
  datado com `endsAt>startsAt`.
- **DoD Fase 2:** responsável monta uma barbearia real com 2 profissionais, serviços e horários
  diferentes (PLANNING §14).

---

## Fase 3 — Agenda e anti-conflito (o coração)

### PR-3.1 — Cálculo de disponibilidade (`scheduling`)
- **Entrega:** `GET /professionals/:id/availability` (API §15.1): `jornada − pausas − blocks −
  appointments ativos`, fatiado por `slotIntervalMin`, no fuso da empresa. Tipo de retorno marcado como
  **advisory** no `shared` (ADR-013). **Âncora da grade = início da jornada do dia, no fuso da empresa
  (ADR-023):** utilitário único `alignToSlotGrid()` no `shared`, reusado pelo slicing e (no PR-3.3) pela
  validação de grade do POST — para availability e POST nunca divergirem.
- **Aceite:** teste de **timezone** — disponibilidade correta no fuso da empresa, incluindo virada de
  horário; **fixture de transição de DST** num fuso com DST ativo (ex.: `America/Santiago`) cobrindo
  horário local inexistente/ambíguo e jornada que encolhe/estica uma hora; **coerência POST↔availability
  (ADR-023)** — todo slot emitido passa na validação de grade do POST no dia de virada (PLANNING §16).

### PR-3.2 — Motor de idempotência (antes das mutações) ⚠️
- **Entrega:** `idempotency_keys` + middleware/serviço de `Idempotency-Key`; replay fiel (mesmo body +
  `response_status_code`); `IN_PROGRESS` → `409` imediato + `Retry-After`; TTL de 60s para órfão com
  **takeover compare-and-swap** (só quem afetou 1 linha executa — ADR-008); payload divergente → `409`.
  Implementado como camada reutilizável que as mutações **consomem**. Liga o job de limpeza por
  `expires_at` no módulo `maintenance` (PR-1.8, sob contexto de sistema).
- **Por que antes do 3.3:** se as mutações nascerem sem idempotência, nascem erradas e o motor vira
  retrofit. A ordem certa é disponibilidade → **idempotência** → mutações.
- **Aceite:** teste de **idempotência** — retry com mesma chave não duplica; replay devolve o mesmo HTTP
  status da 1ª execução; payload divergente → `409`; **duas retries pós-TTL → só uma executa (CAS)**
  (PLANNING §16).
- **Depende de:** PR-3.1, PR-1.8. **Decisão:** ADR-008. **Contrato:** API §5. **Schema:** §9.1.

### PR-3.3 — Criar/remarcar/cancelar/completar/no-show (transacional + máquina de estados)
- **Entrega:** API §16; **usa o motor de idempotência do PR-3.2** (`Idempotency-Key` **obrigatória no
  painel** — ADR-008 v3); criação nasce **`CONFIRMED`** (ADR-018); **matriz de transição como constante
  única no `shared`**, validada no service antes do UPDATE; cada mutação grava `appointment_events` na
  **mesma transação**; remarcação é compare-and-swap com `If-Match`; cancelar/completar/no-show como ações
  `POST /:id/<ação>`. **`startsAt` (criação e remarcação) deve cair na grade do `slot_interval_min`**
  (âncora = início da jornada do dia, via `alignToSlotGrid()` — ADR-023) → senão `422 VALIDATION_ERROR`
  (B6). **Gate de jornada (ADR-022):** o service revalida jornada+bloqueios (o `no_overlap` não cobre) →
  `422 OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`; no painel, **`allowOutsideHours: true`** libera o encaixe e
  marca `metadata.outsideWorkingHours`. **Sem soft-hold (ADR-025):** corrida resolve no commit.
  **Remarcação atualiza `public_cancel_token_expires_at = novo startsAt`** quando há hash (B2).
- **Aceite:** teste de **concorrência** (duas reservas no mesmo slot → uma falha com
  `409 APPOINTMENT_CONFLICT`), de **lost update** (`version` velha → `409 APPOINTMENT_VERSION_CONFLICT`),
  de **máquina de estados** (ação sobre terminal / fora da matriz → `409 INVALID_STATUS_TRANSITION`),
  de **grade** (`startsAt` fora do passo → `422`), de **gate de jornada (ADR-022)** (painel sem
  `allowOutsideHours` → `422 OUTSIDE_WORKING_HOURS`; com `allowOutsideHours: true` → cria e marca
  `outsideWorkingHours` no evento) e de **remarcação** (token de cancelamento passa a
  expirar no novo horário) (PLANNING §16).
- **DoD Fase 3:** duas tentativas simultâneas no mesmo horário não duplicam; retry com mesma chave não
  duplica; estado terminal é imutável (PLANNING §14).
- **Decisão:** **ADR-018, ADR-022, ADR-023, ADR-025**.

---

## Fase 4 — Página pública

### PR-4.1 — Limites públicos no `RateLimiter` + resolução pública por slug
- **Entrega:** aplica os limites **públicos** do API §19 à interface criada no PR-1.4 (leitura 60/min,
  booking 10/min por IP + 5/hora por telefone, cancel 20/min); `429 RATE_LIMITED` + `Retry-After`.
  Rota pública resolve a empresa via **`app_resolve_org_by_slug`** (ADR-017) e abre
  `withTenantContext(orgId, null)`. Fetch público **client-side** (o IP do limite é o do visitante —
  ADR-012).
- **Aceite:** teste básico da rota pública com rate limit acionando responde no envelope padrão
  (PLANNING §16); slug inexistente → `404`; chave de limite reflete o IP real atrás do proxy.
- **Depende de:** PR-1.4, PR-3.1. **Decisão:** ADR-009, ADR-012, ADR-017.

### PR-4.2 — Booking público + cancelamento por token (no body)
- **Entrega:** API §17/§18; `consent` obrigatório; **validações públicas:** `startsAt` no futuro (fuso
  da empresa), **antecedência mínima de 15 min** (`MIN_SCHEDULE_NOTICE_MIN` — ADR-024), dentro do
  **horizonte de 90 dias** e **na grade do `slot_interval_min`** (âncora = início da jornada — ADR-023) →
  `422` (B6); **gate de jornada — público SEMPRE rejeita** fora do expediente
  (`422 OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`, **sem `allowOutsideHours`** — ADR-022);
  **upsert de cliente por telefone normalizado** com `ON CONFLICT (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL` (B8) — o booking público **não** sobrescreve `name` de cadastro
  existente; `cancelUrl` com token cru **só na resposta**; expiração do token **= `startsAt`**;
  cancelamento via **`POST /public/cancel` / `/preview` com token no body**, uso único,
  `cancelledByType=CLIENT`, lookup via `app_resolve_appointment_by_cancel_hash` (ADR-017). **Agendamento
  já em estado terminal (token ainda válido) → `410`** na superfície pública (não `409` — ADR-018 v3, B7).
- **Aceite:** cliente agenda sem login, recebe link de cancelamento válido, responsável vê no painel;
  token reusado/expirado **ou agendamento já terminal → `410`**; agendamento no passado/antes da
  antecedência mínima/além do horizonte/fora da grade/fora da jornada → `422`.
- **Depende de:** PR-4.1, PR-3.3. **Decisão:** ADR-017, ADR-018, ADR-022, ADR-024.

### PR-4.3 — Acessibilidade + estados explícitos no fluxo público
- **Entrega:** navegação por teclado, foco visível, WCAG básico; estados loading/erro/vazio (princípio de
  UX da skill: nunca deixar o usuário no escuro); `409 APPOINTMENT_CONFLICT` mostra mensagem amigável e
  refaz o `GET /availability` (ADR-013). `AbortController` cancela availability anterior ao trocar de dia.
- **Aceite:** fluxo navegável só por teclado; conflito de slot não vira erro feio, vira refetch.
- **DoD Fase 4:** cliente agenda sem login; fluxo navegável por teclado; rate limit no envelope padrão;
  validações de tempo rejeitando no envelope.

---

## Fase 5 — Real-time

### PR-5.1 — Publisher de domínio (interface) + relay do outbox
- **Entrega:** publicação após commit (EventEmitter in-process — ADR-006); relay sob
  **`withSystemContext`** (ADR-017) lê pendentes com **`FOR UPDATE SKIP LOCKED`** (ADR-014), publica,
  marca `published_at`; **dead-letter** com teto de tentativas + alerta (ADR-014).
- **Aceite:** evento não se perde se o processo cair entre commit e publish (reprocessado pelo relay);
  evento que falha além do teto sai dos pendentes e alerta (não varre o índice para sempre); relay lê
  eventos de **todas** as empresas (cross-tenant comprovado em teste).
- **Depende de:** PR-3.3, PR-1.8. **Decisão:** ADR-005, ADR-006, ADR-014, ADR-017.

### PR-5.2 — Gateway WebSocket (handshake autenticado, payload sem PII)
- **Entrega:** valida JWT + vínculo **antes** da room; rooms por `organizationId`/`professionalId`;
  payload só invalidação (`appointment.changed`); front refaz fetch; recuperação via HTTP ao reconectar.
  **Kick de socket sob revogação/`DISABLED` (C3):** ao revogar sessões/`DISABLED`, o backend desconecta os
  sockets do usuário (identificados pelo `sid` — ADR-020), ou no mínimo revalida o vínculo a cada N
  minutos e desconecta. O gateway nasce com esse gancho (PLANNING §11).
- **Aceite:** duas telas refletem a mudança sem refresh; ao reconectar, o estado se recompõe; nenhum
  nome/telefone trafega no socket (ADR-005); **membro `DISABLED` é desconectado e não recebe mais
  invalidações**.
- **DoD Fase 5:** PLANNING §14. **Decisão:** ADR-005, **ADR-020** (kick via `sid`).

---

## Fase 6 — Notificações e operação

### PR-6.1 — Confirmação visual + link manual de WhatsApp
### PR-6.2 — Histórico + filtros (inclui `GET /appointments/:id/events` — a trilha vira leitura)
### PR-6.3 — Clientes: busca/edição + anonimização LGPD (API §20.5)
- **Entrega:** `GET /clients` (busca por nome/telefone, cursor), `GET/PATCH /clients/:id`
  (re-normaliza E.164; colisão → `409`), `POST /clients/:id/anonymize` (OWNER; `name='Cliente
  removido'`, `phone`/`phoneNormalized` → `NULL`; **`appointments.note` do cliente → `NULL`** — scrub de
  texto livre; `CLIENT_ANONYMIZED` em `audit_logs`; irreversível — ADR-016 v3). Escopo de telefone do
  PROFESSIONAL respeitado (PLANNING §4). **Busca por nome usa GIN + `pg_trgm`** (migration da Fase 6:
  `CREATE EXTENSION IF NOT EXISTS pg_trgm` + `clients_name_trgm_idx`) — `ILIKE '%x%'` não usa btree
  (schema §7); busca por telefone usa `phone_normalized` exato.
- **Aceite:** anonimização zera PII preservando histórico de agendamentos **e limpa `note`**; dois
  clientes anonimizados na mesma empresa não colidem (unique parcial); re-anonimizar → `409`; **busca por
  nome usa o índice trgm (sem seq scan)** — verificável por `EXPLAIN`.

**DoD Fase 6:** responsável opera no dia a dia; direito ao esquecimento executável de ponta a ponta
(PLANNING §14).

---

## Gate transversal (todo PR)
- [ ] CI verde (lint + build + testes do escopo do PR)
- [ ] Migrations aplicam do zero (se o PR tocou schema)
- [ ] Nenhum acesso a banco fora de `withTenantContext`/`withSystemContext` (e o segundo só em relay/manutenção)
- [ ] Resposta de erro no envelope padrão com `requestId`
- [ ] Sem PII em log/`metadata`/payload de socket (ADR-010, ADR-005)

## Dependências em uma linha
`0.1 → 0.2 → 0.3 → 1.1 → 1.2 → 1.3 → {1.4 → 1.5 → 1.6 → 1.7, 1.8} → {2.x} → {3.1 → 3.2 idempotência → 3.3 mutações} → {4.1 → 4.2 → 4.3} → {5.1 → 5.2} → {6.x}`

## O que NÃO entra no MVP (otimização prematura — ponto de entrada já aditivo no design)
Redis (entra com multi-instância — ADR-006), versionamento de eventos, CQRS, particionamento de tabela,
cache de disponibilidade, feature flags, visão mensal, login de cliente, pagamento, marketplace,
aprovação de agendamento (`SCHEDULED` — reservado, ADR-018), notificações automáticas de WhatsApp.
**Registrados como futuro (sem coluna/rota no MVP):** overrides e **buffers** em `professional_services`
(`buffer_before/after`, preço/duração próprios) — **se entrarem, o intervalo OCUPADO** para `no_overlap`
e availability vira `startsAt − bufferBefore … endsAt + bufferAfter`, com o horário exibido = real
(PLANNING §10.2); **availability org-level** "qualquer profissional" (agrega quem presta o serviço —
aditivo sobre o endpoint por profissional); **client cards** (tags/flags/`client_notes` — já sob scrub de
texto livre). Path-scoped multi-org (`/organizations/:orgId/...`) é a evolução aditiva do tenant ativo
(ADR-020) — o guard já isola a resolução em `resolveActiveOrg`.
