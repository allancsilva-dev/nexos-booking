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
