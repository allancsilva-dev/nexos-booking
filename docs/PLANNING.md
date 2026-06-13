# Planejamento de Arquitetura — MVP de Agendamento (Salões e Barbearias)

> Documento base do projeto. Consolidado antes de escrever código.
> Status: **v11 — sync ADR v4** (sobre a base v10).
> DDL canônico (SQL, RLS, sessões) detalhado em **`DATABASE_SCHEMA_V2.md`** (v5).
> Contrato da superfície HTTP (envelope de erro, headers, fluxos, endpoints) em **`API_CONTRACTS.md`**.
> Decisões arquiteturais/operacionais (autoridade única) em **`ARCHITECTURE_DECISIONS.md`** (v4, ADR).
> Sequência de implementação em **`IMPLEMENTATION_ROADMAP.md`** (→v4, PRs).

### Changelog v10 → v11 (sync ADR v4 — lacunas de agenda/booking além do no_overlap)

Rodada de continuidade antes do PR-0.1. Cinco pontos que o `no_overlap` e o availability *advisory* não
garantiam sozinhos, todos **além do escopo documentado** (nenhum invalida o que estava escrito):

- **Gate de jornada (ADR-022):** o `no_overlap` impede sobreposição, mas não impede agendar **fora da
  jornada/bloqueios**. Público **sempre rejeita** (`422 OUTSIDE_WORKING_HOURS`); painel **permite encaixe**
  fora da jornada com `allowOutsideHours` explícito (decisão de negócio — o dono manda) + marca no evento.
  Seções 10.1/10.4.
- **Âncora da grade + DST (ADR-023):** grade de slots ancorada no **início da jornada do dia, no fuso da
  empresa**, com âncora **única** entre availability e POST (coerência sob DST). `slot_interval_min`
  segue config por empresa e **independente da duração** (passo = duração é caso particular). Seções
  10.2/16.
- **Antecedência mínima pública (ADR-024):** `min_schedule_notice_min` = **15** (default declarado,
  vira config depois); painel isento. Registrada a fraqueza do limite por telefone (sem posse provada) e
  o efeito **CGNAT** no Brasil. Seção 10.7.
- **Sem soft-hold (ADR-025):** decisão escrita — a corrida resolve no commit (`409 APPOINTMENT_CONFLICT` +
  refetch); hold é aditivo futuro. Seções 3/10.1.
- **Notificação canal-agnóstica (ADR-026):** a interface nasce `NotificationSender` (não "EmailSender");
  Resend é a 1ª impl; WhatsApp/SMS aditivos. Seções 6/8/11.

### Changelog v9 → v10 (sync ADR v3 — tenant ativo, auth, LGPD de texto livre)

- **Tenant ativo (ADR-020):** o usuário multi-empresa agora tem caminho. O access carrega claim `org`
  (empresa ativa) + `sid` (família da sessão); login com **>1 vínculo → access sem `org`** (`403
  NO_ACTIVE_ORG` até escolher) + `POST /auth/switch-org`. **Sem auto-seleção de "última empresa" no
  backend** — emissão do `org` depende de escolha explícita (seção 12; API §8). Evolução path-scoped fica
  isolada num ponto único (`resolveActiveOrg`).
- **Logout Bearer-only via `sid` (ADR-004 v3):** o `Path` estreito do cookie impedia o logout de
  enxergar a família; agora lê o `sid` do access. Nova rota `POST /auth/password/change` (autenticado).
- **CSRF fixado (ADR-012 v3):** `/auth/refresh` exige header **`X-CSRF: 1`** (double-submit descartado —
  redundante sob `SameSite=Strict`).
- **Idempotência obrigatória também no painel (ADR-008 v3):** elimina duplo-clique da recepcionista
  (seção 10.6).
- **LGPD — scrub de texto livre (ADR-016 v3):** anonimização também limpa `appointments.note`;
  **princípio geral**: todo campo de texto livre com PII entra no scrub (alcança `client_notes` futuro).
  Registrada a **lacuna de esquecimento de `users`/staff** (sem caminho no MVP) — seção 13.
- **Robustez de RLS sob pooling (A3):** leitura de GUC blindada com `NULLIF`/`COALESCE` e
  `withTenantContext` via `set_config` parametrizado (schema §10; seção 10.3).
- **Bordas:** invariante do **último OWNER** (`409 LAST_OWNER`, seção 15); gancho de **kick de socket**
  sob revogação/`DISABLED` (seção 11; Fase 5); alinhamento de `startsAt` à grade (API §16/§17).
- **Futuro registrado (sem construir):** buffers/overrides em `professional_services` e availability
  org-level ("qualquer profissional") — seções 3/10.2.

### Changelog v8 → v9 (revisão pré-código — fecha o furo de RLS e as últimas ambiguidades)

- **ADR-012 FECHADA: same-origin via proxy reverso (Opção A)** — era a única pendência. Inclui a
  **resolução de IP real atrás do proxy** (`trust proxy` + `X-Forwarded-For` só do hop conhecido),
  sem a qual o rate limit por IP seria contornável ou auto-throttling (seções 12/13)
- **ADR-017 (nova) — acessos fora do contexto de tenant sob `FORCE RLS`:** três fluxos legítimos não
  tinham caminho (resolução de slug público, lookup por token de cancelamento/convite, jobs
  cross-tenant do relay/limpezas — leriam **zero linhas**). Fechado com **resolvers `SECURITY
  DEFINER`** + **contexto de sistema** (`withSystemContext`) + policy de INSERT global do
  `audit_logs` (seções 10.3/11; schema §10.7/§10.8)
- **ADR-018 (nova) — máquina de estados de `appointments`:** todo agendamento **nasce `CONFIRMED`**
  no MVP (`SCHEDULED` reservado para aprovação futura); matriz de transição única; estados terminais
  imutáveis → `409 INVALID_STATUS_TRANSITION` (seção 9; API §16)
- **ADR-019 (nova) — convite de equipe completo:** tabela `invitations` (token hasheado, uso único);
  o vínculo nasce **no aceite**, já `ACTIVE`; cobre convidado com e sem conta (`POST
  /auth/accept-invite`). O fluxo anterior parava no envio do e-mail (seções 2/9; schema §5.3)
- **Auth endurecida:** rate limit estendido a login/register/forgot/refresh (ADR-009 emendada — a
  superfície estava descoberta: credential stuffing e flooding de e-mail); **logout revoga só a
  família da sessão apresentada** (ADR-004 emendada); `GET /auth/me` (bootstrap),
  reenvio de verificação e consequência de e-mail não verificado definidos (API §8)
- **Idempotência corrigida no texto (seção 10.6):** a 2ª requisição com chave `IN_PROGRESS` responde
  `409` **na hora** (não "aguarda" — divergência com o ADR-008 eliminada); takeover de órfão é CAS atômico
- **Validações da rota pública fechadas:** `startsAt` no futuro; horizonte máximo de 90 dias;
  expiração do token de cancelamento **= `startsAt`** (API §17/§18)
- **Hash especificado:** argon2id (senha) / SHA-256 (tokens de alta entropia) — schema §1
- **Módulo `clients` ganha superfície:** busca/edição + rota de anonimização LGPD (o mecanismo do
  ADR-016 não tinha endpoint) — API §20.5, implementação na Fase 6
- **Jobs de manutenção com dono:** limpezas periódicas (idempotência, sessões, tokens, convites)
  viram PR nomeado no roadmap, sob contexto de sistema

### Changelog v7 → v8 (fechamento documental antes do código)
- **Decisões "a confirmar" FECHADAS** e movidas para `ARCHITECTURE_DECISIONS.md`: recuperação de
  idempotência `IN_PROGRESS` (ADR-008, TTL 60s + 409 imediato), migrations **forward-only + PITR**
  (ADR-007), **topologia single-instance no MVP** como restrição declarada (ADR-006)
- **Contrato HTTP completo e unificado em `API_CONTRACTS.md`** (funde a antiga v1+v2 num arquivo só, sem
  "v1 herdada"): adiciona disponibilidade, agendamentos do painel, página pública (booking + cancel por
  token) e cadastros operacionais — destrava o `packages/shared`
- **Lacunas fechadas como decisão escrita:** disponibilidade *advisory* vs. verdade na constraint
  (ADR-013), `metadata` sem PII (ADR-010), dead-letter do outbox (ADR-014), slug retry-on-conflict
  (ADR-011), conflito de jornada como `409 WORKING_HOURS_CONFLICT` (ADR-015), `clients.phone_normalized`
  NULLABLE + unique parcial para anonimização sem colisão (ADR-016), limites concretos de rate limit
  (ADR-009 / `API_CONTRACTS.md` §19)
- ~~Cookie de refresh cross-site (ADR-012): PENDENTE~~ → **fechada na v9 (Opção A)**
- **`IMPLEMENTATION_ROADMAP.md`:** fases viradas em PRs pequenos; gate de migration "aplica do zero"
  puxado para a semana 1; idempotência **antes** das mutações de agenda; `PR-1.7 — Web shell + auth UI`
- **Schema renomeado:** `DATABASE_SCHEMA_V1.md` → `DATABASE_SCHEMA_V2.md` (sincroniza nome e conteúdo)

### Changelog v6 → v7 (fundação operacional explícita + tenant-safety completa + contrato HTTP)
- **Tenant-safety completa:** `working_hours` e `availability_blocks` ganham FK composta tenant-safe
  (eram as duas tabelas operacionais ainda com FK simples ao profissional) — espelha o schema v3.
  Fecha de vez o risco nº 8 (seção 15) em todas as tabelas operacionais
- **Observabilidade vira item de implementação da Fase 1**, não nota futura: `request-id`/correlação,
  `/health`, `/ready`, error tracking e logs estruturados entram nos critérios de aceite da Fase 1 (seções 13/14)
- **`db.withTenantContext(orgId, userId, fn)` formalizado** como o **primeiro utilitário** do módulo `db`:
  abre transação, faz `SET LOCAL` dos GUCs e executa o callback. Repository não recebe conexão crua
  fora dele (sem isso a RLS nega tudo, ou algum caminho contorna a disciplina) — seção 6/10.3
- **Rate limit nasce como interface trocável** (`RateLimiter`), com impl em memória no MVP e ponto de
  injeção na rota pública desde já — troca por impl distribuída (Redis) sem mexer no controller (seção 10.7)
- **Provedor de e-mail transacional definido: Resend** — dependência da Fase 1 (verificação/reset) (seção 8)
- **Contrato HTTP extraído para `API_CONTRACTS_V1.md`:** envelope de erro único
  (`code`/`message`/`details`/`requestId`/`timestamp`), headers obrigatórios e fluxos — base do `packages/shared`
- **`chk_cancel_token_pair`** e **recuperação de idempotência `IN_PROGRESS`** incorporados ao schema v3
- **Decisões de topologia registradas (a confirmar):** migrations **forward-only + PITR** (em vez de `down`)
  e **rate limit single-instance** como restrição declarada, não default acidental (seção 14)

### Changelog v5 → v6 (integridade referencial, RLS de identidade e fundação de auth)
- **FKs compostas tenant-safe:** `appointments` e `professional_services` referenciam
  `(organization_id, id)` das tabelas-alvo — o banco recusa cruzamento de tenant (agendamento da
  empresa A com profissional da empresa B). Fecha a seção 15.5 por uma via que a RLS sozinha não cobre
- **RLS de `organizations` via função `SECURITY DEFINER`** (`app_is_member`) — remove dependência
  indireta entre policies; função `STABLE` + `search_path` fixo + `REVOKE PUBLIC` + owner `BYPASSRLS`
- **Optimistic locking:** `appointments.version` (compare-and-swap → `409` em edição concorrente);
  é também o marcador de versão consumido pelo evento de real-time (seção 11)
- **Outbox transacional:** `appointment_events` com controle de publicação (`published_at`) — evento
  de domínio não se perde se o processo cair entre commit e publicação WebSocket (seção 11)
- **Fundação de auth completa:** verificação de e-mail + reset de senha (`verification_tokens`,
  `users.email_verified_at`) entram no escopo (seção 2/12); `refresh_sessions` ganha `last_used_at`
- **CHECKs semânticos no banco** (`STAFF ⇔ actor_user_id`, `CANCELLED ⇔ cancelled_by_type`),
  unique parcial do token de cancelamento, `response_status_code` na idempotência,
  `ON DELETE RESTRICT` explícito, role `app_runtime` como pré-requisito de infra (detalhes no schema V2)

### Changelog v4 → v5 (hardening de segurança e operação)
- **Migrations SQL manuais obrigatórias** para DDL não coberto pelo Drizzle Kit
  (`btree_gist`, tipo `timerange`, `EXCLUDE`, RLS) — `drizzle generate` não basta (ver seção 8/9)
- **RLS no PostgreSQL** como defesa em profundidade do tenant, via `SET LOCAL`
  `app.current_organization_id`/`app.current_user_id` por transação (seção 10.3)
- **Sessões revogáveis:** access token curto (memória/`Bearer`) + refresh httpOnly rotativo
  + tabela `refresh_sessions` (hash, `family_id`, `revoked_at`, detecção de reuso) — seção 12
- **Real-time sem PII:** WebSocket autenticado no handshake; evento só de invalidação
  (`appointment.changed`), dados sensíveis recuperados via HTTP (seção 11)
- **CSRF** concentrado em `/auth/refresh` (mutações via `Bearer`); cookies `HttpOnly`/`Secure`/`SameSite`/`Path` (seção 12)
- **`audit_logs`** com escopo de segurança/acesso definido, separado de `appointment_events` (seção 9)
- **Idempotency-Key divergente → `409 Conflict`** + limpeza por `expires_at` (seção 10.6)
- **Slugs** com unique por escopo, colisão e palavras reservadas (seção 9)
- **LGPD:** anonimização de cliente (sem `DELETE` físico) preservando histórico (seção 13)
- **Observabilidade mínima:** request-id/correlação, `/health`, `/ready`, error tracking (seção 13)

### Changelog v3 → v4 (versão oficial)
- `working_hours`: + `CHECK (end_time > start_time)` (bloqueia 18:00–09:00, 10:00–10:00)
- `organization_id` em `working_hours` e `availability_blocks` (consistência com a regra da seção 10.3)
- `appointment_events`: formato mínimo definido (ver seção 9)

### Changelog v2 → v3 (ajustes finais)
- `no_overlap`: + `CHECK (ends_at > starts_at)` e bounds explícitos `'[)'`
- `working_hours`: múltiplas linhas/dia (pausa/almoço) + constraint anti-sobreposição (tipo `timerange` custom)
- `organization_users.status` (`ACTIVE` / `INVITED` / `DISABLED`)
- `clients.phone_normalized` (E.164) com unique por empresa
- `idempotency_keys.state` (`IN_PROGRESS` / `COMPLETED` / `FAILED`) + unique + lock transacional
- Real-time: WebSocket é **mecanismo de atualização, não fonte de verdade** (recuperação via HTTP)
- Nova seção 16: **gates mínimos de qualidade** (Definition of Done)

### Changelog v1 → v2
- `users` global (sem `org_id`); vínculo/papel em `organization_users`
- Constraint: `status IN ('SCHEDULED','CONFIRMED')` + `organization_id` no índice
- Timezone explícito (`timestamptz`, cálculo no fuso da empresa)
- `appointment_events` obrigatório, na mesma transação
- Idempotência em mutações críticas/públicas
- Token de cancelamento hasheado + expiração
- Eventos de domínio desacoplados; proteção da rota pública; authorization centralizada na Fase 1
- LGPD: logs mascaram telefone; permissão de ver telefone granular

---

## 1. Visão do produto

SaaS de agendamento online para salões e barbearias. Cada estabelecimento gerencia
sua própria agenda, com vários membros de equipe acessando a mesma empresa. O cliente
agenda por um link público (sem login), informando nome e telefone. O agendamento é
em tempo real: marcou, o horário sai da tela dos outros imediatamente, e o responsável
vê na hora — com nome e telefone do cliente para contato em caso de imprevisto.

Referências de mercado: AppBarber e Booksy. O MVP **não** nasce como marketplace —
nasce como um SaaS de agenda confiável. Marketplace e descoberta vêm depois.

---

## 2. Escopo do MVP (o que entra)

- Multi-tenant (isolamento por `organization_id`) desde o dia 1, **reforçado por RLS** no banco
- Autenticação da equipe (JWT) + **authorization centralizada** (guards/policies)
- **Verificação de e-mail (com reenvio) e reset de senha** (tokens hasheados, uso único) — fundação de auth de produto real
- **Sessões revogáveis** (refresh rotativo + store), para `DISABLED`/logout derrubarem acesso ativo
- **Rate limit nas superfícies pública E de auth** (ADR-009) — login/forgot sem limite é a porta mais barata
- Empresas (organizations)
- Usuários (globais) e vínculo com papel/status por empresa
- **Convite de equipe completo** (token por e-mail, com ou sem conta prévia; aceite cria o vínculo — ADR-019)
- Profissionais
- Serviços (com duração e preço)
- Jornada de trabalho (com pausas) + bloqueios datados
- Cálculo de disponibilidade no backend (respeitando timezone da empresa)
- Agendamentos com regra anti-conflito garantida no banco
- **Integridade tenant-safe no banco** (FKs compostas: profissional/serviço/cliente do mesmo tenant)
- **Optimistic locking** em agendamentos (edição concorrente da mesma linha → `409`, sem lost update)
- **Máquina de estados explícita** de agendamento (nasce `CONFIRMED`; terminais imutáveis — ADR-018)
- Idempotência nas mutações de agendamento
- Painel de agenda (visão diária e semanal) com nome + telefone do cliente
- Página pública de agendamento (link da empresa e do profissional) com proteção contra abuso
- Cliente agenda como visitante e pode **cancelar via token** (hasheado, expira no início do horário)
- Real-time: criar/cancelar/remarcar reflete na tela sem refresh
- Trilha de auditoria de agendamentos (appointment_events, obrigatória)
- LGPD básico (consentimento, telefone restrito, logs sem PII) — com rota de anonimização no contrato (API §20.5)
- Gates mínimos de qualidade (seção 16)

---

## 3. Fora do escopo do MVP

Adiar para fases futuras (não construir agora):

- Conta de cliente / login do cliente / remarcação pelo cliente
- App mobile completo (Expo) — web responsivo/PWA primeiro
- Pagamento online
- Marketplace e descoberta ("perto de você")
- Estoque, comissões, fidelidade, avaliações, lista de espera
- Relatórios financeiros avançados
- Notificações automáticas por WhatsApp (no MVP: confirmação visual + link manual)
- Visão mensal da agenda (dia/semana cobrem a operação)
- Multi-unidade (uma empresa = uma unidade no MVP)
- Aprovação de agendamento pelo dono (`SCHEDULED` → `CONFIRMED`) — enum já preparado (ADR-018)
- **Overrides e buffers por profissional em `professional_services`** (preço/duração próprios,
  `buffer_before/after`, `display_order`) — registrados como roadmap técnico (seção 10.2), sem coluna no
  MVP. **Atenção:** buffer **não** é aditivo trivial — muda a semântica de ocupação (ver 10.2).
- **Availability "qualquer profissional"** (org-level, agregando quem presta o serviço) — aditivo sobre
  o endpoint por profissional (seção 10.2; API §15)
- **Soft-hold / reserva temporária de slot** (ADR-025) — a corrida resolve no commit
  (`409 APPOINTMENT_CONFLICT` + refetch), sem segurar o horário enquanto o cliente preenche. Hold é
  aditivo futuro (estado fora do `no_overlap` ou tabela com TTL).
- **Client cards** (tags, flags/bloqueio, `client_notes`, clientes confiáveis) — evolução do módulo de
  clientes; `client_notes` já nasce sujeito ao scrub de texto livre (seção 13)

> O modelo de dados é desenhado para comportar esses itens de forma **aditiva**.

---

## 4. Personas, papéis e autorização

| Papel | O que pode fazer |
|---|---|
| OWNER | Gerencia tudo: empresa, equipe, serviços, agenda de todos |
| MANAGER | Gerencia agenda, profissionais e serviços (não mexe em faturamento/empresa) |
| PROFESSIONAL | Vê e gerencia **apenas a própria agenda** |
| Cliente (visitante) | Agenda pelo link público; cancela via token. Não loga no MVP |

**Authorization é estrutural desde a Fase 1.** Papéis começam simples (enum), mas a
verificação NÃO é `if (role === ...)` espalhado — nasce centralizada (guards + policies),
fácil de evoluir para RBAC granular. Permissão mal aplicada é risco crítico (seção 15).

**Permissão de ver telefone é granular:** PROFESSIONAL vê o telefone dos clientes da
**própria** agenda, não da dos outros.

---

## 5. Fluxos principais

### 5.1 Onboarding do responsável
1. Cria conta → cria empresa
2. Convida equipe (opcional — convite por e-mail, aceite cria o vínculo) e cadastra profissionais
3. Cadastra serviços (nome, duração, preço)
4. Define jornada de trabalho (com pausas) e bloqueios por profissional
5. Compartilha o link público

### 5.2 Cliente agendando (visitante)
1. Acessa `/barbearia/{slug}` ou `/barbeiro/{slug}`
2. Escolhe serviço → profissional (se necessário) → data → horário
3. Informa nome e telefone (com aviso de uso de dados — LGPD)
4. Confirma → horário some para outros imediatamente
5. Recebe um link com token de cancelamento (válido até o início do horário)

### 5.3 Cliente cancelando
- Acessa o link com token → cancela. A vaga volta a ficar livre automaticamente.
- Remarcação pelo cliente: **fora do MVP** (só a equipe remarca pelo painel).

### 5.4 Responsável operando
- Vê a agenda (dia/semana) em tempo real, com nome e telefone
- Marca, remarca, cancela e finaliza atendimento

---

## 6. Módulos (NestJS)

Cada módulo com controller, service, repository e DTOs isolados (disciplina enterprise).

- `auth` — login da equipe, JWT (web + mobile-ready), verificação/reset/reenvio, **aceite de convite**
- `authorization` — guards e policies centralizados
- `organizations` — o tenant
- `staff` — usuários, vínculos (organization_users) e **convites** (`invitations` — ADR-019)
- `professionals` — profissionais
- `services` — serviços e durações
- `clients` — gestão básica de clientes + anonimização LGPD (superfície no contrato; implementação na Fase 6)
- `scheduling` — jornada, pausas, bloqueios e **cálculo de disponibilidade** (o cérebro)
- `appointments` — mutação transacional + máquina de estados (ADR-018) + eventos + idempotência
- `public-booking` — rotas públicas, sem login, com proteção contra abuso (anti-abuso atrás de uma
  interface `RateLimiter` trocável: impl em memória no MVP, ponto de injeção pronto para Redis).
  Resolução de slug/token via resolvers `SECURITY DEFINER` (ADR-017)
- `realtime` — gateway WebSocket + publicação de eventos de domínio
- `maintenance` — jobs periódicos in-process (`@Cron`): limpeza de idempotência, sessões, tokens e
  convites expirados, sob **contexto de sistema** (ADR-017)
- `tenant guard` global — injeta e valida `organization_id` em toda query
- **`db` / migrations** — schema Drizzle (tabelas comuns) + migrations SQL manuais (DDL avançado + RLS).
  **Dois utilitários fundadores:** `withTenantContext(orgId, userId, fn)` — abre transação, faz `SET LOCAL`
  dos GUCs (`app.current_organization_id`/`app.current_user_id`) e executa o callback — e
  **`withSystemContext(fn)`** (GUC `app.is_system`, uso restrito a relay/jobs — ADR-017). Acesso ao banco
  fora desses wrappers é proibido (sem o contexto, a RLS nega tudo — seção 10.3)

---

## 7. Arquitetura / Monorepo

```
apps/
  web/        # Next.js (App Router): painel, landing, páginas públicas
  api/        # NestJS: API, auth, agenda, regras de negócio
  mobile/     # Expo (futuro)

packages/
  shared/     # tipos + schemas Zod + helpers (contrato único front/back/mobile)
  ui/         # design system (opcional no começo)
  config/     # eslint, tsconfig, prettier compartilhados
```

Monorepo com pnpm workspaces + Turborepo. O pacote `shared` faz o "TypeScript ponta a
ponta" valer a pena: o contrato é escrito uma vez e importado por web, api e mobile.

> **Topologia de deploy (ADR-012 — fechada):** a web é o entrypoint e serve `/api/*` como **proxy
> reverso** para o NestJS (same-origin). O Nest configura `trust proxy` para esse hop conhecido.

---

## 8. Stack (definida)

| Camada | Escolha | Motivo |
|---|---|---|
| Frontend | Next.js (App Router) | SSR/SEO para páginas públicas |
| Estado servidor | TanStack Query | cache + invalidação no real-time |
| Estado local | Zustand | leve, suficiente para UI |
| Estilo | Tailwind CSS + shadcn/ui | produtividade e consistência |
| Backend | NestJS | módulos, DI, padrões enterprise (≈ Spring em TS) |
| Banco | PostgreSQL | fonte única da verdade; datas em `timestamptz` |
| ORM | Drizzle | controle fino de SQL: constraints, índices, disponibilidade |
| Validação | Zod | schemas compartilhados front/back |
| Real-time | WebSocket (gateway Nest / Socket.IO) | push de mudanças |
| Auth | JWT — refresh httpOnly (web) + Bearer (mobile) | seguro na web, pronto pro app |
| Senha / tokens | argon2id (senha) / SHA-256 (tokens de alta entropia) | especificado no schema §1 |
| E-mail transacional | Resend (via `NotificationSender`) | verificação / reset / convites; a interface é **canal-agnóstica** (`NotificationSender`, não `EmailSender` — ADR-026), Resend é a 1ª impl; WhatsApp/SMS entram aditivos (público BR vive no WhatsApp) |
| Observabilidade | error tracking (ex.: Sentry) + logs estruturados + `request-id` | desde a Fase 1, não depois (seção 13) |
| Infra local | Docker Compose | ambiente reproduzível |
| Migrations | versionadas (Drizzle) + **SQL manual** | DDL avançado (EXCLUDE, RANGE, RLS, SECURITY DEFINER) que o Drizzle Kit não gera |

> **Sem Redis no MVP** — mas real-time não improvisado (seção 11). Redis entra na fase de
> múltiplas instâncias (pub/sub distribuído, cache, rate limit).

---

## 9. Modelo de dados

### Entidades

```
organizations        # tenant (id, name, slug, timezone, slot_interval_min)
users                # GLOBAL (id, name, email, password_hash, phone, email_verified_at) — sem org_id
refresh_sessions     # GLOBAL — sessões revogáveis (user_id, token_hash, family_id, last_used_at, revoked_at, expires_at)
verification_tokens  # GLOBAL — verificação de e-mail / reset de senha (user_id, purpose, token_hash, expires_at, used_at)
organization_users   # vínculo (user_id, org_id, role, status)  status: ACTIVE|INVITED|DISABLED (INVITED reservado — ADR-019)
invitations          # convite de equipe (org_id, email, role, token_hash, invited_by, expires_at, accepted_at) — ADR-019
professionals        # (id, org_id, user_id NULLABLE, name, slug, active) — UNIQUE (org_id, id) p/ FK tenant-safe
services             # (id, org_id, name, duration_min, price_cents, active) — UNIQUE (org_id, id)
professional_services# junção profissional ↔ serviço — FKs compostas tenant-safe
working_hours        # jornada recorrente (id, org_id, professional_id, weekday, start_time, end_time)
availability_blocks  # exceções datadas (id, org_id, professional_id, starts_at, ends_at, reason)
clients              # (id, org_id, name, phone, phone_normalized NULLABLE) — unique parcial (org_id, phone_normalized) WHERE NOT NULL + UNIQUE (org_id, id)
appointments         # CORAÇÃO (ver abaixo) — inclui version (optimistic lock) + FKs compostas tenant-safe
appointment_events   # trilha OBRIGATÓRIA + OUTBOX (published_at), mesma transação (eventos de DOMÍNIO)
idempotency_keys     # (id, org_id, key, route, request_hash, state, response, response_status_code, created_at, expires_at)
audit_logs           # eventos de SEGURANÇA/ACESSO (separado de appointment_events — ver abaixo)
```

> **DDL canônico** (colunas, tipos, índices, constraints, RLS) vive em `DATABASE_SCHEMA_V2.md`.
> Esta seção é o panorama; o schema é a fonte de verdade do banco.

> **`users` global**, sem `organization_id`; vínculo/papel/status em `organization_users`.
> **`professionals.user_id` opcional** (profissional sem acesso ao sistema).
> **Convite (ADR-019):** entidade própria (`invitations`) — o vínculo em `organization_users` é criado
> **no aceite**, já `ACTIVE`. `INVITED` fica reservado no enum; `DISABLED` segue bloqueando acesso
> sem apagar histórico.
> **`active` boolean** mantido em `professionals`/`services` (suficiente no MVP).

### clients — telefone normalizado

Salvar `phone_normalized` em formato canônico **E.164** (ex.: `+5511999999999`) quando presente, com
**unique parcial `(organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL`**. Evita que
`(11) 99999-9999`, `11999999999` e `+5511999999999` virem três clientes. O `phone` original pode ficar
para exibição. **`phone_normalized` é NULLABLE** (e o unique é parcial) para permitir anonimização da
LGPD sem colisão entre clientes "removidos" da mesma empresa (ADR-016, schema §7).

### appointments (a entidade central)

Campos: `id`, `organization_id`, `professional_id`, `service_id`, `client_id`,
`starts_at` (timestamptz), `ends_at` (timestamptz), `status`, `source`, `note`, `version`,
`public_cancel_token_hash`, `public_cancel_token_expires_at`, `cancelled_by_type`, timestamps.

- `source`: `PANEL` (equipe) ou `PUBLIC` (link público)
- `cancelled_by_type`: `STAFF`, `CLIENT` ou `SYSTEM`
- `version`: optimistic lock — UPDATE é compare-and-swap (`WHERE version = $esperado`); 0 linhas
  afetadas = edição concorrente → `409 Conflict`. Gerida pela aplicação (não por trigger)

> **Integridade tenant-safe:** `professional_id`/`service_id`/`client_id` entram por **FK composta**
> com `organization_id`, garantindo no banco que os três pertencem à mesma empresa do agendamento.

**Status (enum preparado, subset no MVP):** `SCHEDULED`, `CONFIRMED`, `CANCELLED`,
`COMPLETED`, `NO_SHOW`.

> **Máquina de estados (ADR-018):** todo agendamento **nasce `CONFIRMED`** no MVP (painel e público);
> `SCHEDULED` fica reservado para a fase futura de aprovação pelo dono. Transições válidas:
> `CONFIRMED → CANCELLED | COMPLETED | NO_SHOW`. **Estados terminais são imutáveis** — ação sobre eles
> → `409 INVALID_STATUS_TRANSITION`. A matriz vive como constante única no `shared` (o front desabilita
> botões pelo mesmo dado que o back valida).
>
> **Remarcação NÃO é status.** Atualiza `starts_at`/`ends_at` (continua CONFIRMED) +
> registra `RESCHEDULED` em `appointment_events`.

### Serviço combinado

Cada agendamento tem **um serviço**. Para "corte + barba", o dono cria um serviço-combo
("Corte + Barba — 50 min"). Multi-serviço de verdade vem depois, de forma aditiva.

### appointment_events — formato mínimo

Toda mutação de agendamento grava uma linha (na mesma transação — seção 10.1):

`id`, `organization_id`, `appointment_id`, `event_type`, `actor_type`,
`actor_user_id` (NULLABLE), `metadata` (JSONB), `created_at`.

- `event_type`: `CREATED`, `CANCELLED`, `RESCHEDULED`, `COMPLETED`, `NO_SHOW`
- `actor_type`: `STAFF`, `CLIENT`, `SYSTEM`
- `actor_user_id`: preenchido só quando `actor_type = STAFF` (visitante/sistema não têm usuário)
- `metadata` (JSONB): guarda antes/depois em remarcações, motivo do cancelamento, origem da ação —
  **só referências/instantes, nunca PII** (ADR-010)

> Sem esse formato a tabela existe, mas fica fraca para auditoria. Com ele, "quem
> cancelou, quando e por quê?" tem resposta exata.

### audit_logs — eventos de segurança/acesso (escopo distinto)

`appointment_events` = eventos de **domínio** da agenda. `audit_logs` = eventos de
**segurança/acesso**: `LOGIN_SUCCESS`/`LOGIN_FAILED`, `TOKEN_REFRESH`, `SESSION_REVOKED`,
`PASSWORD_CHANGED`, `ROLE_CHANGED`, `MEMBER_INVITED`/`MEMBER_DISABLED`, `PHONE_VIEWED`,
`AUTHZ_DENIED`, `CLIENT_ANONYMIZED`. Campos: `organization_id` (NULL para eventos globais como login),
`actor_user_id`, `action`, `target_type`/`target_id`, `metadata` (JSONB, **sem PII crua** —
telefone mascarado), `ip`, `created_at`. Separar os dois evita que um vire lixeira do outro.
O INSERT de eventos globais (sem GUC de tenant) é coberto pela policy `global_security_events`
(ADR-017, schema §10.5).

### slugs (org e profissional) — superfície pública

Como viram URL (`/barbearia/{slug}`, `/barbeiro/{slug}`): **unique por escopo** (slug de
profissional único por empresa; slug de empresa único global, case-insensitive), geração a
partir do nome com **tratamento de colisão** (`-2`, `-3`) e **lista de palavras reservadas**
(`admin`, `api`, `app`, `login`, `auth`, `public`, `static`, `assets`…).

---

## 10. Regras de negócio críticas

### 10.1 Anti-conflito (a regra mais importante)

Não depende do frontend. Backend valida **e** o PostgreSQL protege.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- intervalo válido: fim sempre depois do início (sem invertido/zerado)
ALTER TABLE appointments
  ADD CONSTRAINT chk_interval CHECK (ends_at > starts_at);

-- sem sobreposição de horário ativo para o mesmo profissional
ALTER TABLE appointments
  ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,                        -- defesa em profundidade (redundante c/ professional_id)
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&     -- início inclusivo, fim exclusivo
  )
  WHERE (status IN ('SCHEDULED', 'CONFIRMED'));      -- só status que OCUPAM agenda
```

`'[)'` é o padrão do Postgres — explicitar evita dúvida de borda: 10:00–10:30 e
10:30–11:00 **não** conflitam (encostam, não sobrepõem).

> **Migration:** `btree_gist`, o `CHECK` e o `EXCLUDE` acima vão em **SQL manual** (o Drizzle
> Kit não gera EXCLUDE). A constraint impede corrupção; a idempotência (10.6) impede corrida.

> **Gate de jornada (ADR-022) — o que o `no_overlap` NÃO cobre.** A constraint impede dois agendamentos
> no mesmo horário, mas **não** impede agendar **fora da jornada** (`working_hours`) ou dentro de um
> `availability_block` — isso é impossível de expressar como `EXCLUDE` (jornada é template recorrente +
> exceções datadas). Logo, o passo 2 do fluxo (validar disponibilidade) é um **gate obrigatório de
> service, testado**, não um detalhe: **público sempre rejeita** fora do expediente
> (`422 OUTSIDE_WORKING_HOURS` / `WITHIN_BLOCK`); **painel permite o encaixe** com `allowOutsideHours`
> explícito (a equipe tem autonomia — o agendamento nasce normal e o evento marca `outsideWorkingHours`,
> sem PII). Sem esse gate, um POST público na grade, no futuro, no horizonte, mas em horário fechado
> **passaria** (API §16/§17).

> **Sem soft-hold no MVP (ADR-025) — decisão explícita.** Não há reserva temporária de slot enquanto o
> cliente preenche os dados. A corrida resolve **no commit**: o availability é *advisory*, e quem perde
> recebe `409 APPOINTMENT_CONFLICT` e refaz o fetch (mitigado pelo real-time, que invalida antes do POST
> na maioria dos casos). Aceitamos o atrito de re-tentar em troca de não ter reservas-fantasma travando
> agenda. Hold é evolução aditiva (estado fora do `no_overlap` ou tabela com TTL no `maintenance`).

Fluxo transacional ao criar/remarcar (**tudo em uma transação**):
1. Abre transação
2. Valida disponibilidade (jornada, pausas, bloqueios, agendamentos existentes)
3. INSERT/UPDATE do agendamento
4. **Grava o evento em `appointment_events` na MESMA transação**
5. Concorrência: o primeiro commita; o segundo bate na constraint e recebe erro tratado
6. **Só após o commit** publica o evento de domínio (seção 11)

### 10.2 Jornada de trabalho e disponibilidade

`working_hours` é o **template semanal recorrente**. Pausa/almoço = **múltiplas linhas
no mesmo `weekday`** (ex.: seg 09:00–12:00 e seg 13:00–18:00 → 12:00–13:00 indisponível).
`availability_blocks` são **exceções datadas** (férias, um dia específico fechado).

O Postgres não tem range nativo de `TIME`, então criamos um tipo para garantir jornada
sem sobreposição com a mesma robustez do `no_overlap`:

```sql
CREATE TYPE timerange AS RANGE (subtype = time);

-- intervalo de jornada válido: fim sempre depois do início
ALTER TABLE working_hours
  ADD CONSTRAINT chk_shift_interval CHECK (end_time > start_time);

ALTER TABLE working_hours
  ADD CONSTRAINT no_shift_overlap
  EXCLUDE USING gist (
    professional_id WITH =,
    weekday WITH =,
    timerange(start_time, end_time, '[)') WITH &&
  );
```

Disponibilidade é **calculada no backend** (o frontend monta a UI, não decide):
`jornada − pausas/bloqueios/folgas − agendamentos`, fatiada pelo `slot_interval_min`
da empresa (configurável; padrão 30), considerando a duração do serviço.

> **Passo (`slot_interval_min`) ≠ duração do serviço (ADR-023).** São dois conceitos. A **duração** vem
> do serviço (corte 30, corte+barba 50); o **passo** é de quanto em quanto tempo um horário pode começar.
> Quando o dono configura **passo = duração**, a grade sai em **blocos limpos** (08:00–09:00, 09:00–10:00)
> — o modelo mais intuitivo. Passo **menor** que a duração oferece **mais pontos de início** (melhor
> ocupação) ao custo de possíveis buracos. Os dois são legítimos; por isso `slot_interval_min` **continua
> configurável por empresa** e não é fixado como "= duração" no código. Default amigável ao criar a empresa
> pode vir "passo = duração mais comum" (aditivo). Grade **por serviço** fica como futuro (junto dos
> buffers/overrides abaixo).

> **Âncora da grade (ADR-023) — coerência POST↔availability sob DST.** A grade é ancorada no **início da
> jornada do profissional naquele dia, no fuso da empresa**, computada uma vez e reusada pelo slicing do
> availability **e** pela validação de grade do POST (`alignToSlotGrid()` no `shared`). Sem âncora única,
> num dia de virada de DST o availability ofereceria um slot que o POST rejeitaria por "fora da grade".
> O gate de DST (seção 16) testa essa **coerência**, não só cada caminho isolado.

> **Availability org-level é aditivo (não no MVP).** O endpoint nasce **por profissional**. A feature
> "qualquer profissional" (cliente escolhe o serviço sem preferir profissional) será um endpoint que
> **agrega** os profissionais que prestam o serviço — aditivo sobre o atual. A resposta de slots não deve
> ser moldada de forma que dificulte essa agregação (API §15).

> **Buffers entre atendimentos — decisão de roadmap técnico (não no MVP).** Se `buffer_before_min`/
> `buffer_after_min` entrarem em `professional_services`, **o intervalo OCUPADO** (para conflito no
> `no_overlap` e para o cálculo de availability) passa a ser **`startsAt − bufferBefore … endsAt +
> bufferAfter`**, enquanto **o horário exibido ao cliente continua o real do serviço** (`startsAt …
> endsAt`). Isso **não é aditivo trivial** — toca a constraint de ocupação e o slicing —, por isso é
> registrado agora e fica fora do schema do MVP até haver demanda.

### 10.3 Multi-tenant

`organization_id` em toda tabela operacional. **O usuário logado nunca envia
`organization_id` livre/não-validado** — em rota autenticada vem do **claim `org`** do access token
(assinado, validado contra o vínculo na emissão — ADR-020), na rota pública do `slug`. Tenant guard
global garante o filtro em toda query, lendo o tenant ativo de um **ponto único** (`resolveActiveOrg`),
para que a evolução path-scoped futura não toque controllers.

**RLS como defesa em profundidade.** O tenant guard sozinho é frágil: um `WHERE` esquecido
em um repository novo vaza PII entre empresas. Por isso as tabelas operacionais têm **Row-Level
Security** ativada (`ENABLE` + `FORCE`), e o guard define o contexto por transação via
`set_config('app.current_organization_id', $1, true)` (e `app.current_user_id` quando há login —
parametrizado, não `SET LOCAL` interpolado). Sem contexto, a política nega tudo (default seguro). A app
conecta com role **sem `BYPASSRLS`**. **Sob pooling**, toda policy lê o GUC com `NULLIF(current_setting
(...), '')` antes do cast (um GUC placeholder reusado devolve `''`, não `NULL` — `''::uuid` lançaria
`22P02` e viraria `500` intermitente; A3, schema §10.1). O escopo fino de PROFESSIONAL (própria agenda) e
a máscara de telefone seguem no app; RLS protege a fronteira de tenant. Detalhe das políticas em
`DATABASE_SCHEMA_V2.md` (seção 10).

**Acessos fora do contexto de tenant (ADR-017).** Três fluxos legítimos operam antes de existir
contexto ou através de todos os tenants, e têm caminho **explícito e estreito** (nada contorna a
RLS implicitamente): resolução de slug público, lookup por hash de token (cancelamento/convite) —
via **resolvers `SECURITY DEFINER`** que devolvem só os IDs mínimos (schema §10.7) — e jobs
cross-tenant (relay/limpezas) via **contexto de sistema** (`withSystemContext`, GUC `app.is_system`
— schema §10.8).

### 10.4 Permissões

PROFESSIONAL só acessa a própria agenda. Verificação no backend, via guards/policies centralizados.

### 10.5 Timezone (regra crítica)

- `starts_at`/`ends_at` sempre em **`timestamptz`**
- Disponibilidade calculada respeitando o `timezone` da **empresa**
- **Nunca** confiar em data/hora "solta" do frontend — o backend resolve o instante
  absoluto a partir do fuso da empresa
- Divergência entre browser/servidor/fuso gera bug difícil de rastrear
- `organizations.timezone` é **validado contra a lista IANA na borda** (um fuso inválido quebraria
  todo o cálculo de disponibilidade)

### 10.6 Idempotência

Criar, remarcar e cancelar exigem `Idempotency-Key` (obrigatório nas rotas **públicas e do painel** —
ADR-008 v3; o cliente HTTP do `shared` injeta por padrão, então tornar obrigatório no painel custa zero
e elimina o duplo-clique da recepcionista — o cenário mais provável de duplicação).

- `idempotency_keys` tem **unique `(organization_id, key, route)`**
- Campo `state`: `IN_PROGRESS` → `COMPLETED` / `FAILED`
- Padrão: ao receber a chave, `INSERT` `IN_PROGRESS` (o unique impede corrida); se já existe
  `IN_PROGRESS`, a 2ª requisição responde **`409 IDEMPOTENCY_IN_PROGRESS` na hora**, com
  `Retry-After` — **não bloqueia** esperando a 1ª terminar (ADR-008; esgotaria o pool sob retry storm)
- **Órfão:** `IN_PROGRESS` com mais de **60s** (`created_at`) é considerado abandonado; o takeover é
  **compare-and-swap atômico** — só a retry que afetou 1 linha executa (ADR-008)
- **Replay fiel:** mesma chave + mesmo `request_hash` → devolve o mesmo body **e o mesmo
  `response_status_code`** da 1ª execução
- **Payload divergente:** mesma chave + `request_hash` **diferente** → **`409 Conflict`**
  (reuso indevido), nunca devolve a resposta de outro payload.
- **Limpeza:** job periódico remove chaves por `expires_at` (módulo `maintenance`, sob contexto de
  sistema — rede de segurança, não o mecanismo de recuperação de órfão).

> A constraint impede **corrupção**; a idempotência (com `state`) impede **corrida**
> entre requisições simultâneas com a mesma chave e melhora a experiência (clique duplo,
> reenvio, rede oscilando).

### 10.7 Proteção das rotas públicas E de auth (anti-abuso)

Link público é superfície aberta — e **a superfície de auth também** (login/forgot sem limite é
credential stuffing e flooding de e-mail baratos). Desde o início (mesmo sem Redis): rate limit
local, validação forte de telefone, limitação por IP/telefone/e-mail, antifraude básico. Captcha
adaptativo fica como evolução.

**Limites concretos (ADR-009 / `API_CONTRACTS.md` §19):** versionados no contrato HTTP (ex.: 60 GET/min
por IP em leitura pública; 10 POST/min por IP e 5 agendamentos/hora por telefone no booking; 20/min no
cancel; **10 login/min por IP + 5/min por e-mail; 3 forgot/hora por e-mail**). Estouro →
`429 RATE_LIMITED` + `Retry-After`. São defaults declarados (revisáveis com tráfego real), não escolhas
soltas no controller. O `RateLimiter` é interface trocável (impl memória no MVP single-instance; Redis
na escala — ADR-006), e **nasce na Fase 1** (a auth o exige), não na Fase 4.

**Validações da rota pública (API §17):** `startsAt` no futuro (no fuso da empresa); **antecedência
mínima de 15 min** (`min_schedule_notice_min` — ADR-024: sem ela o visitante marca para "daqui a 2 min");
**horizonte máximo de 90 dias** (sem teto, um visitante polui a agenda de anos à frente — o rate limit não
impede acúmulo); alinhamento à grade (âncora = início da jornada, §10.2); **dentro da jornada e fora de
bloqueios** (gate de jornada — ADR-022, §10.1); token de cancelamento expira **no início do horário**
(`= startsAt`).

> **Força real do anti-abuso (ADR-024) — nota para o contexto BR.** O limite **por telefone** (5/hora) é
> fraco: o telefone é fornecido pelo cliente e **não tem posse provada no MVP** (sem OTP), então trocá-lo
> contorna o limite. A defesa real é o **limite por IP** — mas no Brasil o tráfego móvel passa
> massivamente por **CGNAT** (muitos assinantes por IP), então 10/min por IP não barra atacante com
> proxies e pode **punir clientes legítimos**. Consequência de design: não assumir, em features futuras
> (lembretes, anti-no-show por telefone), uma confiabilidade do telefone que ele não tem até existir OTP.
> Se o abuso aparecer antes do captcha adaptativo, o controle proporcional é **turnstile/captcha invisível
> no POST público**, não apertar o limite por IP.

**IP real (ADR-012):** o rate limit por IP pressupõe `trust proxy` no hop conhecido e fetch público
client-side — sem isso ele é contornável (spoof de `X-Forwarded-For`) ou auto-throttling (todos os
visitantes com o IP do proxy).

---

## 11. Real-time (eventos de domínio desacoplados)

A regra de negócio **não** conhece o transporte. O `AppointmentsService`:
1. grava no banco + evento transacional em `appointment_events` (seção 10.1)
2. **após o commit**, publica um evento de domínio (`appointment.created`, etc.)

> **Outbox transacional (não perder evento).** Se o processo cair entre o commit e o publish, o
> evento se perderia. Como `appointment_events` é gravado na mesma transação, ele funciona como
> outbox: tem `published_at` (NULL = pendente) e um relay publica os pendentes e marca como
> publicado. A publicação in-process é o caminho rápido; o relay é a rede de segurança (at-least-once).
> O `version`/`occurredAt` do payload de invalidação vem da coluna real `appointments.version`.
> O relay lê os pendentes com **`FOR UPDATE SKIP LOCKED`** (ADR-014) e roda **cross-tenant sob o
> contexto de sistema** (`withSystemContext` — ADR-017; sem ele, a RLS o faria ler zero linhas).

Hoje a publicação é in-process (EventEmitter do Nest). Amanhã pode virar Redis Pub/Sub,
BullMQ ou Kafka **sem reescrever regra de negócio** — só troca o publisher.

> **Topologia (ADR-006):** a publicação in-process **só entrega entre instâncias** se houver pub/sub
> distribuído. Com duas instâncias (inclusive no overlap de um deploy), um socket conectado na instância
> A **não** receberia o evento publicado na B. Por isso o MVP é **single-instance declarado** e o deploy
> é com drain/janela enquanto for assim; multi-instância exige Redis (fase de escala, não MVP).

> **Dead-letter do relay (ADR-014).** O relay publica os pendentes do outbox com backoff. Atingido o teto
> de tentativas, o evento sai dos pendentes (`publish_failed_at`) e **alerta** — não fica varrendo o
> índice para sempre. Como o socket não é fonte de verdade, isso não corrompe estado: o front recupera
> via HTTP; o alerta existe para investigar a causa.

O gateway WebSocket consome o evento e empurra para os conectados da empresa/profissional
(rooms por `organization_id`/`professional_id`); a disponibilidade pública do dia é
invalidada; no frontend, TanStack Query atualiza a agenda.

> **Handshake autenticado + evento sem PII.** O socket valida o JWT no connect e confere o
> vínculo com a empresa **antes** de entrar na room (senão alguém assina a agenda de outro
> tenant). O payload empurrado é só **invalidação** — `appointment.changed` com
> `professionalId`, `date`, `version`/`occurredAt`; **nada de nome/telefone**. O front recebe
> e refaz o fetch via HTTP, **onde a autorização granular e a máscara de telefone já valem**.
> Isso fecha o risco de LGPD e mantém o socket simples.

> **Ciclo de vida sob revogação (C3 — gancho na Fase 5).** O handshake valida no connect, mas a conexão
> **sobrevive** ao access curto e à revogação: um membro `DISABLED` continuaria na room recebendo
> invalidações. O payload sem PII limita o dano, mas o risco nº 6 ("`DISABLED` derruba acesso") fica
> furado nesse canal. Ao revogar sessões/`DISABLED`, o backend **emite um kick** para os sockets do
> usuário (identificados pelo `sid` do access — ADR-020) ou, no mínimo, revalida o vínculo a cada N
> minutos e desconecta. **Spec agora; implementação na Fase 5** (o gateway nasce com o gancho).

> **WebSocket é mecanismo de atualização, não fonte de verdade.** Ao reconectar (perda de
> conexão, fechar o notebook, trocar de rede), o frontend **sempre** recupera o estado via
> HTTP (refetch). Isso evita inconsistência quando o socket cai.

---

## 12. Autenticação (web + pronta para mobile)

- JWT com **access token curto** (5–15 min) + **refresh token** rotativo
- **Claims do access (ADR-020):** `sub` (user), `org?` (empresa ativa), `sid` (família da sessão), `exp`
- **Web:** access token **em memória** (enviado como `Bearer`); refresh em cookie `httpOnly`
  + `Secure` + `SameSite=Strict` + `Path=/api/v1/auth/refresh` (proteção contra XSS; ADR-012)
- **Mobile (futuro):** access em memória + refresh em secure storage, ambos como `Bearer`
- Auth suporta os dois modos desde o início — evita retrabalho na fase do app Expo
- Cliente visitante **não** autentica

**Tenant ativo para usuário multi-empresa (ADR-020).** O modelo permite vínculo em N empresas; as rotas
operacionais **não** recebem `organization_id` do cliente. O tenant ativo vem do **claim `org`** do
access (assinado, validado contra o vínculo na emissão):
- **Login com 1 vínculo** → access já com `org`. **Login com >1 vínculos** → access **sem** `org`
  (estado "sem empresa ativa"): o cliente só alcança `/auth/me`, `/organizations/me`, `/auth/switch-org`
  e `/auth/logout`; qualquer rota tenant-scoped → **`403 NO_ACTIVE_ORG`**.
- **`POST /auth/switch-org`** valida o vínculo `ACTIVE` e **reemite o access com o novo `org`, sem
  rotacionar o refresh** (trocar de empresa é troca de contexto, não de sessão). **Não há auto-seleção de
  "última empresa" no backend** — a emissão depende de escolha explícita; o front pode exibir um hint
  visual, mas não decide o tenant pelo token. Evita operar na empresa errada e preserva "cliente não
  envia org livre".
- **Evolução multi-org simultâneo:** path-scoped (`/organizations/:orgId/...`) é aditivo; o guard resolve
  o tenant de um ponto único (`resolveActiveOrg`), então trocar a fonte (claim → path) não toca
  controllers.

**Sessões revogáveis (`refresh_sessions`).** JWT puro é stateless e não revoga; mas o modelo
exige derrubar acesso ativo (logout, `DISABLED`, troca de senha). Por isso o refresh é rastreado:

- Cada refresh **rotaciona** (emite novo token, revoga o anterior, encadeia por `family_id`)
- **Detecção de reuso:** refresh já revogado reapresentado → **revoga a família inteira** (token roubado)
- **Escopo de revogação (ADR-004, emenda v3):** `logout` revoga **só a família da sessão apresentada**,
  lendo o **`sid`** do access (**Bearer-only** — o `Path` estreito do cookie impede o cookie de chegar ao
  `/auth/logout`, então não dá para identificar a família por ele). `POST /auth/password/change`
  (autenticado) troca o hash e revoga **todas as famílias exceto a atual** (a do `sid`). **`DISABLED`/
  reset de senha** → revogação **total**; com access curto, o acesso cai em minutos. "Sair de todos os
  dispositivos" (`/auth/logout-all`) é evolução futura, aditiva
- O banco guarda só o **hash** do refresh (cru só no cookie); `last_used_at` registra cada refresh
  (auditoria e detecção de comportamento estranho), com índice parcial de sessão ativa

**Verificação de e-mail e reset de senha (`verification_tokens`).** Fundação de auth de produto real:
sem reset, o suporte vira manual desde o 1º usuário. Token **hasheado** (cru só no link do e-mail),
com `purpose` (`EMAIL_VERIFY`/`PASSWORD_RESET`), expiração e uso único (`used_at`). `users.email_verified_at`
marca a conta confirmada. Reset de senha revoga todas as sessões ativas do usuário (seção acima).
**Reenvio de verificação** (`POST /auth/verify-email/resend`, rate-limitado) evita usuário preso com
token expirado. **Consequência de não verificado (API §8.1):** login permitido; **convidar membros
exige e-mail verificado** (envio em nome da empresa) → `403 EMAIL_NOT_VERIFIED`.

**Convite de equipe (ADR-019).** Convite é entidade própria (`invitations`): token hasheado por e-mail,
uso único, expira; o aceite (`POST /auth/accept-invite`) cria o vínculo `ACTIVE` — cobre convidado com
conta (loga e aceita) e sem conta (registro pelo mesmo token, e-mail verificado por construção).

**CSRF.** Como as mutações vão por `Authorization: Bearer` (token em memória), a superfície de
CSRF concentra-se na rota de cookie automático **`/auth/refresh`**. Como o cookie é `SameSite=Strict`
(um POST cross-site nem o carrega), a proteção é **defesa em profundidade sem estado**: a `/auth/refresh`
exige o header custom fixo **`X-CSRF: 1`** (que `<form>` HTML não envia; ausência → `403`).
**Double-submit descartado** (ADR-012 v3). Cookies sempre com as flags acima.

**Hardening de plataforma (ADR-021).** Camada de segurança operacional, fechada antes do código:
verificação de **JWT com lista branca de algoritmo** (rejeita `alg:none`/confusão) + `iss`/`aud`; MVP
HS256 simétrico, `kid`/RS256 aditivo; **segredos** (JWT/cookie/Resend/DB) por injeção de ambiente, nunca
no repo (scan de segredo no CI); **cabeçalhos Helmet** (CSP/HSTS/nosniff/`frame-ancestors`); **limites de
requisição** (body/timeout/page size) somados ao rate limit; **`audit_logs` append-only** e
least-privilege no banco (§13/schema §10.9); **scrub de segredos no log** (além de PII). Mutações
sensíveis revalidam o vínculo `ACTIVE` no servidor. **MFA/2FA de staff (sobretudo OWNER) fica como
futuro** — registrado, fora do MVP.

**Domínio web↔api (ADR-012 — FECHADA: Opção A).** **Same-origin via proxy reverso**: a web serve
`/api/*` para o NestJS → cookie same-site puro (`SameSite=Strict`), CSRF só na `/auth/refresh`, **sem
CORS**. O Nest configura `trust proxy` para o hop conhecido e o `X-Forwarded-For` só é aceito dele
(anti-spoofing — pré-requisito do rate limit por IP). Fetch das páginas públicas é client-side (o IP
que chega ao limite é o do visitante). O `Path` estreito do cookie amarra a `/api/v1`; um bump de
versão reemite o cookie no próximo login/refresh (evento planejado). Mobile não usa cookie (refresh
como `Bearer` em secure storage), então isto vale só para a web.

**Token de cancelamento público:**
- O link contém o token; o banco guarda só o **hash** (`public_cancel_token_hash`)
- **Expira no início do horário** (`= starts_at`) e tem escopo (vale só para aquele agendamento);
  **uso único** (invalida ao cancelar)
- Tratar como credencial — dá poder operacional sobre o agendamento. Por isso a **API** o recebe no
  **body** (`POST /public/cancel`), não no path — path aparece em access log igual a query string
  (API §18)

---

## 13. LGPD e observabilidade

- Formulário público informa o uso de nome e telefone (consentimento)
- No painel, só usuários autorizados veem o telefone (permissão granular — seção 4)
- **Logs estruturados mascaram telefone por padrão**: log operacional não expõe PII;
  auditoria guarda referência ao cliente/agendamento, não o número cru
- **Direito ao esquecimento:** exclusão de cliente **anonimiza** (`name` neutro, `phone`/`phone_normalized`
  → `NULL`), nunca `DELETE` físico — preserva integridade com `appointments` e o histórico. Por isso
  `clients.phone_normalized` é NULLABLE com unique parcial (ADR-016, schema §7). O `metadata` de
  eventos/logs carrega só referências, nunca PII (ADR-010) — mas **`appointments.note` é texto livre** e
  pode conter PII, então a anonimização **também zera o `note`** dos agendamentos do cliente (ADR-016 v3,
  schema §7). **Princípio geral: todo campo de texto livre capaz de conter PII entra no scrub de
  anonimização** — vale para `note` hoje e para campos futuros (ex.: `client_notes`). **A rota existe no
  contrato** (`POST /clients/:id/anonymize` — API §20.5); implementação na Fase 6
- **Lacuna documentada — esquecimento de `users`/staff:** o direito ao esquecimento de membros da equipe
  (`users` tem nome/e-mail/telefone) **não** tem caminho no MVP. Encerramento/anonimização de conta de
  staff fica para a fase de retenção (abaixo), registrado para não passar por resolvido
- Prever política de retenção/exclusão de dados, **incluindo o caminho de `users`** (fase futura, planejada)

**Observabilidade mínima (desde a fundação):** `request-id`/correlação propagado por toda a
requisição (inclusive no evento de domínio e no socket), endpoints `/health` e `/ready`,
error tracking (ex.: Sentry) e logs estruturados. Barato agora, doloroso de instrumentar depois.

**Decisões operacionais de infra (FECHADAS — `ARCHITECTURE_DECISIONS.md`):**
- **Migrations forward-only + PITR (ADR-007):** sem `down` destrutivo. Mudança incompatível usa
  expand/contract (deploy em duas fases). Recuperação de desastre por point-in-time recovery do provedor.
- **Topologia single-instance declarada no MVP (ADR-006):** rate limit em memória e publicação real-time
  in-process (EventEmitter) só funcionam com uma instância. Enquanto single-instance, **deploy é com
  drain/janela**, não zero-downtime com duas instâncias simultâneas. `RateLimiter` e publisher nascem como
  interfaces trocáveis (seção 6/10.7, §11); Redis (pub/sub + rate limit distribuído) entra só na fase de
  escala — não no MVP.
- **Same-origin via proxy reverso (ADR-012 — FECHADA):** a web serve `/api/*` para o NestJS — zera
  CORS/cookie/CSRF cross-site e combina com single-instance. Inclui `trust proxy` no hop conhecido +
  `X-Forwarded-For` só dele (rate limit por IP funcional). Alternativa (eTLD+1 + `Domain` + `SameSite=Lax`)
  registrada no ADR caso a infra futura exija hosts separados.
- **Acessos fora do contexto de tenant (ADR-017):** resolvers `SECURITY DEFINER` (slug, cancel-hash,
  invite-hash) + contexto de sistema para relay/limpezas + policy global de `audit_logs` — nada contorna
  a RLS implicitamente.
- **Backup/PITR** habilitado no provedor como pré-requisito de produção (não é item de schema).

---

## 14. Roadmap (fases com critérios de aceite)

> **Pré-requisito estrutural** (fechar antes de codar): modelo de dados, authorization
> centralizada, constraints anti-conflito, timezone/`timestamptz`, eventos transacionais.
> **Endurecimento operacional** (desenhado agora, construído na fase): captcha, antifraude —
> basta a rota pública nascer com o ponto de injeção. **Rate limit nasce na Fase 1** (auth o exige).

**Fase 1 — Fundação, autenticação e autorização.** Monorepo, Docker, PostgreSQL, API
NestJS, Next.js, migrations (Drizzle + SQL manual, **incluindo resolvers e policies do ADR-017, com
leitura de GUC blindada — A3**), `db.withTenantContext` (via `set_config` parametrizado) +
`db.withSystemContext`, auth (access/refresh rotativo com **claims `org`/`sid` + `switch-org` +
`password/change` — ADR-020/004**, **CSRF `X-CSRF: 1`**, verificação/reset/reenvio via Resend, **rate
limit de auth** — ADR-009), usuários, empresas, vínculos, **convites com aceite** (ADR-019),
guards/policies (**guard de tenant via `resolveActiveOrg`; invariante do último OWNER**), **jobs de
manutenção** (`@Cron`). **Fundação operacional desde já:** `/health`, `/ready`, `request-id`/correlação,
error tracking, logs estruturados, **filtro global de erro** no envelope padrão (`API_CONTRACTS.md`) e
auditoria mínima (`LOGIN_*`/`AUTHZ_DENIED`).
*Aceite:* usuário cria conta/empresa, entra no painel; usuário com 2 empresas escolhe a ativa via
`switch-org` (sem `org` no token → `403 NO_ACTIVE_ORG`); papel sem permissão é barrado pelo guard;
query sem contexto de tenant é negada pela RLS; sessão revogada (logout via `sid`/`DISABLED`) derruba
acesso; rebaixar o único OWNER recebe `409 LAST_OWNER`; convite aceito cria vínculo (com e sem conta
prévia); login estourando o limite recebe `429`; erro de API sai no envelope padrão com `requestId`.

**Fase 2 — Cadastro operacional.** Profissionais, serviços, jornadas (com pausas), bloqueios.
*Aceite:* responsável monta uma barbearia real com 2 profissionais, serviços e horários diferentes.

**Fase 3 — Agenda e anti-conflito.** Agendamento pelo painel/backend, disponibilidade,
proteção no banco, **máquina de estados (ADR-018)**, eventos transacionais, idempotência.
*Aceite:* duas tentativas simultâneas no mesmo horário não duplicam; retry com mesma chave não duplica;
ação sobre estado terminal recebe `409 INVALID_STATUS_TRANSITION`.

**Fase 4 — Página pública.** Link da empresa/profissional, fluxo de agendamento, token de
cancelamento hasheado (cancelamento com token no **body**), anti-abuso (limites públicos no
`RateLimiter` já existente). É a vitrine: nasce com **acessibilidade** (navegação por teclado, foco
visível, WCAG básico) e **estados explícitos de loading/erro/vazio** no fluxo de agendamento (o
real-time invalida e refaz fetch).
*Aceite:* cliente agenda sem login, recebe link de cancelamento válido, responsável vê no painel;
fluxo navegável só por teclado; rate limit acionando responde no envelope padrão; agendamento no
passado ou além do horizonte é rejeitado.

**Fase 5 — Real-time.** Eventos de domínio + gateway WebSocket + relay (contexto de sistema) +
recuperação via HTTP + **kick de socket sob revogação/`DISABLED`** (via `sid` — seção 11).
*Aceite:* duas telas refletem a mudança sem refresh; ao reconectar, o estado se recompõe; membro
`DISABLED` é desconectado do socket (não recebe mais invalidações).

**Fase 6 — Notificações e operação.** Confirmação visual, mensagens básicas, link manual
de WhatsApp, histórico, filtros, **gestão de clientes (busca/edição) + anonimização LGPD** (API §20.5).
*Aceite:* responsável opera a agenda no dia a dia; anonimização zera PII preservando histórico.

---

## 15. Riscos técnicos (regra estrutural, não ajuste visual)

1. **Agendamento duplicado** → constraint `no_overlap` + `chk_interval` + transação + idempotência
2. **Disponibilidade errada** → lógica de slots no backend (com timezone e pausas), com testes
3. **Permissão mal aplicada** → guards/policies centralizados, verificação de tenant e papel
4. **Abuso da rota pública E de auth** → rate limit (ambas as superfícies), validação de telefone, antifraude
5. **Vazamento entre tenants** (WHERE esquecido, PII no socket) → RLS no banco + evento sem PII
6. **Acesso não revogável** (`DISABLED` que não derruba sessão) → access curto + refresh rotativo + `revoked_at`; **no socket, kick por `sid` sob revogação/`DISABLED`** (seção 11)
7. **Lost update** (dois membros editando o mesmo agendamento) → `version` + compare-and-swap → `409`
8. **Inconsistência entre tabelas filhas** (org de A + profissional de B) → FKs compostas tenant-safe no banco
9. **Fluxo sem caminho sob RLS** (lookup público / job cross-tenant lendo zero linhas) → resolvers
   `SECURITY DEFINER` + contexto de sistema (ADR-017), com gate de teste dedicado
10. **Operar no tenant errado** (usuário multi-empresa) → tenant ativo só via claim `org` assinado, sem
    auto-seleção; `403 NO_ACTIVE_ORG` força escolha explícita via `switch-org` (ADR-020)
11. **Empresa órfã** (rebaixar/`DISABLED` o único OWNER) → invariante de service `409 LAST_OWNER`
12. **`500` intermitente de RLS sob pooling** (GUC placeholder devolvendo `''`) → leitura blindada com
    `NULLIF`/`COALESCE` em toda policy (A3, schema §10)
13. **PII em texto livre** (`appointments.note`, `client_notes` futuro) → scrub no esquecimento, como
    princípio geral (seção 13)

---

## 16. Gates mínimos de qualidade (Definition of Done)

Nenhuma entrega é "pronta" sem:

- [ ] Migrations aplicam do zero (sequência **completa**: Drizzle + SQL manual), em banco limpo
- [ ] Testes de service/repository para a regra anti-conflito
- [ ] Teste de **concorrência**: duas reservas simultâneas no mesmo slot → uma falha
- [ ] Teste de **timezone**: agendamento e disponibilidade corretos no fuso da empresa
- [ ] Teste de **transição de DST**: disponibilidade e slots num **dia de virada de relógio**, usando um
      fuso com DST ativo (ex.: `America/Santiago`) — cobre horário local inexistente/ambíguo e jornada que
      "encolhe/estica" uma hora. **Inclui coerência POST↔availability (ADR-023):** todo slot emitido pelo
      availability passa na validação de grade do POST no dia de virada (a âncora é a mesma — início da
      jornada do dia). (Fixture no PR-3.1; o BR aboliu o DST, mas `organizations.timezone` aceita
      qualquer IANA.)
- [ ] Teste de **gate de jornada (ADR-022)**: POST/remarcação fora da jornada ou dentro de bloqueio →
      **público** sempre `422 OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`; **painel** rejeita sem
      `allowOutsideHours` e **aceita** com `allowOutsideHours: true` (evento marca `outsideWorkingHours`)
- [ ] Teste de **autorização**: PROFESSIONAL tentando acessar agenda alheia → bloqueado
- [ ] Teste de **isolamento RLS**: query sem contexto / com outro tenant → nega linhas
- [ ] Teste de **acesso fora de contexto (ADR-017)**: resolvers (slug/cancel-hash/invite-hash) resolvem
      sem contexto; acesso **direto** às tabelas sem contexto continua negado; relay/limpeza só leem
      cross-tenant sob `withSystemContext`
- [ ] Teste de **sessão**: `DISABLED`/troca de senha revoga tudo; **logout revoga só a família
      apresentada** (outra sessão segue válida); reuso de token revogado mata a família
- [ ] Teste de **convite (ADR-019)**: aceite cria vínculo `ACTIVE` (com e sem conta prévia);
      token expirado/usado → `410`
- [ ] Teste de **idempotência**: retry com a mesma `Idempotency-Key` não duplica; payload divergente → `409`;
      replay devolve o **mesmo HTTP status** da 1ª execução; takeover de órfão é exclusivo (CAS)
- [ ] Teste de **lost update**: edição concorrente do mesmo agendamento com `version` antiga → `409`
- [ ] Teste de **máquina de estados (ADR-018)**: ação sobre estado terminal / fora da matriz →
      `409 INVALID_STATUS_TRANSITION`
- [ ] Teste de **integridade tenant-safe**: agendamento com profissional/serviço/cliente de outra empresa → rejeitado pelo banco
- [ ] Teste de **conflito de corrida (advisory)**: `GET /availability` mostra slot livre, dois `POST` concorrentes no mesmo slot → um recebe `409 APPOINTMENT_CONFLICT` e o front refaz o fetch (ADR-013)
- [ ] Teste básico da **rota pública** com rate limit acionando — e de **auth** (login estourando limite → `429`)
- [ ] Teste das **validações públicas**: `startsAt` no passado ou além do horizonte → `422`
- [ ] **Segurança de plataforma (ADR-021):** JWT rejeita `alg:none`/alg fora da lista branca e valida
      `iss`/`aud`; cabeçalhos do Helmet presentes (CSP/HSTS/nosniff); body acima do limite → `413`;
      **`audit_logs` é append-only** (tentativa de `UPDATE`/`DELETE` pela role da app falha); `pnpm audit`
      sem vulnerabilidade alta/crítica no CI; nenhum segredo/token/cookie em log
- [ ] **Mutação sensível revalida vínculo:** membro `DISABLED` com access ainda válido **não** consegue
      gerir membros / anonimizar / trocar papel (revalidação server-side — ADR-021)

---

## 17. Próximos passos

1. ~~Revisão final → tornar oficial~~ ✅ **v6 oficial** (hardening + integridade tenant-safe incorporados)
2. ~~DDL completo das tabelas (colunas, tipos, índices, constraints)~~ ✅ **`DATABASE_SCHEMA_V2.md`** (v5)
3. ~~Contrato da superfície HTTP (envelope de erro, headers, fluxos)~~ ✅ **`API_CONTRACTS.md`** (unificado, sync v3)
4. ~~Confirmar as decisões recomendadas marcadas~~ ✅ **TODAS fechadas em `ARCHITECTURE_DECISIONS.md` (v3)**
   — ADR-001 a ADR-020, incluindo o ADR-012 (same-origin via proxy, Opção A) e o ADR-020 (tenant ativo).
   **Nenhuma pendência.**
5. Seguir o **`IMPLEMENTATION_ROADMAP.md` (v3)** a partir do **PR-0.1** (monorepo + tooling), com o gate de
   migration "aplica do zero" no PR-0.2.
6. Gerar os arquivos de migration (0001–0006, incluindo resolvers e policies do ADR-017) + schema
   Drizzle das tabelas comuns, na ordem do schema §12.
7. Iniciar a Fase 1 (fundação, auth com sessões revogáveis + verificação/reset/reenvio + rate limit,
   convites com aceite, RLS + `withTenantContext`/`withSystemContext`, guards/policies, observabilidade,
   filtro global de erro, jobs de manutenção).
