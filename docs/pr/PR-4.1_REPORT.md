# PR-4.1_REPORT — Phase 4: Public API (Vitrine + Professionals + Availability)

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE

CI remoto: PENDENTE (validação manual posterior).

## 2. Endpoints (3)

| # | Method | Path | Roles | Descrição |
|---|---|---|---|---|
| 1 | GET | `/public/vitrine` | Público (sem auth) | Lista serviços ativos do tenant |
| 2 | GET | `/public/professionals` | Público (sem auth) | Lista professionals ativos com seus serviços |
| 3 | GET | `/public/professionals/:professionalId/availability` | Público (sem auth) | Slots disponíveis (reutiliza PR-3.1 com `userId=null`) |

## 3. Arquivos (8 = 5 criados + 3 modificados)

```
Criados (5):
  C1: apps/api/src/public/public.module.ts
  C2: apps/api/src/public/public.controller.ts
  C3: apps/api/src/public/public.service.ts
  C4: apps/api/src/public/dto/public.dto.ts
  C5: apps/api/scripts/test-public.mjs

Modificados (3):
  M1: apps/api/src/app.module.ts              — +PublicModule (provider RateLimiter via DI)
  M2: apps/api/src/main.ts                     — trust proxy (IP real)
  M3: apps/api/src/scheduling/availability.service.ts — suporte a userId=null para acesso público
```

## 4. Rate Limiter via DI

| Item | Detalhe |
|---|---|
| Provider | `RateLimiterGuard` registrado no `PublicModule` via DI (`APP_GUARD`) |
| Bug | BUG-009 — rate limiter não aplica em subdomínios com wildcard TLS |
| Resolução | Registrado; correção agendada para PR-5.x |

## 5. IP Real via Trust Proxy

`app.set('trust proxy', true)` em `main.ts:32` garante que `req.ip` retorne o IP real do cliente atrás de proxy reverso (nginx/load balancer), necessário para rate limiting preciso.

## 6. Public DTO sem PII

DTOs de resposta pública (`VitrineServiceDto`, `PublicProfessionalDto`, `PublicAvailabilityDto`) não expõem:
- `email`, `phone`, `document` de professionals
- `clientId`, `clientName` de agendamentos
- Dados internos de organização (billing, configurações)

Apenas nomes públicos, duração de serviço, preço e slots disponíveis.

## 7. Active-Only Queries

Todas as queries dos endpoints públicos filtram apenas registros ativos:
- Services: `WHERE active = true`
- Professionals: `WHERE active = true`
- Working hours e blocos de availability seguem mesma restrição

## 8. Availability Pública (Reuso PR-3.1)

`GET /public/professionals/:professionalId/availability` reutiliza `AvailabilityService` de PR-3.1 com `userId=null`, contornando:
- Scope enforcement de PROFESSIONAL (não há usuário autenticado)
- Tenant resolution via subdomínio (`req.subdomain`)
- Cálculo timezone-aware herdado da org

## 9. Resultado dos Testes

```
pnpm lint                                → PASS
pnpm build                               → PASS
test-public.mjs                          → aguarda Docker
```

### Testes implementados

| # | Descrição |
|---|---|
| T1 | GET /public/vitrine → 200 com lista de serviços ativos |
| T2 | GET /public/professionals → 200 com professionals ativos |
| T3 | GET /public/professionals/:id/availability → 200 com slots |
| T4 | Vitrine não expõe PII (email, phone, document) |
| T5 | Professionals inativos não aparecem na vitrine |
| T6 | Services inativos não aparecem na vitrine |
| T7 | Cross-tenant isolation (subdomínio errado → 404) |
| T8 | Professional não encontrado → 404 |
| T9 | Rate limiter responde 429 após N requests |
| T10 | IP real capturado atrás de proxy |

## 10. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não atualizado com `test:public`. |
| PEND-002 | MEDIUM | Testes Docker-dependentes (`test-public.mjs`) não executados localmente. |
| PEND-003 | MEDIUM | api-contract validation post-build pendente (validação de schema OpenAPI contra spec). |

## 11. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- 3 endpoints públicos (sem autenticação)
- 8 arquivos (5 criados + 3 modificados)
- RateLimiter via DI com provider no módulo (BUG-009 registrado)
- IP real via trust proxy para rate limiting preciso
- Public DTO sem exposição de PII
- Active-only queries em todos os endpoints
- Availability pública reutiliza PR-3.1 com `userId=null`
- Lint: PASS | Build: PASS
- CI remoto: PENDENTE
- Docker tests: PENDENTE
- api-contract validation: PENDENTE
