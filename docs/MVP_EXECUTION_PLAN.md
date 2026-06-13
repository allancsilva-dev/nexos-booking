# MVP_EXECUTION_PLAN — Plano Mestre de Execução do MVP (`nexos-booking`)

> Documento mestre de execução. **Não é fonte de verdade de produto/SQL/HTTP/decisão** — é o plano que
> organiza a execução do MVP a partir das fontes canônicas. Em qualquer divergência, prevalece a fonte
> indicada na seção "Hierarquia de autoridade documental" abaixo.
>
> Fontes canônicas (e suas versões no momento desta leitura):
> - `ARCHITECTURE_DECISIONS.md` — **v4 rev.1** (autoridade única das decisões; ADR-001 a ADR-026)
> - `PLANNING.md` — **v11** (produto e fases)
> - `DATABASE_SCHEMA_V2.md` — **v5** (verdade do SQL)
> - `API_CONTRACTS.md` — **sync v4** (verdade do HTTP)
> - `IMPLEMENTATION_ROADMAP.md` — **v4** (sequência executável em PRs)
> - `POST_MVP_PRODUCT_ROADMAP.md` — **v3 sync v4** (caminho futuro; orienta, não entra no MVP)
>
> Status deste plano: **APROVADO** para conduzir o início do desenvolvimento (decisão de árvore fechada:
> `apps/web` + `apps/api` + `packages/{shared,config}`; sem `apps/mobile` no PR-0.1). Nenhum código deve
> ser escrito nesta conversa — o próximo passo é preparar, em um novo chat, o prompt de implementação
> exclusivamente do **PR-0.1**, sem avançar escopo.

---

## Hierarquia de autoridade documental (regra de desempate)

Quando dois documentos divergirem, vale esta ordem:

1. **`ARCHITECTURE_DECISIONS.md`** — dono das decisões arquiteturais/operacionais. Se um ADR fecha um
   ponto, ele prevalece sobre o texto antigo de qualquer espelho.
2. **`DATABASE_SCHEMA_V2.md`** — verdade do banco (DDL, RLS, constraints, ordem de migrations).
3. **`API_CONTRACTS.md`** — verdade da superfície HTTP (envelope, headers, status, endpoints).
4. **`PLANNING.md`** — visão de produto, escopo e fases (panorama; aponta para os três acima nos detalhes).
5. **`IMPLEMENTATION_ROADMAP.md`** — sequência de PRs (deriva dos quatro acima).
6. **`POST_MVP_PRODUCT_ROADMAP.md`** — **fora do MVP**; só orienta nomes/contratos/pontos de extensão.

> `PATCHES_PLANNING_E_SCHEMA.md` é um conjunto de edições cirúrgicas **já aplicadas** ao `PLANNING.md` e
> ao `DATABASE_SCHEMA_V2.md` (o ADR v3 rev.2 declara: "está aplicado e deve ser arquivado"). Não é fonte
> ativa; serve apenas de histórico. Não deve ser usado para guiar implementação.

---

## 1. Visão resumida do produto

SaaS de **agendamento online para salões e barbearias**. Cada estabelecimento (tenant) gerencia a
própria agenda, com vários membros de equipe acessando a mesma empresa. O cliente final agenda por um
**link público, sem login**, informando apenas nome e telefone. O agendamento é **em tempo real**: ao
marcar, o horário sai da tela dos outros imediatamente e o responsável vê na hora — com nome e telefone
para contato em caso de imprevisto.

Referências de mercado: AppBarber e Booksy. O MVP **não** nasce como marketplace — nasce como um SaaS de
**agenda confiável**. Marketplace, descoberta, pagamentos e app do cliente vêm depois (pós-MVP).

**Personas e papéis** (autorização estrutural desde a Fase 1, via guards/policies centralizados — nunca
`if (role === ...)` espalhado):

| Papel | O que pode fazer |
|---|---|
| OWNER | Gerencia tudo: empresa, equipe, serviços, agenda de todos |
| MANAGER | Gerencia agenda, profissionais e serviços (não mexe em faturamento/empresa) |
| PROFESSIONAL | Vê e gerencia **apenas a própria agenda** (e vê telefone só dos clientes da própria agenda) |
| Cliente (visitante) | Agenda pelo link público; cancela via token. **Não loga no MVP** |

**Pilares de confiança** (o produto se vende por isto, não por quantidade de telas): não duplicar
horário, não perder evento de real-time, não vazar dados entre empresas, não quebrar sessão sem motivo,
e não deixar o cliente sem retorno claro após confirmar.

---

## 2. Stack definida

| Camada | Escolha | Observação |
|---|---|---|
| Frontend | **Next.js (App Router)** | SSR/SEO para páginas públicas; é também o **entrypoint** que faz proxy de `/api/*` para o Nest (same-origin — ADR-012) |
| Estado servidor | **TanStack Query** | cache + invalidação no real-time |
| Estado local | **Zustand** | leve, suficiente para UI |
| Estilo | **Tailwind CSS + shadcn/ui** | produtividade e consistência |
| Backend | **NestJS** | módulos, DI, padrões enterprise |
| Banco | **PostgreSQL** (15+; notas p/ 18+) | fonte única de integridade; instantes em `timestamptz` |
| ORM | **Drizzle** | tabelas comuns via `drizzle-kit generate`; DDL avançado em SQL manual |
| Validação | **Zod** | schemas compartilhados front/back via `packages/shared` |
| Real-time | **WebSocket** (gateway Nest / Socket.IO) | push de **invalidação** (sem PII) |
| Auth | **JWT** — access curto em memória (`Bearer`) + refresh httpOnly rotativo (web) / `Bearer` em secure storage (mobile futuro) | sessões revogáveis via `refresh_sessions` |
| Senha / tokens | **argon2id** (senha) / **SHA-256** (tokens de alta entropia) | schema §1 |
| Notificação transacional | **`NotificationSender`** (interface canal-agnóstica) com **Resend** como 1ª impl (e-mail) | WhatsApp/SMS são aditivos futuros — ADR-026 |
| Observabilidade | error tracking (ex.: Sentry) + logs estruturados + `request-id` | **desde a Fase 1**, não depois |
| Infra local | **Docker Compose** | ambiente reproduzível |
| Migrations | **Drizzle** (versionadas) + **SQL manual** | `EXCLUDE`, `RANGE` custom, RLS, `SECURITY DEFINER`, FKs compostas — o Drizzle Kit não gera |

**Restrições declaradas (não defaults acidentais):**
- **Sem Redis no MVP** (ADR-006). `RateLimiter` em memória e publicação real-time in-process
  (EventEmitter) só funcionam **single-instance** — restrição **declarada**. Deploy é com **drain/janela**
  enquanto for single-instance. Redis (rate limit distribuído + pub/sub + cache) entra só na fase de escala.
- **Same-origin via proxy reverso** (ADR-012, Opção A): a web serve `/api/*` para o Nest → cookie
  `SameSite=Strict`, **sem CORS**, CSRF concentrado em `/auth/refresh`. Nest com `trust proxy` no hop
  conhecido (IP real para rate limit).
- **Migrations forward-only + PITR** (ADR-007): sem `down`; mudança incompatível usa expand/contract.
- `RateLimiter`, publisher de domínio e `NotificationSender` nascem como **interfaces trocáveis** — a
  troca futura (Redis, WhatsApp) não toca controller nem regra de negócio.

---

## 3. Arquitetura esperada

**Monorepo** com pnpm workspaces + Turborepo:

```
apps/
  web/        # Next.js (App Router): painel, landing, páginas públicas. Entrypoint + proxy /api/*
  api/        # NestJS: API, auth, agenda, regras de negócio
  mobile/     # Expo (FUTURO — não construir no MVP)

packages/
  shared/     # tipos + schemas Zod + helpers (contrato único front/back/mobile) — materializa o API_CONTRACTS
  ui/         # design system (opcional no começo)
  config/     # eslint, tsconfig, prettier compartilhados
```

**Módulos do NestJS** (cada um com controller, service, repository e DTOs isolados):
`auth`, `authorization` (guards/policies), `organizations`, `staff` (vínculos + `invitations`),
`professionals`, `services`, `clients`, `scheduling` (jornada/pausas/bloqueios + cálculo de
disponibilidade — o cérebro), `appointments` (mutação transacional + máquina de estados + eventos +
idempotência), `public-booking` (rotas públicas + anti-abuso + resolvers `SECURITY DEFINER`), `realtime`
(gateway WS + relay do outbox), `maintenance` (jobs `@Cron` in-process sob contexto de sistema),
**tenant guard global** (resolve o tenant ativo de um ponto único — `resolveActiveOrg`), e **`db`/migrations**.

**Os dois utilitários fundadores do módulo `db`** (acesso ao banco fora deles é **proibido** por
lint/review):
- `withTenantContext(orgId, userId, fn)` — abre transação, faz `set_config('app.current_organization_id', $1, true)`
  e `app.current_user_id` (**parametrizado**, não `SET LOCAL` interpolado), executa o callback.
- `withSystemContext(fn)` — GUC `app.is_system`, **uso restrito** a relay e jobs de manutenção (ADR-017).

**Defesa de tenant em três camadas** (ADR-001): guard de aplicação → **RLS** no Postgres (`ENABLE` +
`FORCE`, role sem `BYPASSRLS`, GUC por transação) → **FKs compostas tenant-safe** (`(organization_id, id)`).
Sem contexto, a RLS **nega tudo** (default seguro). Três fluxos legítimos operam fora do contexto de
tenant por caminho **explícito e estreito** (ADR-017): resolução de slug público, lookup por hash de
token (cancelamento/convite) via resolvers `SECURITY DEFINER`, e jobs cross-tenant (relay/limpezas) via
`withSystemContext`.

**Real-time** (ADR-005): a regra de negócio não conhece o transporte. O service grava o evento em
`appointment_events` **na mesma transação** (outbox: `published_at`); **após o commit**, publica o evento
de domínio in-process. Um **relay** (cross-tenant, sob `withSystemContext`, `FOR UPDATE SKIP LOCKED`,
dead-letter com teto + alerta) é a rede de segurança at-least-once. O gateway WebSocket empurra **só
invalidação** (`appointment.changed` com `professionalId`, `date`, `version`/`occurredAt` — **sem PII**);
o front refaz o fetch via HTTP, onde a autorização granular e a máscara de telefone valem. WebSocket
**não é fonte de verdade** — ao reconectar, o front sempre recupera via HTTP.

---

## 4. Ordem oficial de execução do MVP

A ordem é **inegociável**: a fundação de banco/contexto/erro vem **antes** de qualquer feature (sem RLS e
sem `withTenantContext`, toda query nasce vazando ou negando tudo). Dentro disso, **idempotência vem
antes das mutações de agenda**, e **disponibilidade vem antes da idempotência**.

Cadeia de dependências (de `IMPLEMENTATION_ROADMAP.md`, "Dependências em uma linha"):

```
0.1 → 0.2 → 0.3 → 1.1 → 1.2 → 1.3 → {1.4 → 1.5 → 1.6 → 1.7, 1.8} → {2.x}
    → {3.1 → 3.2 (idempotência) → 3.3 (mutações)} → {4.1 → 4.2 → 4.3} → {5.1 → 5.2} → {6.x}
```

Leitura por fases:

- **Fase 0 — Fundação do repositório:** PR-0.1 (monorepo+tooling), PR-0.2 (gate de migrations "aplica do
  zero" + segurança no CI), PR-0.3 (`packages/shared`: envelope de erro + `ErrorCode` + helpers).
- **Fase 1 — Banco, contexto de tenant, erro e observabilidade:** PR-1.1 (migrations 0002–0006),
  PR-1.2 (`db`: `withTenantContext`/`withSystemContext`), PR-1.3 (filtro de erro + request-id + health +
  hardening HTTP), PR-1.4 (auth: register/login + claims/tenant ativo + sessões + `RateLimiter`),
  PR-1.5 (verificação/reset/troca de senha via Resend), PR-1.6 (authorization + organizations/staff +
  convites), PR-1.7 (web shell + auth UI), PR-1.8 (jobs de manutenção).
- **Fase 2 — Cadastro operacional:** PR-2.1 (professionals), PR-2.2 (services), PR-2.3 (working-hours),
  PR-2.4 (availability-blocks).
- **Fase 3 — Agenda e anti-conflito (o coração):** PR-3.1 (disponibilidade), PR-3.2 (motor de
  idempotência), PR-3.3 (criar/remarcar/cancelar/completar/no-show transacional + máquina de estados).
- **Fase 4 — Página pública:** PR-4.1 (limites públicos + resolução por slug), PR-4.2 (booking +
  cancelamento por token no body), PR-4.3 (acessibilidade + estados explícitos).
- **Fase 5 — Real-time:** PR-5.1 (publisher + relay do outbox), PR-5.2 (gateway WebSocket + kick de socket).
- **Fase 6 — Notificações e operação:** PR-6.1 (confirmação visual + link manual de WhatsApp),
  PR-6.2 (histórico + filtros + `GET /appointments/:id/events`), PR-6.3 (clientes: busca/edição +
  anonimização LGPD).

> **Regra de fatiamento:** PR pequeno, uma responsabilidade, sempre verde no CI. Um PR sem critério de
> aceite testável não entra. Nenhum "PR fase inteira".

---

## 5. Fases e PRs do MVP — detalhamento por PR

> Cada PR traz os itens da seção 6 (código, objetivo, escopo permitido, escopo proibido, arquivos/pacotes
> esperados, dependências anteriores, critérios de aceite, comandos de validação, riscos técnicos e
> evidências a coletar). O detalhe normativo continua nas fontes citadas em cada PR; este plano organiza
> a execução, não substitui o contrato.

---

### FASE 0 — Fundação do repositório

#### PR-0.1 — Monorepo + tooling
- **Objetivo:** levantar o monorepo (pnpm workspaces + Turborepo), os apps vazios (`web` Next, `api`
  Nest), os pacotes compartilhados (`shared`, `config`) e o Docker Compose com PostgreSQL, já com a
  higiene de segredos e supply-chain do ADR-021.
- **Escopo permitido:** estrutura de pastas `apps/web`, `apps/api`, `packages/shared`, `packages/config`;
  configs compartilhadas (eslint/tsconfig/prettier em `packages/config`); `docker-compose.yml` com
  Postgres; `.env.example` **só com placeholders**; `.env` no `.gitignore`; Renovate/Dependabot
  configurado; scripts `pnpm lint`/`pnpm build` no Turborepo; instalação com `--frozen-lockfile`.
- **Escopo proibido:** **nenhuma feature, nenhuma migration, nenhum schema, nenhuma rota de negócio**;
  nada de auth, banco aplicado, RLS; nenhum segredo real commitado; não criar `apps/mobile` (futuro);
  não antecipar `packages/ui` se não for necessário ao shell.
- **Arquivos/pacotes esperados:** `pnpm-workspace.yaml`, `turbo.json`, raiz `package.json`,
  `apps/web` (Next vazio), `apps/api` (Nest vazio), `packages/shared` (stub compilável),
  `packages/config` (eslint/tsconfig/prettier), `docker-compose.yml`, `.env.example`, `.gitignore`,
  config Renovate/Dependabot. Árvore-alvo do PR-0.1 (sem `apps/mobile` — futuro; `web`/`api` são nomes
  precisos: `frontend` ficaria ambíguo quando o mobile entrar):

  ```
  nexos-booking/
    apps/
      web/        # Next.js
      api/        # NestJS
    packages/
      shared/
      config/
    docker-compose.yml
    pnpm-workspace.yaml
    turbo.json
  ```
  > Futuros (não criar agora, só documentados): `apps/mobile`, `apps/worker`, `packages/ui`.
- **Dependências anteriores:** nenhuma (primeiro PR).
- **Critérios de aceite:** `pnpm install` + `docker compose up` sobem web (Next vazio), api (Nest vazio)
  e Postgres; `pnpm lint` e `pnpm build` passam em **todos** os pacotes; **nenhum segredo commitado**.
- **Comandos de validação:** `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm build`;
  `docker compose up -d` + checagem de que os três serviços sobem; `git grep` por padrões de segredo
  retornando vazio.
- **Riscos técnicos:** versão de Node/pnpm divergente entre devs (fixar via `engines`/`.nvmrc`); cache do
  Turborepo mascarando erro; lockfile desatualizado quebrando `--frozen-lockfile`; segredo vazando em
  `.env` versionado por engano.
- **Evidências a coletar:** log de `pnpm install`/`lint`/`build` verdes; `docker compose ps` com os três
  serviços; print de `.env.example` só com placeholders e `.env` ignorado; confirmação de Renovate/Dependabot ativo.
- **Decisão/Contrato:** **ADR-021**. (Roadmap: PR-0.1.)

#### PR-0.2 — Gate de migrations "aplica do zero" (antes de existir schema) ⚠️
- **Objetivo:** criar o job de CI que, em banco limpo, roda a **sequência completa** de migrations
  (Drizzle + SQL manual) e falha se qualquer passo quebrar — provando a ordem desde o início, com a
  migration 0001 (extensões/tipos/enums) como primeira prova. Adicionar os steps de segurança no CI.
- **Escopo permitido:** pipeline de CI com Postgres efêmero; runner que aplica as migrations na ordem da
  seção 12 do schema; **migration 0001** (`btree_gist`, `timerange`, enums — schema §3); steps
  `pnpm audit` (falha em alta/crítica) e **scan de segredo** (ex.: gitleaks); o job preparado para crescer
  com 0002–0006.
- **Escopo proibido:** **não** criar 0002–0006 ainda (vêm no PR-1.1); não criar tabelas de negócio; não
  rodar seed de dados; não usar `down`/rollback (forward-only — ADR-007).
- **Arquivos/pacotes esperados:** workflow de CI (migrations + `pnpm audit` + scan de segredo); script de
  aplicação de migrations em banco limpo; `0001_extensions_types_enums.sql`.
- **Dependências anteriores:** PR-0.1.
- **Critérios de aceite:** CI **verde** com 0001 aplicada do zero; o job está pronto para crescer com
  0002–0006; `pnpm audit` e o scan de segredo rodam e **barram o merge** em falha.
- **Comandos de validação:** execução do workflow em banco limpo; `pnpm audit`; gitleaks (ou equivalente)
  no CI.
- **Riscos técnicos:** ordem de migrations frágil (ex.: FK composta depende de `UNIQUE (org,id)` existir
  antes — 0002→0003) só aparece em banco limpo; extensão `btree_gist` indisponível na imagem do Postgres;
  `CREATE TYPE timerange` falhando por permissão; falso-positivo de gitleaks travando merge.
- **Evidências a coletar:** log do CI aplicando 0001 do zero; saída de `pnpm audit`; saída do scan de
  segredo; confirmação de que o job falha propositalmente se uma migration quebrar.
- **Decisão:** **ADR-003, ADR-007, ADR-021**. **Schema:** §3, §12.

#### PR-0.3 — `packages/shared`: envelope de erro + `ErrorCode` + helpers de data/dinheiro
- **Objetivo:** materializar a base do contrato em TypeScript: o envelope de erro único, a union
  `ErrorCode` (catálogo API §7 + adições §22) e helpers de ISO-8601 e centavos — **sem lógica de negócio**.
- **Escopo permitido:** tipo `ErrorEnvelope` (`code`/`message`/`details`/`requestId`/`timestamp`);
  union `ErrorCode` com **todos** os códigos do catálogo §7/§22; helpers de (de)serialização ISO-8601 com
  offset e de dinheiro em centavos; testes de tipo do `ErrorCode`.
- **Escopo proibido:** **nada** de schemas Zod de recurso de negócio (vêm com cada fase); nada de cliente
  HTTP completo (vem no PR-1.7); nenhuma matriz de transição ainda (vem no PR-3.3); nenhuma constante de
  rate limit ainda (vem no PR-1.4/PR-4.1, conforme o roadmap).
- **Arquivos/pacotes esperados:** `packages/shared` com `error-envelope.ts`, `error-code.ts`, helpers de
  data/dinheiro e testes de tipo.
- **Dependências anteriores:** PR-0.1.
- **Critérios de aceite:** `shared` **compila** e é **importável** por web e api; testes de tipo do
  `ErrorCode` passam.
- **Comandos de validação:** `pnpm --filter shared build`; `pnpm --filter shared test`; build de `web` e
  `api` importando o `shared`.
- **Riscos técnicos:** `ErrorCode` divergir do catálogo (deixar de fora `NO_ACTIVE_ORG`/`EMAIL_TAKEN`/
  `ALREADY_MEMBER`/`LAST_OWNER`/`OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`/`INVALID_STATUS_TRANSITION`);
  helper de data perdendo o offset (PLANNING §10.5 proíbe data "solta"); configuração de build/exports do
  pacote impedindo import por web/api.
- **Evidências a coletar:** build verde do `shared`; lista do `ErrorCode` conferida contra API §7/§22;
  teste importando o pacote em web e api.
- **Decisão/Contrato:** API §2, §7, §12, §21, §22.

---

### FASE 1 — Banco, contexto de tenant, erro e observabilidade

> **DoD da Fase 1 (PLANNING §14):** usuário cria conta/empresa e entra no painel; guard barra papel sem
> permissão; query sem contexto é negada pela RLS; sessão revogada derruba acesso; convite aceito cria
> vínculo (com e sem conta prévia); login estourando limite recebe `429`; erro sai no envelope com
> `requestId`. Usuário com 2 empresas escolhe a ativa via `switch-org` (sem `org` no token → `403
> NO_ACTIVE_ORG`); rebaixar o único OWNER → `409 LAST_OWNER`.

#### PR-1.1 — Migrations 0002–0006 (schema completo, incluindo ADR-017)
- **Objetivo:** materializar o schema inteiro do MVP no banco, na ordem da seção 12 do schema, incluindo
  os resolvers `SECURITY DEFINER`, as policies de RLS (tenant, sistema e auditoria global) e o hardening
  de segurança do banco.
- **Escopo permitido:** **0002** tabelas/enums/índices btree via Drizzle (inclui `invitations`, chaves
  `(org,id)`, unique parcial de convite pendente, `appointment_events.publish_failed_at`,
  `clients.phone_normalized` NULLABLE); **0003** `CHECK` de intervalo + semânticos (inclui
  `chk_cancel_token_pair`), `EXCLUDE` (`no_overlap`, `no_shift_overlap`), **FKs compostas tenant-safe**
  (`appointments`, `professional_services`, `working_hours`, `availability_blocks`), uniques parciais
  (cancel token; `clients (org, phone_normalized) WHERE NOT NULL`; **`professionals (org, user_id) WHERE
  user_id IS NOT NULL`** — B1); **0004** índices de leitura (slots ativos parcial; outbox pendente `WHERE
  published_at IS NULL AND publish_failed_at IS NULL`; sessão ativa parcial); **0005** `set_updated_at` +
  triggers; **0006** `app_is_member` + resolvers públicos (`app_resolve_org_by_slug`,
  `app_resolve_appointment_by_cancel_hash`, `app_resolve_invitation_by_hash`) + `ENABLE/FORCE RLS` +
  policies `tenant_isolation`, `tenant_or_system` (eventos/idempotência/convites), `global_security_events`
  (`audit_logs`), com **toda leitura de GUC via `NULLIF(current_setting(...), '')` / `COALESCE(...,false)`**
  (A3); hardening do banco (`REVOKE ALL ON SCHEMA public FROM PUBLIC`, `audit_logs` append-only via
  `REVOKE UPDATE, DELETE … FROM app_runtime`, `statement_timeout`/`idle_in_transaction_session_timeout`).
- **Escopo proibido:** **não** incluir `CREATE ROLE app_runtime`/senha/grants na migration versionada (é
  pré-requisito de infra/IaC — schema §10.2); **não** usar `SET LOCAL` interpolado; **não** incrementar
  `appointments.version` por trigger (é compare-and-swap da aplicação — schema §11); **não** adicionar
  colunas de futuro (buffers/overrides em `professional_services`, `organization_booking_settings`,
  índice trgm de clientes — este último entra só na Fase 6); **não** criar `down`.
- **Arquivos/pacotes esperados:** schema Drizzle (`*.ts`) das tabelas comuns + `0002_tables` (gerado),
  `0003_advanced_constraints.sql`, `0004_read_indexes.sql`, `0005_triggers.sql`,
  `0006_functions_and_rls.sql`.
- **Dependências anteriores:** PR-0.2.
- **Critérios de aceite:** gate do PR-0.2 **verde com a sequência inteira do zero**; existência verificada
  por query ao catálogo do Postgres de `no_overlap`, `no_shift_overlap`, FKs compostas, resolvers, policies
  e uniques parciais (cancel token, `clients`, `professionals`); **`UPDATE`/`DELETE` em `audit_logs` pela
  role `app_runtime` falha** (append-only).
- **Comandos de validação:** runner de migrations do zero no CI; queries a `pg_constraint`/`pg_proc`/
  `pg_policy` confirmando objetos; teste negativo de `UPDATE`/`DELETE` em `audit_logs` como `app_runtime`.
- **Riscos técnicos:** ordem 0002→0003 (FK composta exige `UNIQUE (org,id)` antes); GUC placeholder `''`
  sob pooling (mitigado por `NULLIF`/`COALESCE` — A3); `EXCLUDE`/`btree_gist` mal declarados; resolver
  `SECURITY DEFINER` sem `search_path` pinado vira vetor; esquecer `FORCE` (RLS não vale para o dono);
  policy de `audit_logs` global liberar leitura indevida.
- **Evidências a coletar:** log do CI aplicando 0001–0006 do zero; saída das queries de catálogo; saída do
  teste de append-only; checklist do schema §14 marcado contra o que foi criado.
- **Decisão:** **ADR-002, ADR-003, ADR-017, ADR-021** (e A3/B1). **Schema:** §3–§12.

#### PR-1.2 — Módulo `db`: `withTenantContext` + `withSystemContext`
- **Objetivo:** entregar os dois utilitários fundadores de acesso ao banco e provar o isolamento de RLS e
  os caminhos do ADR-017.
- **Escopo permitido:** `withTenantContext(orgId, userId, fn)` (abre transação, define os GUCs via
  `set_config(name, $1, true)` **parametrizado**, executa o callback); `withSystemContext(fn)` (GUC
  `app.is_system`); regra de lint/review que **barra** conexão crua e barra `withSystemContext` fora de
  relay/manutenção.
- **Escopo proibido:** **nenhum** repository de negócio ainda; nada de auth; não expor conexão fora dos
  wrappers; não usar `withSystemContext` em código de feature.
- **Arquivos/pacotes esperados:** módulo `db` no `apps/api` com os dois wrappers, configuração de pool,
  e a regra de lint que proíbe acesso fora deles.
- **Dependências anteriores:** PR-1.1.
- **Critérios de aceite:** **isolamento RLS** — query sem contexto nega linhas; query com `orgId` de outro
  tenant nega linhas; query com contexto correto retorna. **ADR-017** — resolvers resolvem sem contexto;
  acesso **direto** às tabelas sem contexto continua negado; leitura cross-tenant de `appointment_events`/
  `idempotency_keys` só funciona sob `withSystemContext`.
- **Comandos de validação:** suíte de testes de integração contra o Postgres (com/sem contexto, tenant
  cruzado, resolvers, contexto de sistema).
- **Riscos técnicos:** `set_config` por interpolação (injeção/A3) — exigir parametrizado; transação não
  abrir antes do `set_config` (GUC com escopo errado); pool reusando conexão com GUC `''` (coberto pela
  leitura defensiva da 0006); `withSystemContext` vazando para feature.
- **Evidências a coletar:** relatório dos testes de isolamento e de ADR-017; trecho do lint barrando
  acesso cru; confirmação de `set_config` parametrizado.
- **Decisão:** **ADR-001, ADR-017**. **Schema:** §10.

#### PR-1.3 — Filtro global de erro + `X-Request-Id` + `/health` e `/ready` + hardening HTTP
- **Objetivo:** garantir que **toda** resposta de erro saia no envelope padrão com `requestId`, instalar
  observabilidade mínima e aplicar o hardening HTTP do ADR-021.
- **Escopo permitido:** exception filter global do Nest produzindo o envelope (API §2); middleware de
  `X-Request-Id` (propaga se vier, gera se não); `/health` (liveness, **não** toca DB) e `/ready` (checa
  DB); logs estruturados que **mascaram telefone** e fazem **scrub de segredos** (`Authorization`/cookies/
  tokens); error tracking; **Helmet** (HSTS/CSP/`nosniff`/`Referrer-Policy`/`frame-ancestors 'none'`);
  limite de body (ex.: 100 KB JSON); timeout de requisição; `max` de page size nos `GET` com cursor.
- **Escopo proibido:** nenhuma rota de negócio; nenhuma montagem de erro "à mão" em controller; `/health`
  **não** pode tocar dependências; não expor stack ao cliente; não logar PII/segredo.
- **Arquivos/pacotes esperados:** exception filter global, middleware de request-id, controllers de
  `/health` e `/ready`, configuração de Helmet/body-limit/timeout, logger com scrub.
- **Dependências anteriores:** PR-0.3, PR-1.2.
- **Critérios de aceite:** erro não tratado sai como `INTERNAL_ERROR` `500` **sem stack** ao cliente, com
  `requestId`; `VALIDATION_ERROR` traz `details`; `/health` não toca DB, `/ready` falha se DB cair; body
  acima do limite → **`413`**; resposta carrega os cabeçalhos do Helmet; **nenhum segredo/token no log**.
- **Comandos de validação:** testes e2e disparando erro não tratado, validação Zod, body grande,
  derrubando DB para `/ready`; inspeção de logs por PII/segredo.
- **Riscos técnicos:** filtro não capturar erros fora do ciclo HTTP; CSP forte demais quebrando o front
  público (ajustar por rota pública); `/ready` lento sob carga; scrub incompleto deixando token em log.
- **Evidências a coletar:** exemplos de resposta de erro no envelope com `requestId`; headers do Helmet na
  resposta; `413` em body grande; log sem PII/segredo; `/ready` falhando com DB fora.
- **Decisão/Contrato:** **ADR-010, ADR-021**. API §2, §3, §4.

#### PR-1.4 — Auth: register/login + claims/tenant ativo + sessões revogáveis + `RateLimiter`
- **Objetivo:** entregar a fundação de autenticação com claims de tenant ativo (ADR-020), sessões
  revogáveis, cookie/CSRF da Opção A (ADR-012), JWT endurecido (ADR-021) e a interface `RateLimiter` já
  aplicada à superfície de auth (ADR-009).
- **Escopo permitido:** `/auth/register` (cria user + 1ª org + vínculo OWNER em transação; e-mail
  existente → `409 EMAIL_TAKEN`), `/auth/login`, `/auth/refresh` (rotação + detecção de reuso → revoga
  família; exige `X-CSRF: 1`), `/auth/logout` (**Bearer-only**, revoga a família do `sid`), `GET /auth/me`
  (bootstrap com `activeOrg`), `POST /auth/switch-org` (valida vínculo `ACTIVE`, **reemite access com novo
  `org` sem rotacionar refresh**); claims do access `sub`/`org?`/`sid`/`exp`/`iat`; login com 1 vínculo →
  com `org`, com >1 → **sem** `org` (rota tenant-scoped → `403 NO_ACTIVE_ORG`); **guard de tenant lê de um
  ponto único `resolveActiveOrg`**; `refresh_sessions` ativo; cookie `httpOnly`+`Secure`+`SameSite=Strict`+
  `Path=/api/v1/auth/refresh` + `trust proxy` no hop conhecido; senha **argon2id**; JWT com **lista branca
  de algoritmo** (rejeita `alg:none`/confusão) + `iss`/`aud`; **interface `RateLimiter` + impl em memória**
  na superfície de auth (limites de API §19.2); constantes de rate limit de auth no `shared`.
- **Escopo proibido:** **não** implementar verificação/reset/troca de senha (PR-1.5); **não** implementar
  convites/aceite (PR-1.6); **não** auto-selecionar "última empresa" no backend; **não** receber
  `organization_id` livre em body/header; **não** usar double-submit de CSRF (descartado); **não** aplicar
  ainda os limites **públicos** (vêm no PR-4.1); nada de RS256/`kid` (futuro).
- **Arquivos/pacotes esperados:** módulo `auth` (controller/service/repository/DTOs), guard de tenant com
  `resolveActiveOrg`, módulo/serviço `RateLimiter` (interface + impl memória), schemas Zod de auth no
  `shared` (`LoginInput`, `RegisterInput`, `SwitchOrgInput`, `MeResponse`, claims).
- **Dependências anteriores:** PR-1.3.
- **Critérios de aceite:** **sessão** — `DISABLED`/reset revoga tudo; **logout (via `sid`) revoga só a
  família apresentada** (outra segue válida); reuso de token revogado mata a família. **Tenant ativo** —
  2 vínculos → access sem `org`, rota tenant-scoped → `403 NO_ACTIVE_ORG`, `switch-org` emite access com
  `org` e **não** derruba o refresh. `/auth/refresh` sem `X-CSRF: 1` → `403`. Login estourando o limite →
  `429 RATE_LIMITED` + `Retry-After` no envelope.
- **Comandos de validação:** testes e2e de register/login/refresh/logout/switch-org; teste de reuso de
  refresh; teste de `403 NO_ACTIVE_ORG`; teste de CSRF ausente; teste de rate limit estourando.
- **Riscos técnicos:** confusão de algoritmo do JWT se a lista branca não for explícita; cookie não
  acompanhar refresh se o `Path` estiver errado; IP real não resolvido (rate limit contornável/
  auto-throttle); `resolveActiveOrg` espalhado em vez de ponto único (débito técnico do multi-org);
  rate limit em memória assumido multi-instância (proibido — single-instance).
- **Evidências a coletar:** relatório dos testes de sessão/tenant/CSRF/rate limit; exemplo de access com e
  sem `org`; confirmação de `Path` e flags do cookie; confirmação da lista branca de algoritmo.
- **Decisão/Contrato:** **ADR-004, ADR-009, ADR-012, ADR-020, ADR-021**. API §3, §8, §19.

#### PR-1.5 — Verificação de e-mail (+ reenvio) + reset de senha + troca de senha (Resend)
- **Objetivo:** completar a fundação de auth de produto real, com tokens hasheados de uso único e a
  abstração de envio canal-agnóstica.
- **Escopo permitido:** `verification_tokens` (hash **SHA-256**, uso único, `purpose`, expiração);
  `/auth/verify-email`, `/auth/verify-email/resend` (emite novo token, invalida o anterior, rate-limitado),
  `/auth/password/forgot` (sempre `202`, rate-limitado por e-mail), `/auth/password/reset` (revoga
  **todas** as sessões), `/auth/password/change` (autenticado; valida senha atual; revoga **todas as
  famílias exceto a atual** — a do `sid`); integração Resend **atrás de `NotificationSender`** (ADR-026)
  com retry/backoff no envio e fallback de log se o provedor cair.
- **Escopo proibido:** **não** nomear a interface como `EmailSender` (deve ser `NotificationSender`); nada
  de WhatsApp/SMS; nada de convites (PR-1.6); `forgot` **não** pode revelar se o e-mail existe; não usar
  hash lento para tokens de alta entropia (SHA-256 basta).
- **Arquivos/pacotes esperados:** extensão do módulo `auth`; `NotificationSender` (interface) + impl
  Resend; schemas Zod (`PasswordChangeInput`, etc.) no `shared`.
- **Dependências anteriores:** PR-1.4.
- **Critérios de aceite:** token expirado/usado → `410`; reset revoga sessões ativas; `password/change`
  com senha atual errada → `401`, e a sessão que trocou a senha **segue válida** (as outras caem);
  `forgot` não revela se o e-mail existe; reenvio gera token novo e o antigo deixa de valer.
- **Comandos de validação:** testes e2e dos cinco fluxos; teste de revogação por reset; teste de
  `password/change` mantendo a sessão atual; simulação de falha do Resend caindo no fallback de log.
- **Riscos técnicos:** enumeração de e-mail no `forgot`; token reusável se `used_at` não for atômico;
  Resend instável sem retry/backoff; acoplar a interface a "e-mail".
- **Evidências a coletar:** relatório dos testes; confirmação do nome `NotificationSender`; log do
  fallback quando o provedor falha.
- **Decisão/Contrato:** **ADR-004, ADR-026**. API §8. Schema §4.3.

#### PR-1.6 — Authorization centralizada + organizations/staff + convites (ADR-019)
- **Objetivo:** entregar a autorização estrutural (guards/policies), a gestão de empresa/equipe e o fluxo
  de convite completo (com e sem conta), com os invariantes de segurança.
- **Escopo permitido:** guards/policies centralizados (sem `if (role===)` espalhado); `/organizations/me`,
  `/organizations/:id` (PATCH OWNER — valida `timezone` IANA e `slotIntervalMin` 5–240); `/members` +
  PATCH role/status (`DISABLED` derruba **todas** as sessões); **convite:** `POST /members/invite` cria
  `invitation` (token hasheado, reenvio substitui o pendente, **exige e-mail verificado do remetente** →
  `403 EMAIL_NOT_VERIFIED`) + `POST /auth/accept-invite` (lookup via resolver; usuário existente aceita
  logado; sem conta registra pelo mesmo token na mesma transação; vínculo nasce `ACTIVE`; já é membro →
  `409 ALREADY_MEMBER`); **invariante do último OWNER** (`409 LAST_OWNER` antes do UPDATE); slug com
  retry-on-conflict; auditoria mínima (`LOGIN_*`, `AUTHZ_DENIED`, `MEMBER_INVITED`); **revalidação de
  vínculo `ACTIVE`** server-side nas mutações sensíveis (gestão de membros, troca de papel).
- **Escopo proibido:** **não** implementar anonimização de cliente (Fase 6); **não** usar status
  `INVITED` no fluxo (fica reservado no enum — o vínculo nasce `ACTIVE` no aceite); recurso de outro
  tenant deve responder **`404`** (não `403`); não confiar só no claim para mutação sensível.
- **Arquivos/pacotes esperados:** módulo `authorization` (guards/policies), módulos `organizations` e
  `staff` (com `invitations`), schemas Zod (`AcceptInviteInput`, etc.) no `shared`.
- **Dependências anteriores:** PR-1.4, PR-1.5.
- **Critérios de aceite:** papel sem permissão → `403 AUTHZ_DENIED`; recurso de outro tenant → `404`;
  slug colidido → `409 SLUG_TAKEN` (nunca `500`); convite aceito cria vínculo `ACTIVE` (com e sem conta);
  token expirado/usado → `410`; rebaixar/desativar o único OWNER → `409 LAST_OWNER`; membro `DISABLED`
  com access ainda válido **não** consegue gerir membros.
- **Comandos de validação:** testes e2e de guards por papel; teste de `404` por tenant; teste de convite
  (com/sem conta, expirado, já membro); teste de `LAST_OWNER`; teste de revalidação de vínculo.
- **Riscos técnicos:** vazamento de existência por `403` vs `404`; corrida de slug virando `500` se for
  check-then-insert; convite sem e-mail verificado do remetente; janela do access curto de membro
  recém-`DISABLED` (fechada pela revalidação).
- **Evidências a coletar:** relatório dos testes de autorização e convite; exemplos de `404`/`409
  LAST_OWNER`/`409 ALREADY_MEMBER`; confirmação da revalidação server-side.
- **Decisão/Contrato:** **ADR-011, ADR-019, ADR-021**. API §8, §9.

#### PR-1.7 — Web shell + auth UI (escopo enxuto)
- **Objetivo:** dar ao front a casca autenticada e o fluxo de entrar, consumindo o contrato do `shared` e
  o envelope de erro, com o proxy reverso configurado.
- **Escopo permitido:** layout autenticado base; telas de login/register; integração com a auth (access
  em memória + refresh por cookie; no load, `/auth/refresh` → `GET /auth/me` recompõe a sessão);
  tratamento global de erro consumindo o envelope (lê `error.code`, mostra mensagem por `requestId`);
  tokens visuais iniciais; os três estados (loading/erro/vazio) em toda chamada; TanStack Query + cliente
  HTTP do `shared` (injeta `X-Request-Id`/`Idempotency-Key`/`If-Match`); proxy reverso `/api/*` → Nest
  no dev e documentado para produção.
- **Escopo proibido:** **nenhum** módulo operacional (agenda, cadastros) — só o shell e o fluxo de entrar;
  nada de páginas públicas de booking (Fase 4); nada de real-time (Fase 5).
- **Arquivos/pacotes esperados:** `apps/web` com shell, telas de auth, cliente HTTP do `shared`,
  configuração do proxy.
- **Dependências anteriores:** PR-1.4, PR-1.6, PR-0.3.
- **Critérios de aceite:** usuário registra, faz login e vê o painel vazio autenticado; refresh da página
  mantém a sessão (refresh + me); erro de API aparece tratado (não tela branca); navegação básica por
  teclado.
- **Comandos de validação:** `pnpm --filter web build`; teste manual/e2e do fluxo entrar + reload;
  simulação de erro de API; navegação por teclado.
- **Riscos técnicos:** access em memória perdido no reload sem o bootstrap refresh→me; proxy mal
  configurado quebrando cookie same-origin; cliente HTTP não injetando os headers obrigatórios.
- **Evidências a coletar:** gravação/print do fluxo entrar + reload mantendo sessão; exemplo de erro
  tratado pelo envelope; confirmação do proxy `/api/*`.
- **Decisão/Contrato:** **ADR-004, ADR-012**. API §2, §8.

#### PR-1.8 — Jobs de manutenção (`@Cron` in-process)
- **Objetivo:** dar dono às limpezas periódicas, sob contexto de sistema, sem Redis/BullMQ.
- **Escopo permitido:** módulo `maintenance` com limpezas sob `withSystemContext`: `refresh_sessions` e
  `verification_tokens` expirados (globais), `invitations` expirados; o job de `idempotency_keys` entra
  aqui mas **só é ligado junto do PR-3.2**.
- **Escopo proibido:** **não** ligar o job de idempotência ainda; nada de fila/worker externo (in-process
  — single-instance); o job **não** pode ler/apagar nada fora do critério de expiração; nada de
  `withSystemContext` fora deste módulo (e do relay).
- **Arquivos/pacotes esperados:** módulo `maintenance` com os crons e os repositories sob contexto de
  sistema.
- **Dependências anteriores:** PR-1.2, PR-1.5, PR-1.6.
- **Critérios de aceite:** linhas expiradas somem após o ciclo; o job **não** lê/apaga nada fora do
  critério de expiração; falha do job alerta (error tracking) sem derrubar a API.
- **Comandos de validação:** teste do ciclo de limpeza (semear expirados/válidos e checar o que some);
  teste de que falha do job não derruba a API.
- **Riscos técnicos:** job rodando sem contexto de sistema (lê zero linhas); apagar linha válida por
  critério errado; cron duplicado sob mais de uma instância (proibido — single-instance).
- **Evidências a coletar:** relatório do teste de limpeza; log de alerta em falha simulada; confirmação de
  uso de `withSystemContext`.
- **Decisão:** **ADR-006, ADR-017**.

---

### FASE 2 — Cadastro operacional

> **DoD da Fase 2 (PLANNING §14):** responsável monta uma barbearia real com 2 profissionais, serviços e
> horários diferentes.

#### PR-2.1 — Professionals (CRUD)
- **Objetivo:** cadastro de profissionais com slug por empresa e flag `active`.
- **Escopo permitido:** `GET /professionals` (lista, inclui `active`); `POST /professionals`
  (`{ name, slug?, userId? }`, slug gerado do nome se ausente, retry-on-conflict); `PATCH
  /professionals/:id` (`name`, `slug`, `active`, `userId`); slug único por empresa, case-insensitive,
  colisão `-2`/`-3`, lista de reservadas.
- **Escopo proibido:** **não** cancelar agendamentos futuros ao `active=false` (decisão consciente —
  some da vitrine/availability, painel mantém); **não** adicionar overrides/buffers em
  `professional_services` (futuro); PROFESSIONAL **não** cadastra.
- **Arquivos/pacotes esperados:** módulo `professionals`; `ProfessionalDTO` no `shared`.
- **Dependências anteriores:** Fase 1 (banco/contexto/erro/auth).
- **Critérios de aceite:** OWNER/MANAGER cadastra; PROFESSIONAL não cadastra (`403`); slug colidido em
  corrida → `409 SLUG_TAKEN` (nunca `500`); reservada → `422 SLUG_RESERVED`.
- **Comandos de validação:** testes e2e de CRUD por papel; teste de colisão de slug em corrida.
- **Riscos técnicos:** check-then-insert de slug virando `500`; unique parcial `(org, user_id)` violado
  ao mapear dois profissionais ao mesmo user.
- **Evidências a coletar:** relatório dos testes; exemplo de `409 SLUG_TAKEN`.
- **Decisão/Contrato:** **ADR-011**. API §20.1. Schema §6.1.

#### PR-2.2 — Services (CRUD)
- **Objetivo:** cadastro de serviços com duração e preço.
- **Escopo permitido:** `GET /services`; `POST /services` (`{ name, durationMin, priceCents, currency? }`);
  `PATCH /services/:id` (campos acima + `active`); `durationMin > 0`, `priceCents >= 0`.
- **Escopo proibido:** **não** implementar serviço combinado como multi-serviço (o combo é um serviço só,
  ex.: "Corte + Barba — 50 min"); nada de grade por serviço (futuro).
- **Arquivos/pacotes esperados:** módulo `services`; `ServiceDTO` no `shared`.
- **Dependências anteriores:** Fase 1.
- **Critérios de aceite:** OWNER/MANAGER cadastra; PROFESSIONAL não (`403`); `durationMin>0`/
  `priceCents>=0` rejeitam com `422 VALIDATION_ERROR`.
- **Comandos de validação:** testes e2e de CRUD por papel; testes de validação dos CHECKs.
- **Riscos técnicos:** `priceCents` enviado como decimal/float; moeda divergindo do default.
- **Evidências a coletar:** relatório dos testes; exemplos de `422` nas validações.
- **Contrato:** API §20.2. Schema §6.2.

#### PR-2.3 — Working-hours (`PUT` substitui jornada)
- **Objetivo:** definir a jornada recorrente com pausas, com a anti-sobreposição garantida no banco.
- **Escopo permitido:** `GET /professionals/:professionalId/working-hours`; `PUT` (substitui a jornada
  inteira numa transação); pausa = múltiplas linhas no mesmo `weekday`; `weekday` 0–6; `endTime >
  startTime`; `no_shift_overlap` traduzido em **`409 WORKING_HOURS_CONFLICT`** com `details`.
- **Escopo proibido:** **não** usar `PATCH` item a item (jornada é conjunto — `PUT` total); **não**
  invalidar agendamentos existentes ao mudar jornada (afeta só o availability futuro).
- **Arquivos/pacotes esperados:** parte do módulo `scheduling`; `WorkingHoursInput` (`shifts[]`) no `shared`.
- **Dependências anteriores:** PR-2.1.
- **Critérios de aceite:** pausa = duas linhas no mesmo `weekday`; turno sobreposto rejeitado pelo banco
  → `409 WORKING_HOURS_CONFLICT`; `endTime <= startTime` → `422`.
- **Comandos de validação:** testes e2e de `PUT` com pausa; teste de turno sobreposto; teste de intervalo
  invertido.
- **Riscos técnicos:** estado intermediário inválido se a substituição não for transacional; erro de
  borda no `timerange` `'[)'`.
- **Evidências a coletar:** relatório dos testes; exemplo de `409 WORKING_HOURS_CONFLICT` com `details`.
- **Decisão/Contrato:** **ADR-015**. API §20.3. Schema §6.4.

#### PR-2.4 — Availability-blocks (exceções datadas)
- **Objetivo:** registrar exceções datadas (férias, dia fechado), tenant-safe.
- **Escopo permitido:** `GET /professionals/:professionalId/blocks?from=&to=`; `POST` (`{ startsAt,
  endsAt, reason? }`); `DELETE /:id`; `endsAt > startsAt`; FKs compostas tenant-safe.
- **Escopo proibido:** **não** confundir `DELETE` de bloqueio com apagar histórico de agendamento
  (este é `ON DELETE RESTRICT`/anonimização); bloqueio não tem trilha de auditoria de domínio no MVP.
- **Arquivos/pacotes esperados:** parte do módulo `scheduling`; `AvailabilityBlockDTO` no `shared`.
- **Dependências anteriores:** PR-2.1.
- **Critérios de aceite:** bloqueio datado com `endsAt > startsAt` criado e listável por janela; `DELETE`
  remove a exceção.
- **Comandos de validação:** testes e2e de criação/listagem/remoção; teste de intervalo invertido.
- **Riscos técnicos:** bloqueio de outro tenant/profissional cruzado (barrado por FK composta); janela de
  consulta sem teto.
- **Evidências a coletar:** relatório dos testes; confirmação tenant-safe.
- **Contrato:** API §20.4. Schema §6.5.

---

### FASE 3 — Agenda e anti-conflito (o coração)

> **DoD da Fase 3 (PLANNING §14):** duas tentativas simultâneas no mesmo horário não duplicam; retry com
> mesma chave não duplica; estado terminal é imutável.

#### PR-3.1 — Cálculo de disponibilidade (`scheduling`)
- **Objetivo:** entregar o endpoint de disponibilidade com a âncora de grade única (ADR-023) e provar a
  coerência POST↔availability sob DST.
- **Escopo permitido:** `GET /professionals/:id/availability` (`jornada − pausas − blocks − appointments
  ativos`, fatiado por `slotIntervalMin`, no fuso da empresa); query `serviceId`+`date` ou `from`/`to`
  (teto de 31 dias); tipo de retorno marcado **advisory** no `shared`; **âncora = início da jornada do
  dia no fuso da empresa** via utilitário único `alignToSlotGrid()` no `shared` (reusado no PR-3.3 pela
  validação de grade do POST); slots no passado não retornados; profissionais `active=false` sem
  disponibilidade.
- **Escopo proibido:** **não** tratar availability como reserva (é projeção volátil — a verdade é o POST);
  **não** moldar a resposta de forma que dificulte a futura agregação org-level "qualquer profissional";
  **não** fixar "grade = duração do serviço" no código (passo é config por empresa); nada de soft-hold.
- **Arquivos/pacotes esperados:** módulo `scheduling` (cálculo); `AvailabilityQuery`,
  `AvailabilitySlotsResponse` (com nota de volatilidade), `alignToSlotGrid()`/`SLOT_GRID_ANCHOR` no `shared`.
- **Dependências anteriores:** Fase 2.
- **Critérios de aceite:** **timezone** — disponibilidade correta no fuso da empresa, incluindo virada de
  horário; **fixture de DST** num fuso com DST ativo (ex.: `America/Santiago`) cobrindo horário local
  inexistente/ambíguo e jornada que encolhe/estica; **coerência POST↔availability** — todo slot emitido
  passa na validação de grade do POST no dia de virada.
- **Comandos de validação:** testes de timezone e DST com a fixture `America/Santiago`; teste de coerência
  (cada slot do availability validado pelo `alignToSlotGrid()`).
- **Riscos técnicos:** âncora divergente entre slicing e validação do POST (bug silencioso de DST);
  cálculo em horário local sem resolver o instante absoluto; janela > 31 dias sem teto.
- **Evidências a coletar:** relatório dos testes de timezone/DST/coerência; saída da fixture de virada.
- **Decisão/Contrato:** **ADR-013, ADR-023**. API §14, §15.

#### PR-3.2 — Motor de idempotência (antes das mutações) ⚠️
- **Objetivo:** entregar a camada reutilizável de idempotência que as mutações vão consumir, com replay
  fiel e takeover atômico de órfão.
- **Escopo permitido:** `idempotency_keys` + middleware/serviço de `Idempotency-Key`; replay fiel (mesmo
  body + **mesmo `response_status_code`**); `IN_PROGRESS` → `409 IDEMPOTENCY_IN_PROGRESS` **imediato** +
  `Retry-After`; **TTL de 60s** para órfão com **takeover compare-and-swap** (só quem afetou 1 linha
  executa); payload divergente → `409 IDEMPOTENCY_KEY_REUSED`; **ligar** o job de limpeza por `expires_at`
  no `maintenance` (PR-1.8) sob contexto de sistema.
- **Escopo proibido:** **não** bloquear a requisição esperando a 1ª terminar (esgota o pool); **não**
  acoplar a uma mutação específica (é camada reutilizável); **não** confundir o TTL de órfão (60s,
  `created_at`) com o `expires_at` do replay.
- **Arquivos/pacotes esperados:** camada/serviço de idempotência no `apps/api`; ligação do job no
  `maintenance`; helpers de header no cliente HTTP do `shared`.
- **Dependências anteriores:** PR-3.1, PR-1.8.
- **Critérios de aceite:** retry com mesma chave não duplica; replay devolve o **mesmo HTTP status** da 1ª
  execução; payload divergente → `409`; **duas retries pós-TTL → só uma executa (CAS)**.
- **Comandos de validação:** testes de replay fiel (body + status); teste de payload divergente; teste de
  concorrência de takeover pós-TTL (duas retries → uma executa).
- **Riscos técnicos:** replay devolvendo `200` no lugar do status original; takeover sem CAS executando em
  dobro; chave em andamento bloqueando o pool.
- **Evidências a coletar:** relatório dos testes de idempotência; demonstração do CAS de takeover.
- **Decisão/Contrato:** **ADR-008**. API §5. Schema §9.1.

#### PR-3.3 — Criar/remarcar/cancelar/completar/no-show (transacional + máquina de estados)
- **Objetivo:** entregar as mutações de agenda — transacionais, idempotentes, com máquina de estados,
  gate de jornada e alinhamento de grade.
- **Escopo permitido:** rotas de API §16; **usa o motor do PR-3.2** (`Idempotency-Key` **obrigatória no
  painel** — ADR-008 v3); criação nasce **`CONFIRMED`** (ADR-018); **matriz de transição como constante
  única no `shared`**, validada no service **antes** do UPDATE; cada mutação grava `appointment_events`
  na **mesma transação**; remarcação é compare-and-swap com `If-Match` (0 linhas → `409
  APPOINTMENT_VERSION_CONFLICT`) e mantém `CONFIRMED` + evento `RESCHEDULED`; cancelar/completar/no-show
  como ações `POST /:id/<ação>`; **`startsAt` deve cair na grade** (âncora = início da jornada, via
  `alignToSlotGrid()`) → senão `422`; **gate de jornada (ADR-022):** service revalida jornada+bloqueios
  → `422 OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`; no painel, `allowOutsideHours: true` libera o encaixe e
  marca `metadata.outsideWorkingHours` (sem PII); **remarcação atualiza `public_cancel_token_expires_at =
  novo startsAt`** quando há hash; upsert de cliente por telefone normalizado; máscara de telefone por
  papel na resposta; `source=PANEL` definido pelo backend.
- **Escopo proibido:** **sem soft-hold** (corrida resolve no commit — ADR-025); **não** habilitar
  `SCHEDULED`/ação `confirm` (reservado, futuro); **sem trava de relógio** em complete/no-show; **não**
  expor `version` na futura rota pública; cancelar/completar/no-show **não** são `PATCH status` genérico;
  **não** receber `endsAt`/`clientId`/`organizationId` do cliente (backend deriva).
- **Arquivos/pacotes esperados:** módulo `appointments` (controller/service/repository/DTOs);
  `CreateAppointmentInput` (com `allowOutsideHours?`), `RescheduleInput`, `AppointmentDTO` (com `version`),
  `AppointmentStatus`, **`APPOINTMENT_TRANSITIONS`** (matriz) no `shared`.
- **Dependências anteriores:** PR-3.1, PR-3.2.
- **Critérios de aceite:** **concorrência** (duas reservas no mesmo slot → uma falha com `409
  APPOINTMENT_CONFLICT`); **lost update** (`version` velha → `409 APPOINTMENT_VERSION_CONFLICT`);
  **máquina de estados** (ação sobre terminal / fora da matriz → `409 INVALID_STATUS_TRANSITION`);
  **grade** (`startsAt` fora do passo → `422`); **gate de jornada** (painel sem `allowOutsideHours` →
  `422 OUTSIDE_WORKING_HOURS`; com `allowOutsideHours: true` → cria e marca `outsideWorkingHours`); e de
  **remarcação** (token de cancelamento passa a expirar no novo horário).
- **Comandos de validação:** teste de concorrência (dois POST simultâneos); teste de lost update; teste de
  transições inválidas; teste de grade; teste do gate de jornada (com e sem flag); teste de remarcação
  atualizando a expiração do token.
- **Riscos técnicos:** evento fora da transação (perde auditoria/outbox); validar transição depois do
  UPDATE; gate de jornada ausente deixando agendar fora do expediente; remarcação esquecendo de atualizar
  a expiração do token; upsert de cliente sobrescrevendo `name` indevidamente.
- **Evidências a coletar:** relatório de **todos** os testes do gate da seção 8; demonstração do `409
  APPOINTMENT_CONFLICT` na corrida; evento `RESCHEDULED` com antes/depois sem PII.
- **Decisão/Contrato:** **ADR-008, ADR-013, ADR-018, ADR-022, ADR-023, ADR-025**. API §6, §16.

---

### FASE 4 — Página pública

> **DoD da Fase 4 (PLANNING §14):** cliente agenda sem login; fluxo navegável por teclado; rate limit no
> envelope padrão; validações de tempo rejeitando no envelope.

#### PR-4.1 — Limites públicos no `RateLimiter` + resolução pública por slug
- **Objetivo:** aplicar os limites **públicos** à interface `RateLimiter` já existente (criada no PR-1.4)
  e resolver a empresa por slug via resolver `SECURITY DEFINER`.
- **Escopo permitido:** limites públicos do API §19.1 (leitura 60/min por IP; booking 10/min por IP + 5/h
  por telefone; cancel 20/min) → `429 RATE_LIMITED` + `Retry-After`; resolução por
  `app_resolve_org_by_slug` + `withTenantContext(orgId, null)`; fetch público **client-side** (IP do
  visitante atrás do proxy).
- **Escopo proibido:** **não** reimplementar a interface `RateLimiter` (só aplicar limites públicos);
  **não** assumir multi-instância (memória — single-instance); **não** receber `organization_id` do
  cliente; **não** apertar o limite por IP por causa de CGNAT (a defesa proporcional futura é captcha
  invisível, não apertar IP).
- **Arquivos/pacotes esperados:** módulo `public-booking` (resolução por slug + aplicação de limites);
  constantes de limite público no `shared`.
- **Dependências anteriores:** PR-1.4, PR-3.1.
- **Critérios de aceite:** rota pública com rate limit acionando responde no envelope padrão; slug
  inexistente → `404`; chave de limite reflete o **IP real** atrás do proxy.
- **Comandos de validação:** teste de rate limit estourando no envelope; teste de slug inexistente; teste
  de resolução de IP real (X-Forwarded-For só do hop conhecido).
- **Riscos técnicos:** IP do proxy chegando ao limiter (auto-throttle) se `trust proxy` mal configurado;
  spoof de `X-Forwarded-For`; resolver lendo mais que IDs mínimos.
- **Evidências a coletar:** relatório dos testes; exemplo de `429` no envelope; confirmação do IP real.
- **Decisão/Contrato:** **ADR-009, ADR-012, ADR-017**. API §15.2, §19.

#### PR-4.2 — Booking público + cancelamento por token (no body)
- **Objetivo:** entregar o agendamento de visitante e o cancelamento por token, com todas as validações
  públicas e o gate de jornada sempre rejeitando.
- **Escopo permitido:** API §17/§18; `consent` obrigatório (ausente/`false` → `422`); **validações:**
  `startsAt` no futuro, **antecedência mínima de 15 min** (`MIN_SCHEDULE_NOTICE_MIN` — ADR-024), dentro do
  **horizonte de 90 dias**, **na grade** (âncora = início da jornada — ADR-023) → `422`; **gate de
  jornada — público SEMPRE rejeita** fora do expediente (`422 OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`, **sem
  `allowOutsideHours`**); upsert de cliente por telefone normalizado (`ON CONFLICT (organization_id,
  phone_normalized) WHERE phone_normalized IS NOT NULL`, **não** sobrescreve `name` de cadastro
  existente); `cancelUrl` com token cru **só na resposta**; expiração do token **= `startsAt`**;
  cancelamento via `POST /public/cancel` / `/preview` com **token no body**, uso único,
  `cancelledByType=CLIENT`, lookup via `app_resolve_appointment_by_cancel_hash`; **agendamento já terminal
  (token válido) → `410`** na superfície pública.
- **Escopo proibido:** **não** aceitar `allowOutsideHours` no público; **não** receber token em path/query
  (vai no body); **não** ecoar telefone na resposta pública; **não** expor `version`; **não** permitir
  remarcação pelo cliente (fora do MVP); cliente não loga.
- **Arquivos/pacotes esperados:** módulo `public-booking` (booking + cancel); `PublicOrgDTO`,
  `PublicBookingInput` (com `consent`), `PublicBookingResponse` (com `cancelUrl`), `CancelPreviewInput`,
  `MAX_BOOKING_HORIZON_DAYS`, `MIN_SCHEDULE_NOTICE_MIN` no `shared`.
- **Dependências anteriores:** PR-4.1, PR-3.3.
- **Critérios de aceite:** cliente agenda sem login, recebe link de cancelamento válido, responsável vê
  no painel; token reusado/expirado **ou agendamento já terminal → `410`**; agendamento no passado/antes
  da antecedência/além do horizonte/fora da grade/fora da jornada → `422`.
- **Comandos de validação:** teste e2e de booking público + cancel; teste de cada validação temporal;
  teste de gate de jornada público; teste de `410` em terminal; teste de upsert não sobrescrevendo `name`.
- **Riscos técnicos:** token em path vazando em log; gate de jornada ausente; visitante sobrescrevendo
  cadastro de balcão; horizonte/antecedência fora da constante única do `shared`.
- **Evidências a coletar:** relatório dos testes; exemplo de `cancelUrl` (token só na resposta); `410` em
  terminal; `422` nas validações.
- **Decisão/Contrato:** **ADR-016, ADR-017, ADR-018, ADR-022, ADR-023, ADR-024**. API §17, §18.

#### PR-4.3 — Acessibilidade + estados explícitos no fluxo público
- **Objetivo:** tornar a vitrine acessível e tratar conflito de slot como fluxo normal.
- **Escopo permitido:** navegação por teclado, foco visível, WCAG básico; estados loading/erro/vazio;
  `409 APPOINTMENT_CONFLICT` → mensagem amigável + refaz `GET /availability`; `AbortController` cancela
  availability anterior ao trocar de dia.
- **Escopo proibido:** **não** tratar `409 APPOINTMENT_CONFLICT` como erro de sistema; nada de real-time
  ainda (Fase 5); nada além do fluxo público de booking.
- **Arquivos/pacotes esperados:** páginas públicas de booking no `apps/web`.
- **Dependências anteriores:** PR-4.2.
- **Critérios de aceite:** fluxo navegável só por teclado; conflito de slot vira refetch, não erro feio.
- **Comandos de validação:** teste de navegação por teclado; simulação de `409` levando a refetch.
- **Riscos técnicos:** foco perdido em transições; race de availability ao trocar de dia sem `AbortController`.
- **Evidências a coletar:** checklist WCAG básico; gravação do fluxo por teclado; demonstração do refetch em `409`.
- **Decisão/Contrato:** **ADR-013**. API §14.

---

### FASE 5 — Real-time

> **DoD da Fase 5 (PLANNING §14):** duas telas refletem a mudança sem refresh; ao reconectar, o estado se
> recompõe; membro `DISABLED` é desconectado do socket.

#### PR-5.1 — Publisher de domínio (interface) + relay do outbox
- **Objetivo:** publicar eventos após o commit e garantir at-least-once via relay do outbox.
- **Escopo permitido:** publicação após commit (EventEmitter in-process — ADR-006); relay sob
  `withSystemContext` lendo pendentes com **`FOR UPDATE SKIP LOCKED`**, publicando e marcando
  `published_at`; **dead-letter** com teto de tentativas + `publish_failed_at` + alerta.
- **Escopo proibido:** **não** usar Redis/pub-sub distribuído (single-instance); **não** publicar antes do
  commit; relay **não** roda fora de `withSystemContext`; evento dead-lettered **não** corrompe estado (o
  front recupera via HTTP).
- **Arquivos/pacotes esperados:** módulo `realtime` (publisher interface + relay); índice de pendentes já
  na migration 0004.
- **Dependências anteriores:** PR-3.3, PR-1.8.
- **Critérios de aceite:** evento não se perde se o processo cair entre commit e publish (reprocessado
  pelo relay); evento que falha além do teto sai dos pendentes e alerta (não varre o índice para sempre);
  relay lê eventos de **todas** as empresas (cross-tenant comprovado em teste).
- **Comandos de validação:** teste de crash entre commit e publish (relay reprocessa); teste de
  dead-letter no teto; teste cross-tenant do relay.
- **Riscos técnicos:** publicar antes do commit (evento fantasma); relay lendo zero linhas sem contexto de
  sistema; índice de pendentes envenenado por falha persistente sem dead-letter.
- **Evidências a coletar:** relatório dos testes; demonstração do reprocessamento e do dead-letter+alerta.
- **Decisão:** **ADR-005, ADR-006, ADR-014, ADR-017**.

#### PR-5.2 — Gateway WebSocket (handshake autenticado, payload sem PII) + kick de socket
- **Objetivo:** empurrar invalidação em tempo real com handshake autenticado, sem PII, e com o gancho de
  kick sob revogação/`DISABLED`.
- **Escopo permitido:** valida JWT + vínculo **antes** da room; rooms por `organizationId`/`professionalId`;
  payload **só invalidação** (`appointment.changed` com `professionalId`, `date`, `version`, `occurredAt`);
  front refaz fetch; recuperação via HTTP ao reconectar; **kick de socket** sob revogação/`DISABLED`
  (sockets do usuário identificados pelo `sid`), ou no mínimo revalida o vínculo a cada N minutos e
  desconecta.
- **Escopo proibido:** **nenhuma PII** no socket (nome/telefone); socket **não** é fonte de verdade; não
  entrar na room sem validar vínculo; não confiar que a conexão revalida sozinha o access curto (daí o kick).
- **Arquivos/pacotes esperados:** gateway WS no módulo `realtime`; integração do kick com a revogação de
  sessões/`DISABLED`.
- **Dependências anteriores:** PR-5.1.
- **Critérios de aceite:** duas telas refletem a mudança sem refresh; ao reconectar, o estado se recompõe;
  nenhum nome/telefone trafega no socket; **membro `DISABLED` é desconectado e não recebe mais
  invalidações**.
- **Comandos de validação:** teste de duas telas; teste de reconexão recompondo via HTTP; inspeção do
  payload (sem PII); teste de kick ao `DISABLED`.
- **Riscos técnicos:** PII vazando no payload; socket sobrevivendo à revogação (membro `DISABLED` ouvindo);
  handshake aceitando vínculo de outro tenant; entrega cross-instância (proibida — single-instance).
- **Evidências a coletar:** captura do payload sem PII; demonstração do kick; teste de reconexão.
- **Decisão:** **ADR-005, ADR-020** (kick via `sid`).

---

### FASE 6 — Notificações e operação

> **DoD da Fase 6 (PLANNING §14):** responsável opera no dia a dia; direito ao esquecimento executável de
> ponta a ponta.

#### PR-6.1 — Confirmação visual + link manual de WhatsApp
- **Objetivo:** dar à equipe a confirmação visual do agendamento e o link manual de WhatsApp (sem
  automação).
- **Escopo permitido:** confirmação visual no painel; mensagens básicas; **link manual** de WhatsApp;
  envio transacional segue atrás de `NotificationSender` (Resend).
- **Escopo proibido:** **nenhuma** notificação **automática** por WhatsApp/SMS (fora do MVP); nada de
  lembretes/anti-no-show automáticos.
- **Arquivos/pacotes esperados:** UI de confirmação no `apps/web`; helpers de link no `shared` se couber.
- **Dependências anteriores:** Fase 4/5 (operação visível).
- **Critérios de aceite:** responsável vê confirmação e consegue gerar o link manual de WhatsApp.
- **Comandos de validação:** teste manual/e2e da confirmação e do link.
- **Riscos técnicos:** confundir link manual com automação; expor telefone fora da máscara por papel.
- **Evidências a coletar:** print do fluxo de confirmação + link manual.
- **Decisão:** **ADR-026** (interface canal-agnóstica).

#### PR-6.2 — Histórico + filtros (inclui `GET /appointments/:id/events`)
- **Objetivo:** dar leitura ao histórico/filtros e expor a trilha de auditoria de domínio como leitura.
- **Escopo permitido:** histórico + filtros da agenda; `GET /appointments/:id/events` (a trilha vira
  leitura, respeitando tenant/escopo de papel e máscara de telefone).
- **Escopo proibido:** **não** expor PII na trilha (o `metadata` só tem referências/instantes); não
  ultrapassar o escopo de papel do PROFESSIONAL.
- **Arquivos/pacotes esperados:** leitura no módulo `appointments`; DTO de evento no `shared`.
- **Dependências anteriores:** Fase 3.
- **Critérios de aceite:** histórico/filtros funcionam; a trilha lê quem/quando/o quê via IDs, sem PII.
- **Comandos de validação:** teste de leitura da trilha; teste de escopo de papel.
- **Riscos técnicos:** vazar PII na trilha; PROFESSIONAL lendo trilha alheia.
- **Evidências a coletar:** exemplo de resposta da trilha sem PII.
- **Contrato:** API §16.

#### PR-6.3 — Clientes: busca/edição + anonimização LGPD (API §20.5)
- **Objetivo:** entregar a operação de balcão de clientes e materializar o direito ao esquecimento.
- **Escopo permitido:** `GET /clients` (busca por nome/telefone, cursor); `GET/PATCH /clients/:id`
  (re-normaliza E.164; colisão → `409`; painel atualiza `name`, booking público nunca sobrescreve);
  `POST /clients/:id/anonymize` (OWNER; `name='Cliente removido'`, `phone`/`phoneNormalized` → `NULL`;
  **`appointments.note` do cliente → `NULL`** — scrub de texto livre; `CLIENT_ANONYMIZED` em `audit_logs`;
  **irreversível**); **busca por nome com GIN + `pg_trgm`** (migration da Fase 6: `CREATE EXTENSION IF NOT
  EXISTS pg_trgm` + `clients_name_trgm_idx`); busca por telefone exato por `phone_normalized`; escopo de
  telefone do PROFESSIONAL respeitado.
- **Escopo proibido:** **nunca** `DELETE` físico (anonimização preserva histórico); **não** esquecer o
  scrub de `note`; **não** implementar esquecimento de `users`/staff (lacuna documentada — fora do MVP);
  não usar `ILIKE '%x%'` sem o índice trgm (seq scan).
- **Arquivos/pacotes esperados:** módulo `clients`; migration da Fase 6 (pg_trgm + índice); `ClientDTO` no
  `shared`.
- **Dependências anteriores:** Fase 3 (clientes já criados via upsert).
- **Critérios de aceite:** anonimização zera PII preservando histórico **e limpa `note`**; dois clientes
  anonimizados na mesma empresa **não colidem** (unique parcial); re-anonimizar → `409`; **busca por nome
  usa o índice trgm (sem seq scan)** — verificável por `EXPLAIN`.
- **Comandos de validação:** teste de anonimização (PII + `note` + audit); teste de não-colisão; teste de
  re-anonimização; `EXPLAIN` da busca por nome usando o índice trgm.
- **Riscos técnicos:** scrub incompleto deixando PII em `note`; colisão de "valores neutros" sem unique
  parcial; seq scan na busca por nome; visitante sobrescrevendo cadastro.
- **Evidências a coletar:** relatório dos testes; saída do `EXPLAIN`; registro `CLIENT_ANONYMIZED` no audit.
- **Decisão/Contrato:** **ADR-010, ADR-016 (v3)**. API §20.5. Schema §7.

---

## Gate transversal (vale para TODO PR)

Nenhum PR faz merge sem:

- [ ] CI verde (lint + build + testes do escopo do PR)
- [ ] Migrations aplicam do zero (se o PR tocou schema)
- [ ] Nenhum acesso a banco fora de `withTenantContext`/`withSystemContext` (e o segundo só em relay/manutenção)
- [ ] Resposta de erro no envelope padrão com `requestId`
- [ ] Sem PII em log / `metadata` / payload de socket (ADR-010, ADR-005)

---

## 7. Onde termina o MVP

O MVP **termina ao final da Fase 6 (PR-6.3)**, com **todos** os DoD de fase atendidos e o gate de
qualidade do PLANNING §16 verde. Em uma frase: o MVP é uma **agenda confiável multi-tenant**, com painel
operacional e página pública de booking sem login, em tempo real, com auth de produto real, anti-conflito
garantido no banco, idempotência, RLS, trilha de auditoria e LGPD básico executável.

**Está dentro do MVP (escopo fechado):** multi-tenant com RLS; auth da equipe (register/login/refresh/
logout/switch-org) + verificação/reset/troca de senha + sessões revogáveis + rate limit de auth;
convites com aceite (com e sem conta); organizations/staff com invariante do último OWNER; profissionais,
serviços, jornadas com pausas, bloqueios datados; cálculo de disponibilidade no fuso da empresa
(advisory); agendamentos pelo painel (criar/remarcar/cancelar/completar/no-show) transacionais com
máquina de estados, optimistic lock, idempotência e gate de jornada; página pública (vitrine + booking +
cancelamento por token no body) com anti-abuso; real-time de invalidação (sem PII) com outbox/relay e
kick de socket; notificação visual + link manual de WhatsApp; histórico/filtros + trilha como leitura;
gestão de clientes (busca/edição) + anonimização LGPD.

**Está FORA do MVP (não construir agora — `POST_MVP_PRODUCT_ROADMAP.md` e "O que NÃO entra" do roadmap):**
login/conta/remarcação do cliente final; app mobile (Expo); pagamentos, depósitos e proteção contra
no-show; marketplace e descoberta; avaliações, portfólio; **notificações automáticas** por WhatsApp/SMS/
e-mail; estoque, caixa/PDV, comissões, pacotes, fidelidade; lista de espera; multiunidade; relatórios
avançados; aprovação manual de agendamento (`SCHEDULED`/ação `confirm` — enum reservado, ADR-018);
billing SaaS; visão mensal; Redis/multi-instância; CQRS; cache de disponibilidade; feature flags.
**Registrados como futuro aditivo (sem coluna/rota no MVP):** buffers/overrides em
`professional_services` (mudam a semântica de ocupação — ADR/decisão arquitetural, não campo trivial);
availability org-level "qualquer profissional"; client cards (tags/flags/`client_notes`); soft-hold;
grade por serviço; multi-org simultâneo path-scoped; auto-complete de `CONFIRMED` no passado;
`organization_booking_settings` (config por empresa de horizonte/antecedência); esquecimento/anonimização
de `users`/staff (lacuna documentada).

---

## 8. Checklist final de validação do MVP (Definition of Done — PLANNING §16)

Marcar tudo antes de declarar o MVP pronto:

- [ ] Migrations aplicam do zero (sequência **completa**: Drizzle + SQL manual), em banco limpo
- [ ] Testes de service/repository para a regra anti-conflito
- [ ] Teste de **concorrência**: duas reservas simultâneas no mesmo slot → uma falha (`409 APPOINTMENT_CONFLICT`)
- [ ] Teste de **timezone**: agendamento e disponibilidade corretos no fuso da empresa
- [ ] Teste de **transição de DST** (fuso DST-ativo, ex.: `America/Santiago`), **incluindo coerência
      POST↔availability** (todo slot do availability passa na validação de grade do POST no dia de virada)
- [ ] Teste de **gate de jornada (ADR-022)**: público sempre `422 OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`;
      painel rejeita sem `allowOutsideHours` e aceita com `allowOutsideHours: true` (marca `outsideWorkingHours`)
- [ ] Teste de **autorização**: PROFESSIONAL tentando acessar agenda alheia → bloqueado
- [ ] Teste de **isolamento RLS**: query sem contexto / com outro tenant → nega linhas
- [ ] Teste de **acesso fora de contexto (ADR-017)**: resolvers resolvem sem contexto; acesso direto sem
      contexto continua negado; relay/limpeza só leem cross-tenant sob `withSystemContext`
- [ ] Teste de **sessão**: `DISABLED`/troca de senha revoga tudo; logout revoga só a família apresentada;
      reuso de token revogado mata a família
- [ ] Teste de **convite (ADR-019)**: aceite cria vínculo `ACTIVE` (com e sem conta); token expirado/usado → `410`
- [ ] Teste de **idempotência**: retry com a mesma chave não duplica; payload divergente → `409`; replay
      devolve o mesmo HTTP status; takeover de órfão é exclusivo (CAS)
- [ ] Teste de **lost update**: edição concorrente com `version` antiga → `409`
- [ ] Teste de **máquina de estados (ADR-018)**: ação sobre terminal / fora da matriz → `409 INVALID_STATUS_TRANSITION`
- [ ] Teste de **integridade tenant-safe**: agendamento com profissional/serviço/cliente de outra empresa → rejeitado pelo banco
- [ ] Teste de **conflito de corrida (advisory)**: slot livre no `GET`, dois `POST` no mesmo slot → um `409` + refetch no front
- [ ] Teste básico da **rota pública** com rate limit acionando — e de **auth** (login estourando → `429`)
- [ ] Teste das **validações públicas**: `startsAt` no passado / antes da antecedência / além do horizonte → `422`
- [ ] **Segurança de plataforma (ADR-021):** JWT rejeita `alg:none`/alg fora da lista branca e valida
      `iss`/`aud`; cabeçalhos do Helmet presentes; body acima do limite → `413`; `audit_logs` append-only;
      `pnpm audit` sem alta/crítica no CI; nenhum segredo/token/cookie em log
- [ ] **Mutação sensível revalida vínculo:** membro `DISABLED` com access válido **não** gere membros /
      anonimiza / troca papel

---

## 9. Critérios para declarar o MVP pronto para TESTE FUNCIONAL

O MVP entra em teste funcional quando:

1. Todos os PRs das Fases 0–6 estão **mergeados** e o CI está verde.
2. O **gate de migrations "aplica do zero"** passa com a sequência inteira (0001–0006 + migration da Fase 6).
3. O **checklist da seção 8** está integralmente marcado em ambiente de teste.
4. Os **fluxos ponta a ponta** rodam num ambiente único reproduzível (`docker compose up`): onboarding
   (criar conta/empresa, convidar/cadastrar, serviços, jornada, bloqueios), booking público sem login,
   operação do painel (criar/remarcar/cancelar/completar/no-show), real-time entre duas telas,
   anonimização LGPD.
5. A observabilidade mínima responde: `/health`, `/ready`, `request-id` correlacionando logs/erros, error
   tracking recebendo.
6. O `MVP_TEST_REPORT.md` está aberto e sendo preenchido com os testes executados e o veredito por fluxo.

> Teste funcional é validação de comportamento ponta a ponta por um humano/QA, ainda em ambiente
> controlado — não é produção.

---

## 10. Critérios para declarar o MVP pronto para DEPLOY CONTROLADO

Além de tudo da seção 9, o deploy controlado (janela/drain, single-instance — ADR-006) exige:

1. **Sem pendências bloqueantes** no `MVP_TEST_REPORT.md` (veredito final positivo); pendências aceitas
   estão registradas e assinadas como não-bloqueantes.
2. **Pré-requisitos de infra atendidos:** role `app_runtime` provisionada (sem `BYPASSRLS`/DDL, com
   `statement_timeout`/`idle_in_transaction_session_timeout`); migrations rodam com role privilegiada
   separada; **TLS habilitado** (cookies `Secure` + HSTS o pressupõem); **`sslmode=require`** no banco;
   **backup/PITR habilitado** no provedor (gate de produção — ADR-007).
3. **Segredos por injeção de ambiente** (JWT/cookie/Resend/DB), nenhum no repo; scan de segredo verde.
4. **Topologia single-instance confirmada** com proxy reverso same-origin (`/api/*` → Nest), `trust proxy`
   no hop conhecido, fetch público client-side; **deploy com drain/janela** (não zero-downtime
   multi-instância).
5. **Plano de rollback por PITR** (não `down`) documentado; estratégia expand/contract entendida para a
   próxima migration incompatível.
6. **Resend operacional** (chave válida, domínio verificado) com fallback de log se cair.
7. Smoke test pós-deploy: register/login, criar empresa, booking público, cancelar por token, real-time,
   `/ready` verde.

> "Controlado" = produção com escopo/tráfego limitado, janela de deploy e observabilidade ativa para
> reverter por PITR se necessário.

---

## 11. Critérios para iniciar o PÓS-MVP

O pós-MVP só começa quando:

1. O MVP está **validado em deploy controlado** (seção 10) e o `MVP_TEST_REPORT.md` tem veredito final
   positivo sem bloqueantes.
2. O `POST_MVP_TRANSITION_PLAN.md` está preenchido, ligando o estado validado às fases do
   `POST_MVP_PRODUCT_ROADMAP.md` (sequência macro: produto público/conversão → configurações de agenda/
   lista de espera → monetização SaaS → escala técnica (Redis/workers/filas/zero-downtime) → notificações
   → pagamentos/anti-no-show → cliente final/app → retenção/LGPD ampliada → CRM → financeiro/relatórios →
   estoque/pacotes/fidelidade → avaliações/portfólio → marketplace → multiunidade).
3. Cada item que o roadmap futuro marca como **"exige ADR próprio"** tem seu ADR **antes** de qualquer PR
   (ex.: Redis/multi-instância, buffers/ocupação, pagamentos, billing/entitlements, WhatsApp/SMS provider,
   modelo de multiunidade, ownership de mídia sem FK polimórfica, SSR/SEO vs rate limit por IP, retenção/
   anonimização de staff, lista de espera).
4. **Nenhuma feature pós-MVP foi antecipada para dentro do MVP** (os guardrails da seção 10 do POST_MVP
   foram respeitados — nada de "tabela/rota só para deixar preparado").
5. Antes de iniciar uma fase pós-MVP, é criado um **roadmap específico** no estilo do
   `IMPLEMENTATION_ROADMAP.md` (PRs pequenos, dependências, critérios de aceite).

---

## Divergências encontradas entre documentos (e qual prevalece)

Leitura técnica completa dos seis documentos + o arquivo de patches. **Não foram encontradas divergências
de conteúdo abertas entre as fontes canônicas** — os espelhos (`PLANNING.md`, `DATABASE_SCHEMA_V2.md`,
`API_CONTRACTS.md`, `IMPLEMENTATION_ROADMAP.md`, `POST_MVP_PRODUCT_ROADMAP.md`) estão sincronizados na
mesma rodada (par do ADR v4 rev.1). Pontos que poderiam parecer divergência e estão, na verdade,
resolvidos:

1. **`PATCHES_PLANNING_E_SCHEMA.md` parece "pendente", mas está aplicado.** O ADR (v3 rev.2) declara o
   arquivo de patches como **aplicado e a ser arquivado**; o `PLANNING.md` (v11) e o
   `DATABASE_SCHEMA_V2.md` (v5) já incorporam as edições. **Prevalece:** os documentos centrais
   atualizados, não o arquivo de patches. *Ação:* tratar PATCHES como histórico; não usar para implementar.
2. **"`SET LOCAL`" no `PLANNING.md` vs `set_config(... , $1, true)` parametrizado no schema/ADR.** O texto
   de panorama do PLANNING fala em `SET LOCAL`; a decisão fechada (A3, schema §10.1, ROADMAP PR-1.2) exige
   **`set_config` parametrizado** (anti-injeção e anti-`22P02` sob pooling). **Prevalece:** schema/ADR
   (`set_config` parametrizado).
3. **"`organization_id` nunca vem do cliente" (§3.3 antigo) vs claim `org` assinado / path validado.** O
   ADR-020 reescreveu para "nunca **livre/não-validado**". **Prevalece:** ADR-020 / API §3.3 atual.
4. **Cancelamento público sobre estado terminal — `409` vs `410`.** A superfície pública responde **`410`**
   (ADR-018 v3); o painel mantém `409 INVALID_STATUS_TRANSITION`. **Prevalece:** ADR-018 v3 / API §18.
5. **`min_schedule_notice_min` "futuro" no POST_MVP vs "no MVP" (constante 15).** O ADR-024 promoveu para
   o MVP como **constante no `shared`** (default 15), mantendo a entidade `organization_booking_settings`
   como futura. **Prevalece:** ADR-024 (constante no MVP).

Se, durante a execução, surgir uma divergência **nova** entre documentos, ela deve ser registrada no
`BUGFIX_LOG.md` (ou aberta como questão de ADR) **antes** de avançar, aplicando a hierarquia de autoridade
documental do topo deste plano.

---

## Lacunas críticas conhecidas (documentadas, não bloqueantes do MVP)

Estas lacunas estão **registradas nas fontes** como conscientes; nenhuma bloqueia o desenvolvimento do
MVP, mas devem ser visíveis para não passarem por "resolvidas":

- **Esquecimento/anonimização de `users`/staff não tem caminho no MVP** (ADR-016 v3 / PLANNING §13). A
  anonimização LGPD cobre `clients` + `appointments.note`, não membros da equipe. Fica para a fase de
  retenção (pós-MVP).
- **Força do anti-abuso por telefone é limitada** (ADR-024): telefone sem posse provada (sem OTP) e CGNAT
  no Brasil enfraquecem os limites por telefone e por IP. Consequência de design: não assumir
  confiabilidade do telefone em features futuras; se houver abuso, a resposta proporcional é captcha
  invisível, **não** apertar o limite por IP.
- **`CONFIRMED` no passado permanece `CONFIRMED`** (ADR-018 v3): sem auto-complete por job no MVP; o painel
  rotula como "pendente de desfecho". Auto-complete é pós-MVP (alimenta relatórios).
- **Pré-requisito de infra fora da migration:** role `app_runtime` (provisionamento), TLS, PITR. Sem isso
  o gate de deploy controlado não passa — mas não bloqueia o desenvolvimento.

---

## Próximo passo (após aprovação)

Com o plano aprovado, preparar o **primeiro prompt de implementação para o Cloud Code**, começando
**exclusivamente pelo `PR-0.1 — Monorepo + tooling`**, respeitando rigorosamente o escopo permitido/
proibido da seção 5 e o gate transversal. Nenhum commit é criado automaticamente.
