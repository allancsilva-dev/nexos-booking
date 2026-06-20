# PR 4.2 — Relatório

## Status
**PASS_PROVISÓRIO_CI_PENDENTE**

## Resumo

### Endpoints
- **POST** `/booking` — Criação de agendamento (público)
- **POST** `/booking/cancel/preview` — Prévia de cancelamento (público)
- **POST** `/booking/cancel` — Cancelamento (público)

### Segurança e Fluxo
- **PublicTenantGuard**: resolve `slug` do tenant **antes** da verificação de idempotência, garantindo que requisições idempotentes sejam corretamente associadas ao tenant.
- **IdempotencyInterceptor**: fallback para `publicTenant` quando o header `X-Tenant-Id` não está presente, permitindo idempotência em endpoints públicos.
- **Rate limits**:
  - `POST /booking`: 10 req/min por IP + 5 req/hora por SHA-256 do telefone
  - `POST /booking/cancel*`: 20 req/min
  - `GET`: 60 req/min (global)
- **Token de cancelamento**: gerado via SHA-256 (somente dados do body), com status HTTP 410 em endpoints públicos quando o agendamento já foi cancelado (terminal).
- **LGPD**: consentimento obrigatório com gate temporal (15 min / 90 dias / grade de slots).

### Correções pós-builder (4 fixes)
1. `PublicTenantGuard` — ordem de resolução slug vs idempotência
2. `IdempotencyInterceptor` — fallback `publicTenant`
3. `@Idempotent` — ajuste de decorator/parametrização
4. Rate limits — refinamento de thresholds

### Build
- **Lint**: PASS
- **Build**: PASS

### Pendências
- CI remoto
- Testes Docker
