# PROGRESSO — Estado Atual Do Sistema

> Atualizado em 2026-07-07. Este arquivo consolida o que já está implementado, o que está implementado
> com ressalvas e o que ainda falta fazer, cruzando os documentos em `docs/` com a estrutura real do
> repositório.
>
> Regra de leitura: quando houver conflito, este arquivo segue a hierarquia do
> `MVP_EXECUTION_PLAN.md`: ADR → schema → contrato HTTP → planejamento → roadmap → pós-MVP.

## Resumo Executivo

O backend do MVP está amplamente implementado: há módulos NestJS para auth, organizations, professionals,
services, scheduling, appointments, public booking, realtime, dashboard, clients e maintenance; há migrations
até `0010_service_buffer_after.sql`; e os contratos compartilhados existem em `packages/shared`.

O sistema, porém, ainda não deve ser tratado como MVP fechado sem ressalvas. Os próprios documentos deixam
três travas: `MVP_TEST_REPORT.md` ainda está vazio, vários relatórios de PR seguem como
`PASS_PROVISÓRIO_CI_PENDENTE`, e o `WEB_IMPLEMENTATION_ROADMAP.md` registra que a camada web precisava
ser tornada navegável e exercitável ponta-a-ponta antes do deploy controlado.

## Legenda De Status

- **Concluído:** implementado no código e registrado nos documentos como entregue.
- **Concluído com ressalvas:** existe implementação, mas falta prova final, CI/E2E, validação runtime,
  fechamento documental ou há pendência aceita.
- **Pendente:** documentado como necessário, mas não fechado no código/docs ou ainda sem prova suficiente.
- **Futuro pós-MVP:** propositalmente fora do MVP, só inicia após MVP validado.

## Concluído

### Fundação Do Monorepo

- **Status:** Concluído.
- **Entregue:** pnpm workspaces, Turborepo, `apps/api`, `apps/web`, `packages/shared`, `packages/config`,
  ESLint/Prettier/TypeScript compartilhados e Docker Compose.
- **Evidência documental:** `docs/pr/PR-0.1_REPORT.md`, `docs/pr/PR-0.2_REPORT.md`,
  `docs/pr/PR-0.3_REPORT.md`.
- **Evidência no sistema:** `package.json`, `apps/api/package.json`, `apps/web/package.json`,
  `packages/shared`, `packages/config`, `docker-compose.yml`.

### Schema, Migrations E RLS

- **Status:** Concluído com ressalvas de prova final.
- **Entregue:** migrations `0001` a `0010`, RLS com `FORCE`, resolvers `SECURITY DEFINER`, contexto tenant e
  contexto de sistema, constraints avançadas, FKs tenant-safe, snapshots de serviço, `slot_step_min` por
  vínculo profissional-serviço e `buffer_after_min` em serviços.
- **Evidência documental:** `DATABASE_SCHEMA_V2.md`, `ARCHITECTURE_DECISIONS.md`,
  `docs/pr/PR-1.1_REPORT.md`, `docs/pr/PR-1.2_REPORT.md`, `BUGFIX_LOG.md` (`BUG-012`,
  `INV-RLS-001`).
- **Evidência no sistema:** `apps/api/db/migrations/*.sql`, `apps/api/src/db/*`,
  `apps/api/db/schema/index.ts`.
- **Ressalva:** o `WEB_IMPLEMENTATION_ROADMAP.md` ainda cita `PR-VERIFY-RLS-RUNTIME-01` como prova objetiva
  obrigatória para a trilha web, enquanto o `BUGFIX_LOG.md` registra correção e evidências. Precisa fechar
  documentalmente essa divergência.

### Auth, Sessões, Organizações E Convites

- **Status:** Concluído com ressalvas.
- **Entregue:** register, login, refresh, logout, `/auth/me`, `switch-org`, verificação de e-mail, reenvio,
  forgot/reset/change password, convites, aceite de convite, roles e guards.
- **Evidência documental:** `docs/pr/PR-1.4_REPORT.md`, `docs/pr/PR-1.5_REPORT.md`,
  `docs/pr/PR-1.6_REPORT.md`, `API_CONTRACTS.md`.
- **Evidência no sistema:** `apps/api/src/auth`, `apps/api/src/authorization`,
  `apps/api/src/organizations`.
- **Fechamento 2026-07-13:** `INV-WEB-004` validado; `PasswordChangeInput` e
  `PasswordChangeSchema` exportados e contrato compilado.

### Cadastro Operacional

- **Status:** Concluído.
- **Entregue:** CRUD de profissionais, CRUD de serviços, vínculo `professional_services`, jornada de
  trabalho, pausas e bloqueios.
- **Evidência documental:** `docs/pr/PR-2.1_REPORT.md` a `docs/pr/PR-2.4_REPORT.md`,
  `WEB_IMPLEMENTATION_ROADMAP.md` (`WEB-2`, `WEB-3`, `WEB-4`).
- **Evidência no sistema:** `apps/api/src/professionals`, `apps/api/src/services`,
  `apps/api/src/scheduling`, `apps/web/app/(authenticated)/professionals`,
  `apps/web/app/(authenticated)/services`, `apps/web/app/(authenticated)/horarios`,
  `apps/web/components/professionals`, `apps/web/components/services`.

### Agenda E Anti-Conflito

- **Status:** Concluído com ressalvas.
- **Entregue:** disponibilidade, idempotência, criação de agendamento, remarcação, cancelamento, complete,
  no-show, máquina de estados, optimistic locking com `If-Match`, eventos e anti-conflito no banco.
- **Evidência documental:** `docs/pr/PR-3.1_REPORT.md`, `docs/pr/PR-3.2_REPORT.md`,
  `docs/pr/PR-3.3_REPORT.md`, `IMPLEMENTATION_ROADMAP.md`.
- **Evidência no sistema:** `apps/api/src/appointments`, `apps/api/src/scheduling`,
  `packages/shared/src/dto/appointment*.ts`, `apps/web/app/(authenticated)/schedule`.
- **Fechamento 2026-07-13:** `WEB-5C` validado com painel de detalhe, remarcação, cancelamento,
  complete/no-show e Playwright cobrindo concorrência, versão e idempotência.

### Página Pública E Booking Sem Login

- **Status:** Concluído com ressalvas.
- **Entregue:** vitrine pública, profissionais públicos, availability pública, booking público com
  consentimento, `cancelUrl`, preview/cancelamento por token e tratamento de token inválido/terminal.
- **Evidência documental:** `docs/pr/PR-4.1_REPORT.md`, `docs/pr/PR-4.2_REPORT.md`,
  `docs/pr/PR-4.3_REPORT.md`, `BUGFIX_LOG.md` (`INV-WEB-001`, `INV-WEB-002` validados).
- **Evidência no sistema:** `apps/api/src/public-booking`,
  `apps/web/app/(public)/[orgSlug]`, `apps/web/app/(public)/cancelar`, `apps/web/components/public`.
- **Fechamento 2026-07-13:** `INV-WEB-006` validado; roadmap e conductors tratam web pública como
  auditoria/reconciliação, e Playwright cobre navegação operacional real.

### Real-Time E Outbox

- **Status:** Concluído com ressalvas.
- **Entregue:** publisher de domínio, relay, WebSocket gateway, kick/revalidação por sessão e payload de
  invalidação sem PII.
- **Evidência documental:** `docs/pr/PR-5.1_REPORT.md`, `docs/pr/PR-5.2_REPORT.md`,
  `ARCHITECTURE_DECISIONS.md` (ADR-005, ADR-014, ADR-020).
- **Evidência no sistema:** `apps/api/src/realtime`.
- **Fechamento 2026-07-13:** cliente web, adapter Redis, kick cross-node e duas telas sem refresh foram
  provados. Reconnect/org-switch, isolamento cross-tenant e recovery do outbox ainda bloqueiam validação final.

### Clientes E LGPD

- **Status:** Concluído com ressalvas.
- **Entregue:** busca/listagem de clientes, detalhe, edição e anonimização; scrub de `appointments.note`;
  índice `pg_trgm`; proteção contra colisão de telefone.
- **Evidência documental:** `docs/pr/PR-6.3_REPORT.md`, `BUGFIX_LOG.md` (`BUG-019`, `BUG-028`).
- **Evidência no sistema:** `apps/api/src/clients`, `apps/web/app/(authenticated)/clients`,
  `apps/web/components/clients`.
- **Ressalva:** a tela de clientes ainda tem ação "Agendamento direto pela ficha — em breve"; isso é fora do
  fluxo mínimo, mas precisa entrar no backlog de UX/operacional.

### Dashboard Operacional

- **Status:** Concluído com ressalvas.
- **Entregue:** endpoint `/dashboard/overview`, widgets web e cards de operação.
- **Evidência documental:** `docs/pr/PR-6.4_REPORT.md`, `packages/shared/src/dto/dashboard.dto.ts`.
- **Evidência no sistema:** `apps/api/src/dashboard`, `apps/web/app/(authenticated)/dashboard`,
  `apps/web/components/dashboard`.
- **Ressalva:** a web ainda marca cards como `mock` para receita, top serviços e ocupação. Isso indica
  visual presente, mas não fechamento pleno de produto/relatório.

### Segurança E Hardening

- **Status:** Concluído com ressalvas.
- **Entregue:** validação runtime com Zod em endpoints de escrita, política de senha ampliada, limites de
  strings, JWT com allowlist/claims, CSRF no refresh, scrub e smokes de segurança.
- **Evidência documental:** `docs/pr/PR-BE-FIX-SECURITY-HARDENING-01.md`, `BUGFIX_LOG.md`
  (`BUG-021` a `BUG-028`).
- **Evidência no sistema:** `apps/api/src/**/*dto*`, validações nos módulos de API, scripts
  `smoke-security-hardening.mjs` e `smoke-conformance.mjs`.
- **Fechamento 2026-07-13:** `BUG-021`–`033` validados; rate limiting usa Redis compartilhado e tabelas
  globais de identidade possuem RLS e funções pré-auth restritas.

## Pendente Para Fechar O MVP

### 1. Preencher O Relatório Final Do MVP

- **Status:** Pendente.
- **Fonte:** `docs/MVP_TEST_REPORT.md`.
- **Falta:** executar e registrar gates de migrations, anti-conflito, concorrência, timezone/DST, RLS,
  sessão, convite, idempotência, máquina de estados, rate limit, segurança e fluxos E2E.
- **Critério de pronto:** `MVP_TEST_REPORT.md` com veredito `APROVADO` ou `APROVADO COM PENDÊNCIAS ACEITAS`,
  sem pendência bloqueante.

### 2. Resolver Divergência "Backend Completo" Versus "Web Ainda Em Fechamento"

- **Status:** Pendente.
- **Fontes:** `docs/pr/PR-6.3_REPORT.md`, `docs/WEB_IMPLEMENTATION_ROADMAP.md`.
- **Problema:** `PR-6.3_REPORT.md` declara "MVP COMPLETO", mas `WEB_IMPLEMENTATION_ROADMAP.md` diz que a
  web ainda precisava ficar navegável e exercitável ponta-a-ponta.
- **Critério de pronto:** uma atualização documental única dizendo se `WEB-0` a `WEB-10` foram executados,
  substituídos por PRs reais, ou continuam pendentes.

### 3. Fechar Provas De Web Ponta-A-Ponta

- **Status:** Pendente.
- **Fonte:** `WEB_IMPLEMENTATION_ROADMAP.md`, `BUGFIX_LOG.md` (`BUG-018`).
- **Falta:** prova de clique/automação para navegação, CTA do dashboard, jornada/bloqueios, submissão em
  agenda/público com `Idempotency-Key` estável, booking público e cancelamento.
- **Critério de pronto:** teste manual ou automatizado registrado com ambiente, data, baseline e resultado.

### 4. Completar Mutação Operacional Na Agenda Web

- **Status:** Validado em 2026-07-13.
- **Fonte:** `WEB_IMPLEMENTATION_ROADMAP.md` (`WEB-5C`).
- **Evidência:** painel de detalhes, detail query, remarcação, nota, cancelar, completar e no-show em
  `apps/web/components/schedule/appointment-details-panel.tsx`; mutations centralizadas em
  `apps/web/hooks/use-schedule.ts`.
- **Prova:** `schedule-operations.spec.ts` cobre fluxos positivos, mesma chave após falha de rede,
  conflito de slot, versão velha e estado terminal.

### 5. Integrar Real-Time Na Web

- **Status:** Implementado em 2026-07-13; validação distribuída parcial.
- **Fonte:** `WEB_IMPLEMENTATION_ROADMAP.md` (`WEB-6`).
- **Evidência:** provider único Socket.IO, schema Zod compartilhado, invalidação por query key, refresh
  single-flight e fallback focus/reconnect. Backend corrigido para RLS no handshake, Redis adapter,
  kick por sala de sessão e outbox aceito por transporte distribuído.
- **Prova executada:** duas instâncias Redis/Socket.IO, evento A→B, kick cross-node, duas telas sem refresh,
  handshake RLS e `/ready` indisponível sem Redis.
- **Falta:** reconnect/org-switch, isolamento cross-tenant e evento pendente recuperado após retorno do Redis.

### 6. Fechar Pendências Do `BUGFIX_LOG.md`

- **Status:** Concluído para `INV-WEB-004/006`, `BUG-017/018` e `BUG-021`–`033`.
- **Pendências fora deste fechamento:** `PROP-E4`, `INV-WEB-003`, `INV-WEB-005`,
  `INV-WEB2-002`, `DIV-PR-4.3`.

### 7. CI, Build E Smokes De Fechamento

- **Status:** Validado localmente; workflow CI atualizado para repetir os mesmos gates remotamente.
- **Fonte:** relatórios `PASS_PROVISÓRIO_CI_PENDENTE`.
- **Evidência 2026-07-13:** lint; builds `shared/api/web`; migrations `0001`–`0011` do zero; RLS, HTTP,
  auth 36/36, idempotência, Redis, manutenção, security contracts, upsert público e Chromium PASS.

### 8. Atualizar Docs Defasados

- **Status:** Pendente.
- **Arquivos citados pelo agente documental:** `FRONTEND_DESIGN_REF.md` ainda carrega estado antigo sobre
  frontend; `WEB_IMPLEMENTATION_ROADMAP.md` precisa registrar execução real ou pendência dos PR-WEB;
  `BUGFIX_LOG.md` precisa promover itens implementados para `CORRIGIDO`/`VALIDADO` quando houver prova.

## Futuro Pós-MVP

Estes itens não bloqueiam o MVP se estiverem documentados como fora de escopo:

- Redis, filas/workers, rate limit distribuído e zero-downtime.
- Notificações automáticas por WhatsApp/SMS/e-mail.
- Pagamentos, no-show fee, billing SaaS, planos, trial e feature flags.
- Marketplace, descoberta, avaliações, reputação, portfólio e SEO público avançado.
- Login/app do cliente final.
- Lista de espera.
- Multiunidade.
- Mídia/upload, fotos, documentos e estratégia de storage.
- CRM avançado, fidelidade, pacotes, estoque, caixa e relatórios financeiros.
- Retenção/anonimização ampliada de staff (`users`).

Fontes: `POST_MVP_PRODUCT_ROADMAP.md` e `POST_MVP_TRANSITION_PLAN.md`.

## Próxima Sequência Recomendada

1. Fechar `BUGFIX_LOG.md`: promover o que já tem prova para `CORRIGIDO`/`VALIDADO` e manter pendências
   aceitas explicitamente marcadas.
2. Executar prova web E2E mínima: onboarding → serviço → profissional → jornada → agenda → link público →
   booking → painel enxerga → cancelamento público.
3. Implementar/provar `WEB-5C` e `WEB-6`, se ainda não estiverem cobertos por código existente.
4. Rodar CI/build/smokes finais e registrar baseline.
5. Preencher `MVP_TEST_REPORT.md` com veredito.
6. Só depois iniciar `POST_MVP_TRANSITION_PLAN.md`.
