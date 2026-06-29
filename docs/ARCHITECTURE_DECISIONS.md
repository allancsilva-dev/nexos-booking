# ARCHITECTURE_DECISIONS — Registro de Decisões (ADR)

> Autoridade única das decisões arquiteturais e operacionais do projeto. O `PLANNING.md` descreve
> **produto e fases**; o `DATABASE_SCHEMA_V2.md` é a verdade do **SQL**; o `API_CONTRACTS.md` é a
> verdade do **HTTP**. Quando uma decisão era marcada "a confirmar" nesses documentos, **a decisão
> fechada mora aqui** — eles apenas referenciam o ADR correspondente.
> Status: **v4 — rev. 1** (rodada de revisão de continuidade — lacunas de agenda/booking). Decisões
> fechadas: **ADR-001 a ADR-026. Nenhuma pendente.** Os espelhos (`PLANNING.md`,
> `DATABASE_SCHEMA_V2.md`, `API_CONTRACTS.md`, `IMPLEMENTATION_ROADMAP.md`,
> `POST_MVP_PRODUCT_ROADMAP.md`) são atualizados a partir desta rodada.

### Changelog v3 → v4 (rodada de continuidade — fecha lacunas que o no_overlap não cobre)

Rodada de revisão crítica antes de abrir o PR-0.1: os documentos estavam silenciosos sobre cinco pontos
que o `no_overlap` (sobreposição) e o availability *advisory* **não** garantem sozinhos. Nenhum invalida
o que estava escrito — todos vão **além do escopo documentado**.

- **ADR-022 (nova) — gate de jornada no agendamento.** O `no_overlap` impede dois agendamentos no mesmo
  horário, mas **não** impede agendar **fora da jornada/bloqueios** (impossível como `EXCLUDE`). A rota
  pública não tinha esse gate escrito → um POST na grade, no futuro, no horizonte, mas às 03:00 (dia
  fechado) **passava**. **Público sempre rejeita** (`422 OUTSIDE_WORKING_HOURS`); **painel permite encaixe
  fora da jornada** (decisão de negócio — o dono manda), com aviso não-bloqueante + `allowOutsideHours`
  explícito + marca no evento (`outsideWorkingHours`).
- **ADR-023 (nova) — âncora da grade de slots + coerência POST↔availability.** "Alinhar `startsAt` à
  grade" estava sem **âncora** definida (meia-noite? início da jornada?), o que diverge sob DST. Âncora
  fixada: **início da jornada do profissional no dia, no fuso da empresa**, como constante única no
  `shared`. Gate de DST ganha teste de **coerência** (todo slot do availability passa na validação de
  grade do POST). `slot_interval_min` (passo) **continua config por empresa** e independente da duração do
  serviço (o passo = duração é caso particular, não regra fixa).
- **ADR-024 (nova) — antecedência mínima de agendamento público.** Sem `min_schedule_notice`, o visitante
  marcava para "daqui a 2 min" (abuso + má experiência). Default **15 min**, constante no `shared`,
  revisável, vira config por empresa depois — mesmo tipo de validação temporal do horizonte de 90 dias.
  Painel isento (a equipe encaixa agora). Registra também a **fraqueza do limite por telefone** (posse não
  provada no MVP) e o efeito **CGNAT** no Brasil sobre o limite por IP.
- **ADR-025 (nova) — sem soft-hold no MVP (decisão explícita).** A corrida resolve **no commit**
  (`409 APPOINTMENT_CONFLICT` + refetch), sem reserva temporária de slot. Vira decisão escrita (era
  ausência silenciosa); hold é aditivo futuro.
- **ADR-026 (nova) — abstração de notificação transacional.** A interface nasce como
  `NotificationSender` (não "EmailSender"); Resend é a 1ª impl. WhatsApp/SMS entram aditivos — mesma
  lógica do `RateLimiter`/publisher trocáveis. Relevante no público BR (barbearia/salão vive no WhatsApp,
  não no e-mail).

**Formato:** cada decisão tem Status (`Aceita` / `Aceita — fecha "a confirmar"` / `Substituída`),
Contexto (o porquê), Decisão (o quê) e Consequências (o que muda na prática). Numeração estável e
aditiva — decisão revista não é apagada, é marcada `Substituída por ADR-NNN`.

### Changelog v1 → v2 (rodada de revisão pré-código)

- **ADR-012 FECHADA: Opção A (same-origin via proxy reverso)** — inclui agora a resolução de IP real
  atrás do proxy (`trust proxy` + `X-Forwarded-For` só do hop conhecido), pré-requisito do rate limit
  por IP funcionar.
- **ADR-017 (nova):** acessos fora do contexto de tenant sob `FORCE RLS` — fecha o furo estrutural dos
  três fluxos que não tinham caminho (resolução de slug público, lookup de token de cancelamento,
  jobs de sistema cross-tenant) + policy de INSERT global do `audit_logs`.
- **ADR-018 (nova):** máquina de estados de `appointments` — transições válidas escritas;
  agendamento **nasce `CONFIRMED`** no MVP; novo código `409 INVALID_STATUS_TRANSITION`.
- **ADR-019 (nova):** convite de equipe via tabela `invitations` — fecha o fluxo que estava pela
  metade (não havia aceite nem caminho para convidado sem conta).
- **ADR-004 emendada:** logout revoga **a família da sessão apresentada**, não todas as sessões
  (revogação total fica para reset de senha e `DISABLED`).
- **ADR-008 emendada:** takeover de `IN_PROGRESS` órfão é **compare-and-swap atômico** (fecha corrida
  entre duas retries pós-TTL).
- **ADR-009 emendada:** limites de rate limit estendidos à superfície de **auth** (login, register,
  forgot, refresh) — estava coberta só a rota pública de booking.
- **ADR-014 emendada:** leitura do relay com **`FOR UPDATE SKIP LOCKED`** (multi-instância-safe de
  graça, sem custo no single-instance).

### Changelog v2 → v3 (rodada de revisão pré-código 2 — fecha A1/A2/A3 e bordas)

- **ADR-020 (nova):** resolução de **tenant ativo** via claim `org` no access token + `sid` (família
  da sessão); rota `POST /auth/switch-org`; estado "sem empresa ativa" para vínculo múltiplo. Fecha o
  **furo estrutural A1** (rotas operacionais sem `organization_id` para usuário multi-org) **e o bug de
  contrato A2** (logout não enxergava a família, pelo `Path` estreito do cookie). Bloqueava o PR-1.4.
- **ADR-004 emendada (v3):** logout passa a ser **Bearer-only via `sid`** (não depende mais do cookie);
  formaliza `POST /auth/password/change` (autenticado) revogando todas as famílias **exceto a atual**.
- **ADR-008 emendada (v3):** `Idempotency-Key` passa a **obrigatória também no painel** (não só no
  público) — elimina a classe de duplicação por duplo-clique da recepcionista, custo zero (o cliente
  HTTP do `shared` já injeta o header — PR-1.7).
- **ADR-012 emendada (v3):** mecanismo de CSRF de `/auth/refresh` **fixado**: header custom obrigatório
  (`X-CSRF: 1`), sem estado; double-submit clássico descartado (redundante sob `SameSite=Strict`).
- **ADR-016 emendada (v3):** a anonimização LGPD **também limpa `appointments.note`** dos agendamentos
  do cliente (texto livre fora do `metadata` JSONB do ADR-010); o esquecimento de **staff (`users`)**
  fica como limitação documentada do MVP (sem caminho de exclusão de conta).
- **ADR-010 emendada (v3):** correção do "anonimizar a linha basta" — vale para o `metadata` JSONB
  (sem PII por construção), mas `appointments.note` é coluna de texto livre e exige scrub explícito
  (ADR-016).
- **ADR-018 emendada (v3):** cancelamento **público** sobre agendamento já em estado terminal responde
  **`410 Gone`** (para o cliente, "o link não vale mais"), não `409` — a superfície pública não vaza
  estado interno. O caminho do painel mantém `409 INVALID_STATUS_TRANSITION`.

> Esta rodada também carrega correções pontuais de schema/contrato espelhadas nos outros quatro
> documentos (não exigem ADR próprio): unique parcial de `professionals (org, user_id)`; expiração do
> cancel token na remarcação; invariante do último OWNER (`409 LAST_OWNER`); padronização `400
> BAD_REQUEST` (malformação) vs `422 VALIDATION_ERROR` (semântica) + códigos `EMAIL_TAKEN` /
> `ALREADY_MEMBER`; alinhamento de `startsAt` à grade do `slot_interval_min`; predicado do `ON CONFLICT`
> no upsert de cliente; gancho de kick de socket sob revogação/DISABLED.

### Changelog v3 — rev. 2 (revisão pré-código 3 — fechamento final antes do PR-0.1)

- **ADR-018 emendada:** ciclo de vida do **`CONFIRMED` que ficou no passado** — permanece `CONFIRMED`
  (sem risco no `no_overlap`), painel mostra "pendente de desfecho", auto-complete por job é pós-MVP.
- **Gate de DST (PLANNING §16 + PR-3.1):** teste/fixture de disponibilidade em dia de transição com fuso
  DST-ativo (`organizations.timezone` aceita qualquer IANA).
- **Busca de cliente por nome (schema §7 + PR-6.3):** GIN + `pg_trgm` na migration da Fase 6 (`ILIKE`
  não usa btree) — registrado para não nascer com seq scan.
- **Higiene de fonte única:** este arquivo é o **único** `ARCHITECTURE_DECISIONS.md` canônico (v3) —
  substitui o antigo v2 e o `ARCHITECTURE_DECISIONS_1.md`; `PATCHES_PLANNING_E_SCHEMA.md` está aplicado e
  deve ser arquivado. Referências de versão internas dos espelhos corrigidas.

---

## ADR-001 — Multi-tenant por `organization_id` com RLS como defesa em profundidade
**Status:** Aceita.
**Contexto:** vazamento entre tenants (um `WHERE organization_id` esquecido em repository novo) é risco
crítico (PLANNING §15.5). Guard de aplicação sozinho é frágil.
**Decisão:** isolamento por `organization_id` em toda tabela operacional + RLS (`ENABLE` + `FORCE`) com
contexto por transação (`SET LOCAL app.current_organization_id`/`current_user_id`). App conecta com role
**sem `BYPASSRLS`**. Acesso ao banco só via `db.withTenantContext(orgId, userId, fn)`.
**Consequências:** três camadas (guard → RLS → FK composta). Sem contexto, a RLS nega tudo (default
seguro). Escopo fino de papel (PROFESSIONAL/máscara de telefone) fica no app, não na RLS (schema §10.6).
Os caminhos que legitimamente operam **fora** do contexto de tenant (lookup público, jobs) são
definidos em **ADR-017** — nenhum acesso contorna a RLS de forma implícita. **De onde vem o `orgId` do
caminho autenticado quando o usuário tem vínculo em N empresas:** ADR-020 (claim `org`).

## ADR-002 — PostgreSQL como fonte única de integridade
**Status:** Aceita.
**Contexto:** anti-conflito e tenant-safety não podem depender do front nem só do service.
**Decisão:** o banco garante invariantes via `EXCLUDE USING gist` (`no_overlap`, `no_shift_overlap`),
`CHECK` semânticos e FKs compostas tenant-safe. Instantes em `timestamptz`.
**Consequências:** corrida perde na constraint, não em lógica de app. Migrations precisam aplicar a
sequência completa do zero (gate de CI).

## ADR-003 — Migrations: Drizzle (tabelas comuns) + SQL manual (DDL avançado)
**Status:** Aceita.
**Contexto:** `drizzle-kit generate` não gera `EXCLUDE`, `RANGE` customizado (`timerange`), funções
`SECURITY DEFINER`, RLS, índices `gist`/parciais nem FKs compostas.
**Decisão:** tabelas/colunas/FKs simples/UNIQUE/btree pelo Drizzle; o resto em migrations SQL versionadas
à mão (ordem 0001–0006, schema §12).
**Consequências:** o gate "aplica do zero" valida Drizzle + manuais juntos. Ver ADR-007 (forward-only).

## ADR-004 — Auth: access em memória + refresh rotativo httpOnly + sessões revogáveis
**Status:** Aceita — **emendada na v2 (escopo do logout) e na v3 (logout Bearer-only + troca de senha)**.
**Contexto:** JWT puro não revoga; o produto exige derrubar acesso (logout, `DISABLED`, troca de senha).
**Decisão:** access curto (5–15 min, `Bearer`, em memória no front); refresh rotativo em cookie
`httpOnly`+`Secure`+`SameSite`+`Path`; `refresh_sessions` rastreia hash/`family_id`/`revoked_at`;
detecção de reuso revoga a família. Mobile usa refresh em secure storage como `Bearer` (mesmo contrato).
**Escopo de revogação (emenda v2):**
- **`POST /auth/logout` revoga apenas a família da sessão apresentada.** Logout no celular **não**
  derruba o desktop — comportamento errado para o usuário e desnecessário para a segurança.
- **Revogação total** (todas as sessões do usuário) fica reservada para **reset de senha** e
  **`DISABLED`**, onde é semanticamente correta. "Sair de todos os dispositivos" (`/auth/logout-all`)
  é evolução futura, aditiva.
**Identificação da família e troca de senha (emenda v3):**
- O logout **não pode** depender do cookie de refresh para saber qual família revogar: o cookie tem
  `Path=/api/v1/auth/refresh` (ADR-012) e **não viaja** para `/api/v1/auth/logout`. Logout passa a ser
  **Bearer-only**, lendo o **`sid`** (= `family_id`) do access token (ADR-020) e revogando aquela
  família. O `Path` estreito do cookie permanece intacto.
- **`POST /auth/password/change` (autenticado, `Bearer`):** `{ currentPassword, newPassword }`. Valida a
  senha atual, troca o hash (argon2id) e **revoga todas as famílias do usuário exceto a atual** (a do
  `sid` apresentado) — trocar a própria senha não deve deslogar a sessão que está fazendo a troca. Sem
  essa rota, o usuário logado só conseguia trocar a senha pelo fluxo de e-mail (forgot/reset), o que era
  uma lacuna real (a rota cabe no PR-1.5). Reset por e-mail continua revogando **todas** as sessões
  (não há sessão "atual" confiável nesse fluxo).
**Consequências:** CSRF concentrado em `/auth/refresh` (mecanismo fixado na ADR-012). O `sid` no access
(ADR-020) é o que torna logout e `password/change` implementáveis sem o cookie, e ainda correlaciona
`audit_logs` por sessão e habilita o kick de socket sob revogação/`DISABLED` (PLANNING §11).

## ADR-005 — Real-time: outbox transacional + WebSocket como invalidação (não fonte de verdade)
**Status:** Aceita.
**Contexto:** evento de domínio não pode se perder se o processo cair entre commit e publish; e PII não
pode trafegar no socket (LGPD).
**Decisão:** `appointment_events` grava na mesma transação (outbox: `published_at`); relay publica os
pendentes (at-least-once). Payload do socket é só invalidação (`appointment.changed` com
`professionalId`, `date`, `version`/`occurredAt`) — **sem PII**; o front refaz o fetch via HTTP. Ao
reconectar, o front **sempre** recupera o estado via HTTP.
**Consequências:** publicação in-process (EventEmitter) é o caminho rápido; o relay é a rede de
segurança. A entrega cross-instância depende de ADR-006. Política de falha do relay em ADR-014. O
relay opera cross-tenant sob o **contexto de sistema** do ADR-017. **Ciclo de vida da conexão sob
revogação:** o handshake valida JWT + vínculo no connect, mas a conexão sobrevive ao access curto e à
revogação — o gancho de kick (derrubar sockets do usuário ao revogar/`DISABLED`, via `sid` do ADR-020)
é especificado no PLANNING §11 e implementado na Fase 5 (ROADMAP PR-5.2).

## ADR-006 — Topologia: single-instance declarada no MVP
**Status:** Aceita — fecha "a confirmar" (PLANNING §13/§17.4).
**Contexto:** rate limit em memória e publicação real-time in-process (EventEmitter) **só funcionam com
uma instância**. Com duas (inclusive no overlap de um deploy zero-downtime), o rate limit vira
contornável e um WebSocket conectado na instância A **não recebe** o evento publicado na instância B.
Isso não é decisão de Fase 4 — afeta o desenho do real-time desde a Fase 1.
**Decisão:** o MVP roda **single-instance** como **restrição declarada**. Consequentemente:
(a) `RateLimiter` em memória é aceitável **agora**; (b) EventEmitter in-process é suficiente **agora**;
(c) **deploy é com drain/janela** (não zero-downtime com duas instâncias simultâneas) enquanto for
single-instance. O `RateLimiter` e o publisher nascem como **interfaces trocáveis** (PLANNING §6/§10.7,
§11) para que a migração não toque controller nem regra de negócio.
**Consequências — quando escalar (fase futura, NÃO no MVP):** subir Redis traz, juntos:
(1) rate limit distribuído, (2) pub/sub do real-time entre instâncias, (3) cache. Só então o deploy vira
zero-downtime multi-instância. Trocar antes é otimização prematura; assumir multi-instância sem Redis é
bug silencioso. A restrição precisa estar **escrita** — é esta linha.

## ADR-007 — Migrations forward-only + PITR (sem `down`)
**Status:** Aceita — fecha "a confirmar" (PLANNING §13/§17.4).
**Contexto:** migrations `down` quase nunca são testadas e dão falsa rede de segurança.
**Decisão:** **forward-only**. Sem migration destrutiva em produção: mudança incompatível usa
**expand/contract** (deploy em duas fases — adiciona, migra dado, só depois remove o antigo). Recuperação
de desastre é por **point-in-time recovery** do provedor (pré-requisito de produção, não item de schema).
**Consequências:** nunca quebrar o schema antigo de um deploy ativo. Backup/PITR habilitado é gate de
produção. A 1ª migration ruim tem caminho de volta via PITR, não via `down` improvisado.

## ADR-008 — Idempotência `IN_PROGRESS`: 409 imediato + TTL curto de órfão (60s) + replay fiel
**Status:** Aceita — fecha "a confirmar" (schema §9.1, API_CONTRACTS §5). **Emendada na v2 (takeover atômico) e na v3 (obrigatória no painel).**
**Contexto:** segurar a thread esperando a 1ª requisição terminar esgota o pool sob retry storm; mas uma
linha `IN_PROGRESS` órfã (processo caiu) travaria toda retry até `expires_at` (horas).
**Decisão:**
- 2ª requisição com chave `IN_PROGRESS` → **`409 IDEMPOTENCY_IN_PROGRESS` na hora**, com `Retry-After`
  (não bloqueia).
- **TTL de in-progress = 60s**, calculado a partir de `created_at`, **independente** do `expires_at` do
  replay. Passado o TTL sem virar `COMPLETED`/`FAILED`, a linha é considerada abandonada e a chave volta
  a aceitar execução. Não exige coluna nova (`created_at` basta).
- **Takeover atômico (emenda v2):** retomar uma linha órfã é um **compare-and-swap** —
  `UPDATE idempotency_keys SET created_at = now(), request_hash = $hash WHERE id = $id AND
  state = 'IN_PROGRESS' AND created_at < now() - interval '60 seconds'`. **Só a requisição que afetou
  1 linha executa**; as demais recebem `409 IDEMPOTENCY_IN_PROGRESS`. Sem o CAS, duas retries chegando
  após o TTL considerariam ambas a linha órfã e executariam em dobro.
- **Replay fiel:** mesma chave + mesmo `request_hash` → devolve o **mesmo body E o mesmo
  `response_status_code`** da 1ª execução. Sem o status, um `409`/`422` tratado voltaria como `200`.
- Mesma chave + `request_hash` diferente → `409 IDEMPOTENCY_KEY_REUSED`.
- **`Idempotency-Key` obrigatória também no painel (emenda v3):** era "obrigatória no público,
  recomendada no painel". "Recomendada" em contrato vira "esquecida" em código — e o duplo-clique da
  recepcionista é o cenário **mais** provável de duplicação, não o menos. Como o cliente HTTP do
  `shared` injeta a chave por padrão (PR-1.7), torná-la obrigatória nas mutações do painel custa zero e
  fecha a classe inteira. Espelhado em API §5/§16.
**Consequências:** cliente nervoso/rede oscilando não trava nem duplica — nem no caminho do órfão.
Limpeza geral por `expires_at` segue como job periódico (rede de segurança, não o mecanismo de
recuperação de órfão), rodando sob o contexto de sistema do ADR-017.

## ADR-009 — `RateLimiter` como interface + limites concretos (públicos E de auth)
**Status:** Aceita (números provisórios, revisáveis). **Emendada na v2 (superfície de auth).**
**Contexto:** "anti-abuso" sem números não é implementável; o transporte (memória/Redis) muda com a
topologia (ADR-006). **E a superfície de auth estava descoberta:** `/auth/login` sem limite é
credential stuffing barato; `/auth/password/forgot` sem limite é flooding de e-mail (cada chamada custa
um envio no Resend).
**Decisão:** interface `RateLimiter` injetada nas rotas **públicas e de auth**; impl em memória no MVP.
Limites concretos versionados no `API_CONTRACTS.md` §19 — booking público (ex.: 10 POST/min por IP,
5 agend./hora por telefone) **e auth** (ex.: login 10/min por IP + 5/min por e-mail; register 3/hora por
IP; forgot 3/hora por e-mail; refresh 30/min por IP). Estouro → `429 RATE_LIMITED` + `Retry-After`.
**Consequências:** limites nascem escritos e revisados, não escolhidos no controller. A interface entra
na **Fase 1** (auth a exige), não na Fase 4 — o roadmap reflete isso (PR-1.4). Troca por Redis na fase
de escala não toca o controller. O rate limit por IP **pressupõe a resolução de IP real do ADR-012**.

## ADR-010 — `metadata` (JSONB) carrega referências, nunca PII
**Status:** Aceita — fecha lacuna de LGPD. **Emendada na v3 (escopo: `metadata` ≠ `note`).**
**Contexto:** o direito ao esquecimento anonimiza `clients`, mas `appointment_events.metadata` e
`audit_logs.metadata` (antes/depois de remarcação, motivo, origem) poderiam conter nome/telefone — e
varrer JSONB no esquecimento é frágil.
**Decisão:** `metadata` guarda **somente referências e instantes** (IDs, `version`, `startsAt`/`endsAt`,
`reason` curto sem PII), **nunca** nome/telefone cru. Telefone, quando referenciado em log, vai mascarado.
**Escopo do "anonimizar a linha basta" (emenda v3):** a afirmação vale para o `metadata` JSONB (sem PII
por construção) — mas **não** cobre `appointments.note`, que é **coluna de texto livre** escrita pela
equipe ("Maria prefere franja…") e pode conter PII do cliente. Logo, anonimizar só a linha de `clients`
**não basta** enquanto `note` existir. O scrub de `note` na anonimização é decidido na **ADR-016**.
**Consequências:** anonimizar o `clients` + scrub de `note` (ADR-016) é suficiente para o esquecimento —
o JSONB não retém PII por construção e o texto livre é limpo explicitamente. Auditoria continua
respondendo "quem/quando/o quê" via IDs. Regra espelhada no schema §8.2/§9.2.

## ADR-011 — Geração de slug é retry-on-conflict (não check-then-insert)
**Status:** Aceita.
**Contexto:** dois `register`/criações simultâneas com o mesmo nome geram o mesmo slug-base; um
check-then-insert tem janela de corrida e o 2º vira `500` ao bater no `UNIQUE`.
**Decisão:** gerar slug candidato e **tentar inserir**; conflito de unique → incrementar sufixo
(`-2`, `-3`) e retentar (teto de tentativas). Colisão real esgotada → `409 SLUG_TAKEN`; reservada →
`422 SLUG_RESERVED`. O `UNIQUE (lower(slug))` é a verdade; a aplicação reage a ele.
**Consequências:** corrida de slug nunca vira `500`. Vale para slug de empresa (global) e de
profissional (por empresa).

## ADR-012 — Cookie de refresh web↔api: same-origin via proxy reverso (Opção A) + IP real
**Status:** **Aceita — FECHADA (Opção A).** Era a única pendência da rodada anterior. **Emendada na v3 (mecanismo de CSRF fixado).**
**Contexto:** se `web` (`app.exemplo.com`) e `api` (`api.exemplo.com`) ficam em hosts diferentes, o
cookie `httpOnly` de refresh com `SameSite=Strict` **não** acompanha requisições cross-site; CORS com
credenciais exige origem explícita. Funciona em `localhost` e quebra no deploy se ficar implícito.
Além disso, **todo o rate limit por IP (ADR-009) depende de saber o IP real do cliente atrás do proxy** —
sem isso, ou todos os visitantes compartilham o IP do proxy (o site se auto-throttla) ou o atacante
forja `X-Forwarded-For` e o limite vira decorativo.
**Decisão:**
- **Opção A — same-origin via proxy reverso:** a web serve `/api/*` no mesmo host (proxy para o
  NestJS). Cookie same-site puro (`SameSite=Strict`), CSRF só na `/auth/refresh`, **sem CORS**.
  Combina com a topologia single-instance (ADR-006). *(Opção B — mesmo eTLD+1 com
  `Domain=.exemplo.com` + `SameSite=Lax` — registrada como alternativa caso a infra futura exija
  hosts separados; mudar exigirá revisitar cookie + CORS + CSRF.)*
- **Resolução de IP real (parte da decisão, não detalhe):** o NestJS configura `trust proxy` para
  **exatamente o hop conhecido** (o proxy da web); `X-Forwarded-For` é aceito **somente** desse hop —
  header vindo de qualquer outra origem é descartado (anti-spoofing). O `RateLimiter` chaveia pelo IP
  assim resolvido.
- **Fetch das páginas públicas é client-side:** availability e booking são chamados pelo browser
  (TanStack Query), não por SSR — assim o IP que chega ao rate limit é o do visitante. Se alguma rota
  pública precisar de SSR (ex.: vitrine para SEO), o fetch server-side **propaga o IP do cliente** no
  header confiável; isso fica declarado por rota.
- **Cookie:** `Path=/api/v1/auth/refresh` (estreito — o cookie só viaja para a rota de refresh).
  Consequência consciente: um bump para `/api/v2` exige reemissão do cookie, que acontece naturalmente
  no próximo login/refresh — evento planejado, não bug.
- **Mecanismo de CSRF (emenda v3):** com same-origin + cookie de refresh `SameSite=Strict`, um POST
  **cross-site** para `/auth/refresh` **nem carrega** o cookie — o CSRF clássico já está em grande parte
  neutralizado pela própria `SameSite=Strict`. Como **defesa em profundidade sem estado**, a
  `/auth/refresh` **exige um header custom fixo** — `X-CSRF: 1` — que `<form>` HTML não consegue enviar
  (só `fetch`/`XHR` same-origin). **Não** se adota double-submit com cookie-token (acrescentaria um
  cookie e estado sem ganho real nesta topologia). Decisão: header custom obrigatório; ausência → `403`.
  Isso evita que o PR-1.4 escolha o mecanismo sozinho no controller.
**Consequências:** define a config de cookie e a topologia de deploy da Fase 1 (a web é o entrypoint
que faz proxy do Nest). Mobile não usa cookie (refresh como `Bearer` em secure storage — ADR-004).
Destrava o PR-1.4 (junto da ADR-020, que define os claims do token).

## ADR-013 — Disponibilidade é *advisory*; a verdade é a constraint
**Status:** Aceita — espelha `API_CONTRACTS.md` §14.
**Contexto:** entre `GET /availability` e `POST /appointments` o slot pode ser tomado. Tratar a lista como
garantia esconde corrida em forma de bug de UI.
**Decisão:** a resposta de availability é projeção volátil; a reserva só é verdade no INSERT (vence/perde
no `no_overlap`). `409 APPOINTMENT_CONFLICT` é fluxo normal: o front mostra mensagem amigável e refaz o
`GET /availability`.
**Consequências:** o tipo no `shared` nomeia/comenta a volatilidade. Casa com o real-time (invalida →
refetch). **Integridade da grade:** como o availability é só sugestão, a validação que vale é a do POST —
e ela inclui o **alinhamento de `startsAt` à grade do `slot_interval_min`** (senão um POST com horário
fora da grade fragmenta a agenda); regra espelhada em API §16.1/§17.2.

## ADR-014 — Dead-letter do outbox: teto de tentativas + estado terminal + alerta
**Status:** Aceita — fecha lacuna do relay. **Emendada na v2 (`SKIP LOCKED`).**
**Contexto:** `appointment_events` tem `publish_attempts`/`last_publish_error`, mas sem teto um evento que
falha publicação para sempre fica varrendo o índice parcial de pendentes (envenena a leitura do relay).
**Decisão:** o relay usa backoff (alinhado ao princípio de resiliência — retry com espera crescente).
Atingido o **teto de tentativas** (ex.: 10), o evento sai do conjunto "pendente" para um **estado
terminal de falha** e **dispara alerta** (error tracking). Implementação mínima: uma coluna
`publish_failed_at timestamptz` (NULL = ainda elegível); o índice parcial de pendentes passa a ser
`WHERE published_at IS NULL AND publish_failed_at IS NULL`.
**Leitura do relay (emenda):** o `SELECT` de pendentes usa **`FOR UPDATE SKIP LOCKED`**. Custa uma
cláusula no single-instance e torna o relay seguro para múltiplos workers/instâncias **de graça** quando
a fase de escala chegar — solução definitiva em vez de retrabalho futuro.
**Consequências:** o índice de pendentes não cresce com lixo; falha persistente vira alerta, não
varredura infinita. Como o real-time não é fonte de verdade (ADR-005), um evento dead-lettered não
corrompe estado — o front recupera via HTTP ao reconectar; o alerta existe para investigar a causa.
O relay roda sob o contexto de sistema (ADR-017).

## ADR-015 — Conflito de jornada padronizado como `409 WORKING_HOURS_CONFLICT`
**Status:** Aceita — fecha ambiguidade (estava "422 ou 409").
**Contexto:** turnos sobrepostos no mesmo `weekday` violam `no_shift_overlap` (schema §6.4). Deixar o
código de erro em aberto vira divergência entre backend, front e `shared`.
**Decisão:** sobreposição de jornada é **conflito de regra de negócio**, não erro de formato → código
**`409 WORKING_HOURS_CONFLICT`**, com `details` campo a campo. Mesma família semântica do
`409 APPOINTMENT_CONFLICT` da agenda. Entra no catálogo de `error.code` (API §7).
**Consequências:** front e `shared` tratam um código estável. `422` fica reservado para validação
semântica de formato (ex.: `endTime <= startTime`).

## ADR-016 — `clients.phone_normalized` NULLABLE + unique parcial (anonimização sem colisão)
**Status:** Aceita — corrige bug de integridade vs. LGPD. **Emendada na v3 (scrub de `note` + lacuna de `users`).**
**Contexto:** o direito ao esquecimento (PLANNING §13, schema §7) anonimiza o cliente trocando o telefone
por valor neutro. Com `phone_normalized NOT NULL` + `UNIQUE (organization_id, phone_normalized)`,
anonimizar dois clientes na mesma empresa geraria dois valores neutros iguais → **violação do unique**.
**Decisão:** `phone_normalized` é **NULLABLE**; o unique vira **parcial**
(`WHERE phone_normalized IS NOT NULL`). Anonimização seta `phone`/`phone_normalized` para `NULL`;
clientes anonimizados não colidem entre si. O upsert de cliente por telefone só ocorre quando o telefone
existe.
**Escopo do esquecimento (emenda v3):**
- **`appointments.note` entra na anonimização:** na mesma transação que anonimiza o `clients`, o serviço
  **seta `note = NULL`** em todos os `appointments` daquele cliente. `note` é texto livre e pode conter
  PII (ADR-010) — sem este passo, o esquecimento seria incompleto. (Alternativa rejeitada: declarar
  `note` "campo sem PII" com aviso na UI — frágil, depende de disciplina do operador.)
- **`users` (staff) fora do MVP:** o direito ao esquecimento de membros da equipe (`users` tem
  nome/e-mail/telefone) **não** tem caminho no MVP — encerramento/anonimização de conta de staff fica
  como **limitação documentada** da fase de retenção (PLANNING §13), não como funcionalidade. Registrado
  para não passar por resolvido.
**Consequências:** anonimização real sem gambiarra, histórico preservado (`ON DELETE RESTRICT` +
anonimização, nunca `DELETE` físico). Espelhado no schema §7 e na migration 0003 (unique parcial). A
rota que executa a anonimização está no contrato (API §20.5), com implementação na Fase 6 (agora também
limpando `note`).

## ADR-017 — Acessos fora do contexto de tenant sob `FORCE RLS` (resolvers + contexto de sistema)
**Status:** Aceita — **fecha furo estrutural** identificado na revisão pré-código.
**Contexto:** a RLS foi especificada com rigor para o caminho tenant-scoped (GUC → policy), mas três
fluxos legítimos **precisam operar antes de existir contexto de tenant ou através de todos os tenants**,
e nenhum documento definia o caminho. Com `FORCE RLS` + role sem `BYPASSRLS`, como especificado, eles
simplesmente não funcionam:
1. **Resolução de slug na rota pública (chicken-and-egg):** `GET /public/:orgSlug` precisa ler
   `organizations` por slug para descobrir o `organization_id` do `SET LOCAL` — mas a policy nega a
   linha justamente porque o GUC ainda não existe.
2. **Lookup por credencial pública:** cancelamento por token (e aceite de convite — ADR-019) busca a
   linha pelo **hash do token**, sem saber a empresa — a policy de tenant nega.
3. **Jobs de sistema cross-tenant:** o relay do outbox varre `appointment_events` pendentes **de todas
   as empresas**; a limpeza varre `idempotency_keys`/`invitations` por `expires_at`. RLS estrita por
   tenant ⇒ os jobs leem zero linhas.
Além disso, o INSERT de eventos **globais** de `audit_logs` (`organization_id IS NULL`, ex.:
`LOGIN_FAILED`) estava resolvido só "de passagem" no schema — e é a primeira coisa que a Fase 1 grava.
**Decisão:**
- **Lookups públicos via funções `SECURITY DEFINER` estreitas** (mesmo padrão já estabelecido pela
  `app_is_member`): `app_resolve_org_by_slug(text)`, `app_resolve_appointment_by_cancel_hash(text)` e
  `app_resolve_invitation_by_hash(text)`. Cada uma devolve **só os IDs mínimos** (org + recurso); o app
  então abre `withTenantContext(orgId, ...)` e lê a linha completa **sob RLS normal**. A janela
  privilegiada é mínima, indexada e auditável. `STABLE`, `SET search_path = public`,
  `REVOKE FROM PUBLIC`, `GRANT EXECUTE TO app_runtime` (schema §10.7).
- **Contexto de sistema para jobs:** GUC `app.is_system`, setado **somente** por
  `db.withSystemContext(fn)` (irmão do `withTenantContext`, de uso restrito a relay e jobs de limpeza —
  lint/review barra uso fora desses módulos). As policies de `appointment_events`, `idempotency_keys` e
  `invitations` ganham `OR current_setting('app.is_system', true)::boolean` (schema §10.8). Dentro do
  modelo de ameaça da RLS aqui — proteger contra `WHERE` esquecido, **não** contra app comprometido
  (o app já controla os GUCs) — isso não enfraquece a defesa e evita uma segunda role/conexão.
- **`audit_logs` global:** policy explícita
  `CREATE POLICY global_security_events ON audit_logs FOR INSERT WITH CHECK (organization_id IS NULL)`
  na migration 0006. Leitura de linhas globais **não** tem policy (invisíveis ao app por design —
  acesso operacional só via role privilegiada).
- **Alternativas rejeitadas:** role `app_jobs` com `BYPASSRLS` (mais provisionamento, mais credencial,
  sem ganho no modelo de ameaça); relay iterando por org (varredura O(orgs), quebra o índice global de
  pendentes); afrouxar a RLS das tabelas públicas (abre mão da defesa em profundidade no caminho
  normal).
**Consequências:** os três fluxos passam a ter caminho **explícito e estreito** — nada contorna a RLS
implicitamente. Muda a migration 0006 (funções + policies) e o módulo `db` (PR-1.2 entrega
`withSystemContext` junto do `withTenantContext`). Novo gate de teste: resolvers funcionam sem contexto;
acesso direto às tabelas sem contexto **continua negado**. **Leitura defensiva dos GUCs:** ver schema
§10 — toda policy lê o GUC com `NULLIF(current_setting(...), '')` antes do cast, para não quebrar sob
pooling (placeholder-GUC retorna `''`, não `NULL`, em conexões reusadas).

## ADR-018 — Máquina de estados de `appointments`: nasce `CONFIRMED`, transições explícitas
**Status:** Aceita — fecha ambiguidade de contrato (bloqueava o PR-3.3). **Emendada na v3 (cancel público sobre terminal → 410).**
**Contexto:** o contrato modelava as ações (`cancel`/`complete`/`no-show`) e dizia "cada uma tem
pré-condições próprias" — mas as pré-condições nunca foram escritas. E havia ambiguidade viva: o booking
público respondia `CONFIRMED`, o painel "cria `SCHEDULED`/`CONFIRMED`" e **não existia ação `confirm`**
em lugar nenhum — um estado sem transição de entrada definida.
**Decisão:**
- **No MVP, todo agendamento nasce `CONFIRMED`** (painel e público). O modelo de negócio de
  barbearia/salão não tem etapa de aprovação: marcou, valeu. `SCHEDULED` permanece no enum, **reservado**
  para a fase futura de "aprovação pelo dono" (recurso de mercado — Booksy o tem); habilitá-lo será
  aditivo (ação `confirm` + transição `SCHEDULED → CONFIRMED | CANCELLED`).
- **Matriz de transição (a única fonte):**

  | De → Para | `CANCELLED` | `COMPLETED` | `NO_SHOW` | remarcar (`PATCH`) |
  |---|---|---|---|---|
  | `CONFIRMED` | ✅ | ✅ | ✅ | ✅ (mantém `CONFIRMED`) |
  | `SCHEDULED` *(futuro)* | ✅ | ❌ | ❌ | ✅ |
  | `CANCELLED` / `COMPLETED` / `NO_SHOW` | ❌ | ❌ | ❌ | ❌ |

- **Estados terminais são imutáveis.** Repetir a mesma ação não é idempotência de negócio — retry
  legítimo é coberto pelo replay da `Idempotency-Key`; uma segunda ação distinta (ou a mesma, sem a
  chave) recebe **`409 INVALID_STATUS_TRANSITION`** (novo código no catálogo API §7).
- **Sem trava de relógio no MVP** (decisão consciente): `complete`/`no-show` não exigem
  `now() > starts_at` — a equipe sabe o que está fazendo, e a checagem adicionaria complexidade de
  borda de fuso sem prevenir erro real. Revisável com uso.
- **Cancelamento público sobre estado terminal (emenda v3):** sem trava de relógio, a equipe pode
  `complete` um agendamento **antes** do `starts_at`; o token público de cancelamento segue não-expirado
  (expira em `starts_at`) e com hash presente. Quando `POST /public/cancel` cai num agendamento já
  terminal (mas com token válido), a superfície pública responde **`410 Gone`** — para o cliente, "o link
  não vale mais" é a leitura correta, e `410` não vaza o estado interno do agendamento. O caminho do
  **painel** mantém `409 INVALID_STATUS_TRANSITION` (operador autenticado vê o estado real). Espelhado
  em API §18.
**Consequências:** o `no_overlap` permanece `WHERE status IN ('SCHEDULED','CONFIRMED')` (ambos ocupam
agenda — correto e estável para a fase futura). O service de `appointments` valida a transição **antes**
do UPDATE; o `shared` exporta a matriz como constante única (front desabilita botões pelo mesmo dado que
o back valida). A tradução terminal→`410` é da borda pública (`public-booking`), não da matriz.

**`CONFIRMED` que ficou no passado (emenda v3, rev. 2).** A matriz define `CONFIRMED → COMPLETED |
NO_SHOW` como transição **manual** e não há trava de relógio — logo um agendamento cujo `ends_at` já
passou e que ninguém desfechou **permanece `CONFIRMED`**. Decisão do MVP: **deixa como está**. Não há
risco de integridade — o `no_overlap` é uma `EXCLUDE` sobre o intervalo de tempo, e nenhum booking novo
(sempre futuro) colide com um slot já passado. O painel **exibe esses agendamentos como "pendente de
desfecho"** (rótulo de UI, não estado novo no enum), sinalizando à equipe que falta marcar
`COMPLETED`/`NO_SHOW`. **Auto-complete por job** (fechar automaticamente após N horas do `ends_at`) fica
**registrado para pós-MVP** (interage com relatórios da P7/P10 — taxa de no-show, ocupação) e, se entrar,
é decisão de produto com ADR próprio. Escrever isto agora evita improviso de UI na Fase 6 e ruído nos
relatórios futuros. Espelho: API §16.0.

## ADR-019 — Convite de equipe via tabela `invitations` (aceite cria o vínculo)
**Status:** Aceita — fecha fluxo pela metade (bloqueava o PR-1.6).
**Contexto:** `POST /members/invite` criava vínculo `INVITED` e disparava e-mail — e o contrato parava
aí. Não havia endpoint de aceite, não havia token de convite, e o caso do convidado **sem conta** era
impossível por construção (`organization_users` exige `user_id`).
**Decisão:**
- **Convite é entidade própria, não membership:** tabela `invitations`
  (`organization_id`, `email`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`) —
  schema §5.3. Token hasheado, uso único, com expiração — mesma disciplina dos demais tokens.
- **Um único mecanismo para os dois casos:** o vínculo em `organization_users` é criado **apenas no
  aceite**, já `ACTIVE`. Convidado **com** conta: loga e aceita (`POST /auth/accept-invite` com
  `{ token }`). Convidado **sem** conta: o mesmo endpoint aceita `{ token, name, password }` e faz
  registro + vínculo na mesma transação (e-mail do convite já verificado por construção — o token chegou
  por ele).
- **`membership_status = 'INVITED'` fica reservado** (enum aditivo, sem custo) — o fluxo do MVP não o
  usa. `DISABLED` segue como está.
- Lookup do token de convite usa o resolver do **ADR-017** (`app_resolve_invitation_by_hash`); limpeza
  de convites expirados roda sob contexto de sistema.
- Convite **exige e-mail verificado do remetente** (envio em nome da empresa — API §8.1); reenvio
  substitui o convite pendente (unique parcial por `(org, email)` pendente).
- **Aceitar convite de empresa onde já é membro:** o unique `(organization_id, user_id)` de
  `organization_users` rejeitaria o INSERT — o serviço detecta o caso e responde **`409 ALREADY_MEMBER`**
  (novo código), em vez de deixar o unique virar `500`. Espelhado em API §7/§8.
**Consequências:** PR-1.6 vira implementável de ponta a ponta. Novos itens: tabela no Drizzle (0002),
policies (0006), purpose não entra em `verification_tokens` (convite tem ciclo de vida próprio —
referencia org + e-mail, não user). Códigos de erro: `INVITE_TOKEN_INVALID` / `INVITE_TOKEN_EXPIRED`
(`410`, família dos tokens); `ALREADY_MEMBER` (`409`).

## ADR-020 — Resolução de tenant ativo: claim `org` + `sid` no access token (+ `switch-org`)
**Status:** Aceita — **fecha furo estrutural (A1) e bug de contrato (A2)**; bloqueava o PR-1.4.
**Contexto:** o modelo suporta usuário com vínculo em **N empresas** (`GET /organizations/me`,
`organization_users` unique `(org, user)`, índice "minhas empresas"). Mas:
1. **As rotas operacionais** (`/appointments`, `/professionals`, `/services`, `/clients`) **não carregam
   `organization_id`** em path/header/body, e o §3.3 **proíbe** recebê-lo do cliente. "Vem do vínculo"
   só resolve com **um** vínculo; com dois, o `withTenantContext(orgId, ...)` (ADR-001) **não tem de
   onde tirar o `orgId`**. Sem um tenant ativo, o guard e a RLS por GUC não têm o que setar no caminho
   autenticado multi-org. **Furo estrutural** — o "zero pendências" da v9 não se sustentava sem isto.
2. **O logout não enxergava a família a revogar (A2):** ADR-004 dizia "o cookie identifica qual", mas o
   cookie de refresh tem `Path=/api/v1/auth/refresh` (ADR-012) e **não viaja** para `/auth/logout`.
   Como especificado, o logout não tinha como saber a família. **É o mesmo token que resolve os dois
   problemas** — por isso vivem num ADR só.
**Decisão (MVP):**
- **O access token carrega exatamente um `org` ativo + um `sid`** (= `family_id` da sessão de refresh).
  Claims mínimos: `sub` (user), `org?` (empresa ativa, quando houver), `sid` (família), `exp` curto.
- **Tenant ativo vem do claim assinado.** O guard lê `org` do token (assinado pelo backend na emissão,
  **validado contra o vínculo `ACTIVE` na emissão**) e abre `withTenantContext(org, sub)`. **Zero query
  de membership por request.** O princípio "cliente nunca envia org livre" se mantém intacto: o claim é
  assinado, não é input arbitrário do cliente.
- **Emissão do claim de `org`:**
  - Login/register com **1 vínculo** → access já com `org`.
  - Login com **>1 vínculos** → access **sem** `org` (estado "sem empresa ativa"). Nesse estado o cliente
    só alcança `/auth/me`, `/organizations/me`, `/auth/switch-org` e `/auth/logout`. Qualquer rota
    tenant-scoped sem `org` no claim → **`403 NO_ACTIVE_ORG`** (novo código). Evita operar na empresa
    errada por default, **sem** coluna de "última empresa" no schema.
- **Troca de empresa — `POST /auth/switch-org { organizationId }` (autenticado):** valida o vínculo
  `ACTIVE` e **reemite o access com o novo `org`**, **sem rotacionar a família de refresh**. Trocar de
  empresa é troca de contexto, não de sessão — não deve derrubar outras sessões/dispositivos. Vínculo
  inexistente/`DISABLED` → `403 AUTHZ_DENIED`.
- **Logout Bearer-only (fecha A2):** lê o `sid` do access e revoga **aquela** família. O `Path` estreito
  do cookie (ADR-012) permanece intacto. O `sid` ainda rende: correlação de `audit_logs` por sessão e o
  **gancho de kick de socket** sob revogação/`DISABLED` (ADR-005, PLANNING §11, ROADMAP PR-5.2).
**Limitação consciente do MVP + caminho de evolução (preparado agora):**
- Com `org` no claim, **duas empresas ativas ao mesmo tempo exigem duas sessões de browser** (o token
  tem um `org`). **Aceitável no MVP** — o usuário típico tem 1 empresa; quem tem 2 troca por
  `switch-org` ou usa janelas/perfis distintos.
- A evolução para **multi-org simultâneo numa só sessão** é **path-scoped** (`/organizations/:orgId/...`):
  o `:orgId` do path — validado contra o vínculo + RLS, exatamente como o §9 **já faz hoje** — substitui
  o claim de `org`; o `sid` permanece. Migração **aditiva**: o guard passa a resolver o tenant do path em
  vez do claim, `switch-org` deixa de existir, `withTenantContext` não muda.
- **Preparar para a troca custa uma função:** o guard resolve o tenant ativo de um **ponto único** —
  `resolveActiveOrg(req)` — e nunca espalhado pelos controllers. Trocar a fonte (claim → path) toca **só
  essa função**. É o único débito técnico assumido do MVP, e está explicitamente isolado.
**Reescrita do §3.3 (consequência direta):** "o cliente nunca envia `organization_id`" passa a ser "o
cliente nunca envia `organization_id` **livre/não-validado**". O `org` vem do **claim assinado**
(autenticado) ou do **`:orgId`/`slug` validado** (já praticado no §9 e nas rotas públicas). A proibição
incide sobre org **arbitrária em body/header**, não sobre o claim assinado nem sobre o path validado —
fechando a tensão que o §3.3 já tinha com o §9 mesmo antes do multi-org.
**Consequências:**
- Destrava o **PR-1.4** (formato do token: `sub`/`org?`/`sid`/`exp`; emissão; `switch-org`; guard com
  `resolveActiveOrg`). Junto da ADR-012 (CSRF/cookie), fecha o desenho de auth da Fase 1.
- Novos: código `NO_ACTIVE_ORG` (403); rota `POST /auth/switch-org`. ADR-004 emendada (logout Bearer-only
  + `password/change` usam o `sid`).
- Espelhos: API §3/§7/§8/§9, PLANNING §12, ROADMAP PR-1.4.

---

## ADR-021 — Hardening de plataforma e segurança operacional (revisão de segurança pré-código)
**Status:** Aceita — fecha a camada de hardening que faltava escrever (app **e banco**); itens entram no PR-0.1/0.2 e na Fase 1 fundação.
**Contexto:** a segurança **estrutural** está fechada e é a parte cara de retrofitar: isolamento de tenant
(RLS `FORCE` + role sem `BYPASSRLS` + FKs compostas — ADR-001/017), sessão/token (refresh rotativo +
reuse detection + `sid` — ADR-004/020), CSRF/cookie (ADR-012), PII fora do socket e do `metadata`
(ADR-005/010). Faltava a camada de **hardening de plataforma** — convencionalmente parte da fundação,
mas que não estava escrita em documento nenhum. Sem decisão única, cada controle viraria escolha ad-hoc
no controller. Esta ADR consolida sete frentes; a sexta é a **revisão de segurança do banco**.
**Decisão:**

1. **JWT — pinagem e validação estrita.** Verificar com **lista branca explícita de algoritmo** —
   rejeitar `alg:none` e qualquer alg fora dela (anti *alg-confusion*). MVP: **HS256** com segredo
   simétrico (simples, single-instance); migrar para **RS256/EdDSA com key set (`kid`)** é aditivo
   quando houver múltiplos verificadores/mobile-first. **Validar `iss` e `aud`** em todo token. Claims
   mínimos (ADR-020) `sub`/`org?`/`sid`/`exp`/`iat`, **sem dado sensível** no payload (o JWT é legível por
   quem o porta).

2. **Gestão de segredos.** Segredo do JWT, API key do Resend, segredo de cookie e credencial do banco
   vêm por **injeção de ambiente**. Nada de segredo no repositório — `.env.example` só com placeholders,
   `.env` no `.gitignore`, **scan de segredo no CI** (ex.: gitleaks). **Rotação:** trocar o segredo do
   JWT invalida os access vivos (degrada para re-login via refresh) — operação **planejada**, não
   incidente; rotação sem big-bang no futuro é via `kid`/RS256 (registrado, não MVP).

3. **Cabeçalhos de segurança (Helmet).** HSTS (após TLS), **CSP** (sobretudo nas páginas públicas — a
   superfície mais exposta), `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
   `frame-ancestors 'none'` / `X-Frame-Options: DENY` (o produto não é embedável). Aplicados
   globalmente no bootstrap do Nest e no Next público.

4. **Supply chain / dependências.** CI roda `pnpm audit` (falha em vulnerabilidade alta/crítica),
   **Renovate/Dependabot** para PRs de atualização, install com **lockfile congelado**
   (`--frozen-lockfile`). Entra no **PR-0.1/0.2** — o monorepo é o momento, e retrofitar depois é caro.

5. **Hardening de requisição (higiene de DoS — complementa o `RateLimiter`/ADR-009).** Limite de tamanho
   de body (ex.: 100 KB p/ JSON), **timeout de requisição**, `max` de page size nos `GET` com cursor,
   profundidade de JSON limitada. Defaults no bootstrap + no `shared` onde couber.

6. **Segurança do banco (revisão dedicada — espelho schema §10.9).**
   - **Least-privilege:** `app_runtime` **sem `BYPASSRLS`/`SUPERUSER` e sem DDL**; migrations rodam com
     role separada (já — schema §10.2/§10.4). `REVOKE ALL ON SCHEMA public FROM PUBLIC` + grants
     explícitos (nada implícito para `PUBLIC`).
   - **`audit_logs` append-only:** `REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime` — a app
     **escreve** a trilha mas **não a reescreve nem apaga**; expurgo por retenção é caminho privilegiado/
     particionamento, jamais `DELETE` da app. Trilha que pode ser editada não é trilha.
   - **`statement_timeout`** e **`idle_in_transaction_session_timeout`** na role `app_runtime` — corta
     query fugitiva (DoS) e transação que prende lock.
   - **Transporte:** conexão ao banco com **`sslmode=require`** no mínimo.
   - **Superfície `SECURITY DEFINER`** (resolvers + `app_is_member`) é a mais sensível: `search_path`
     pinado, `REVOKE FROM PUBLIC`, retorno só de IDs, **teste dedicado** (já — ADR-017; reafirmado aqui
     como item de segurança, não só de correção funcional).

7. **Logs — scrub de segredos além de PII.** Nunca logar `Authorization`, cookies, tokens, senhas ou
   segredos. A regra "sem PII em log" (ADR-010) **estende-se a credenciais**.

**Janela consciente (não é bug):** membro recém-`DISABLED`/revogado mantém o access válido até o `exp`
curto (5–15 min) nas rotas HTTP (o socket tem kick — ADR-005/020). As **mutações mais sensíveis**
(gestão de membros, anonimização LGPD, troca de papel) **revalidam o vínculo `ACTIVE` no servidor** em
vez de confiar só no claim — fecha a janela onde mais dói, sem encurtar o token globalmente.

**Futuro (registrado, não MVP):** MFA/2FA para staff (sobretudo OWNER); key set `kid`/RS256; WAF;
pen-test. **Deliberadamente fora por proporcionalidade:** Vault dedicado (injeção de ambiente basta
nessa escala), criptografia a nível de campo (RLS + anonimização são o controle proporcional), IDS.

**Consequências:** TLS deixa de ser implícito e vira **gate de deploy** (cookies `Secure` + HSTS o
pressupõem). Novos itens de gate (PLANNING §16) e de PR: PR-0.1/0.2 (deps + segredos + scan no CI);
Fase 1 fundação (Helmet, body limits, JWT alg pinning, `statement_timeout`, `audit_logs` append-only na
migration 0006). Espelhos: SCHEMA §10.9/§12/§14, API §3, PLANNING §12/§16, ROADMAP PR-0.x/Fase 1.

---

## ADR-022 — Gate de jornada no agendamento (expediente é validação de app, não constraint)
**Status:** Aceita — fecha lacuna estrutural (público criava agendamento fora do expediente).
**Contexto:** o `no_overlap` (schema §8.1) garante que dois agendamentos não se sobreponham, e as FKs
compostas garantem tenant-safety. **Nenhum dos dois garante que o horário caia dentro da jornada
(`working_hours`) e fora de um `availability_block`.** Isso é, por construção, impossível de expressar
como `EXCLUDE` (jornada é template semanal recorrente + exceções datadas — não há range único a excluir).
O cálculo de disponibilidade respeita a jornada, mas availability é **advisory** (ADR-013) — a verdade é
o POST. Resultado: a rota pública (API §17.2) listava validações temporais (futuro, horizonte, grade) mas
**não** tinha, escrito como gate obrigatório, "o slot precisa cair dentro da jornada e fora de bloqueios".
Um POST público com `startsAt` na grade, no futuro, dentro do horizonte, mas às 03:00 de um dia fechado
**passava** — criava `CONFIRMED` fora do expediente. Não exige atacante sofisticado: front com bug,
replay de payload ou chamada direta à API bastam.
**Decisão:** a revalidação server-side de **jornada + bloqueios** é um **gate explícito e testado** no
fluxo de criação/remarcação, com código próprio **`422 OUTSIDE_WORKING_HOURS`** (semanticamente distinto
de `APPOINTMENT_CONFLICT`, que é "slot ocupado"). O comportamento difere por superfície:
- **Pública (`public-booking`):** **sempre rejeita** fora da jornada/bloqueios → `422
  OUTSIDE_WORKING_HOURS`. O cliente nunca cria expediente.
- **Painel (`appointments`, autenticado):** **permite o encaixe fora da jornada** (decisão de negócio —
  o dono/equipe têm autonomia para encaixar um cliente fora do horário declarado, cenário comum em
  barbearia/salão). Por padrão o service valida e o front mostra **aviso não-bloqueante** ("esse horário
  está fora do expediente do profissional"); a equipe confirma enviando **`allowOutsideHours: true`** no
  request. O agendamento nasce normalmente e o evento `CREATED`/`RESCHEDULED` carrega
  `metadata.outsideWorkingHours: true` (sem PII — ADR-010) para trilha. **Sem `allowOutsideHours` →
  `422 OUTSIDE_WORKING_HOURS`** (rede contra erro de digitação: 08:00 no lugar de 18:00, dia errado).
**Consequências:**
- Anti-pattern evitado: a equipe **não** precisa mexer na jornada recorrente para um encaixe pontual (o
  que arriscaria esquecer de reverter e vazar o horário a mais para o público).
- Novo código `OUTSIDE_WORKING_HOURS` (422) no catálogo (API §7/§22). Novo campo opcional
  `allowOutsideHours` no request do painel (default `false`).
- Espelhos: API §16.0/§16.1/§16.4/§17.2, PLANNING §10.1/§10.4, SCHEMA §8.1 (nota) + §13/§16 (gate de
  teste), ROADMAP PR-3.3/PR-4.2.

## ADR-023 — Âncora da grade de slots + coerência POST↔availability (a armadilha do DST)
**Status:** Aceita — fecha ambiguidade (alinhamento de grade sem âncora definida).
**Contexto:** ADR-018 v3/rev.2 introduziu "`startsAt` deve cair na grade do `slot_interval_min`", mas
**não definiu a âncora da grade**: a cada quanto, contado **a partir de quê** — meia-noite civil no fuso
da empresa? início da jornada do dia? Essas âncoras divergem quando o passo não divide o offset da
jornada. Pior, isso vira armadilha no gate de DST já planejado (PR-3.1, `America/Santiago`): num dia de
virada, "passo de N min a partir da meia-noite local" tem uma hora **inexistente** (spring-forward) ou
**ambígua** (fall-back). Se a **validação de grade no POST** e o **slicing do availability** usarem âncoras
ou aritméticas diferentes (um em hora local, outro em UTC), o availability oferece um slot que o POST
rejeita por "fora da grade" — bug silencioso e quase irreproduzível. A fixture de DST atual testa os dois
**isolados**; o bug mora na **junção**.
**Decisão:**
- **Âncora única:** a grade é ancorada no **início da jornada do profissional naquele dia, no fuso da
  empresa** (`working_hours.start_time` do primeiro turno do dia), computada **uma vez** e reusada pelos
  dois caminhos (slicing do availability e validação de grade do POST). Constante/utilitário único no
  `shared` (ex.: `alignToSlotGrid(startsAt, dayStart, slotIntervalMin, timezone)`).
- **Gate de coerência:** o teste de DST passa a exigir que **todo slot emitido pelo availability passe na
  validação de grade do POST**, no dia de virada — não basta testar cada um isolado.
- **`slot_interval_min` permanece config por empresa** e **independente da duração do serviço**. O modelo
  "grade = duração do serviço" (blocos limpos: 08:00–09:00, 09:00–10:00) é o **caso particular** em que o
  dono configura `slot_interval_min` = duração; o passo **menor** que a duração (mais pontos de início,
  melhor ocupação, com possível buraco) continua disponível. Fixar "grade = duração" no código foi
  **rejeitado** (tiraria a alavanca de ocupação e seria difícil reverter).
**Consequências:**
- Pode-se oferecer, ao criar a empresa, um **default amigável** `slot_interval_min = duração do serviço
  mais comum` (UX simples para iniciante), sem perder a configurabilidade. Aditivo, não-bloqueante.
- **Futuro registrado (não MVP):** grade **por serviço** (cada serviço com seu passo) — aditivo, anotado
  junto de buffers/overrides em `professional_services` (PLANNING §10.2).
- Espelhos: API §15/§16.1, PLANNING §10.2/§16, ROADMAP PR-3.1.

**Emenda (2026-06-26) — grade por serviço promovida ao MVP (ref. PROP-SLOT-STEP-PER-SERVICE-01):**
- **Motivação:** com múltiplas empresas/profissionais reais em uso, a config única `slot_interval_min` por
  empresa não atende empresas com serviços de durações distintas (ex.: corte 50, barba 30). O link público
  ofertava cadência fixa (default 30), ignorando a duração do serviço escolhido.
- **Decisão:** o passo da grade passa a ser **resolvido por serviço**, não por uma config global única.
  Ordem de resolução do passo: (1) override explícito por serviço, se houver; senão (2) `duration_min` do
  serviço como passo. `organizations.slot_interval_min` permanece apenas como **fallback/default** quando
  não houver passo resolvível por serviço.
- **Preserva a alavanca de ocupação** (razão original da rejeição): o override por serviço pode ser **menor**
  que a `duration_min` (mais pontos de início, melhor ocupação) — não se fixa cegamente "grade = duração".
  O default `passo = duration_min` é só o caso mais comum, não uma trava no código.
- **Invariantes mantidos:** âncora única = início da jornada do profissional no dia (inalterada); utilitário
  único `alignToSlotGrid` reusado por availability e validação do POST; **gate de coerência POST↔availability
  sob DST permanece** — todo slot emitido pelo availability deve passar na validação de grade do POST, agora
  com o passo por serviço. Só o **valor do passo** muda; a semântica de âncora/coerência não.
- **Local do passo por serviço:** a definir no design-auditor — candidato `professional_services`
  (alinhado a buffers/overrides já registrados em PLANNING §10.2) ou `services`. Migração **aditiva**.
- **Contrato:** `slotIntervalMin` na resposta de availability deixa de ser a fonte única de cadência;
  api-contract-guardian decide se vira informativo, por-serviço, ou é aposentado. `packages/shared` e
  `alignToSlotGrid` recebem o passo do serviço.

## ADR-024 — Antecedência mínima de agendamento público + nota sobre força do anti-abuso
**Status:** Aceita — antecipa do pós-MVP (POST_MVP §6.1) uma validação temporal barata.
**Contexto:** o horizonte máximo (90 dias) fecha o flanco "longe demais", mas o flanco oposto estava
aberto: um visitante podia marcar para **daqui a 2 minutos** — vetor de abuso (floodar a próxima hora) e
má experiência (cliente aparece sem o profissional ter visto). É o **mesmo tipo** de validação temporal
do horizonte; o custo arquitetural (constante no `shared`, default declarado) já foi pago uma vez.
**Decisão:**
- **`min_schedule_notice_min` = 15** (default declarado, constante no `shared`, revisável com tráfego;
  vira config por empresa depois — mudança aditiva). **`startsAt` < `now() + 15min`** (no fuso da
  empresa) na rota **pública** → `422 VALIDATION_ERROR`. **Painel isento** (a equipe encaixa para agora).
- **Nota de anti-abuso (item registrado, não código novo):** o limite **por telefone** (5/hora) é fraco —
  o telefone é fornecido pelo cliente e **não tem posse provada no MVP** (sem OTP); trocá-lo contorna o
  limite. A defesa real é o **limite por IP**, mas no Brasil o tráfego móvel passa massivamente por
  **CGNAT** (muitos assinantes por IP), então 10/min por IP (a) não barra atacante com proxies e (b) pode
  punir clientes legítimos. **Consequência de design:** não assumir, em features futuras (lembretes,
  anti-no-show por telefone), uma confiabilidade do telefone que ele não tem até existir OTP. Se o abuso
  aparecer antes do captcha adaptativo, o controle proporcional é **turnstile/captcha invisível no POST
  público**, **não** apertar o limite por IP (que pune o CGNAT).
**Consequências:** API §17.2 ganha a validação; PLANNING §10.7 ganha a nota de CGNAT/posse; POST_MVP §6.1
move `min_schedule_notice_min` de "futuro" para "no MVP (default 15)". Espelhos: API §17.2, PLANNING
§10.7, ROADMAP PR-4.2, POST_MVP §6.1.

## ADR-025 — Sem soft-hold no MVP (a corrida resolve no commit)
**Status:** Aceita — transforma ausência silenciosa em decisão escrita.
**Contexto:** parte dos concorrentes (Booksy/AppBarber) **segura** o slot por alguns minutos enquanto o
cliente preenche os dados. O MVP resolve a corrida só no commit: `GET /availability` é *advisory*
(ADR-013), e quem perde a corrida recebe `409 APPOINTMENT_CONFLICT` + refaz o fetch. Isso é
arquiteturalmente mais simples e honesto (sem reservas-fantasma travando agenda), mas tem o atrito
"preenchi tudo e o horário sumiu" — pior no fluxo de visitante sem login.
**Decisão:** **não** implementar hold no MVP. A corrida resolve no commit; aceitamos o atrito de
re-tentar (mitigado pelo real-time, que invalida e refaz o fetch antes mesmo do POST na maioria dos
casos). Hold é **evolução aditiva** (estado extra fora do `no_overlap`, ou tabela de hold com TTL +
limpeza no `maintenance`) — registrado, não construído.
**Consequências:** decisão explícita em PLANNING §3 (fora de escopo) e §10.1; o design de availability/
conflito já comporta hold aditivo. Sem mudança de schema/contrato agora.

## ADR-026 — Abstração de notificação transacional (não acoplar a "e-mail")
**Status:** Aceita — generaliza a dependência de envio antes de ela endurecer.
**Contexto:** toda a fundação de auth de produto (verificação, reset, convite) corre por e-mail via
Resend (ADR registrada na stack). Para **staff** é defensável, mas o público BR de barbearia/salão vive
no **WhatsApp** — e-mail tem baixa abertura, e "convite exige e-mail verificado do remetente" pode virar
atrito de suporte no onboarding. O cliente final não entra nisso (não autentica; recebe link de
cancelamento na resposta), então o risco fica contido ao staff. Acoplar a interface a "e-mail" agora
forçaria retrofit quando WhatsApp/SMS entrarem.
**Decisão:** a interface de envio nasce como **`NotificationSender`** (canal-agnóstica:
`send(channel, template, to, vars)`), **não** `EmailSender`. **Resend é a primeira implementação**
(canal e-mail). WhatsApp/SMS entram como implementações **aditivas** (mesma lógica de interface trocável
do `RateLimiter` e do publisher de domínio). MVP usa só e-mail; nada de WhatsApp/SMS construído agora.
**Consequências:** PLANNING §8/§11 e §6 refletem a interface canal-agnóstica; POST_MVP (notificações
automáticas) aponta para a mesma abstração. Sem custo no MVP além de nomear a interface corretamente.

---

## Índice de rastreabilidade

| ADR | Fecha "a confirmar"/lacuna? | Documento espelho |
|---|---|---|
| 006 Topologia single-instance | ✅ | PLANNING §11/§13 |
| 007 Forward-only + PITR | ✅ | PLANNING §13 |
| 008 Idempotência IN_PROGRESS (+CAS, +obrigatória no painel) | ✅ | SCHEMA §9.1, API §5/§16 |
| 009 RateLimiter + limites (público **e auth**) | — | API §19, PLANNING §10.7 |
| 010 Metadata sem PII (+ escopo `note`) | (lacuna) | SCHEMA §8.2/§9.2, PLANNING §13 |
| 011 Slug retry-on-conflict | (lacuna) | API §20.1, SCHEMA §5.1/§6.1 |
| 012 Same-origin via proxy + IP real (+ CSRF header fixo) | ✅ **FECHADA (Opção A)** | API §3.2/§19, PLANNING §12 |
| 013 Disponibilidade advisory (+ alinhamento de grade) | (lacuna) | API §14/§15/§16.1, PLANNING §16 |
| 014 Dead-letter do outbox (+SKIP LOCKED) | (lacuna) | SCHEMA §8.2, PLANNING §11 |
| 015 WORKING_HOURS_CONFLICT | (lacuna) | API §7/§20.3, SCHEMA §6.4 |
| 016 phone_normalized nullable (+ scrub de `note`, lacuna `users`) | (bug corrigido) | SCHEMA §7, PLANNING §13, API §20.5 |
| **017 Acessos fora do contexto de tenant** | **(furo estrutural fechado)** | SCHEMA §10.7/§10.8, API §17/§18, ROADMAP PR-1.1/1.2 |
| **018 Máquina de estados / nasce CONFIRMED** (+ cancel público terminal → 410) | **(ambiguidade fechada)** | API §16/§18, SCHEMA §8.1 |
| **019 Convites via `invitations`** (+ `ALREADY_MEMBER`) | **(fluxo fechado)** | SCHEMA §5.3, API §8/§9, ROADMAP PR-1.6 |
| **020 Tenant ativo: claim `org` + `sid` + `switch-org`** | **(furo estrutural A1 + bug A2 fechados)** | API §3/§7/§8/§9, PLANNING §12, ROADMAP PR-1.4 |
| **021 Hardening de plataforma + segurança do banco** (JWT alg/`iss`/`aud`, segredos, Helmet/CSP, deps/CI, DoS, audit append-only, `statement_timeout`, SSL, scrub de log) | **(camada de hardening fechada)** | SCHEMA §10.9, API §3, PLANNING §12/§16, ROADMAP PR-0.1/0.2 + Fase 1 |
| **022 Gate de jornada no agendamento** (público rejeita / painel encaixa com flag) | **(lacuna estrutural fechada)** | API §16/§17/§7, PLANNING §10.1/§10.4, SCHEMA §8.1/§13, ROADMAP PR-3.3/4.2 |
| **023 Âncora da grade + coerência POST↔availability** (DST) | **(ambiguidade fechada)** | API §15/§16.1, PLANNING §10.2/§16, ROADMAP PR-3.1 |
| **024 Antecedência mínima pública** (15min) + nota CGNAT/posse de telefone | (lacuna + nota de risco) | API §17.2, PLANNING §10.7, POST_MVP §6.1, ROADMAP PR-4.2 |
| **025 Sem soft-hold no MVP** (corrida resolve no commit) | (decisão explícita) | PLANNING §3/§10.1 |
| **026 Abstração de notificação transacional** (`NotificationSender`, não e-mail) | (generalização) | PLANNING §6/§8/§11, POST_MVP |

> Conjunto canônico **v4 — rev. 1**: `ARCHITECTURE_DECISIONS.md` (ADR-001 a ADR-026), `PLANNING.md` (v11),
> `DATABASE_SCHEMA_V2.md` (v5), `API_CONTRACTS.md` (sync v4), `IMPLEMENTATION_ROADMAP.md` (v4),
> `POST_MVP_PRODUCT_ROADMAP.md` (sync v4).
> **Nenhuma decisão pendente.**
