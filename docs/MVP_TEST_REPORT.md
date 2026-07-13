# MVP_TEST_REPORT — Relatório de testes do MVP (`nexos-booking`)

> Documento de fechamento. Preenchido **ao final do MVP** (e atualizado durante o teste funcional) para
> registrar o que foi testado, o que falhou, o que foi corrigido, o que ficou pendente e o **veredito
> final**. É a base para declarar o MVP pronto para teste funcional e para deploy controlado
> (`MVP_EXECUTION_PLAN.md` §9/§10).
>
> Regras de uso:
> - Sem PII crua, segredo, token ou stack sensível. Referenciar por ID/`requestId`.
> - Toda falha encontrada deve ter entrada correspondente no `BUGFIX_LOG.md` (referenciar o `BUG-NNN`).
> - "Pendência aceita" exige justificativa de por que não é bloqueante. "Pendência bloqueante" impede o
>   veredito final positivo.
> - O veredito final só pode ser **APROVADO** se o checklist da seção 8 do `MVP_EXECUTION_PLAN.md` estiver
>   integralmente verde e não houver pendência bloqueante.

---

## 1. Metadados do relatório

- **Data de início do teste:** 2026-07-13
- **Data de fechamento:** PENDENTE
- **Ambiente:** local; PostgreSQL/Redis em Docker, API/Web dev, Chromium Playwright
- **Commit/baseline avaliado:** worktree local sem commit; registrar hash após consolidação
- **Responsável pelo relatório:** execução automatizada Codex; aceite humano pendente
- **Fuso usado nos testes de timezone/DST:** ex.: `America/Sao_Paulo` + `America/Santiago` (DST ativo)

---

## 2. Testes executados (gate de qualidade — PLANNING §16 / `MVP_EXECUTION_PLAN.md` §8)

Marcar resultado por item: `PASS` · `FAIL` · `N/A` · `PENDENTE`. Ligar falhas ao `BUG-NNN`.

| # | Teste | Resultado | Evidência / `BUG-NNN` |
|---|---|---|---|
| 1 | Migrations aplicam do zero (Drizzle + SQL manual, banco limpo) | | |
| 2 | Service/repository da regra anti-conflito | | |
| 3 | Concorrência: duas reservas no mesmo slot → uma falha (`409 APPOINTMENT_CONFLICT`) | | |
| 4 | Timezone: agendamento/disponibilidade no fuso da empresa | | |
| 5 | DST: dia de virada + **coerência POST↔availability** | | |
| 6 | Gate de jornada (ADR-022): público rejeita; painel rejeita sem flag / aceita com `allowOutsideHours` | | |
| 7 | Autorização: PROFESSIONAL na agenda alheia → bloqueado | | |
| 8 | Isolamento RLS: sem contexto / outro tenant → nega linhas | PASS | `test:identity-rls` em 2026-07-13 |
| 9 | Acesso fora de contexto (ADR-017): resolvers sem contexto; direto negado; relay/limpeza só sob sistema | | |
| 10 | Sessão: `DISABLED`/troca de senha revoga; logout só a família; reuso revogado mata família | PASS | Auth 36/36 + kick cross-node |
| 11 | Convite (ADR-019): aceite cria vínculo `ACTIVE` (com/sem conta); expirado/usado → `410` | | |
| 12 | Idempotência: retry não duplica; divergente → `409`; replay mesmo status; takeover CAS exclusivo | PASS | `test:idempotency`; WEB-5C prova mesma chave após falha de rede |
| 13 | Lost update: `version` antiga → `409 APPOINTMENT_VERSION_CONFLICT` | PASS | Playwright `schedule-operations.spec.ts` |
| 14 | Máquina de estados (ADR-018): terminal/fora da matriz → `409 INVALID_STATUS_TRANSITION` | PASS | cancelar/completar/no-show + terminal sem ações |
| 15 | Integridade tenant-safe: profissional/serviço/cliente de outra empresa → rejeitado pelo banco | | |
| 16 | Conflito de corrida (advisory): slot livre no GET, dois POST → um `409` + refetch | | |
| 17 | Rota pública e auth com rate limit acionando → `429` no envelope | PASS | Auth T35/T36 + Redis distribuído |
| 18 | Validações públicas: passado / antes da antecedência / além do horizonte → `422` | | |
| 19 | Segurança (ADR-021): JWT alg/`iss`/`aud`; Helmet; body grande → `413`; `audit_logs` append-only; `pnpm audit`; sem segredo em log | PENDENTE | JWT/Helmet/body/log PASS; audit e gate completo aguardam baseline final |
| 20 | Mutação sensível revalida vínculo: `DISABLED` com access válido não gere/anonimiza/troca papel | | |

---

## 3. Fluxos testados (ponta a ponta)

Marcar `PASS`/`FAIL`/`PENDENTE` e descrever o caminho percorrido. **Ambiente/URL** registra onde o fluxo
foi exercido (local / staging / deploy controlado), porque o mesmo fluxo será testado em mais de um
ambiente.

| Fluxo | Resultado | Ambiente/URL | Observações / `BUG-NNN` |
|---|---|---|---|
| Onboarding: criar conta → criar empresa → entrar no painel | | | |
| Usuário multi-empresa: `403 NO_ACTIVE_ORG` → `switch-org` | | | |
| Convite de equipe: convidar → aceitar (com conta) | | | |
| Convite de equipe: aceitar (sem conta, registro pelo token) | | | |
| Cadastro: profissionais + serviços + jornada (com pausas) + bloqueios | | | |
| Disponibilidade no fuso da empresa (e dia de DST) | | | |
| Painel: criar agendamento (`CONFIRMED`) | | | |
| Painel: remarcar (mantém `CONFIRMED`, atualiza expiração do token) | PASS | local/Chromium | remarcação, retry, slot conflict e version conflict |
| Painel: cancelar / completar / no-show | PASS | local/Chromium | todos desfechos e estado terminal |
| Painel: encaixe fora da jornada com `allowOutsideHours` | | | |
| Público: vitrine → booking sem login → `cancelUrl` recebido | | | |
| Público: cancelamento por token (no body); reusado/terminal → `410` | | | |
| Real-time: duas telas refletem mudança sem refresh; reconexão recompõe via HTTP | PARCIAL | local/Chromium | duas telas PASS; reconnect explícito ainda pendente |
| Real-time: membro `DISABLED` é desconectado (kick) | PASS | local/Redis | kick `session:<sid>` cross-node PASS |
| Notificação visual + link manual de WhatsApp | | | |
| Histórico/filtros + trilha (`GET /appointments/:id/events`) sem PII | PASS | local/Chromium | painel renderiza histórico; payload socket estrito rejeita PII |
| Cliente: busca/edição + **anonimização LGPD** (PII + `note` + audit; não-colisão; re-anonimizar → `409`) | | | |
| Observabilidade: `/health`, `/ready`, `request-id` correlacionando | | | |

---

## 4. Falhas encontradas

> Uma linha por falha; ligar ao `BUGFIX_LOG.md`.

| `BUG-NNN` | Severidade | Resumo | Fluxo/Teste afetado | Status atual |
|---|---|---|---|---|
| BUG-037 | ALTA | Remarcação concorrente retornava 500 | WEB-5C / slot conflict | VALIDADO |

---

## 5. Falhas corrigidas

| `BUG-NNN` | Correção (resumo) | Validação executada | Data |
|---|---|---|---|
| BUG-037 | Traduz `23P01` no reschedule para `409 APPOINTMENT_CONFLICT` | Playwright concorrente PASS | 2026-07-13 |

---

## 6. Pendências aceitas (não bloqueantes)

> Devem ter justificativa explícita de por que não impedem o MVP. Itens já conhecidos das fontes podem
> ser listados aqui (ex.: esquecimento de `users`/staff fora do MVP; auto-complete de `CONFIRMED` no
> passado; força limitada do anti-abuso por telefone/CGNAT).

| Item | Por que é aceitável agora | Onde está registrado | Quando revisar |
|---|---|---|---|
| — | *(preencher)* | — | — |

---

## 7. Pendências bloqueantes (impedem o veredito final)

> Qualquer item aqui impede declarar o MVP pronto. Deve ter dono e plano de correção.

| Item | Por que bloqueia | `BUG-NNN` | Dono | Plano |
|---|---|---|---|---|
| Gates finais não reexecutados sobre baseline consolidado | Impede veredito integral e deploy | — | equipe | rodar CI/migrations do zero/audit e registrar hash |
| WEB-6 reconnect/org switch e recovery do outbox | Critérios distribuídos ainda sem prova automatizada completa | BUG-035/036 | equipe | completar testes do `MVP_BUG_RESOLUTION_PLAN.md` |

---

## 8. Veredito final

- **Checklist da seção 8 do `MVP_EXECUTION_PLAN.md` integralmente verde?** NÃO
- **Há pendência bloqueante?** SIM
- **Pronto para teste funcional (§9)?** SIM, para fechamento das provas restantes
- **Pronto para deploy controlado (§10)?** NÃO

**VEREDITO:** `REPROVADO` provisoriamente por gates finais pendentes (não por falha funcional conhecida)

**Justificativa do veredito:**

WEB-5C está validado e núcleo WEB-6 passou em duas telas, Redis cross-node, kick, RLS e fallback de
readiness. Baseline ainda não pode ser aprovado: faltam reconnect/org-switch, recovery do outbox,
migration limpa/CI/audit finais e hash consolidado.

**Assinatura / responsável:** _______________  **Data:** AAAA-MM-DD
