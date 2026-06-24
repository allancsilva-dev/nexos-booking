# API_CONTRACTS — Contrato da superfície HTTP (MVP de Agendamento)

> **Fonte única do contrato HTTP do projeto** (unifica as antigas v1 e v2 num só arquivo — sem "v1
> herdada" viva em paralelo). Define o **formato** das respostas, os **headers obrigatórios**, as
> **convenções de status**, os **fluxos** (auth, organizations, health) e **todos os endpoints do MVP**
> (disponibilidade, agendamentos do painel, página pública, cadastros operacionais).
> Status: **consolidado — sync ADR v4** (alinhado à `ARCHITECTURE_DECISIONS.md` v4; par de
> `PLANNING.md` →v11, `DATABASE_SCHEMA_V2.md` v5, `IMPLEMENTATION_ROADMAP.md` →v4 na mesma rodada).
>
> **Estrutura:** §0–§13 = base do contrato (formato, erro, headers, status, idempotência, lock, catálogo
> de erros, auth, organizations, health, real-time, mapa do `shared`). §14–§23 = superfícies completas do
> MVP. O `packages/shared` é a materialização TypeScript deste contrato; web/api/mobile **importam**, não redefinem.

### Changelog — sync ADR v4 (rodada de continuidade)

- **Gate de jornada (ADR-022):** §16.0/§16.1/§16.4/§17.2 — o backend revalida jornada+bloqueios (o
  `no_overlap` não cobre). **Público sempre rejeita** fora do expediente (`422 OUTSIDE_WORKING_HOURS`);
  **painel encaixa** com **`allowOutsideHours: true`** (novo campo opcional no request, default `false`),
  marcando `metadata.outsideWorkingHours` no evento.
- **Âncora da grade (ADR-023):** §15/§16.1 — grade ancorada no **início da jornada do dia, no fuso da
  empresa**; mesma âncora no availability e no POST (coerência sob DST). `alignToSlotGrid()` no `shared`.
- **Antecedência mínima pública (ADR-024):** §17.2 — `startsAt` ≥ `now() + 15min` no público
  (`MIN_SCHEDULE_NOTICE_MIN`); painel isento.
- Sem mudança de envelope/headers; só validações e um campo opcional. Catálogo §7 já tinha
  `OUTSIDE_WORKING_HOURS`/`WITHIN_BLOCK`.

### Changelog — sync ADR v3 (rodada anterior)

- **Tenant ativo (ADR-020):** o access carrega claim `org` (empresa ativa) + `sid` (família da sessão).
  Login com >1 vínculo → access **sem** `org` (`403 NO_ACTIVE_ORG` em rota tenant-scoped até escolher);
  nova rota `POST /auth/switch-org`. §3.3 reescrito ("org **validada**, não livre"). §8/§9 atualizados.
- **Logout Bearer-only (ADR-004 v3):** lê o `sid` do access (não depende do cookie, cujo `Path` é
  estreito). Nova rota `POST /auth/password/change` (autenticado). §8.
- **Idempotência obrigatória também no painel (ADR-008 v3):** §5/§16 — `Idempotency-Key` deixa de ser
  "recomendada" e passa a obrigatória nas mutações do painel.
- **CSRF fixado (ADR-012 v3):** `/auth/refresh` exige header **`X-CSRF: 1`**; double-submit descartado.
  §3.2.
- **Anonimização LGPD limpa `appointments.note` (ADR-016 v3):** §20.5 — "anonimizar a linha basta" vira
  "anonimizar a linha + scrub de `note`". Princípio: todo campo de texto livre com PII entra no scrub.
- **Cancelamento público sobre estado terminal → `410` (ADR-018 v3):** §18.
- **Bordas fechadas:** `400 BAD_REQUEST` (malformação) vs `422 VALIDATION_ERROR` (semântica) padronizado
  (§4/§15.1); códigos `NO_ACTIVE_ORG`/`EMAIL_TAKEN`/`ALREADY_MEMBER`/`LAST_OWNER` (§7); invariante do
  último OWNER (§9); alinhamento de `startsAt` à grade do `slot_interval_min` (§16.1/§17.2); expiração do
  cancel token atualizada na remarcação (§16.3); política de nome divergente no upsert (§20.5).

### Changelog — revisão pré-código

- **ADR-012 FECHADA (Opção A):** same-origin via proxy reverso; §3.2 sem condicional. Inclui a
  **resolução de IP real** atrás do proxy (§19.3) — pré-requisito do rate limit por IP.
- **Auth completa (§8):** `GET /auth/me` (bootstrap de sessão), `POST /auth/verify-email/resend`,
  `POST /auth/accept-invite` (ADR-019); **logout revoga a família da sessão apresentada**, não todas
  (ADR-004); consequência de e-mail não verificado definida (§8.1).
- **Convite reescrito (§9):** via tabela `invitations` — convite por e-mail (com ou sem conta), aceite
  cria o vínculo `ACTIVE` (ADR-019).
- **Máquina de estados (§16):** todo agendamento **nasce `CONFIRMED`**; matriz de transição única;
  novo código `409 INVALID_STATUS_TRANSITION` (ADR-018).
- **Validações da rota pública (§17):** `startsAt` no futuro; **horizonte máximo de 90 dias** (default
  declarado); expiração do token de cancelamento **= `startsAt`**.
- **Cancelamento público (§18):** token sai do **path** e vai no **body** (`POST /public/cancel` /
  `/preview`) — path aparece em access log de proxy e error tracking igual a query string.
- **Rate limit (§19):** tabela estendida à superfície de **auth** (login/register/forgot/refresh/resend)
  — ADR-009 emendada.
- **Novo módulo `clients` (§20.5):** busca/edição + rota de **anonimização LGPD** (o mecanismo do
  ADR-016 ganha superfície).

A camada de banco já está especificada com rigor (`DATABASE_SCHEMA_V2.md`); a superfície HTTP precisa
do mesmo rigor antes do código, porque é dela que nasce o `packages/shared` (schemas Zod importados por
`web`, `api` e `mobile`). Este documento é a fonte de verdade do **contrato**; o `shared` é a sua
materialização em TypeScript.

---

## 0. Princípios

- **Contrato único, três consumidores.** Tipos e schemas Zod vivem em `packages/shared` e são
  importados por web, api e mobile. O contrato é escrito uma vez.
- **A API nunca confia em data/hora "solta" do cliente.** Instantes vão e voltam em **ISO-8601 com
  offset** (`timestamptz`); o backend resolve o instante absoluto no fuso da empresa (PLANNING §10.5).
- **O cliente nunca envia `organization_id` livre.** Em rota autenticada vem do **claim `org`** do
  access token (assinado, validado contra o vínculo na emissão — ADR-020); em rota pública vem do `slug`
  (resolvido por `app_resolve_org_by_slug` — ADR-017). Ver PLANNING §10.3/§12.
- **Toda resposta de erro usa o mesmo envelope** (seção 2). Sem exceção — inclusive 401/403/429/500.
- **Toda requisição carrega/recebe `X-Request-Id`** para correlação ponta a ponta (seção 3).
- **Credencial nunca em path nem query string** — tokens públicos viajam no **body** (§18).

---

## 1. Versionamento e convenções gerais

- **Base path:** `/api/v1`. Mudança incompatível → `/api/v2` (o `v1` continua durante a transição).
- **Content-Type:** `application/json; charset=utf-8` em requisição e resposta (exceto `/health`,
  `/ready`, que podem ser `text/plain`).
- **Datas/horas:** sempre ISO-8601 com offset, ex.: `2026-05-31T14:30:00-03:00`. Nunca data "solta".
- **Dinheiro:** inteiro em centavos (`priceCents`) + `currency` (`"BRL"`). Espelha o banco.
- **IDs:** `uuid` em string.
- **Campos:** `camelCase` no JSON (o banco é `snake_case`; a conversão fica na borda da API).
- **Paginação (quando aplicável):** cursor (`?limit=&cursor=`), resposta com `{ items, nextCursor }`.
  Agenda é consultada por janela de data (`?from=&to=`), não por offset.

---

## 2. Envelope de erro (padrão único)

Toda falha — validação, autorização, conflito, rate limit, erro interno — responde com **este corpo**:

```json
{
  "error": {
    "code": "APPOINTMENT_CONFLICT",
    "message": "Este horário acabou de ser preenchido.",
    "details": [
      { "field": "startsAt", "issue": "overlap" }
    ],
    "requestId": "01HXXSAMPLEREQUESTID",
    "timestamp": "2026-05-31T14:30:00-03:00"
  }
}
```

- **`code`** — constante estável, em `SCREAMING_SNAKE_CASE`. É o que o front usa para lógica e i18n
  (a `message` é texto humano, pode mudar; o `code` não). Catálogo na seção 7.
- **`message`** — texto curto, apresentável ao usuário final. **Sem PII** (telefone mascarado).
- **`details`** — opcional; lista estruturada (erros de validação campo a campo, vindos do Zod).
- **`requestId`** — o mesmo `X-Request-Id` da resposta. Liga o erro ao log/trace (suporte e debug).
- **`timestamp`** — instante do erro (ISO-8601 com offset).

> **Filtro global no NestJS.** O envelope nasce de um *exception filter* global na Fase 1: nenhuma rota
> monta erro à mão. Erros de validação (Zod/`ValidationPipe`) viram `code: "VALIDATION_ERROR"` +
> `details`. Erro não tratado → `code: "INTERNAL_ERROR"`, `500`, **sem vazar stack** ao cliente
> (stack vai para o error tracking, correlacionada por `requestId`).

Sucesso devolve o recurso direto (sem envelope `data`), ex.: `201` com o objeto do agendamento.

---

## 3. Headers

### 3.1 Obrigatórios / convencionados

| Header | Direção | Quando | Papel |
|---|---|---|---|
| `Authorization: Bearer <access>` | request | toda rota autenticada (mutação e leitura) | access token curto, em memória no front |
| `X-Request-Id` | request/response | sempre | correlação. Se o cliente mandar, é propagado; senão a API gera e devolve |
| `Idempotency-Key` | request | mutações de agendamento (**obrigatório** nas públicas) | dedup de retry/clique-duplo (seção 5) |
| `If-Match: <version>` | request | edição/remarcação de agendamento | optimistic lock (seção 6) |

### 3.2 Cookies (só no fluxo de refresh) — ADR-012 FECHADA (Opção A)

- **Topologia decidida: same-origin via proxy reverso.** A web serve `/api/*` no mesmo host (proxy
  para o NestJS) → cookie same-site puro, **`SameSite=Strict`**, **sem CORS**.
- **Refresh token** em cookie `httpOnly` + `Secure` + `SameSite=Strict` + `Path=/api/v1/auth/refresh`.
  Path estreito é proposital (o cookie só viaja para a rota de refresh); um bump para `/api/v2` reemite
  o cookie no próximo login/refresh — evento planejado, não bug (ADR-012).
- Mutações vão por `Bearer` (token em memória) → a superfície de CSRF concentra-se na rota de cookie
  automático `/auth/refresh`. Como o cookie é `SameSite=Strict` (um POST cross-site nem o carrega), a
  proteção é **defesa em profundidade sem estado**: a `/auth/refresh` **exige o header custom fixo
  `X-CSRF: 1`** (que `<form>` HTML não envia); ausência → `403`. **Double-submit descartado** (ADR-012 v3;
  PLANNING §12).
- A resolução de **IP real** atrás do proxy (necessária ao §19) está em §19.3.

### 3.3 Nunca

- A API **não** aceita `organization_id` **livre/não-validado** por header/body em rota autenticada. O
  tenant vem do **claim `org`** assinado (ADR-020) ou, na evolução path-scoped futura, do `:orgId`
  validado contra o vínculo + RLS (mesmo padrão já usado no §9). A proibição incide sobre org arbitrária
  em body/header, **não** sobre o claim assinado nem sobre o path validado.
- A API **não** ecoa system/browser info; **não** coloca PII em query string.
- **Credencial (token público) não vai em path nem query string** — vai no body (§18). Path aparece em
  access log de proxy/error tracking igual a query string.

### 3.4 Hardening de plataforma (ADR-021)

- **JWT validado estritamente:** algoritmo em **lista branca** (rejeita `alg:none`/confusão), `iss`/`aud`
  conferidos, `exp`/`iat` presentes. MVP HS256 simétrico; `kid`/RS256 é evolução aditiva.
- **Cabeçalhos de segurança (Helmet)** em toda resposta: HSTS (após TLS), CSP (forte nas páginas
  públicas), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`.
- **Limites de requisição:** body máx. (ex.: 100 KB JSON), timeout de requisição, `max` de page size nos
  `GET` com cursor — higiene de DoS, complementa o rate limit (§19).
- **TLS é pré-requisito** (cookies `Secure` + HSTS o pressupõem). **Segredos** (JWT/cookie/Resend/DB) por
  injeção de ambiente, nunca no payload nem em log (logs fazem scrub de `Authorization`/cookies/tokens).
- **Mutações sensíveis** (gestão de membros, anonimização, troca de papel) **revalidam o vínculo
  `ACTIVE`** no servidor, sem confiar só no claim (fecha a janela do access curto de um membro
  recém-`DISABLED`).

---

## 4. Convenções de status HTTP

| Status | Uso |
|---|---|
| `200 OK` | leitura; mutação idempotente já concluída (replay) |
| `201 Created` | recurso criado |
| `204 No Content` | ação sem corpo (ex.: logout) |
| `400 Bad Request` | JSON malformado / requisição estruturalmente inválida |
| `401 Unauthorized` | sem token, token inválido/expirado |
| `403 Forbidden` | autenticado, mas sem permissão (papel/tenant/e-mail não verificado) — `AUTHZ_DENIED` / `EMAIL_NOT_VERIFIED` |
| `404 Not Found` | recurso inexistente **ou** invisível por tenant (não distinguir, para não vazar existência) |
| `409 Conflict` | conflito de agenda; optimistic lock; idempotência divergente; idempotência `IN_PROGRESS`; transição de status inválida |
| `410 Gone` | token de cancelamento/verificação/convite expirado ou já usado |
| `422 Unprocessable Entity` | validação semântica (regra de negócio), ex.: agendar fora da jornada |
| `429 Too Many Requests` | rate limit (rotas públicas **e de auth**) — com `Retry-After` |
| `500 Internal Server Error` | erro não tratado (envelope sem stack) |

> **`404` por tenant é proposital:** um recurso de outra empresa responde `404`, não `403` — não
> confirmamos sequer que ele existe. A RLS já nega a linha; a borda HTTP mantém a opacidade.

> **`400` vs `422` (padronizado):** **`400 BAD_REQUEST`** = malformação estrutural (JSON inválido, tipo
> errado, data não-parseável). **`422 VALIDATION_ERROR`** = requisição bem-formada que viola regra
> semântica (fora da jornada, janela > 31 dias, horizonte > 90 dias, `consent` ausente). O `code`
> `VALIDATION_ERROR` mapeia **sempre** para `422`; malformação estrutural usa `code: BAD_REQUEST` + `400`.

---

## 5. Idempotência (mutações de agendamento)

Espelha `DATABASE_SCHEMA_V2.md` §9.1 e PLANNING §10.6.

- Cliente envia `Idempotency-Key` (UUID/opaco). **Obrigatório** nas mutações públicas **e do painel**
  (ADR-008 v3 — o cliente HTTP do `shared` injeta por padrão; "recomendado" em contrato vira "esquecido"
  em código, e o duplo-clique da recepcionista é o cenário mais provável de duplicação).
- **Mesma chave + mesmo payload** → replay fiel: devolve o **mesmo corpo e o mesmo status** da 1ª execução
  (`response_status_code`). Não reexecuta.
- **Mesma chave + payload diferente** → `409` `IDEMPOTENCY_KEY_REUSED`. Nunca devolve resposta de outro payload.
- **Chave `IN_PROGRESS`** → `409` `IDEMPOTENCY_IN_PROGRESS` **na hora**, com `Retry-After`. A API **não
  bloqueia** a requisição esperando a 1ª terminar (evita esgotar o pool sob retry storm).
- **`IN_PROGRESS` órfão** (1ª requisição morreu) é recuperado por **TTL de in-progress de 60s** (a partir
  de `created_at`), com **takeover por compare-and-swap atômico** — só a retry que vencer o CAS executa;
  as demais recebem `409`. **Decisão fechada — ADR-008 (emendada).**

---

## 6. Optimistic locking (edição/remarcação)

Espelha `DATABASE_SCHEMA_V2.md` §8.1.

- A leitura do agendamento devolve `version` (int).
- A edição/remarcação envia `If-Match: <version>`. O `UPDATE` é compare-and-swap
  (`WHERE id = $1 AND version = $2`, `SET version = version + 1`).
- **0 linhas afetadas** (alguém editou antes) → `409` `APPOINTMENT_VERSION_CONFLICT`. O front refaz o fetch.
- **Remarcação não é status:** atualiza `startsAt`/`endsAt` (segue `CONFIRMED`) e registra `RESCHEDULED`
  em `appointment_events` (mesma transação).

---

## 7. Catálogo de `error.code` (estável, validado por constante no app)

> Cresce de forma aditiva. Constantes tipadas no `shared` + testes (sem `CHECK IN` no banco — espelha a
> decisão de `audit_logs.action`, schema §9.2).

**Genéricos:** `VALIDATION_ERROR`, `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, `RATE_LIMITED`.
**Auth:** `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `REFRESH_REUSED`,
`EMAIL_NOT_VERIFIED`, `VERIFICATION_TOKEN_INVALID`, `VERIFICATION_TOKEN_EXPIRED`, `EMAIL_TAKEN`
(`409`, register com e-mail já existente), `NO_ACTIVE_ORG` (`403`, rota tenant-scoped sem `org` no
claim — usuário multi-org precisa de `switch-org`; ADR-020).
**Convite (ADR-019):** `INVITE_TOKEN_INVALID`, `INVITE_TOKEN_EXPIRED`, `ALREADY_MEMBER` (`409`, aceite
de convite de empresa onde já é membro).
**Authorization:** `AUTHZ_DENIED`, `TENANT_FORBIDDEN`.
**Org/equipe:** `SLUG_TAKEN`, `SLUG_RESERVED`, `LAST_OWNER` (`409`, tentativa de rebaixar/`DISABLED` o
único OWNER ativo da empresa).
**Idempotência:** `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_IN_PROGRESS`.
**Agenda:** `APPOINTMENT_CONFLICT` (overlap), `APPOINTMENT_VERSION_CONFLICT` (lost update),
`INVALID_STATUS_TRANSITION` (ação sobre estado terminal / transição fora da matriz — ADR-018),
`OUTSIDE_WORKING_HOURS`, `WITHIN_BLOCK`, `CANCEL_TOKEN_INVALID`, `CANCEL_TOKEN_EXPIRED`.
**Jornada:** `WORKING_HOURS_CONFLICT` (turnos sobrepostos no mesmo dia — `no_shift_overlap`; ADR-015).
**Profissional/serviço:** `PROFESSIONAL_SERVICE_NOT_LINKED` (`422`, profissional não presta o serviço informado).

---

## 8. Autenticação (fluxos da Fase 1)

Espelha PLANNING §12 e `DATABASE_SCHEMA_V2.md` §4/§5.3. Hash de credenciais e tokens é feito **no app**
(argon2id para senha; SHA-256 para tokens — schema §1); o banco guarda só o hash. **Todas as rotas desta
seção têm rate limit (§19.2).**

| Método | Rota | Corpo / efeito | Resposta |
|---|---|---|---|
| `POST` | `/auth/register` | cria `user` + 1ª `organization` + vínculo `OWNER` (transação; dispara e-mail de verificação via Resend) | `201` { user, organization } + access (com `org`+`sid`); refresh no cookie. E-mail já existente → `409` `EMAIL_TAKEN` |
| `POST` | `/auth/login` | `email`, `password` | `200` { user } + access; refresh no cookie. **1 vínculo → access com `org`; >1 vínculos → access sem `org`** (ADR-020). Falha → `401` `INVALID_CREDENTIALS` |
| `GET` | `/auth/me` | (Bearer) — bootstrap de sessão | `200` { user, activeOrg: orgId\|null, memberships: [{ organizationId, role, status }] } |
| `POST` | `/auth/switch-org` | (Bearer) `{ organizationId }` — valida vínculo `ACTIVE` e **reemite o access com novo `org`**, **sem rotacionar o refresh** (ADR-020) | `200` novo access. Vínculo inexistente/`DISABLED` → `403` `AUTHZ_DENIED` |
| `POST` | `/auth/refresh` | (cookie httpOnly + header `X-CSRF: 1`) | `200` novo access; **rotaciona** refresh (revoga anterior). Reuso de revogado → `401` `REFRESH_REUSED` + revoga a família |
| `POST` | `/auth/logout` | (Bearer) revoga **a família da sessão apresentada** — lê o `sid` do access (ADR-004 v3/ADR-020) | `204` |
| `POST` | `/auth/password/change` | (Bearer) `{ currentPassword, newPassword }` — troca o hash e **revoga todas as famílias exceto a atual** (a do `sid`) | `200`. Senha atual errada → `401` `INVALID_CREDENTIALS` |
| `POST` | `/auth/verify-email` | `token` (do link) | `200`; marca `email_verified_at`. Expirado/usado → `410` |
| `POST` | `/auth/verify-email/resend` | (Bearer) emite novo token e invalida o anterior do mesmo `purpose` | `202 Accepted` |
| `POST` | `/auth/password/forgot` | `email` (sempre `202`, não revela se existe) | `202 Accepted` |
| `POST` | `/auth/password/reset` | `token`, `newPassword` | `200`; **revoga todas as sessões ativas** do usuário. Token inválido/expirado → `410` |
| `POST` | `/auth/accept-invite` | `{ token }` (usuário logado/existente) **ou** `{ token, name, password }` (registro por convite) — ADR-019 | `200` { user, organization } (+ access/refresh se registro). Expirado/usado → `410` `INVITE_TOKEN_*`. Já é membro → `409` `ALREADY_MEMBER` |

- **Access token:** 5–15 min, `Bearer`, em memória no front. **Claims:** `sub` (user), `org?` (empresa
  ativa — ausente no estado multi-org não-resolvido), `sid` (família da sessão), `exp` curto (ADR-020).
  **Refresh:** rotativo, cookie httpOnly (§3.2). **Bootstrap:** o access em memória se perde no reload —
  o shell chama `/auth/refresh` (com `X-CSRF: 1`) e depois `/auth/me` para recompor a sessão (PR-1.7).
- **Tenant ativo (ADR-020):** o guard lê `org` do claim (zero query de membership por request). Sem
  `org` no claim, qualquer rota tenant-scoped responde `403 NO_ACTIVE_ORG`; o front só alcança `/auth/me`,
  `/organizations/me`, `/auth/switch-org` e `/auth/logout` até o usuário escolher a empresa. **Não há
  auto-seleção de "última empresa" no backend** — a emissão do `org` depende de escolha explícita
  (`switch-org`); o front pode exibir um hint visual, mas não decide o tenant pelo token.
- **Evolução multi-org simultâneo:** path-scoped (`/organizations/:orgId/...`) é aditivo; o guard resolve
  o tenant de um ponto único (`resolveActiveOrg(req)`), então trocar a fonte (claim → path) não toca
  controllers (ADR-020).
- **Rotação + detecção de reuso + revogação** → schema §4.2. Logout = família atual (via `sid`);
  `password/change` = todas exceto a atual; reset/`DISABLED` = todas as sessões (ADR-004 v3).
- **Aceite de convite:** lookup do token via resolver (ADR-017); registro por convite **não** exige
  verificação de e-mail adicional (o token chegou pelo próprio e-mail — verificado por construção).
- **Mobile (futuro):** mesmos endpoints; refresh em secure storage como `Bearer` (sem cookie). O contrato
  já suporta os dois modos.
- Toda ação relevante de auth grava em `audit_logs` (`LOGIN_SUCCESS`/`LOGIN_FAILED`/`TOKEN_REFRESH`/
  `SESSION_REVOKED`/`PASSWORD_CHANGED`/`EMAIL_VERIFIED`/`MEMBER_INVITED`), **sem PII crua**. Eventos
  globais (sem org) entram pela policy `global_security_events` (schema §10.5).

### 8.1 Consequência de e-mail não verificado (regra fechada)

Login **é permitido** sem verificação (não travar o onboarding). O que **exige** `email_verified_at`:
**convidar membros** (`POST /organizations/:id/members/invite`) — envio de e-mail em nome da empresa.
Violação → `403 EMAIL_NOT_VERIFIED`. Default declarado, revisável; ampliar o gating é aditivo.

---

## 9. Organizations e equipe (Fase 1)

| Método | Rota | Papel | Observação |
|---|---|---|---|
| `GET` | `/organizations/me` | membro | empresas do usuário logado ("minhas empresas") |
| `GET` | `/organizations/:id` | membro | dados da empresa (RLS garante o tenant) |
| `PATCH` | `/organizations/:id` | OWNER | nome, `timezone` (validado contra lista IANA), `slotIntervalMin` (faixa 5–240) |
| `GET` | `/organizations/:id/members` | OWNER/MANAGER | vínculos (role, status) |
| `GET` | `/organizations/:id/invitations` | OWNER | convites pendentes |
| `POST` | `/organizations/:id/members/invite` | OWNER (e-mail verificado — §8.1) | `{ email, role }` → cria `invitation` + e-mail via Resend (ADR-019). Reenviar **substitui** o pendente (unique parcial, schema §5.3) |
| `DELETE` | `/organizations/:id/invitations/:invitationId` | OWNER | revoga convite pendente |
| `PATCH` | `/organizations/:id/members/:userId` | OWNER | muda `role`/`status` (`DISABLED` derruba **todas** as sessões do usuário). **Rebaixar ou `DISABLED` o único OWNER ativo → `409 LAST_OWNER`** (a empresa não pode ficar sem dono) |

- **Convite (ADR-019):** o vínculo em `organization_users` é criado **no aceite**
  (`POST /auth/accept-invite` — §8), já `ACTIVE`. Cobre convidado com e sem conta num único mecanismo.
- **Slug:** gerado do nome, único case-insensitive, com tratamento de colisão (`-2`, `-3`) e lista de
  reservadas. Colisão → `409` `SLUG_TAKEN`; reservada → `422` `SLUG_RESERVED`. (Schema §5.1.)
- **`timezone` inválido quebra o cálculo de disponibilidade inteiro** — por isso a validação IANA na
  borda é obrigatória (Zod no `shared` + `Intl.supportedValuesOf('timeZone')`).
- **`organization_id` nunca vem do cliente** — em rota autenticada vem do **claim `org`** do access
  (ADR-020), validado contra o vínculo + RLS. As rotas `/organizations/:id/*` usam o `:id` do path
  (validado contra o vínculo) por serem rotas **de** organização; o `:id` deve casar com o `org` ativo do
  claim. Trocar de empresa ativa é via `POST /auth/switch-org` (§8), não por `:id` divergente.
- **Último OWNER (`409 LAST_OWNER`):** rebaixar para MANAGER/PROFESSIONAL ou `DISABLED` o **único OWNER
  ativo** deixa a empresa órfã (ninguém convida, anonimiza ou edita a empresa). O service recusa **antes**
  do UPDATE; transferir a titularidade exige promover outro OWNER primeiro.

---

## 10. Health e readiness

| Rota | Significado | Uso |
|---|---|---|
| `GET /health` | processo vivo (liveness) — não toca dependências | orquestrador reinicia se falhar |
| `GET /ready` | pronto para tráfego (readiness) — checa DB e dependências críticas | load balancer só roteia se `200` |

- Públicos, sem auth, fora do envelope de erro padrão (resposta mínima). Não expõem versão/infra.

---

## 11. Real-time (handshake e payload — referência)

Detalhe em PLANNING §11. Resumo do contrato do socket:

- **Handshake autenticado:** o socket valida o JWT no connect e confere o vínculo com a empresa **antes**
  de entrar na room (`organization_id`/`professional_id`).
- **Payload é só invalidação, sem PII:** `appointment.changed` com `{ professionalId, date, version, occurredAt }`.
  O front recebe e **refaz o fetch via HTTP**, onde a autorização granular e a máscara de telefone valem.
- **WebSocket não é fonte de verdade:** ao reconectar, o front **sempre** recupera o estado via HTTP.

---

## 12. Mapa para o `packages/shared`

| Item deste contrato | Materialização no `shared` |
|---|---|
| Envelope de erro (seção 2) | `ErrorEnvelope` (tipo) + `ErrorCode` (union das constantes da seção 7) |
| Corpos de request/response | schemas Zod por recurso (`LoginInput`, `RegisterInput`, `AcceptInviteInput`, `OrganizationDTO`, ...) |
| Convenções de data/dinheiro | helpers de (de)serialização ISO-8601 + centavos |
| Headers (`Idempotency-Key`, `If-Match`, `X-Request-Id`) | constantes + helpers do client HTTP |
| **Matriz de transição de status (ADR-018)** | constante única — o front desabilita botões pelo **mesmo dado** que o back valida |

> O `shared` é o contrato; web/api/mobile **importam**, não redefinem. Divergência aqui é bug de build,
> não de runtime.

---

## 13. Endpoints completos do MVP (§14 em diante)

As seções §0–§12 acima fixam o **formato** (erro, headers, status, idempotência, lock, auth,
organizations, health, real-time). As seções a seguir especificam **os endpoints** que produzem esse
contrato, na ordem das fases do `IMPLEMENTATION_ROADMAP.md`: disponibilidade (§15), agendamentos do
painel (§16), página pública (§17–§18), anti-abuso (§19) e cadastros operacionais (§20). O §21 estende o
mapa do `shared` e o §22 estende o catálogo de erros.

---


## 14. Princípio transversal — disponibilidade é *advisory*, a verdade é a constraint

Esta é a regra mais importante deste contrato e a fonte de mais bugs sutis se ficar implícita.

`GET /availability` devolve uma **fotografia** do que estava livre no instante da consulta. Entre o GET
e o `POST /appointments`, outro cliente (ou a equipe) pode ter ocupado o mesmo slot. Portanto:

- **A lista de slots NÃO é uma garantia de reserva.** É uma sugestão para montar a UI.
- **A fonte de verdade é o INSERT**, protegido pela constraint `no_overlap` (schema §8.1). O cliente que
  perder a corrida recebe `409 APPOINTMENT_CONFLICT`, mesmo que o slot aparecesse livre no GET.
- **O front trata `409 APPOINTMENT_CONFLICT` como fluxo normal, não como erro de sistema:** mostra
  mensagem amigável ("esse horário acabou de ser preenchido") e **refaz o `GET /availability`** para
  reapresentar os horários atualizados. Isso casa com o real-time (seção 11): o socket invalida,
  o front refaz o fetch.

> **Consequência para o `shared`:** o tipo de retorno de availability deve deixar claro (em comentário e
> nome) que é uma projeção volátil — ex.: `AvailabilitySlotsResponse` com nota de que slots expiram.

---

## 15. Disponibilidade (`scheduling`) — o endpoint mais quente

### 15.1 Painel (autenticado)

| Método | Rota | Papel | Idempotência |
|---|---|---|---|
| `GET` | `/professionals/:professionalId/availability` | membro (com escopo) | n/a (leitura) |

**Query params:**

| Param | Tipo | Obrigatório | Significado |
|---|---|---|---|
| `serviceId` | uuid | sim | define a **duração** do slot (a janela ocupada = `service.durationMin`) |
| `date` | `YYYY-MM-DD` | sim (ou `from`/`to`) | dia único, interpretado **no timezone da empresa** |
| `from` / `to` | `YYYY-MM-DD` | opcional | janela de dias (substitui `date`); `to` exclusivo; teto de **31 dias** por chamada |

> **Por que data "solta" (`YYYY-MM-DD`) e não `timestamptz` aqui?** O cliente pede "os horários do dia
> 2026-06-10". Quem resolve esse dia em instantes absolutos é o **backend, no fuso da empresa**
> (`organizations.timezone`) — PLANNING §10.5. O front nunca manda o instante; manda o dia civil.

**Response `200`:**

```json
{
  "professionalId": "uuid",
  "serviceId": "uuid",
  "timezone": "America/Sao_Paulo",
  "slotIntervalMin": 30,
  "days": [
    {
      "date": "2026-06-10",
      "slots": [
        { "startsAt": "2026-06-10T09:00:00-03:00", "endsAt": "2026-06-10T09:50:00-03:00" },
        { "startsAt": "2026-06-10T09:30:00-03:00", "endsAt": "2026-06-10T10:20:00-03:00" }
      ]
    }
  ]
}
```

- Cada slot já vem com `startsAt`/`endsAt` resolvidos (ISO-8601 com offset). `endsAt - startsAt =
  service.durationMin`. O passo entre slots é o `slotIntervalMin` da empresa.
- Disponibilidade = `jornada (working_hours) − pausas − availability_blocks − appointments ativos`,
  fatiada pelo `slotIntervalMin`, respeitando a duração do serviço (PLANNING §10.2). Profissionais
  `active=false` não têm disponibilidade.
- **Slots no passado não são retornados** (referência: `now()` no fuso da empresa).

> **Availability org-level é aditivo (não no MVP).** O endpoint atual é **por profissional**. A feature
> "qualquer profissional" dos concorrentes (cliente escolhe o serviço sem preferir profissional) será um
> endpoint que **agrega** os profissionais que prestam o serviço — aditivo sobre este. O formato de
> resposta acima (lista de `days[].slots[]`) **não deve** ser moldado de forma que dificulte essa
> agregação futura.

**Erros esperados:** `400 BAD_REQUEST` (data malformada/não-parseável), `422 VALIDATION_ERROR`
(janela > 31 dias — regra semântica), `422 PROFESSIONAL_SERVICE_NOT_LINKED` (profissional não
presta o serviço informado), `404 NOT_FOUND` (profissional/serviço inexistente ou de outro
tenant — não distinguir), `403 AUTHZ_DENIED` (PROFESSIONAL consultando agenda de outro profissional —
escopo de papel, §10.6 do schema).

### 15.2 Público (sem auth, por slug)

| Método | Rota | Rate limit | Idempotência |
|---|---|---|---|
| `GET` | `/public/:orgSlug/professionals/:professionalSlug/availability` | sim (ADR-009) | n/a (leitura) |

Mesmos query params e mesmo formato de resposta de 15.1. O `organization_id` vem do `orgSlug`,
resolvido por `app_resolve_org_by_slug` (ADR-017) — **nunca** do cliente. Sem `Authorization`.
Sujeito ao `RateLimiter` da rota pública (seção 19).

---

## 16. Agendamentos — painel (`appointments`, autenticado)

Todas as rotas exigem `Authorization: Bearer`. Mutações **devem** carregar `Idempotency-Key`
(**obrigatório no painel e no público** — ADR-008 v3, seção 5). Edição/remarcação **deve** carregar
`If-Match: <version>` (optimistic lock — seção 6).

| Método | Rota | Papel | Headers de mutação | Efeito |
|---|---|---|---|---|
| `GET` | `/appointments?from=&to=&professionalId=` | membro (com escopo) | — | janela da agenda (visão diária/semanal) |
| `GET` | `/appointments/:id` | membro (com escopo) | — | um agendamento; devolve `version` (para o `If-Match`) |
| `POST` | `/appointments` | OWNER/MANAGER/PROFESSIONAL (própria) | `Idempotency-Key` | cria **`CONFIRMED`** (ADR-018) + evento `CREATED` (mesma transação) |
| `PATCH` | `/appointments/:id` | OWNER/MANAGER/PROFESSIONAL (própria) | `Idempotency-Key`, `If-Match` | remarca (`startsAt`/`endsAt`) ou edita nota; evento `RESCHEDULED` |
| `POST` | `/appointments/:id/cancel` | OWNER/MANAGER/PROFESSIONAL (própria) | `Idempotency-Key`, `If-Match` | `status=CANCELLED`, `cancelledByType=STAFF`; evento `CANCELLED` |
| `POST` | `/appointments/:id/complete` | OWNER/MANAGER/PROFESSIONAL (própria) | `Idempotency-Key`, `If-Match` | `status=COMPLETED`; evento `COMPLETED` |
| `POST` | `/appointments/:id/no-show` | OWNER/MANAGER/PROFESSIONAL (própria) | `Idempotency-Key`, `If-Match` | `status=NO_SHOW`; evento `NO_SHOW` |

> **Cancelar/completar/no-show são ações (`POST /:id/<ação>`), não `PATCH status`.** Cada uma tem
> pré-condições e efeitos colaterais próprios (preencher `cancelledByType`, gravar o evento certo,
> invalidar token de cancelamento). Modelar como ação explícita evita um `PATCH` genérico que aceitaria
> transições de status inválidas.

### 16.0 Máquina de estados (ADR-018) — a única fonte de pré-condições

Todo agendamento **nasce `CONFIRMED`** no MVP (painel e público). `SCHEDULED` está reservado para a
fase futura de aprovação (habilitar será aditivo: ação `confirm` + linha na matriz).

| De → Para | `CANCELLED` | `COMPLETED` | `NO_SHOW` | remarcar (`PATCH`) |
|---|---|---|---|---|
| `CONFIRMED` | ✅ | ✅ | ✅ | ✅ (mantém `CONFIRMED`) |
| `SCHEDULED` *(futuro)* | ✅ | ❌ | ❌ | ✅ |
| `CANCELLED` / `COMPLETED` / `NO_SHOW` (terminais) | ❌ | ❌ | ❌ | ❌ |

- **Estados terminais são imutáveis.** Retry legítimo da mesma ação é coberto pelo **replay da
  `Idempotency-Key`**; ação fora da matriz → **`409 INVALID_STATUS_TRANSITION`**, validado no service
  **antes** do UPDATE.
- **Sem trava de relógio no MVP** (decisão consciente — ADR-018): `complete`/`no-show` não exigem
  `now() > startsAt`.
- **`CONFIRMED` que ficou no passado (ADR-018 v3):** agendamento cujo `endsAt` já passou e que ninguém
  desfechou **permanece `CONFIRMED`** — sem risco de integridade (`no_overlap` não colide com slot
  passado). O painel o exibe como **"pendente de desfecho"** (rótulo de UI, não estado no enum).
  Auto-complete por job é **pós-MVP** (ADR próprio; alimenta taxa de no-show/ocupação dos relatórios).
- O `shared` exporta a matriz como **constante única** — o front desabilita botões pelo mesmo dado que
  o back valida (§12).
- **Pré-condição de expediente (ADR-022):** além da matriz de status, criar/remarcar revalida
  **jornada + bloqueios** no service (o banco não cobre — §16.1). Público sempre rejeita fora da jornada
  (`422 OUTSIDE_WORKING_HOURS`); painel permite encaixe com `allowOutsideHours: true`.

### 16.1 `POST /appointments` — request

```json
{
  "professionalId": "uuid",
  "serviceId": "uuid",
  "startsAt": "2026-06-10T09:00:00-03:00",
  "client": { "name": "Maria", "phone": "(11) 99999-9999" },
  "note": "Cliente novo",
  "allowOutsideHours": false
}
```

- **Não envia `endsAt`:** o backend deriva de `service.durationMin` (a duração é fonte de verdade do
  serviço, não do cliente — evita o cliente "esticar" o slot). `endsAt = startsAt + durationMin`.
- **Não envia `organizationId`:** vem do vínculo/contexto (seção 3.3).
- **Não envia `clientId`:** o backend faz *upsert* do cliente por `(organizationId, phoneNormalized)`
  — schema §7. `phone` é normalizado para E.164 no backend antes do upsert.
- `source` é definido pelo backend (`PANEL` aqui).
- **`startsAt` deve cair na grade do `slot_interval_min`** da empresa (o mesmo conjunto de instantes que o
  cálculo de disponibilidade geraria). Fora da grade → `422 VALIDATION_ERROR` — senão um POST com `09:07`
  passa pelas demais validações e fragmenta a agenda (o availability nunca mais oferece slots limpos em
  volta). A validação vale no painel **e** no público (§17.2). **Âncora da grade = início da jornada do
  profissional no dia, no fuso da empresa (ADR-023)** — a mesma usada pelo slicing do availability, para
  que availability e POST nunca divirjam (inclusive em dia de DST).
- **Vínculo profissional-serviço:** o backend valida que o profissional presta o serviço informado
  consultando a junção `professional_services` (schema §6.3). Combinação sem vínculo →
  `422 PROFESSIONAL_SERVICE_NOT_LINKED`. Profissional ou serviço inexistente/inativo/de outro tenant
  continua `404 NOT_FOUND` (a validação de vínculo só ocorre após confirmar que ambos existem no
  mesmo tenant).
- **Gate de jornada (ADR-022) — `allowOutsideHours` (default `false`):** o backend revalida que o slot
  cai **dentro da jornada e fora de bloqueios** (o `no_overlap` do banco **não** cobre isso — é validação
  de service). **No painel**, fora da jornada com `allowOutsideHours` ausente/`false` →
  `422 OUTSIDE_WORKING_HOURS`; com **`allowOutsideHours: true`** o **encaixe é permitido** (a equipe tem
  autonomia), o agendamento nasce normal e o evento `CREATED` carrega `metadata.outsideWorkingHours: true`
  (trilha, sem PII). O flag serve de **rede contra erro de digitação** (08:00 no lugar de 18:00) sem tirar
  a liberdade do dono. Dentro de bloqueio datado → `422 WITHIN_BLOCK` (o painel pode sobrepor com o mesmo
  flag, a critério do produto — default rejeita).

### 16.2 `POST /appointments` — response `201`

Devolve o recurso direto (sem envelope `data` — seção 2), já com `version`:

```json
{
  "id": "uuid",
  "professionalId": "uuid",
  "serviceId": "uuid",
  "clientId": "uuid",
  "startsAt": "2026-06-10T09:00:00-03:00",
  "endsAt": "2026-06-10T09:50:00-03:00",
  "status": "CONFIRMED",
  "source": "PANEL",
  "version": 1,
  "client": { "name": "Maria", "phone": "(11) 99999-9999" },
  "note": "Cliente novo",
  "createdAt": "2026-05-31T14:30:00-03:00"
}
```

> **Máscara de telefone na resposta:** se o solicitante não tem permissão de ver telefone (PROFESSIONAL
> fora da própria agenda — PLANNING §4), o campo `client.phone` vem **mascarado** (`(11) ****-9999`) ou
> ausente. A máscara é regra de app (§10.6 do schema), aplicada na borda da serialização.

### 16.3 `PATCH /appointments/:id` — remarcação

```json
{ "startsAt": "2026-06-10T10:00:00-03:00", "note": "Reagendado a pedido" }
```

- Exige `If-Match: <version>`. O `UPDATE` é compare-and-swap (`WHERE id=$1 AND version=$2`).
- **0 linhas afetadas** → `409 APPOINTMENT_VERSION_CONFLICT` (alguém editou antes; o front refaz o fetch
  e reapresenta a `version` nova).
- Remarcação **não muda status** (segue `CONFIRMED`); recalcula `endsAt`; grava `RESCHEDULED` com
  antes/depois no `metadata` do evento — **só IDs e instantes, sem PII** (ADR-010).
- **Remarcação atualiza a expiração do token de cancelamento (B2):** se o agendamento tem
  `public_cancel_token_hash` (origem pública), o `UPDATE` seta `public_cancel_token_expires_at = novo
  startsAt`. Sem isso, remarcar para mais tarde tiraria do cliente o direito de cancelar antes do (novo)
  início, e remarcar para mais cedo deixaria o token válido além do início (schema §8.1).
- **`startsAt` do novo horário também respeita a grade** do `slot_interval_min` (§16.1) → senão
  `422 VALIDATION_ERROR`.
- Novo slot em conflito → `409 APPOINTMENT_CONFLICT`. Fora da jornada → `422 OUTSIDE_WORKING_HOURS`.
  Dentro de bloqueio → `422 WITHIN_BLOCK`. Agendamento em estado terminal → `409 INVALID_STATUS_TRANSITION`.

### 16.4 Erros do domínio de agenda (catálogo na seção 7)

| Situação | Status | `code` |
|---|---|---|
| Slot já ocupado (perdeu a corrida) | `409` | `APPOINTMENT_CONFLICT` |
| Edição concorrente (version velha) | `409` | `APPOINTMENT_VERSION_CONFLICT` |
| Ação sobre estado terminal / fora da matriz | `409` | `INVALID_STATUS_TRANSITION` |
| Fora da jornada de trabalho | `422` | `OUTSIDE_WORKING_HOURS` |
| Dentro de um bloqueio datado | `422` | `WITHIN_BLOCK` |
| Profissional não presta o serviço | `422` | `PROFESSIONAL_SERVICE_NOT_LINKED` |
| `Idempotency-Key` em andamento | `409` | `IDEMPOTENCY_IN_PROGRESS` (+ `Retry-After`) |
| `Idempotency-Key` reusada c/ payload diferente | `409` | `IDEMPOTENCY_KEY_REUSED` |

---

## 17. Página pública — booking sem login (`public-booking`)

Superfície aberta. **Todas** as rotas: sem `Authorization`, `organization_id` resolvido pelo `orgSlug`
via `app_resolve_org_by_slug` (ADR-017), sujeitas ao `RateLimiter` (seção 19), e mutações com
**`Idempotency-Key` obrigatório** (seção 5).

| Método | Rota | Rate limit | Idempotência |
|---|---|---|---|
| `GET` | `/public/:orgSlug` | sim | n/a |
| `GET` | `/public/:orgSlug/professionals` | sim | n/a |
| `GET` | `/public/:orgSlug/professionals/:professionalSlug/availability` | sim | n/a (= seção 15.2) |
| `POST` | `/public/:orgSlug/appointments` | sim (mais estrito) | **obrigatória** |

### 17.1 `GET /public/:orgSlug` — vitrine

```json
{
  "name": "Barbearia do Zé",
  "slug": "barbearia-do-ze",
  "timezone": "America/Sao_Paulo",
  "services": [
    { "id": "uuid", "name": "Corte", "durationMin": 30, "priceCents": 5000, "currency": "BRL" }
  ],
  "professionals": [
    { "slug": "ze", "name": "Zé" }
  ]
}
```

- **Só dados de exibição.** Nunca telefone de cliente, nunca dados de outra empresa, nunca contagem de
  agendamentos. Profissionais/serviços inativos (`active=false`) não aparecem.

### 17.2 `POST /public/:orgSlug/appointments` — request

```json
{
  "professionalSlug": "ze",
  "serviceId": "uuid",
  "startsAt": "2026-06-10T09:00:00-03:00",
  "client": { "name": "Maria", "phone": "(11) 99999-9999" },
  "consent": true
}
```

- `consent: true` **obrigatório** (LGPD — o formulário informa o uso de nome/telefone, PLANNING §13);
  ausente/`false` → `422 VALIDATION_ERROR`.
- `endsAt`, `clientId`, `organizationId`, `source` (=`PUBLIC`) definidos pelo backend.
- Telefone validado fortemente (formato + E.164) — anti-abuso (PLANNING §10.7).
- **Validações temporais (fecham lacuna de abuso/integridade):**
  - **`startsAt` no futuro** (referência: `now()` no fuso da empresa) → senão `422 VALIDATION_ERROR`.
    O availability já filtra o passado, mas é *advisory* (§14) — a validação que vale é a do POST.
  - **Antecedência mínima: 15 min (ADR-024).** `startsAt` < `now() + min_schedule_notice_min` (default
    **15**, no fuso da empresa) → `422 VALIDATION_ERROR`. Sem isso o visitante marca para "daqui a 2 min"
    (abuso + cliente aparece sem o profissional ver). Default **declarado** (constante no `shared`,
    revisável; vira config por empresa depois — aditivo). **Só no público** — o painel é isento (a equipe
    encaixa para agora). Coexiste com o horizonte máximo (fecha o flanco oposto).
  - **Horizonte máximo: 90 dias** à frente → senão `422 VALIDATION_ERROR`. Default **declarado**
    (constante no `shared`, revisável; vira config por empresa quando houver demanda — mudança
    aditiva). Sem teto, um visitante polui a agenda de anos à frente e o rate limit por hora não
    impede o acúmulo ao longo de dias.
  - **`startsAt` na grade do `slot_interval_min`** (§16.1, âncora = início da jornada do dia — ADR-023) →
    senão `422 VALIDATION_ERROR`. A rota pública é a mais exposta a horário arbitrário; o alinhamento
    mantém a agenda fatiável.
  - **Vínculo profissional-serviço:** o backend valida que o profissional presta o serviço informado
    consultando a junção `professional_services`. Combinação sem vínculo →
    `422 PROFESSIONAL_SERVICE_NOT_LINKED` (profissional e serviço existem no mesmo tenant, mas não
    estão vinculados). Profissional ou serviço inexistente/inativo/de outro tenant continua
    `404 NOT_FOUND`.
  - **Dentro da jornada e fora de bloqueios (ADR-022):** o público **sempre rejeita** fora do expediente
    → `422 OUTSIDE_WORKING_HOURS` (ou `422 WITHIN_BLOCK`). **Não há `allowOutsideHours` no público** — só
    o painel encaixa fora da jornada. Gate explícito porque o `no_overlap` do banco não cobre jornada e o
    availability é *advisory*.

### 17.3 `POST /public/:orgSlug/appointments` — response `201`

```json
{
  "id": "uuid",
  "startsAt": "2026-06-10T09:00:00-03:00",
  "endsAt": "2026-06-10T09:50:00-03:00",
  "status": "CONFIRMED",
  "professional": { "name": "Zé" },
  "service": { "name": "Corte", "durationMin": 30 },
  "cancelUrl": "https://app.exemplo.com/cancelar/<token-cru>"
}
```

- **`cancelUrl` contém o token CRU — é a ÚNICA vez que ele aparece.** O banco guarda só o hash
  (`public_cancel_token_hash` — schema §8.1). **Expiração do token = `startsAt`** (pode cancelar até o
  horário começar — schema §8.1) e é uso único. **Não** ecoa telefone na resposta pública (qualquer um
  com o link veria).
- O `version` interno **não** é exposto na rota pública (o cliente não remarca no MVP — PLANNING §5.3).
- A rota `/cancelar/<token>` é **página do front** (o link precisa carregar o token — inevitável);
  o web server aplica **scrubbing de log** nesse path. A **API** nunca recebe o token em path/query (§18).

---

## 18. Cancelamento público por token (`public-booking`)

| Método | Rota | Rate limit | Idempotência |
|---|---|---|---|
| `POST` | `/public/cancel/preview` | sim | n/a (leitura por credencial) |
| `POST` | `/public/cancel` | sim | recomendada |

- **O token viaja no BODY (`{ "token": "<cru>" }`), nunca em path nem query string** (§3.3): path
  aparece em access log de proxy e error tracking igual a query string. `POST` para a preview é
  deliberado — é leitura **por credencial**, e credencial não vai em URL.
- O backend **hasheia** o token (SHA-256) e localiza via `app_resolve_appointment_by_cancel_hash`
  (ADR-017 — não há contexto de tenant antes de achar a linha); em seguida abre `withTenantContext` e
  valida expiração/uso **sob RLS**.
- `preview` → mostra o que será cancelado (serviço, profissional, data — **sem telefone**). Token
  inválido/expirado/já usado → `410` (`CANCEL_TOKEN_INVALID` / `CANCEL_TOKEN_EXPIRED`).
- **Agendamento já em estado terminal (mas com token válido) → `410` (ADR-018 v3):** sem trava de relógio
  (ADR-018), a equipe pode `complete`/`cancel`/`no-show` **antes** do `startsAt`, deixando o token público
  não-expirado. Tanto `preview` quanto `cancel` consultam a matriz de transição e respondem **`410 Gone`**
  ("o link não vale mais") — a superfície pública **não** usa `409 INVALID_STATUS_TRANSITION` (não vaza
  estado interno ao visitante). O caminho do painel mantém o `409`.
- `cancel` → `status=CANCELLED`, `cancelledByType=CLIENT`, **invalida o token** (uso único: limpa hash +
  expiração na mesma transação), grava evento `CANCELLED` (`actorType=CLIENT`, `actorUserId=NULL`).
  Vaga volta a ficar livre automaticamente (sai do `no_overlap`).

---

## 19. Anti-abuso — limites concretos (`RateLimiter`)

A interface `RateLimiter` é trocável (memória no MVP single-instance → Redis no multi-instância —
ADR-006/ADR-009). O **contrato** fixa os limites; a implementação fixa o transporte. Estouro →
`429 RATE_LIMITED` com **`Retry-After`** (seção 4). A interface entra na **Fase 1** (a superfície de
auth a exige — PR-1.4), não na Fase 4.

### 19.1 Rotas públicas

| Rota | Chave | Limite (provisório — revisar com tráfego real) |
|---|---|---|
| `GET /public/:orgSlug*` (leitura) | IP | 60 req / min |
| `POST /public/.../appointments` | IP | 10 req / min |
| `POST /public/.../appointments` | `phoneNormalized` | 5 agend. / hora / telefone |
| `POST /public/cancel` + `/preview` | IP | 20 req / min |

### 19.2 Rotas de auth (ADR-009 emendada — fecha credential stuffing e flooding de e-mail)

| Rota | Chave | Limite (provisório) |
|---|---|---|
| `POST /auth/login` | IP | 10 req / min |
| `POST /auth/login` | e-mail | 5 req / min (backoff progressivo em falhas seguidas) |
| `POST /auth/register` | IP | 3 req / hora |
| `POST /auth/password/forgot` | e-mail | 3 req / hora |
| `POST /auth/password/forgot` | IP | 10 req / hora |
| `POST /auth/refresh` | IP | 30 req / min |
| `POST /auth/verify-email/resend` | usuário | 3 req / hora |
| `POST /auth/accept-invite` | IP | 10 req / hora |

> Cada chamada de `forgot`/`resend`/`invite` custa um envio no Resend — o limite protege custo e
> reputação de envio, além do enumeration/flooding.

### 19.3 Resolução de IP real (pré-requisito — ADR-012)

Chavear por IP só funciona se o IP for **do cliente**. Com o proxy reverso da Opção A:
- NestJS configura **`trust proxy` para exatamente o hop conhecido** (o proxy da web);
  `X-Forwarded-For` é aceito **somente** desse hop — header de qualquer outra origem é descartado
  (anti-spoofing).
- **Fetch das páginas públicas é client-side** (TanStack Query) — o IP que chega ao rate limit é o do
  visitante. Rota pública que precise de SSR (ex.: vitrine para SEO) **propaga o IP do cliente** no
  header confiável, declarado por rota.

> Limites são **defaults declarados**, não verdade absoluta — ajustáveis sem mudar contrato. O ponto é
> que nascem escritos e revisados, não escolhidos sozinhos no controller. Captcha adaptativo fica como
> evolução (PLANNING §10.7).

---

## 20. Cadastros operacionais (Fase 2) — `professionals`, `services`, `working-hours`, `availability-blocks`, `clients`

Todas autenticadas (`Bearer`), papel OWNER/MANAGER (PROFESSIONAL não cadastra). `organization_id` vem
do contexto. Convenções (camelCase, ISO-8601, `priceCents`+`currency`, `404` por tenant) iguais à v1.

### 20.1 `professionals`

| Método | Rota | Papel | Observação |
|---|---|---|---|
| `GET` | `/professionals` | membro | lista (inclui `active`) |
| `POST` | `/professionals` | OWNER/MANAGER | `{ name, slug?, userId? }`; slug gerado do nome se ausente |
| `PATCH` | `/professionals/:id` | OWNER/MANAGER | `name`, `slug`, `active`, `userId` |

- Slug único por empresa, case-insensitive, colisão `-2`/`-3`, lista de reservadas (schema §6.1).
  Geração é **retry-on-conflict**, não check-then-insert (ADR-011) → colisão de corrida vira `409
  SLUG_TAKEN`, nunca `500`.
- **`active=false` não cancela agendamentos futuros** (decisão consciente — schema §6.1): some da
  vitrine e do availability; o painel exibe os existentes e a equipe decide caso a caso.

### 20.2 `services`

| Método | Rota | Papel |
|---|---|---|
| `GET` | `/services` | membro |
| `POST` | `/services` | OWNER/MANAGER — `{ name, durationMin, priceCents, currency? }` |
| `PATCH` | `/services/:id` | OWNER/MANAGER — campos acima + `active` |

- `durationMin > 0`, `priceCents >= 0` (schema §6.2 — o `422 VALIDATION_ERROR` espelha o `CHECK`).

### 20.3 `working-hours` (jornada recorrente, com pausas)

| Método | Rota | Papel |
|---|---|---|
| `GET` | `/professionals/:professionalId/working-hours` | membro |
| `PUT` | `/professionals/:professionalId/working-hours` | OWNER/MANAGER — **substitui** a jornada do profissional |

Request (pausa = múltiplas linhas no mesmo `weekday`):

```json
{
  "shifts": [
    { "weekday": 1, "startTime": "09:00", "endTime": "12:00" },
    { "weekday": 1, "startTime": "13:00", "endTime": "18:00" }
  ]
}
```

- `weekday` 0–6 (0=domingo). `endTime > startTime` → senão `422 VALIDATION_ERROR`.
- Turnos sobrepostos no mesmo dia → **`409 WORKING_HOURS_CONFLICT`**: o banco rejeita via
  `no_shift_overlap` (schema §6.4); o app traduz para esse código com `details` (ADR-015).
- **`PUT` (substituição total) e não `PATCH`:** jornada é um conjunto; editar item a item gera estados
  intermediários inválidos. Substituir tudo numa transação é mais simples e seguro.
- **Mudar a jornada não invalida agendamentos existentes** (schema §6.4): afeta o availability futuro.

### 20.4 `availability-blocks` (exceções datadas)

| Método | Rota | Papel |
|---|---|---|
| `GET` | `/professionals/:professionalId/blocks?from=&to=` | membro |
| `POST` | `/professionals/:professionalId/blocks` | OWNER/MANAGER — `{ startsAt, endsAt, reason? }` |
| `DELETE` | `/professionals/:professionalId/blocks/:id` | OWNER/MANAGER |

- `startsAt`/`endsAt` em `timestamptz` (ISO-8601 com offset); `endsAt > startsAt` (schema §6.5).
- `DELETE` aqui é remoção de **exceção** (não é apagar histórico de agendamento — esse é
  `ON DELETE RESTRICT`/anonimização). Bloqueio não tem trilha de auditoria de domínio no MVP.

### 20.5 `clients` — gestão básica + anonimização LGPD (implementação na Fase 6)

O cliente é entidade central (upsert por telefone, anonimização desenhada no ADR-016) — o contrato
expõe a superfície mínima de operação de balcão e a rota que materializa o direito ao esquecimento.

| Método | Rota | Papel | Observação |
|---|---|---|---|
| `GET` | `/clients?search=&limit=&cursor=` | membro (com escopo de telefone — PLANNING §4) | busca por nome/telefone; paginação por cursor |
| `GET` | `/clients/:id` | membro (com escopo) | dados + referência aos agendamentos |
| `PATCH` | `/clients/:id` | OWNER/MANAGER | corrigir `name`/`phone` (re-normaliza E.164; colisão de telefone → `409` no unique parcial). **Política de nome divergente:** edição pelo painel **atualiza** `name`; o booking público **nunca sobrescreve** o cadastro existente (visitante não reescreve dado de balcão) |
| `POST` | `/clients/:id/anonymize` | OWNER | **direito ao esquecimento (ADR-016 v3):** `name='Cliente removido'`, `phone`/`phoneNormalized` → `NULL`; **`note` dos agendamentos do cliente → `NULL`** (texto livre pode conter PII); grava `CLIENT_ANONYMIZED` em `audit_logs`; **irreversível** (`409` se já anonimizado) |

- **Anonimização, nunca `DELETE`** (schema §7): preserva histórico e integridade (`ON DELETE RESTRICT`).
  O `metadata` não retém PII por construção (ADR-010), mas **`appointments.note` é texto livre** e pode
  conter PII — por isso a anonimização **também zera o `note`** dos agendamentos do cliente, na mesma
  transação (ADR-016 v3). **Princípio LGPD geral:** todo campo de texto livre capaz de conter PII entra no
  scrub de anonimização — vale para `note` hoje e para campos futuros (ex.: `client_notes`).
- **Upsert por telefone (`ON CONFLICT`):** o conflito é contra o **unique parcial**, então a cláusula
  repete o predicado — `ON CONFLICT (organization_id, phone_normalized) WHERE phone_normalized IS NOT
  NULL` (schema §7). Só ocorre quando `phone_normalized IS NOT NULL` (ADR-016).
- Telefone na listagem segue a **máscara por papel** (PROFESSIONAL vê só o dos clientes da própria
  agenda — PLANNING §4).

---

## 21. Mapa atualizado para o `packages/shared`

Estende a seção 12. O `shared` é a materialização TS deste contrato; web/api/mobile **importam**.

| Recurso | Schemas Zod / tipos no `shared` |
|---|---|
| Availability (§15) | `AvailabilityQuery`, `AvailabilitySlotsResponse` (com nota de volatilidade — §14) |
| Appointments painel (§16) | `CreateAppointmentInput` (com `allowOutsideHours?` — ADR-022), `RescheduleInput`, `AppointmentDTO` (com `version`), `AppointmentStatus`, **`APPOINTMENT_TRANSITIONS` (matriz — ADR-018)**, **`alignToSlotGrid()` / `SLOT_GRID_ANCHOR` (ADR-023)** |
| Public booking (§17) | `PublicOrgDTO`, `PublicBookingInput` (com `consent`), `PublicBookingResponse` (com `cancelUrl`), **`MAX_BOOKING_HORIZON_DAYS`**, **`MIN_SCHEDULE_NOTICE_MIN` (=15 — ADR-024)** |
| Public cancel (§18) | `CancelPreviewInput` (`{ token }`), `CancelPreviewDTO` |
| Auth (§8) | `LoginInput`, `RegisterInput`, `AcceptInviteInput`, `SwitchOrgInput`, `PasswordChangeInput`, `MeResponse` (com `activeOrg`), **claims do access (`sub`/`org?`/`sid`) — ADR-020** |
| Cadastros (§20) | `ProfessionalDTO`, `ServiceDTO`, `WorkingHoursInput` (`shifts[]`), `AvailabilityBlockDTO`, **`ClientDTO`** |
| Rate limit (§19) | constantes de limite (públicas **e de auth**) + `RATE_LIMITED` no `ErrorCode` |

---

## 22. Catálogo de `error.code` — adições de agenda/jornada/booking

Estende a seção 7 (cresce de forma aditiva, validado por constante no `shared`):

**Booking público / consentimento:** `CONSENT_REQUIRED` (alternativa a `VALIDATION_ERROR` quando o
`consent` falta — decidir no `shared` se vira código próprio ou fica como `details` de `VALIDATION_ERROR`;
**recomendação: `details` de `VALIDATION_ERROR`**, para não inflar o catálogo). As validações temporais
do §17.2 (passado / horizonte) também ficam como `details` de `VALIDATION_ERROR`.
Os demais códigos de agenda, idempotência, transição de status, auth, convite e org já estão no §7 e
cobrem tudo acima — inclusive os adicionados nesta rodada: `NO_ACTIVE_ORG`, `EMAIL_TAKEN`,
`ALREADY_MEMBER`, `LAST_OWNER`.

---

## 23. Próximo passo

Materializar o `packages/shared` (tipos + schemas Zod das seções 14–22) junto com a Fase 1/2, e os
controllers que produzem estes contratos. O `IMPLEMENTATION_ROADMAP.md` (v3) sequencia isso em PRs.
