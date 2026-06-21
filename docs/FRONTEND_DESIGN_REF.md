# FRONTEND_DESIGN_REF — referência de design do nexos-booking

> **Status:** **referência de design — NÃO é documento canônico.** Subordinado à ordem de autoridade
> (`ARCHITECTURE_DECISIONS.md` → `DATABASE_SCHEMA_V2.md` → `API_CONTRACTS.md` → `PLANNING.md` →
> `IMPLEMENTATION_ROADMAP.md`). Em qualquer conflito, **o canônico prevalece**. Este arquivo **não é
> gatilho de execução**: ele é captura antecipada de intenção, a ser auditada pelo `design-auditor`
> quando o gate de frontend abrir.
>
> **Fontes visuais (verdade de pixel):**
> - `nexos-booking-design-spec.md` — handoff técnico (tokens, medidas, receitas de componente).
> - `Nexos Booking — Conceitos.dc.html` — mockup; abrir no navegador para inspecionar valores reais.

---

## 1. Decisão de layout (Allan)

- **Login → variação A · Split com hero** (painel de marca + formulário).
- **Agenda → variação B · Dia por profissional** (rail de ícones 68px + colunas por profissional +
  painel-resumo 298px: ocupação, faturamento, próximos).

> Combinação coincide com a recomendação do próprio spec (Agenda B = operação, Login A = marca).

## 2. Identidade (resumo do spec)

- **Dark-first**; tema claro via classe `.light` na raiz.
- **Acento ciano** em gradiente `linear-gradient(145deg, #22d3ee, #0891b2)` — só em botões/logo;
  em texto/ícone usar a cor sólida (`--accent-text`).
- **Fonte** Plus Jakarta Sans (400/500/600/700/800).
- **Tokens** por CSS vars (`globals.css`) + `tailwind extend`. Raios: molduras 3px, cards 14px,
  controles 10px, navegação/botões 9px.

## 3. Onde cada peça entra na governança (o ponto crítico)

| Peça de design | PR de destino | Estado |
|---|---|---|
| Design tokens (`globals.css`, `tailwind extend`), tema dark/light | **PR-1.7** (shell + auth UI) | gated |
| **Login A** (split + hero) | **PR-1.7** | gated |
| Painel autenticado **vazio** + três estados (loading/erro/vazio) | **PR-1.7** | gated |
| **Agenda B** (grade, blocos de agendamento, painel-resumo) | **PR de frontend de agenda — posterior ao 1.7** (fase do módulo de agendamento) | futuro |
| `appointment-tones` em `packages/shared` | idem agenda — **depende de parecer do `api-contract-guardian`** | futuro |
| Lógica da grade (pxPorHora, blocos, linha "agora") | idem agenda | futuro |

> ⚠️ **PR-1.7 é enxuto:** login/register + painel vazio + tokens. O roadmap diz "nenhum módulo
> operacional (agenda, cadastros) — só o shell e o fluxo de entrar". **Agenda B está FORA do PR-1.7** —
> colá-la lá seria antecipação de fase. A tela de agenda é PR posterior, com seu próprio gate.

## 4. Pendências para o `design-auditor` (quando o gate abrir)

1. **Stack.** O spec assume **Next.js + Tailwind + shadcn/ui**. Confirmar contra ADR/roadmap: o PR-1.7
   descreve "`apps/web` + TanStack Query + cliente HTTP do `shared` + proxy reverso `/api/*` → Nest
   (ADR-012)", mas **não vi Next.js nomeado** num ADR — confirmar. **shadcn/ui é dependência nova** →
   precisa decisão explícita (e, se entrar, vira ADR/PROPOSTA, não adoção silenciosa).
2. **`appointment-tones` em `packages/shared`.** O `shared` materializa o **contrato** (envelope,
   `ErrorCode`, DTOs). Tom de cor é **apresentação** — avaliar se vai em `shared` ou em `apps/web`.
   Parecer do `api-contract-guardian` antes de colocar em `shared`.
3. **Âncora da grade sob DST.** O spec já amarra "âncora única entre `GET /availability` e o `POST`" a
   **PLANNING §10.2** — ✅ alinhado ao canônico; confirmar na implementação.
4. **`frontend-builder`.** O agente **ainda não existe** e está fora da allowlist do `conductor`.
   Gatilho de criação: **antes do PR-1.7**, via `design-auditor` (mapa 5b ancorado neste spec).

## 5. Pré-condições de execução (recap da governança)

- PR-1.7 **depende de PR-1.4, PR-1.6 e PR-0.3** — todos provados PASS com evidência de CI.
- PR-1.4 está **em remediação** (não PASS). Logo: **nenhum frontend executável agora.**
- Este documento existe para que, quando a vez do frontend chegar, o `design-auditor` já tenha a
  intenção de design registrada e ancorada — não para abrir execução antes do gate.
