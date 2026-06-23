# BUGFIX_LOG — Registro de erros e correções (`nexos-booking`)

> Documento vivo. Registra **durante o desenvolvimento** todo erro encontrado e sua correção, do mais
> simples ao crítico. Objetivo: rastreabilidade ("o que quebrou, por quê, como foi corrigido e como
> sabemos que está resolvido") sem depender de memória.
>
> Regras de uso:
> - Um erro = uma entrada. Não agrupar erros distintos numa linha só.
> - Preencher **todos** os campos. "Não se aplica" é uma resposta válida e explícita; campo em branco não.
> - **Nunca** registrar PII crua (telefone, e-mail, nome de cliente), segredo, token ou stack com dados
>   sensíveis. Telefone, se inevitável, vai mascarado. Referenciar por ID/`requestId`.
> - Se o erro for uma **divergência entre documentos** descoberta na execução, registrar aqui e apontar
>   qual documento prevalece (hierarquia no `MVP_EXECUTION_PLAN.md`) **antes** de avançar.
> - Status possível: `ABERTO` · `EM_ANÁLISE` · `CORRIGIDO` · `VALIDADO` · `NÃO_REPRODUZ` · `ACEITO_COMO_PENDÊNCIA`.
> - Severidade: `BLOQUEANTE` · `ALTA` · `MÉDIA` · `BAIXA`.

---

## Como preencher uma entrada (campos obrigatórios)

- **ID:** `BUG-NNN` (sequencial).
- **Data:** quando foi encontrado.
- **PR/Fase:** em qual PR/fase o erro apareceu (ex.: `PR-3.3` / Fase 3).
- **Severidade:** `BLOQUEANTE`/`ALTA`/`MÉDIA`/`BAIXA`.
- **Erro encontrado:** descrição objetiva do que falhou.
- **Sintoma:** como se manifestou (mensagem, status HTTP, comportamento observado, `requestId`).
- **Causa raiz:** a origem real, não o sintoma.
- **Impacto:** o que/quem é afetado (dado, fluxo, segurança, tenant, usuário).
- **Arquivo(s) afetado(s):** caminhos tocados.
- **Correção aplicada:** o que foi mudado para resolver.
- **Teste/validação executado:** como se provou que está resolvido (teste, comando, evidência).
- **Branch/commit relacionado** *(opcional):* onde a correção foi aplicada (branch, PR, hash).
- **Prevenção de regressão** *(opcional):* qual teste/guard impede o bug de voltar.
- **Status final:** estado da entrada ao fechar.

---

## Modelo de entrada (copiar para cada novo bug)

```
### BUG-000 — <título curto>
- Data: AAAA-MM-DD
- PR/Fase: PR-X.Y / Fase N
- Severidade: BLOQUEANTE | ALTA | MÉDIA | BAIXA
- Erro encontrado:
- Sintoma:
- Causa raiz:
- Impacto:
- Arquivo(s) afetado(s):
- Correção aplicada:
- Teste/validação executado:
- Branch/commit relacionado: (opcional)
- Prevenção de regressão: (opcional — qual teste impede o retorno)
- Status final: ABERTO | EM_ANÁLISE | CORRIGIDO | VALIDADO | NÃO_REPRODUZ | ACEITO_COMO_PENDÊNCIA
```

---

## Índice de bugs

| ID | Data | PR/Fase | Severidade | Título | Status |
|---|---|---|---|---|---|
| BUG-001 | 2026-06-13 | PR-0.1 / Fase 0 | BAIXA | Comando de secret scan amplo gera falso positivo em docs/relatório | CORRIGIDO |
| BUG-002 | 2026-06-13 | PR-0.2 / Fase 0 | BAIXA | `pnpm audit` não executável no ambiente sandbox do executor | ACEITO_COMO_PENDÊNCIA |
| BUG-003 | 2026-06-17 | PR-1.3 / Fase 1 | BLOQUEANTE | GitHub Actions secret scan falha por checkout raso (shallow clone sem histórico git) | CORRIGIDO |
| BUG-004 | 2026-06-17 | PR-1.4 / Fase 1 | BLOQUEANTE | CI: test:db falha com `relation "users" does not exist` — migrations aplicadas em banco diferente dos testes | CORRIGIDO |
| BUG-005 | 2026-06-17 | PR-1.4 / Fase 1 | BLOQUEANTE | CI: test:http T14/T24 falham 503 — harness HTTP constrói DATABASE_URL com defaults errados, ignorando POSTGRES_* do CI | CORRIGIDO |
| BUG-006 | 2026-06-17 | PR-1.4 / Fase 1 | BLOQUEANTE | CI: test:auth comandos psql diretos usam credenciais hardcoded (`nexos_booking`) em vez de `process.env.POSTGRES_*` | CORRIGIDO |
| BUG-007 | 2026-06-19 | PR-1.4 / Fase 1 | ALTA | `AuthService.generateSlug()` usa check-then-insert (SELECT → INSERT), viola ADR-011. Colisão de slug pode virar 500. | ABERTO |
| BUG-008 | 2026-06-20 | PR-1.4 / Fase 1 | MÉDIA | Auth DTOs (`LoginInput`, `RegisterInput`, `SwitchOrgInput`, `MeResponse`) ausentes de `packages/shared`, divergindo de API §12/§21. Herdado do PR-1.4. Corrigido no PR-6.4 (shared `auth.dto.ts` + uso em runtime API/web). | CORRIGIDO |
| BUG-009 | 2026-06-22 | PR-1.4 / Fase 1 | MÉDIA | `AuthService` instancia `new MemoryRateLimiter()` inline (PR-1.4), divergindo do contrato que prevê `RateLimiter` como interface trocável via DI. Troca para Redis exigirá corrigir AuthService. PR-4.1 não corrige; registra provider próprio no PublicBookingModule. | ABERTO |
| DIV-PR-4.3-DESIGN-SPEC | 2026-06-22 | PR-4.3 / Fase 4 | MÉDIA | `nexos-booking-design-spec.md` ausente. PR-4.3 usa `FRONTEND_DESIGN_REF.md` como fallback operacional. Revisão humana limitada a roadmap + acessibilidade + contrato das APIs públicas. Quando a design spec primária existir, o fluxo público deve ser reconciliado contra ela. | ABERTO |
| PROPOSTA-001 | 2026-06-20 | PR-2.1 / Fase 2 | MÉDIA | Proposta de novo ErrorCode `PROFESSIONAL_USER_TAKEN` (409). Aprovado pelo api-contract-guardian — adicionado ao catálogo em `packages/shared/src/error-code.ts`. API_CONTRACTS.md §7 deve ser atualizado para incluir `PROFESSIONAL_USER_TAKEN` na categoria Profissionais. (Unique parcial `professionals_org_user_uk` — B1 do schema.) | ABERTO (canonical doc pendente) |
| PROPOSTA-002 | 2026-06-20 | PR-3.2 / Fase 3 | MÉDIA | Proposta de novo ErrorCode `IDEMPOTENCY_KEY_REQUIRED` (400). Header `Idempotency-Key` ausente em rota `@Idempotent()`. Aprovado pelo api-contract-guardian — deve ser adicionado a `packages/shared/src/error-code.ts` (400, envelope padrão). API_CONTRACTS.md §7 deve ser atualizado para incluir `IDEMPOTENCY_KEY_REQUIRED` na categoria Idempotência. (Header obrigatório — ADR-008 v3 / §5.) | ABERTO (canonical doc pendente) |
| BUG-010 | 2026-06-22 | PR-BUGFIX-1 / pós-MVP | BLOQUEANTE | Web não promove a sessão a `authenticated` após register/login — `AuthBootstrap` roda só na montagem do provider | CORRIGIDO |
| BUG-011 | 2026-06-22 | PR-DIAG-AUTH-FLOW / pós-MVP | BLOQUEANTE | Cookie de refresh `Secure` não é persistido pelo browser em dev sobre HTTP — sessão nunca sobrevive a reload | ABERTO |
| BUG-012 | 2026-06-22 | PR-DIAG-AUTH-FLOW / pós-MVP | ALTA | API conecta como superuser `nexos_booking` (bypassrls) — RLS efetivamente ignorada; falta paridade com `app_runtime` (PEND-001 canônico) | ABERTO |
| BUG-013 | 2026-06-22 | PR-BUGFIX-1 / pós-MVP | MÉDIA | `org-switcher` versionado usa `org.id`; `/organizations/me` devolve `organizationId` — seletor de empresa quebrado no HEAD | CORRIGIDO |
| BUG-014 | 2026-06-22 | PR-BUGFIX-1 / pós-MVP | MÉDIA | `useLoginMutation` não persiste `savedOrgId`/`activeOrg` — multi-org perde o hint de empresa no bootstrap | CORRIGIDO |
| BUG-015 | 2026-06-22 | PR-DIAG-AUTH-FLOW / pós-MVP | BAIXA | Extensão `pg_trgm` ausente na base — migration 0007 fora de paridade com o schema | ABERTO |
| BUG-016 | 2026-06-22 | PR-DIAG-AUTH-FLOW / pós-MVP | BAIXA | WARN path-to-regexp v8 no exclude de rota `__test/(.*)` durante o bootstrap | ABERTO |
| BUG-017 | 2026-06-22 | PR-DIAG-AUTH-FLOW / pós-MVP | MÉDIA | `test:idempotency` T18b (heurística textual falso-negativa) e T24 (fixture FK sem org-pai) — defeitos do harness, não do código (PEND-003) | ABERTO |
| PROPOSTA-C1 | 2026-06-22 | PR-BUGFIX-1 / pós-MVP | MÉDIA | Proposta de alinhar `API_CONTRACTS.md` §8 para refletir explicitamente `activeOrg: string \| null` no LoginResponse conforme ADR-020 que prevalece | ABERTO |
| BUG-018 | 2026-06-22 | PR-BUGFIX-1 / pós-MVP | MÉDIA | Switch-org não recompõe sessão no frontend após troca de organização — bug funcional do ramo multi-org, deferido (PR-BUGFIX-1 corrige single-org pós-register/login) | ABERTO |
| BUG-019 | 2026-06-22 | PR-BUGFIX-1 / pós-MVP | BLOQUEANTE | Runtime da API não carrega o `.env` da raiz — `POSTGRES_PASSWORD` ausente, senha vira `null` e o `pg` falha no SCRAM (`client password must be a string`) em todo login/query | CORRIGIDO |

> Atualizar esta tabela a cada nova entrada e a cada mudança de status.

---

## Registros

### BUG-001 — Comando de secret scan amplo gera falso positivo em docs/relatório
- Data: 2026-06-13
- PR/Fase: PR-0.1 / Fase 0
- Severidade: BAIXA
- Erro encontrado: o comando de busca de segredo (git grep amplo por palavras-chave) não retorna vazio.
- Sintoma: `git grep` retorna ocorrências; o gate "scan retorna vazio" não fecha como escrito.
- Causa raiz: a regex casa palavras-chave e nomes de variável (`POSTGRES_PASSWORD`) em `docs/*.md` e no próprio relatório — não valores de segredo. Busca substring de palavra, não par `CHAVE=valor` concreto.
- Impacto: procedimento de validação do PR. Não há vazamento real. Risco de mascarar vazamento futuro se a guarda for baixada sem critério.
- Arquivo(s) afetado(s): nenhum de produção; afeta o procedimento de validação (prompt/protocolo).
- Correção aplicada: scan dirigido (exclui `docs/**/*.md`, `pnpm-lock.yaml` e gerados; casa `CHAVE=valor` literal) → PASS sobre os arquivos do PR. Padronizar o scan dirigido no protocolo/prompts.
- Teste/validação executado: scan dirigido PASS; única ocorrência fora de docs é `POSTGRES_PASSWORD` com fallback default de dev em `docker-compose.yml` (não-segredo).
- Prevenção de regressão: protocolo passa a especificar o scan dirigido; o grep amplo de palavra vira verificação separada de documentação, não gate de vazamento.
- Status final: CORRIGIDO

### BUG-002 — `pnpm audit` não executável no ambiente sandbox do executor
- Data: 2026-06-13
- PR/Fase: PR-0.2 / Fase 0
- Severidade: BAIXA
- Erro encontrado: `pnpm audit --audit-level high` não roda no ambiente do executor.
- Sintoma: `ENOTFOUND` / chamada externa ao serviço de advisories do npm bloqueada por política de exposição de metadados de dependência privada.
- Causa raiz: o sandbox não tem egress permitido ao registry/advisories do npm; o audit exige contato externo. Não é defeito de código nem divergência de documento.
- Impacto: o gate de supply-chain (ADR-021) não pode ser provado localmente; precisa do CI.
- Arquivo(s) afetado(s): nenhum de produção; afeta o procedimento de validação. O step do gate vive em `.github/workflows/ci.yml`.
- Correção aplicada: o step existe no workflow (`.github/workflows/ci.yml`) e roda no GitHub Actions, que tem egress. Padrão para PRs futuros: `pnpm audit` é gate de CI, `NÃO EXECUTADO` localmente é esperado e não vira PASS por inferência.
- Teste/validação executado: não executável localmente (ver causa raiz); a verificação real fica delegada ao step `Audit dependencies` do GitHub Actions, comprovada no primeiro CI verde da branch.
- Prevenção de regressão: ao registrar este padrão, `pnpm audit` fica fixado como gate de CI — `NÃO EXECUTADO` local deixa de reabrir discussão a cada PR.
- Status final: ACEITO_COMO_PENDÊNCIA (verificação delegada ao CI)

### BUG-003 — GitHub Actions secret scan falha por checkout raso (shallow clone sem histórico git)
- Data: 2026-06-17
- PR/Fase: PR-1.3 / Fase 1
- Severidade: BLOQUEANTE
- Erro encontrado: o job `validate` do GitHub Actions falhou no step `Secret scan` (gitleaks) com `fatal: ambiguous argument 'b57758de...^..a3ba3054...': unknown revision or path not in the working tree`.
- Sintoma: Gitleaks tenta resolver um intervalo de commits (base^..HEAD) que não existe no clone raso do runner. O `actions/checkout@v4` padrão usa `fetch-depth: 1` (histórico raso), insuficiente para o scan.
- Causa raiz: o step de checkout do workflow não especificava `fetch-depth: 0`, resultando em clone raso sem o commit base necessário para o Gitleaks calcular o range de scan.
- Impacto: CI remoto bloqueado — impossível validar o workflow no commit do PR-1.3 antes de avançar para PR-1.4.
- Arquivo(s) afetado(s): `.github/workflows/ci.yml` (step `Checkout`).
- Correção aplicada: adicionado `with: fetch-depth: 0` ao step `actions/checkout@v4`, garantindo clone completo com histórico git.
- Teste/validação executado: re-run do workflow no GitHub Actions pendente; espera-se que o step `Secret scan` passe com histórico completo.
- Branch/commit relacionado: `main` / `a3ba3054ccf5034088a604920ea472852cc93bf0`
- Prevenção de regressão: `fetch-depth: 0` está fixado no workflow; qualquer novo commit dispara o checkout completo por padrão.
- Status final: CORRIGIDO

### BUG-004 — CI: test:db falha com `relation "users" does not exist` — banco divergente
- Data: 2026-06-17
- PR/Fase: PR-1.4 / Fase 1
- Severidade: BLOQUEANTE
- Erro encontrado: `pnpm --filter @nexos/api test:db` falha no CI com `ERROR: relation "users" does not exist`.
- Sintoma: O test:db roda contra `nexos_booking` (definido no `POSTGRES_DB` do CI), mas `migrate:fresh` aplica migrations em `nexos_migrations_gate` (hardcoded no script `apply-migrations.mjs`). O banco dos testes nunca recebe migrations.
- Causa raiz: `POSTGRES_DB` do CI era `nexos_booking`, divergente do target padrão do `migrate:fresh` (`nexos_migrations_gate`). Docker, migrations e testes usavam bancos diferentes.
- Impacto: CI remoto bloqueado — test:db falha antes de chegar ao test:http e test:auth.
- Arquivo(s) afetado(s): `.github/workflows/ci.yml`.
- Correção aplicada: alterado `POSTGRES_DB` de `nexos_booking` para `nexos_migrations_gate` no env do CI. Adicionados `POSTGRES_HOST`, `POSTGRES_PORT`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL_SECONDS`, `TRUST_PROXY_HOPS` para os harnesses de teste.
- Teste/validação executado: localmente lint, build, test:db, test:http, test:auth passam com o mesmo `POSTGRES_DB`.
- Branch/commit relacionado: `main` / `5e1ab93`
- Prevenção de regressão: `POSTGRES_DB` do CI é `nexos_migrations_gate` e coincide com o default do `migrate:fresh`.
- Status final: CORRIGIDO

### BUG-005 — CI: test:http T14/T24 falham 503 — DATABASE_URL do harness ignora POSTGRES_* do CI
- Data: 2026-06-17
- PR/Fase: PR-1.4 / Fase 1
- Severidade: BLOQUEANTE
- Erro encontrado: `test:http` T14 e T24 falham com `/ready` retornando 503 em vez de 200.
- Sintoma: A API iniciada pelo harness HTTP não conecta ao Postgres porque o `DATABASE_URL` construído pelo `startApi()` usa apenas `dotEnv` (vazio no CI) e defaults hardcoded (`nexos_booking`), ignorando `process.env.POSTGRES_*` definidos pelo CI. O `db.config.ts` prioriza `DATABASE_URL` sobre `POSTGRES_*`, então a conexão usa credenciais erradas.
- Causa raiz: `apps/api/scripts/test-http.mjs` e `test-auth.mjs` constroem `DATABASE_URL` usando apenas `dotEnv.POSTGRES_*` com fallback para defaults hardcoded. Quando `.env` não existe (CI), os valores de `process.env.POSTGRES_*` (corretos, definidos pelo workflow) são ignorados.
- Impacto: CI remoto bloqueado — test:http e test:auth falham porque a API não conecta ao banco.
- Arquivo(s) afetado(s): `apps/api/scripts/test-http.mjs`, `apps/api/scripts/test-auth.mjs`.
- Correção aplicada: a construção de `DATABASE_URL` e `dbHost`/`dbPort` agora inclui `process.env.POSTGRES_*` na cadeia de fallback (`dotEnv` → `process.env` → defaults). Também adicionado `process.env.DATABASE_URL` como fallback antes da construção.
- Teste/validação executado: localmente lint, build, test:db, test:http (24/24), test:auth (36/36), audit passam.
- Branch/commit relacionado: `main` (pendente commit)
- Prevenção de regressão: a cadeia de fallback `dotEnv → process.env → defaults` garante que o harness funcione tanto localmente (com `.env`) quanto no CI (sem `.env`, com `process.env`).
- Status final: CORRIGIDO

### BUG-006 — CI: test:auth comandos psql diretos usam credenciais hardcoded antigas
- Data: 2026-06-17
- PR/Fase: PR-1.4 / Fase 1
- Severidade: BLOQUEANTE
- Erro encontrado: `pnpm --filter @nexos/api test:auth` falha no CI com `psql: FATAL: role "nexos_booking" does not exist`. T3, T8, T32 falharam (29/36 PASS).
- Sintoma: Comandos `docker compose exec ... psql` dentro do `test-auth.mjs` (`checkPasswordHash`, `createSecondOrg`, `disableMembership`) usavam `nexos_booking`/`nexos_booking_local_password` hardcoded como fallback. No CI, `.env` não existe e `process.env.POSTGRES_*` não era consultado. T9/T10/T24/T25 falharam em cascata porque T8 (seed multi-org) falhou.
- Causa raiz: As funções de helper SQL usavam apenas `dotEnv` (vazio no CI) com fallback para hardcodes antigos, sem consultar `process.env`.
- Impacto: CI remoto bloqueado — test:auth falha em testes dependentes de seed SQL (multi-org, DISABLED binding, check de password hash).
- Arquivo(s) afetado(s): `apps/api/scripts/test-auth.mjs`.
- Correção aplicada: Criado helper `resolveDbEnv()` com cadeia de fallback `dotEnv → process.env → hardcoded`. Funções `checkPasswordHash`, `createSecondOrg` (via callers) e `disableMembership` (via callers) passaram a usar `resolveDbEnv()`. `resolveDbEnv()` movido para o escopo de módulo (fora do bloco `try`).
- Teste/validação executado: localmente lint, build, test:db, test:http (24/24), test:auth (36/36), audit passam. T3, T8, T32 confirmados verdes localmente.
- Branch/commit relacionado: `main` (pendente commit)
- Prevenção de regressão: `resolveDbEnv()` é o ponto único de resolução de credenciais de banco nos testes de auth; qualquer novo helper SQL deve usá-lo.
- Status final: CORRIGIDO

### BUG-007 — `AuthService.generateSlug()` usa check-then-insert, viola ADR-011
- Data: 2026-06-19
- PR/Fase: PR-1.4 / Fase 1 (herdado, detectado na auditoria do PR-1.6)
- Severidade: ALTA
- Erro encontrado: `AuthService.generateSlug()` em `apps/api/src/auth/auth.service.ts:699-710` faz `SELECT ... WHERE slug = candidate` seguido de `INSERT` — padrão check-then-insert. Duas inserções concorrentes com mesmo slug-base podem ambas passar no `SELECT` e a segunda explodir no `UNIQUE (lower(slug))` com `500`.
- Sintoma: Sob concorrência real (dois registros simultâneos com mesmo nome de empresa), a segunda transação recebe erro de unique violation não tratado → `500 Internal Server Error` em vez de `409 SLUG_TAKEN`.
- Causa raiz: Geração de slug não segue ADR-011 (retry-on-conflict). O `SELECT` prévio cria janela de corrida (TOCTOU) que o `UNIQUE` do banco fecha com erro bruto, não com código de negócio.
- Impacto: Registro de empresa sob concorrência pode resultar em `500` para o usuário. Probabilidade baixa no MVP (single-instance, baixo volume de registros simultâneos), mas o padrão está errado e contradiz ADR-011.
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.service.ts` (método `generateSlug()`).
- Correção aplicada: **Não aplicada neste momento.** O PR-1.6 não corrige código do PR-1.4. O `OrganizationsService` do PR-1.6 implementará retry-on-conflict correto (tenta INSERT → captura `23505` → próximo candidato), sem replicar o bug. A correção do `AuthService.generateSlug()` existente será feita em PR de remediação dedicado.
- Teste/validação executado: Não se aplica (correção pendente).
- Branch/commit relacionado: `main` (código atual com o bug)
- Prevenção de regressão: O `OrganizationsService` do PR-1.6 implementa o padrão correto como referência. O `AuthService.generateSlug()` será refatorado para usar o mesmo `SlugGenerator` + retry-on-conflict em PR futuro.
- Status final: ABERTO

### BUG-008 — Auth DTOs ausentes de `packages/shared` (divergência API §12/§21)
- Data: 2026-06-20
- PR/Fase: PR-1.4 / Fase 1 (corrigido no PR-6.4)
- Severidade: MÉDIA
- Erro encontrado: `LoginInput`, `RegisterInput`, `SwitchOrgInput`, `MeResponse` não existiam em `packages/shared`; schemas eram definidos localmente em `apps/web` e `apps/api`, divergindo de API §12/§21 (contrato único no shared).
- Sintoma: validação de payload duplicada/divergente entre web e API; shape de auth não tinha fonte única de verdade.
- Causa raiz: DTOs de auth não foram provisionados no shared no PR-1.4; herdado como dívida.
- Impacto: risco de drift de contrato entre front e back nos fluxos de register/login/switch-org/me.
- Arquivo(s) afetado(s): `packages/shared/src/dto/auth.dto.ts`, `packages/shared/src/index.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/dto/{register,login,switch-org}.dto.ts`, `apps/web/lib/auth-schemas.ts`, `apps/web/hooks/use-auth.ts`.
- Correção aplicada: PR-6.4 criou `packages/shared/src/dto/auth.dto.ts` com `RegisterInputSchema`, `LoginInputSchema`, `SwitchOrgInputSchema`, `MeResponseSchema`; o shared reexporta (`index.ts`); a API valida em runtime via `safeParse` (`auth.controller.ts:90/117/198`) e os DTOs locais da API reexportam tipos do shared; a web reexporta os schemas do shared em `lib/auth-schemas.ts` e os consome em `hooks/use-auth.ts`.
- Teste/validação executado: `pnpm lint`, `pnpm --filter @nexos/shared build`, `pnpm --filter @nexos/api build` PASS (PR-6.4); `POST /auth/register` com payload inválido retorna `422 VALIDATION_ERROR` (validação runtime pelo schema do shared). `pnpm --filter @nexos/web build` PASS fora do sandbox.
- Branch/commit relacionado: `main` (mudanças do PR-6.4 não commitadas; ver `PR-6.4_REPORT.md`)
- Prevenção de regressão: tipar os retornos de auth no front pelos DTOs do shared para falhar em build se o shape divergir; manter o catálogo de schemas de auth somente no shared.
- Status final: CORRIGIDO

### BUG-009 — `AuthService` instancia `new MemoryRateLimiter()` inline (não trocável via DI)
- Data: 2026-06-22
- PR/Fase: PR-1.4 / Fase 1
- Severidade: MÉDIA
- Erro encontrado: `AuthService` faz `this.rateLimiter = new MemoryRateLimiter()` inline (`apps/api/src/auth/auth.service.ts:58`), divergindo do contrato que prevê `RateLimiter` como interface trocável via DI.
- Sintoma: a implementação concreta está acoplada ao service; trocar para Redis exigirá editar `AuthService`.
- Causa raiz: provider de rate limit não registrado por DI/token; instanciação direta no construtor.
- Impacto: dívida de arquitetura; PR-4.1 não corrige (registra provider próprio no `PublicBookingModule`).
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.service.ts` (linha ~58), `apps/api/src/auth/rate-limit/*`.
- Correção aplicada: **Não aplicada.** Confirmado no HEAD que a instanciação inline persiste.
- Teste/validação executado: `grep` em `auth.service.ts` confirma `new MemoryRateLimiter()` na linha 58 e `private readonly rateLimiter: RateLimiter` na 46.
- Branch/commit relacionado: `main` (código atual com o débito)
- Prevenção de regressão: registrar `RateLimiter` por token de DI no módulo e injetar no `AuthService`.
- Status final: ABERTO

### PROPOSTA-002 — `IDEMPOTENCY_KEY_REQUIRED` ausente do catálogo de ErrorCode e de `API_CONTRACTS.md` §7
- Data: 2026-06-20
- PR/Fase: PR-3.2 / Fase 3
- Severidade: MÉDIA
- Erro encontrado: O header `Idempotency-Key` é **obrigatório** nas mutações de agendamento (API_CONTRACTS.md §5, ADR-008 v3; §16), mas não existe um ErrorCode específico para o caso de header ausente em rota `@Idempotent()`. O catálogo `error-code.ts` não contém `IDEMPOTENCY_KEY_REQUIRED`, e `API_CONTRACTS.md` §7 também não o lista.
- Sintoma: Se a implementação do PR-3.2 usar `VALIDATION_ERROR` (422) para header ausente, viola a convenção `400 vs 422` (§4): header obrigatório ausente é **malformação estrutural** (`400 BAD_REQUEST`), não violação de regra semântica (`422`). Se usar `BAD_REQUEST` genérico, perde-se rastreabilidade e o front não pode fazer lógica/i18n específica.
- Causa raiz: O contrato original (§5) prevê o header como obrigatório mas não provisionou um código de erro para o caso de ausência — o foco estava no fluxo feliz (header presente, chave nova ou replay).
- Impacto: O middleware/guarda `@Idempotent()` precisa de um código estável para header ausente. Usar `BAD_REQUEST` (genérico) ou `VALIDATION_ERROR` (422) sem `details` é frágil para o front.
- Arquivo(s) afetado(s): `packages/shared/src/error-code.ts` (deve adicionar `IDEMPOTENCY_KEY_REQUIRED`), `API_CONTRACTS.md` §7 (deve ser atualizado na categoria Idempotência).
- Correção aplicada: **api-contract-guardian aprova** a adição de `IDEMPOTENCY_KEY_REQUIRED` ao catálogo `error-code.ts` como código aditivo. Mapeamento: **`400` + envelope padrão** (header obrigatório ausente = malformação estrutural, não regra de negócio). `API_CONTRACTS.md` §7 deve ser atualizado para listar `IDEMPOTENCY_KEY_REQUIRED` na categoria Idempotência — esta entrada serve como PROPOSTA para essa atualização canônica.
- Teste/validação executado: Não se aplica (proposta documental). O PR-3.2 deve incluir `IDEMPOTENCY_KEY_REQUIRED` em `error-code.ts` e usá-lo no middleware `@Idempotent()`.
- Prevenção de regressão: Teste contratual em `error-code.contract-test.ts` deve validar que `IDEMPOTENCY_KEY_REQUIRED` consta no array `ERROR_CODES`.
- Status final: ABERTO (canonical doc e código pendentes)

---

## PR-DIAG-AUTH-FLOW — Diagnóstico read-only do fluxo de cadastro/auth (2026-06-22)

> Passada de diagnóstico (read-only em código/documento). Massa efêmera criada apenas via API pública
> (`diag+<ts>@example.test`, mascarada). API/Web subiram, Postgres conectado, jornada provada por curl
> ponta-a-ponta. Backend de auth íntegro e conforme contrato; a falha de "não avançar após cadastrar"
> é de estado de sessão no frontend (BUG-010), agravada por cookie em dev (BUG-011). Nenhuma correção
> foi aplicada nesta passada. Veredito: `PASS_DIAG_COM_RESSALVA`.

### Rastreabilidade DEF → BUG (reconciliação pré PR-FIX-1)

Mapa canônico dos achados do diagnóstico (`DEF-1`..`DEF-7` + `PEND-003`) para os IDs do ledger.
Sem colisão de ID, sem reuso e sem status enganoso.

| Achado (diagnóstico) | BUG (ledger) | Título resumido | Severidade | Status |
|---|---|---|---|---|
| DEF-1 | BUG-010 | web não promove sessão a `authenticated` após register/login | BLOQUEANTE | CORRIGIDO (PR-BUGFIX-1) |
| DEF-2 | BUG-011 | cookie refresh `Secure` não persiste em dev HTTP | BLOQUEANTE | ABERTO |
| DEF-3 | BUG-012 | API conecta como superuser/bypass RLS (PEND-001 canônico) | ALTA | ABERTO |
| DEF-4 | BUG-013 | org-switcher usa `org.id` vs `organizationId` | MÉDIA | CORRIGIDO (PR-BUGFIX-1) |
| DEF-5 | BUG-014 | login não persiste `savedOrgId`/`activeOrg` | MÉDIA | CORRIGIDO (PR-BUGFIX-1) |
| DEF-6 | BUG-015 | `pg_trgm` ausente | BAIXA | ABERTO |
| DEF-7 | BUG-016 | warning path-to-regexp | BAIXA | ABERTO |
| PEND-003 / idempotency | BUG-017 | harness T18b/T24 (defeitos do teste, não do código) | MÉDIA | ABERTO |

### Reconciliação de PEND-001 (colisão de ID)

- **PEND-001 canônico = paridade da role de runtime/RLS** (`nexos_booking` superuser/bypassrls vs
  `app_runtime` least-privilege). Rastreado por **BUG-012**, severidade **ALTA**, e permanece **ALTA/ABERTO**
  até API **e** CI conectarem com role sem bypass de RLS.
- O `PEND-001` do `PR-6.4_REPORT.md` ("CI remoto pendente") **não pode ocupar o mesmo ID**: foi renomeado
  para **`PEND-REL-001`** naquele relatório. "CI remoto" é pendência operacional do PR-6.4, não a paridade
  de role; ocupar `PEND-001` mascarava o risco de segurança multi-tenant.
- Hierarquia documental preservada (ADR → SCHEMA → API_CONTRACTS → PLANNING → ROADMAP, conforme
  `MVP_EXECUTION_PLAN.md`): relatório de PR descreve estado/remediação e não altera contrato.

### BUG-010 — Web não promove a sessão a `authenticated` após register/login
- Data: 2026-06-22
- PR/Fase: PR-BUGFIX-1 / pós-MVP
- Severidade: BLOQUEANTE
- Erro encontrado: `AuthBootstrap` (`apps/web/app/providers.tsx`, montado no root layout) calcula o estado de sessão em um `useEffect` de **montagem única**. As mutations de register/login só escrevem `accessToken`/`savedOrgId` no zustand store; nunca atualizam o `BootstrapResult` lido pelo `AuthGuard`.
- Sintoma: após cadastrar (`router.push("/dashboard")`, navegação soft), `useAuthBootstrap().status` permanece `idle` (valor da carga inicial anônima). O `AuthGuard` renderiza `<OrgSwitcher/>` em vez dos children — o painel nunca aparece e o usuário fica preso. Sem erro HTTP; é gating de UI. (Backend provado verde: register `201`, me/org-me com shape correto.)
- Causa raiz: o estado de autenticação do front depende exclusivamente de um bootstrap que só roda na montagem do provider e não é re-disparado/atualizado pelas mutations. Navegação client-side não remonta o provider.
- Impacto: cadastro e login pela UI são funcionalmente inertes — cria-se empresa mas não se alcança nenhuma tela protegida. Causa raiz do sintoma relatado ("não avança para as próximas telas").
- Arquivo(s) afetado(s): `apps/web/hooks/use-auth-bootstrap.ts`, `apps/web/app/providers.tsx`, `apps/web/hooks/use-auth.ts`.
- Correção aplicada: **Corrigido em PR-BUGFIX-1.** Função `refreshSession()` extraída de bootstrap em `providers.tsx`; chama `GET /auth/me` e deserializa user/activeOrg/memberships. Novo shape `AuthBootstrapCtxValue` expõe tanto resultado quanto `refreshSession()`. Novo hook `useRefreshSession()` permite mutations (login/register) chamarem `refreshSession()` e atualizarem o bootstrap sem reload. Provider expõe `{ result, refreshSession }` no value. `useEffect` mount-only reutiliza `refreshSession()` na sequência. Ramificação ADR-020 internalizada em `refreshSession()`: activeOrg != null → authenticated; activeOrg == null → idle. Falhas HTTP e falhas abruptas de rede/parse em `/auth/me` chamam `clearAuth()` e definem `idle`/`error`, sem promover para `authenticated` e sem unhandled rejection em `onSuccess`.
- Teste/validação executado: `pnpm --filter @nexos/web lint` PASS; `pnpm --filter @nexos/web exec tsc --noEmit` PASS. `git diff -- apps/web/lib/auth-schemas.ts` vazio. Code-review PASS_COM_RESSALVA (NOTE-1 resolvida; BUG-018 aberto/deferido). API contract PASS (MeResponse fonte única; headers respeitados). Jornada interativa em navegador NÃO EXECUTADA (pendência de CI web/e2e).
- Branch/commit relacionado: PR-BUGFIX-1 (diff em working tree; commit não realizado)
- Prevenção de regressão: teste de fluxo (e2e/integração) cobrindo register→`/dashboard` autenticado e login→`/dashboard` autenticado sem reload (PEND ciclo seguinte).
- Status final: CORRIGIDO

### BUG-011 — Cookie de refresh `Secure` não é persistido pelo browser em dev sobre HTTP
- Data: 2026-06-22
- PR/Fase: PR-DIAG-AUTH-FLOW / pós-MVP
- Severidade: BLOQUEANTE
- Erro encontrado: o cookie de refresh é emitido com `Secure` (`apps/api/src/auth/auth.controller.ts`, `setRefreshCookie`), correto por contrato §3.2. Em dev o app roda sobre `http://localhost`, e o navegador descarta cookies `Secure` enviados por origem não-HTTPS.
- Sintoma: via curl o cookie é armazenado e o refresh funciona (`200`, rotaciona); no navegador o cookie nunca é guardado, então todo reload chama `/auth/refresh` sem cookie → `401 UNAUTHENTICATED` → estado `idle`. A sessão nunca sobrevive a um reload em dev. Mascara o BUG-010 atrás de "sessão expirada/anônima".
- Causa raiz: ausência de tratamento de ambiente (HTTPS local ou `Secure` condicional a `NODE_ENV`) para dev. O atributo `Secure` em si está correto para produção.
- Impacto: impossível verificar/usar a jornada web em dev sobre HTTP puro; recuperação de sessão por reload não funciona localmente. Casa com PEND-002 (browser não executado).
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.controller.ts` (`setRefreshCookie`/`clearRefreshCookie`); setup de dev (host/HTTPS).
- Correção aplicada: **Não aplicada** (diagnóstico read-only). Proposta: `secure` condicional a `process.env.NODE_ENV === "production"`, **ou** servir web/api sob HTTPS confiável em dev. Decisão de segurança/produto — não alterar a obrigatoriedade de `Secure` em produção (§3.2).
- Teste/validação executado: `Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh` observado; jar do curl mostra flag `Secure`; refresh por curl `200`. Comportamento de browser inferido do atributo (NÃO EXECUTADO em navegador).
- Branch/commit relacionado: `main`
- Prevenção de regressão: documentar setup de dev (HTTPS) e/ou teste que valide `secure` por ambiente.
- Status final: ABERTO

### BUG-012 — API conecta como superuser `nexos_booking`; RLS efetivamente bypassada (paridade de role)
- Data: 2026-06-22
- PR/Fase: PR-DIAG-AUTH-FLOW / pós-MVP
- Severidade: ALTA
- Erro encontrado: o runtime conecta ao Postgres com a role `nexos_booking`, que é **superuser** e tem `rolbypassrls=true`. RLS está `ENABLE`+`FORCE` nas 13 tabelas tenant-scoped, mas superuser **ignora RLS**. O `db.config.ts` usa `POSTGRES_USER` (= `nexos_booking`), não há role de runtime separada.
- Sintoma: `pg_stat_activity` → 100% das conexões do app como `nexos_booking`; `pg_roles`: `nexos_booking rolsuper=t, rolbypassrls=t` vs `app_runtime rolsuper=f, rolbypassrls=f`. Hoje o isolamento de tenant depende apenas dos guards de aplicação (`TenantGuard`/`validateOrgId`), não do banco.
- Causa raiz: divergência de role de runtime — o app não usa `app_runtime` (least-privilege, sujeito a RLS). Esta é a essência do **PEND-001 canônico (paridade de role)**.
- Divergência documental (L1) — **resolvida**: o `PEND-001` do `PR-6.4_REPORT.md` estava descrito como "CI remoto pendente", colidindo com o PEND-001 canônico de **paridade da role runtime**. O PEND do relatório foi **renomeado para `PEND-REL-001`** e o PEND-001 canônico (paridade de role) permanece ALTA, rastreado por este BUG-012. O relatório (`PR-6.4_REPORT.md`) descreve estado/remediação e **não** muda contrato — prevalece a hierarquia canônica (ADR → SCHEMA → API_CONTRACTS → PLANNING → ROADMAP, conforme `MVP_EXECUTION_PLAN.md`).
- Impacto: as provas de RLS desta passada ocorreram sem RLS de fato ativa; regressões de isolamento de tenant não são detectáveis neste ambiente. Risco de segurança/multi-tenant se prod/CI rodarem com a mesma role.
- Arquivo(s) afetado(s): `.env` (`POSTGRES_USER`), `apps/api/src/db/db.config.ts`, scripts de migração/grant de role; pipeline de CI.
- Correção aplicada: **Não aplicada** (diagnóstico read-only). Proposta: runtime e CI conectam como `app_runtime`; reabrir/confirmar PEND-001 canônico como paridade de role.
- Teste/validação executado: `SELECT usename ... FROM pg_stat_activity` (todas `nexos_booking`); `SELECT rolsuper, rolbypassrls FROM pg_roles` (flags confirmadas).
- Branch/commit relacionado: `main`
- Prevenção de regressão: teste cross-tenant que prove `404`/vazio **por RLS** (não só por guard), exigindo conexão como `app_runtime` no CI.
- Status final: ABERTO

### BUG-013 — `org-switcher` versionado usa `org.id`; `/organizations/me` devolve `organizationId`
- Data: 2026-06-22
- PR/Fase: PR-BUGFIX-1 / pós-MVP
- Severidade: MÉDIA
- Erro encontrado: na versão **commitada** de `apps/web/components/shell/org-switcher.tsx`, `OrgItem` e os usos (`key`, `isActive`, `switch-org`) operam sobre `org.id`, mas `GET /organizations/me` retorna itens com `organizationId` (sem `id`). `org.id` é `undefined`.
- Sintoma: `key={undefined}`, `isActive` sempre falso e `switch-org` chamado com `organizationId: undefined` — seletor de empresa quebrado no HEAD.
- Causa raiz: shape divergente front × contrato (`MeResponse.memberships[].organizationId` / §10).
- Impacto: mesmo destravando o BUG-010, a tela `OrgSwitcher` (estado `idle`) não lista/seleciona empresas corretamente.
- Arquivo(s) afetado(s): `apps/web/components/shell/org-switcher.tsx`.
- Correção aplicada: **Corrigido em PR-BUGFIX-1.** `OrgItem.id`→`OrgItem.organizationId` (linha 14); usos: `key={org.organizationId}`, `isActive = org.organizationId === savedOrgId`, `switchOrgMutation.mutate({ organizationId: org.organizationId })`. Coerente com contrato MeResponse.
- Teste/validação executado: `GET /organizations/me` → `200 [{organizationId,…,role,status}]` (confirma o campo correto); code-reviewer PASS; type-check PASS; lint PASS.
- Branch/commit relacionado: PR-BUGFIX-1 (diff em working tree; commit não realizado)
- Prevenção de regressão: tipar o retorno de `/organizations/me` pelo DTO do shared para falhar em build se o shape divergir.
- Status final: CORRIGIDO

### BUG-014 — `useLoginMutation` não persiste `savedOrgId`/`activeOrg`
- Data: 2026-06-22
- PR/Fase: PR-BUGFIX-1 / pós-MVP
- Severidade: MÉDIA
- Erro encontrado: `useLoginMutation` (`apps/web/hooks/use-auth.ts`) só seta `accessToken` no store e ignora o `activeOrg` retornado pelo login; apenas `useRegisterMutation` seta `savedOrgId`.
- Sintoma: após login, `savedOrgId=null`. Para conta multi-org (access sem `org` no claim, ADR-020), o bootstrap não tem hint de empresa salvo e cairia em `idle` sem destravar para a empresa esperada.
- Causa raiz: a mutation de login não propaga a org ativa para o estado consumido pelo bootstrap/OrgSwitcher.
- Impacto: menor para single-org (o claim já traz `org` e `/auth/me` resolve `activeOrg`); relevante para multi-org no fluxo de seleção de empresa.
- Arquivo(s) afetado(s): `apps/web/hooks/use-auth.ts` (`useLoginMutation`).
- Correção aplicada: **Corrigido em PR-BUGFIX-1.** `useLoginMutation.onSuccess` agora: guard SF-1 (`if (!data.accessToken) return;`) → `setAccessToken()` → `refreshSession()` que lê activeOrg de `GET /auth/me` e ramifica por ADR-020 (activeOrg != null → authenticated; activeOrg == null → idle).
- Teste/validação executado: `POST /auth/login` → `200 {user, activeOrg, accessToken}` (campo `activeOrg` consumido por refreshSession); code-reviewer PASS_COM_RESSALVA; lint/tsc PASS.
- Branch/commit relacionado: PR-BUGFIX-1 (diff em working tree; commit não realizado)
- Prevenção de regressão: teste de fluxo multi-org (login → seleção/restauração de empresa).
- Status final: CORRIGIDO

### BUG-015 — Extensão `pg_trgm` ausente na base (migration 0007 fora de paridade)
- Data: 2026-06-22
- PR/Fase: PR-DIAG-AUTH-FLOW / pós-MVP
- Severidade: BAIXA
- Erro encontrado: `SELECT extname FROM pg_extension WHERE extname='pg_trgm'` retorna vazio. A migration `0007_pg_trgm` referida no roadmap não está refletida nesta base de dev.
- Sintoma: `pg_trgm:ABSENT`. Índices/consultas por trigram (ex.: busca de clientes) podem degradar ou quebrar quando exercitados.
- Causa raiz: base de dev fora de paridade com as migrations (extensão não criada) ou migration não aplicada neste container.
- Impacto: funcionalidade de busca trigram não garantida em dev; risco de divergência entre `apps/api/db/schema` e o estado real do banco.
- Arquivo(s) afetado(s): migrations (`0007_pg_trgm`), base de dev.
- Correção aplicada: **Não aplicada** (diagnóstico read-only). Proposta: aplicar/conferir `migrate:apply` e validar paridade schema × migrations.
- Teste/validação executado: query a `pg_extension` (ausente).
- Branch/commit relacionado: `main`
- Prevenção de regressão: gate de paridade migrations × schema no CI.
- Status final: ABERTO

### BUG-016 — WARN path-to-regexp v8 no exclude de rota `__test/(.*)`
- Data: 2026-06-22
- PR/Fase: PR-DIAG-AUTH-FLOW / pós-MVP
- Severidade: BAIXA
- Erro encontrado: `apps/api/src/main.ts` (`setGlobalPrefix(..., { exclude: ["__test/(.*)"] })`) usa sintaxe legada de path-to-regexp; o boot emite WARN `Unsupported route path: "__test/(.*)" … Attempting to auto-convert`.
- Sintoma: WARN no log de bootstrap; funciona via auto-convert da lib (rotas mapeadas normalmente).
- Causa raiz: path-to-regexp v8 exige parâmetros nomeados (ex.: `__test/*path`) em vez de `(.*)`.
- Impacto: ruído de boot; risco futuro caso o auto-convert seja removido em versão posterior.
- Arquivo(s) afetado(s): `apps/api/src/main.ts` (exclude do global prefix).
- Correção aplicada: **Não aplicada** (diagnóstico read-only). Proposta: migrar o padrão para `__test/*path`.
- Teste/validação executado: log de bootstrap (`grep -i warn`).
- Branch/commit relacionado: `main`
- Prevenção de regressão: Não se aplica.
- Status final: ABERTO

### BUG-017 — `test:idempotency` T18b e T24 vermelhos por defeitos do harness (triagem do PEND-003)
- Data: 2026-06-22
- PR/Fase: PR-DIAG-AUTH-FLOW / pós-MVP
- Severidade: MÉDIA
- Erro encontrado: `pnpm --filter @nexos/api test:idempotency` falha em T18b e T24 (T1–T17, T18a, T19–T23 PASS). Triagem do PEND-003 do PR-6.4_REPORT.md.
- Sintoma: **T18b** FAIL ("Handler NOT inside tenant transaction (separate)" — expected `true`, actual `false`). **T24** ERROR (`insert ... idempotency_keys violates foreign key constraint ... Key (organization_id)=(77777777-…-777777777777) is not present in table "organizations"`).
- Causa raiz: **T18b = teste quebrado (heurística textual falso-negativa)** — o código está correto: `IdempotencyInterceptor.executeAndUpdate` (`apps/api/src/common/interceptors/idempotency.interceptor.ts`) executa `next.handle()` **fora** de `withTenantContext`; só os writes de estado (`IN_PROGRESS`/`COMPLETED`/`FAILED`) são envoltos em tenant tx. A heurística do teste não detecta esse arranjo. **T24 = fixture quebrada** — a fixture insere `idempotency_keys` com `organization_id` que não existe em `organizations` (org-pai não semeada).
- Impacto: **nenhum risco de código/produto**. São defeitos do test-harness. Mantê-los vermelhos sem triagem mascara a saúde real da idempotência (que está correta).
- Arquivo(s) afetado(s): `apps/api/scripts/test-idempotency.mjs` + fixtures (T18b heurística, T24 seed). O interceptor (`idempotency.interceptor.ts`) está correto e **não** deve ser alterado.
- Correção aplicada: **Não aplicada** (diagnóstico read-only). Proposta: corrigir a heurística de T18b e semear a org-pai em T24; não "ficar verde" removendo asserts válidos.
- Teste/validação executado: execução do harness reproduziu T18b FAIL e T24 ERROR; leitura do interceptor confirma o arranjo correto handler-fora-de-tenant-tx.
- Branch/commit relacionado: `main`
- Prevenção de regressão: substituir heurística textual por asserção comportamental; fixture de T24 deve criar a organização antes do `idempotency_keys`.
- Status final: ABERTO

### PROPOSTA-C1 — Alinhar `API_CONTRACTS.md` §8 para refletir `activeOrg` conforme ADR-020
- Data: 2026-06-22
- PR/Fase: PR-BUGFIX-1 / pós-MVP
- Severidade: MÉDIA
- Erro encontrado: Divergência documental (L1). `API_CONTRACTS.md` §8 (LoginResponse) **não define explicitamente** o campo `activeOrg`, mas ADR-020 (prevalente por hierarquia documental) define que resposta de autenticação retorna `activeOrg: string | null`. Implementação de PR-BUGFIX-1 segue ADR-020 (autoridade); contrato canônico está em divergência.
- Sintoma: Tipo local provisório `LoginResponse` foi anteriormente em `apps/web/lib/auth-schemas.ts` redeclara `activeOrg` como extensão de resposta HTTP; agora removido (arquivo revertido). Sem alinhamento de §8, a dívida de manutenção persiste, mas tipo provisório já foi eliminado.
- Causa raiz: §8 foi redigida antes de ADR-020 ser totalmente especificado ou antes de validação ponta-a-ponta; foco no fluxo feliz (token, user) omitiu o campo de ramificação de autenticação.
- Impacto: dívida de manutenção **baixa** (não há redeclaração local). A implementação é correta (ADR-020 prevalece); divergência é documental apenas entre ADR-020 e §8.
- Arquivo(s) afetado(s): `API_CONTRACTS.md` (§8 — será alinhado quando PROPOSTA for aprovada); `@nexos/shared` (quando PROPOSTA for aprovada e se houver novo tipo `LoginResponse`, migra para shared).
- Correção aplicada: **Canônico API_CONTRACTS.md NÃO foi alterado neste PR** (proibido). Implementação segue ADR-020 (autoridade). Tipo provisório em auth-schemas.ts foi **removido** (arquivo revertido). Quando PROPOSTA for aprovada, alinhará §8 e, se houver novo tipo, migrará para shared.
- Teste/validação executado: Não se aplica (proposta documental). Implementação prova comportamento (BUG-010/013/014 CORRIGIDO; validação local lint+tsc, CI web pendente). `git diff HEAD -- apps/web/lib/auth-schemas.ts` vazio (tipo provisório removido).
- Branch/commit relacionado: PR-BUGFIX-1 (canônico ainda pendente)
- Prevenção de regressão: incluir `activeOrg` em testes contratuais de auth (e2e) quando PROPOSTA for aprovada.
- Status final: ABERTO (canonical doc pendente de aprovação)

### BUG-018 — Switch-org não recompõe sessão no frontend após troca de organização
- Data: 2026-06-22
- PR/Fase: PR-BUGFIX-1 / pós-MVP
- Severidade: MÉDIA
- Erro encontrado: ao trocar de organização (`useSwitchOrgMutation` → `POST /auth/switch-org`), o frontend não chama `refreshSession()`/`GET /auth/me` após o sucesso; o estado de sessão (user/activeOrg/memberships do `AuthBootstrap`) não é recomposto para a nova org.
- Sintoma: no ramo multi-org, após escolher outra empresa no `OrgSwitcher`, a UI não reflete a org recém-ativada sem reload; o `BootstrapResult` permanece com os dados da org anterior.
- Causa raiz: a mutation de switch-org não está ligada à origem única de promoção (`refreshSession`). Comportamento idêntico ao HEAD — não introduzido por este PR.
- Impacto: bug funcional real do fluxo multi-org. **Deferido**: PR-BUGFIX-1 corrige o fluxo single-org pós-register/login (BUG-010/013/014) e não expande escopo para switch-org. Não é mero NOTE.
- Arquivo(s) afetado(s): `apps/web/hooks/use-auth.ts` (`useSwitchOrgMutation`); requer expor/consumir `refreshSession` após o switch.
- Correção aplicada: **Não aplicada** (fora do escopo de PR-BUGFIX-1, deferido).
- Teste/validação executado: Não se aplica (deferido). Identificado na reauditoria do code-reviewer (originalmente NOTE-2), promovido a bug funcional por decisão humana.
- Branch/commit relacionado: `main` (comportamento pré-existente do HEAD)
- Prevenção de regressão: ao corrigir, `useSwitchOrgMutation` deve chamar `refreshSession(novoToken)` após sucesso; teste de fluxo multi-org (troca de org → UI recomposta sem reload).
- Status final: ABERTO

### BUG-019 — Runtime da API não carrega o `.env` da raiz; senha vazia vira `null` e quebra o SCRAM
- Data: 2026-06-22
- PR/Fase: PR-BUGFIX-1 / pós-MVP
- Severidade: BLOQUEANTE
- Erro encontrado: o processo da API (NestJS) não carrega nenhum arquivo `.env`. Os scripts de lançamento (`dev`: `tsx watch src/main.ts`; `start`: `node dist/main.js`) não usam `--env-file`, não há `dotenv` nem `ConfigModule`. Só `scripts/apply-migrations.mjs` tem seu próprio `loadEnv()`. Assim, `process.env.POSTGRES_PASSWORD` é `undefined` no runtime.
- Sintoma: `[unhandled] Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` em `AuthController.login` (e em qualquer transação) — `requestId=94901044-…`. Login pela UI retornava 500; o erro vinha da camada de banco, não da autenticação de usuário.
- Causa raiz: sem o `.env` carregado, `POSTGRES_PASSWORD` é `undefined` → em `apps/api/src/db/db.config.ts:22` `pass` cai no default `""` → a connection string fica `postgres://nexos_booking:@localhost:5432/nexos_booking`. O `pg` interpreta senha vazia na URL como `password = null` (não string); no handshake SCRAM o cliente exige `typeof password === "string"` e lança o erro. (Reproduzido instanciando `pg.Client` com a mesma string: `client.password === null`.)
- Impacto: nenhuma query ao banco funciona em dev quando se sobe a API pela raiz (`pnpm dev`) — login, register e todo fluxo autenticado quebram com 500. Mascara os bugs de sessão do frontend (BUG-010/011) atrás de uma falha de conexão.
- Arquivo(s) afetado(s): `apps/api/src/load-env.ts` (novo), `apps/api/src/main.ts` (import inicial).
- Correção aplicada: **Corrigido em PR-BUGFIX-1.** Novo `apps/api/src/load-env.ts` que, no startup, sobe a árvore a partir do `cwd` até achar o primeiro `.env`, faz parse (espelhando `parseDotEnv` de `apply-migrations.mjs` — mesma convenção do repo) e popula `process.env` **sem sobrescrever** chaves já definidas (container/CI continuam prevalecendo; no-op se o `.env` não existir). Importado como **primeira linha** de `main.ts` (`import "./load-env";`, antes de `reflect-metadata`), garantindo env disponível antes de qualquer leitura. A obrigatoriedade de senha no banco não é relaxada.
- Teste/validação executado: `pnpm --filter @nexos/api exec tsc --noEmit` PASS. Simulação do caminho real (cwd=`apps/api`) resolve `/Users/.../nexos-booking/.env`, `POSTGRES_PASSWORD` passa a string não-vazia e `pg.Client.password` vira string (antes `null`). `POST /api/v1/auth/login` com credenciais inexistentes retorna `401 INVALID_CREDENTIALS` (banco conectado) em vez do erro SASL — antes 500.
- Branch/commit relacionado: `fix/pr-bugfix-1-auth-session` / base `0cbf23d` (diff em working tree; commit não realizado)
- Prevenção de regressão: manter o carregamento de `.env` no entrypoint da API; documentar/checar que `pnpm dev` na raiz sobe a API com `POSTGRES_*` resolvidos. Idealmente, validar presença das variáveis obrigatórias no boot (fail-fast) em PR futuro.
- Status final: CORRIGIDO

---

## Áreas de atenção recorrentes (onde os bugs tendem a aparecer — checar primeiro)

Não são bugs; são pistas de onde olhar, derivadas dos riscos técnicos das fontes:

- **RLS / contexto:** query sem `withTenantContext` (nega tudo) ou GUC `''` sob pooling (`22P02`/`500`
  intermitente) — conferir `NULLIF`/`COALESCE` nas policies e `set_config` parametrizado.
- **Migrations:** ordem 0002→0003 (FK composta exige `UNIQUE (org,id)` antes); `EXCLUDE`/`btree_gist`.
- **Idempotência:** replay devolvendo status errado; takeover sem CAS executando em dobro; `IN_PROGRESS`
  bloqueando o pool.
- **Agenda:** evento fora da transação; validar transição depois do UPDATE; gate de jornada ausente;
  remarcação não atualizando a expiração do token; âncora de grade divergente sob DST.
- **Auth/sessão:** confusão de algoritmo do JWT; cookie com `Path` errado; IP real não resolvido;
  `resolveActiveOrg` espalhado; logout/`DISABLED` não derrubando o socket (kick).
- **Privacidade:** PII em log/`metadata`/payload de socket; visitante sobrescrevendo cadastro de balcão;
  scrub de `note` incompleto na anonimização.
