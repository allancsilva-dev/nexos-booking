# POST_MVP_TRANSITION_PLAN — Transição do MVP validado para o produto final (`nexos-booking`)

> Como sair de um **MVP validado em deploy controlado** e iniciar, com segurança, o caminho do
> `POST_MVP_PRODUCT_ROADMAP.md` (v3 sync v4). Este documento **não** antecipa pós-MVP para dentro do MVP;
> ele só existe para ser executado **depois** que o MVP estiver validado (`MVP_TEST_REPORT.md` com
> veredito final positivo, sem pendências bloqueantes).
>
> Princípio central (POST_MVP §3.1/§10): toda evolução é **aditiva** sobre o núcleo (`appointments`,
> disponibilidade, anti-conflito, idempotência, tenant isolation, real-time). Preparar o futuro =
> nomes corretos, contratos estáveis, pontos de extensão, decisões registradas — **não** implementar
> marketplace/pagamentos/app/billing/multiunidade antes da hora.

---

## 1. Pré-condições para iniciar o pós-MVP (gate de entrada)

Só começa quando **todas** forem verdadeiras (espelha `MVP_EXECUTION_PLAN.md` §11):

- [ ] MVP **validado em deploy controlado** (§10 do plano de execução).
- [ ] `MVP_TEST_REPORT.md` com **veredito final positivo** e **sem pendências bloqueantes**.
- [ ] Pendências aceitas estão registradas, com justificativa e data de revisão.
- [ ] Backup/PITR ativo, TLS e role `app_runtime` provisionada em produção.
- [ ] Nenhuma feature pós-MVP foi antecipada para dentro do MVP (guardrails do POST_MVP §10 respeitados).
- [ ] Observabilidade operando em produção (logs/erros correlacionados, `/ready`).

> Se algum item falhar, **não** iniciar o pós-MVP — voltar ao `MVP_TEST_REPORT.md`/`BUGFIX_LOG.md`.

---

## 2. Estado de saída do MVP (o que já está pronto e deve ser preservado)

O MVP entrega e **não pode regredir** ao evoluir:

- Multi-tenant com RLS (`FORCE`, role sem `BYPASSRLS`, FKs compostas, resolvers `SECURITY DEFINER`,
  contexto de sistema).
- Auth de produto (sessões revogáveis, claims de tenant ativo, CSRF da Opção A, JWT endurecido, rate
  limit de auth) + convites com aceite.
- Núcleo de agenda: disponibilidade advisory, anti-conflito no banco (`no_overlap`), idempotência (replay
  fiel + CAS), máquina de estados, optimistic lock, gate de jornada, eventos transacionais (outbox).
- Página pública (vitrine + booking sem login + cancelamento por token no body) com anti-abuso.
- Real-time como invalidação sem PII (outbox/relay + gateway + kick de socket).
- LGPD básico executável (anonimização de cliente + scrub de `note`) e trilha de auditoria.

**Interfaces trocáveis já no lugar** (os pontos de extensão que o pós-MVP usa): `RateLimiter`, publisher
de domínio, `NotificationSender` (canal-agnóstico), e a resolução de tenant isolada em `resolveActiveOrg`.

---

## 3. Regra de ouro da transição

Antes de cada fase pós-MVP:

1. **Criar um roadmap específico** no estilo do `IMPLEMENTATION_ROADMAP.md` (PRs pequenos, dependências,
   critérios de aceite). O `POST_MVP_PRODUCT_ROADMAP.md` dá a direção; o roadmap por fase dá a execução.
2. **Abrir ADR próprio** para todo item que o POST_MVP §9 marca como "exige ADR" (ver seção 6 abaixo) —
   **antes** de qualquer PR.
3. **Espelhar a decisão** nos documentos centrais (`PLANNING`, `API_CONTRACTS`, `DATABASE_SCHEMA_V2`,
   `ARCHITECTURE_DECISIONS`) quando ela alterar produto/HTTP/SQL.
4. **Preservar o núcleo:** se a feature muda a semântica de ocupação da agenda (ex.: buffers), tratar como
   decisão arquitetural, não como campo novo.

---

## 4. Sequência macro recomendada (POST_MVP §8)

Ordem recomendada após o MVP validado (não começar por marketplace/app):

1. Produto público e conversão
2. Configurações avançadas de agenda e lista de espera
3. Monetização SaaS, planos e billing
4. Escala técnica operacional: Redis, workers, filas e zero-downtime
5. Notificações automáticas e comunicação
6. Pagamentos e proteção contra no-show
7. Cliente final e app futuro
8. Retenção, privacidade e LGPD ampliada
9. Clientes, CRM e retenção comercial
10. Operação financeira, caixa e relatórios
11. Estoque, pacotes e fidelidade
12. Avaliações, reputação e portfólio
13. Marketplace e descoberta
14. Multiunidade e escala operacional de redes

> A lógica da ordem: confiança e conversão primeiro; depois receita; depois a infraestrutura operacional
> (Redis/workers) que **lembretes, webhooks e cobrança exigem**; só então notificações automáticas e
> pagamentos. Marketplace e app completo ficam por último.

---

## 5. Primeiras transições aditivas já preparadas pelo MVP (caminho de menor atrito)

Itens cujo ponto de extensão **já existe** no MVP — bons candidatos a abrir a evolução:

- **Config por empresa de política de agenda:** `organization_booking_settings` (horizonte,
  `min_schedule_notice_min` — hoje constantes no `shared`). Mover de constante → config é aditivo.
- **Redis / multi-instância:** trocar a impl de `RateLimiter` (memória → Redis) e o publisher (in-process
  → pub/sub) sem tocar controller/regra — destrava zero-downtime multi-instância. **Exige ADR.**
- **Notificações automáticas:** novas implementações de `NotificationSender` (WhatsApp/SMS), apoiadas em
  workers/fila (depende do item de escala). **Exige ADR de provider.**
- **Multi-org simultâneo:** path-scoped (`/organizations/:orgId/...`) substitui o claim `org`; o guard já
  resolve o tenant em `resolveActiveOrg`, então a troca da fonte fica isolada.
- **Buffers/ocupação real:** mudam o intervalo ocupado para `no_overlap` e availability — **não é campo
  trivial**, **exige ADR** antes de schema.

---

## 6. Decisões que exigem ADR antes de qualquer PR (POST_MVP §9)

Abrir ADR **antes** de implementar:

- App mobile: Expo/React Native vs nativo
- Identidade global do cliente final
- Modelo conceitual de multiunidade (unidade filha de `organization` vs camada agrupadora)
- Pagamentos de clientes e gateway oficial
- Billing SaaS: planos, trial, cobrança, grace period, feature flags por plano
- Camada de entitlements e limites por plano
- WhatsApp/SMS provider
- Marketplace e critérios de ranking
- Reviews e moderação
- Buffers e ocupação real da agenda
- Redis / multi-instância
- Workers separados e zero-downtime operacional
- Outbox/fila genérica para notificações, webhooks e jobs
- Armazenamento de mídia e ownership **sem FK polimórfica**
- SSR/SEO das páginas públicas vs fetch público client-side e rate limit por IP real
- Política de retenção/anonimização para `users`/staff (lacuna conhecida do MVP)
- Lista de espera e regra de priorização
- Cache público de vitrine sem vazar disponibilidade sensível

---

## 7. Guardrails para não contaminar a evolução (POST_MVP §10)

- Não criar FK polimórfica `owner_type`/`owner_id` para mídia.
- Não duplicar política de cancelamento entre settings e perfil público.
- Não duplicar `slot_interval_min` sem ADR.
- Não criar tabela de perfil profissional se uma extensão de `professionals` resolver.
- Não colocar billing/entitlements como condicionais soltas no front.
- Não iniciar pagamentos ou notificações automáticas sem workers/fila/outbox adequados.
- Não transformar lista de espera em reserva invisível.
- Não promover SEO/SSR de disponibilidade sem resolver rate limit por IP real.
- Não decidir multiunidade tarde demais se o público passar a incluir redes.

---

## 8. Lacunas do MVP a endereçar cedo no pós-MVP

- **Esquecimento/anonimização de `users`/staff** (sem caminho no MVP — ADR-016 v3 / PLANNING §13): entra
  na fase de retenção/LGPD ampliada (item 8 da sequência macro). **Exige ADR.**
- **Auto-complete de `CONFIRMED` no passado** (hoje só rótulo de UI "pendente de desfecho"): decisão de
  produto com ADR próprio; alimenta relatórios (taxa de no-show/ocupação).
- **Força do anti-abuso por telefone / CGNAT** (ADR-024): se houver abuso, resposta proporcional é
  captcha invisível no POST público — **não** apertar o limite por IP.

---

## 9. Checklist de prontidão para a primeira fase pós-MVP

- [ ] Pré-condições da seção 1 satisfeitas.
- [ ] Fase escolhida da sequência macro (seção 4) definida.
- [ ] ADR(s) necessário(s) (seções 6/8) aberto(s) e aceito(s).
- [ ] Roadmap específico da fase criado (PRs pequenos + dependências + critérios de aceite).
- [ ] Decisões espelhadas nos documentos centrais quando alteram produto/HTTP/SQL.
- [ ] Núcleo do MVP preservado (sem regressão em anti-conflito/RLS/idempotência/real-time/LGPD).
- [ ] Guardrails da seção 7 conferidos.

---

## 10. Relação com os documentos

Este plano é **complementar** e de transição. As fontes de verdade continuam sendo
`ARCHITECTURE_DECISIONS.md`, `DATABASE_SCHEMA_V2.md`, `API_CONTRACTS.md`, `PLANNING.md` e
`IMPLEMENTATION_ROADMAP.md` (MVP), com o `POST_MVP_PRODUCT_ROADMAP.md` orientando a direção futura.
Nenhuma decisão futura altera o MVP automaticamente: ela vira **ADR**, é espelhada nos documentos
centrais e só então entra em um roadmap executável.
