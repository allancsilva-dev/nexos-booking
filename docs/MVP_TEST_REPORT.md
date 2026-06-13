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

- **Data de início do teste:** AAAA-MM-DD
- **Data de fechamento:** AAAA-MM-DD
- **Ambiente:** (ex.: `docker compose up` local / staging) — descrever
- **Commit/baseline avaliado:** (hash/tag) — *(sem commit automático; preencher ao testar)*
- **Responsável pelo relatório:**
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
| 8 | Isolamento RLS: sem contexto / outro tenant → nega linhas | | |
| 9 | Acesso fora de contexto (ADR-017): resolvers sem contexto; direto negado; relay/limpeza só sob sistema | | |
| 10 | Sessão: `DISABLED`/troca de senha revoga; logout só a família; reuso revogado mata família | | |
| 11 | Convite (ADR-019): aceite cria vínculo `ACTIVE` (com/sem conta); expirado/usado → `410` | | |
| 12 | Idempotência: retry não duplica; divergente → `409`; replay mesmo status; takeover CAS exclusivo | | |
| 13 | Lost update: `version` antiga → `409 APPOINTMENT_VERSION_CONFLICT` | | |
| 14 | Máquina de estados (ADR-018): terminal/fora da matriz → `409 INVALID_STATUS_TRANSITION` | | |
| 15 | Integridade tenant-safe: profissional/serviço/cliente de outra empresa → rejeitado pelo banco | | |
| 16 | Conflito de corrida (advisory): slot livre no GET, dois POST → um `409` + refetch | | |
| 17 | Rota pública e auth com rate limit acionando → `429` no envelope | | |
| 18 | Validações públicas: passado / antes da antecedência / além do horizonte → `422` | | |
| 19 | Segurança (ADR-021): JWT alg/`iss`/`aud`; Helmet; body grande → `413`; `audit_logs` append-only; `pnpm audit`; sem segredo em log | | |
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
| Painel: remarcar (mantém `CONFIRMED`, atualiza expiração do token) | | | |
| Painel: cancelar / completar / no-show | | | |
| Painel: encaixe fora da jornada com `allowOutsideHours` | | | |
| Público: vitrine → booking sem login → `cancelUrl` recebido | | | |
| Público: cancelamento por token (no body); reusado/terminal → `410` | | | |
| Real-time: duas telas refletem mudança sem refresh; reconexão recompõe via HTTP | | | |
| Real-time: membro `DISABLED` é desconectado (kick) | | | |
| Notificação visual + link manual de WhatsApp | | | |
| Histórico/filtros + trilha (`GET /appointments/:id/events`) sem PII | | | |
| Cliente: busca/edição + **anonimização LGPD** (PII + `note` + audit; não-colisão; re-anonimizar → `409`) | | | |
| Observabilidade: `/health`, `/ready`, `request-id` correlacionando | | | |

---

## 4. Falhas encontradas

> Uma linha por falha; ligar ao `BUGFIX_LOG.md`.

| `BUG-NNN` | Severidade | Resumo | Fluxo/Teste afetado | Status atual |
|---|---|---|---|---|
| — | — | *(sem registros)* | — | — |

---

## 5. Falhas corrigidas

| `BUG-NNN` | Correção (resumo) | Validação executada | Data |
|---|---|---|---|
| — | *(sem registros)* | — | — |

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
| — | *(nenhuma, espera-se)* | — | — | — |

---

## 8. Veredito final

- **Checklist da seção 8 do `MVP_EXECUTION_PLAN.md` integralmente verde?** SIM / NÃO
- **Há pendência bloqueante?** SIM / NÃO
- **Pronto para teste funcional (§9)?** SIM / NÃO
- **Pronto para deploy controlado (§10)?** SIM / NÃO

**VEREDITO:** `APROVADO` / `APROVADO COM PENDÊNCIAS ACEITAS` / `REPROVADO`

**Justificativa do veredito:**

*(preencher — resumir o estado, citar pendências aceitas, confirmar ausência de bloqueantes)*

**Assinatura / responsável:** _______________  **Data:** AAAA-MM-DD
