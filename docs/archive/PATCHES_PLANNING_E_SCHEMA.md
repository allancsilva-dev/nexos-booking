# PATCHES_PLANNING_E_SCHEMA — edições a aplicar nos documentos centrais

> Edições **cirúrgicas** para `PLANNING.md` e `DATABASE_SCHEMA_V2.md`, em vez de regenerar os arquivos
> (preserva o texto que você escreveu, evita drift). Aplicar na ordem abaixo. Depois disso, **nenhum dos
> dois documentos contém "a confirmar"** e ambos referenciam o `ARCHITECTURE_DECISIONS.md` como dono das
> decisões.

---

## A) Renomear o arquivo de schema

**Ação:** renomear `DATABASE_SCHEMA_V1.md` → **`DATABASE_SCHEMA_V2.md`**.
**Por quê:** o conteúdo já se intitula "DATABASE_SCHEMA_V2 … Status: v3" e o `PLANNING.md` já referencia
`DATABASE_SCHEMA_V2.md`. O nome do arquivo é o único ponto fora de sincronia. Só renomear — o conteúdo
do título/status já está certo (V2 é o nome do contrato de schema; v3 é a revisão interna dele).

```bash
git mv DATABASE_SCHEMA_V1.md DATABASE_SCHEMA_V2.md
```

---

## B) Edições em `DATABASE_SCHEMA_V2.md`

### B.1 — Fechar a recuperação de idempotência `IN_PROGRESS` (§9.1 e changelog v2→v3)

**Onde:** changelog "v2 → v3", item "Recuperação de idempotência `IN_PROGRESS`".
**De:** `… (seção 9.1). *(decisão recomendada — a confirmar)*`
**Para:** `… (seção 9.1). **Decisão fechada — ver ADR-008.**`

**Onde:** §9.1, bullet "Recuperação de `IN_PROGRESS` órfão".
**De:** `**Recuperação de `IN_PROGRESS` órfão (DECISÃO RECOMENDADA — a confirmar).**`
**Para:** `**Recuperação de `IN_PROGRESS` órfão (DECISÃO FECHADA — ADR-008).**`
E trocar "Mitigação recomendada: **TTL próprio e curto de in-progress (30–60s)**" por
"Regra: **TTL de in-progress = 60s**, a partir de `created_at`, independente do `expires_at` do replay".

### B.2 — Regra: `metadata` carrega referências, nunca PII (§8.2 e §9.2) — ADR-010

**Onde:** §8.2, na descrição da coluna `metadata` de `appointment_events`.
**Adicionar** ao comentário/nota:
> `metadata` guarda **somente referências e instantes** (IDs, `version`, `startsAt`/`endsAt`, motivo curto
> sem PII) — **nunca nome/telefone cru** (ADR-010). Assim, anonimizar `clients` (direito ao esquecimento,
> §7) basta: o JSONB não retém PII por construção.

**Onde:** §9.2, na nota final sobre `metadata` de `audit_logs` (que já diz "mascaram telefone").
**Reforçar:** `metadata` carrega **referência** ao cliente/agendamento (ID), nunca o número cru; telefone,
quando citado, vai mascarado (ADR-010).

### B.3 — Dead-letter do outbox (§8.2) — ADR-014

**Onde:** §8.2, no DDL de `appointment_events`, junto de `publish_attempts`/`last_publish_error`.
**Adicionar coluna:**
```sql
  publish_failed_at timestamptz,    -- preenchido quando o relay desiste (teto de tentativas) → dead-letter + alerta
```
**Onde:** §8.2, no índice parcial do outbox.
**De:**
```sql
CREATE INDEX appointment_events_unpublished_idx
  ON appointment_events (created_at) WHERE published_at IS NULL;
```
**Para:**
```sql
CREATE INDEX appointment_events_unpublished_idx
  ON appointment_events (created_at)
  WHERE published_at IS NULL AND publish_failed_at IS NULL;  -- pendentes ainda elegíveis (dead-letter sai do índice)
```
**Adicionar nota:** o relay usa backoff; atingido o teto de tentativas, grava `publish_failed_at` e
dispara alerta (error tracking). Como o real-time não é fonte de verdade (PLANNING §11), um evento
dead-lettered não corrompe estado — o front recupera via HTTP; o alerta existe para investigar (ADR-014).

> Atualizar também a **ordem das migrations (§12)**: a coluna `publish_failed_at` entra no 0002 (tabela) e
> o índice parcial ajustado no 0004 (índices de leitura).

### B.4 — Slug retry-on-conflict (§5.1 e §6.1) — ADR-011

**Onde:** §5.1 (nota de slugs) e §6.1 (slug de profissional).
**Adicionar:** a geração de slug é **retry-on-conflict** (tenta inserir; conflito de unique → incrementa
sufixo e retenta), não check-then-insert — corrida de slug vira `409 SLUG_TAKEN`, nunca `500` (ADR-011).

### B.5 — Marcar a decisão no checklist (§14)

**De:** `- [ ] Recuperação de idempotência `IN_PROGRESS` … — *decisão recomendada, a confirmar (seção 9.1)*`
**Para:** `- [x] Recuperação de idempotência `IN_PROGRESS` (409 imediato + TTL 60s) — **ADR-008**`
**Adicionar dois itens:**
`- [x] `metadata` sem PII (referências/instantes apenas) — **ADR-010**`
`- [x] Dead-letter do outbox (`publish_failed_at` + teto + alerta) — **ADR-014**`

### B.6 — Atualizar o cabeçalho de status

**Adicionar** à linha de status: "Decisões abertas fechadas em `ARCHITECTURE_DECISIONS.md` (ADR-008/010/011/014)."

---

## C) Edições em `PLANNING.md`

### C.1 — Novo changelog v7 → v8 (no topo da lista de changelogs)

```md
### Changelog v7 → v8 (fechamento documental antes do código)
- **Decisões "a confirmar" FECHADAS** e movidas para `ARCHITECTURE_DECISIONS.md` (ADR): recuperação de
  idempotência `IN_PROGRESS` (ADR-008), migrations forward-only + PITR (ADR-007), topologia
  single-instance no MVP como restrição declarada (ADR-006)
- **Contrato HTTP completo:** `API_CONTRACTS_V2.md` adiciona disponibilidade, agendamentos do painel,
  página pública (booking + cancel por token) e cadastros operacionais — destrava o `packages/shared`
- **Lacunas fechadas como decisão escrita:** cookie de refresh cross-site web↔api (ADR-012),
  disponibilidade *advisory* vs. verdade na constraint (ADR-013), `metadata` sem PII (ADR-010),
  dead-letter do outbox (ADR-014), slug retry-on-conflict (ADR-011), limites concretos de rate limit
  (ADR-009 / API §19)
- **`IMPLEMENTATION_ROADMAP.md`:** fases viradas em PRs pequenos e verificáveis, com gate de migration
  "aplica do zero" puxado para a semana 1
- **`DATABASE_SCHEMA_V1.md` renomeado para `DATABASE_SCHEMA_V2.md`** (sincroniza nome e conteúdo)
```
**Atualizar a linha de Status** para `v8` e acrescentar as referências a
`ARCHITECTURE_DECISIONS.md` e `API_CONTRACTS_V2.md`.

### C.2 — §11 (Real-time): tornar a topologia explícita — ADR-006

**Adicionar** após o parágrafo do publisher in-process:
> **Topologia (ADR-006):** o MVP roda **single-instance declarado**. A publicação in-process (EventEmitter)
> só entrega entre instâncias se houver pub/sub distribuído; com duas instâncias (inclusive no overlap de
> deploy), um socket na instância A não receberia o evento da B. Por isso, enquanto single-instance:
> deploy é com drain/janela, não zero-downtime com duas instâncias. Multi-instância exige Redis (pub/sub +
> rate limit), o que é fase de escala, não MVP.

### C.3 — §10.7 / §13 (rate limit): números concretos — ADR-009

**Adicionar** em §10.7: limites concretos versionados em `API_CONTRACTS_V2.md` §19 (ex.: 10 POST/min por
IP, 5 agend./hora por telefone); estouro → `429 RATE_LIMITED` + `Retry-After`. Interface `RateLimiter`
trocável (impl memória no MVP single-instance; Redis na escala — ADR-006/009).

### C.4 — §12 (Auth): cookie cross-site — ADR-012

**Adicionar** ao bloco de CSRF/cookies: a configuração de cookie de refresh e de CORS depende do domínio
de web vs. api em produção — decisão em **ADR-012** (recomendado: mesmo eTLD+1 com `Domain=.exemplo.com`,
`SameSite=Lax`; ou same-origin via proxy). **Preencher a opção escolhida no ADR antes do PR de auth.**

### C.5 — §13 (decisões operacionais a confirmar): fechar

**Substituir** o bloco "**Decisões operacionais de infra (DECISÕES RECOMENDADAS — a confirmar)**" por:
> **Decisões operacionais de infra (FECHADAS — `ARCHITECTURE_DECISIONS.md`):** migrations forward-only +
> PITR (ADR-007); topologia single-instance declarada no MVP, Redis só na escala (ADR-006); backup/PITR
> habilitado no provedor como pré-requisito de produção.

### C.6 — §17 (próximos passos): atualizar o item 4

**De:** `4. Confirmar as decisões recomendadas marcadas *(a confirmar)*: …`
**Para:** `4. ~~Confirmar as decisões recomendadas marcadas~~ ✅ **fechadas em `ARCHITECTURE_DECISIONS.md`** (ADR-006/007/008 + 009–014)`
**Adicionar** um item: `5. Seguir o `IMPLEMENTATION_ROADMAP.md` a partir do PR-0.1.` (e renumerar os seguintes).

### C.7 — §16 (Definition of Done): amarrar disponibilidade advisory

**Adicionar** um gate:
`- [ ] Teste de **conflito de corrida**: GET availability mostra slot livre, POST concorrente → um
recebe 409 APPOINTMENT_CONFLICT e o front refaz o fetch (ADR-013)`

---

## D) Conferência final (depois de aplicar tudo)

- [ ] `grep -ri "a confirmar"` em PLANNING e SCHEMA → **zero ocorrências**
- [ ] `grep -r "DATABASE_SCHEMA_V1"` no repositório → **zero** (arquivo renomeado e referências ok)
- [ ] PLANNING, SCHEMA, API_CONTRACTS_V2 e ROADMAP referenciam `ARCHITECTURE_DECISIONS.md` para decisões
- [ ] ADR-012 com a **opção de cookie escolhida preenchida**
- [ ] Conjunto de documentos: `PLANNING.md` (v8) · `DATABASE_SCHEMA_V2.md` (v3) · `API_CONTRACTS_V2.md`
      · `ARCHITECTURE_DECISIONS.md` · `IMPLEMENTATION_ROADMAP.md`
