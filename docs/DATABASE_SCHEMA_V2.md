# DATABASE_SCHEMA_V2 — MVP de Agendamento (Salões e Barbearias)

> Esquema de banco do projeto. Fonte de verdade do **SQL**; o Drizzle cobre as tabelas comuns.
> Status: **v5 — rev. (segurança)** — sobre a v4: blinda a leitura dos GUCs sob pooling (`NULLIF`/`COALESCE`,
> §10) e parametriza `withTenantContext` (`set_config`); adiciona unique parcial de `professionals
> (org, user_id)` (§6.1); remarcação atualiza a expiração do cancel token (§8.1); anonimização LGPD
> também limpa `appointments.note` (§7); fixa o predicado do `ON CONFLICT` no upsert de cliente (§7).
> Mantém o que a v4 fechou: acessos fora do contexto de tenant sob `FORCE RLS` (resolvers `SECURITY
> DEFINER` + contexto de sistema — **ADR-017**), tabela `invitations` (**ADR-019**), policy de INSERT
> global do `audit_logs`, algoritmos de hash (§1), relay (`SKIP LOCKED`, ADR-014) e takeover de
> idempotência (CAS, ADR-008).
> Par de: `PLANNING.md` (v11), `API_CONTRACTS.md` (sync v4), `ARCHITECTURE_DECISIONS.md` (v4), `IMPLEMENTATION_ROADMAP.md` (v4).
> **Sync v4 (continuidade):** nota do **gate de jornada (ADR-022)** no §8.1 — o `no_overlap` não cobre
> jornada/bloqueios; é validação de service. Sem mudança de DDL (a regra não vira constraint).
> Banco: **PostgreSQL** (recomendado 15+; notas de 18+ marcadas onde aplicável).

Este documento define colunas, tipos, constraints, índices, RLS, funções de segurança e a
estratégia de migrations. Mantém todas as decisões fechadas no PLANNING (multi-tenant por
`organization_id`, anti-conflito no banco, `timestamptz`, idempotência, eventos transacionais)
e adiciona a camada de hardening do V2: **integridade referencial tenant-safe (FKs compostas),
função `SECURITY DEFINER` para a RLS de membership, optimistic locking, outbox transacional,
fundação completa de auth (verificação de e-mail / reset de senha) e CHECKs semânticos.**

---

## Changelog v3 → v4 (revisão pré-código — fecha o furo de RLS e o fluxo de convite)

- **Acessos fora do contexto de tenant (ADR-017) — CRÍTICO.** Três fluxos eram inexecutáveis sob
  `FORCE RLS` como especificados: resolução de slug público (chicken-and-egg: precisa do `org_id` para
  setar o GUC, e do GUC para ler o `org_id`), lookup por token de cancelamento (não se sabe a empresa
  antes de achar a linha) e jobs cross-tenant (relay do outbox e limpezas leem zero linhas sob policy de
  tenant). Solução: **funções resolver `SECURITY DEFINER`** (§10.7) + **contexto de sistema**
  (`app.is_system`, §10.8) + `withSystemContext` no módulo `db`.
- **`invitations` (ADR-019):** convite de equipe vira entidade própria (§5.3) — token hasheado, uso
  único, expiração; o vínculo em `organization_users` é criado **no aceite**, já `ACTIVE`. Resolve o
  caso do convidado sem conta (impossível por construção no desenho anterior).
- **`audit_logs` global concretizado:** policy `global_security_events` (`FOR INSERT WITH CHECK
  (organization_id IS NULL)`) escrita na migration 0006 (§10.5) — antes era nota de passagem, e evento
  global de login é a primeira coisa que a Fase 1 grava.
- **Hash especificado (§1):** senha → **argon2id**; tokens de alta entropia gerados pelo servidor
  (refresh, cancelamento, verificação, convite) → **SHA-256 simples** (hash lento ali só queima CPU).
- **Expiração do token de cancelamento definida (§8.1):** `public_cancel_token_expires_at = starts_at`
  — pode cancelar até o horário começar.
- **Relay com `FOR UPDATE SKIP LOCKED`** (§8.2, ADR-014) e **takeover de `IN_PROGRESS` por CAS atômico**
  (§9.1, ADR-008).
- **Máquina de estados referenciada (§8.1, ADR-018):** agendamento nasce `CONFIRMED` no MVP;
  `SCHEDULED` reservado. O `no_overlap` permanece cobrindo os dois (correto e estável).

## Changelog — consolidação (rodada DOCS-CONSOLIDATION)

Correções aplicadas sobre a v3 ao consolidar os documentos como fonte única, antes do código:

- **`clients.phone_normalized` → NULLABLE + unique parcial** (`WHERE phone_normalized IS NOT NULL`).
  Corrige bug: a anonimização (LGPD) zera o telefone, e dois "valores neutros" iguais na mesma empresa
  violariam o unique `NOT NULL` anterior (§7). **(ADR-016)**
- **Dead-letter do outbox:** `appointment_events.publish_failed_at` + índice parcial de pendentes
  ajustado para excluir dead-letter; teto de tentativas + alerta no relay (§8.2). **(ADR-014)**
- **`metadata` (JSONB) sem PII:** regra explícita de só referências/instantes em `appointment_events`
  e `audit_logs` (§8.2/§9.2) — fecha o esquecimento sem varrer JSONB. **(ADR-010)**
- **Slug retry-on-conflict** (§5.1/§6.1) — corrida vira `409 SLUG_TAKEN`, não `500`. **(ADR-011)**
- **Conflito de jornada padronizado** como `409 WORKING_HOURS_CONFLICT` (§6.4). **(ADR-015)**
- **Idempotência `IN_PROGRESS` fechada** (TTL de 60s, 409 imediato) — §9.1. **(ADR-008)**

## Changelog v2 → v3 (fecha lacunas residuais de integridade)

- **FKs compostas tenant-safe em `working_hours` e `availability_blocks`** — eram as duas tabelas
  operacionais que ficaram com FK **simples** `professional_id → professionals(id)`, sem amarrar o
  profissional ao `organization_id` da linha. Mesmo risco classe nº 8 (cruzamento de tenant) já
  fechado em `appointments`/`professional_services`; como jornada/bloqueios alimentam o cálculo de
  disponibilidade, o furo aqui corromperia a agenda. Agora referenciam `(organization_id, id)`
  (seções 6.4, 6.5; migration 0003). **(crítico)**
- **`chk_cancel_token_pair`** — CHECK semântico em `appointments` garantindo que
  `public_cancel_token_hash` e `public_cancel_token_expires_at` andem juntos (sem token eterno nem
  validade órfã). Mesma disciplina dos demais CHECKs semânticos (seção 8.1).
- **Recuperação de idempotência `IN_PROGRESS`** — regra explícita: 2ª requisição com chave
  `IN_PROGRESS` responde `409` na hora (não bloqueia); `IN_PROGRESS` órfão é recuperado por **TTL
  curto de 60s a partir de `created_at`**, separado do `expires_at` do replay (seção 9.1).
  **Decisão fechada — ADR-008.**

---

## Changelog v1 → v2 (hardening de integridade, RLS e auth)

- **FKs compostas tenant-safe** — `appointments` e `professional_services` passam a referenciar
  `(organization_id, id)` das tabelas-alvo. O banco recusa cruzamento de tenant (agendamento da
  empresa A apontando para profissional da empresa B). Pré-requisito: `UNIQUE (organization_id, id)`
  em `professionals`, `services`, `clients`, `appointments` (seções 6, 7, 8). **(crítico)**
- **RLS de `organizations` via função `SECURITY DEFINER`** (`app_is_member`) em vez de subselect
  direto em `organization_users` — remove a dependência indireta entre policies, deixa a policy
  legível e a avaliação previsível. Função `STABLE`, `SET search_path`, `REVOKE FROM PUBLIC`,
  owner com `BYPASSRLS` (seção 10.4).
- **Optimistic locking:** `appointments.version` (`int NOT NULL DEFAULT 1`). UPDATE faz
  compare-and-swap (`WHERE version = $esperado`); 0 linhas afetadas → `409 Conflict`. Também é o
  marcador de versão consumido pelo evento de real-time (seção 8.1 / PLANNING §11).
- **Outbox transacional:** `appointment_events` ganha `published_at` / `publish_attempts` /
  `last_publish_error` + índice parcial de não publicados. O evento de domínio não se perde se o
  processo cair entre o commit e a publicação WebSocket (seção 8.2). Caminho de evolução para
  `outbox_events` genérica documentado.
- **Fundação de auth completa:** `users.email_verified_at` + tabela `verification_tokens`
  (verificação de e-mail e reset de senha, uso único, hasheado) — seção 4.3.
- **`refresh_sessions`:** + `last_used_at` (auditoria/detecção de anomalia) + índice **parcial**
  de sessão ativa `WHERE revoked_at IS NULL` + índice de `expires_at` para limpeza (seção 4.2).
- **CHECKs semânticos no banco:** `appointment_events` (`STAFF ⇔ actor_user_id NOT NULL`) e
  `appointments` (`CANCELLED ⇔ cancelled_by_type NOT NULL`) — seções 8.1 / 8.2.
- **Token de cancelamento:** `UNIQUE` parcial em `public_cancel_token_hash`
  `WHERE ... IS NOT NULL` (credencial única + leitura indexada) — seção 8.1.
- **Idempotência:** + `response_status_code int` — replay devolve o **mesmo HTTP status** da 1ª
  execução, não só o body (seção 9.1).
- **`audit_logs.action`:** remove `CHECK IN (...)` → `text NOT NULL`. Validação por constantes no
  app; evita migration a cada nova ação de auditoria (seção 9.2). *(empate técnico, decisão consciente)*
- **`ON DELETE RESTRICT` explícito** nas FKs de `appointments` (`professional_id`, `service_id`,
  `client_id`) — histórico não some por cascade (seção 8.1).
- **Provisionamento de role separado das migrations do app:** `CREATE ROLE app_runtime`, senha e
  grants saem da migration versionada e viram pré-requisito de infra/IaC (seção 10.2) — evita dor
  em PostgreSQL gerenciado (RDS, Cloud SQL, Supabase) onde `CREATE ROLE` é restrito.

---

## 0. Por que SQL manual + Drizzle (e não só `drizzle-kit generate`)

O Drizzle Kit **não gera** parte do DDL que este projeto exige: `EXCLUDE USING gist`, tipos
`RANGE` customizados (`timerange`), funções `SECURITY DEFINER` e políticas de RLS. Esses itens
vivem em **migrations SQL versionadas escritas à mão** (recurso de *custom migrations* do Drizzle
Kit). Regra do projeto:

| O que | Onde fica |
|---|---|
| Tabelas, colunas, FKs simples, `UNIQUE`, índices btree simples, enums | Schema Drizzle (`*.ts`) → `drizzle-kit generate` |
| Extensões, `timerange`, `CHECK` de intervalo/semântico, `EXCLUDE`, **FKs compostas tenant-safe**, funções, RLS, índices `gist`/parciais | **Migration SQL manual** |
| Backfills / data migration | Migration SQL manual (sob contexto/role correto) |

> **Consequência operacional:** o gate "migrations aplicam do zero" valida a sequência COMPLETA
> (Drizzle + manuais), não só `drizzle-kit`. Sem isso, as constraints que protegem o coração do
> sistema (`no_overlap`, FKs tenant-safe) simplesmente não nascem.

---

## 1. Convenções

- **IDs:** `uuid` PK, default `gen_random_uuid()` (nativo do core desde PG13).
  *PG18+:* pode trocar o default por `uuidv7()` para localidade de índice melhor, sem mudar nada no app.
- **Tempo:** todo instante absoluto é `timestamptz`. `created_at timestamptz NOT NULL DEFAULT now()`.
  `updated_at` mantido por trigger (seção 11).
- **Dinheiro:** inteiro em centavos (`price_cents int`) + `currency char(3) NOT NULL DEFAULT 'BRL'`.
- **Identificadores de código em inglês.** Comentários SQL podem ser em PT (voltados ao dev).
- **Enums nativos** (`CREATE TYPE ... AS ENUM`) para domínios estáveis. Adicionar valor é seguro
  (`ALTER TYPE ... ADD VALUE`); remover não — por isso enums só onde o conjunto é estável.
- **Telefone:** `phone` (exibição) + `phone_normalized` (E.164, ex.: `+5511999999999`).
- **Hash de credenciais — algoritmos definidos (fecha o "ex.:" da versão anterior):**
  - **Senha → argon2id** (parâmetros calibrados no app; bcrypt só como fallback de ambiente).
    Senha é segredo de baixa entropia escolhido por humano — exige hash lento.
  - **Tokens gerados pelo servidor** (refresh, cancelamento público, verificação, convite) →
    **SHA-256 simples**. São valores de alta entropia (≥ 256 bits de `crypto.randomBytes`); hash
    lento ali não adiciona segurança e queimaria CPU em toda requisição de refresh.
  - Em ambos os casos o banco guarda **só o hash**, nunca o valor cru.
- **Chave candidata composta `(organization_id, id)`:** criada nas tabelas que são alvo de FK
  tenant-safe (`professionals`, `services`, `clients`, `appointments`). É redundante para
  unicidade (o `id` já é PK), mas é o que habilita a FK composta a fechar o tenant no banco.

---

## 2. Tabelas tenant-scoped vs globais (importante para RLS)

- **Globais (sem `organization_id`, sem RLS de tenant):** `users`, `refresh_sessions`, `verification_tokens`.
- **Identidade/bootstrap (RLS com nuance — seção 10):** `organizations`, `organization_users`.
- **Operacionais (RLS estrita por `organization_id` — seção 10):** `professionals`, `services`,
  `professional_services`, `working_hours`, `availability_blocks`, `clients`, `appointments`,
  `appointment_events`, `idempotency_keys`, `audit_logs`, **`invitations`**.
- **Acesso fora do contexto de tenant:** existe, é legítimo e é **explícito** — resolvers
  `SECURITY DEFINER` para lookups públicos (§10.7) e contexto de sistema para jobs (§10.8). Nada
  contorna a RLS implicitamente (ADR-017).

---

## 3. Migration 0001 — extensões, tipo customizado e enums (SQL manual)

```sql
-- btree_gist: permite usar '=' em colunas escalares dentro de EXCLUDE USING gist
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Postgres não tem range nativo de TIME; criamos um para a jornada de trabalho
CREATE TYPE timerange AS RANGE (subtype = time);

-- Enums de domínio (estáveis)
CREATE TYPE org_role           AS ENUM ('OWNER', 'MANAGER', 'PROFESSIONAL');
CREATE TYPE membership_status   AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');
CREATE TYPE appointment_status  AS ENUM ('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE appointment_source  AS ENUM ('PANEL', 'PUBLIC');
CREATE TYPE actor_type          AS ENUM ('STAFF', 'CLIENT', 'SYSTEM');
CREATE TYPE appointment_event_type AS ENUM ('CREATED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE idempotency_state   AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE verification_purpose AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');
```

> `audit_logs.action` usa `text` **sem** `CHECK` (V2): o conjunto de ações de segurança cresce com
> frequência e tanto enum quanto `CHECK IN` forçam migration a cada nova ação. Validação por
> constantes no app + testes. Ver seção 9.2.
>
> **`membership_status = 'INVITED'` fica reservado** (ADR-019): o fluxo de convite do MVP usa a tabela
> `invitations` (§5.3) e o vínculo nasce `ACTIVE` no aceite. O valor permanece no enum (aditivo, sem
> custo) para evolução futura.
>
> **Convite não entra em `verification_purpose`:** o convite referencia **org + e-mail** (o convidado
> pode não ter conta), não um `user_id` — ciclo de vida próprio, tabela própria (§5.3).

---

## 4. Identidade e autenticação

### 4.1 `users` (global)

```sql
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text NOT NULL,
  password_hash     text NOT NULL,            -- argon2id, feito no app (§1)
  phone             text,
  email_verified_at timestamptz,              -- NULL = e-mail ainda não verificado
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- email único globalmente, case-insensitive
CREATE UNIQUE INDEX users_email_lower_uk ON users (lower(email));
```

### 4.2 `refresh_sessions` (global) — sessões revogáveis

Atende ao requisito de **derrubar acesso ativo** (logout, `DISABLED`, troca de senha). JWT puro é
stateless e não revoga; por isso o refresh é rastreado no banco.

```sql
CREATE TABLE refresh_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,            -- SHA-256 do refresh token (cru só no cookie httpOnly)
  family_id    uuid NOT NULL,            -- mesma família = mesma cadeia de rotação
  replaced_by  uuid REFERENCES refresh_sessions(id),  -- rotação: aponta para o token sucessor
  user_agent   text,
  ip           inet,
  last_used_at timestamptz,              -- atualizado a cada refresh (auditoria / detecção de anomalia)
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,              -- NULL = ativo
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX refresh_sessions_token_hash_uk ON refresh_sessions (token_hash);
CREATE INDEX refresh_sessions_family_idx  ON refresh_sessions (family_id);
CREATE INDEX refresh_sessions_expires_idx ON refresh_sessions (expires_at);  -- limpeza periódica

-- operação mais quente: revogar as sessões ATIVAS de um usuário (logout / troca de senha / DISABLED)
CREATE INDEX refresh_sessions_active_idx ON refresh_sessions (user_id) WHERE revoked_at IS NULL;
```

**Regras de auth (desenho):**
- **Access token** curto (5–15 min), `Authorization: Bearer`, **em memória** no front.
- **Refresh token** em cookie `httpOnly` + `Secure` + `SameSite=Strict` + `Path=/api/v1/auth/refresh`
  (same-origin via proxy reverso — ADR-012 fechada, Opção A).
  Mutações vão por `Bearer` → superfície de CSRF concentrada em `/auth/refresh` (token/header dedicado).
- **Rotação:** cada refresh emite novo token (`replaced_by` encadeia), revoga o anterior, atualiza `last_used_at`.
- **Detecção de reuso:** refresh já `revoked_at` reapresentado → **revoga a família inteira** (`family_id`).
- **Escopo de revogação (ADR-004 emendada):** `logout` revoga **a família da sessão apresentada**
  (o cookie identifica qual); **reset de senha e `DISABLED`** revogam **todas** as sessões ativas do
  usuário (índice parcial acima). Com access curto, o acesso cai em minutos.

### 4.3 `verification_tokens` (global) — verificação de e-mail e reset de senha

Fundação de auth de produto real: sem reset de senha, o suporte vira manual desde o 1º usuário.
Mesma disciplina do token de cancelamento público — **hasheado (SHA-256), uso único, com expiração**.

```sql
CREATE TABLE verification_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     verification_purpose NOT NULL,
  token_hash  text NOT NULL,            -- SHA-256; o token cru vai só no link do e-mail
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,              -- NULL = ainda não usado (uso único)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX verification_tokens_hash_uk ON verification_tokens (token_hash);
-- buscar token válido por usuário/propósito e limpar expirados
CREATE INDEX verification_tokens_user_purpose_idx ON verification_tokens (user_id, purpose);
CREATE INDEX verification_tokens_expires_idx      ON verification_tokens (expires_at);
```

> **Reenvio:** `POST /auth/verify-email/resend` (API §8) emite novo token e invalida o anterior do
> mesmo `purpose` — sem isso, token expirado deixaria o usuário permanentemente preso.

---

## 5. Tenant e equipe

### 5.1 `organizations`

```sql
CREATE TABLE organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text NOT NULL,                 -- usado em URL pública
  timezone          text NOT NULL DEFAULT 'America/Sao_Paulo',
  slot_interval_min int  NOT NULL DEFAULT 30 CHECK (slot_interval_min > 0),
  currency          char(3) NOT NULL DEFAULT 'BRL',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organizations_slug_uk ON organizations (lower(slug));
```

> **Slugs:** únicos (case-insensitive), gerados do nome com tratamento de colisão (`-2`, `-3`) e
> validados contra **lista de palavras reservadas** no app (`admin`, `api`, `app`, `login`, `auth`,
> `public`, `barbearia`, `barbeiro`, `static`, `assets`...). A geração é **retry-on-conflict** (tenta
> inserir; conflito do `UNIQUE (lower(slug))` → incrementa sufixo e retenta, com teto), **não**
> check-then-insert — corrida de slug vira `409 SLUG_TAKEN`, nunca `500` (ADR-011).
>
> **`timezone` é validado na borda da API** contra a lista IANA (Zod no `shared` +
> `Intl.supportedValuesOf('timeZone')`): valor inválido aqui quebraria o cálculo de disponibilidade
> inteiro. `slot_interval_min` validado com faixa razoável no app (ex.: 5–240) além do `CHECK > 0`.
>
> **Resolução de slug na rota pública:** a leitura `slug → organization_id` **não** passa pela policy
> (não há contexto ainda) — usa `app_resolve_org_by_slug` (§10.7, ADR-017).

### 5.2 `organization_users` — vínculo, papel e status

```sql
CREATE TABLE organization_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            org_role NOT NULL,
  status          membership_status NOT NULL DEFAULT 'ACTIVE',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- um usuário tem no máximo um vínculo por empresa
CREATE UNIQUE INDEX organization_users_org_user_uk ON organization_users (organization_id, user_id);
CREATE INDEX organization_users_user_idx ON organization_users (user_id);  -- "minhas empresas"
```

### 5.3 `invitations` — convite de equipe (ADR-019)

Convite é **entidade própria, não membership**: referencia org + e-mail (o convidado pode não ter
conta), com token hasheado, uso único e expiração. O vínculo em `organization_users` é criado **apenas
no aceite**, já `ACTIVE`.

```sql
CREATE TABLE invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,                 -- e-mail do convidado (pode não existir em users)
  role            org_role NOT NULL,             -- papel que o vínculo terá no aceite
  token_hash      text NOT NULL,                 -- SHA-256; o token cru vai só no link do e-mail
  invited_by      uuid NOT NULL REFERENCES users(id),
  expires_at      timestamptz NOT NULL,
  accepted_at     timestamptz,                   -- NULL = pendente (uso único)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX invitations_token_hash_uk ON invitations (token_hash);

-- no máximo UM convite pendente por e-mail por empresa (reenviar substitui o pendente)
CREATE UNIQUE INDEX invitations_org_email_pending_uk
  ON invitations (organization_id, lower(email))
  WHERE accepted_at IS NULL;

CREATE INDEX invitations_expires_idx ON invitations (expires_at);  -- limpeza periódica
```

> **Aceite (`POST /auth/accept-invite`, API §8):** lookup do token via `app_resolve_invitation_by_hash`
> (§10.7 — não há contexto de tenant antes de achar a linha); na mesma transação: valida
> expiração/uso, cria o vínculo `ACTIVE` (e o `user` se for registro por convite — e-mail já
> verificado por construção, o token chegou por ele) e marca `accepted_at`.
> **Limpeza de expirados** roda sob contexto de sistema (§10.8).

---

## 6. Cadastro operacional

### 6.1 `professionals`

```sql
CREATE TABLE professionals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id),       -- NULLABLE: profissional sem acesso ao sistema
  name            text NOT NULL,
  slug            text NOT NULL,                    -- /barbeiro/{slug} dentro da empresa
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX professionals_org_slug_uk ON professionals (organization_id, lower(slug));
CREATE INDEX professionals_org_idx ON professionals (organization_id);

-- B1: um user_id mapeia para NO MÁXIMO um professional por empresa. O escopo "PROFESSIONAL só vê a
-- própria agenda" (§10.6) depende desse mapeamento 1:1 — sem isto, o mesmo user_id em dois
-- professionals da mesma empresa torna o guard ambíguo. Parcial: user_id NULLABLE (profissional sem login).
CREATE UNIQUE INDEX professionals_org_user_uk
  ON professionals (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- chave candidata composta: alvo das FKs tenant-safe (appointments, professional_services)
ALTER TABLE professionals ADD CONSTRAINT professionals_org_id_uk UNIQUE (organization_id, id);
```

> **Desativação (`active = false`) não cancela agendamentos futuros** (decisão consciente): o
> profissional some da vitrine e do cálculo de disponibilidade, mas agendamentos existentes
> permanecem válidos — o painel exibe e a equipe decide caso a caso. Cancelamento em massa
> automático seria destrutivo demais para um toggle.

### 6.2 `services`

```sql
CREATE TABLE services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  duration_min    int  NOT NULL CHECK (duration_min > 0),
  price_cents     int  NOT NULL CHECK (price_cents >= 0),
  currency        char(3) NOT NULL DEFAULT 'BRL',
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX services_org_idx ON services (organization_id);

-- chave candidata composta: alvo das FKs tenant-safe
ALTER TABLE services ADD CONSTRAINT services_org_id_uk UNIQUE (organization_id, id);
```

### 6.3 `professional_services` (junção) — tenant-safe

PK mantida em `(professional_id, service_id)` (suficiente, pois `professional_id` é UUID global).
A integridade de tenant vem das **FKs compostas**, não da PK: garante que profissional e serviço
sejam da **mesma** empresa do vínculo.

```sql
CREATE TABLE professional_services (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL,
  service_id      uuid NOT NULL,
  PRIMARY KEY (professional_id, service_id)
);

CREATE INDEX professional_services_org_idx ON professional_services (organization_id);

-- SQL manual: FKs compostas tenant-safe (o banco recusa profissional/serviço de outra empresa)
ALTER TABLE professional_services
  ADD CONSTRAINT professional_services_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE CASCADE;

ALTER TABLE professional_services
  ADD CONSTRAINT professional_services_service_fk
  FOREIGN KEY (organization_id, service_id)
  REFERENCES services (organization_id, id) ON DELETE CASCADE;
```

### 6.4 `working_hours` — jornada recorrente (com pausas)

Pausa/almoço = **múltiplas linhas no mesmo `weekday`**. O `EXCLUDE` garante que os turnos do mesmo
profissional/dia não se sobreponham. **(SQL manual: CHECK + EXCLUDE.)**

```sql
CREATE TABLE working_hours (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL,                                    -- FK composta tenant-safe (abaixo)
  weekday         smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=domingo
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX working_hours_prof_weekday_idx ON working_hours (professional_id, weekday);

-- SQL manual: FK composta tenant-safe — jornada e profissional na MESMA empresa.
-- Substitui a antiga FK simples professional_id → professionals(id), que não amarrava
-- o profissional ao organization_id da linha (mesmo risco classe nº 8 fechado em appointments).
ALTER TABLE working_hours
  ADD CONSTRAINT working_hours_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE CASCADE;

-- SQL manual:
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

> **Tradução do conflito de jornada:** turnos sobrepostos no mesmo `weekday` violam `no_shift_overlap`;
> o app traduz para **`409 WORKING_HOURS_CONFLICT`** (sobreposição é conflito de regra de negócio, não
> erro de formato — ADR-015, espelhado no catálogo de `error.code` do `API_CONTRACTS.md` §7).
>
> **Mudar a jornada não invalida agendamentos existentes** (decisão consciente): o `PUT` de
> substituição afeta o cálculo de disponibilidade **futuro**; agendamentos já feitos que caiam fora
> da nova jornada permanecem válidos e visíveis no painel.

### 6.5 `availability_blocks` — exceções datadas

```sql
CREATE TABLE availability_blocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL,                                    -- FK composta tenant-safe (abaixo)
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- SQL manual: FK composta tenant-safe — bloqueio e profissional na MESMA empresa
-- (substitui a antiga FK simples professional_id → professionals(id))
ALTER TABLE availability_blocks
  ADD CONSTRAINT availability_blocks_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE CASCADE;

-- SQL manual:
ALTER TABLE availability_blocks
  ADD CONSTRAINT chk_block_interval CHECK (ends_at > starts_at);

CREATE INDEX availability_blocks_prof_time_idx
  ON availability_blocks (professional_id, starts_at, ends_at);
```

> **Limite consciente:** `working_hours`/`availability_blocks` **não** são garantidos por constraint
> *contra* `appointments`. Agendar fora da jornada ou dentro de um bloqueio é validado **na
> aplicação** (passo de validação dentro da transação). Aceitável no MVP — registrado aqui para
> ninguém assumir que o banco cobre isso.

---

## 7. Clientes

```sql
CREATE TABLE clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  phone            text,                 -- como digitado (exibição)
  phone_normalized text,                 -- E.164 (canônico). NULLABLE: anonimização (LGPD) zera o valor
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- mesmo telefone não vira clientes duplicados dentro da empresa.
-- UNIQUE PARCIAL: só vale quando há telefone. Clientes anonimizados (phone_normalized = NULL) não
-- colidem entre si — vários "Cliente removido" na mesma empresa são permitidos. (ver nota LGPD abaixo)
CREATE UNIQUE INDEX clients_org_phone_uk
  ON clients (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- chave candidata composta: alvo da FK tenant-safe em appointments
ALTER TABLE clients ADD CONSTRAINT clients_org_id_uk UNIQUE (organization_id, id);
```

> **LGPD / direito ao esquecimento:** exclusão de cliente **anonimiza**
> (`name = 'Cliente removido'`, `phone` → `NULL`, **`phone_normalized` → `NULL`**), nunca `DELETE`
> físico — preserva integridade referencial com `appointments` e o histórico. **Por isso
> `phone_normalized` é `NULLABLE` e o unique é parcial (`WHERE phone_normalized IS NOT NULL`):** sem
> isso, anonimizar dois clientes na mesma empresa com o mesmo "valor neutro" violaria o unique. A rota
> que executa a anonimização está especificada no contrato (API §20.5), com implementação na Fase 6.
>
> **Scrub de texto livre (C4 — ADR-016 v3):** a anonimização **também seta `appointments.note = NULL`**
> nos agendamentos do cliente, na mesma transação. `note` é texto livre escrito pela equipe e pode conter
> PII ("Maria prefere…"); o `metadata` JSONB não retém PII por construção (ADR-010), mas `note` sim, então
> anonimizar só a linha de `clients` **não bastaria**. **Princípio geral:** todo campo de texto livre capaz
> de conter PII entra no scrub — vale para `note` hoje e para campos futuros (ex.: `client_notes`).
>
> **Upsert por telefone (B8):** o `INSERT ... ON CONFLICT` é contra o **unique parcial**, então a cláusula
> **repete o predicado**:
> ```sql
> INSERT INTO clients (organization_id, name, phone, phone_normalized)
> VALUES ($1, $2, $3, $4)
> ON CONFLICT (organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL
> DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = now()
> RETURNING id;
> ```
> Só ocorre quando `phone_normalized IS NOT NULL` (ADR-016). **Política de nome divergente:** o upsert do
> **painel** atualiza `name` (corrige cadastro); o **booking público não sobrescreve** o cadastro existente
> (o visitante não reescreve dado de balcão) — a borda decide qual caminho aplica o `DO UPDATE` de `name`
> (espelho: API §20.5).
>
> **Busca textual por nome (Fase 6 — pg_trgm):** a busca de cliente por nome no painel (`ILIKE '%maria%'`)
> **não usa btree** — precisa de índice **GIN com `pg_trgm`**. Como as migrations são forward-only, isso
> entra **limpo na migration da própria Fase 6** (não no MVP-base), junto da rota de busca:
> `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + `CREATE INDEX clients_name_trgm_idx ON clients USING gin
> (name gin_trgm_ops);`. Registrado aqui e no PR-6.3 para a busca **não nascer com seq scan**. (A busca
> por telefone usa `phone_normalized` exato, coberta pelo unique parcial.)

---

## 8. Agenda (coração) e auditoria de domínio

### 8.1 `appointments`

```sql
CREATE TABLE appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL,
  service_id      uuid NOT NULL,
  client_id       uuid NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'CONFIRMED',  -- nasce CONFIRMED no MVP (ADR-018)
  source          appointment_source NOT NULL,
  note            text,
  version         int NOT NULL DEFAULT 1,          -- optimistic lock + marcador de versão do real-time
  public_cancel_token_hash       text,             -- SHA-256; o token cru vai só no link
  public_cancel_token_expires_at timestamptz,
  cancelled_by_type actor_type,                     -- preenchido só ao cancelar
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- chave candidata composta: alvo da FK tenant-safe de appointment_events
ALTER TABLE appointments ADD CONSTRAINT appointments_org_id_uk UNIQUE (organization_id, id);

-- SQL manual: intervalo válido
ALTER TABLE appointments
  ADD CONSTRAINT chk_interval CHECK (ends_at > starts_at);

-- SQL manual: cancelado ⇔ tem quem cancelou (impede estado ambíguo no banco)
ALTER TABLE appointments
  ADD CONSTRAINT chk_cancelled_by
  CHECK ((status = 'CANCELLED') = (cancelled_by_type IS NOT NULL));

-- SQL manual: hash e expiração do token de cancelamento andam JUNTOS
-- (impede token eterno — hash sem validade — ou validade órfã sem hash)
ALTER TABLE appointments
  ADD CONSTRAINT chk_cancel_token_pair
  CHECK ((public_cancel_token_hash IS NULL) = (public_cancel_token_expires_at IS NULL));

-- SQL manual: FKs compostas tenant-safe + ON DELETE RESTRICT explícito (histórico não some por cascade)
ALTER TABLE appointments
  ADD CONSTRAINT appointments_professional_fk
  FOREIGN KEY (organization_id, professional_id)
  REFERENCES professionals (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_service_fk
  FOREIGN KEY (organization_id, service_id)
  REFERENCES services (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_client_fk
  FOREIGN KEY (organization_id, client_id)
  REFERENCES clients (organization_id, id) ON DELETE RESTRICT;

-- SQL manual: anti-conflito — sem sobreposição de horário OCUPADO para o mesmo profissional
ALTER TABLE appointments
  ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    organization_id WITH =,                       -- defesa em profundidade
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&    -- início inclusivo, fim exclusivo
  )
  WHERE (status IN ('SCHEDULED', 'CONFIRMED'));     -- só status que ocupam agenda

-- SQL manual: token de cancelamento é credencial → único quando existir + leitura indexada
CREATE UNIQUE INDEX appointments_cancel_token_uk
  ON appointments (public_cancel_token_hash)
  WHERE public_cancel_token_hash IS NOT NULL;
```

**Índices de leitura (o endpoint mais quente: agenda + disponibilidade):**

```sql
-- índice PARCIAL alinhado ao no_overlap: a agenda/disponibilidade só olha status ativos
CREATE INDEX appointments_active_slots_idx
  ON appointments (organization_id, professional_id, starts_at)
  WHERE status IN ('SCHEDULED', 'CONFIRMED');

-- visão diária da empresa toda (painel) e busca por cliente
CREATE INDEX appointments_org_starts_idx ON appointments (organization_id, starts_at);
CREATE INDEX appointments_client_idx     ON appointments (client_id);
```

> **Máquina de estados (ADR-018):** no MVP todo agendamento **nasce `CONFIRMED`** (painel e público);
> `SCHEDULED` fica reservado para a fase futura de aprovação. Transições válidas:
> `CONFIRMED → CANCELLED | COMPLETED | NO_SHOW`; remarcação mantém `CONFIRMED`; estados terminais são
> **imutáveis** (ação sobre terminal → `409 INVALID_STATUS_TRANSITION`, validado no service **antes**
> do UPDATE). O `no_overlap` cobre `SCHEDULED` e `CONFIRMED` — correto hoje e estável para a fase futura.
> **Gate de jornada (ADR-022) — o que o `no_overlap` NÃO cobre:** a constraint impede sobreposição, mas
> não impede agendar **fora da jornada** ou dentro de um **`availability_block`** (impossível como
> `EXCLUDE`). Esse gate é **validação de service obrigatória e testada**: público **sempre rejeita**
> (`422 OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`); painel permite encaixe com `allowOutsideHours: true`
> (marca `outsideWorkingHours` no evento, sem PII). API §16/§17, PLANNING §10.1.
> **Optimistic locking:** o UPDATE de remarcação/edição é compare-and-swap —
> `UPDATE ... SET ..., version = version + 1 WHERE id = $1 AND version = $2`. **0 linhas afetadas =
> alguém editou antes** → o app traduz em `409 Conflict` e o front refaz o fetch. A `version` é
> gerida pela **aplicação** (não pelo trigger de `updated_at`, para não duplicar o incremento).
> **Remarcação não é status:** atualiza `starts_at`/`ends_at` (segue `CONFIRMED`) e grava
> `RESCHEDULED` em `appointment_events` na mesma transação.
> **Token de cancelamento:** uso único — ao cancelar, invalidar (limpar hash/expiração).
> **Expiração do token de cancelamento = `starts_at`** (regra de app): o cliente pode cancelar até o
> horário começar. Mantém o par `chk_cancel_token_pair` consistente e dispensa coluna/config extra.
> **Remarcação atualiza a expiração (B2):** quando há `public_cancel_token_hash` (origem pública), o
> UPDATE de remarcação **também seta `public_cancel_token_expires_at = novo starts_at`** — senão remarcar
> para mais tarde tiraria do cliente o direito de cancelar antes do (novo) início, e para mais cedo
> deixaria o token válido além do início. (Espelho: API §16.3.)
> **Lookup por token (rota pública):** via `app_resolve_appointment_by_cancel_hash` (§10.7, ADR-017) —
> não há contexto de tenant antes de achar a linha.

### 8.2 `appointment_events` — trilha obrigatória + outbox (mesma transação)

Além da auditoria de domínio, esta tabela funciona como **outbox transacional**: o evento é gravado
na mesma transação do agendamento, e um relay publica depois no WebSocket. Se o processo cair entre
o commit e a publicação, o evento **não se perde** — o relay reprocessa os não publicados.

```sql
CREATE TABLE appointment_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id    uuid NOT NULL,
  event_type        appointment_event_type NOT NULL,
  actor_type        actor_type NOT NULL,
  actor_user_id     uuid REFERENCES users(id),   -- só quando actor_type = STAFF
  metadata          jsonb NOT NULL DEFAULT '{}', -- SÓ referências/instantes (IDs, version, antes/depois), NUNCA PII (ADR-010)
  published_at      timestamptz,                  -- NULL = ainda não publicado no WebSocket (outbox)
  publish_attempts  int NOT NULL DEFAULT 0,       -- nº de tentativas do relay (backoff/alerta)
  last_publish_error text,                         -- última falha de publicação (debug)
  publish_failed_at timestamptz,                   -- preenchido no teto de tentativas → dead-letter + alerta (ADR-014)
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- SQL manual: FK composta tenant-safe (evento e agendamento na mesma empresa)
ALTER TABLE appointment_events
  ADD CONSTRAINT appointment_events_appointment_fk
  FOREIGN KEY (organization_id, appointment_id)
  REFERENCES appointments (organization_id, id) ON DELETE CASCADE;

-- SQL manual: STAFF ⇔ tem usuário; CLIENT/SYSTEM ⇔ sem usuário
ALTER TABLE appointment_events
  ADD CONSTRAINT chk_actor_user
  CHECK ((actor_type = 'STAFF') = (actor_user_id IS NOT NULL));

CREATE INDEX appointment_events_appt_idx ON appointment_events (appointment_id, created_at);

-- SQL manual: índice PARCIAL do outbox — varredura barata do relay (só pendentes AINDA elegíveis).
-- Dead-letter (publish_failed_at IS NOT NULL) sai do índice → não envenena a varredura para sempre.
CREATE INDEX appointment_events_unpublished_idx
  ON appointment_events (created_at)
  WHERE published_at IS NULL AND publish_failed_at IS NULL;
```

> **`metadata` sem PII (ADR-010):** guarda **somente referências e instantes** (IDs, `version`,
> `starts_at`/`ends_at`, motivo curto sem PII) — **nunca nome/telefone cru**. Assim, anonimizar
> `clients` (direito ao esquecimento, §7) já basta para o esquecimento: o JSONB não retém PII por
> construção, dispensando varredura de `metadata`.

> **Dead-letter do outbox (ADR-014):** o relay publica com backoff. Atingido o **teto de tentativas**
> (ex.: 10), grava `publish_failed_at` e **dispara alerta** (error tracking) — o evento sai do conjunto
> "pendente" (índice parcial acima). Como o WebSocket não é fonte de verdade (PLANNING §11), um evento
> dead-lettered não corrompe estado: o front recupera via HTTP ao reconectar; o alerta existe para
> investigar a causa.

> **Leitura do relay (ADR-014, emenda):** o `SELECT` de pendentes usa **`FOR UPDATE SKIP LOCKED`** —
> custa uma cláusula no single-instance e torna o relay seguro para múltiplos workers/instâncias de
> graça quando a fase de escala chegar. O relay roda sob **contexto de sistema** (§10.8): a policy de
> tenant negaria a varredura cross-org.

> **Evolução para `outbox_events` genérica:** enquanto `appointments` for o único produtor de
> eventos, o controle de publicação vive aqui. Quando surgir um 2º produtor (pagamentos,
> notificações, módulos tipo ERP), graduar para uma tabela `outbox_events` genérica
> (`aggregate_type`, `aggregate_id`, `event_type`, `payload jsonb`, `published_at`, ...) com o mesmo
> índice parcial. O relay passa a ler dela; é mudança aditiva (a regra de domínio não muda).

---

## 9. Idempotência e auditoria de segurança

### 9.1 `idempotency_keys`

```sql
CREATE TABLE idempotency_keys (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key                  text NOT NULL,
  route                text NOT NULL,
  request_hash         text NOT NULL,             -- hash do corpo/parametros
  state                idempotency_state NOT NULL DEFAULT 'IN_PROGRESS',
  response             jsonb,                       -- body a devolver em replay (error_code mora aqui)
  response_status_code int,                          -- MESMO HTTP status da 1ª execução (replay fiel)
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL
);

-- o unique impede corrida: a 2ª requisição com a mesma chave bate aqui
CREATE UNIQUE INDEX idempotency_keys_org_key_route_uk
  ON idempotency_keys (organization_id, key, route);

CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);  -- limpeza
```

**Regras:**
- Mesma `(org, key, route)` + **mesmo** `request_hash` → devolve `response` **com o
  `response_status_code` original** (replay fiel), não reexecuta. Sem o status code, uma falha
  tratada (`409`/`422`) voltaria como `200` no retry.
- Mesma chave + `request_hash` **diferente** → **`409 Conflict`** (reuso indevido), nunca devolve
  resposta de outro payload.
- **Concorrência (`IN_PROGRESS`) → NÃO bloquear a requisição.** Se a chave existe e está
  `IN_PROGRESS`, a 2ª requisição responde **na hora** `409 Conflict` com `Retry-After`. Segurar a
  thread/conexão esperando a 1ª terminar esgota o pool sob retry storm (cliente nervoso, rede
  oscilando) — o caminho robusto é recusar rápido e deixar o cliente retentar.
- **Recuperação de `IN_PROGRESS` órfão (ADR-008, com takeover atômico).** Se a 1ª requisição
  morre no meio (processo cai, timeout), a linha fica `IN_PROGRESS` e *toda* retry levaria `409`
  até `expires_at` (horas/dias) — o cliente trava sem nunca concluir. Regra:
  **TTL de in-progress = 60s, calculado a partir de `created_at`** e independente do `expires_at` do
  replay. **O takeover é compare-and-swap atômico:**
  ```sql
  UPDATE idempotency_keys
     SET created_at = now(), request_hash = $hash
   WHERE id = $id AND state = 'IN_PROGRESS'
     AND created_at < now() - interval '60 seconds';
  ```
  **Só a requisição que afetou 1 linha executa**; as demais recebem `409 IDEMPOTENCY_IN_PROGRESS`.
  Sem o CAS, duas retries pós-TTL executariam em dobro. Não exige coluna nova (`created_at` basta).
  Alternativa rejeitada: deixar só o job de limpeza recuperar — depende do job rodar na hora certa,
  não determinístico.
- Limpeza periódica por `expires_at` (job simples, sob **contexto de sistema** — §10.8: a policy de
  tenant negaria a varredura cross-org).

### 9.2 `audit_logs` — segurança/acesso (separado de `appointment_events`)

`appointment_events` = eventos de **domínio** da agenda. `audit_logs` = eventos de
**segurança/acesso**, escopo distinto e proposital.

```sql
CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL p/ eventos globais (ex.: login)
  actor_user_id   uuid REFERENCES users(id),
  action          text NOT NULL,                 -- validado por constantes no app (sem CHECK rígido)
  target_type     text,                          -- ex.: 'appointment', 'client', 'organization_user'
  target_id       uuid,
  metadata        jsonb NOT NULL DEFAULT '{}',   -- SEM PII crua (telefone mascarado)
  ip              inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_org_created_idx   ON audit_logs (organization_id, created_at);
CREATE INDEX audit_logs_actor_created_idx ON audit_logs (actor_user_id, created_at);
```

> **`action` é `text` (não enum / não `CHECK IN`)** — o conjunto de ações de segurança cresce rápido
> (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `TOKEN_REFRESH`, `SESSION_REVOKED`, `PASSWORD_CHANGED`,
> `EMAIL_VERIFIED`, `ROLE_CHANGED`, `MEMBER_INVITED`, `MEMBER_DISABLED`, `PHONE_VIEWED`,
> `AUTHZ_DENIED`, `CLIENT_ANONYMIZED`...). Validação por constantes tipadas no app + testes evita
> migration a cada nova ação. Decisão consciente (empate técnico: o `CHECK` protegeria contra typo,
> mas adiciona atrito). `metadata` e logs **mascaram telefone** por padrão (LGPD).
> **Eventos globais** (`organization_id IS NULL`, ex.: `LOGIN_FAILED`) entram pela policy
> `global_security_events` (§10.5 — ADR-017): INSERT permitido sem contexto de tenant; **leitura de
> linhas globais não tem policy** (invisíveis ao app por design — acesso operacional só via role
> privilegiada).

---

## 10. RLS — isolamento de tenant como defesa em profundidade (SQL manual)

O tenant guard do NestJS continua existindo. RLS é a **segunda barreira**: se um repository esquecer
o `WHERE organization_id = ...`, o banco bloqueia a linha de outro tenant.

### 10.1 Contexto por transação (dois GUCs + flag de sistema)

O guard abre a transação e define o contexto. O contexto dura só a transação — seguro inclusive com
pool em modo transação (PgBouncer no futuro; nesse cenário, lembrar `prepare: false` no driver).
Usar **`set_config(name, value, true)`** (3º arg = `is_local`) — aceita **bind parameter**, ao
contrário de `SET LOCAL`, que não aceita parâmetro e exigiria interpolar string:

```sql
-- withTenantContext: parametrizado (sem interpolação de string)
SELECT set_config('app.current_organization_id', $1, true);  -- $1 = uuid do tenant resolvido
SELECT set_config('app.current_user_id',         $2, true);  -- $2 = uuid do usuário (quando houver login)
-- jobs de sistema (relay/limpezas) usam, em vez dos dois acima:
SELECT set_config('app.is_system', 'true', true);            -- só via withSystemContext (§10.8)
```

Na rota **pública** o `organization_id` vem do `slug` da empresa, resolvido por
`app_resolve_org_by_slug` (§10.7) — **nunca** do cliente; o `current_user_id` fica ausente.

> **Risco de implementação nº 1:** toda query DEVE rodar dentro de uma transação que setou os GUCs;
> sem isso, a leitura do GUC vira `NULL`/`''` e a policy nega tudo. Encapsular em dois
> pontos únicos — **`withTenantContext(orgId, userId, fn)`** (caminho normal) e
> **`withSystemContext(fn)`** (exclusivo de relay/jobs) — e proibir acesso ao banco fora deles.
> São os primeiros utilitários do módulo `db`.

> **Risco de implementação nº 1-b (pooling + GUC placeholder):** um GUC customizado (com ponto no
> nome), uma vez setado na sessão, passa a devolver **string vazia `''`** — e **não `NULL`** — em
> transações seguintes da mesma conexão que **não** o setam. Com pooling, conexões são reusadas, então
> isso acontece na prática: `''::uuid` lança `22P02` (`invalid input syntax for type uuid`) e a negação
> limpa da RLS vira **`500` intermitente**. Por isso **toda** policy lê o GUC com
> `NULLIF(current_setting(...), '')` antes do cast (e `is_system` com `COALESCE(NULLIF(...)::boolean,
> false)`). Ver §10.3–§10.8.

### 10.2 Role da aplicação — PRÉ-REQUISITO DE INFRA (fora da migration do app)

RLS **não** se aplica ao dono da tabela nem a superusuário, a menos que se force. A app conecta com
uma role dedicada, **sem `BYPASSRLS`**, e cada tabela usa `FORCE ROW LEVEL SECURITY`.

> **Mudança no V2:** `CREATE ROLE`, senha e grants **saem da migration versionada do app** e viram
> pré-requisito de provisionamento (IaC / console do provedor). Em PostgreSQL gerenciado (RDS, Cloud
> SQL, Supabase) `CREATE ROLE` costuma ser restrito, e senha não entra em migration versionada. A
> migration de aplicação assume que `app_runtime` já existe.

```sql
-- PROVISIONAMENTO (infra/IaC, NÃO migration de app):
--   CREATE ROLE app_runtime LOGIN PASSWORD '<gerenciada-fora-do-versionamento>';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
-- Migrations rodam com role privilegiada (dona do schema, com BYPASSRLS), separada da app_runtime.
```

### 10.3 Função de membership (`SECURITY DEFINER`) — base da RLS de identidade

Para a policy de `organizations` consultar membership **sem** depender indiretamente da RLS de
`organization_users` (dependência difícil de debugar e custosa por linha), usamos uma função
`SECURITY DEFINER` restrita. Owner com `BYPASSRLS` → a leitura de `organization_users` dentro da
função ignora RLS de forma controlada.

```sql
CREATE OR REPLACE FUNCTION app_is_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE                         -- não muda dentro da mesma query (otimizável)
SECURITY DEFINER               -- roda com privilégio do owner (que tem BYPASSRLS)
SET search_path = public       -- trava o search_path (não herda o do chamador — segurança)
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = target_org
      AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
$$;

-- segurança da função SECURITY DEFINER: ninguém além do app_runtime executa
REVOKE ALL  ON FUNCTION app_is_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_member(uuid) TO app_runtime;
-- (a função deve ser CRIADA por uma role com BYPASSRLS — a mesma que roda as migrations)
```

### 10.4 Tabelas de identidade (`organizations`, `organization_users`)

```sql
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users FORCE  ROW LEVEL SECURITY;

-- só lê current_setting; NÃO consulta organizations de volta → sem dependência circular
CREATE POLICY tenant_or_self ON organization_users
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR user_id      = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE  ROW LEVEL SECURITY;

-- usa a função SECURITY DEFINER em vez de subselect direto com RLS
CREATE POLICY tenant_or_member ON organizations
  USING (
    id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR app_is_member(id)
  );
```

> **Onboarding (criar empresa):** o `INSERT` de `organizations` roda numa transação que, logo após
> gerar o `id`, faz `set_config('app.current_organization_id', <id>, true)` antes de inserir o vínculo
> `organization_users` — assim as políticas passam sem exceção de RLS.

### 10.5 Política das tabelas OPERACIONAIS

Padrão aplicado a: `professionals`, `services`, `professional_services`, `working_hours`,
`availability_blocks`, `clients`, `appointments`, `audit_logs`.

```sql
-- repetir o bloco abaixo para cada tabela operacional (ex.: appointments)
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON appointments
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);
```

> `NULLIF(current_setting(..., true), '')` retorna `NULL` se o GUC não foi definido **ou** se o pooling
> o deixou como `''` (placeholder reset — §10.1) → comparação vira `NULL` → **nega tudo** (default
> seguro: sem contexto, sem acesso) **sem** o `22P02` de `''::uuid`.

**`audit_logs` — policy adicional para eventos globais (ADR-017, escrita na migration 0006):**

```sql
-- eventos de segurança SEM tenant (LOGIN_FAILED, LOGIN_SUCCESS antes de escolher empresa, etc.)
-- INSERT permitido sem contexto; leitura de linhas globais NÃO tem policy (invisíveis ao app — design)
CREATE POLICY global_security_events ON audit_logs
  FOR INSERT
  WITH CHECK (organization_id IS NULL);
```

> Policies permissivas combinam por OR: a linha com tenant entra pela `tenant_isolation`; a global,
> pela `global_security_events`.

### 10.6 Escopo de PROFESSIONAL (própria agenda) fica no app

RLS cobre o **tenant**. A regra "PROFESSIONAL só vê a própria agenda" e a permissão granular de
telefone são finas demais para RLS no MVP e ficam nos **guards/policies do NestJS**. RLS protege a
fronteira entre empresas; o app protege a fronteira de papel dentro da empresa.

### 10.7 Resolvers públicos (`SECURITY DEFINER`) — ADR-017

Três lookups legítimos acontecem **antes** de existir contexto de tenant (chicken-and-egg: precisa-se
do `org_id` para setar o GUC, e do GUC para ler a linha). Cada um vira uma função `SECURITY DEFINER`
**estreita** — devolve só os IDs mínimos; o app então abre `withTenantContext(orgId, ...)` e lê a
linha completa **sob RLS normal**. Janela privilegiada mínima, indexada, auditável. Mesma disciplina
da `app_is_member` (`STABLE`, `search_path` fixo, `REVOKE PUBLIC`, criada pela role das migrations).

```sql
-- 1) Rota pública: slug → organization_id (vitrine, availability, booking)
CREATE OR REPLACE FUNCTION app_resolve_org_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM organizations WHERE lower(slug) = lower(p_slug);
$$;

-- 2) Cancelamento público: hash do token → (org, appointment)
CREATE OR REPLACE FUNCTION app_resolve_appointment_by_cancel_hash(p_hash text)
RETURNS TABLE (organization_id uuid, appointment_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.organization_id, a.id
  FROM appointments a
  WHERE a.public_cancel_token_hash = p_hash;   -- unique parcial indexa esta leitura (§8.1)
$$;

-- 3) Aceite de convite: hash do token → (org, invitation)
CREATE OR REPLACE FUNCTION app_resolve_invitation_by_hash(p_hash text)
RETURNS TABLE (organization_id uuid, invitation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.organization_id, i.id
  FROM invitations i
  WHERE i.token_hash = p_hash;                 -- unique indexa esta leitura (§5.3)
$$;

REVOKE ALL ON FUNCTION app_resolve_org_by_slug(text)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_appointment_by_cancel_hash(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_invitation_by_hash(text)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_org_by_slug(text)                TO app_runtime;
GRANT EXECUTE ON FUNCTION app_resolve_appointment_by_cancel_hash(text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_resolve_invitation_by_hash(text)         TO app_runtime;
```

> **Validação de expiração/uso fica no app, sob RLS:** o resolver só localiza; expirado/usado é
> decidido depois de reler a linha com contexto (`410` no contrato). Isso mantém a função burra e o
> fluxo auditável.

### 10.8 Contexto de sistema (`app.is_system`) — jobs cross-tenant (ADR-017)

Relay do outbox e jobs de limpeza operam **através de todos os tenants** (o índice de pendentes é
global; a limpeza varre por `expires_at`). Sob policy de tenant, leriam zero linhas. Solução: as
tabelas que esses jobs tocam ganham a alternativa de sistema na policy — habilitada **somente** por
`withSystemContext(fn)` (uso restrito aos módulos de relay/jobs; lint/review barra fora deles).

```sql
-- aplicado a: appointment_events, idempotency_keys, invitations
ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_or_system ON appointment_events
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  );
-- (repetir o padrão em idempotency_keys e invitations)
```

> **Por que isso não enfraquece a RLS:** o modelo de ameaça aqui é o `WHERE` esquecido em código de
> tenant, **não** o app comprometido (o app já controla os GUCs — quem seta `is_system` poderia setar
> qualquer `organization_id`). O ganho é manter **um único role/conexão** e tornar o caminho de
> sistema **explícito e auditável** no código. Alternativas rejeitadas no ADR-017: role `app_jobs`
> com `BYPASSRLS` (mais provisionamento/credencial, sem ganho real) e relay iterando por org
> (varredura O(orgs), quebra o índice global de pendentes).

### 10.9 Hardening de segurança do banco (ADR-021)

Revisão de segurança no nível do banco, complementar à RLS. Tudo na migration 0006 (ou no
provisionamento de infra, onde indicado).

```sql
-- Least-privilege no schema: nada implícito para PUBLIC
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT  USAGE ON SCHEMA public TO app_runtime;

-- audit_logs é APPEND-ONLY: a app escreve a trilha, mas não a reescreve nem apaga.
-- (o GRANT amplo de DML concede UPDATE/DELETE; revogamos os dois APENAS em audit_logs)
REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime;
-- expurgo por retenção = caminho privilegiado/particionamento (DROP de partição), nunca DELETE da app.

-- Limites de execução na role da aplicação (corta query fugitiva e transação que prende lock)
ALTER ROLE app_runtime SET statement_timeout = '8s';
ALTER ROLE app_runtime SET idle_in_transaction_session_timeout = '15s';
-- (jobs/relay que precisem de janela maior usam um set_config local na própria transação)
```

> **Transporte:** a conexão da app ao Postgres usa **`sslmode=require`** no mínimo (pré-requisito de
> infra, fora da migration). **Least-privilege da role:** `app_runtime` **sem `BYPASSRLS`, sem
> `SUPERUSER`, sem DDL** — migrations rodam com a role dona do schema (§10.2/§10.4). **Superfície
> `SECURITY DEFINER`** (resolvers §10.7 + `app_is_member`): `search_path` pinado, `REVOKE FROM PUBLIC`,
> retorno só de IDs — é a maior superfície de escalonamento de privilégio do banco e tem **teste
> dedicado** (gate §14). **`statement_timeout` curto** interage com o anti-conflito: a transação de
> `POST /appointments` é curta por desenho (uma `INSERT` que vence/perde no `no_overlap`), então 8s é
> folgado; ajustar se algum relatório futuro precisar de janela maior (aí com `SET LOCAL` na transação).

---

## 11. Trigger de `updated_at`

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- aplicar nas tabelas que têm updated_at
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- (repetir para users, organizations, organization_users, professionals, services, working_hours, clients)
```

> **`appointments.version` NÃO é incrementada por trigger** — é gerida pela aplicação no
> compare-and-swap (seção 8.1). Trigger automático duplicaria o incremento e quebraria o lock otimista.

---

## 12. Ordem das migrations (aplica do zero, banco limpo)

| Ordem | Arquivo | Conteúdo | Origem |
|---|---|---|---|
| — | *(provisionamento)* | role `app_runtime` + grants + owner com `BYPASSRLS` das migrations | **infra/IaC** |
| 0001 | `0001_extensions_types_enums.sql` | `btree_gist`, `timerange`, enums (inclui `verification_purpose`) | **manual** |
| 0002 | `0002_tables` | tabelas, colunas (inclui `appointment_events.publish_failed_at`, `clients.phone_normalized` NULLABLE, **`invitations`**), FKs simples, `UNIQUE` (inclui chaves `(org,id)` e **unique parcial de convite pendente**), índices btree | Drizzle generate |
| 0003 | `0003_advanced_constraints.sql` | `CHECK` de intervalo + semânticos (inclui `chk_cancel_token_pair`), `EXCLUDE`, **FKs compostas tenant-safe** (`appointments`, `professional_services`, **`working_hours`, `availability_blocks`**), unique parcial do cancel token, **unique parcial de `clients (org, phone_normalized) WHERE phone_normalized IS NOT NULL`**, **unique parcial de `professionals (org, user_id) WHERE user_id IS NOT NULL` (B1)** | **manual** |
| 0004 | `0004_read_indexes.sql` | índices de leitura (slots ativos parcial, **outbox pendente** `WHERE published_at IS NULL AND publish_failed_at IS NULL`, sessão ativa parcial) | **manual** |
| 0005 | `0005_triggers.sql` | `set_updated_at` + triggers | **manual** |
| 0006 | `0006_functions_and_rls.sql` | `app_is_member` + **resolvers públicos (§10.7)** (SECURITY DEFINER) + `ENABLE/FORCE RLS` + policies (**inclui `tenant_or_system` — §10.8 — e `global_security_events` do `audit_logs` — §10.5**). **Toda leitura de GUC nas policies usa `NULLIF(current_setting(...), '')` / `COALESCE(...,false)` (A3 — anti-`22P02` sob pooling, §10.1)**. **Hardening de segurança (§10.9, ADR-021):** `REVOKE ALL ON SCHEMA public FROM PUBLIC`, **`audit_logs` append-only** (`REVOKE UPDATE, DELETE … FROM app_runtime`), `statement_timeout`/`idle_in_transaction_session_timeout` na role | **manual** |

> CI roda a sequência completa em banco limpo a cada PR (gate "migrations aplicam do zero"). O
> provisionamento da role é pré-requisito do ambiente, não um passo da sequência versionada.

---

## 13. Mapa para os testes do Definition of Done

| Gate do PLANNING | Onde este schema sustenta |
|---|---|
| Anti-conflito (concorrência) | `no_overlap` + `chk_interval` (8.1) |
| Lost update (edição concorrente) | `appointments.version` + compare-and-swap → `409` (8.1) |
| Timezone correto | `timestamptz` em todos os instantes + `organizations.timezone` (cálculo no app) |
| Autorização (agenda alheia bloqueada) | RLS de tenant (10) + guard de PROFESSIONAL no app |
| Isolamento de tenant (integridade) | **FKs compostas tenant-safe** (6.3, 6.4, 6.5, 8.1, 8.2) + RLS (10) |
| **Acessos fora do contexto (ADR-017)** | resolvers §10.7 funcionam **sem** contexto; tabela direta sem contexto **continua negando** |
| **Transição de status inválida (ADR-018)** | matriz validada no service antes do UPDATE (8.1) → `409 INVALID_STATUS_TRANSITION` |
| **Convite (ADR-019)** | `invitations` (5.3) + resolver + vínculo `ACTIVE` no aceite; expirado/usado → `410` |
| Idempotência (retry não duplica) | `idempotency_keys` + unique + `response_status_code` + regra 409 + **CAS de takeover** (9.1) |
| Sessão revogável | `refresh_sessions` (índice parcial ativo, `family_id`, `revoked_at`) (4.2) |
| Não perder evento de real-time | outbox em `appointment_events` (`published_at`) + relay com `SKIP LOCKED` (8.2) |
| Rota pública / anti-abuso | unique parcial do cancel token + token hasheado/uso único + expiração = `starts_at` (8.1) |
| Migrations do zero | sequência da seção 12 |

---

## 14. Checklist de hardening (para aplicação imediata)

- [x] FKs compostas tenant-safe (`appointments`, `professional_services`, `appointment_events`, `working_hours`, `availability_blocks`)
- [x] Função `app_is_member` `SECURITY DEFINER` (`STABLE`, `search_path` fixo, `REVOKE PUBLIC`, owner `BYPASSRLS`)
- [x] **Resolvers públicos `SECURITY DEFINER`** (`org_by_slug`, `appointment_by_cancel_hash`, `invitation_by_hash`) — **ADR-017**
- [x] **Contexto de sistema** (`app.is_system` + policy `tenant_or_system` em `appointment_events`/`idempotency_keys`/`invitations`) — **ADR-017**
- [x] **Policy `global_security_events`** do `audit_logs` (INSERT global, leitura invisível ao app) — **ADR-017**
- [x] **Tabela `invitations`** (token hasheado, uso único, unique parcial de pendente) — **ADR-019**
- [x] `appointments.version` (optimistic lock + marcador de real-time)
- [x] Outbox transacional em `appointment_events` (`published_at` / `publish_attempts` / `last_publish_error` / **`publish_failed_at`**)
- [x] **Dead-letter do outbox** (`publish_failed_at` + teto de tentativas + alerta; índice parcial exclui dead-letter) + **`FOR UPDATE SKIP LOCKED`** — **ADR-014**
- [x] Fundação de auth: `users.email_verified_at` + `verification_tokens` (verify e-mail / reset senha / **resend**)
- [x] `refresh_sessions`: `last_used_at` + índice parcial de sessão ativa + índice de expiração
- [x] **Escopo de revogação definido** (logout = família atual; reset/`DISABLED` = todas) — **ADR-004**
- [x] CHECKs semânticos (`chk_actor_user`, `chk_cancelled_by`, `chk_cancel_token_pair`)
- [x] Unique parcial do `public_cancel_token_hash` + **expiração = `starts_at`**
- [x] `idempotency_keys.response_status_code`
- [x] Recuperação de idempotência `IN_PROGRESS` (409 imediato + TTL de 60s + **takeover CAS**) — **ADR-008**
- [x] **`clients.phone_normalized` NULLABLE + unique parcial** (anonimização LGPD sem colisão) — **ADR-016**
- [x] **Unique parcial `professionals (org, user_id) WHERE user_id IS NOT NULL`** (mapeamento 1:1 user→profissional; escopo PROFESSIONAL não-ambíguo) — **B1**
- [x] **Leitura de GUC blindada** nas policies (`NULLIF(current_setting(...), '')` / `COALESCE(...,false)`) + `withTenantContext` via `set_config` parametrizado — anti-`22P02` sob pooling (§10.1) — **A3**
- [x] **Anonimização limpa `appointments.note`** + princípio de scrub de texto livre (alcança `client_notes` futuro) — **ADR-016 v3 / C4**
- [x] **Remarcação atualiza `public_cancel_token_expires_at = novo starts_at`** (§8.1) — **B2**
- [x] **`audit_logs` append-only** (`REVOKE UPDATE, DELETE FROM app_runtime`) — trilha não reescrevível — **ADR-021 (§10.9)**
- [x] **Least-privilege** (`REVOKE ALL ON SCHEMA public FROM PUBLIC`; `app_runtime` sem `BYPASSRLS`/DDL) + **`statement_timeout`/`idle_in_transaction_session_timeout`** + **`sslmode=require`** — **ADR-021 (§10.9)**
- [x] **`metadata` (JSONB) sem PII** (só referências/instantes) — **ADR-010**
- [x] **Slug retry-on-conflict** (corrida vira `409 SLUG_TAKEN`, não `500`) — **ADR-011**
- [x] **Conflito de jornada padronizado** (`no_shift_overlap` → `409 WORKING_HOURS_CONFLICT`) — **ADR-015**
- [x] **Máquina de estados / nasce `CONFIRMED`** (`409 INVALID_STATUS_TRANSITION`) — **ADR-018**
- [x] **Hash especificado** (argon2id senha; SHA-256 tokens de alta entropia) — §1
- [x] `audit_logs.action` → `text` (sem `CHECK IN`)
- [x] `ON DELETE RESTRICT` explícito nas FKs de `appointments`
- [x] Role `app_runtime` como pré-requisito de infra (fora da migration versionada)
- [x] Índice parcial de leitura para slots ativos
- [ ] Observabilidade (request-id, `/health`, `/ready`, error tracking) — camada de app/infra, fora do schema

---

## 15. Próximo passo

Materializar os arquivos de migration desta especificação (0001–0006) e o schema Drizzle (`*.ts`)
das tabelas comuns, prontos para `drizzle-kit` + aplicação manual na ordem da seção 12.
