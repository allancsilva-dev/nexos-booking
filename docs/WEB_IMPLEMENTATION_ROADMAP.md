# WEB_IMPLEMENTATION_ROADMAP — Finalização da camada web do MVP (`nexos-booking`)

> Camada de **condução** para fechar o buraco de frontend do MVP, no estilo do `IMPLEMENTATION_ROADMAP.md`.
> O backend foi **declarado feature-completo** (Fases 0–6); o **PR-DIAG-WEB confirmou** que "documentado" ≠
> "consumível" e registrou bugs públicos em runtime. A web já tem shell autenticado e componentes públicos
> parciais; a fase pública não é greenfield.
>
> **Isto NÃO é o pós-MVP.** O gate de `POST_MVP_TRANSITION_PLAN §1` (deploy validado, `MVP_TEST_REPORT`
> positivo, sem bloqueantes) ainda não está satisfeito. O objetivo é tornar o sistema **navegável e
> exercitável ponta-a-ponta**.
>
> Status: **v1 (consolidado)**. Autoridade: **ADR → DATABASE_SCHEMA_V2 → API_CONTRACTS → PLANNING →
> IMPLEMENTATION_ROADMAP**. `POST_MVP_*` = futuro, não é fonte. Executor: OpenCode (subagentes);
> **builders só após mapa 5b clareado**. Cada PR vira prompt de **13 blocos (EXECUTION_PROMPT_PROTOCOL v1.1)**.
> Camada de governança: validação (REV-RULE-001); **commit/push são ação do humano**.

---

## 0. Trava documental (vale para todo este roadmap)

E1/E2/E4 abaixo **mudam o canônico** (SCHEMA/API_CONTRACTS). Canônico **não se edita silenciosamente**:
cada pré-PR de backend **abre primeiro a PROPOSTA/ADR no `BUGFIX_LOG`** e só implementa após ratificada.
Este documento **referencia** essas propostas (PROP-E1, PROP-E2, …); não as aplica por conta própria.

---

## 1. Estado de partida (verificado)

- **API:** declarada feature-completa (Fases 0–6); §8/§9/§15/§16/§17/§18/§20. O PR-DIAG-WEB confirmou que
  há endpoints documentados com falhas runtime públicas (`INV-WEB-001/002`).
- **Web:** A web possui shell autenticado e componentes públicos parcialmente implementados
  (`/(public)/[orgSlug]`, `/agendar`, `/cancelar`), mas esses fluxos foram inventariados como parciais no
  PR-DIAG-WEB e dependem de correções `INV-WEB-001/002` antes da fase pública.
- **Segurança:** **PEND-001 — AFIRMADO, PROVA PENDENTE.** "Fechado pelo condutor" **não** é prova (padrão
  F2/sid). A prova objetiva vira o **PR-VERIFY-RLS-RUNTIME-01** (§3) e bloqueia a 1ª tela tenant-scoped.
- **Sessão (regras vinculantes do PR-BUGFIX-1):** `/auth/me` (§278) é **fonte única**; proibido sintetizar
  `user`/`activeOrg`/`memberships` do body; token **só em memória**; promoção `authenticated` só via
  `refreshSession()`; falha de `/auth/me` → idle/erro, **nunca** authenticated.

### 1.1 Gate de onboarding (por que hoje "não há o que testar")

O booking público só é exercitável com a empresa **operacionalmente completa**: `timezone`+`slotIntervalMin`
(§9), ≥1 **serviço** ativo (§20.2), ≥1 **profissional** ativo com slug (§20.1) **que preste o serviço**
(E2), e **jornada** (§20.3). Daí a ordem: **verificação → contrato → config → catálogo → jornada → agenda →
público**.

---

## 2. PR-DIAG-WEB — Inventário read-only do `apps/web` (PRECEDE tudo)

> **Builders FORA.** Guardians/reviewer/reporter em observação. Saída = **MAPA**, nunca código.

- **Objetivo:** inventariar o que existe **de fato** em `apps/web` vs. a superfície de API, e **confirmar em
  runtime** quais endpoints respondem (não só se estão documentados).
- **Escopo permitido:** leitura de `apps/web/**`, `packages/shared/**`; **`curl` em cada endpoint consumido**
  (§9/§15/§16/§17/§18/§20) registrando **status HTTP real**; listar rotas/páginas Next, hooks, componentes.
- **Escopo proibido:** qualquer write, commit, builder, criação de arquivo.
- **Entrega (5b = MAPA antes de recomendação):** tabela `tela/rota → existe? → endpoint consumido → status
  HTTP runtime → DTO do shared → estado (completo/parcial/ausente)`. Lacunas por PR-WEB-N. **Marca
  explicitamente** se `PATCH /organizations/:id` (E? WEB-1) responde, se cada Fase 2–6 está acessível.
- **Saída:** achados em `BUGFIX_LOG` (`INV-WEB-*`). **Nenhum fix.**

> **Resultado incorporado:** o DIAG voltou com `INV-WEB-001..006`. Os próximos PR-WEB devem partir do mapa:
> há fundação web e fluxo público parciais já presentes; lacunas viram delta/reconciliação, não criação
> greenfield.

---

## 3. PR-VERIFY-RLS-RUNTIME-01 — Prova objetiva de RLS/role (micro-PR read-only, veredito próprio)

> Roda junto com o DIAG, mas **veredito separado**: o DIAG olha superfície web/API; isto é **fundação de
> segurança**. Misturar dilui responsabilidade.

- **Objetivo:** converter PEND-001 de "afirmado" para **provado**, antes de qualquer tela que escreva tenant.
- **Provas obrigatórias (positiva + negativa):**
  1. `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user;` → `app_runtime,false,false`
  2. `current_user` numa conexão de runtime da API = `app_runtime` (não `nexos_booking`)
  3. `pg_stat_activity` mostrando as conexões da API como `app_runtime`
  4. `relrowsecurity=t AND relforcerowsecurity=t` nas tabelas tenant (SCHEMA §10)
  5. **Teste cross-tenant negativo:** contexto do tenant A consultando linha do tenant B → **0 linhas**
  6. Hash do commit do fix de role + ID do run de CI
- **Escopo proibido:** qualquer alteração de schema/app; é verificação.
- **Regra de parada:** falhou qualquer uma das 6 → **PEND-001 reaberto**, WEB-1+ bloqueados. **Isolamento só é
  critério de aceite das telas se a RLS estiver provada aqui** (PLANNING §10.3: sem RLS+`withTenantContext`,
  a query nasce vazando ou negando tudo).

---

## 4. Pré-PRs de backend (mudam contrato — abrem PROPOSTA antes)

### PR-BE-SNAPSHOT (PROP-E1) — Snapshot de preço no agendamento
- **Problema:** `appointments` (SCHEMA §8.1) não captura preço; mudança futura de `services.price_cents`
  corrompe histórico — bloqueia pagamentos (POST_MVP P6) e relatórios de receita (P10); **não há backfill**.
- **Proposta:** ADR + migração **aditiva** — `price_cents_snapshot`, `currency_snapshot` gravados na criação
  (painel e público); DTO de criação/leitura passa a expor o valor. Duração já é "fotografada" via `ends_at`.
- **Escopo proibido:** tocar a constraint `no_overlap`/`chk_interval`; alterar `service_id` como canônico.
- **Aceite:** criar agendamento grava o snapshot; alterar preço do serviço **não** muda agendamentos passados.
- **Gate:** **antes de WEB-5B e WEB-7B** (o DTO de criação precisa carregar o snapshot).

### PR-BE-PROF-SVC (PROP-E2) — Exigir vínculo `professional_services` na reserva e na disponibilidade
- **Problema:** a junção existe (SCHEMA §6.3) mas **não é exigida** em §15/§16/§17 — vitrine/painel podem
  marcar profissional para serviço que ele não presta; a junção é peso morto e as evoluções "qualquer
  profissional" (PLANNING §10.2) e override por profissional ficam sem fonte de verdade.
- **Proposta:** ADR/clarificação — "profissional oferece serviço" vira **pré-condição** (`422
  VALIDATION_ERROR` / código dedicado) na criação (painel e público) e **filtro** em `GET /availability` e na
  vitrine (`GET /public/:orgSlug` passa a relacionar serviço↔profissional, não listas planas).
- **Escopo proibido:** quebrar o formato de slots de availability (§15) — manter agregável ("qualquer
  profissional" futuro).
- **Aceite (−):** reservar profissional que não presta o serviço → `422`; vitrine não oferece a combinação.
- **Gate:** **antes de WEB-3 (UI de vínculo), WEB-5B, WEB-7A**.

> **E4 (envelope de lista/paginação) — DEFERIDA.** Registrada como **PROP-E4** no `BUGFIX_LOG`, **não
> construída agora**. Restrição transversal abaixo impede moldar DTO de lista de forma que feche a evolução.

---

## 5. Gate transversal (TODO PR-WEB)

- [ ] **Sessão:** estado de auth só via `refreshSession() → /auth/me`; sem síntese do body; token só em memória.
- [ ] **Isolamento (após VERIFY-RLS):** cross-tenant → **`404`**; **nenhum vazamento**. Prova positiva **e
      negativa**.
- [ ] **Contrato — regra reforçada:** **nenhum PR-WEB cria tipo local de contrato quando existe schema/tipo
      no `packages/shared`. Se o tipo não existir no shared, PARAR e registrar divergência antes de qualquer
      workaround** (lição `auth-schemas.ts`).
- [ ] **Idempotência estável por submissão (E1-op):** a `Idempotency-Key` **nasce no início da submissão** e
      **permanece a mesma** enquanto o usuário tenta confirmar a **mesma** ação; falha de rede + novo clique →
      **mesma chave** (não duplica); mudança de payload relevante → **nova chave**. Vale em **WEB-0, WEB-5B,
      WEB-5C, WEB-7B** (§5/§16/§17). `If-Match: <version>` em remarcação/ações (§6).
- [ ] **Lista (E4 deferida):** resposta de lista no shape canônico `{ items, nextCursor }` quando
      paginação/lista se aplicar, conforme `API_CONTRACTS §1` — **não** moldar de forma que feche paginação
      futura nem criar orientação local divergente.
- [ ] **UX:** três estados (loading/erro/vazio) em toda chamada; erro no **envelope com `requestId`**.
- [ ] **Papel:** `403 AUTHZ_DENIED` (mesma org, sem permissão) × `404` (cross-tenant/inexistente).
- [ ] **Privacidade:** sem PII em log/`metadata`/socket (ADR-010/005).
- [ ] **Prova:** ramo de erro exige prova negativa; sem navegador/e2e → **NÃO EXECUTADO, nunca PASS por
      inferência**.
- [ ] **CI verde** (lint+build+test do escopo); teste vermelho reabre a cadeia; **rótulo inventado é
      bloqueador**.
- [ ] **Design:** UI segue `FRONTEND_DESIGN_REF.md` (design-spec primário ausente — **DIV-PR-4.3**).
- [ ] **5b obrigatório:** design-auditor devolve mapa ancorado em §X antes do builder.

---

## 6. PR-WEB-0 — Fundação do cliente web (antes de qualquer tela)

- **Objetivo:** delta/auditoria da fundação web existente, consolidando HTTP/auth/erro como **solução
  definitiva** onde ainda houver lacuna. O DIAG confirmou que várias partes já existem (token em memória,
  `/auth/me` como fonte única, single-flight refresh, injeção de `Idempotency-Key`, envelope de erro e
  componentes públicos parciais); WEB-0 não é construção do zero.
- **Escopo permitido (`apps/web` + `shared`):**
  - **Interceptor 401 → refresh single-flight → replay:** 401 concorrentes enfileiram **uma** chamada a
    `/auth/refresh` (`X-CSRF:1`) e **replicam** as requisições; falha do refresh → idle/login, **nunca**
    authenticated.
  - **Política HTTP:** timeout; `AbortController` em requisição superada; **proibição de auto-retry em
    `POST`/`PATCH` sem a mesma `Idempotency-Key`** (auto-retry cego + mutação = duplicação).
  - **Geração estável de `Idempotency-Key` por submissão** (a regra transversal acima) como utilitário do
    cliente de mutação.
  - **Mapeamento central erro→UX** consumindo o union `ErrorCode` do `shared`, expondo `requestId`:
    409/422/429(+`Retry-After`)/410/403/404 tratados num lugar só.
  - **Abstração de org-context** (`resolveActiveOrg` derivado de `/auth/me`) para a migração futura claim →
    path-scoped (`/organizations/:orgId/...`) ser aditiva (ADR-020).
- **Escopo proibido:** telas de domínio; backend; `localStorage`/`sessionStorage` para token.
- **Aceite (+):** 401 no meio da sessão é recuperado sem jogar o usuário pra login; erro de API aparece no
  envelope com `requestId`. **Aceite (−):** refresh falho → idle, sem authenticated; mutação reenviada com a
  mesma chave não duplica.
- **Depende de:** DIAG-WEB, VERIFY-RLS-RUNTIME-01.

---

## 7. Fase W1 — Empresa operacionalmente completa (onboarding)

### PR-WEB-1 — Configurações da empresa + estado de onboarding (E3)
- **Telas/rotas:** `/settings/organization`; **widget de prontidão** no dashboard.
- **API:** `GET /organizations/:id`, **`PATCH /organizations/:id`** (OWNER — `name`, `timezone` IANA,
  `slotIntervalMin` 5–240) — §9. **DIAG confirma se o `PATCH` responde; se não, marca lacuna.**
- **E3 — estado de onboarding:** estado computado de prontidão (`timezone? ≥1 serviço? ≥1 profissional ativo
  com vínculo de serviço? jornada?`) exibido como checklist; é o pré-requisito do gate público (WEB-7A).
- **Sessão:** a org ativa deriva de **`/auth/me`** (fonte única); `:id` **casa com o claim `org`** — divergência
  → 404 (§9).
- **Aceite (−):** `timezone` fora da IANA → `422`; `slotIntervalMin` fora de 5–240 → `422`; MANAGER/
  PROFESSIONAL → `403`; `:id` ≠ claim → `404`.
- **Depende de:** WEB-0.

### PR-WEB-2 — Serviços (CRUD)
- **API:** `GET/POST /services`, `PATCH /services/:id` (+`active`) — §20.2. Lista no shape canônico
  `{ items, nextCursor }` quando paginação/lista se aplicar (E4 deferida; `API_CONTRACTS §1` prevalece).
- **Aceite (−):** `durationMin<=0`/`priceCents<0` → `422`; PROFESSIONAL → `403`; cross-tenant → `404`.
- **Depende de:** WEB-1.

### PR-WEB-3 — Profissionais (CRUD + vínculo de usuário + vínculo de serviços E2)
- **API:** `GET/POST /professionals`, `PATCH /professionals/:id` (`name`,`slug`,`active`,`userId`) — §20.1;
  **gestão do vínculo `professional_services`** (E2 — quais serviços o profissional presta).
- **Aceite (+):** slug gerado do nome; `active=false` some da vitrine/availability mantendo agendamentos.
  **Aceite (−):** colisão de slug → `409 SLUG_TAKEN` amigável (não `500`); PROFESSIONAL → `403`; cross-tenant
  → `404`.
- **Depende de:** WEB-2, **PR-BE-PROF-SVC**.

### PR-WEB-4 — Jornada (working-hours) + bloqueios
- **API:** `GET`/**`PUT`** `/professionals/:id/working-hours` (substitui — §20.3); `GET/POST/DELETE`
  `/professionals/:id/blocks` (§20.4).
- **Aceite (−):** turno sobreposto → `409 WORKING_HOURS_CONFLICT` com `details`; `endTime<=startTime` ou
  `endsAt<=startsAt` → `422`.
- **Depende de:** WEB-3. **DoD W1:** OWNER monta uma barbearia real (2 profissionais, serviços vinculados,
  jornadas).

---

## 8. Fase W2 — Núcleo da agenda (split em 3)

### PR-WEB-5A — Agenda read-only + disponibilidade + filtros
- **API (somente leitura):** `GET /professionals/:id/availability` (§15.1); `GET /appointments?from=&to=&
  professionalId=`, `GET /appointments/:id` (com `version`) — §16.
- **Aceite (+):** visão diária/semanal por profissional; `CONFIRMED` no passado aparece como **"pendente de
  desfecho"** (rótulo de UI); slots respeitam a grade (`alignToSlotGrid`/ADR-023). **Aceite (−):** janela > 31
  dias → `422`; cross-tenant → `404`. **É o pré-requisito mínimo para ver o que o público criar.**
- **Depende de:** WEB-4.

### PR-WEB-5B — Criação de agendamento (painel)
- **API:** `POST /appointments` (`Idempotency-Key` obrigatório; `allowOutsideHours` ADR-022) — §16.1.
- **Contrato:** snapshot de preço (**PR-BE-SNAPSHOT**) exibido na confirmação; grade (ADR-023); chave estável
  por submissão (gate transversal).
- **Aceite (−):** slot ocupado → `409 APPOINTMENT_CONFLICT` (refaz availability); fora da grade → `422`; fora
  da jornada sem `allowOutsideHours` → `422 OUTSIDE_WORKING_HOURS`; bloqueio → `422 WITHIN_BLOCK`;
  `IDEMPOTENCY_IN_PROGRESS` → `409`(+`Retry-After`); **retry mesma chave não duplica**; profissional não presta
  o serviço (E2) → `422`.
- **Depende de:** WEB-5A, **PR-BE-SNAPSHOT**, **PR-BE-PROF-SVC**.

> **WEB-5C (remarcar/desfechos) vem DEPOIS do loop público** (§9) — não gatilha o primeiro teste ponta-a-ponta.

---

## 9. Fase W3 — Página pública (o "link para agendar") — split em 3

### PR-WEB-7A — Vitrine pública + disponibilidade pública (read-only)
- **Natureza:** reconciliação/completar/corrigir sobre componentes públicos parciais já existentes; não é
  criação greenfield. Depende de `INV-WEB-001` corrigido antes de considerar a vitrine pública pronta.
- **API:** `GET /public/:orgSlug` (§17.1), `GET /public/:orgSlug/professionals`, `GET …/availability` (§15.2).
- **E3 — gate de publicável:** empresa sem catálogo/jornada → vitrine responde **"agenda indisponível"**, não
  formulário oco. **E2:** a vitrine relaciona serviço↔profissional (não oferece combinação inválida).
- **SEO/SSR:** **sem decisão definitiva agora** — fetch público client-side preserva IP real do visitante para
  o rate limit (ADR-012). **Não** moldar 7A de forma que **impeça** SSR/cache/agregação futura (ADR pós-MVP);
  não resolver SEO agora.
- **Aceite (−):** slug inexistente → `404`; profissionais/serviços inativos não aparecem.
- **Depende de:** WEB-1..4, WEB-5A (ver no painel), **PR-BE-PROF-SVC**.

### PR-WEB-7B — Booking público sem login
- **Natureza:** reconciliação/completar/corrigir do booking flow, slot picker e confirmation screen já
  inventariados como parciais; não é criação greenfield.
- **API:** `POST /public/:orgSlug/appointments` (§17.2) — **`consent: true` obrigatório**; `Idempotency-Key`
  **estável por submissão** (gate transversal — duplo submit em rede móvel = **um** agendamento).
- **Aceite (+):** cliente agenda sem login; recebe `cancelUrl` (token cru, única vez); aparece no painel
  (WEB-5A); snapshot de preço (E1) registrado. **UX de conflito:** `409` **preserva o formulário** e
  re-oferece slots próximos (refetch), não joga o cliente fora (ADR-025 — sem soft-hold).
- **Aceite (−):** `consent` ausente/`false` → `422`; passado / antes de 15 min (ADR-024) / além de 90 dias /
  fora da grade → `422`; fora da jornada → `422 OUTSIDE_WORKING_HOURS` (**público nunca tem
  `allowOutsideHours`**); rate limit → `429`(+`Retry-After`) no envelope; E2 inválido → `422`.
- **Depende de:** WEB-7A, WEB-5B, **PR-BE-SNAPSHOT**.

### PR-WEB-7C — Cancelamento público por token + preview
- **Natureza:** reconciliação/completar/corrigir do cancel form já inventariado como parcial; não é criação
  greenfield. Depende de `INV-WEB-002` corrigido antes de considerar o cancelamento público pronto.
- **API:** `POST /public/cancel/preview`, `POST /public/cancel` — §18. **Token no BODY**, nunca path/query;
  página `/cancelar/:token` aplica scrubbing de log.
- **Aceite (+):** `preview` mostra serviço/profissional/data **sem telefone**; `cancel` libera a vaga.
  **Aceite (−):** token inválido/expirado/já usado **ou agendamento já terminal → `410`** (não `409` — não
  vaza estado interno); rate limit → `429`.
- **Depende de:** WEB-7B.

---

## 10. Fase W4 — Operação e endurecimento

### PR-WEB-5C — Remarcação + desfechos (cancel/complete/no-show)
- **API:** `PATCH /appointments/:id` (remarca/edita nota) + ações `POST /:id/{cancel,complete,no-show}` —
  §16 (**não** `PATCH status` genérico). `Idempotency-Key` + `If-Match: <version>`; matriz
  `APPOINTMENT_TRANSITIONS` (ADR-018) desabilita botões pelo mesmo dado que o back valida.
- **E5 — invariante:** **toda** mutação (remarcar, cancel, complete, no-show) **incrementa `version`** e grava
  evento na mesma transação (senão `If-Match` e a invalidação do real-time degradam).
- **Aceite (−):** `version` velha → `409 APPOINTMENT_VERSION_CONFLICT`; ação sobre terminal →
  `409 INVALID_STATUS_TRANSITION`; remarcação fora da grade → `422`; remarcação de origem pública atualiza
  `public_cancel_token_expires_at = novo startsAt` (B2/§16.3).
- **Depende de:** WEB-7C (loop público provado primeiro).

### PR-WEB-6 — Real-time (socket + fallback de consistência)
- **API/canal:** handshake autenticado (JWT+vínculo) — §11; rooms por `organizationId`/`professionalId`;
  payload **só invalidação** (`appointment.changed`) → refetch HTTP.
- **Não é "só socket":** inclui **fallback de consistência** — `refetchOnReconnect`, `refetchOnWindowFocus`,
  `staleTime` conservador, invalidação por query key. A agenda **nunca** mostra dado velho em silêncio.
- **Aceite (−):** **nenhuma PII** no socket (ADR-005); membro `DISABLED`/sessão revogada é **desconectado**
  (kick por `sid` — ADR-020); ao reconectar, estado recompõe via HTTP.
- **Depende de:** WEB-5C.

### PR-WEB-8 — Clientes (busca/edição/anonimização LGPD)
- **API:** `GET /clients?search=&limit=&cursor=`, `GET/PATCH /clients/:id`, `POST /clients/:id/anonymize`
  (OWNER) — §20.5. **Máscara de telefone por papel** (PLANNING §4).
- **Infra:** busca por nome usa **`pg_trgm`** — **BUG-015** deve estar fechado (verificável por `EXPLAIN`).
- **Aceite (−):** colisão de telefone → `409`; re-anonimizar → `409`; cross-tenant → `404`. **Proibido**
  `DELETE` de cliente (é anonimização).
- **Depende de:** WEB-5C.

### PR-WEB-9 — Confirmação + link WhatsApp manual + histórico/filtros
- **API:** `GET /appointments/:id/events` (trilha — PR-6.2) + filtros do `GET /appointments`.
- **Proibido:** notificação automática (WhatsApp/SMS/e-mail — pós-MVP, exige workers/fila/ADR de provider).
- **Depende de:** WEB-5C.

### PR-WEB-10 *(opcional p/ teste single-owner)* — Equipe e convites
- **API:** §9 (members/invitations/invite). **Aceite (−):** convidar sem e-mail verificado →
  `403 EMAIL_NOT_VERIFIED` (§8.1); rebaixar/`DISABLED` único OWNER → `409 LAST_OWNER`; multi-org sem org ativa
  → `403 NO_ACTIVE_ORG`. Toca **BUG-018** (switch-org manual recompõe sessão).
- **Depende de:** WEB-1.

---

## 11. Sequência consolidada

```
DIAG-WEB → VERIFY-RLS-RUNTIME-01
 → [PROP-E1 → PR-BE-SNAPSHOT] → [PROP-E2 → PR-BE-PROF-SVC]
 → WEB-0
 → WEB-1(+onboarding E3) → WEB-2 → WEB-3(+vínculo E2) → WEB-4
 → WEB-5A → WEB-5B
 → WEB-7A(+gate E3) → WEB-7B → WEB-7C
 → WEB-5C(+E5) → WEB-6(+fallback) → WEB-8 → WEB-9 → (WEB-10 opcional)
```

- **Demo-first com proteção:** o menor loop que prova valor é `WEB-1→2→3→4→5A→7A→7B`; WEB-5B fica antes de
  WEB-7B para provar idempotência/criação no caminho autenticado antes de expor criação anônima.
- **Caminho crítico de teste ponta-a-ponta:** config → catálogo → jornada → agenda(ler) → link público →
  cliente agenda → dono vê no painel.

---

## 12. Ledger correlato

| ID | O quê | Impacto |
|---|---|---|
| **PEND-001** | role `app_runtime` + RLS | **AFIRMADO, PROVA PENDENTE** → PR-VERIFY-RLS-RUNTIME-01 (6 provas). |
| **PROP-E1** | snapshot de preço | Pré-PR de backend antes de 5B/7B. |
| **PROP-E2** | exigir `professional_services` | Pré-PR de backend antes de 3/5B/7A. |
| **PROP-E4** | envelope de lista/paginação | **Deferida**; direção canônica `{ items, nextCursor }`, sem fechar paginação futura. |
| **INV-WEB-001** | slug público inexistente → 500 | **ALTA**; corrigir antes de concluir WEB-7A. |
| **INV-WEB-002** | cancelamento público token inválido → 500 | **ALTA**; corrigir antes de concluir WEB-7C. |
| **INV-WEB-006** | web pública parcial já existe | **ALTA**; WEB-7A/7B/7C são reconciliação/completar/corrigir, não greenfield. |
| **E3** | gate publicável + onboarding | Embutido em WEB-1/WEB-7A (web, sem canônico). |
| **E5** | `version` bump em toda mutação | Aceite de WEB-5C. |
| **E6** | combo-service vs line-items | Registrar `service_id` canônico; não mudar agora. |
| **E7** | `created_by` no catálogo | Minor; aditivo futuro. |
| **BUG-018** | switch-org manual | WEB-1/WEB-10 (multi-org). |
| **BUG-011** | cookie `Secure` em dev | Não contamina aceite de soft-nav. |
| **BUG-015** | `pg_trgm` | Pré-requisito de WEB-8. |
| **DIV-PR-4.3** | design-spec ausente | UI segue `FRONTEND_DESIGN_REF.md`. |

---

## 13. Protocolo de despacho (cada PR → prompt de 13 blocos)

Gabarito EXECUTION_PROMPT_PROTOCOL v1.1, papel = **"executor de um único PR"** (restrição primeiro):
1. Identificação · 2. Regra central (um PR, sem antecipar, sem commit) · 3. Fontes (§ exatos) · 4. Autoridade
(§0) · 5a. Estado · **5b. Desenho com PARADA** (mapa ancorado em §X antes de código) · 6. Objetivo · 7. Escopo
permitido · 8. Escopo proibido · 9. Arquivos esperados · 10. Validações (**prova positiva e negativa**) · 11.
Relatório · 12. Paradas (trava documental: canônico não se edita; divergência → proposta no `BUGFIX_LOG`) ·
13. Entrega.

**Premissas canônicas que TODO handoff embute (lição F2/sid):** `/auth/me` fonte única · `Idempotency-Key`
estável por submissão em toda mutação · `If-Match` em remarcação/ações · matriz/`alignToSlotGrid` do `shared` ·
público sempre rejeita fora da jornada · token no body · `403`(mesma org) × `404`(cross-tenant) · RLS provada →
isolamento provado · `consent` no público · sem PII em socket/log/metadata · **NÃO EXECUTADO nunca vira PASS
por inferência** · builders só após 5b · commit/push são do humano.

---

*Próximo movimento: manter `PR-VERIFY-RLS-RUNTIME-01` como diagnóstico obrigatório separado, ratificar os
gates de contrato pendentes quando aplicável e só então despachar WEB-0 como delta/auditoria da fundação web.*
