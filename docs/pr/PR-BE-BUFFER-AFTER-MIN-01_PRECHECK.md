# 2026-06-26 PR-BE-BUFFER-AFTER-MIN-01 — Precheck de Governança

## Status

**BLOCKED**

## Contexto Inicial

- Pedido: adicionar buffer pós-atendimento configurável e desligável, para impedir agendamentos colados sem pausa operacional.
- Decisão de produto ratificada pelo humano em 2026-06-26:
  - buffer por **serviço**
  - `NULL`/`0` = desligado
  - `> 0` = ligado
  - sem boolean separado
- Proposta já registrada e ratificada em `docs/BUGFIX_LOG.md`, mas ainda não formalizada como PR executável na trilha canônica.

## PR Analisado

- **ID proposto:** `PR-BE-BUFFER-AFTER-MIN-01`
- **Título proposto:** Buffer pós-atendimento por serviço
- **Origem atual:** `docs/BUGFIX_LOG.md` (proposta ratificada, ainda não promovida a PR formal)

## Gates Executados

- `architect-guardian`
- `design-auditor`
- `db-guardian`
- `api-contract-guardian`
- `security-auditor`

## Pareceres Consolidados

### 1. `architect-guardian`

- **Veredito:** `BLOCKED`
- **Motivo:**
  - o PR **não existe** no roadmap canônico ativo;
  - a trilha ativa segue sendo `docs/WEB_IMPLEMENTATION_ROADMAP.md`;
  - a trilha ainda declara `PR-VERIFY-RLS-RUNTIME-01` como gate bloqueante antes de builds tenant-scoped.

### 2. `design-auditor`

- **Veredito:** `PASS_COM_RESSALVA`
- **Mapa técnico coerente** com a proposta ratificada:
  - `services.buffer_after_min`
  - enforcement no banco
  - availability e POST com semântica idêntica
  - último slot do dia só existe se `endsAt + buffer` couber na jornada

### 3. `db-guardian`

- **Veredito:** `PASS_COM_RESSALVA`
- **Direção recomendada:**
  - adicionar `appointments.occupied_until`
  - migrar `no_overlap` para `tstzrange(starts_at, occupied_until, '[)')`
  - manter `ends_at` como fim real do atendimento
- **Risco principal:** migration forward-only e coerência total banco ↔ availability ↔ POST.

### 4. `api-contract-guardian`

- **Veredito:** `PASS_COM_RESSALVA`
- **Contrato afetado:**
  - DTO de serviço no `packages/shared`
  - create/update service
  - comportamento de availability/booking
- **Regra:** mudança aditiva; `packages/shared` continua fonte única.

### 5. `security-auditor`

- **Veredito:** `PASS`
- **Sem blocker novo**, desde que:
  - nenhuma PII nova entre em `metadata`;
  - rotas públicas mantenham rate limit;
  - não haja bypass de tenant.

## Causa Raiz

- O sistema atual separa:
  - duração real do serviço;
  - passo/cadência de início dos slots;
  - conflito por `starts_at..ends_at`.
- Hoje **não existe** buffer entre atendimentos:
  - `availability` considera apenas `duration_min`;
  - booking público considera apenas `duration_min`;
  - constraint `no_overlap` cobre apenas `starts_at..ends_at`.

## Impacto

- Operação permite agenda colada sem pausa.
- Último horário do dia pode ser oferecido mesmo quando não sobra tempo operacional após atendimento.
- O problema afeta disponibilidade, booking e anti-conflito do banco.

## Texto Pronto Para Formalização Em Roadmap

> Observação: texto abaixo é **proposta** para promoção do PR na trilha canônica. Não foi aplicado automaticamente.

```md
### PR-BE-BUFFER-AFTER-MIN-01 — Buffer pós-atendimento por serviço

- **Problema:** a agenda permite agendamentos consecutivos sem pausa operacional entre atendimentos. `availability`, validação de booking e a constraint `no_overlap` consideram apenas `starts_at..ends_at`, ignorando tempo de buffer.
- **Proposta:** mudança aditiva para suportar `services.buffer_after_min` (nullable; `NULL`/`0` = desligado). O intervalo ocupado passa a considerar o buffer pós-atendimento para conflito e cálculo de disponibilidade. `ends_at` continua sendo o fim real exibido ao cliente; o enforcement de conflito usa intervalo ocupado estendido.
- **Escopo proibido:** `buffer_before_min`, override por profissional, processing time, qualquer mudança fora de agenda/serviços/shared/web administrativo.
- **Aceite:** com `buffer_after_min > 0`, agendamento colado é rejeitado com `409 APPOINTMENT_CONFLICT`; availability não oferece slot cujo `endsAt + buffer` ultrapasse jornada; com `NULL`/`0`, comportamento atual permanece.
- **Gate:** antes de ajustes web de serviços/agenda que exponham buffer no admin.
```

## Nota De Sequenciamento Proposta

```md
- **Nota de sequenciamento:** este PR só começa após `PR-VERIFY-RLS-RUNTIME-01` constar formalmente como `PASS` na trilha, ou após ratificação explícita de que as evidências já registradas no `BUGFIX_LOG` satisfazem esse gate.
```

## Mapa 5b Proposto

### Arquivos a tocar

- `apps/api/db/schema/index.ts`
- nova migration após `0009`
- `apps/api/src/services/**`
- `apps/api/src/scheduling/availability.service.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/public-booking/public-booking.service.ts`
- `packages/shared/src/dto/service.dto.ts`
- schemas/hooks/form de serviço no web admin

### Arquivos a não tocar

- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/DATABASE_SCHEMA_V2.md`
- `docs/API_CONTRACTS.md`
- `docs/PLANNING.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/WEB_IMPLEMENTATION_ROADMAP.md`
- auth/RLS base fora do escopo do PR

## Invariantes Que Precisam Sobreviver

- `ends_at` continua fim real exibido ao cliente.
- Conflito de agenda deve usar intervalo ocupado com buffer.
- `NULL`/`0` preserva comportamento atual.
- Availability e POST usam mesma semântica.
- Âncora da grade do ADR-023 permanece intacta.
- Sem `organization_id` livre.
- Sem PII nova em logs/event metadata/socket.

## Testes Necessários Na Implementação

- buffer bloqueia agendamento colado;
- `NULL`/`0` preserva comportamento atual;
- availability não oferece slot quando `endsAt + buffer` estoura jornada;
- coerência POST ↔ availability mantida;
- constraint de banco continua barrando corrida/conflito.

## Arquivos Alterados

- `docs/pr/PR-BE-BUFFER-AFTER-MIN-01_PRECHECK.md`

## APIs/Contratos Impactados

- `services` create/update/read
- `availability`
- `POST /appointments`
- `POST /public/:orgSlug/appointments`
- `packages/shared` DTOs de serviço

## Decisões Preservadas

- enforcement no banco, não advisory-only;
- buffer por serviço, não por profissional;
- `NULL`/`0` como chave de desligamento;
- sem `buffer_before_min` nesta fase;
- docs canônicos não foram alterados nesta etapa.

## Testes Executados

- **Nenhum teste runtime/código executado** nesta etapa.
- Esta entrega é apenas governança + rastreabilidade.

## Pendências E Ressalvas

- `PR-BE-BUFFER-AFTER-MIN-01` ainda precisa ser promovido a PR formal na trilha.
- Sequenciamento com `PR-VERIFY-RLS-RUNTIME-01` precisa de decisão documental explícita.
- Implementação ainda depende de builders e testes após autorização.

## Veredito Final

**BLOCKED**

- **Pode implementar tecnicamente:** sim.
- **Pode começar agora pelo processo do repo:** não.
- **Bloqueio atual:** PR ainda não formalizado na trilha + conflito de sequenciamento com gate de RLS.
