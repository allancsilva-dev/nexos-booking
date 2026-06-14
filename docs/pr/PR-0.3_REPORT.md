# PR-0.3_REPORT — `packages/shared`: envelope de erro + `ErrorCode` + helpers de data/dinheiro

## 1. Resumo

- **Status final: PASS**
- **Escopo executado:** materializada a base do contrato HTTP em TypeScript dentro de `@nexos/shared`:
  catálogo `ErrorCode` (32 códigos canônicos + `ERROR_CODES` + `isErrorCode`), tipo `ErrorEnvelope`
  (`ErrorBody`/`ErrorDetail`), helpers de ISO-8601 com offset (tipo de marca `Iso8601WithOffset` +
  `isIso8601WithOffset`/`assertIso8601WithOffset`) e superfície mínima de dinheiro em centavos
  (`Money` + `isIntegerCents`/`isCurrencyCode`/`money`). Adicionados testes de contrato **compile-time**
  cobertos pelo build do pacote. Repontadas as referências de importabilidade de `apps/web` e `apps/api`
  do antigo `sharedStub` para o contrato real.
- **Observações relevantes:**
  - O nome real do pacote é `@nexos/shared` (confirmado em `packages/shared/package.json`).
  - Não há script `test` no pacote; por instrução do PR, **nenhum runner novo foi instalado**. A
    validação dos testes de contrato é compile-time, executada como parte do `build` do pacote.
  - `docs/BUGFIX_LOG.md` aparece como modificado no worktree, mas essa alteração é **pré-existente a
    este PR** (já constava no `git status` inicial da sessão); não foi tocada aqui.

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-0.1 confirmado | PASS | `docs/pr/PR-0.1_REPORT.md:4` registra `Status: PASS`; `packages/shared`, `packages/config`, `apps/web`, `apps/api` existem conforme PR-0.1. |
| PR-0.2 confirmado como PASS | PASS | `docs/pr/PR-0.2_REPORT.md:4` registra `Status: PASS`. |
| `pnpm audit --audit-level high` = PASS no PR-0.2 | PASS | `PR-0.2_REPORT.md` §4 e §6 registram o comando com exit `0`. |
| `0 high/critical advisories` no PR-0.2 | PASS | `PR-0.2_REPORT.md` registra `0 high/critical advisories` (apenas `1 moderate` informativo, não bloqueante). |
| PR-0.2 sem pendência bloqueante para PR-0.3 | PASS | `PR-0.2_REPORT.md` §10: "PR-0.2 pronto para fechamento... (Não iniciar PR-0.3.)"; nenhuma pendência bloqueante. |
| `packages/shared` existe (não contradiz PR-0.1) | PASS | Pacote presente e compilável; este PR evoluiu o stub sem quebrar o build. |
| Fontes canônicas lidas | PASS | Lidos `ARCHITECTURE_DECISIONS.md`, `DATABASE_SCHEMA_V2.md`, `API_CONTRACTS.md` (§2, §7, §12, §21, §22), `PLANNING.md`, `IMPLEMENTATION_ROADMAP.md`, `MVP_EXECUTION_PLAN.md`, `EXECUTION_PROMPT_PROTOCOL.md`, `BUGFIX_LOG.md`, `docs/pr/PR-0.2_REPORT.md`. |
| Lista de `ErrorCode` dos docs == 32 do prompt | PASS | `API_CONTRACTS.md` §7 enumera exatamente 5 genéricos + 9 auth + 3 convite + 2 authz + 3 org + 2 idempotência + 7 agenda + 1 jornada = **32**, idênticos ao prompt. `CONSENT_REQUIRED` (§22) permanece fora do catálogo por recomendação explícita do contrato. |

## 3. Arquivos criados/alterados

| Caminho | Tipo | Motivo técnico |
|---|---|---|
| `packages/shared/src/error-code.ts` | criado | `ERROR_CODES` (tupla `as const`), union `ErrorCode`, guard `isErrorCode`. |
| `packages/shared/src/error-envelope.ts` | criado | `ErrorDetail`, `ErrorBody`, `ErrorEnvelope` (API_CONTRACTS §2). |
| `packages/shared/src/datetime.ts` | criado | Tipo de marca `Iso8601WithOffset` + `isIso8601WithOffset`/`assertIso8601WithOffset`. |
| `packages/shared/src/money.ts` | criado | `Money` + `DEFAULT_CURRENCY` + `isIntegerCents`/`isCurrencyCode`/`money`. |
| `packages/shared/src/index.ts` | alterado | Removido `sharedStub`; reexporta os quatro módulos do contrato base. |
| `packages/shared/src/__contract-tests__/type-utils.ts` | criado | `Equal`/`Expect` para asserções compile-time. |
| `packages/shared/src/__contract-tests__/error-code.contract-test.ts` | criado | Verifica os 32 códigos, exatidão da união, contagem, `RATE_LIMITED` aceito, `CONSENT_REQUIRED` recusado. |
| `packages/shared/src/__contract-tests__/error-envelope.contract-test.ts` | criado | Verifica obrigatoriedade de `code`/`message`/`requestId`/`timestamp` e `details` opcional. |
| `packages/shared/src/__contract-tests__/datetime.contract-test.ts` | criado | Verifica que string crua/data-only não é `Iso8601WithOffset` e que o guard estreita. |
| `packages/shared/src/__contract-tests__/money.contract-test.ts` | criado | Verifica shape `{ amountCents, currency }` e centavos como inteiro numérico. |
| `packages/shared/tsconfig.json` | alterado | `exclude` dos `__contract-tests__` do build de emissão (mantém `dist` limpo). |
| `packages/shared/tsconfig.typecheck.json` | criado | `noEmit` cobrindo `src/**` (inclui os contract-tests) para type-check no build. |
| `packages/shared/package.json` | alterado | `build` agora encadeia emissão + type-check: `tsc -p tsconfig.json && tsc -p tsconfig.typecheck.json`. |
| `apps/api/src/main.ts` | alterado | Importabilidade: `sharedStub` → `ERROR_CODES` (log com a contagem de códigos). |
| `apps/web/app/page.tsx` | alterado | Importabilidade: `sharedStub` → `ERROR_CODES`. |
| `docs/pr/PR-0.3_REPORT.md` | criado | Este relatório. |

## 4. Contrato implementado

- **`ErrorEnvelope`** — `{ error: { code, message, requestId, timestamp, details? } }` conforme §2.
  `timestamp` é tipado como `Iso8601WithOffset` (offset preservado por construção); `details` é
  `ErrorDetail[]` opcional com `field` + `issue`.
- **`ErrorCode`** — união estável dos **32** códigos do §7 + `ERROR_CODES` (tupla `as const`) +
  `isErrorCode`. Cresce de forma aditiva; é a única fonte de verdade dos códigos.
- **Helpers ISO-8601** — tipo de marca `Iso8601WithOffset`; `assertIso8601WithOffset` lança `TypeError`
  para data-only ou data-hora sem offset (não transforma silenciosamente em string sem offset). Sem
  cálculo de agenda/grade/DST/timezone de empresa.
- **Helpers dinheiro** — `Money = { amountCents, currency }`; `money()` preserva centavos como inteiro
  (lança em vez de arredondar float) e exige moeda de 3 letras (default `BRL` só ao montar). Sem
  formatação, símbolo, desconto, preço, pagamento ou billing.
- **Decisão explícita — `CONSENT_REQUIRED` NÃO incluído:** seguindo `API_CONTRACTS.md` §22
  (recomendação: representar consentimento ausente como `VALIDATION_ERROR` com `details`, para não
  inflar o catálogo). O contract-test cobre essa decisão com `@ts-expect-error`.

## 5. Validações executadas

| Comando | Resultado | Evidência resumida |
|---|---|---|
| `pnpm install --frozen-lockfile` | PASS | `Scope: all 5 workspace projects`; `Already up to date`; lockfile inalterado. |
| `pnpm --filter @nexos/shared build` | PASS | `tsc -p tsconfig.json && tsc -p tsconfig.typecheck.json` sem erros. `dist/` contém só os 4 módulos do contrato + `index` (sem `__contract-tests__`). |
| `pnpm build` | PASS | `turbo run build` → `Tasks: 3 successful, 3 total` (`@nexos/shared`, `@nexos/web` com `Next.js 16.2.9`, `@nexos/api` via `tsc`). |
| `pnpm lint` | PASS | `turbo run lint` → `Tasks: 3 successful, 3 total`. |
| `pnpm --filter @nexos/shared test` | N/A — sem script de teste neste PR; validação coberta por build/type-check | Não há script `test` no pacote; nenhum runner novo instalado; lockfile não alterado. |
| Prova negativa do gate (mutação temporária) | PASS | Removido `RATE_LIMITED` de `ERROR_CODES` → `tsc -p tsconfig.typecheck.json` falhou em 3 asserções (`Equal` da união, contagem `=== 32`, atribuição de `RATE_LIMITED`). Arquivo restaurado; type-check voltou a passar. Confirma que a divergência quebra o build. |

Asserções compile-time cobertas (todas executadas pelo build do pacote):

- `ErrorCode` contém **exatamente** os 32 códigos (`Equal<ErrorCode, ExpectedErrorCode>` + `length === 32`);
- `CONSENT_REQUIRED` **não** é `ErrorCode` (`@ts-expect-error`);
- `RATE_LIMITED` **é** `ErrorCode`;
- `ErrorEnvelope` exige `code`/`message`/`requestId`/`timestamp` (`@ts-expect-error` por campo faltante);
- `ErrorEnvelope.details` é opcional (envelope válido sem `details` compila);
- helper de data/hora não aceita silenciosamente string sem offset / data-only (tipo de marca + guard);
- helper de dinheiro preserva centavos como inteiro numérico (shape + recusa de `string`);
- `@nexos/shared` é importável por `apps/web` e `apps/api` (ambos importam `ERROR_CODES`; `pnpm build`
  compila os dois apps a partir do `dist` do pacote).

## 6. Escopo proibido — confirmação

Confirmo que **NÃO** foi criado:

- schemas Zod de domínio: **não criado**;
- cliente HTTP completo / interceptors / API routes: **não criado**;
- matriz de estados (`AppointmentStatus`, `APPOINTMENT_TRANSITIONS`, `alignToSlotGrid`, `SLOT_GRID_ANCHOR`): **não criado**;
- constantes de rate limit (limites numéricos): **não criado** (`RATE_LIMITED` existe apenas como `ErrorCode`);
- constantes de booking (`MAX_BOOKING_HORIZON_DAYS`, `MIN_SCHEDULE_NOTICE_MIN`): **não criado**;
- DTOs de auth/appointments/availability/public booking/cadastros (`LoginInput`, `RegisterInput`, `MeResponse`, `AppointmentDTO`, `AvailabilityQuery`, `PublicOrgDTO`, `ProfessionalDTO`, `ServiceDTO`, `ClientDTO`, etc.): **não criado**;
- access token claims: **não criado**;
- `CONSENT_REQUIRED` como `ErrorCode`: **não criado** (decisão §22);
- migrations / tabelas / seeds / RLS: **não criado**;
- controllers/services/repositories: **não criado**;
- filtro global do NestJS: **não criado** (pertence ao PR-1.3);
- feature de produto / lógica de agenda, auth, availability, booking público, idempotência ou autorização: **não criado**;
- runner novo de testes (Vitest/Jest): **não instalado**;
- dependência nova só para teste: **não adicionada** (lockfile inalterado).

## 7. Lacunas ou divergências

- **Nenhuma divergência** entre `API_CONTRACTS.md`, `MVP_EXECUTION_PLAN.md` e `IMPLEMENTATION_ROADMAP.md`
  quanto ao escopo do PR-0.3: o catálogo de §7 bate exatamente com os 32 códigos do prompt e §12/§21/§22
  confirmam a materialização do contrato base no `shared` (DTOs/Zod/constantes de feature ficam para PRs
  posteriores).
- Decisão registrada (não é divergência): os `__contract-tests__` são **excluídos do build de emissão**
  (`tsconfig.json`) e verificados por `tsconfig.typecheck.json` (`noEmit`) para manter o `dist` limpo,
  garantindo ao mesmo tempo que o type-check roda como parte do `build` do pacote — sem nenhum runner novo.

## 8. Resultado final

- **Veredito do executor: PASS.**
- Pronto para revisão: **sim**. Base do contrato compartilhado materializada e validada por
  `pnpm install --frozen-lockfile`, `pnpm --filter @nexos/shared build`, `pnpm build` e `pnpm lint`
  (todos PASS), com prova negativa do gate compile-time.
- **Nenhum commit foi feito** (conforme instrução do prompt). Commit/abertura de PR fica a cargo do
  responsável. Não iniciar PR-0.4.
