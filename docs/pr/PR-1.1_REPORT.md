# PR-1.1_REPORT — Migrations 0002–0006 (schema completo)

## 1. Resumo

- **Status final: PASS**
- **Escopo executado:** materializado o schema inteiro do MVP no banco, na ordem da seção 12 do `DATABASE_SCHEMA_V2.md`: migration 0002 (tabelas via Drizzle), 0003 (constraints avançadas, FKs compostas tenant-safe, EXCLUDE, uniques parciais), 0004 (índices de leitura), 0005 (triggers `set_updated_at`) e 0006 (funções SECURITY DEFINER, resolvers públicos ADR-017, ENABLE/FORCE RLS, políticas de tenant/sistema/auditoria e hardening de segurança ADR-021). Drizzle configurado em `apps/api` com `drizzle-orm` + `drizzle-kit`; schema TypeScript cobre as 16 tabelas.
- **Gate de migrations:** executado com sucesso. Sequência completa 0001→0006 aplicada do zero em banco limpo. Queries de catálogo confirmam 16 tabelas, 56 constraints, 54 índices, 8 triggers, funções canônicas, RLS em 13 tabelas e 14 políticas. 5 provas negativas executadas, todas PASS.
- **Observações relevantes:**
  - `CREATE ROLE app_runtime` NÃO está em migration versionada. A role é provisionada exclusivamente em `apps/api/scripts/gate-setup.sql`, executado como pré-requisito do gate (`--gate-setup`). Em produção, a role é provisionada por infra/IaC conforme `DATABASE_SCHEMA_V2.md` §10.2.
  - `appointments.version` é gerida pela aplicação (compare-and-swap), NÃO por trigger — confirmado na 0005 e verificado no catálogo (sem trigger em `version`).
  - Índice GIN `pg_trgm` de `clients.name` NÃO foi adicionado (Fase 6 — PR-6.3).

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-0.1 confirmado | PASS | `docs/pr/PR-0.1_REPORT.md:4` registra `Status: PASS` |
| PR-0.2 confirmado como PASS | PASS | `docs/pr/PR-0.2_REPORT.md:4` registra `Status: PASS` |
| PR-0.3 confirmado como PASS | PASS | `docs/pr/PR-0.3_REPORT.md:5` registra `Status final: PASS` |
| Migration 0001 existe | PASS | `apps/api/db/migrations/0001_extensions_types_enums.sql` |
| Runner de migrations existe | PASS | `apps/api/scripts/apply-migrations.mjs` |
| `packages/shared` builda | PASS | Confirmado no PR-0.3 |
| Working tree limpo | PASS | Protocolo v1.1 commitado separadamente (`d15d34e`) antes do PR-1.1 |
| Auditoria de desenho aprovada | PASS | Mapa técnico completo registrado; status `APTA PARA IMPLEMENTAÇÃO` |
| Fontes canônicas lidas | PASS | `ARCHITECTURE_DECISIONS.md`, `DATABASE_SCHEMA_V2.md`, `API_CONTRACTS.md`, `PLANNING.md`, `IMPLEMENTATION_ROADMAP.md`, `MVP_EXECUTION_PLAN.md`, `EXECUTION_PROMPT_PROTOCOL.md`, `BUGFIX_LOG.md` |

## 3. Arquivos criados/alterados

| Caminho | Tipo | Motivo técnico |
|---|---|---|
| `apps/api/package.json` | alterado | Dependências `drizzle-orm`, `pg` (runtime) + `drizzle-kit`, `@types/pg` (dev); script `migrate:fresh` com `--gate-setup` |
| `pnpm-lock.yaml` | alterado | Lockfile atualizado com novas dependências |
| `apps/api/scripts/apply-migrations.mjs` | alterado | Flag `--gate-setup`: executa `gate-setup.sql` antes das migrations para provisionar `app_runtime` |
| `apps/api/scripts/gate-setup.sql` | criado | Provisionamento de `app_runtime` para gate/CI (NÃO é migration; produção usa IaC) |
| `apps/api/drizzle.config.ts` | criado | Configuração do drizzle-kit (dialeto postgresql, schema path) |
| `apps/api/db/schema/index.ts` | criado | Schema Drizzle: 16 tabelas, FKs simples, índices btree, chaves `UNIQUE (org,id)`, PK composta, self-ref FK |
| `apps/api/db/migrations/0002_tables.sql` | criado | Gerado por `drizzle-kit generate` (243 linhas) |
| `apps/api/db/migrations/0003_advanced_constraints.sql` | criado | Manual: 8 FKs compostas tenant-safe, 3 CHECKs intervalo, 3 CHECKs semânticos, 2 EXCLUDE, 4 uniques parciais |
| `apps/api/db/migrations/0004_read_indexes.sql` | criado | Manual: 5 índices de leitura (parciais e btree) |
| `apps/api/db/migrations/0005_triggers.sql` | criado | Manual: `set_updated_at()` + 8 triggers |
| `apps/api/db/migrations/0006_functions_and_rls.sql` | criado | Manual: `app_is_member` + 3 resolvers + ENABLE/FORCE RLS em 13 tabelas + 5 políticas + hardening |
| `apps/api/db/migrations/meta/` | criado | Journal do drizzle-kit |
| `docs/pr/PR-1.1_REPORT.md` | criado | Este relatório (v3 — final) |

## 4. Migrations — detalhamento

### 4.1 0002 — tabelas (Drizzle generate, 243 linhas)

| Tabela | Escopo | PK | Chave `(org,id)` | Observações |
|---|---|---|---|---|
| `users` | global | `id` | — | `email` unique case-insensitive |
| `refresh_sessions` | global | `id` | — | self-ref FK `replaced_by` |
| `verification_tokens` | global | `id` | — | |
| `organizations` | identity | `id` | — | `slug` unique case-insensitive |
| `organization_users` | identity | `id` | — | unique `(org, user)` |
| `invitations` | operational | `id` | — | unique `token_hash`; unique parcial na 0003 |
| `professionals` | operational | `id` | sim | `slug` unique por org; unique parcial (user) na 0003 |
| `services` | operational | `id` | sim | |
| `professional_services` | operational | `(professional_id, service_id)` | — | |
| `working_hours` | operational | `id` | — | FK simples → profissionais (substituída na 0003) |
| `availability_blocks` | operational | `id` | — | FK simples → profissionais (substituída na 0003) |
| `clients` | operational | `id` | sim | `phone_normalized` NULLABLE; unique parcial na 0003 |
| `appointments` | operational | `id` | sim | `version` DEFAULT 1; `ON DELETE RESTRICT`; FK composta na 0003 |
| `appointment_events` | operational | `id` | — | `publish_failed_at`; FK composta na 0003 |
| `idempotency_keys` | operational | `id` | — | `response_status_code`; unique `(org, key, route)` |
| `audit_logs` | operational | `id` | — | `organization_id` NULLABLE; `action` text |

### 4.2 0003 — constraints avançadas

| Categoria | Qtde | Itens |
|---|---|---|
| FKs compostas tenant-safe | 8 | `appointments` (3), `professional_services` (2), `working_hours` (1), `availability_blocks` (1), `appointment_events` (1) |
| CHECKs de intervalo | 3 | `chk_interval`, `chk_shift_interval`, `chk_block_interval` |
| CHECKs semânticos | 3 | `chk_cancelled_by`, `chk_cancel_token_pair`, `chk_actor_user` |
| EXCLUDE | 2 | `no_overlap` (appointments), `no_shift_overlap` (working_hours) |
| Uniques parciais | 4 | `appointments_cancel_token_uk`, `clients_org_phone_uk`, `professionals_org_user_uk` (B1), `invitations_org_email_pending_uk` |

### 4.3 0004 — índices de leitura

| Índice | Tipo | Predicado WHERE |
|---|---|---|
| `appointments_active_slots_idx` | btree parcial | `status IN ('SCHEDULED','CONFIRMED')` |
| `appointments_org_starts_idx` | btree | — |
| `appointments_client_idx` | btree | — |
| `appointment_events_unpublished_idx` | btree parcial | `published_at IS NULL AND publish_failed_at IS NULL` |
| `refresh_sessions_active_idx` | btree parcial | `revoked_at IS NULL` |

### 4.4 0005 — triggers

Função `set_updated_at()` + 8 triggers BEFORE UPDATE. Tabelas: `users`, `organizations`, `organization_users`, `professionals`, `services`, `working_hours`, `clients`, `appointments`. `appointments.version` NÃO é tocada por trigger.

### 4.5 0006 — functions, resolvers, RLS e hardening

| Categoria | Qtde | Detalhe |
|---|---|---|
| Funções SECURITY DEFINER | 4 | `app_is_member` + 3 resolvers públicos (`app_resolve_org_by_slug`, `app_resolve_appointment_by_cancel_hash`, `app_resolve_invitation_by_hash`) |
| Tabelas com ENABLE+FORCE RLS | 13 | `organizations`, `organization_users`, `professionals`, `services`, `professional_services`, `working_hours`, `availability_blocks`, `clients`, `appointments`, `audit_logs`, `appointment_events`, `idempotency_keys`, `invitations` |
| Políticas | 5 tipos | `tenant_isolation` (8 tabelas), `tenant_or_system` (3), `tenant_or_member` (organizations), `tenant_or_self` (organization_users), `global_security_events` (audit_logs INSERT) |
| Leitura defensiva de GUC | A3 | `NULLIF(current_setting(...), '')::uuid` + `COALESCE(NULLIF(...)::boolean, false)` em toda policy |
| Hardening ADR-021 | 5 | `REVOKE ALL ON SCHEMA public FROM PUBLIC`, `GRANT USAGE TO app_runtime`, `REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime`, `statement_timeout = 8s`, `idle_in_transaction_session_timeout = 15s` |

## 5. Provisionamento de `app_runtime` (fora da migration)

| Local | Papel |
|---|---|
| `apps/api/scripts/gate-setup.sql` | Provisiona `app_runtime` para o gate/CI (criação condicional `IF NOT EXISTS`, sem senha real, grants mínimos). Executado pelo runner com `--gate-setup` antes das migrations. |
| `apps/api/scripts/apply-migrations.mjs` | Flag `--gate-setup` executa `gate-setup.sql` como superuser após criar o banco, antes de aplicar as migrations. |
| `apps/api/package.json` | `migrate:fresh` = `--fresh --gate-setup` |
| Produção | `app_runtime` provisionada por infra/IaC (§10.2). `gate-setup.sql` NÃO é executado em produção. |

## 6. Validações executadas

| Comando | Resultado | Evidência |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | `Lockfile is up to date`; exit code 0 |
| `pnpm lint` | PASS | `turbo run lint` → `Tasks: 3 successful, 3 total` |
| `pnpm --filter @nexos/api build` | PASS | `tsc -p tsconfig.build.json` sem erros |
| `pnpm --filter @nexos/api exec drizzle-kit generate` | PASS | 16 tabelas, 0 erros, 243 linhas SQL |
| `docker compose up -d postgres` | PASS | Container `nexos-booking-postgres` Up (healthy) |
| `pnpm --filter @nexos/api migrate:fresh` | PASS | 6 migrations aplicadas em ordem: 0001→0002→0003→0004→0005→0006 |
| `docker compose ps` | PASS | Postgres `Up ... (healthy)` na porta 5432 |

## 7. Validação por catálogo (resultados nominais)

### 7.1 Tabelas — 16/16
`appointment_events`, `appointments`, `audit_logs`, `availability_blocks`, `clients`, `idempotency_keys`, `invitations`, `organization_users`, `organizations`, `professional_services`, `professionals`, `refresh_sessions`, `services`, `users`, `verification_tokens`, `working_hours`.

### 7.2 Constraints — 56
- **PKs (16):** todas as tabelas
- **FKs (25):** incluindo 8 FK compostas tenant-safe (`appointments_professional_fk`, `appointments_service_fk`, `appointments_client_fk`, `professional_services_professional_fk`, `professional_services_service_fk`, `working_hours_professional_fk`, `availability_blocks_professional_fk`, `appointment_events_appointment_fk`)
- **CHECKs (6):** `chk_interval`, `chk_shift_interval`, `chk_block_interval`, `chk_cancelled_by`, `chk_cancel_token_pair`, `chk_actor_user`
- **EXCLUDEs (2):** `no_overlap`, `no_shift_overlap`
- **UNIQUEs (4):** `appointments_org_id_uk`, `clients_org_id_uk`, `professionals_org_id_uk`, `services_org_id_uk`

### 7.3 Índices — 54
Inclui todos os esperados: `appointments_active_slots_idx` (parcial), `appointments_cancel_token_uk` (parcial), `appointment_events_unpublished_idx` (parcial), `clients_org_phone_uk` (parcial), `professionals_org_user_uk` (parcial — B1), `invitations_org_email_pending_uk` (parcial), `refresh_sessions_active_idx` (parcial).

### 7.4 Triggers — 8
`trg_users_updated_at`, `trg_organizations_updated_at`, `trg_organization_users_updated_at`, `trg_professionals_updated_at`, `trg_services_updated_at`, `trg_working_hours_updated_at`, `trg_clients_updated_at`, `trg_appointments_updated_at`. Nenhum trigger em `appointments.version`.

### 7.5 Functions — 5 (aplicação)
`app_is_member`, `app_resolve_appointment_by_cancel_hash`, `app_resolve_invitation_by_hash`, `app_resolve_org_by_slug`, `set_updated_at`.

### 7.6 RLS — 13 tabelas (todas com `relrowsecurity=true` AND `relforcerowsecurity=true`)
`appointment_events`, `appointments`, `audit_logs`, `availability_blocks`, `clients`, `idempotency_keys`, `invitations`, `organization_users`, `organizations`, `professional_services`, `professionals`, `services`, `working_hours`.

### 7.7 Policies — 14 (por tabela)

| Tabela | Policy | Comando |
|---|---|---|
| `appointment_events` | `tenant_or_system` | ALL |
| `appointments` | `tenant_isolation` | ALL |
| `audit_logs` | `global_security_events` | INSERT |
| `audit_logs` | `tenant_isolation` | ALL |
| `availability_blocks` | `tenant_isolation` | ALL |
| `clients` | `tenant_isolation` | ALL |
| `idempotency_keys` | `tenant_or_system` | ALL |
| `invitations` | `tenant_or_system` | ALL |
| `organization_users` | `tenant_or_self` | ALL |
| `organizations` | `tenant_or_member` | ALL |
| `professional_services` | `tenant_isolation` | ALL |
| `professionals` | `tenant_isolation` | ALL |
| `services` | `tenant_isolation` | ALL |
| `working_hours` | `tenant_isolation` | ALL |

## 8. Provas negativas — 5/5 PASS

| Prova | Descrição | Resultado | Evidência |
|---|---|---|---|
| 1 | Migration inválida quebra o runner | PASS | `ERROR: syntax error at or near "THIS"` ao aplicar SQL inválido; runner exit code != 0 |
| 2 | `no_overlap` bloqueia sobreposição | PASS | `conflicting key value violates exclusion constraint "no_overlap"` — INSERT 09:15-09:45 rejeitado por conflito com 09:00-09:30 |
| 3 | `no_shift_overlap` bloqueia turnos sobrepostos | PASS | `conflicting key value violates exclusion constraint "no_shift_overlap"` — turno 11:00-14:00 rejeitado por conflito com 09:00-12:00 |
| 4 | FK composta tenant-safe bloqueia cruzamento de tenant | PASS | `violates foreign key constraint "appointments_professional_fk"` — professional do tenant 2 rejeitado em appointment do tenant 1 |
| 5 | `audit_logs` append-only bloqueia UPDATE e DELETE como `app_runtime` | PASS | `permission denied for table audit_logs` tanto para UPDATE quanto para DELETE; INSERT permitido como owner |

## 9. Escopo proibido — confirmação

Confirmo que **NÃO** foi criado:

- `CREATE ROLE app_runtime` em migration versionada (verificado com `rg`: sem ocorrências na 0006)
- Senha de banco em qualquer arquivo versionado
- Grants sensíveis de ambiente em migration
- Provisionamento de owner com `BYPASSRLS`
- Rollback/down
- `DROP SCHEMA` / `DROP TYPE`
- Seed / dados fake
- Índice GIN `pg_trgm` em `clients.name` (Fase 6 — PR-6.3)
- Colunas de buffers/overrides em `professional_services` (futuro)
- `organization_booking_settings` (futuro)
- Controllers, services, repositories, DTOs, guards, auth, endpoints HTTP
- `withTenantContext` / `withSystemContext` (PR-1.2)
- Filtro global de erro (PR-1.3)
- Rate limiter (PR-1.4)
- Alteração em `packages/shared`
- Alteração em documentos canônicos

## 10. Gate transversal

| Gate | Status | Observação |
|---|---|---|
| CI/local lint + build verdes | PASS | `pnpm lint` e `pnpm build` |
| Migration do zero | PASS | 0001–0006 aplicadas em banco limpo |
| Catalog queries | PASS | 16 tabelas, 56 constraints, 54 índices, 8 triggers, 5 functions, 13×RLS, 14 policies |
| Provas negativas | PASS | 5/5 (migration inválida, no_overlap, no_shift_overlap, FK tenant-safe, audit_logs append-only) |
| `CREATE ROLE` fora da migration | PASS | Confirmado por `rg` |
| `pnpm install --frozen-lockfile` | PASS | Lockfile validado |
| Zero PII/segredo/token | PASS | Nenhum segredo versionado |

## 11. Resultado final

- **Veredito do executor: PASS.**
- **Gate completo:** migrate:fresh aplicou 0001→0006 do zero. Catálogo 100% verificado. 5 provas negativas executadas com sucesso.
- **Pronto para fechamento: sim.**
- **Nenhum commit foi feito** (conforme instrução). Commit/abertura de PR fica a cargo do responsável.
