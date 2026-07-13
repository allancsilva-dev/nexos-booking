# MVP_BUG_RESOLUTION_PLAN — fechamento de WEB-5C, WEB-6 e divergências documentais

Data-base: 2026-07-13. Este ledger preserva mudanças locais existentes e só declara `VALIDADO` após
prova executada. HTTP/DB permanecem fonte de verdade; real-time apenas sinaliza invalidação.

## Escopo e decisões

- Topologia alvo: múltiplas instâncias de API com Redis obrigatório.
- `@socket.io/redis-adapter` distribui rooms e kick; canal Redis explícito transporta eventos do outbox.
- `published_at` significa aceitação pelo transporte Redis. Entrega ao navegador não é garantida;
  fallback HTTP por focus/reconnect/staleness garante consistência eventual.
- Handshake consulta sessão e membership sob `withTenantContext`; nenhum acesso tenant sem GUC RLS.
- Web mantém um socket por sessão, token só em memória, refresh single-flight e payload Zod sem PII.
- Agenda usa detalhe fresco e `If-Match`; retry técnico reutiliza `Idempotency-Key` da intenção.

## Ledger executável

| Fase | Entrega | Estado | Gate para fechar |
|---|---|---|---|
| D1 | Sincronizar schema, ADR, roadmap, progresso e bugs 034–036 | IMPLEMENTADA | revisão cruzada docs↔schema↔DTO |
| B1 | Redis compartilhado e rate limit distribuído | IMPLEMENTADA | build + teste Redis |
| B2 | Adapter, salas distribuídas, kick e handshake RLS | PARCIALMENTE VALIDADA | A→B, kick e RLS PASS; isolamento tenant pendente |
| B3 | Outbox com transporte explícito e sem falso sucesso | IMPLEMENTADA | Redis down mantém pendente; recovery publica |
| W1 | WEB-6 provider, schema, refresh, lifecycle e fallback | PARCIALMENTE VALIDADA | unit + duas telas PASS; reconnect/org switch pendente |
| W2 | WEB-5C detalhe, remarcação e desfechos | VALIDADA | Playwright positivo/negativo/conflitos PASS |
| Q1 | Gates completos do MVP | PENDENTE | CI, migrations limpas, API, segurança, Chromium |
| Q2 | Preencher `MVP_TEST_REPORT.md` e emitir veredito | PENDENTE | nenhum bloqueante aberto |

## Provas obrigatórias restantes

1. Provar que tenant B nunca recebe evento do tenant A.
2. Derrubar Redis com evento no outbox e provar que o retorno publica sem perda.
3. Provar reconnect e troca de organização no browser sem listener ou dado da organização anterior.
4. Completar jornada pública booking/cancel e gates ainda vazios no `MVP_TEST_REPORT.md`.
5. Rodar migration em banco realmente limpo, CI/audit e registrar o hash consolidado.

Já provado em 2026-07-13: evento A→B, kick cross-node, handshake RLS, `/ready` 503 sem Redis,
WEB-5C completo, conflitos, retry idempotente, duas telas e payload sem PII.

## Critério de conclusão

`BUG-034`, `BUG-035`, `BUG-036`, `INV-WEB2-002`, WEB-5C e WEB-6 só recebem `VALIDADO` após provas acima.
MVP só recebe `APROVADO` sem falha ou pendência bloqueante.
