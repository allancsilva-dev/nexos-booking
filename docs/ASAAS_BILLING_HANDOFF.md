# Handoff — Billing SaaS com ASAAS

> Atualizado em 2026-07-13. Este documento é o ponto de retomada da integração.

## 1. Estado atual

O billing SaaS está implementado no código, mas **a cobrança real ainda não está ativada**.

- Migração `0012_saas_billing.sql` criada e validada em banco descartável.
- Trial, planos, checkout, webhook, carência e bloqueio de escrita implementados.
- Página `/settings/billing` e avisos globais implementados.
- Builds, lint, testes de contrato e smoke HTTP local passaram.
- Nenhum checkout real foi executado no Sandbox porque não havia uma API key ASAAS.
- `BILLING_ENFORCEMENT_ENABLED` permanece `false` por padrão para impedir bloqueios antes da homologação.
- A migration foi aplicada somente ao banco descartável `nexos_migrations_gate`; ainda precisa ser aplicada no ambiente que será usado na próxima etapa.

## 2. Decisões fechadas

| Regra | Decisão |
|---|---|
| Trial | 7 dias sem solicitar cartão no cadastro |
| Titular da assinatura | Organização, não usuário individual |
| Ofertas | Mesmo conjunto de recursos em três ciclos |
| Mensal | R$ 59,90, cobrado mensalmente |
| Semestral | R$ 323,40 antecipados |
| Anual | R$ 575,00 antecipados |
| Pagamento inicial | Somente cartão de crédito |
| Checkout | Página hospedada pelo ASAAS; o Nexos não recebe dados do cartão |
| Confirmação | Somente webhook confirma pagamento; callback do navegador não libera acesso |
| Falha de renovação | 3 dias de carência |
| Após expiração | Modo somente leitura e bloqueio de novos agendamentos públicos |
| Dados existentes | Nunca são apagados por inadimplência |
| Cancelamento | Impede próxima renovação e mantém acesso até o fim do período pago |
| Troca de ciclo | Somente depois do fim do período vigente na primeira versão |
| Organizações anteriores | Recebem novo trial de 7 dias quando a migration for aplicada |

Cancelamentos públicos de agendamentos existentes continuam disponíveis mesmo quando a assinatura está
expirada. Isso evita prender o cliente final em um horário que não poderá utilizar.

## 3. Onde está a implementação

- Banco e seeds: `apps/api/db/migrations/0012_saas_billing.sql` e `apps/api/db/schema/index.ts`.
- Integração HTTP ASAAS: `apps/api/src/billing/asaas.provider.ts`.
- Regras, conciliação e períodos: `apps/api/src/billing/billing.service.ts`.
- Inbox/worker de webhooks: `apps/api/src/billing/billing.repository.ts` e `billing-webhook.worker.ts`.
- Bloqueio centralizado: `apps/api/src/billing/subscription-access.interceptor.ts`.
- Contratos compartilhados: `packages/shared/src/dto/billing.dto.ts`.
- Interface: `apps/web/components/billing/billing-screen.tsx`, `billing-banner.tsx` e
  `apps/web/app/(authenticated)/settings/billing/page.tsx`.
- Contrato HTTP resumido: `docs/API_CONTRACTS.md`, seção 24.

## 4. Configuração necessária

| Variável | Sandbox | Produção |
|---|---|---|
| `ASAAS_API_KEY` | Chave criada em `sandbox.asaas.com` | Chave exclusiva da conta aprovada em produção |
| `ASAAS_API_BASE_URL` | `https://api-sandbox.asaas.com/v3` | `https://api.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | Segredo aleatório exclusivo | Outro segredo aleatório exclusivo |
| `PUBLIC_APP_URL` | URL HTTPS acessível pelo ASAAS | `https://booking.nexostech.com.br` ou domínio vigente |
| `BILLING_ENFORCEMENT_ENABLED` | `false` durante homologação | `true` somente após o checklist final |

As chaves de Sandbox e produção são independentes. Nunca colocar `ASAAS_API_KEY` no frontend, em logs,
commits ou mensagens. O token do webhook não deve ser igual à API key.

## 5. Checklist para continuar

1. Criar ou acessar a conta no Sandbox ASAAS e gerar uma API key.
2. Gerar um token aleatório forte para `ASAAS_WEBHOOK_TOKEN`.
3. Configurar as cinco variáveis acima mantendo o enforcement desativado.
4. Aplicar a migration no ambiente de homologação conforme o tipo de banco:

   Banco descartável, que pode ser recriado integralmente:

   ```bash
   pnpm --filter @nexos/api migrate:fresh
   ```

   Banco local existente que já está em `0011`:

   ```bash
   docker compose exec -T postgres sh -lc \
     'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < apps/api/db/migrations/0012_saas_billing.sql
   ```

   Na VPS, usar `deploy/vps/apply-migrations.sh`, que consulta `schema_migrations` e aplica somente arquivos
   pendentes. **Não usar `pnpm --filter @nexos/api migrate:apply` em um banco já migrado**, pois o runner
   local atual não mantém histórico e tentará executar também `0001`–`0011`.

5. Publicar API e web em uma URL HTTPS alcançável pelo ASAAS.
6. No painel ASAAS, cadastrar o webhook:

   ```text
   https://SEU_DOMINIO/api/v1/billing/webhooks/asaas
   ```

   Configurar o mesmo token em `asaas-access-token` e habilitar eventos de pagamentos e assinaturas,
   principalmente criação, confirmação, recebimento, atraso, falha de captura, estorno, chargeback,
   inativação e exclusão.

7. Criar uma organização de teste e confirmar `TRIALING` em `/settings/billing`.
8. Abrir cada plano e verificar valores, ciclo, callbacks e preenchimento do checkout.
9. Simular no Sandbox:
   - cartão aprovado;
   - cartão recusado;
   - evento duplicado;
   - pagamento atrasado e recuperação dentro da carência;
   - estorno/chargeback;
   - cancelamento de renovação.
10. Confirmar que `PAYMENT_CONFIRMED` ativa a conta e que o simples retorno do checkout não ativa.
11. Verificar a tabela `billing_webhook_events`: não deve haver eventos presos em `FAILED`.
12. Executar novamente os gates abaixo.
13. Só depois alterar `BILLING_ENFORCEMENT_ENABLED=true` e repetir um teste de escrita e booking público.

## 6. Gates já executados

```bash
pnpm --filter @nexos/shared build
pnpm --filter @nexos/api build
pnpm --filter @nexos/api lint
pnpm --filter @nexos/api test:billing
pnpm --filter @nexos/web lint
pnpm --filter @nexos/web build
pnpm --filter @nexos/api migrate:fresh
```

Resultados em 2026-07-13: todos passaram. Também passou um smoke HTTP local cobrindo cadastro, criação do
trial, listagem dos três planos, escrita durante o trial, rejeição de webhook sem token e aceitação com token.

## 7. Comportamento esperado após ativação

- `TRIALING` antes de `trialEndsAt`: acesso completo.
- `CHECKOUT_PENDING`: trial continua válido até seu término; fora dele, permanece somente leitura.
- `ACTIVE`: acesso completo até `currentPeriodEndsAt`.
- `PAST_DUE`: acesso completo somente até `graceEndsAt`.
- `CANCEL_AT_PERIOD_END`: acesso completo até o período pago terminar, sem nova renovação.
- `EXPIRED`/`CANCELED`: leituras, billing e cancelamentos existentes funcionam; demais mutações retornam
  HTTP `402` com `SUBSCRIPTION_REQUIRED`.

Se houver incidente, definir `BILLING_ENFORCEMENT_ENABLED=false` remove imediatamente o bloqueio no Nexos
sem apagar assinaturas ou histórico. Se já existirem assinaturas reais, também é necessário decidir se elas
continuarão ou serão canceladas no ASAAS; desabilitar o guard não interrompe cobranças no provedor.

## 8. Limitações aceitas da primeira versão

- Sem Pix, boleto, cupom, nota fiscal ou reembolso automático.
- Sem e-mails automáticos de fim de trial ou falha de pagamento; existem apenas avisos no painel.
- Sem alteração de ciclo durante um período pago.
- Sem níveis diferentes de recursos/entitlements; os três ciclos entregam o mesmo produto.
- Sem painel administrativo interno para editar preços; os valores são seeds no banco.
- Pagamentos dos clientes finais e taxa contra no-show continuam fora deste módulo.
- O fluxo real de checkout e os formatos finais dos webhooks ainda precisam ser confirmados no Sandbox.

## 9. Referências ASAAS

- [Sandbox](https://docs.asaas.com/docs/sandbox)
- [Checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente)
- [Eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas)
- [Introdução a webhooks](https://docs.asaas.com/docs/sobre-os-webhooks)
- [FAQ de assinaturas](https://docs.asaas.com/docs/faq-assinaturas)
