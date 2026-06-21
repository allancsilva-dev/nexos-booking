# Agentes OpenCode — nexos-booking

**10 agentes especializados** (1 `primary` + 9 `subagent`) **+ este `README.md`** para conduzir o
desenvolvimento **um PR por vez**, com gates de auditoria antes de qualquer código. Desenhados sobre a
governança do projeto (ordem de autoridade documental, 5b obrigatório, vereditos
PASS/PASS_COM_RESSALVA/BLOCKED, lock documental, sem commit).

## Instalação

Copie a pasta `.opencode/agents/` para a raiz do repositório `nexos-booking`. O OpenCode lê agentes de
projeto em `.opencode/agents/*.md` (o nome do arquivo vira o nome do agente). Para versionar com o time,
faça commit dessa pasta. Reinicie a sessão do OpenCode após adicionar/editar arquivos.

> Global (todos os projetos): `~/.config/opencode/agents/`. Aqui usamos **projeto** de propósito —
> esses agentes são específicos do nexos-booking.

## Os 10 agentes

| Arquivo | Tipo | Edita? | Papel |
|---|---|---|---|
| `conductor.md` | primary | não | Maestro. Identifica o PR, dispara os especialistas, consolida e autoriza/bloqueia. |
| `architect-guardian.md` | subagent | não | "Este PR pode começar agora?" (roadmap, dependências, escopo, antecipação). |
| `design-auditor.md` | subagent | não | **5b**: mapa técnico ancorado em §/ADR antes de tocar arquivo. STOP. |
| `db-guardian.md` | subagent | não (bash inspeção sob aprovação) | Banco, migrations, RLS, GUC, idempotência, outbox, `app_runtime`. |
| `api-contract-guardian.md` | subagent | não | Contrato HTTP: envelope, `error.code`, headers, status, web↔api↔shared. |
| `security-auditor.md` | subagent | não | JWT, refresh/CSRF, rate limit, logs/metadata/WebSocket sem PII, LGPD, bypass de tenant. |
| `backend-builder.md` | subagent | **sim** (canônicos negados; commit/push negados) | Executor NestJS do escopo aprovado. |
| `test-writer.md` | subagent | **sim** (só testes/fixtures; commit/push negados) | Testes que provam o critério de aceite. |
| `code-reviewer.md` | subagent | não (bash inspeção sob aprovação) | Revisão final do diff. |
| `docs-reporter.md` | subagent | **só** `docs/pr/**`, `docs/reports/**`, `BUGFIX_LOG.md`, `MVP_TEST_REPORT.md` (sob aprovação) | Relatório e rastreabilidade. |

## Fluxo por PR (o conductor conduz)

1. Identificar o PR no `IMPLEMENTATION_ROADMAP.md` (e exigir PR anterior provado PASS com CI).
2. `architect-guardian` → pode começar?
3. `design-auditor` → mapa 5b + **STOP** (humano aprova antes de qualquer código).
4. Auditores de domínio aplicáveis (`db-`/`api-contract-`/`security-`).
5. Execução: `backend-builder` / `test-writer` (só no escopo aprovado).
6. Fechamento: `code-reviewer` → `docs-reporter`.

## Decisões embutidas (que o OpenCode passa a impor estruturalmente)

- **Sem commit**: builders negam `git commit*`/`git push*` via permissão de `bash`.
- **Builders não tocam o canônico**: `backend-builder` e `test-writer` têm `edit` que **nega
  explicitamente** ADR/SCHEMA/API/PLANNING/ROADMAP e os planos/logs — o lock documental vale também na
  execução, não só no reporter.
- **Reporter não toca o canônico**: `edit` escopado por caminho; ADR/SCHEMA/API/PLANNING/ROADMAP negados.
- **Auditores não escrevem**: `edit: deny`; `bash` de inspeção sob `ask`, sem `pnpm *` curinga liberado.
- **Subagentes não orquestram**: `task` negado; só o `conductor` tem allowlist de `task`.
- **`frontend-builder` fora da allowlist do conductor** porque **ainda não foi criado** (ver abaixo).

## Pendente: `frontend-builder`

**Ainda não foi criado** — mas atenção: **há, sim, frontend no roadmap.** O `IMPLEMENTATION_ROADMAP.md`
traz o **PR-1.7 — "Web shell + auth UI"** (`apps/web`: login/register, tratamento global de erro pelo
envelope, design tokens), na **Fase 1**, dependendo de **PR-1.4, PR-1.6 e PR-0.3**. O agente não existe
ainda porque criá-lo agora congelaria suposições de tela/estado/`shared` antes de o design ser auditado.
**Gatilho para criá-lo:** **antes de iniciar o PR-1.7**, passando pelo `design-auditor` (mapa 5b
ancorado). Aí ele entra como o 11º agente, já ancorado, e é adicionado à allowlist de `task` do
`conductor`. Até lá, pedido de frontend é **BLOCKED por falta de agente**, não por falta de plano — o
`conductor` deve registrar o motivo correto.

## Ajuste de modelos

Os `model:` usam os aliases atuais da Anthropic (`anthropic/claude-opus-4-8`, `anthropic/claude-sonnet-4-6`,
`anthropic/claude-haiku-4-5-20251001`). Rode `opencode models` para confirmar os IDs disponíveis no seu
provedor e ajuste se necessário. Sugestão de custo: Opus nos de maior risco de raciocínio (conductor,
design-auditor, db-guardian, security-auditor), Sonnet nos demais, Haiku no docs-reporter (mais mecânico).

## Próximo passo (futuro)

Depois de afinar os corpos aqui, a intenção é portar para o **Claude Code** (`.claude/agents/*.md`),
traduzindo o bloco `permission` do OpenCode para o frontmatter do Claude Code
(`tools`/`disallowedTools`/`permissionMode`) e mantendo os mesmos textos de sistema. Este pacote, como
está, é para **OpenCode**.
