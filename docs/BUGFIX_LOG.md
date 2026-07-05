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
> - Status possível: `ABERTO` · `EM_ANÁLISE` · `RATIFICADA` · `PARCIALMENTE_IMPLEMENTADA` · `CORRIGIDO` · `VALIDADO` · `NÃO_REPRODUZ` · `ACEITO_COMO_PENDÊNCIA`.
> - Severidade: `BLOQUEANTE` · `ALTA` · `MÉDIA` · `BAIXA`.
>
> **Nota de nomenclatura (extensão acordada do modelo):** além de `BUG-NNN`, este ledger registra
> **`PROP-*`** (propostas que mudam canônico — exigem ADR/ratificação antes de implementar) e **`DIV-*`**
> (divergências documentais), seguindo a nomenclatura do `WEB_IMPLEMENTATION_ROADMAP.md`. Mesmos campos
> obrigatórios; o ID indica a natureza.

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
- Status final: ABERTO | EM_ANÁLISE | RATIFICADA | PARCIALMENTE_IMPLEMENTADA | CORRIGIDO | VALIDADO | NÃO_REPRODUZ | ACEITO_COMO_PENDÊNCIA
```

---

## Índice de bugs

| ID | Data | PR/Fase | Severidade | Título | Status |
|---|---|---|---|---|---|
| BUG-011 | 2026-06-25 | PR-BE-FIX-REFRESH-COOKIE-DEV-01 | ALTA | Cookie de refresh saía com `Secure` fixo em dev/local HTTP | CORRIGIDO |
| BUG-012 | a confirmar | PR-1.4 → PR-BUGFIX-1 | BLOQUEANTE | Runtime conecta como role superuser → RLS inerte (= PEND-001) | CORRIGIDO |
| BUG-013 | 2026-06-24 | PR-DIAG-MVP-STABILIZATION-01 | BLOQUEANTE | `POST /appointments` retorna 500 por `ON CONFLICT` incompatível com índice parcial de clients | CORRIGIDO |
| BUG-014 | 2026-06-24 | PR-DIAG-MVP-STABILIZATION-01 | BLOQUEANTE | Rotas públicas retornam 500 por `PublicBookingService` indefinido no controller | VALIDADO |
| BUG-015 | 2026-06-24 | PR-DIAG-MVP-STABILIZATION-01 | ALTA | Ações com `If-Match` retornam 500 por `Reflector` indefinido no `IfMatchGuard` | VALIDADO |
| BUG-016 | 2026-06-24 | PR-FIX-MVP-CONTRACT-AVAILABILITY-AND-TESTS-01 | ALTA | Availability rejeita `YYYY-MM-DD`, divergindo do contrato HTTP | VALIDADO |
| BUG-017 | 2026-06-24 | PR-DIAG-MVP-STABILIZATION-01 | ALTA | Testes existentes de RLS/idempotência não acompanham o schema atual | PARCIALMENTE_CORRIGIDO |
| BUG-018 | 2026-06-25 | PR-WEB-FIX-MVP-OPERABILITY-01 | ALTA | Web do MVP mantinha rotas operacionais sem navegação útil e submissões com `Idempotency-Key` instável | IMPLEMENTADO_NO_BRANCH |
| PROP-E1 | 2026-06-24 | Pré-PR backend (web) · PR-PROP-E1-SNAPSHOT-CONTRACT | ALTA | Snapshot de preço no agendamento | RATIFICADA |
| PROP-E2 | 2026-06-23 | PR-PROP-E2-PROFESSIONAL-SERVICES-CONTRACT-01 · PR-BE-PROF-SVC (E2a) | ALTA | Exigir vínculo `professional_services` na reserva/disponibilidade | PARCIALMENTE_IMPLEMENTADA |
| PROP-E2b | 2026-06-24 | Pré-WEB-7A · PR-PROP-E2B-PUBLIC-VITRINE-CONTRACT | ALTA | Vitrine pública relacionar serviço ↔ profissional | RATIFICADA |
| PROP-E2c | 2026-06-23 | Pré-WEB-3 · PR-PROP-E2C-PROFESSIONAL-SERVICES-MGMT-01 | ALTA | API de gerenciamento do vínculo `professional_services` | RATIFICADA |
| PROP-E4 | a confirmar | Transversal web | MÉDIA | Envelope de lista/paginação consistente | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-001 | 2026-06-23 | PR-DIAG-WEB | ALTA | Slug público inexistente retorna 500 | VALIDADO |
| INV-WEB-002 | 2026-06-23 | PR-DIAG-WEB | ALTA | Cancelamento público com token inválido retorna 500 | VALIDADO |
| INV-WEB-003 | 2026-06-23 | PR-DIAG-WEB | BAIXA | Divergência de nomenclatura entre DTOs shared e contrato/roadmap | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-004 | 2026-06-23 | PR-DIAG-WEB | BAIXA | `PasswordChangeInput` citado no contrato não exportado no shared | ABERTO |
| INV-WEB-005 | 2026-06-23 | PR-DIAG-WEB | BAIXA | Claims do access token não exportadas como schema no shared | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-006 | 2026-06-23 | PR-DIAG-WEB | ALTA | Web pública já existe parcialmente; roadmap/conductor partiam de premissa greenfield | ABERTO |
| INV-WEB2-002 | 2026-06-25 | PR-FIX-MVP-CONTRACT-AVAILABILITY-AND-TESTS-01 | MÉDIA | `details[]` existe na API, mas o binding visual do campo no formulário real segue sem prova runtime | ACEITO_COMO_PENDÊNCIA |
| INV-RLS-001 | 2026-06-23 | PR-FIX-RLS-RUNTIME-ROLE-01 · PR-REVERIFY-RLS-RUNTIME-01 | ALTA | GRANT genérico de setup regrediu hardening append-only de audit_logs | CORRIGIDO |
| DIV-PR-4.3 | a confirmar | PR-4.3 / Fase 4 | BAIXA | Design-spec primária ausente | ACEITO_COMO_PENDÊNCIA |
| BUG-019 | 2026-06-25 | PR-BE-FIX-APPOINTMENTS-LIST-SNAPSHOT-01 | ALTA | `GET /appointments` (lista) retorna items sem os 4 campos de snapshot do serviço | CORRIGIDO |
| BUG-020 | 2026-06-25 | PR-BE-FIX-ORG-SETTINGS-ROUTE-01 | ALTA | `GET /organizations/:id` falha com `404` na tela de Configurações; `PATCH` não persistia `slotIntervalMin` | CORRIGIDO |
| DIV-BE-APPOINTMENTS-LIST-SCHEMA-SNAPSHOT-01 | 2026-06-25 | PR-BE-FIX-APPOINTMENTS-LIST-SNAPSHOT-01 | MÉDIA | `DATABASE_SCHEMA_V2 §8.1` não lista colunas de snapshot que já existem (doc-lag) | PROPOSTA |
| PROP-SLOT-STEP-PER-SERVICE-01 | 2026-06-26 | Emenda a ADR-023 (a confirmar) | ALTA | Passo da grade por serviço (link público oferta 30/30 ignorando duração) | CORRIGIDO |
| PROP-BUFFER-AFTER-MIN-01 | 2026-06-26 | Pré-PR (design ratificado; implementação futura) | ALTA | Intervalo de pausa pós-atendimento (buffer) para impedir agendamentos colados | RATIFICADA |
| BUG-021 | 2026-06-29 | PR-BE-FIX-SECURITY-HARDENING-01 | BLOQUEANTE | Endpoints CRUD autenticados aceitam body não validado (DTOs são interfaces TS; sem zod/ValidationPipe em runtime) | IMPLEMENTADO_NO_BRANCH |
| BUG-022 | 2026-06-29 | PR-BE-FIX-SECURITY-HARDENING-01 | BLOQUEANTE | `password/reset`, `password/change`, `accept-invite` não aplicam política de senha (`min(8)` só em `register`) | IMPLEMENTADO_NO_BRANCH |
| BUG-023 | 2026-06-29 | PR-BE-FIX-SECURITY-HARDENING-01 | ALTA | Campos string de entrada (incl. booking público `client.name`/`phone`) sem `max` → risco de estouro/abuso | IMPLEMENTADO_NO_BRANCH |
| BUG-024 | 2026-06-29 | PR-BE-FIX-SECURITY-HARDENING-01 | MÉDIA | Rate-limiter apenas em memória: zera no restart e não cobre múltiplas instâncias | ACEITO_COMO_PENDÊNCIA |
| BUG-025 | 2026-06-29 | PR-BE-FIX-SECURITY-HARDENING-01 | BAIXA | CORS não configurado explicitamente no bootstrap; verificar topologia de deploy antes de expor | IMPLEMENTADO_NO_BRANCH |
| BUG-026 | 2026-06-29 | PR-BE-FIX-SECURITY-HARDENING-01 | BAIXA | Resíduo de BUG-023: `CreateAppointmentSchema`/`RescheduleSchema` (painel autenticado) sem `max` em `client.name`/`phone`/`note` | IMPLEMENTADO_NO_BRANCH |
| BUG-027 | 2026-06-29 | PR-BE-FIX-SECURITY-HARDENING-01 | BAIXA | `JWT_SECRET` validado só por presença; segredo curto/fraco aceito sob HS256 (brute-force offline) | IMPLEMENTADO_NO_BRANCH |
| BUG-028 | 2026-06-29 | PR-BE-PUBLIC-CLIENT-UPSERT-NO-OVERWRITE-01 | MÉDIA | Booking público sobrescreve `clients.name`/`phone` via `ON CONFLICT DO UPDATE` — visitante anônimo corrompe cadastro de balcão sabendo um telefone já registrado na org | IMPLEMENTADO_NO_BRANCH |

> Atualizar esta tabela a cada nova entrada e a cada mudança de status.

---

## Registros

### BUG-012 — Runtime conecta como role superuser → RLS inerte (= PEND-001 canônico)
- Data: a confirmar na fonte (identificado na janela PR-1.4 → PR-BUGFIX-1)
- PR/Fase: PR-1.4 (origem) · reafirmado em PR-BUGFIX-1 · fix planejado em PR-FIX-3
- Severidade: BLOQUEANTE
- Erro encontrado: a API em runtime conecta ao Postgres com a role `nexos_booking`, que tem
  `rolsuper=true`/`rolbypassrls=true`. Sob superuser/`BYPASSRLS`, a RLS **não é aplicada** mesmo com as
  policies criadas — o isolamento de tenant passa a depender **apenas** dos guards de aplicação.
- Sintoma: não há erro visível em runtime (é justamente o risco); detectável só por inspeção de catálogo
  (`pg_roles`/`pg_stat_activity`) e por teste cross-tenant direto no banco. CI também não roda por falta
  de paridade da role (faceta PEND-001, abaixo).
- Causa raiz: o ambiente conecta com role privilegiada (dona do schema / superuser) em vez da role
  least-privilege `app_runtime` especificada em `DATABASE_SCHEMA_V2 §10.2` e `ARCHITECTURE_DECISIONS`
  (ADR-001, item least-privilege). A criação/uso da role `app_runtime` (sem `BYPASSRLS`/`SUPERUSER`/DDL)
  é pré-requisito de infra (§10.2) que não foi efetivado no ambiente.
- Impacto: **segurança/multi-tenant.** Com RLS inerte, a defesa em profundidade do ADR-001 não existe:
  um repository que esqueça o `WHERE organization_id = …` vaza linha de outro tenant sem o banco barrar.
  **Bloqueante para qualquer escrita tenant-scoped a jusante** (toda a fase WEB-1+ depende disto provado).
  Bloqueia PEND-Fase5 (isolamento cross-tenant nunca provado pelo banco).
- Arquivo(s) afetado(s): `apps/api/src/db/**` (db.config / módulo db) e provisionamento de infra (role
  `app_runtime`, fora da migration versionada — §10.2). *Diagnóstico é read-only; nenhum arquivo é tocado
  por esta entrada.*
- Correção aplicada: **nenhuma ainda.** Diagnóstico objetivo via `PR-VERIFY-RLS-RUNTIME-01` (read-only);
  correção é o futuro `PR-FIX-3` (provisionar/usar `app_runtime`), fora do escopo do VERIFY.
- Teste/validação executado: **NÃO EXECUTADO** até o VERIFY. Provas exigidas (6): `pg_roles`
  (`rolsuper=false`/`rolbypassrls=false`); `current_user`/`pg_stat_activity` = `app_runtime`;
  `relrowsecurity=t AND relforcerowsecurity=t` nas tenant-scoped (§2/§10); teste cross-tenant negativo →
  0 linhas por força da policy; hash do commit do fix + ID do run de CI. "NÃO EXECUTADO nunca vira PASS."
- Branch/commit relacionado: PR-FIX-3 (a abrir) · run de CI (a registrar quando PEND-001 destravar a CI).
- Prevenção de regressão: teste cross-tenant negativo no banco como gate de CI; asserção de catálogo
  (`rolbypassrls=false`) no boot/health-check do ambiente.
- Status final: CORRIGIDO
- **PEND-001 (faceta de pendência ligada, mesmo root/fix):** desde PR-1.4, a role least-privilege não tem
  paridade no ambiente de CI → a CI não roda. Mesmo `PR-FIX-3` resolve as duas facetas (runtime + CI).
- Nota de diagnóstico (2026-06-24 — PR-DIAG-MVP-STABILIZATION-01): runtime confirmado novamente como
  inseguro no banco descartável `nexos_diag_mvp_20260624`. Evidência: boot da API registrou
  `Runtime role (current_user) has SUPERUSER and BYPASSRLS`; consulta a `pg_stat_activity` mostrou
  conexão da API como `nexos_booking` com `usesuper=t`; catálogo mostrou `app_runtime` existente com
  `rolsuper=false`/`rolbypassrls=false`, mas não usado pela API. Resultado do gate RLS runtime:
  **VERMELHO / bloqueio de confiança**.
- Nota de correção (2026-06-24 — PR-FIX-MVP-BLOCKERS-RUNTIME-AND-APPOINTMENTS-01): runtime separado de
  admin/migration em `apps/api/src/db/db.config.ts`, `apps/api/src/db/db.service.ts`,
  `apps/api/scripts/apply-migrations.mjs`, `apps/api/scripts/gate-setup.sql`, `.env.example` e
  `docker-compose.yml`. Prova no pool real da API via `apps/api/scripts/test-runtime-role.ts` e boot real:
  `current_user=app_runtime`, `rolbypassrls=false`, `rolsuper=false`. Prova mínima de isolamento:
  consulta sem tenant context retornou `0`, tenant correto retornou `1`, cross-tenant retornou `0`.
  Prova negativa obrigatória do guard de boot: iniciar a API com a role administrativa falhou no boot com
  erro explícito `Unsafe runtime database configuration...` e exit code diferente de zero.

### BUG-013 — `POST /appointments` retorna 500 por `ON CONFLICT` incompatível com índice parcial de clients
- Data: 2026-06-24
- PR/Fase: PR-DIAG-MVP-STABILIZATION-01
- Severidade: BLOQUEANTE
- Erro encontrado: criação de appointment pelo painel retorna `500 INTERNAL_ERROR` em banco migrado do zero.
- Sintoma: `POST /api/v1/appointments` com dados válidos retornou `500`; logs locais correlacionados por
  `requestId` mostraram erro Postgres `42P10`: `there is no unique or exclusion constraint matching the
  ON CONFLICT specification`.
- Causa raiz: `AppointmentsRepository.upsertClientByPhone` usa `ON CONFLICT (organization_id,
  phone_normalized) DO NOTHING`, mas o índice canônico de `clients` é parcial:
  `(organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL`. O predicado parcial não é
  repetido no `ON CONFLICT`, divergindo de `DATABASE_SCHEMA_V2 §7`.
- Impacto: bloqueia o fluxo principal de agenda: criação de appointment, snapshot de serviço,
  concorrência/no_overlap via API, idempotência de sucesso, booking público e validações dependentes.
- Arquivo(s) afetado(s): `apps/api/src/appointments/appointments.repository.ts`.
- Correção aplicada: `AppointmentsRepository.upsertClientByPhone` passou a usar `ON CONFLICT
  (organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL`, alinhado ao índice parcial
  canônico. No caminho de `POST /appointments`, `client.phone` continua obrigatório por contrato; o caso
  `phone_normalized = NULL` ficou apenas como inserção defensiva sem deduplicação. No mesmo PR, o módulo
  de auth passou a setar `app.current_user_id` antes dos lookups de membership sob RLS e
  `appointment_events.actor_type` foi alinhado para `STAFF`, destravando o fluxo runtime completo.
- Teste/validação executado: smoke HTTP runtime `apps/api/scripts/smoke-appointments-runtime.mjs` no banco
  descartável `nexos_appointments_guard_20260624`:
  `POST /api/v1/appointments` válido → `201`;
  response com `serviceNameSnapshot`, `serviceDurationMinSnapshot`,
  `servicePriceCentsSnapshot`, `serviceCurrencySnapshot`;
  segundo POST sequencial sobreposto → `409 APPOINTMENT_CONFLICT`;
  query no banco confirmou `count(*) = 1` no slot;
  mesma `Idempotency-Key` + mesmo payload → replay `201`;
  mesma `Idempotency-Key` + payload diferente → `409 IDEMPOTENCY_KEY_REUSED`.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste de criação de appointment em banco pós-migration 0008; teste de upsert de
  cliente com telefone usando o índice parcial; teste de concorrência esperando primeiro sucesso e segundo
  `409 APPOINTMENT_CONFLICT`.
- Status final: CORRIGIDO

### BUG-014 — Rotas públicas retornam 500 por `PublicBookingService` indefinido no controller
- Data: 2026-06-24
- PR/Fase: PR-DIAG-MVP-STABILIZATION-01
- Severidade: BLOQUEANTE
- Erro encontrado: rotas públicas de vitrine, availability, booking e cancelamento por token retornam
  `500 INTERNAL_ERROR`.
- Sintoma: `GET /api/v1/public/:orgSlug`, `GET /api/v1/public/:orgSlug/professionals/:professionalSlug/availability`,
  `POST /api/v1/public/:orgSlug/appointments` e `POST /api/v1/public/cancel/preview` retornaram `500`.
  Logs locais mostraram `TypeError: Cannot read properties of undefined (reading 'getVitrine')`,
  `getAvailability`, `bookAppointment` e `previewCancel` em `PublicBookingController`.
- Causa raiz: `PublicBookingController` dependia de DI implícita no constructor
  (`constructor(private readonly service: PublicBookingService)`), e no runtime atual da API sob `tsx`
  a metadata implícita não foi resolvida de forma confiável; o Nest instanciou o controller com
  `service = undefined`. Depois de destravar a DI, o fluxo público revelou um segundo defeito do mesmo
  caminho: `PublicBookingRepository.upsertClientByPhone` repetia o `ON CONFLICT` incompatível com o índice
  parcial de `clients`, reproduzindo o `42P10` já visto no BUG-013, mas agora restrito ao booking público.
- Impacto: bloqueia a página pública inteira: vitrine, professionalSlugs, availability pública, booking,
  geração/uso de `cancelUrl` e validação de token inválido/terminal. Mantém `INV-WEB-001` e
  `INV-WEB-002` vermelhos em runtime.
- Arquivo(s) afetado(s): `apps/api/src/public-booking/public-booking.controller.ts`,
  `apps/api/src/public-booking/public-booking.service.ts`,
  `apps/api/src/public-booking/public-booking.repository.ts`,
  `apps/api/scripts/smoke-public-booking-runtime.mjs`.
- Correção aplicada: `PublicBookingController` passou a injetar `PublicBookingService` com `@Inject(...)`
  explícito. No mesmo fluxo, `bookAppointment` passou a tratar `orgSlug` inexistente com
  `NotFoundException` real, e `PublicBookingRepository.upsertClientByPhone` foi alinhado ao índice parcial
  canônico de `clients` com SQL explícito:
  `ON CONFLICT (organization_id, phone_normalized) WHERE phone_normalized IS NOT NULL`.
- Teste/validação executado: `POSTGRES_DB=nexos_pr_fix_public_locking_20260624 APP_RUNTIME_USER=app_runtime
  APP_RUNTIME_PASSWORD=*** node apps/api/scripts/smoke-public-booking-runtime.mjs` no banco temporário
  migrado do zero:
  `GET /api/v1/public/:orgSlug` válido → `200` com `professionalSlugs`;
  slug inexistente → `404 NOT_FOUND`;
  combinação profissional-serviço inválida → `422 PROFESSIONAL_SERVICE_NOT_LINKED`;
  `POST /api/v1/public/:orgSlug/appointments` válido → `201` com `cancelUrl`;
  query no banco confirmou evento `CREATED|CLIENT|NULL`.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste de boot/DI do `PublicBookingModule`; teste negativo de slug inexistente
  esperando `404 NOT_FOUND`; teste negativo de cancel token inválido esperando `410 Gone`; teste positivo
  de vitrine com `professionalSlugs`.
- Status final: VALIDADO

### BUG-015 — Ações com `If-Match` retornam 500 por `Reflector` indefinido no `IfMatchGuard`
- Data: 2026-06-24
- PR/Fase: PR-DIAG-MVP-STABILIZATION-01
- Severidade: ALTA
- Erro encontrado: rotas de ação/remarcação protegidas por optimistic locking retornam `500`.
- Sintoma: `POST /api/v1/appointments/:id/cancel` e `POST /api/v1/appointments/:id/complete` retornaram
  `500 INTERNAL_ERROR`; logs locais mostraram `TypeError: Cannot read properties of undefined (reading
  'get')` em `IfMatchGuard.canActivate`.
- Causa raiz: `IfMatchGuard` dependia de DI implícita no constructor
  (`constructor(private readonly reflector: Reflector)`), e no runtime atual da API sob `tsx` a metadata
  implícita não foi resolvida de forma confiável; o Nest instanciou o guard com `reflector = undefined`.
  Depois de destravar a DI, a ação `cancel` ainda revelou um segundo 500 no mesmo caminho de prova:
  `AppointmentsService.cancel` passava `cancelledByType` em camelCase para o update, deixando
  `cancelled_by_type` ausente e violando a constraint `chk_cancelled_by`.
- Impacto: bloqueia cancelamento/remarcação/desfechos do painel, impede provar `If-Match`, lost update e
  máquina de estados. Sem esse gate, ausência de `If-Match` também vira `500` em vez de erro contratual.
- Arquivo(s) afetado(s): `apps/api/src/appointments/guards/if-match.guard.ts`,
  `apps/api/src/appointments/appointments.service.ts`,
  `apps/api/scripts/smoke-if-match-runtime.mjs`.
- Correção aplicada: `IfMatchGuard` passou a injetar `Reflector` com `@Inject(Reflector)` explícito.
  No mesmo caminho de runtime, `AppointmentsService.cancel` passou a propagar `cancelled_by_type` no
  formato esperado pelo schema, eliminando o `500` por `chk_cancelled_by` na ação correta.
- Teste/validação executado:
  `POSTGRES_DB=nexos_pr_fix_public_locking_20260624 APP_RUNTIME_USER=app_runtime
  APP_RUNTIME_PASSWORD=*** node apps/api/scripts/smoke-if-match-runtime.mjs` no banco temporário
  migrado do zero:
  ausência de `If-Match` → `400 BAD_REQUEST`;
  versão antiga → `409 APPOINTMENT_VERSION_CONFLICT`;
  versão correta → remarcação `200` e cancelamento bem-sucedido, sem `500`;
  query no banco confirmou estado final `CANCELLED|3|STAFF`.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste sem `If-Match` esperando erro contratual; teste com versão antiga
  esperando `409 APPOINTMENT_VERSION_CONFLICT`; teste com versão correta executando a ação e incrementando
  `version`.
- Status final: VALIDADO

### BUG-016 — Availability rejeita `YYYY-MM-DD`, divergindo do contrato HTTP
- Data: 2026-06-24
- PR/Fase: PR-FIX-MVP-CONTRACT-AVAILABILITY-AND-TESTS-01
- Severidade: ALTA
- Erro encontrado: endpoints de availability painel/público divergiam do contrato e da resolução civil
  por timezone da organização.
- Sintoma: `GET /api/v1/professionals/:id/availability?from=2026-06-26&to=2026-06-27&serviceId=...`
  retornava `422 VALIDATION_ERROR` com `details[]` indicando `from`/`to` como `Invalid datetime`; além
  disso, o backend ainda misturava `new Date(YYYY-MM-DD)` com `toISOString()`, arriscando prender o
  cálculo em UTC/Z em vez do fuso da empresa.
- Causa raiz: `AvailabilityQuerySchema` exigia `datetime({ offset: true })`, enquanto
  `API_CONTRACTS §15.1` define `date` ou `from`/`to` como `YYYY-MM-DD`; o service/repository tratavam a
  janela como datetime absoluto da máquina (`new Date(...)`) e serializavam slots com `toISOString()`,
  perdendo o offset contratual da organização.
- Impacto: availability painel/pública não segue o contrato; bloqueia validação de timezone, DST e
  coerência POST ↔ availability.
- Arquivo(s) afetado(s): `packages/shared/src/civil-date.ts`,
  `packages/shared/src/dto/availability.dto.ts`, `packages/shared/src/index.ts`,
  `apps/api/src/scheduling/availability.controller.ts`,
  `apps/api/src/scheduling/availability.service.ts`,
  `apps/api/src/scheduling/availability.repository.ts`,
  `apps/api/src/public-booking/public-booking.controller.ts`,
  `apps/api/src/public-booking/public-booking.service.ts`,
  `apps/api/scripts/smoke-availability-contract-runtime.mjs`,
  `apps/web/components/public/booking-flow.tsx`,
  `apps/web/app/(authenticated)/schedule/page.tsx`,
  `apps/web/hooks/use-schedule.ts`.
- Correção aplicada:
  1. `AvailabilityQuerySchema` passou a aceitar apenas `date=YYYY-MM-DD` ou `from=YYYY-MM-DD&to=YYYY-MM-DD`,
     rejeitando `DD/MM/YYYY`, datetime completo, `date` misturado com `from/to` e janelas incompletas.
  2. O backend passou a resolver a data civil no timezone da organização, não no timezone da máquina.
  3. Os slots de availability passaram a sair como ISO com offset da organização
     (ex.: `2026-06-26T09:00:00-03:00`), sem vazar `Z` como formato final.
  4. Os três chamadores web que ainda enviavam datetime para availability foram ajustados para enviar
     somente `YYYY-MM-DD` na query da API.
- Teste/validação executado:
  `pnpm --filter @nexos/shared build` → `PASS`;
  `pnpm --filter @nexos/api build` → `PASS`;
  `POSTGRES_DB=nexos_availability_contract_20260625 APP_RUNTIME_USER=app_runtime APP_RUNTIME_PASSWORD=*** pnpm --filter @nexos/api test:runtime-role` → `PASS`;
  `TZ=UTC POSTGRES_DB=nexos_availability_contract_20260625 APP_RUNTIME_USER=app_runtime APP_RUNTIME_PASSWORD=*** node apps/api/scripts/smoke-availability-contract-runtime.mjs` → `PASS`, com as seguintes provas:
  * Marco A: painel `date=YYYY-MM-DD` → `200`; painel `from/to=YYYY-MM-DD` → `200`; público `date` → `200`; público `from/to` → `200`; `24/06/2026` → `422`; datetime completo na query → `422`; `date` junto com `from/to` → `422`; ausência de `date` e `from/to` → `422`; `from` sem `to` → `422`; `to` sem `from` → `422`.
  * Marco B: slot emitido por availability (`2026-06-26T09:00:00-03:00`) foi aceito por `POST /api/v1/appointments` → `201`; após criar o appointment, o slot saiu da availability.
  * Marco C: dia com jornada configurada retornou slots; bloqueio datado removeu `09:30`; booking público fora da jornada alinhado à grade (`17:00`) retornou `422 OUTSIDE_WORKING_HOURS`.
  * Marco D1 obrigatório: smoke rodado com `TZ=UTC` e organização `America/Sao_Paulo`; o slot das 09:00 saiu como `2026-06-26T09:00:00-03:00` e não como `+00:00`.
- Pendências de validação:
  * D2/DST: **NÃO EXECUTADO** neste PR. A prova obrigatória de timezone sem DST (D1) foi concluída; a
    prova de transição DST permanece pendente em fuso com DST ativo.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste de availability com `YYYY-MM-DD`; fixture de timezone e DST garantindo
  que todo slot emitido pelo availability passa na validação de POST.
- Status final: VALIDADO

### BUG-017 — Testes existentes de RLS/idempotência não acompanham o schema atual
- Data: 2026-06-24
- PR/Fase: PR-DIAG-MVP-STABILIZATION-01
- Severidade: ALTA
- Erro encontrado: scripts de teste existentes falham contra banco descartável migrado até 0008.
- Sintoma: `POSTGRES_DB=nexos_diag_mvp_20260624 pnpm --filter @nexos/api test:db` falhou ao inserir
  appointment sem snapshots (`service_name_snapshot` NOT NULL). `POSTGRES_DB=nexos_diag_mvp_20260624
  pnpm --filter @nexos/api test:idempotency` falhou em T18b e depois em FK de `idempotency_keys` para
  organização inexistente.
- Causa raiz: seeds/asserções dos scripts ficaram defasados após a migration 0008 de snapshot e após a
  evolução do interceptor/fluxo de idempotência.
- Impacto: testes locais/CI não servem como evidência de fechamento do MVP; gates de RLS e idempotência
  permanecem sem prova automatizada confiável.
- Arquivo(s) afetado(s): `apps/api/scripts/test-rls.mjs`, `apps/api/scripts/test-idempotency.mjs`.
- Correção aplicada: seed de `apps/api/scripts/test-rls.mjs` atualizado para preencher snapshots exigidos
  pela migration 0008; adicionado `apps/api/scripts/smoke-appointments-runtime.mjs` para prova HTTP real
  de criação de appointment, conflito sequencial e idempotência divergente; `apps/api/package.json`
  ganhou `test:runtime-role` para a prova isolada de role runtime. No
  `PR-FIX-MVP-CONTRACT-AVAILABILITY-AND-TESTS-01`, foi adicionado ainda
  `apps/api/scripts/smoke-availability-contract-runtime.mjs` para cobrir o bloco defasado de
  availability civil-date/timezone/coerência com POST e gate de jornada do escopo deste PR.
- Teste/validação executado:
  `APP_RUNTIME_USER=app_runtime APP_RUNTIME_PASSWORD=*** POSTGRES_DB=nexos_appointments_guard_20260624 pnpm --filter @nexos/api test:db` → `PASS`;
  `POSTGRES_DB=nexos_appointments_guard_20260624 node ./apps/api/scripts/smoke-appointments-runtime.mjs`
  → `PASS`;
  `POSTGRES_DB=nexos_availability_contract_20260625 APP_RUNTIME_USER=app_runtime APP_RUNTIME_PASSWORD=*** pnpm --filter @nexos/api test:runtime-role` → `PASS`;
  `TZ=UTC POSTGRES_DB=nexos_availability_contract_20260625 APP_RUNTIME_USER=app_runtime APP_RUNTIME_PASSWORD=*** node ./apps/api/scripts/smoke-availability-contract-runtime.mjs` → `PASS`;
  `pnpm --filter @nexos/api test` continua sem script agregado dedicado neste pacote, então a evidência
  permanece nos smokes/harnesses isolados acima, e ainda resta pendência de suite agregada/coerência
  para áreas fora do escopo deste PR.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: atualizar os seeds para preencher snapshots ou criar appointment via API já
  corrigida; criar organização antes de inserir `idempotency_keys`; transformar asserções de idempotência
  em prova server-side runtime de replay fiel, divergência `409` e `IN_PROGRESS`; manter smoke dedicado
  de availability civil-date/timezone para não regredir BUG-016.
- Status final: PARCIALMENTE_CORRIGIDO

### BUG-011 — Cookie de refresh saía com `Secure` fixo em dev/local HTTP
- Data: 2026-06-25
- PR/Fase: PR-BE-FIX-REFRESH-COOKIE-DEV-01
- Severidade: ALTA
- Erro encontrado: o backend emitia e limpava `refresh_token` com `secure: true` hardcoded mesmo em `NODE_ENV=development`, o que impede persistência/envio do cookie em `http://localhost`.
- Sintoma: login podia responder com sucesso e `/auth/me` funcionava logo após login, mas o bootstrap real por cookie após reload não se sustentava em ambiente local HTTP.
- Causa raiz: `setRefreshCookie()` e `clearRefreshCookie()` em `apps/api/src/auth/auth.controller.ts` repetiam flags do cookie com `secure: true` fixo, sem distinguir dev/local de produção.
- Impacto: quebrava persistência real de sessão da Web em localhost e empurrava o frontend para contornos indevidos de bootstrap.
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.controller.ts`, `apps/api/scripts/smoke-refresh-cookie-controller.mjs`.
- Correção aplicada: extraído helper local único `getRefreshCookieOptions()` para compartilhar flags de `set` e `clear`; regra final ficou `process.env.NODE_ENV === "production"` → `secure: true`, caso contrário `secure: false`, sempre preservando `httpOnly: true`, `sameSite: "strict"` e `path: "/api/v1/auth/refresh"`.
- Teste/validação executado:
  `pnpm --filter @nexos/api build` → `PASS`;
  `pnpm --filter @nexos/api test:runtime-role` → `PASS` (`current_user=app_runtime`, `rolsuper=false`, `rolbypassrls=false`);
  `node apps/api/scripts/smoke-refresh-cookie-controller.mjs` → `PASS`, com prova runtime focada de controller/guard: em `development`, `register`, `login` e `refresh` emitiram `refresh_token` com `HttpOnly`, `SameSite=strict`, `Path=/api/v1/auth/refresh`, `Max-Age=2592000000` e `secure=false`; `refresh` sem `X-CSRF: 1` retornou `403`; `logout` preservou `204` e limpou cookie com mesmas flags; em `production`, `login` emitiu `refresh_token` com `secure=true`.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: manter smoke focado cobrindo dev/prod e garantir que qualquer mudança futura em cookie reuse helper único para `set`/`clear`.
- Status final: CORRIGIDO
- Observação: prova pré-fix foi por inspeção do hardcode `secure: true`; prova pós-fix foi runtime focada via harness de controller/guard porque bootstrap HTTP integral da API nesta worktree continua bloqueado por dependência pré-existente fora do escopo deste PR.

### BUG-018 — Web do MVP mantinha rotas operacionais sem navegação útil e submissões com `Idempotency-Key` instável
- Data: 2026-06-25
- PR/Fase: PR-WEB-FIX-MVP-OPERABILITY-01
- Severidade: ALTA
- Erro encontrado: a Web expunha páginas operacionais existentes, mas a sidebar mantinha links críticos desabilitados, o dashboard tinha CTA sem ação, jornada/bloqueios não era acessível por clique, e os fluxos de criação no painel/público geravam nova `Idempotency-Key` por tentativa técnica em vez de mantê-la estável por submissão lógica.
- Sintoma: o usuário autenticado não conseguia navegar por clique para agenda/serviços/equipe/configurações; a rota de jornada dependia de URL manual; retries de criação podiam sair com chave diferente; a confirmação pública copiava apenas o token de cancelamento, não uma URL útil; a confirmação também fixava `America/Sao_Paulo` em vez da timezone da org.
- Causa raiz: drifts locais no frontend: navegação marcada como `disabled`, CTA placeholder, ausência de link para jornada dentro da listagem de profissionais, injeção automática/efêmera de `Idempotency-Key` no client e form handlers sem ciclo explícito de rotação por submissão lógica; action de confirmação pública derivada de token em vez de `cancelUrl`.
- Impacto: bloqueava a operabilidade real do MVP Web por clique, especialmente nos marcos A/B/C/D do roadmap, e enfraquecia o contrato de idempotência exigido para agenda e booking público.
- Arquivo(s) afetado(s): `apps/web/components/shell/sidebar.tsx`, `apps/web/app/(authenticated)/dashboard/page.tsx`, `apps/web/app/(authenticated)/professionals/page.tsx`, `apps/web/app/(authenticated)/schedule/page.tsx`, `apps/web/components/schedule/create-appointment-form.tsx`, `apps/web/components/public/booking-flow.tsx`, `apps/web/components/public/confirmation-screen.tsx`, `apps/web/components/public/confirmation-actions.tsx`, `apps/web/lib/http-client.ts`, `apps/web/hooks/use-stable-idempotency-key.ts`.
- Correção aplicada: habilitados links reais da sidebar para rotas já existentes; CTA `Começar` passou a navegar para configurações; jornada/bloqueios ficou acessível por clique a partir de profissionais; a geração automática de `Idempotency-Key` foi removida do client e substituída por um hook estável por submissão lógica, com rotação explícita após sucesso/erro terminal/nova intenção; agenda passou a refazer availability em conflito e a expor erros de carregamento de availability/agendamentos; confirmação pública passou a usar a timezone da org e a copiar/abrir a `cancelUrl` completa.
- Teste/validação executado: `pnpm --filter @nexos/web build` (PASS, fora do sandbox por limitação do Turbopack); `pnpm --filter @nexos/api build` (PASS); `pnpm --filter @nexos/api test:runtime-role` (PASS, `current_user=app_runtime`); smoke HTTP em runtime local com tenant descartável: register `201`, `/auth/me` `200`, services `201`, professionals `201`, working-hours `200`, professional-services `200`, availability painel `200`, appointment painel `201`, cancel painel `201`, vitrine pública `200`, availability pública `200`, booking público `201`, cancel preview `200`, cancel público `200`. Prova de navegador ficou parcial: páginas reais abriram no Safari em `http://localhost:3000/login` e `http://localhost:3000/register`, mas a automação de clique foi bloqueada pelo ambiente (`Allow JavaScript from Apple Events` desabilitado e `System Events` sem permissão para teclas), então os cliques reais ficaram `NÃO EXECUTADO` nesta sessão.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: manter `Idempotency-Key` sob controle explícito do fluxo de submissão; preservar links reais para rotas já implementadas; repetir a validação browser com harness ou permissões de automação antes do commit final.
- Status final: IMPLEMENTADO_NO_BRANCH (commit `4e1fa5d fix(web): restore MVP operability flows` no branch `fix/appointments-list-snapshot`). Código no disco, compilado sem erro. **Pendência crítica: prova de clique/automação NÃO EXECUTADA** (Safari bloqueou automação de teclas; harness de navegador faltando). **CI provisoriamente deferida (D10 conforme ARCHITECTURE_DECISIONS § decisão de infraestrutura)** — a passada final de CI será executada quando dono autorizar re-entrada. Reenquadramento: a agenda será retomada como reconciliação do aceite WEB-5A (visão diária/semanal), após o fix de backend de snapshots na lista (PR-BE-FIX-APPOINTMENTS-LIST-SNAPSHOT-01). Para fechar: (1) prova de clique real das 4 ações (navegação sidebar, CTA dashboard, jornada/bloqueios em profissionais, submissão em agenda/público com `Idempotency-Key` estável); (2) CI rodada + report de passing tests.

### PROP-E1 — Snapshot de preço no agendamento (proposta — muda canônico)
- Data: a confirmar na fonte
- PR/Fase: pré-PR de backend da camada web (`PR-BE-SNAPSHOT`), gate antes de WEB-5B/WEB-7B
- Severidade: ALTA
- Erro encontrado: `appointments` (`DATABASE_SCHEMA_V2 §8.1`) não captura o preço no momento da reserva.
  Mudança futura de `services.price_cents` **corrompe o histórico**; não há backfill possível depois.
- Sintoma: estrutural/latente — relatórios de receita e pagamentos (POST_MVP P6/P10) ficariam sobre
  preço atual, não o preço cobrado. Sem manifestação até existir leitura de receita.
- Causa raiz: ausência de colunas de snapshot (`price_cents_snapshot`, `currency_snapshot`) gravadas na
  criação do agendamento (painel e público). Duração já é "fotografada" via `ends_at`.
- Impacto: integridade de histórico financeiro; bloqueia pagamentos e relatórios sem refactor profundo
  depois. **Muda canônico** (`DATABASE_SCHEMA_V2` + `API_CONTRACTS` de criação/leitura).
- Arquivo(s) afetado(s): migração aditiva de `appointments`; DTO de criação/leitura (`packages/shared`);
  serviço de criação (painel + público).
- Correção aplicada: **nenhuma** — é **PROPOSTA**. Exige ADR + migração **aditiva** ratificada **antes**
  de implementar. Escopo proibido: tocar `no_overlap`/`chk_interval`; mudar `service_id` como canônico.
- Teste/validação executado: a definir no PR — aceite: criar agendamento grava o snapshot; alterar o
  preço do serviço **não** muda agendamentos passados.
- Branch/commit relacionado: `PR-BE-SNAPSHOT` (a abrir após ADR).
- Prevenção de regressão: teste que altera `services.price_cents` e verifica imutabilidade do snapshot.
- Decisão ratificada (2026-06-24 — PR-PROP-E1-SNAPSHOT-CONTRACT):
  1. Adicionar 4 colunas de snapshot em `appointments`: `service_name_snapshot` (text NOT NULL),
     `service_duration_min_snapshot` (int NOT NULL), `service_price_cents_snapshot` (int NOT NULL),
     `service_currency_snapshot` (char(3) NOT NULL DEFAULT 'BRL').
  2. Fonte: `services.name`, `services.duration_min`, `services.price_cents`, `services.currency`
     no momento da criação do appointment.
  3. Preenchido em `POST /appointments` (painel) e `POST /public/:orgSlug/appointments` (público).
  4. Preservado em reagendamento, cancelamento, complete e no-show.
  5. `service_id` continua como FK — snapshot complementa, não substitui.
  6. Migration segura: adicionar colunas nullable → backfill via JOIN com services →
     aplicar NOT NULL. `currency` com DEFAULT 'BRL'.
  7. DTOs de appointment/list/public-booking devem expor snapshot.
  8. `CreateAppointmentInput` não muda — snapshot é responsabilidade do backend.
  9. PR-BE-SNAPSHOT-APPOINTMENT-SERVICE-01: migration 0007, Drizzle schema, shared DTOs,
     appointments.service.ts, public-booking.service.ts, API_CONTRACTS.md. Sem frontend.
- Status final: RATIFICADA (implementação pendente no `PR-BE-SNAPSHOT-APPOINTMENT-SERVICE-01`)

### PROP-E2 — Exigir vínculo `professional_services` na reserva e na disponibilidade (proposta — muda canônico)
- Data: 2026-06-23
- PR/Fase: PR-PROP-E2-PROFESSIONAL-SERVICES-CONTRACT-01 (ratificação) · implementação no `PR-BE-PROF-SVC`
- Severidade: ALTA
- Erro encontrado: a junção `professional_services` (`§6.3`) existe, mas **não é exigida** em §15/§16/§17.
  Vitrine e painel podem marcar um profissional para um serviço que ele não presta.
- Sintoma: agendamento aceito para combinação profissional↔serviço inválida; a junção vira peso morto;
  evoluções "qualquer profissional" (`PLANNING §10.2`) e override por profissional ficam sem fonte de
  verdade.
- Causa raiz: regra de negócio "profissional oferece serviço" não é pré-condição nem filtro nas rotas de
  criação e disponibilidade.
- Impacto: correção de agenda e da vitrine pública; **muda canônico** (clarificação de contrato em
  §15/§16/§17 + código de erro dedicado `PROFESSIONAL_SERVICE_NOT_LINKED`).
- Arquivo(s) afetado(s): validação de criação (painel + público); `GET /availability`; `GET /public/:orgSlug`
  (relacionar serviço↔profissional, não listas planas); `packages/shared`.
- Correção aplicada: **nenhuma** — é **PROPOSTA RATIFICADA**. Implementação no `PR-BE-PROF-SVC`.
- Decisão ratificada (2026-06-23):
  1. `POST /appointments` (painel) rejeita profissional sem vínculo com o serviço → `422 PROFESSIONAL_SERVICE_NOT_LINKED`.
  2. `POST /public/:orgSlug/appointments` aplica a mesma validação.
  3. `GET /professionals/:id/availability` e `GET /public/:orgSlug/professionals/:slug/availability` rejeitam combinação inválida.
  4. `GET /public/:orgSlug` (vitrine) relaciona serviço ↔ profissional, sem listas independentes ambíguas.
  5. WEB-3 permite gerenciar o vínculo `professional_services`.
  6. A solução não bloqueia a evolução futura "qualquer profissional" (PLANNING §10.2).
- Teste/validação executado: a definir no `PR-BE-PROF-SVC`. Aceite (−): reservar profissional que não presta
  o serviço → `422`; vitrine não oferece a combinação.
- Branch/commit relacionado: `PR-BE-PROF-SVC` (a abrir, implementação).
- Prevenção de regressão: teste negativo de reserva com combinação inválida; teste de vitrine sem a
  combinação.
- Desmembramento (2026-06-23): PROP-E2 foi dividida em três partes após implementação parcial:
  * E2a (concluído): enforcement de `professional_services` em `POST /appointments`,
    `POST /public/:orgSlug/appointments`, `GET .../availability` (painel + público).
    Implementado pelo `PR-BE-PROF-SVC` (commit `744c077`). Adicionou `PROFESSIONAL_SERVICE_NOT_LINKED`
    no `API_CONTRACTS.md` §7/§15/§16/§17 e no `packages/shared`.
  * E2b (aberto — ver entrada PROP-E2b): vitrine pública (`GET /public/:orgSlug`) relacionar
    serviço ↔ profissional. Bloqueia WEB-7A.
  * E2c (aberto — ver entrada PROP-E2c): API/backend de gerenciamento do vínculo
    `professional_services`. Bloqueia WEB-3.
  WEB-5B e WEB-7B ficam desbloqueados apenas quanto à validação backend profissional-serviço (E2a),
  ainda respeitando PROP-E1.
- Status final: PARCIALMENTE_IMPLEMENTADA (E2a concluído; E2b e E2c pendentes — ver entradas próprias)

### PROP-E2b — Vitrine pública relacionar serviço ↔ profissional (desmembramento de PROP-E2 §4)
- Data: 2026-06-23
- PR/Fase: Pré-WEB-7A
- Severidade: ALTA
- Erro encontrado: `GET /public/:orgSlug` (`API_CONTRACTS §17.1`) retorna listas planas de `services` e
  `professionals`, sem expor a relação da junção `professional_services`. A vitrine pública não consegue
  saber quais profissionais prestam cada serviço.
- Sintoma: a vitrine pode exibir profissional para serviço que ele não presta; a informação de vínculo
  existe no banco (tabela `professional_services`, `DATABASE_SCHEMA_V2 §6.3`) mas não chega à resposta
  do endpoint.
- Causa raiz: PROP-E2 foi desmembrada após E2a; a vitrine (§17.1) ficou como escopo separado (E2b).
- Impacto: WEB-7A continua bloqueado até que a vitrine pública relacione serviço ↔ profissional.
  Sem isso, o booking público (WEB-7B) exibe combinações inválidas ao visitante.
- Arquivo(s) afetado(s): `apps/api/src/public-booking/` (controller + service de vitrine),
  `packages/shared/src/dto/public-vitrine.dto.ts`, `docs/API_CONTRACTS.md` §17.1.
- Correção aplicada: nenhuma — PR futuro.
- Teste/validação executado: a definir no PR.
- Gate: exige ratificação humana antes da implementação, pois altera `API_CONTRACTS.md` §17.1
  e DTO público.
- Decisão ratificada (2026-06-24 — PR-PROP-E2B-PUBLIC-VITRINE-CONTRACT):
  1. `GET /public/:orgSlug` mantém `services[]` e `professionals[]`.
  2. Cada item de `services[]` ganha `professionalSlugs: string[]` — slugs dos profissionais
     ativos que prestam aquele serviço (via `professional_services`).
  3. Serviços ativos sem profissional vinculado → `professionalSlugs: []`.
  4. Profissionais inativos não entram em `professionalSlugs`.
  5. Serviços inativos não entram em `services[]`.
  6. Mudança aditiva e backward-compatible. `POST /public/:orgSlug/appointments` não muda.
  7. Ordenação estável de `professionalSlugs` (por nome ou slug).
  8. PR-BE-PUBLIC-VITRINE-PROF-SVC-01: shared DTO, public-booking service, API_CONTRACTS §17.1.
     Sem migration, sem frontend, sem alterar booking create.
- Status final: RATIFICADA (implementação pendente no `PR-BE-PUBLIC-VITRINE-PROF-SVC-01`)

### PROP-E2c — API de gerenciamento do vínculo `professional_services` (desmembramento de PROP-E2 §5)
- Data: 2026-06-23
- PR/Fase: Pré-WEB-3
- Severidade: ALTA
- Erro encontrado: não existe endpoint/API para criar ou remover vínculos em `professional_services`.
  A tabela existe (`DATABASE_SCHEMA_V2 §6.3`) com FKs compostas tenant-safe, mas é apenas lida
  (nunca escrita) pelos repositórios de `appointments`, `public-booking` e `scheduling`.
- Sintoma: impossível vincular/desvincular serviços a profissionais via API. WEB-3 não tem superfície
  para gerenciar quais serviços cada profissional presta.
- Causa raiz: `API_CONTRACTS.md` §20.1/§20.2 não especificam endpoint de vínculo; o
  `ProfessionalsController` (`apps/api/src/professionals/professionals.controller.ts`) não implementa
  rota equivalente.
- Impacto: WEB-3 continua bloqueado até existir endpoint de gerenciamento de vínculo. O enforcement
  de E2a já rejeita combinações inválidas, mas sem a API de gestão o vínculo não pode ser criado
  pela interface.
- Arquivo(s) afetado(s): `apps/api/src/professionals/` (controller + service + repository),
  `packages/shared/src/dto/` (schemas de vínculo), `docs/API_CONTRACTS.md` §20.
- Correção aplicada: nenhuma — PR futuro (`PR-BE-PROF-SVC-MGMT`).
- Teste/validação executado: a definir no PR de implementação.
- Decisão ratificada (2026-06-23 — PR-PROP-E2C-PROFESSIONAL-SERVICES-MGMT-01):
  1. `GET /professionals/:id/services` — leitura dos vínculos atuais. Retorna
     `{ professionalId: uuid, serviceIds: uuid[] }`. `serviceIds: []` é válido.
  2. `PUT /professionals/:id/services` com `{ serviceIds: uuid[] }` — substituição total da lista de
     serviços vinculados ao profissional. Idempotente: replay com mesma lista = no-op. Duplicados no
     payload são deduplicados pelo backend.
  3. Concorrência: last-write-wins no MVP, sem `If-Match`/version.
  4. Roles: OWNER e MANAGER.
  5. Remoção de vínculo é permitida mesmo com agendamentos futuros existentes. Agendamentos existentes
     não são alterados. A remoção afeta apenas novos agendamentos (`POST /appointments`) e
     availability futura (`GET /availability`), ambos já protegidos pelo enforcement de E2a
     (`422 PROFESSIONAL_SERVICE_NOT_LINKED`).
  6. Nenhum `error.code` novo necessário. Erros: `404 NOT_FOUND` (profissional/serviço inexistente,
     inativo ou outro tenant), `422 VALIDATION_ERROR` (payload inválido), `403 AUTHZ_DENIED` (role).
  7. `organization_id` nunca no payload — vem do claim `org` (ADR-020). Queries dentro de
     `withTenantContext`. FKs compostas existentes garantem tenant safety no banco.
  8. Nenhuma migration/DDL necessária. Tabela `professional_services` já existe (schema §6.3).
- Emenda de validação (2026-06-23 — PR-DOC-PROP-E2C-AMEND-VALIDATION-01):
  1. `PUT /professionals/:id/services` é all-or-nothing. O backend deve validar todos os
     `serviceIds` antes de aplicar qualquer `DELETE`/`INSERT`. Se qualquer item for inválido,
     nenhum vínculo é alterado.
  2. Erros do `professionalId` no path: profissional inexistente, inativo ou de outro tenant →
     `404 NOT_FOUND`. O recurso-alvo da rota é o profissional; `404` no path é a convenção
     correta (§4).
  3. Erros de `serviceIds` no body (validados ANTES de qualquer mutação):
     * `serviceIds` ausente ou não-array → `422 VALIDATION_ERROR` com `details`.
     * Item que não é UUID → `422 VALIDATION_ERROR` com `details[{ field: "serviceIds[i]",
       issue: "invalid_uuid" }]`.
     * `serviceId` que não existe no escopo da organização atual ou não pode ser resolvido com
       segurança → `422 VALIDATION_ERROR` com `details[{ field: "serviceIds[i]", issue:
       "not_found" }]`. A mensagem/`details` NÃO deve revelar se o `serviceId` existe em outro
       tenant.
     * Motivo: `422` com `details[]` é a convenção do contrato para validação semântica de
       payload (§4). `404` fica reservado para o recurso do path. O envelope `VALIDATION_ERROR`
       não vaza existência cross-tenant.
  4. Serviço `inactive`: é permitido manter ou criar vínculo `professional_services` com serviço
     `active=false`. `active` controla exposição pública (vitrine), disponibilidade (availability)
     e novos bookings — não a existência do vínculo de configuração. O vínculo
     `professional_services` representa capacidade/configuração do profissional, não
     disponibilidade atual. Agendamentos e availability continuam protegidos pelas regras
     existentes: E2a já rejeita novas reservas para combinações sem vínculo; serviço `inactive`
     já não é oferecido em availability/booking independentemente do vínculo.
  5. Remoção de vínculo: `serviceIds` omitidos no `PUT` são removidos por delta. Remoção continua
     permitida mesmo com agendamentos existentes (item 5 da decisão original mantido).
  6. O `PR-BE-PROF-SVC-MGMT` deve materializar estas regras no `API_CONTRACTS.md`, DTOs/shared e
     backend.
- Status final: RATIFICADA (implementação pendente no `PR-BE-PROF-SVC-MGMT`)

### PROP-E4 — Envelope de lista/paginação consistente (proposta — DEFERIDA)
- Data: a confirmar na fonte
- PR/Fase: restrição transversal da camada web (não construída agora)
- Severidade: MÉDIA
- Erro encontrado: envelopes de resposta de lista inconsistentes entre endpoints, o que **fecharia** a
  porta para paginação aditiva por cursor no futuro.
- Sintoma: latente — só dói quando uma lista precisar paginar.
- Causa raiz: ausência de shape padronizado de lista.
- Impacto: evolutibilidade de API. **Deferida**: não se constrói agora, mas a restrição transversal do
  roadmap impede moldar DTO de lista de forma que feche a evolução.
- Arquivo(s) afetado(s): nenhum agora (apenas restrição de design nos PRs WEB).
- Correção aplicada: **nenhuma** — diferida. Mitigação ativa: respostas de lista devem seguir o shape
  canônico `{ items, nextCursor }` quando paginação/lista se aplicar (`API_CONTRACTS §1`), mesmo retornando
  tudo hoje.
- Teste/validação executado: não se aplica (deferida).
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: revisão de DTO de lista em cada PR-WEB (gate transversal).
- Status final: ACEITO_COMO_PENDÊNCIA (deferida; restrição transversal ativa)

### PROP-SLOT-STEP-PER-SERVICE-01 — Passo da grade por serviço (emenda ADR-023 ratificada localmente; aguardando implementação)
- Data: 2026-06-26
- PR/Fase: emenda ao ADR-023 ratificada em `docs/ARCHITECTURE_DECISIONS.md` → implementação em `PR-BE-SERVICE-SLOT-STEP-01`
- Severidade: ALTA
- Erro encontrado: no link público de agendamento os horários ofertados aparecem fixos de 30 em 30 min,
  ignorando a `duration_min` do serviço. Empresa com serviços de durações distintas (ex.: corte 50,
  barba 30) não consegue ofertar horários coerentes com cada serviço.
- Sintoma: `GET /public/:orgSlug/professionals/:slug/availability` emite slots espaçados por
  `organizations.slot_interval_min` (default 30), não pela duração do serviço escolhido. Observado por
  dono ao reconstruir o link externo.
- Causa raiz: por **decisão de ADR-023**, o passo da grade (`alignToSlotGrid(..., slotIntervalMin)`) é
  `organizations.slot_interval_min` — config **única por empresa** e **independente da duração do
  serviço**. ADR-023 rejeitou "grade = duração" no código (para preservar a alavanca de ocupação:
  passo menor que a duração gera mais pontos de início) e **registrou** "grade por serviço (cada serviço
  com seu passo)" como **futuro aditivo, pós-MVP**, junto de buffers/overrides em `professional_services`
  (PLANNING §10.2; ADR-023 § Consequências, linha ~677).
- Impacto: usabilidade real do MVP multi-empresa. A config global única força a mesma cadência para todos
  os serviços da empresa; inviável quando a empresa tem serviços de durações diferentes (caso do dono, que
  já vai colocar 2+ empresas/profissionais em uso). **Muda canônico:** ADR-023, PLANNING §10.2/§16,
  API §15/§16.1 (resposta de availability), `packages/shared` (DTO) e possível migração aditiva em
  `professional_services`/`services`.
- Arquivo(s) afetado(s): `apps/api/db/migrations/0009_professional_service_slot_step.sql`,
  `apps/api/db/schema/index.ts`, `apps/api/src/scheduling/slot-step.util.ts`,
  `apps/api/src/scheduling/availability.service.ts`, `apps/api/src/public-booking/public-booking.service.ts`,
  `apps/api/src/appointments/appointments.service.ts`, `apps/api/scripts/smoke-service-slot-step-runtime.mjs`,
  `packages/shared/src/dto/availability.dto.ts`, `packages/shared/src/slot-grid.ts`,
  `docs/API_CONTRACTS.md`, `docs/DATABASE_SCHEMA_V2.md`, este ledger.
- Correção aplicada:
  1. ledger sincronizado com a emenda do ADR-023 já ratificada localmente;
  2. adicionada coluna aditiva `professional_services.slot_step_min integer null` com constraint
     `NULL OR (>= 5 AND <= 240 AND % 5 = 0)`;
  3. criado helper backend único `resolveEffectiveSlotStepMin()` com regra:
     `professional_services.slot_step_min ?? services.duration_min ?? organizations.slot_interval_min`;
  4. availability, POST público, create staff e reschedule passaram a reutilizar o mesmo cálculo de grade,
     preservando a mesma âncora/jornada/timezone do ADR-023;
  5. `AvailabilityResponse.slotIntervalMin` foi mantido por compatibilidade, agora retornando o passo
     efetivo usado na consulta;
  6. duração do atendimento permaneceu em `services.duration_min`; o passo só define a cadência dos
     horários ofertados/validados.
- Pontos a decidir na ratificação:
  1. Onde mora o passo por serviço: coluna nova (ex.: `services.slot_step_min` ou em
     `professional_services`) **ou** derivar passo = `duration_min` quando não houver override.
  2. Preservar a alavanca de ocupação de ADR-023: permitir passo **menor** que a duração (override
     explícito), com fallback `passo = duration_min`. Não fixar cegamente "grade = duração".
  3. Manter a âncora única e o **gate de coerência POST↔availability sob DST** de ADR-023 (o passo muda;
     a âncora = início da jornada e o utilitário único **não** mudam de semântica).
  4. `slot_interval_min` da empresa: mantém-se como default/fallback ou é aposentado? (decisão de contrato
     — api-contract-guardian).
  5. Compatibilidade do DTO `slotIntervalMin` na resposta de availability (campo informativo hoje;
     web renderiza `days/slots` direto, não usa o campo para render).
- Teste/validação executado:
  * `pnpm --filter @nexos/shared build` → PASS
  * `pnpm --filter @nexos/api build` → PASS
  * `pnpm --filter @nexos/api test:runtime-role` → PASS
    (`current_user=app_runtime`, `rolsuper=false`, `rolbypassrls=false`)
  * `pnpm --filter @nexos/api migrate:fresh -- --database nexos_service_slot_step_20260626` → PASS
  * `POSTGRES_DB=nexos_service_slot_step_20260626 node apps/api/scripts/smoke-service-slot-step-runtime.mjs`
    → PASS, com as seguintes provas:
    - serviço 30min: `09:00`, `09:30`, `10:00`
    - serviço 45min: `09:00`, `09:45`, `10:30`
    - serviço 50min: `09:00`, `09:50`, `10:40`
    - override 25 para duração 50: `09:00`, `09:25`, `09:50`
    - público: slot emitido por availability foi aceito por `POST /api/v1/public/:orgSlug/appointments` → `201`
    - staff create: slot emitido por availability foi aceito por `POST /api/v1/appointments` → `201`
    - reschedule: slot alinhado → `200`; slot off-grid → `422 VALIDATION_ERROR`
    - cross-company: org A serviço 50 ficou com passo 50; org B serviço 30 seguiu com passo 30
    - migration/constraint: `slot_step_min=7` foi rejeitado pela constraint
- Branch/commit relacionado: `PR-BE-SERVICE-SLOT-STEP-01`
- Prevenção de regressão: estender o gate de coerência de ADR-023 (todo slot do availability passa no POST)
  para o passo por serviço; teste multi-serviço/multi-empresa de cadência.
- Status final: CORRIGIDO

### PROP-BUFFER-AFTER-MIN-01 — Intervalo de pausa pós-atendimento (buffer) para impedir agendamentos colados (proposta — exige ratificação)
- Data: 2026-06-26
- PR/Fase: pré-PR (design já ratificado pelo humano em sessão de engenharia; implementação futura `PR-BE-BUFFER-AFTER-MIN-01`)
- Severidade: ALTA
- Erro encontrado: agendamentos podem ser criados consecutivamente (ex.: fim de um às 14:30, início do próximo às 14:31), sem intervalo de buffer para assuntos administrativos, limpeza ou descanso entre atendimentos. O ADR-022 registra o buffer como **decisão estratégica pós-MVP**, mas o humano ratificou incorporá-lo ao MVP quando da emenda de ADR-023 (padrão de grade por serviço).
- Sintoma: latente até a implementação. Operacionalmente, usuário agenda dois serviços de 30 min consecutivos às 14:00 e 14:30, sem pausa de descanso entre eles — experiência ruim para profissional.
- Causa raiz: arquitetura de availability (ADR-023) e agendamento (DATABASE_SCHEMA_V2 §8/§14) não incorpora intervalo pós-atendimento. As constraint de conflito (`no_overlap`) e a validação de grade ignoram buffer.
- Impacto: **usabilidade operacional do MVP.** Sem buffer, profissional fica esgotado em dias cheios. O sistema aceita agendamentos que violam práticas reais de negócio. **Muda canônico:** migration aditiva em `services` (ou `professional_services`), ADR-023, PLANNING §10.2/§16, API_CONTRACTS §15/§16.1 (comportamento de availability), constraint de banco (`no_overlap` → cobertura estendida) e `packages/shared` (DTO de services, behavior de slot picker).
- Arquivo(s) afetado(s): previstos como afetados (sem toque nesta entrada):
  - `apps/api/db/schema/index.ts` (tabela `services`, coluna `buffer_after_min`).
  - Nova migration aditiva forward-only (próximo número após 0009).
  - `apps/api/db/migrations/0003` (constraint `no_overlap` — estratégia de cobertura será ratificada).
  - `apps/api/src/scheduling/availability.service.ts` (gerador de slots).
  - `apps/api/src/scheduling/slot-step.util.ts` (helper de alinhamento de grade — interação com passo por serviço).
  - `apps/api/src/appointments/appointments.service.ts` (validação de criação).
  - `apps/api/src/public-booking/public-booking.service.ts` (validação de booking público).
  - `packages/shared/src/dto/service.dto.ts` (field `buffer_after_min`).
  - `docs/API_CONTRACTS.md §15/§16.1` (especificação de comportamento de availability com buffer).
  - `docs/DATABASE_SCHEMA_V2.md §8.1` (coluna de `services`).
- Correção aplicada: **nenhuma** — as **5 decisões de design foram ratificadas pelo humano (2026-06-26)** e a **PROPOSTA está RATIFICADA pelo humano Allan Carvalho em 2026-06-26** com sign-off formal. Os **3 pontos de detalhamento técnico (5a–5e) abaixo seguem para escrutínio de db-guardian + design-auditor** durante implementação (não são bloqueadores de ratificação). Implementação prevista para `PR-BE-BUFFER-AFTER-MIN-01` (não iniciado).
- Decisões ratificadas (humano, 2026-06-26):
  1. **Granularidade:** coluna `services.buffer_after_min` (não `professional_services.buffer_after_min`). Buffer é **universal do serviço**, sem override por profissional nesta fase. **Divergência deliberada do canônico:** `IMPLEMENTATION_ROADMAP.md §6 (linhas 388–398)`, `ADR-023 § Consequências (linhas ~677-680)` e `POST_MVP_PRODUCT_ROADMAP.md` registravam buffer em `professional_services`; a decisão humana o centraliza em `services` para simplificar o MVP (sem efeito colateral de override), preservando a evolução futura para override granular.
  2. **Enforcement:** enforcement **no banco (obrigatório)**, não advisory/app-level. Quando um appointment é criado, o intervalo persistido para a constraint `no_overlap` (EXCLUDE gist) **INCLUI o buffer** — ex.: atendimento real 14:00–14:30, buffer 15min → intervalo persistido de conflito 14:00–14:45. A constraint barraagendamentos que overlap nesse intervalo. **Detalhe técnico a ratificar pelo db-guardian (5b):** desenho exato — nova coluna `occupied_until` (fim com buffer)? expressão na constraint? como `availability.service.ts` e o banco convergem para semântica única?
  3. **Buffer ultrapassa turno (ADR-022):** se `slotEnd + buffer_after_min` ultrapassa o fim do expediente, o slot **NÃO é oferecido** em availability. Pausa sempre garantida — último atendimento do dia deve terminar com buffer dentro da jornada.
  4. **Campo único:** `services.buffer_after_min` (integer nullable). **NULL ou 0 = buffer desligado** (comportamento atual preservado). **>0 = buffer ativo** (em minutos; múltiplo de 5, range [5, 120] TBD). **SEM campo boolean separado** — NULL/0 é a flag de desligamento.
  5. **Fora de escopo MVP (registrado explícito para impedir antecipação):** `buffer_before_min` e `processing_time` — deferidos ao pós-MVP. Apenas buffer pós-atendimento, não pré/middle.
- Pontos a decidir e a ratificar por db-guardian + design-auditor:
  1. **5a — Persistência do intervalo de conflito:** a constraint `no_overlap` (migration 0003, linhas ~106–115) valida `EXCLUDE gist (organization_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`. Quando `buffer_after_min` é ativo, como o intervalo `[starts_at, ends_at]` incorpora buffer sem corromper `ends_at` (fim real/de exibição)? Opções:
     - Nova coluna `occupied_until` (ou `blocked_until`): persistence do `ends_at + buffer`; a constraint usa `tstzrange(starts_at, occupied_until)` para validação; `ends_at` permanece canônico para cliente.
     - Expressão na constraint: `occupied_until := CASE WHEN buffer_after_min IS NULL THEN ends_at ELSE ends_at + (buffer_after_min || ' min')::interval END`; sem nova coluna, apenas storage de lógica na constraint.
     - Semântica: qual é consultada por `availability.service.ts` para calcular conflitos? a constraint valida criação; o serviço precisa da mesma lógica para não oferecer slots colados.
     - Desafio: `appointments` já tem migrations anteriores (`0007_pg_trgm`, `0008_service_snapshot`, `0009_professional_service_slot_step`); nova coluna buffer pode ser aditiva (migration **`0010`**). **Decisão arquitetural central** que impacta DB schema, availability picker, appointments service, teste de coerência POST↔availability. Deixar explícito o desenho antes de build.
  2. **5b — Composição com slot_step_min:** dois campos independentes em tabelas diferentes (`services.buffer_after_min` e `professional_services.slot_step_min`, implementado em PROP-SLOT-STEP-PER-SERVICE-01 commit 6fb34a7) atuam no mesmo fluxo de cálculo (`availability.service.ts` + `slot-step.util.ts`). Sequência final:
     - (A) passo de grade via `resolveEffectiveSlotStepMin()` (já existe).
     - (B) geração de slots com esse passo.
     - (C) filtragem de conflitos via `no_overlap` (vai incluir buffer).
     - (D) filtragem de "buffer ultrapassa turno".
     - A ordem de (C) e (D) será definida aqui; a composição de lógica fica explícita no `availability.service.ts` e validada no smoke.
  3. **5c — Constraint 0003 e coberência de migration forward-only:** a migration 0003 é de 2026-05-XX (anterior a buffer) e define `no_overlap` com EXCLUDE. Buffer é aditivo (nova coluna ou expressão gerada). Migration nova (ex.: 0010) será **forward-only** (sem down), adicionando coluna e **atualizando** a constraint. Ou a expressão é embutida (sem nova coluna, apenas constraint redefinida)? Decisão de DDL e schema safety.
  4. **5d — DTO e contrato:** `ServiceDTO`/`ServiceCreateInput` devem expor `buffer_after_min`. Será field obrigatório (sempre retornado na vitrine/settings) ou opcional (nullable no DTO)?
  5. **5e — Smoke e prova de coerência POST↔availability:** testes a definir: criar 2 agendamentos colados com buffer>0 → segundo rejeitado com `409 APPOINTMENT_CONFLICT` (enforcement banco); availability não oferece slot cujo `slotEnd+buffer` ultrapasse turno; `buffer_after_min` NULL/0 preserva comportamento atual (nenhuma pausa).
- Teste/validação executado: **NÃO EXECUTADO** (proposta apenas). Decisões de design validadas em sessão humana; implementação futura rodará os smokes/prova acima.
- Branch/commit relacionado: não se aplica (proposta).
- Prevenção de regressão: após 5a-5e serem ratificados, smoke adiciona testes para: (1) buffer bloqueia agendamentos colados; (2) último slot do dia com buffer < cobertura; (3) NULL/0 preserva atual; (4) interação com slot_step_min comprovada.
- Status final: **RATIFICADA** (Allan Carvalho, 2026-06-26) — as **5 decisões de design são ratificadas**. Os **3 pontos de detalhamento técnico (5a-5e)** seguem para escrutínio de db-guardian + design-auditor **durante implementação** (não bloqueiam a ratificação). Implementação prevista para `PR-BE-BUFFER-AFTER-MIN-01` (não iniciado).
- Dependências satisfeitas: RLS runtime (BUG-012/PEND-001) **CORRIGIDO**; PROP-E1 (snapshot) **RATIFICADA**; note D10 (CI provisoriamente deferida) — a CI passada final será executada pelo humano após build completo. Nenhuma bloqueio funcional para iniciar a implementação, apenas decisão de risco técnico (5a-5e) que impacta banco/schema.

### INV-WEB-001 — Slug público inexistente retorna 500
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: ALTA
- Erro encontrado: `GET /api/v1/public/:orgSlug` e `GET /api/v1/public/:orgSlug/professionals` retornam
  `500 INTERNAL_ERROR` para slug inexistente.
- Sintoma: ao consultar slug público inexistente, a API responde erro interno em vez de erro controlado.
- Causa raiz: mesmo root do BUG-014. O `PublicBookingController` estava sendo instanciado com
  `PublicBookingService` indefinido por DI implícita não resolvida em runtime; além disso,
  `bookAppointment` tratava `resolveOrgBySlug(...)!` com non-null assertion, arriscando novo `500`
  no `POST` público para slug inexistente.
- Impacto: impacta WEB-7A. A vitrine pública precisa tratar slug inexistente como `404 NOT_FOUND`, não como
  falha genérica de servidor.
- Arquivo(s) afetado(s): `apps/api/src/public-booking/public-booking.controller.ts`,
  `apps/api/src/public-booking/public-booking.service.ts`,
  `apps/api/scripts/smoke-public-booking-runtime.mjs`.
- Correção aplicada: DI explícita no `PublicBookingController` e tratamento explícito de slug inexistente
  em `PublicBookingService.bookAppointment` com `NotFoundException`.
- Teste/validação executado:
  `POSTGRES_DB=nexos_pr_fix_public_locking_20260624 APP_RUNTIME_USER=app_runtime
  APP_RUNTIME_PASSWORD=*** node apps/api/scripts/smoke-public-booking-runtime.mjs` confirmou
  `GET /api/v1/public/org-inexistente-xyz` → `404 NOT_FOUND` com envelope e `error.requestId`.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste negativo futuro para slug inexistente em `GET /api/v1/public/:orgSlug` e
  `GET /api/v1/public/:orgSlug/professionals`, esperando `404 NOT_FOUND`.
- Status final: VALIDADO

### INV-WEB-002 — Cancelamento público com token inválido retorna 500
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: ALTA
- Erro encontrado: `POST /api/v1/public/cancel/preview` e `POST /api/v1/public/cancel` retornam
  `500 INTERNAL_ERROR` para token inválido.
- Sintoma: ao enviar token inválido, a API responde erro interno em vez de `410 Gone` com código de
  cancelamento inválido/expirado.
- Causa raiz: mesmo root do BUG-014. O `PublicBookingController` estava sendo instanciado com
  `PublicBookingService` indefinido por DI implícita não resolvida em runtime, então `previewCancel` e
  `cancelByToken` quebravam antes de alcançar a tradução contratual para `410`.
- Impacto: impacta WEB-7C. A superfície pública de cancelamento deve ocultar estado interno e responder
  `410 Gone` para token inválido/expirado/já usado, conforme contrato.
- Arquivo(s) afetado(s): `apps/api/src/public-booking/public-booking.controller.ts`,
  `apps/api/scripts/smoke-public-booking-runtime.mjs`.
- Correção aplicada: DI explícita no `PublicBookingController`; adicionalmente, `preview` e `cancel`
  públicos foram fixados em `200` no caminho feliz com `@HttpCode(HttpStatus.OK)`, preservando `410` nos
  caminhos inválidos do contrato.
- Teste/validação executado:
  `POSTGRES_DB=nexos_pr_fix_public_locking_20260624 APP_RUNTIME_USER=app_runtime
  APP_RUNTIME_PASSWORD=*** node apps/api/scripts/smoke-public-booking-runtime.mjs` confirmou:
  `POST /api/v1/public/cancel/preview` com token inválido → `410 CANCEL_TOKEN_INVALID`;
  `POST /api/v1/public/cancel` com token inválido → `410 CANCEL_TOKEN_INVALID`;
  `POST /api/v1/public/cancel/preview` com token válido → `200`;
  `POST /api/v1/public/cancel` com token válido → sucesso, sem `500`.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste negativo futuro para `POST /api/v1/public/cancel/preview` e
  `POST /api/v1/public/cancel` com token inválido, esperando `410 Gone`.
- Status final: VALIDADO

### INV-WEB-003 — Divergência de nomenclatura entre DTOs shared e contrato/roadmap
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: BAIXA
- Erro encontrado: há divergência de nomenclatura entre DTOs existentes em `packages/shared` e nomes citados
  no contrato/roadmap.
- Sintoma: rastreabilidade fica mais difícil para executor web ao cruzar contrato, roadmap e exports reais.
- Causa raiz: deriva documental/nomenclatural entre artefatos.
- Impacto: baixo; não bloqueia execução por si só, mas deve ser rastreado para evitar workaround local de
  contrato nos PRs WEB.
- Arquivo(s) afetado(s): nenhum neste PR documental. Correção futura, se necessária, deve respeitar a
  hierarquia documental.
- Correção aplicada: nenhuma. Registrado como rastreabilidade; não bloquear execução.
- Teste/validação executado: PR-DIAG-WEB inventariou a divergência. Correção **NÃO EXECUTADA**.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: em cada PR-WEB, se o tipo não existir no shared, parar e registrar divergência
  antes de workaround.
- Status final: ACEITO_COMO_PENDÊNCIA

### INV-WEB-004 — `PasswordChangeInput` citado no contrato não exportado no shared
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: BAIXA
- Erro encontrado: `PasswordChangeInput` é mencionado no contrato, mas não está exportado no
  `packages/shared`.
- Sintoma: consumidor web que seguir `API_CONTRACTS §21` não encontra o schema/tipo exportado.
- Causa raiz: lacuna de export no shared ou divergência de materialização do contrato.
- Impacto: baixo para a fase pública imediata, mas deve ser corrigido em PR posterior antes de tela/fluxo que
  consuma troca de senha.
- Arquivo(s) afetado(s): nenhum neste PR documental. Correção futura deve ocorrer fora deste PR.
- Correção aplicada: nenhuma. Este PR apenas registra o achado.
- Teste/validação executado: PR-DIAG-WEB inventariou a ausência de export. Correção **NÃO EXECUTADA**.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: validação futura de exports do shared contra `API_CONTRACTS §21`.
- Status final: ABERTO

### INV-WEB-005 — Claims do access token não exportadas como schema no shared
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: BAIXA
- Erro encontrado: claims do access token (`sub`, `org?`, `sid`) não são exportadas como schema no
  `packages/shared`.
- Sintoma: `API_CONTRACTS §21` cita os claims, mas não há schema compartilhado dedicado para o frontend.
- Causa raiz: decisão arquitetural de sessão centrada em `/auth/me`, não em decodificação de JWT pelo front.
- Impacto: baixo e intencional para a web. O frontend não deve decodificar token; a fonte única do estado de
  sessão é `/auth/me`.
- Arquivo(s) afetado(s): nenhum.
- Correção aplicada: **não corrigir por padrão**. Registrar como decisão intencional: claims não exportadas
  como schema no shared não são bloqueio enquanto a web seguir `/auth/me` como fonte única.
- Teste/validação executado: não se aplica; decisão de governança registrada.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: revisões web devem rejeitar lógica que decodifique access token no cliente para
  sintetizar sessão.
- Status final: ACEITO_COMO_PENDÊNCIA

### INV-WEB-006 — Web pública já existe parcialmente; premissa greenfield estava incorreta
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: ALTA
- Erro encontrado: o roadmap/conductor afirmavam que a web era apenas shell autenticado, mas o repo já contém
  páginas e componentes públicos: vitrine, booking flow, slot picker, confirmation screen e cancel form.
- Sintoma: a trilha ativa tratava WEB-7A/7B/7C como criação greenfield, quando o inventário mostra fluxos
  públicos parciais já presentes.
- Causa raiz: premissa de condução desatualizada após implementação parcial da web pública.
- Impacto: altera a condução da fase pública. WEB-7A/7B/7C devem ser tratados como auditar + reconciliar +
  completar + corrigir bugs públicos, e dependem das correções INV-WEB-001/002 antes da fase pública.
- Arquivo(s) afetado(s): `docs/WEB_IMPLEMENTATION_ROADMAP.md`, `.opencode/agents/conductor.md` e, como
  espelho ativo, `.claude/agents/conductor.md`.
- Correção aplicada: neste PR documental, a trilha de condução foi atualizada para refletir que a web pública
  não é greenfield.
- Teste/validação executado: validação documental por `rg`; nenhum build/teste funcional executado.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: novos handoffs WEB-7A/7B/7C devem partir de inventário/reconciliação, não de
  criação do zero.
- Status final: ABERTO

### INV-WEB2-002 — `details[]` existe na API, mas o binding visual do campo no formulário real segue sem prova runtime
- Data: 2026-06-25
- PR/Fase: PR-FIX-MVP-CONTRACT-AVAILABILITY-AND-TESTS-01
- Severidade: MÉDIA
- Erro encontrado: havia evidência de que a API já devolve `details[]`, mas faltava prova runtime de que
  o formulário real aplica o erro no campo correto em DOM/browser/componente observável.
- Sintoma: o código web já usa `applyFormFieldErrors(...)` em formulários reais, porém o repositório não
  oferece harness configurado de browser/DOM/teste de componente para observar o binding do erro no
  campo durante este PR.
- Causa raiz: lacuna de harness de prova, não ausência confirmada do handler.
- Impacto: a API está pronta para emitir `details[]`, mas o binding visual do campo ainda não pode ser
  marcado como validado por evidência runtime.
- Arquivo(s) afetado(s): nenhum arquivo funcional alterado para este item; auditoria em
  `apps/web/lib/error-handler.ts`, `apps/web/components/services/service-form.tsx` e formulários
  correlatos.
- Correção aplicada: nenhuma. Item mantido fora de alteração funcional por falta de prova de DOM/browser.
- Teste/validação executado: **NÃO EXECUTADO**. O PR confirmou apenas por inspeção de código que a API
  emite `details[]` e que o frontend possui um mapper para `react-hook-form`, mas isso não substitui
  prova runtime de campo.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: adicionar harness real de DOM/browser/componente para observar `setError(...)`
  no formulário alvo antes de marcar este item como validado.
- Status final: ACEITO_COMO_PENDÊNCIA

### DIV-PR-4.3 — Design-spec primária ausente (divergência documental)
- Data: a confirmar na fonte
- PR/Fase: PR-4.3 / Fase 4
- Severidade: BAIXA
- Erro encontrado: a especificação de design primária `nexos-booking-design-spec.md` não está no repo; a
  UI foi/é construída contra o complemento secundário `FRONTEND_DESIGN_REF.md`.
- Sintoma: divergência entre documento esperado e documento disponível na execução do frontend.
- Causa raiz: ausência do artefato primário de design no repositório.
- Impacto: risco de drift visual/UX se a spec primária aparecer depois divergindo do `FRONTEND_DESIGN_REF`.
  **Observação correlata:** o agente `frontend-builder.md` instrui o inverso (trata a spec primária como
  presente e o `FRONTEND_DESIGN_REF` como complemento opcional) — o fallback do agente não cobre o caso
  real (primária ausente). Reconciliar o `frontend-builder.md` a esta divergência.
- Arquivo(s) afetado(s): camada `apps/web` (referência de design); `frontend-builder.md` (instrução de fonte).
- Correção aplicada: nenhuma — registrado como divergência. **Documento que prevalece enquanto a primária
  não existir:** `FRONTEND_DESIGN_REF.md` (decisão explícita do roadmap §5/§12).
- Teste/validação executado: não se aplica.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: ao surgir a spec primária, reconciliar contra o que foi construído e registrar
  o delta.
- Status final: ACEITO_COMO_PENDÊNCIA (UI segue `FRONTEND_DESIGN_REF.md` até a primária aparecer)

### INV-RLS-001 — GRANT genérico de setup regrediu hardening append-only de audit_logs
- Data: 2026-06-23
- PR/Fase: PR-FIX-RLS-RUNTIME-ROLE-01 (preparação de ambiente) · detectado no PR-REVERIFY-RLS-RUNTIME-01
- Severidade: ALTA
- Erro encontrado: durante a preparação de ambiente do PR-FIX-RLS-RUNTIME-ROLE-01, o comando
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime` concedeu
  `UPDATE`/`DELETE` em `audit_logs` para `app_runtime`, regredindo o hardening append-only da
  migration 0006 (`DATABASE_SCHEMA_V2 §10.9`).
- Sintoma: o PR-REVERIFY-RLS-RUNTIME-01 (2ª tentativa) detectou grants de `UPDATE`/`DELETE` em
  `audit_logs` durante a Prova 4b, contaminando o re-VERIFY.
- Causa raiz: o `GRANT ... ON ALL TABLES` genérico não foi seguido pelo `REVOKE UPDATE, DELETE ON
  audit_logs FROM app_runtime` específico do hardening. A migration 0006 aplica a ordem correta
  (GRANTs → REVOKE), mas um re-GRANT manual posterior desfaz o REVOKE.
- Impacto: `audit_logs` perdeu temporariamente a propriedade append-only. Sem evidência de impacto
  em produção neste diagnóstico. Em produção, o risco é mitigado somente se o provisionamento/IaC
  aplicar a ordem correta: GRANT genérico seguido do REVOKE específico de audit_logs.
- Arquivo(s) afetado(s): nenhum arquivo versionado. Ação de ambiente (psql manual durante setup).
- Correção aplicada: `REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime` reaplicado manualmente.
  O PR-DIAG-RLS-GRANTS-APP-RUNTIME-01 confirmou em 2026-06-23 que os grants atuais estão corretos:
  `audit_logs` possui apenas `INSERT`/`SELECT` para `app_runtime`.
- Teste/validação executado: `PR-DIAG-RLS-GRANTS-APP-RUNTIME-01` auditou `information_schema.role_table_grants`
  e confirmou 0 grants de `UPDATE`/`DELETE` em `audit_logs` para `app_runtime`. Default privileges
  para novas tabelas: `app_runtime=arwd` (append/read/write/delete).
- Prevenção de regressão: scripts de provisionamento/IaC devem aplicar o `REVOKE UPDATE, DELETE ON
  audit_logs FROM app_runtime` após qualquer `GRANT ... ON ALL TABLES` genérico, reproduzindo a
  ordem da migration 0006. Idealmente, o setup local deve executar a migration 0006 completa em vez
  de grants manuais.
- Status final: CORRIGIDO

### BUG-AUTH-REGISTER-RLS-01 — `POST /auth/register` viola RLS de `organizations` no bootstrap de tenant
- Data: 2026-06-25
- PR/Fase: PR-BE-FIX-AUTH-REGISTER-RLS-01 (revelado pelo PR-1 `e974d52`) / Fase auth-bootstrap
- Severidade: BLOQUEANTE
- Erro encontrado: `POST /api/v1/auth/register` retornava `500 INTERNAL_ERROR` sob a role segura
  `app_runtime` (`rolsuper=false`, `rolbypassrls=false`).
- Sintoma: erro de runtime `new row violates row-level security policy for table "organizations"`;
  onboarding inicial (criação de conta/organização) bloqueado.
- Causa raiz: a policy `tenant_or_member` de `organizations` é `FOR ALL` sem `WITH CHECK` explícito —
  a expressão `USING (id = current_setting('app.current_organization_id') OR app_is_member(id))`
  vira o `WITH CHECK` do INSERT. No register a organização **nasce sem membership** (logo
  `app_is_member(id)` = false) e a transação **não setava** `app.current_organization_id`, então o
  ramo `id = current_org_id` também falhava → INSERT negado. **Não foi introduzido pelo PR-1:** o
  fluxo nunca teve contexto canônico no bootstrap; antes a API rodava com role `BYPASSRLS`
  (`POSTGRES_USER`) que mascarava a falha. O PR-1 apenas tornou a RLS efetiva e **revelou** o bug.
- Impacto: bootstrap de tenant impossível sob runtime seguro; MVP travado em onboarding real.
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.repository.ts`,
  `apps/api/src/db/tenant-context.ts`, `apps/api/src/db/index.ts`,
  `apps/api/src/auth/auth.controller.ts` (hook de teste env-gated),
  `apps/api/scripts/smoke-auth-register-runtime.mjs` (novo),
  `apps/api/package.json` (entrada de script smoke). Reusa, sem alterar,
  `apps/api/src/organizations/slug-generator.ts` (já versionado no PR-1.6).
- Correção aplicada: o `organizationId` é gerado no app (UUID) e, **dentro da mesma transação** do
  register, `applyTenantContext(tx, organizationId, user.id)` seta os GUCs canônicos
  (`app.current_organization_id`/`app.current_user_id`) **antes** do INSERT da org. O `WITH CHECK
  id = current_org_id` passa naturalmente; o vínculo `organization_users` OWNER nasce no mesmo `tx`
  (`organization_id = current_org_id`). Colisão de slug tratada por SAVEPOINT + retry de `23505`,
  com `SlugTakenException` ao esgotar candidatos. Toda a operação permanece em uma única transação
  → rollback atômico (falha após criar user não deixa user/org/membership/sessão órfãos).
- Padrão de contexto usado: **reuso do GUC canônico de tenant**. `applyTenantContext` é o corpo de
  `withTenantContext` extraído (mesmos `set_config`), **não** um terceiro padrão de GUC. Não usa
  `withSystemContext` (restrito a relay/jobs e a policy de `organizations` nem checa `app.is_system`)
  nem SECURITY DEFINER de escrita (ADR-017 reserva DEFINER a lookups de leitura).
- Aderência ao ADR-017: o bootstrap é uma escrita tenant-scoped cujo tenant é a própria org nascendo;
  consistente com o modelo de ameaça do ADR-017 (RLS protege contra `WHERE` esquecido / cross-tenant,
  não contra app comprometido — o app controla os GUCs). Nenhum bypass de RLS, nenhuma role
  privilegiada, nenhum enfraquecimento de policy.
- Teste/validação executado: `pnpm --filter @nexos/api build` (OK); `test:runtime-role`
  (`current_user=app_runtime`, `rolsuper=false`, `rolbypassrls=false`); banco descartável
  `nexos_auth_register_rls_20260625` via `migrate:fresh`; `smoke:auth-register-runtime` PASS —
  register 201 (user+org+OWNER+refresh), login→`activeOrg`, `/auth/me` `activeOrg`, refresh 200 com
  `X-CSRF: 1` / 403 sem, negativos (payload inválido→422 `VALIDATION_ERROR`, e-mail duplicado→409
  `EMAIL_TAKEN`, colisão de slug→slug distinto sem 500), rollback atômico (falha pós-user → 0 user
  órfão), RLS (sem contexto = 0 linhas, tenant errado = 0 linhas, outsider HTTP 404).
- Branch/commit relacionado: PR-BE-FIX-AUTH-REGISTER-RLS-01 (sem commit no momento do registro).
- Prevenção de regressão: `smoke-auth-register-runtime.mjs` cobre o caminho ponta-a-ponta sob
  `app_runtime`, incluindo isolamento cross-tenant e rollback atômico.
- Status final: CORRIGIDO

### BUG-019 — `GET /appointments` (lista) retorna items sem os 4 campos de snapshot do serviço
- Data: 2026-06-25
- PR/Fase: PR-BE-FIX-APPOINTMENTS-LIST-SNAPSHOT-01
- Severidade: ALTA
- Erro encontrado: o endpoint `GET /api/v1/appointments` retornava listagem de agendamentos sem preencher os 4 campos de snapshot do serviço (`serviceNameSnapshot`, `serviceDurationMinSnapshot`, `servicePriceCentsSnapshot`, `serviceCurrencySnapshot`), apesar de serem obrigatórios no DTO (`packages/shared/src/dto/appointment-list.dto.ts:14-17`).
- Sintoma: a Web caía no fallback "Snapshot do serviço indisponível" (`apps/web/components/schedule/appointment-list.tsx:L~42`), impedindo a agenda operacional de renderizar serviço/duração/preço de forma confiável. Mensagens de erro ou tela branca, conforme o fallback. O caminho single (`GET /api/v1/appointments/:id`) e a criação (`POST /api/v1/appointments`) já retornavam os snapshots corretamente, deixando o bug isolado à listagem.
- Causa raiz: **dois pontos no backend:** (1) `apps/api/src/appointments/appointments.repository.ts` — o método `findAppointments` (~linhas 313-332) usava `.select({...})` que **não incluía nenhuma das 4 colunas** `service_*_snapshot`; (2) `apps/api/src/appointments/appointments.service.ts` — o método `mapAppointmentListItem` (~linhas 144-180) **não declarava os 4 campos camelCase no tipo** retornado, nem os emitia do resultado do repository. Resultado: lista vazia para snapshots. O `mapAppointment` (single) e `mapAppointmentFromCreate` (POST) já estavam corretos, revelando negligência isolada ao refatorar findAppointments.
- Impacto: bloqueava a operação da agenda Web (WEB-5B) — marcos de renderização de serviço/preço/duração perdidos; fallback de "indisponível" afetava confiabilidade e UX. O snapshot é crítico por ser imutável (PROP-E1, ratificada): alterações futuros de preço/nome não devem retroceder o histórico de agendamentos.
- Arquivo(s) afetado(s): `apps/api/src/appointments/appointments.repository.ts` (select das 4 colunas), `apps/api/src/appointments/appointments.service.ts` (mapper dos 4 campos), `docs/BUGFIX_LOG.md` (esta entrada).
- Correção aplicada: (1) adicionadas as 4 colunas `service_name_snapshot`, `service_duration_min_snapshot`, `service_price_cents_snapshot`, `service_currency_snapshot` ao `.select({...})` de `findAppointments`; (2) adicionados os 4 campos camelCase no tipo de retorno e na declaração de atributos de `mapAppointmentListItem`. Nenhuma mudança de schema, migration, RLS, policy, DTO ou contrato — as colunas já existiam (PROP-E1/migration 0008); o DTO já declarava obrigatoriedade (§14-17 já estava correto no shared). Apenas foram ligados os pontos do repository + service.
- Teste/validação executado:
  * `pnpm --filter @nexos/api build` → PASS (tsc exit 0).
  * `pnpm --filter @nexos/api test:runtime-role` → PASS (`current_user=app_runtime`, `rolsuper=false`, `rolbypassrls=false`).
  * Smoke focado na listagem (banco descartável `nexos_appointments_list_snapshot_20260625`, migrado 0001→0008):
    - `GET /api/v1/appointments` com tenant correto → `200` com 4 snapshots preenchidos para cada item (`serviceNameSnapshot="Servico Original"`, `serviceDurationMinSnapshot=30`, `servicePriceCentsSnapshot=9900`, `serviceCurrencySnapshot="BRL"`).
    - Prova de snapshot **imutável (histórico):** após criar appointment com serviço de preço X, editar o serviço para preço Y+nome diferente, `GET /appointments` continuou retornando o snapshot original. Imutabilidade confirmada.
    - Prova de RLS Marco C: tenant cruzado → `items: []` vazio; sem auth → `401`; tenant correto e autenticado → vê seus appointments com snapshots preenchidos.
  * Ressalva: smoke amplo `test-appointments-list.mjs` falha em `findSlot` (etapa PRÉ-EXISTENTE e **FORA DO ESCOPO** deste PR) — availability agora exige civil date `YYYY-MM-DD` conforme BUG-016, não datetime. Não corrigido aqui (pertence ao escopo de availability, não de snapshot).
- Branch/commit relacionado: não se aplica (PR sem commit no momento do registro).
- Prevenção de regressão: teste automatizado de `GET /appointments` incluindo asserção de presença e imutabilidade dos 4 snapshots; teste de mutação de preço do serviço confirmando que appointments passados preservam snapshot original.
- Status final: CORRIGIDO

### DIV-BE-APPOINTMENTS-LIST-SCHEMA-SNAPSHOT-01 — Schema canônico não lista colunas de snapshot que já existem (doc-lag)
- Data: 2026-06-25
- PR/Fase: PR-BE-FIX-APPOINTMENTS-LIST-SNAPSHOT-01 (documentação)
- Severidade: MÉDIA
- Erro encontrado: **não é contradição de intenção, é documentação defasada.** `docs/DATABASE_SCHEMA_V2.md §8.1` (CREATE TABLE `appointments`) **NÃO lista as 4 colunas de snapshot** (`service_name_snapshot`, `service_duration_min_snapshot`, `service_price_cents_snapshot`, `service_currency_snapshot`), apesar de:
  - Existirem no schema executável (`apps/api/db/schema/index.ts:202-205`).
  - Estarem na migration 0008 (ratificada por PROP-E1).
  - Serem DTO-obrigatórias em appointment/list (`packages/shared/src/dto/appointment-list.dto.ts:14-17`).
- Sintoma: leitor do `DATABASE_SCHEMA_V2.md` §8.1 **não vê as colunas** documentadas, mas o schema executável/migration e o DTO as declaram. Divergência apenas de documentação, não de intenção/schema.
- **Também constatado:** `docs/API_CONTRACTS.md §16` não tem bloco JSON explícito do response de `GET /appointments` (listagem) descrevendo os snapshots. `§16.2` (POST response) e o DTO shared já os declaram, deixando a leitura fragmentada.
- Causa raiz: após PROP-E1 ser ratificada (2026-06-24) e a migration 0008 + DTO serem implementados, a documentação canônica do schema e do contrato **não foram sincronizadas**. É doc-lag, não contradição de decisão.
- Impacto: **NENHUM impacto funcional** — a implementação está correta (BUG-019 prova). Impacto documental: leitor novo do projeto não encontra os 4 campos no §8.1 e pode questionar/reivindicar ou executar com DTO desatualizado. Hierarquia de autoridade resolve: **ADR/decisão ratificada + schema executável + DTO ratificado prevalecem sobre documentação desatualizada.** PROP-E1 foi ratificada, migration 0008 existe, DTO obriga; §8.1 é o documento que deve acompanhar, não o inverso.
- Arquivo(s) afetado(s): **NÃO ALTERADOS NESTE PR.** Apenas registrado para rastreabilidade:
  - `docs/DATABASE_SCHEMA_V2.md §8.1` (candidato a update).
  - `docs/API_CONTRACTS.md §16` (candidato a update).
- Correção aplicada: **NENHUMA NESTE PR.** Esta é uma **PROPOSTA** de sincronização documental, não uma correção aplicada. Os canônicos (schema/contrato) permanecem inalterados conforme disciplina de docs-reporter. Recomendação: atualizar §8.1 para listar as 4 colunas com tipo/default; atualizar §16 response para incluir o bloco JSON dos snapshots (similar ao §16.2 POST).
- Teste/validação executado: **NÃO EXECUTADO**. Inspeção manual de: `apps/api/db/schema/index.ts` confirmando colunas; `apps/api/db/migrations/0008.sql` confirmando criação; `packages/shared/src/dto/appointment-list.dto.ts` confirmando DTO obrigatórios; `docs/DATABASE_SCHEMA_V2.md` confirmando que **não lista as colunas**; `docs/API_CONTRACTS.md §16` confirmando que **não descreve snapshots na listagem**.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: ao próximo update de `DATABASE_SCHEMA_V2.md` ou `API_CONTRACTS.md`, validador deve cruzar contra schema executável/DTO e asserir presença de todos os campos obrigatórios.
- Status final: PROPOSTA / PENDENTE de aprovação do dono documental. **Justificativa de bloqueio:** NÃO BLOQUEOU a correção (BUG-019) porque a hierarquia de autoridade (ADR + decisão ratificada + schema executável > documentação) é clara no `MVP_EXECUTION_PLAN.md`. O fix foi validado contra o que é executável, não contra o que está escrito em §8.1 desatualizado. Aberto como proposta para que a documentação canônica siga a realidade ratificada.

### BUG-020 — `GET /organizations/:id` falha com `404` na tela de Configurações; `PATCH` não persistia `slotIntervalMin`
- Data: 2026-06-25
- PR/Fase: PR-BE-FIX-ORG-SETTINGS-ROUTE-01
- Severidade: ALTA
- Erro encontrado: `GET /api/v1/organizations/:id` retornava `404 NOT_FOUND` mesmo para tenant correto na tela de Configurações da organização. Durante prova de regressão mínima, também ficou evidente que `PATCH /api/v1/organizations/:id` respondia `200`, mas não persistia `slotIntervalMin`.
- Sintoma: Web autenticada conseguia entrar no painel, mas `/settings/organization` não carregava dados básicos da empresa; update de grade/fuso podia aparentar sucesso parcial, com `slotIntervalMin` permanecendo no valor anterior.
- Causa raiz: dois defeitos no backend de `organizations/settings`:
  1. `apps/api/src/organizations/organizations.service.ts`: `getById()` e `update()` abriam `db.client.transaction(...)` sem `withTenantContext`. Com RLS ativa, leituras de `organizations`/`organization_users` rodavam sem GUC tenant efetivo e negavam acesso, virando `404`.
  2. `apps/api/src/organizations/organizations.repository.ts`: `updateOrg()` fazia `.set({ ...data })` com chave camelCase `slotIntervalMin`, mas coluna real é `slot_interval_min`; PATCH retornava `200` sem atualizar esse campo.
- Impacto: bloqueava WEB-1 / organization settings. Usuário membro não conseguia ler dados contratados da org ativa (`id`, `name`, `slug`, `timezone`, `slotIntervalMin`, `currency`) e a edição de `slotIntervalMin` ficava inconsistente.
- Arquivo(s) afetado(s): `apps/api/src/organizations/organizations.service.ts`, `apps/api/src/organizations/organizations.repository.ts`, `apps/api/scripts/smoke-org-settings-route.mjs`, `docs/BUGFIX_LOG.md`.
- Correção aplicada:
  1. `getById()` e `update()` passaram a usar `withTenantContext(this.db, orgId, userId, ...)`, seguindo padrão canônico já usado em módulos tenant-scoped do repo.
  2. `updateOrg()` passou a mapear explicitamente `slotIntervalMin -> slot_interval_min` no `.set(...)`, preservando demais campos contratados.
  3. Adicionado smoke focado `apps/api/scripts/smoke-org-settings-route.mjs` para prova runtime de GET/PATCH + tenant + RLS.
- Teste/validação executado:
  * `pnpm --filter @nexos/api build` → PASS.
  * `pnpm --filter @nexos/api test:runtime-role` → PASS (`current_user=app_runtime`, `rolsuper=false`, `rolbypassrls=false`).
  * `pnpm --filter @nexos/api migrate:fresh -- --database nexos_org_settings_route_20260625` → PASS.
  * `POSTGRES_DB=nexos_org_settings_route_20260625 node apps/api/scripts/smoke-org-settings-route.mjs` → PASS.
    - Tenant correto: `GET /api/v1/organizations/:id` → `200`; shape contratado presente (`id`, `name`, `slug`, `timezone`, `slotIntervalMin`, `currency`).
    - Regressão mínima PATCH: `PATCH /api/v1/organizations/:id` → `200`; retorno pós-update com `name` atualizado, `timezone="America/Sao_Paulo"`, `slotIntervalMin=45`, `currency="BRL"`.
    - Negativos: `timezone` inválido → `422`; `slotIntervalMin=3` → `422`; id inexistente → `404`; tenant cruzado no GET/PATCH → `404`; sem auth → `401`.
    - RLS: consulta SQL sem contexto → `0` linhas; com tenant errado → `0` linhas; com tenant correto → `1` linha.
- Branch/commit relacionado: não se aplica (sem commit no momento do registro).
- Prevenção de regressão: manter smoke focado de settings route cobrindo GET/PATCH, tenant cruzado e consulta SQL sem contexto.
- Status final: CORRIGIDO

---

### BUG-021 — Endpoints CRUD autenticados aceitam body não validado
- Data: 2026-06-29
- PR/Fase: PR-BE-FIX-SECURITY-HARDENING-01 / Hardening pré-VPS
- Severidade: BLOQUEANTE
- Erro encontrado: controllers de escrita recebem `@Body() body: XInput` onde `XInput` é **interface TypeScript** (ex.: `CreateProfessionalInput`, `CreateServiceInput`, `UpdateOrganizationInput`, `UpdateClientInput`, `CreateBlockInput`, `WorkingHoursInput`). Tipos TS são apagados em runtime e não há `ValidationPipe` global + `class-validator`, nem `safeParse` zod nesses handlers. Logo, o body **não é validado**.
- Sintoma: payload arbitrário aceito em endpoints autenticados — `name` de tamanho ilimitado, `durationMin`/`priceCents` negativos ou não-numéricos, campos extras. Sem rejeição `422`.
- Causa raiz: padrão de validação zod (`safeParse` + `ValidationException`) existe em `auth.controller.ts` (register/login) mas **não foi aplicado** aos demais módulos; DTOs de entrada ficaram como interfaces.
- Impacto: integridade de dados e superfície de abuso em todo o tenant autenticado; risco de estouro de colunas e estados inválidos persistidos. Bloqueia exposição segura.
- Arquivo(s) afetado(s): `apps/api/src/professionals/professionals.controller.ts`, `apps/api/src/services/services.controller.ts`, `apps/api/src/organizations/organizations.controller.ts`, `apps/api/src/clients/clients.controller.ts`, `apps/api/src/scheduling/**`, DTOs de entrada correspondentes e schemas em `packages/shared/src/dto/**`.
- Correção aplicada: criados/estendidos schemas zod de entrada em `packages/shared` (`CreateProfessionalSchema`, `UpdateProfessionalSchema`, `CreateServiceSchema`, `UpdateServiceSchema`, `UpdateOrganizationSchema`, `InviteMemberSchema`, `UpdateMemberSchema`) + helper `apps/api/src/common/validation/parse-body.ts`. Controllers (`professionals`, `services`, `organizations`, `clients`) trocaram `@Body() body: XInput` por `@Body() body: unknown` + `parseBody(Schema, body)` → `422 VALIDATION_ERROR` com `details[]`. Blocos e working-hours passaram a validar via `CreateBlockSchema`/`WorkingHoursSchema` do shared.
- Teste/validação executado: `pnpm --filter @nexos/shared build` PASS; `pnpm --filter @nexos/api build` PASS; `node apps/api/scripts/smoke-conformance.mjs` → 36/36 (sem regressão de contrato); `node apps/api/scripts/smoke-security-hardening.mjs` → 13/13 (body lixo/over-limit → `422`).
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch; commit é gate humano).
- Prevenção de regressão: `apps/api/scripts/smoke-security-hardening.mjs`; convenção "controller de escrita = `parseBody` obrigatório".
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-022 — Reset/change/accept-invite não aplicam política de senha
- Data: 2026-06-29
- PR/Fase: PR-BE-FIX-SECURITY-HARDENING-01 / Hardening pré-VPS
- Severidade: BLOQUEANTE
- Erro encontrado: `POST /auth/password/reset`, `/auth/password/change` e `/auth/accept-invite` recebem a nova senha via interfaces TS (`ResetPasswordInput`, `PasswordChangeInput`, `AcceptInviteInput`) sem validação. A regra `password: z.string().min(8)` existe **somente** em `RegisterInputSchema`.
- Sintoma: é possível definir senha de 1 caractere (ou vazia) via fluxo de reset/troca/convite, contornando a política aplicada no cadastro.
- Causa raiz: validação de força de senha não centralizada; ausente nos fluxos de redefinição.
- Impacto: contas com senha trivial em produção; enfraquece autenticação apesar do hash forte (Argon2id).
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/dto/reset-password.dto.ts`, `apps/api/src/auth/dto/password-change.dto.ts`, `apps/api/src/auth/dto/accept-invite.dto.ts`, schemas no shared.
- Correção aplicada: `passwordSchema = z.string().min(8).max(128)` único em `packages/shared/src/dto/auth.dto.ts`, reutilizado por `RegisterInputSchema`, `ResetPasswordSchema`, `PasswordChangeSchema` e `AcceptInviteSchema`. `auth.controller.ts` passou a validar `password/reset`, `password/change`, `accept-invite`, `password/forgot` e `verify-email` via `parseBody(...)`.
- Teste/validação executado: `node apps/api/scripts/smoke-security-hardening.mjs` → `password/reset` senha `< 8` → `422`; `password/change` senha `< 8` → `422`; `password/forgot` email inválido → `422`; `register` senha `< 8` → `422`; baseline válido → `201`.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: schema único de senha compartilhado entre register e reset/change/invite; smoke de hardening.
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-023 — Campos string de entrada sem limite máximo
- Data: 2026-06-29
- PR/Fase: PR-BE-FIX-SECURITY-HARDENING-01 / Hardening pré-VPS
- Severidade: ALTA
- Erro encontrado: strings de entrada validadas só com `min(1)` e sem `max`. Caso crítico: `PublicBookingInputSchema.client.name: z.string().min(1)` e `client.phone: z.string().min(1)` — endpoint **público/anônimo**. Idem nomes de serviço/profissional/organização no caminho autenticado.
- Sintoma: aceita nome/telefone arbitrariamente longos (até o limite de body de 100KB), permitindo estouro de coluna e abuso por tráfego anônimo.
- Causa raiz: schemas focaram presença (`min(1)`) mas não teto; mitigação parcial só pelo `BODY_LIMIT_BYTES=102400`.
- Impacto: integridade de dados e abuso na vitrine pública; um único campo pode carregar ~100KB.
- Arquivo(s) afetado(s): `packages/shared/src/dto/public-booking.dto.ts` e demais DTOs de entrada com string sem `max`.
- Correção aplicada: limites centralizados em `packages/shared/src/limits.ts` (`NAME_MAX=120`, `PHONE_MAX=32`, `SLUG_MAX=64`, `PASSWORD_MIN/MAX`, `SERVICE_DURATION_MAX_MIN`, `PRICE_CENTS_MAX`). `.max()` aplicado a toda string de entrada, incluindo `PublicBookingInputSchema.client.name`/`phone`/`professionalSlug`.
- Teste/validação executado: `node apps/api/scripts/smoke-security-hardening.mjs` → booking público com nome > max → `422`; `POST services`/`professionals`/`PATCH organizations` com nome > max → `422`; `POST /public/cancel*` com token > max / ausente → `422` (ajuste pós-auditoria: rotas anônimas de cancel passaram a validar `token` via `CancelInputSchema`/`CancelPreviewInputSchema` `min(1).max(512)`).
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: regra de revisão "string de entrada exige `max` explícito"; smoke cobre limite na vitrine pública.
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-024 — Rate-limiter apenas em memória
- Data: 2026-06-29
- PR/Fase: PR-BE-FIX-SECURITY-HARDENING-01 / Hardening pré-VPS
- Severidade: MÉDIA
- Erro encontrado: `auth.service.ts` instancia `MemoryRateLimiter`. Contadores de brute-force (login/forgot/reset/register) vivem só em memória do processo.
- Sintoma: reinício do processo zera os limites; com múltiplas instâncias, cada uma conta isolada, reduzindo a proteção efetiva.
- Causa raiz: implementação in-memory adequada a single-node, sem store compartilhado.
- Impacto: brute-force parcialmente mitigado em VPS single-node; vira lacuna real ao escalar ou em restarts frequentes.
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/rate-limit/**`.
- Correção aplicada: **não corrigir neste PR.** Aceito como pendência: aceitável para VPS single-node de MVP. Migrar a store persistente/compartilhada (ex.: Redis) quando houver multi-instância.
- Teste/validação executado: não se aplica (pendência consciente).
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: revisitar ao introduzir segunda instância/auto-scaling.
- Status final: ACEITO_COMO_PENDÊNCIA

### BUG-025 — CORS não configurado explicitamente no bootstrap
- Data: 2026-06-29
- PR/Fase: PR-BE-FIX-SECURITY-HARDENING-01 / Hardening pré-VPS
- Severidade: BAIXA
- Erro encontrado: `apps/api/src/main.ts` não chama `app.enableCors(...)`. Não há allowlist de origem definida.
- Sintoma: se a web for servida em domínio distinto da API, o browser bloqueia as chamadas; se exposta sem critério, falta allowlist explícita.
- Causa raiz: topologia de deploy (same-origin via proxy vs. domínios separados) ainda não fixada.
- Impacto: baixo enquanto same-origin; precisa ser resolvido conforme o provisionamento do VPS.
- Arquivo(s) afetado(s): `apps/api/src/main.ts`.
- Correção aplicada: `apps/api/src/main.ts` ganhou bloco CORS por allowlist via `CORS_ORIGINS` (CSV), `credentials: true`, métodos e headers do contrato (`X-Request-Id`, `Idempotency-Key`, `If-Match`, `X-CSRF`, `Authorization`), `exposedHeaders: [X-Request-Id, ETag]`. Sem `CORS_ORIGINS`, mantém comportamento same-origin.
- Teste/validação executado: `pnpm --filter @nexos/api build` PASS; `smoke-conformance.mjs` 36/36 sem CORS habilitado (default same-origin preservado). **Pendência operacional:** confirmar `CORS_ORIGINS` no provisionamento do VPS conforme topologia.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: documentar `CORS_ORIGINS` no guia de deploy.
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-026 — Resíduo de BUG-023: input de agendamento do painel sem `max`
- Data: 2026-06-29
- PR/Fase: PR-BE-FIX-SECURITY-HARDENING-01 / Hardening pré-VPS (auditoria de fechamento)
- Severidade: BAIXA
- Erro encontrado: BUG-023 declarou `.max()` em "toda string de entrada", mas escapou o caminho autenticado de agendamento do painel: `CreateAppointmentSchema.client.name`/`phone` com `z.string().min(1)` sem `max`, e `note` (em `CreateAppointmentSchema` e `RescheduleSchema`) com `max(2000)` mágico fora de `limits.ts`.
- Sintoma: `POST /appointments` e `PATCH /appointments/:id` aceitam `client.name`/`phone` arbitrariamente longos (até o teto de body de 100KB), divergindo de `PublicBookingInputSchema` que já aplica `NAME_MAX`/`PHONE_MAX`.
- Causa raiz: locus distinto do mesmo defeito de classe do BUG-023 (string de entrada exige `max` explícito); a varredura original cobriu booking público + CRUD de cadastro, mas não o DTO de agendamento.
- Impacto: integridade de dados em rota autenticada (mitigada por `BODY_LIMIT_BYTES=102400` e RLS de tenant; sem exposição anônima). Baixo.
- Arquivo(s) afetado(s): `packages/shared/src/dto/appointment.dto.ts`.
- Correção aplicada: `client.name = z.string().trim().min(1).max(NAME_MAX)`, `phone = z.string().trim().min(1).max(PHONE_MAX)` (alinhado a `PublicBookingInputSchema`); `note` passou a usar `NOTE_MAX` de `limits.ts` em ambos os schemas, eliminando o `2000` mágico.
- Teste/validação executado: `pnpm --filter @nexos/shared build` PASS; `pnpm --filter @nexos/api build` PASS. Pendente: estender `smoke-security-hardening.mjs` com caso `POST /appointments` nome > `NAME_MAX` → `422`.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: mesma regra de revisão do BUG-023 ("string de entrada exige `max` explícito"), agora cobrindo o DTO de agendamento; magic numbers de tamanho centralizados em `limits.ts`.
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-027 — `JWT_SECRET` sem validação de força mínima
- Data: 2026-06-29
- PR/Fase: PR-BE-FIX-SECURITY-HARDENING-01 / Hardening pré-VPS (auditoria de fechamento)
- Severidade: BAIXA
- Erro encontrado: `JwtService.getSecret()` validava apenas presença de `JWT_SECRET` (`if (!raw) throw`), sem piso de comprimento. Sob `HS256` a segurança do token = entropia do segredo; um segredo curto/fraco é aceito e fica brute-forceável offline a partir de qualquer token emitido.
- Sintoma: boot bem-sucedido com segredo fraco; nenhum erro visível em runtime (risco silencioso, análogo ao perfil do BUG-012).
- Causa raiz: hardening de JWT focou em allowlist de algoritmo (`HS256`) e claims (`iss`/`aud`/`exp`), mas não na qualidade do material de chave.
- Impacto: confidencialidade/integridade de toda sessão se o segredo de produção for fraco. Mitigado na prática pelo `.env` real (41 chars); risco é configuração futura/ambiente.
- Arquivo(s) afetado(s): `apps/api/src/auth/jwt/jwt.service.ts`, `.env.example`, `apps/api/.env.example`.
- Correção aplicada: piso `JWT_SECRET_MIN_LENGTH=32`; `getSecret()` agora lança se `raw.length < 32` ("HS256 strength depends on secret entropy"). Placeholders dos `.env.example` passaram a `<JWT_SECRET_MIN_32_CHARS>` para sinalizar o requisito.
- Teste/validação executado: `pnpm --filter @nexos/api build` PASS; `.env` de dev confirmado em 41 chars (boot preservado). Pendente: caso de boot com segredo < 32 → erro, no smoke.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: validação fail-fast no boot impede o retorno; placeholder instrutivo no `.env.example`.
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-028 — Booking público sobrescreve nome de cliente existente (upsert por telefone)
- Data: 2026-06-29
- PR/Fase: PR-BE-PUBLIC-CLIENT-UPSERT-NO-OVERWRITE-01 / Fechamento do fluxo público (auditoria pré-VPS)
- Severidade: MÉDIA
- Erro encontrado: `PublicBookingRepository.upsertClientByPhone` usa `INSERT ... ON CONFLICT (organization_id, phone_normalized) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = now()`. No caminho de booking **público/anônimo**, ao agendar com um telefone já cadastrado na org, o `name` informado pelo visitante **sobrescreve** o nome do cliente existente.
- Sintoma: nome de cliente de balcão muda sem ação do operador. Qualquer visitante que conheça um telefone já registrado naquela empresa cria um agendamento e altera o `clients.name` correspondente.
- Causa raiz: o upsert tratava "reutilizar cliente por telefone" e "atualizar cadastro" como a mesma operação; o `DO UPDATE SET name/phone` aplica dados não confiáveis de rota anônima ao cadastro tenant-scoped.
- Impacto: integridade/qualidade de dado e confiança operacional do cadastro de clientes. **Sem cross-tenant** — `organization_id` no INSERT + RLS `WITH CHECK` + índice único parcial por org confinam tudo à mesma empresa. Não é falha de autorização; é corrupção de dado interno via rota pública.
- Arquivo(s) afetado(s): `apps/api/src/public-booking/public-booking.repository.ts` (`upsertClientByPhone`).
- Correção aplicada: `DO UPDATE` passou a tocar **apenas campo neutro** (`updated_at = now()`), preservando `name`/`phone` existentes. Mantém a reutilização do `client.id` por telefone (RETURNING devolve a linha existente no conflito) e a criação de cliente novo quando o telefone não existe na org. Unicidade parcial (`organization_id, phone_normalized WHERE phone_normalized IS NOT NULL`) intacta.
- Teste/validação executado: `pnpm --filter @nexos/api build` PASS. Pendente (a rodar): mesmo telefone com nome diferente → cliente reutilizado, `name` **inalterado**, agendamento ainda criado; cross-tenant negado; anonimização e índice único parcial intactos.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: regra "rota pública não sobrescreve cadastro tenant-scoped"; comentário âncora no SQL referenciando este BUG; teste de upsert público com nome divergente a ser adicionado ao smoke público.
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-029 — Janela de `availability` sem teto → DoS público (event loop)
- Data: 2026-06-29
- PR/Fase: PR-SECURITY-DB-SANITY-AUDIT-01 / Saneamento pré-online
- Severidade: ALTA
- Erro encontrado: `AvailabilityQuerySchema` validava `from < to` mas **sem span máximo**; o loop `while (dateStr < toCivilDateExclusive)` em `availability.service.ts` monta o array de dias sem limite.
- Sintoma: `GET /api/v1/public/:orgSlug/professionals/:slug/availability?from=2000-01-01&to=2999-12-31` (rota **anônima**) — e a equivalente autenticada — iteram ~365k dias de forma síncrona, travando o event loop do Node (single-thread); o timeout de 30s nem dispara porque o loop é síncrono. Um request derruba a API.
- Causa raiz: validação focou ordenação/presença de `from`/`to`, não a amplitude; rate limit (60/min) não protege request único caríssimo.
- Impacto: **DoS trivial explorável online por visitante não autenticado** — disponibilidade de todo o serviço.
- Arquivo(s) afetado(s): `packages/shared/src/dto/availability.dto.ts`, `packages/shared/src/limits.ts`, `apps/api/src/scheduling/availability.service.ts`.
- Correção aplicada: `AVAILABILITY_MAX_RANGE_DAYS=62` em `limits.ts`; `superRefine` rejeita `from..to` > 62 dias (422); defesa em profundidade no service recusa o range antes do loop (vale também para a rota pública que monta o query e delega). Modo `date` único e janelas normais (semana/mês) intactos.
- Teste/validação executado: `pnpm --filter @nexos/shared build` + `pnpm --filter @nexos/api build` PASS. Smoke do schema: `from=2000-01-01&to=2999-12-31` → `false` ("from..to range exceeds 62 days"); `2026-01-01..2026-02-15` (45d) → `true`.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: teto centralizado em `limits.ts`; regra de revisão "endpoint que itera por dia exige janela máxima"; adicionar caso ao smoke público.
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-030 — Arrays de entrada sem `max` (resíduo de classe do BUG-023)
- Data: 2026-06-29
- PR/Fase: PR-SECURITY-DB-SANITY-AUDIT-01 / Saneamento pré-online
- Severidade: MÉDIA
- Erro encontrado: BUG-023 cobriu strings, mas dois arrays de entrada ficaram sem teto: `WorkingHoursSchema.shifts: z.array(ShiftSchema)` (PUT working-hours) e `ProfessionalServicesInputSchema.serviceIds: z.array(uuid())` (PUT pro/services).
- Sintoma: arrays arbitrariamente grandes (até o limite de body 100KB) disparando escrita/replace em lote sem teto semântico.
- Causa raiz: validação de array focou tipo dos itens, não cardinalidade; mitigação só pelo `BODY_LIMIT_BYTES`.
- Impacto: abuso de payload e escrita em lote (autenticado, escopo org). Risco menor que BUG-029, mas mesma classe de campo sem limite.
- Arquivo(s) afetado(s): `packages/shared/src/dto/working-hours.dto.ts`, `packages/shared/src/dto/professional-services.dto.ts`, `packages/shared/src/limits.ts`.
- Correção aplicada: `WORKING_HOURS_MAX_SHIFTS=50` e `PROFESSIONAL_SERVICES_MAX=200` em `limits.ts`; `.max()` aplicado a ambos os arrays (422 ao exceder).
- Teste/validação executado: builds PASS; smoke do schema: 60 shifts → `false`; 300 serviceIds → `false`.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: regra "array de entrada exige `max` explícito" (irmã da regra de strings do BUG-023).
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-031 — `AuthService` instanciava rate-limiter próprio (2ª instância in-memory)
- Data: 2026-06-29
- PR/Fase: PR-SECURITY-DB-SANITY-AUDIT-01 / Saneamento pré-online
- Severidade: BAIXA
- Erro encontrado: `auth.service.ts` fazia `new MemoryRateLimiter()` no construtor — limiter separado do provider `"RateLimiter"` usado pelo `public-booking`. Mesmo num único processo, auth e booking contavam em mapas distintos, e o `new` hardcoded impedia troca por DI.
- Sintoma: dois contadores in-memory paralelos; ponto único de troca para store compartilhada (Redis) inexistente no caminho do auth.
- Causa raiz: limiter acoplado por `new` em vez de injeção.
- Impacto: baixo (single-node MVP); dificultava a futura migração para store distribuída.
- Arquivo(s) afetado(s): `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.module.ts`.
- Correção aplicada: `AuthModule` passou a prover `{ provide: "RateLimiter", useClass: MemoryRateLimiter }`; `AuthService` injeta `@Inject("RateLimiter")`. Remove o `new` e centraliza a troca futura por módulo. **A natureza in-memory/single-node permanece pendência aceita (BUG-024)** — esta correção trata só a duplicação in-process.
- Teste/validação executado: `pnpm --filter @nexos/api build` PASS (DI resolve).
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: proibir `new MemoryRateLimiter()` fora de provider de módulo.
- Status final: IMPLEMENTADO_NO_BRANCH (parte distribuída segue em BUG-024)

### BUG-032 — HSTS enviado incondicionalmente (inclusive em dev/HTTP)
- Data: 2026-06-29
- PR/Fase: PR-SECURITY-DB-SANITY-AUDIT-01 / Saneamento pré-online
- Severidade: BAIXA
- Erro encontrado: `main.ts` configurava `helmet({ hsts: {...} })` sempre, independente de TLS/ambiente.
- Sintoma: header `Strict-Transport-Security` emitido em dev — pode fixar `localhost` em HTTPS no navegador e atrapalhar o desenvolvimento; em produção é desejável.
- Causa raiz: HSTS não condicionado ao ambiente.
- Impacto: baixo; inofensivo atrás de TLS, ruído/atrito em dev.
- Arquivo(s) afetado(s): `apps/api/src/main.ts`.
- Correção aplicada: `hsts` só quando `NODE_ENV === "production"`; caso contrário `false`.
- Teste/validação executado: `pnpm --filter @nexos/api build` PASS.
- Branch/commit relacionado: `fix/appointments-list-snapshot` (implementado no branch).
- Prevenção de regressão: revisão "headers dependentes de TLS condicionados a produção".
- Status final: IMPLEMENTADO_NO_BRANCH

### BUG-033 — Tabelas globais sem RLS (`users`, `refresh_sessions`, `verification_tokens`)
- Data: 2026-06-29
- PR/Fase: PR-SECURITY-DB-SANITY-AUDIT-01 / Saneamento pré-online
- Severidade: BAIXA
- Erro encontrado: as três tabelas globais não têm RLS; `app_runtime` tem CRUD completo. O escopo por `user_id` é garantido só em nível de aplicação.
- Sintoma: nenhum em runtime — comportamento por design (tabelas globais, usuário é multi-org).
- Causa raiz: modelo de dados intencionalmente global para identidade/sessão.
- Impacto: aceitável; um bug de query no caminho de auth poderia tocar dados de outro usuário, sem backstop de RLS.
- Arquivo(s) afetado(s): `apps/api/db/schema/index.ts`, `apps/api/db/migrations/0006_functions_and_rls.sql` (referência).
- Correção aplicada: **não corrigir** — aceito como pendência consciente. Reforço defensivo recomendado: testes de escopo por `user_id` no caminho de sessão/refresh; reavaliar RLS por usuário se o modelo evoluir.
- Teste/validação executado: provado via catálogo (`pg_class.relrowsecurity=f` nas três); não se aplica correção.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: suíte de escopo de sessão; checklist de RLS ao adicionar coluna sensível a tabela global.
- Status final: ACEITO_COMO_PENDÊNCIA

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
