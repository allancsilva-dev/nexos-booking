# PR-BUGFIX-1 — Auth session web bugfix

Data: 2026-06-22

Status: **PASS_COM_RESSALVA** (gate humano antes de commit; CI/e2e web pendente)

## Escopo

Correção frontend pós-MVP para:

- BUG-010: register/login não recompunham o estado do `AuthBootstrap` sem reload.
- BUG-013: `OrgSwitcher` usava campo incompatível com o contrato de organizações.
- BUG-014: register/login precisavam delegar a sessão final para `/auth/me`.

Arquivos de código no escopo:

- `apps/web/app/providers.tsx`
- `apps/web/components/shell/org-switcher.tsx`
- `apps/web/hooks/use-auth-bootstrap.ts`
- `apps/web/hooks/use-auth.ts`

Arquivos documentais no escopo:

- `docs/pr/PR-BUGFIX-1.md`
- `docs/BUGFIX_LOG.md`

## Desenho Implementado

O contexto de bootstrap expõe `refreshSession(token)` e mantém `setResult` interno ao provider. As mutations de register/login salvam somente dados mínimos:

- register valida `accessToken`, salva `accessToken`, salva `organization.id` como `savedOrgId` e chama `refreshSession(token)`;
- login valida `accessToken`, salva `accessToken` e chama `refreshSession(token)`;
- register/login não montam sessão completa a partir do body;
- `/auth/me` é a fonte única de `user`, `activeOrg` e `memberships`;
- `MeResponse` vindo do shared define o shape final consumido pelo frontend.

`refreshSession()` chama `GET /auth/me`:

- sucesso com `me.activeOrg != null`: estado `authenticated`;
- sucesso com `me.activeOrg == null`: estado `idle` com dados suficientes para org-pick/`OrgSwitcher`;
- se houver `savedOrgId`, o switch automático só promove depois de reconsultar `/auth/me` com o token atualizado;
- 401/403 ou sessão inválida: `clearAuth()` e estado não autenticado/erro conforme o código;
- rede/5xx/parse: estado `error`/indisponibilidade;
- nenhum caminho de falha promove para `authenticated`;
- nenhuma falha de `refreshSession()` vaza como unhandled rejection para `onSuccess`.

`AuthGuard` preserva os três estados funcionais:

- anônimo;
- autenticado sem org ativa, que permanece em org-pick/`OrgSwitcher`;
- autenticado com org ativa, que libera children/dashboard.

## Arquivos Confirmados Sem Diff

- `apps/web/lib/auth-schemas.ts`: revertido e sem diff; não há tipo provisório de resposta de login/register no arquivo.
- `apps/web/stores/auth-store.ts`: sem diff.
- `apps/api/**`: sem diff.
- `packages/**`: sem diff.
- `.github/workflows/**`: sem diff.

## BUG-018

BUG-018 está registrado como **MÉDIA / ABERTO** no ledger:

**Switch-org não recompõe sessão no frontend após troca de organização.**

O bug é funcional e real do fluxo multi-org:

- `useSwitchOrgMutation` não chama `refreshSession()` após sucesso;
- o contexto de `AuthBootstrap` pode continuar com dados anteriores após a troca de organização;
- fica fora do escopo do PR-BUGFIX-1;
- não foi mascarado como NOTE.

## Roll-call de Pendências

- PEND-CI-WEB: não existe CI/e2e web; não há PASS pleno.
- BUG-018: aberto/deferido para PR específico de multi-org.
- BUG-011: cookie `Secure` em dev HTTP.
- BUG-012: role/RLS.
- BUG-015: `pg_trgm`.
- BUG-016: `path-to-regexp`.
- BUG-017: harness idempotency.

## Validações

| Validação | Resultado |
|---|---|
| `pnpm --filter @nexos/web lint` | PASS |
| `pnpm --filter @nexos/web exec tsc --noEmit` | PASS |
| `git diff -- apps/web/lib/auth-schemas.ts` | VAZIO |
| `git diff -- apps/web/stores/auth-store.ts` | VAZIO |
| `git diff -- apps/api` | VAZIO |
| `git diff -- packages` | VAZIO |
| `git diff -- .github/workflows` | VAZIO |

## Reauditoria

### code-reviewer

Resultado: **PASS_COM_RESSALVA**

Pontos verificados:

- NOTE-1 resolvida: `refreshSession()` captura erro abrupto de rede/parse, atualiza estado para não autenticado/erro e retorna sem rejeição não tratada.
- `onSuccess` de register/login aguarda `refreshSession(token)`, mas `refreshSession()` não propaga falha inesperada.
- falha de `/auth/me` nunca promove `authenticated`;
- register/login não sintetizam sessão a partir do body;
- `auth-schemas.ts`, `auth-store.ts`, `apps/api/**` e `packages/**` sem diff;
- BUG-018 registrado como bug real aberto, fora do escopo.

### api-contract-guardian

Resultado: **PASS**

Pontos verificados:

- `/auth/me` é fonte única de `user`, `activeOrg` e `memberships`;
- register/login não criam sessão completa;
- ADR-020 preservado;
- multi-org sem active org vai para `idle`/org-pick;
- single-org com active org vai para `authenticated`;
- `auth-schemas.ts` permanece sem redeclaração de tipo local de resposta de login.

## Prova Negativa

**NÃO EXECUTADO** — ramo de falha escrito e revisado por código, mas não exercitado por navegador/e2e. Pendente de CI web/e2e.

Evidência por código:

- `!meRes.ok` em `/auth/me` chama `clearAuth()` e define `idle`/`error`;
- falha abrupta no `fetch`/parse é capturada por `catch`, chama `clearAuth()` e define `error: "API unavailable"`;
- register/login não usam body como fallback para montar `user`, `activeOrg` ou `memberships`.

## Gate

Commit ainda **não realizado**.

Veredito atual: **PASS_COM_RESSALVA**.
