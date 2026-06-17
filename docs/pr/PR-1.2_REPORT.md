# PR-1.2_REPORT — Módulo `db`: `withTenantContext` + `withSystemContext`

## 1. Resumo

- **Status final: PASS** (v2 — correção de seed)
- **Escopo executado:** módulo runtime de banco em `apps/api/src/db` com pool `pg`, Drizzle client, `withTenantContext(orgId, userId, fn)`, `withSystemContext(fn)`, configuração SSL segura, regras ESLint de restrição de import e script de testes de integração RLS (20 testes: 6 write/WITH CHECK + 14 read/isolation, 20 PASS). `set_config` parametrizado em toda implementação. Zero interpolação SQL.
- **Observações relevantes:**
  - `withSystemContext` NÃO é exportado pelo barrel `index.ts` nem exposto via `DbService`. É importável apenas de `system-context.ts`, com ESLint bloqueando imports fora de `src/db/`.
  - Nenhuma dependência nova de teste foi adicionada. Os testes seguem o padrão do PR-1.1: script `.mjs` próprio usando `docker compose exec postgres` + `psql`.
  - Todas as asserções de RLS foram executadas como `app_runtime` (role sem `BYPASSRLS`, sem `SUPERUSER`).
  - **Correção v2:** seeds tenant-scoped agora rodam como `app_runtime` dentro de transação com `set_config` (equivalente SQL do `withTenantContext`). A justificativa anterior sobre "owner não é afetado por RLS sob FORCE" foi removida — com `FORCE ROW LEVEL SECURITY`, owner não-superuser também é submetido à RLS. O que permitia os seeds como admin era o privilégio de superuser do `POSTGRES_USER` do Docker, não uma exceção de owner.

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-1.1 PASS | PASS | `docs/pr/PR-1.1_REPORT.md:5` |
| Migrations 0001–0006 presentes | PASS | `apps/api/db/migrations/000{1..6}_*.sql` |
| Working tree limpo antes da implementação | PASS | `git status --short` vazio |
| `apply-migrations.mjs` | PASS | `apps/api/scripts/apply-migrations.mjs` |
| `gate-setup.sql` | PASS | `apps/api/scripts/gate-setup.sql` |
| `db/schema/index.ts` | PASS | `apps/api/db/schema/index.ts` (16 tabelas) |
| `pnpm-lock.yaml` sincronizado | PASS | `pnpm install --frozen-lockfile` sem alterações |
| Fontes canônicas lidas | PASS | ADR, schema, API, planning, roadmap, exec plan, protocol, bugfix log |

## 3. Arquivos criados/alterados

| Caminho | Tipo | Motivo técnico |
|---|---|---|
| `apps/api/src/db/db.types.ts` | criado | Tipos `DbClient`, `DbTransaction` |
| `apps/api/src/db/db.config.ts` | criado | Factory de `Pool` pg com SSL seguro |
| `apps/api/src/db/db.service.ts` | criado | Serviço NestJS injetável com Drizzle client |
| `apps/api/src/db/tenant-context.ts` | criado | `withTenantContext(orgId, userId, fn)` parametrizado |
| `apps/api/src/db/system-context.ts` | criado | `withSystemContext(fn)` — uso restrito |
| `apps/api/src/db/db.module.ts` | criado | `@Global()` módulo NestJS |
| `apps/api/src/db/index.ts` | criado | Barrel exports (sem `withSystemContext`) |
| `apps/api/src/app.module.ts` | alterado | Importa `DbModule` |
| `apps/api/tsconfig.json` | alterado | `include` adiciona `db/schema/**/*.ts` |
| `apps/api/tsconfig.build.json` | alterado | `rootDir: "."`, `include` com schema |
| `apps/api/package.json` | alterado | Script `test:db` |
| `apps/api/.env.example` | criado | Placeholders `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_CA_CERT` |
| `apps/api/scripts/test-rls.mjs` | criado | Script de testes de integração RLS |
| `eslint.config.mjs` | alterado | Regras `no-restricted-imports`: bloqueia `pg` e `withSystemContext` fora do módulo `db` |
| `docs/pr/PR-1.2_REPORT.md` | criado | Este relatório |

## 4. Implementação

### 4.1 Pool e Drizzle client

- Um único `Pool` (`pg`) criado em `db.config.ts`
- Connection string montada a partir de `DATABASE_URL` ou variáveis `POSTGRES_*`
- `DATABASE_URL` com `sslmode=require` automático em produção
- Drizzle client (`drizzle(pool, { schema })`) criado uma vez em `DbService`
- `DbService` implementa `OnModuleDestroy` para liberar o pool

### 4.2 `withTenantContext`

```ts
withTenantContext<T>(db: DbService, orgId: string, userId: string | null, fn: (tx) => Promise<T>): Promise<T>
```

- Abre transação via `db.client.transaction()`
- `SELECT set_config('app.current_organization_id', $orgId, true)` — parametrizado
- `SELECT set_config('app.current_user_id', $userId ?? '', true)` — parametrizado, usa `''` para null
- Executa callback com a transação Drizzle
- Commit em sucesso, rollback automático em erro (`.transaction()` gerencia)
- `userId: string | null` — null existe para fluxos públicos futuros (sem login); GUC setado como `''` → `NULLIF` retorna `NULL` → RLS nega tenant mas permite `tenant_or_self` ausente

### 4.3 `withSystemContext`

```ts
withSystemContext<T>(db: DbService, fn: (tx) => Promise<T>): Promise<T>
```

- Abre transação
- `SELECT set_config('app.is_system', 'true', true)` — parametrizado, valor hardcoded como string literal
- Executa callback
- Commit/rollback automático

**Restrição:** `withSystemContext` não é exportado de `index.ts` nem exposto por `DbService`. Só pode ser importado de `system-context.ts`. ESLint bloqueia o import fora de `src/db/`.

### 4.4 Regra de lint/import

- `no-restricted-imports` com `paths: [{name: "pg"}]` + `patterns: [{group: ["pg/*"]}]` → bloqueia `pg` fora de `src/db/**`
- `no-restricted-imports` com `patterns: [{group: ["**/system-context", "**/system-context.*"]}]` → bloqueia `withSystemContext` fora de `src/db/**`
- Stale build artifacts (`db/schema/*.js`) adicionados a `ignores` globais

### 4.5 Segurança SSL

```ts
// db.config.ts
function buildSslConfig(): PoolConfig["ssl"] {
  if (process.env.NODE_ENV !== "production") return false;
  const ca = process.env.POSTGRES_CA_CERT;
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}
```

- **Produção:** `rejectUnauthorized: true` (valida certificado). CA customizada via `POSTGRES_CA_CERT` (env var, nunca versionada).
- **Desenvolvimento:** `ssl: false` (Docker Compose local sem TLS).
- **Nunca:** `rejectUnauthorized: false` como default.

## 5. Testes de integração

### Comandos executados

```
pnpm install --frozen-lockfile  →  PASS
pnpm lint                       →  PASS
pnpm --filter @nexos/api build  →  PASS
docker compose up -d postgres   →  Running
pnpm --filter @nexos/api migrate:fresh  →  PASS (0001–0006)
pnpm --filter @nexos/api test:db         →  PASS (20/20)
```

### Resultados — Write / WITH CHECK (6/6 PASS)

| # | Teste | Resultado |
|---|---|---|
| W1 | INSERT com orgId correto e GUC correspondente — sucesso | PASS |
| W2 | INSERT com `organization_id` diferente do GUC — falha (WITH CHECK / FK) | PASS |
| W3 | INSERT sem contexto — falha (RLS nega) | PASS |
| W4 | INSERT em `organization_users` com apenas `user_id` GUC — sucesso (`tenant_or_self`) | PASS |
| W5 | INSERT em `appointment_events` com `withSystemContext` — sucesso | PASS |
| W6 | INSERT em tabela `tenant_isolation` com apenas `is_system` — falha (sem tenant GUC) | PASS |

### Resultados — Read / Isolation (14/14 PASS)

| # | Teste | Resultado |
|---|---|---|
| R1 | Query sem contexto nega linhas (0) | PASS |
| R2 | Query com orgId correto retorna linhas (1+) | PASS |
| R3 | Query com orgId de outro tenant não vê profissional cross-tenant (0) | PASS |
| R4 | Resolver `app_resolve_org_by_slug` funciona sem contexto | PASS |
| R5 | Acesso direto a `organizations` sem contexto negado (0) | PASS |
| R6 | `appointment_events` com `withTenantContext(orgA)` retorna só orgA (1+) | PASS |
| R7 | `appointment_events` com `withSystemContext` retorna todos (2+) | PASS |
| R8 | `idempotency_keys` com `withSystemContext` retorna todos (2+) | PASS |
| R9 | `invitations` com `withSystemContext` retorna todos (2+) | PASS |
| R10 | GUC não vaza entre conexões | PASS |
| R11 | Erro no callback → ROLLBACK, sem vazamento de GUC | PASS |
| R12 | Após erro, próxima chamada não herda GUC | PASS |
| R13 | `tenant_or_self`: usuário vê próprio membership (1+) | PASS |
| R14 | Dados semeados via contexto são visíveis sob mesmo contexto (1+) | PASS |

### Role usada nas asserções de RLS

- **Todas as asserções** (write e read) executadas como **`app_runtime`** (via `-U app_runtime` no psql)
- **Todos os seeds tenant-scoped** (fase 2 e 3) executados como **`app_runtime`** dentro de transação com `set_config` (equivalente SQL do `withTenantContext`)
- `app_runtime` é provisionada por `gate-setup.sql` e **não tem `BYPASSRLS` nem `SUPERUSER`** (confirmado: apenas `LOGIN`, sem atributos especiais)
- Apenas a fase 1 (inserção de `users` — tabela global sem RLS) foi executada como `POSTGRES_USER`
- Nenhuma asserção de isolamento usou owner/superuser

## 6. Seeds

### Fase 1 — Admin (`POSTGRES_USER`)

- **`users`** (tabela global, sem RLS): inseridos 2 registros (User A, User B)

### Fase 2 — Tenant A (`app_runtime` via `set_config`)

Executado como `app_runtime` dentro de `BEGIN; SELECT set_config('app.current_organization_id', ORG_A, true); SELECT set_config('app.current_user_id', USER_A, true); ... COMMIT;`:

- `organizations` (1 registro: Org A)
- `organization_users` (1 registro: User A como OWNER)
- `professionals` (1 registro: Prof A)
- `services` (1 registro: Corte A)
- `clients` (1 registro: Cliente A)
- `appointments` (1 registro)
- `appointment_events` (1 registro)
- `idempotency_keys` (1 registro)
- `invitations` (1 registro)

### Fase 3 — Tenant B (`app_runtime` via `set_config`)

Executado como `app_runtime` dentro de transação equivalente para ORG_B / USER_B. Dados equivalentes aos da fase 2.

### Confirmação

- Seeds tenant-scoped foram criados **sob contexto de tenant** (`set_config` com GUCs), como `app_runtime`
- O padrão de onboarding (setar GUC com o ID da org antes do INSERT) foi usado para `organizations`, provando que a política `tenant_or_member` permite INSERT quando o GUC casa com o ID
- As asserções de leitura e escrita foram executadas como `app_runtime` (não-owner)
- **Correção:** a versão anterior deste relatório afirmava incorretamente que "o owner não é afetado por RLS sob FORCE". Com `FORCE ROW LEVEL SECURITY`, owner não-superuser **é** submetido à RLS. O que permitia os seeds como admin na versão anterior era o privilégio de superuser do `POSTGRES_USER` do Docker, não uma exceção de owner. Esta versão do script realiza os seeds corretamente como `app_runtime` via `set_config`.

## 7. Provas negativas

| Prova | Descrição | Resultado |
|---|---|---|
| N1 | Consulta sem contexto como `app_runtime` retorna zero | PASS (T1) |
| N2 | Tenant cruzado como `app_runtime` não enxerga dado | PASS (T3) |
| N3 | `import { Pool } from 'pg'` fora de `src/db` bloqueado por lint | PASS (ESLint: `no-restricted-imports`) |
| N4 | `import { withSystemContext } from '...system-context'` fora de paths permitidos bloqueado por lint | PASS (ESLint: `no-restricted-imports`) |
| N5 | `grep -r "SET LOCAL" apps/api/src/` — zero ocorrências | PASS |
| N6 | `withSystemContext` não exportado do barrel `index.ts` | PASS |
| N7 | Testes de RLS não executados como owner/superuser | PASS (confirmado: `app_runtime`) |

## 8. Escopo proibido — confirmação

Confirmo que **NÃO** foi criado:

- Auth (register, login, tokens, guards)
- Controllers de negócio
- Services de domínio
- Repositories de domínio
- DTOs de negócio
- Endpoints HTTP
- UI / frontend
- Migrations (0001–0006 preservadas)
- Seeds permanentes / dados fake versionados
- Jobs reais / `@Cron`
- Filtro global de erro
- Rate limiter
- Runner de teste (Vitest/Jest)

## 9. Segurança de conexão

- **Produção:** `rejectUnauthorized: true` + CA opcional via `POSTGRES_CA_CERT`
- **Desenvolvimento:** `ssl: false`
- **Nenhum** `rejectUnauthorized: false` como default
- **Nenhum** segredo versionado

## 10. Dependências

- **Nenhuma dependência nova** adicionada
- `pg`, `drizzle-orm`, `@types/pg`, `drizzle-kit` já existiam do PR-1.1
- `pnpm install --frozen-lockfile` → `Already up to date`
- `tsx` já existia como devDependency (não foi necessário para os testes — script `.mjs` puro)

## 11. Divergências

**Ajuste metodológico (v2):** a versão inicial do script de teste inseria dados tenant-scoped como admin (POSTGRES_USER), com a justificativa incorreta de que "o owner não é afetado por RLS mesmo com FORCE". Com `FORCE ROW LEVEL SECURITY`, owner não-superuser também é submetido à RLS. O que permitia os INSERTs como admin era o privilégio de superuser do `POSTGRES_USER` no Docker, não uma propriedade do owner.

Correção aplicada:
- Seeds tenant-scoped (fases 2 e 3) passaram a rodar como `app_runtime` dentro de transação com `set_config` (equivalente SQL do `withTenantContext`)
- O padrão de onboarding (setar GUC antes do INSERT de `organizations`) foi validado na prática
- Testes de escrita/WITH CHECK (W1–W6) foram adicionados para provar o lado de escrita da RLS
- A justificativa incorreta foi removida do relatório

Nenhuma divergência entre documentos canônicos foi encontrada.

## 12. Resultado final

- **Veredito do executor: PASS.**
- **Pronto para revisão: sim.**
- **Nenhum commit foi feito** (conforme instrução). Commit/abertura de PR fica a cargo do responsável.
- **Gate completo:** lint verde, build verde, migrate:fresh verde, 20/20 testes RLS PASS (6 write + 14 read), 7/7 provas negativas PASS.
- **Seeds tenant-scoped sob contexto:** confirmado — executados como `app_runtime` via `set_config`.
