# BUGFIX_LOG — Registro de erros e correções (`nexos-booking`)

> Documento vivo. Registra **durante o desenvolvimento** todo erro encontrado e sua correção, do mais
> simples ao crítico. Objetivo: rastreabilidade ("o que quebrou, por quê, como foi corrigido e como
> sabemos que está resolvido") sem depender de memória.
>
> Regras de uso:
> - Um erro = uma entrada. Não agrupar erros distintos numa linha só.
> - Preencher **todos** os campos. "Não se aplica" é uma resposta válida e explícita; campo em branco não.
> - **Nunca** registrar PII crua (telefone, e-mail, nome de cliente), segredo, token ou stack com dados
>   sensíveis. Telefone, se inevitável, vai mascarado. Referenciar por ID/`requestId`.
> - Se o erro for uma **divergência entre documentos** descoberta na execução, registrar aqui e apontar
>   qual documento prevalece (hierarquia no `MVP_EXECUTION_PLAN.md`) **antes** de avançar.
> - Status possível: `ABERTO` · `EM_ANÁLISE` · `RATIFICADA` · `PARCIALMENTE_IMPLEMENTADA` · `CORRIGIDO` · `VALIDADO` · `NÃO_REPRODUZ` · `ACEITO_COMO_PENDÊNCIA`.
> - Severidade: `BLOQUEANTE` · `ALTA` · `MÉDIA` · `BAIXA`.
>
> **Nota de nomenclatura (extensão acordada do modelo):** além de `BUG-NNN`, este ledger registra
> **`PROP-*`** (propostas que mudam canônico — exigem ADR/ratificação antes de implementar) e **`DIV-*`**
> (divergências documentais), seguindo a nomenclatura do `WEB_IMPLEMENTATION_ROADMAP.md`. Mesmos campos
> obrigatórios; o ID indica a natureza.

---

## Como preencher uma entrada (campos obrigatórios)

- **ID:** `BUG-NNN` (sequencial).
- **Data:** quando foi encontrado.
- **PR/Fase:** em qual PR/fase o erro apareceu (ex.: `PR-3.3` / Fase 3).
- **Severidade:** `BLOQUEANTE`/`ALTA`/`MÉDIA`/`BAIXA`.
- **Erro encontrado:** descrição objetiva do que falhou.
- **Sintoma:** como se manifestou (mensagem, status HTTP, comportamento observado, `requestId`).
- **Causa raiz:** a origem real, não o sintoma.
- **Impacto:** o que/quem é afetado (dado, fluxo, segurança, tenant, usuário).
- **Arquivo(s) afetado(s):** caminhos tocados.
- **Correção aplicada:** o que foi mudado para resolver.
- **Teste/validação executado:** como se provou que está resolvido (teste, comando, evidência).
- **Branch/commit relacionado** *(opcional):* onde a correção foi aplicada (branch, PR, hash).
- **Prevenção de regressão** *(opcional):* qual teste/guard impede o bug de voltar.
- **Status final:** estado da entrada ao fechar.

---

## Modelo de entrada (copiar para cada novo bug)

```
### BUG-000 — <título curto>
- Data: AAAA-MM-DD
- PR/Fase: PR-X.Y / Fase N
- Severidade: BLOQUEANTE | ALTA | MÉDIA | BAIXA
- Erro encontrado:
- Sintoma:
- Causa raiz:
- Impacto:
- Arquivo(s) afetado(s):
- Correção aplicada:
- Teste/validação executado:
- Branch/commit relacionado: (opcional)
- Prevenção de regressão: (opcional — qual teste impede o retorno)
- Status final: ABERTO | EM_ANÁLISE | RATIFICADA | PARCIALMENTE_IMPLEMENTADA | CORRIGIDO | VALIDADO | NÃO_REPRODUZ | ACEITO_COMO_PENDÊNCIA
```

---

## Índice de bugs

| ID | Data | PR/Fase | Severidade | Título | Status |
|---|---|---|---|---|---|
| BUG-012 | a confirmar | PR-1.4 → PR-BUGFIX-1 | BLOQUEANTE | Runtime conecta como role superuser → RLS inerte (= PEND-001) | ABERTO |
| PROP-E1 | a confirmar | Pré-PR backend (web) | ALTA | Snapshot de preço no agendamento | EM_ANÁLISE |
| PROP-E2 | 2026-06-23 | PR-PROP-E2-PROFESSIONAL-SERVICES-CONTRACT-01 · PR-BE-PROF-SVC (E2a) | ALTA | Exigir vínculo `professional_services` na reserva/disponibilidade | PARCIALMENTE_IMPLEMENTADA |
| PROP-E2b | 2026-06-23 | Pré-WEB-7A | ALTA | Vitrine pública relacionar serviço ↔ profissional | ABERTO |
| PROP-E2c | 2026-06-23 | Pré-WEB-3 · PR-PROP-E2C-PROFESSIONAL-SERVICES-MGMT-01 | ALTA | API de gerenciamento do vínculo `professional_services` | RATIFICADA |
| PROP-E4 | a confirmar | Transversal web | MÉDIA | Envelope de lista/paginação consistente | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-001 | 2026-06-23 | PR-DIAG-WEB | ALTA | Slug público inexistente retorna 500 | ABERTO |
| INV-WEB-002 | 2026-06-23 | PR-DIAG-WEB | ALTA | Cancelamento público com token inválido retorna 500 | ABERTO |
| INV-WEB-003 | 2026-06-23 | PR-DIAG-WEB | BAIXA | Divergência de nomenclatura entre DTOs shared e contrato/roadmap | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-004 | 2026-06-23 | PR-DIAG-WEB | BAIXA | `PasswordChangeInput` citado no contrato não exportado no shared | ABERTO |
| INV-WEB-005 | 2026-06-23 | PR-DIAG-WEB | BAIXA | Claims do access token não exportadas como schema no shared | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-006 | 2026-06-23 | PR-DIAG-WEB | ALTA | Web pública já existe parcialmente; roadmap/conductor partiam de premissa greenfield | ABERTO |
| INV-RLS-001 | 2026-06-23 | PR-FIX-RLS-RUNTIME-ROLE-01 · PR-REVERIFY-RLS-RUNTIME-01 | ALTA | GRANT genérico de setup regrediu hardening append-only de audit_logs | CORRIGIDO |
| DIV-PR-4.3 | a confirmar | PR-4.3 / Fase 4 | BAIXA | Design-spec primária ausente | ACEITO_COMO_PENDÊNCIA |

> Atualizar esta tabela a cada nova entrada e a cada mudança de status.

---

## Registros

### BUG-012 — Runtime conecta como role superuser → RLS inerte (= PEND-001 canônico)
- Data: a confirmar na fonte (identificado na janela PR-1.4 → PR-BUGFIX-1)
- PR/Fase: PR-1.4 (origem) · reafirmado em PR-BUGFIX-1 · fix planejado em PR-FIX-3
- Severidade: BLOQUEANTE
- Erro encontrado: a API em runtime conecta ao Postgres com a role `nexos_booking`, que tem
  `rolsuper=true`/`rolbypassrls=true`. Sob superuser/`BYPASSRLS`, a RLS **não é aplicada** mesmo com as
  policies criadas — o isolamento de tenant passa a depender **apenas** dos guards de aplicação.
- Sintoma: não há erro visível em runtime (é justamente o risco); detectável só por inspeção de catálogo
  (`pg_roles`/`pg_stat_activity`) e por teste cross-tenant direto no banco. CI também não roda por falta
  de paridade da role (faceta PEND-001, abaixo).
- Causa raiz: o ambiente conecta com role privilegiada (dona do schema / superuser) em vez da role
  least-privilege `app_runtime` especificada em `DATABASE_SCHEMA_V2 §10.2` e `ARCHITECTURE_DECISIONS`
  (ADR-001, item least-privilege). A criação/uso da role `app_runtime` (sem `BYPASSRLS`/`SUPERUSER`/DDL)
  é pré-requisito de infra (§10.2) que não foi efetivado no ambiente.
- Impacto: **segurança/multi-tenant.** Com RLS inerte, a defesa em profundidade do ADR-001 não existe:
  um repository que esqueça o `WHERE organization_id = …` vaza linha de outro tenant sem o banco barrar.
  **Bloqueante para qualquer escrita tenant-scoped a jusante** (toda a fase WEB-1+ depende disto provado).
  Bloqueia PEND-Fase5 (isolamento cross-tenant nunca provado pelo banco).
- Arquivo(s) afetado(s): `apps/api/src/db/**` (db.config / módulo db) e provisionamento de infra (role
  `app_runtime`, fora da migration versionada — §10.2). *Diagnóstico é read-only; nenhum arquivo é tocado
  por esta entrada.*
- Correção aplicada: **nenhuma ainda.** Diagnóstico objetivo via `PR-VERIFY-RLS-RUNTIME-01` (read-only);
  correção é o futuro `PR-FIX-3` (provisionar/usar `app_runtime`), fora do escopo do VERIFY.
- Teste/validação executado: **NÃO EXECUTADO** até o VERIFY. Provas exigidas (6): `pg_roles`
  (`rolsuper=false`/`rolbypassrls=false`); `current_user`/`pg_stat_activity` = `app_runtime`;
  `relrowsecurity=t AND relforcerowsecurity=t` nas tenant-scoped (§2/§10); teste cross-tenant negativo →
  0 linhas por força da policy; hash do commit do fix + ID do run de CI. "NÃO EXECUTADO nunca vira PASS."
- Branch/commit relacionado: PR-FIX-3 (a abrir) · run de CI (a registrar quando PEND-001 destravar a CI).
- Prevenção de regressão: teste cross-tenant negativo no banco como gate de CI; asserção de catálogo
  (`rolbypassrls=false`) no boot/health-check do ambiente.
- Status final: ABERTO
- **PEND-001 (faceta de pendência ligada, mesmo root/fix):** desde PR-1.4, a role least-privilege não tem
  paridade no ambiente de CI → a CI não roda. Mesmo `PR-FIX-3` resolve as duas facetas (runtime + CI).

### PROP-E1 — Snapshot de preço no agendamento (proposta — muda canônico)
- Data: a confirmar na fonte
- PR/Fase: pré-PR de backend da camada web (`PR-BE-SNAPSHOT`), gate antes de WEB-5B/WEB-7B
- Severidade: ALTA
- Erro encontrado: `appointments` (`DATABASE_SCHEMA_V2 §8.1`) não captura o preço no momento da reserva.
  Mudança futura de `services.price_cents` **corrompe o histórico**; não há backfill possível depois.
- Sintoma: estrutural/latente — relatórios de receita e pagamentos (POST_MVP P6/P10) ficariam sobre
  preço atual, não o preço cobrado. Sem manifestação até existir leitura de receita.
- Causa raiz: ausência de colunas de snapshot (`price_cents_snapshot`, `currency_snapshot`) gravadas na
  criação do agendamento (painel e público). Duração já é "fotografada" via `ends_at`.
- Impacto: integridade de histórico financeiro; bloqueia pagamentos e relatórios sem refactor profundo
  depois. **Muda canônico** (`DATABASE_SCHEMA_V2` + `API_CONTRACTS` de criação/leitura).
- Arquivo(s) afetado(s): migração aditiva de `appointments`; DTO de criação/leitura (`packages/shared`);
  serviço de criação (painel + público).
- Correção aplicada: **nenhuma** — é **PROPOSTA**. Exige ADR + migração **aditiva** ratificada **antes**
  de implementar. Escopo proibido: tocar `no_overlap`/`chk_interval`; mudar `service_id` como canônico.
- Teste/validação executado: a definir no PR — aceite: criar agendamento grava o snapshot; alterar o
  preço do serviço **não** muda agendamentos passados.
- Branch/commit relacionado: `PR-BE-SNAPSHOT` (a abrir após ADR).
- Prevenção de regressão: teste que altera `services.price_cents` e verifica imutabilidade do snapshot.
- Status final: EM_ANÁLISE (proposta aberta, aguardando ADR/ratificação)

### PROP-E2 — Exigir vínculo `professional_services` na reserva e na disponibilidade (proposta — muda canônico)
- Data: 2026-06-23
- PR/Fase: PR-PROP-E2-PROFESSIONAL-SERVICES-CONTRACT-01 (ratificação) · implementação no `PR-BE-PROF-SVC`
- Severidade: ALTA
- Erro encontrado: a junção `professional_services` (`§6.3`) existe, mas **não é exigida** em §15/§16/§17.
  Vitrine e painel podem marcar um profissional para um serviço que ele não presta.
- Sintoma: agendamento aceito para combinação profissional↔serviço inválida; a junção vira peso morto;
  evoluções "qualquer profissional" (`PLANNING §10.2`) e override por profissional ficam sem fonte de
  verdade.
- Causa raiz: regra de negócio "profissional oferece serviço" não é pré-condição nem filtro nas rotas de
  criação e disponibilidade.
- Impacto: correção de agenda e da vitrine pública; **muda canônico** (clarificação de contrato em
  §15/§16/§17 + código de erro dedicado `PROFESSIONAL_SERVICE_NOT_LINKED`).
- Arquivo(s) afetado(s): validação de criação (painel + público); `GET /availability`; `GET /public/:orgSlug`
  (relacionar serviço↔profissional, não listas planas); `packages/shared`.
- Correção aplicada: **nenhuma** — é **PROPOSTA RATIFICADA**. Implementação no `PR-BE-PROF-SVC`.
- Decisão ratificada (2026-06-23):
  1. `POST /appointments` (painel) rejeita profissional sem vínculo com o serviço → `422 PROFESSIONAL_SERVICE_NOT_LINKED`.
  2. `POST /public/:orgSlug/appointments` aplica a mesma validação.
  3. `GET /professionals/:id/availability` e `GET /public/:orgSlug/professionals/:slug/availability` rejeitam combinação inválida.
  4. `GET /public/:orgSlug` (vitrine) relaciona serviço ↔ profissional, sem listas independentes ambíguas.
  5. WEB-3 permite gerenciar o vínculo `professional_services`.
  6. A solução não bloqueia a evolução futura "qualquer profissional" (PLANNING §10.2).
- Teste/validação executado: a definir no `PR-BE-PROF-SVC`. Aceite (−): reservar profissional que não presta
  o serviço → `422`; vitrine não oferece a combinação.
- Branch/commit relacionado: `PR-BE-PROF-SVC` (a abrir, implementação).
- Prevenção de regressão: teste negativo de reserva com combinação inválida; teste de vitrine sem a
  combinação.
- Desmembramento (2026-06-23): PROP-E2 foi dividida em três partes após implementação parcial:
  * E2a (concluído): enforcement de `professional_services` em `POST /appointments`,
    `POST /public/:orgSlug/appointments`, `GET .../availability` (painel + público).
    Implementado pelo `PR-BE-PROF-SVC` (commit `744c077`). Adicionou `PROFESSIONAL_SERVICE_NOT_LINKED`
    no `API_CONTRACTS.md` §7/§15/§16/§17 e no `packages/shared`.
  * E2b (aberto — ver entrada PROP-E2b): vitrine pública (`GET /public/:orgSlug`) relacionar
    serviço ↔ profissional. Bloqueia WEB-7A.
  * E2c (aberto — ver entrada PROP-E2c): API/backend de gerenciamento do vínculo
    `professional_services`. Bloqueia WEB-3.
  WEB-5B e WEB-7B ficam desbloqueados apenas quanto à validação backend profissional-serviço (E2a),
  ainda respeitando PROP-E1.
- Status final: PARCIALMENTE_IMPLEMENTADA (E2a concluído; E2b e E2c pendentes — ver entradas próprias)

### PROP-E2b — Vitrine pública relacionar serviço ↔ profissional (desmembramento de PROP-E2 §4)
- Data: 2026-06-23
- PR/Fase: Pré-WEB-7A
- Severidade: ALTA
- Erro encontrado: `GET /public/:orgSlug` (`API_CONTRACTS §17.1`) retorna listas planas de `services` e
  `professionals`, sem expor a relação da junção `professional_services`. A vitrine pública não consegue
  saber quais profissionais prestam cada serviço.
- Sintoma: a vitrine pode exibir profissional para serviço que ele não presta; a informação de vínculo
  existe no banco (tabela `professional_services`, `DATABASE_SCHEMA_V2 §6.3`) mas não chega à resposta
  do endpoint.
- Causa raiz: PROP-E2 foi desmembrada após E2a; a vitrine (§17.1) ficou como escopo separado (E2b).
- Impacto: WEB-7A continua bloqueado até que a vitrine pública relacione serviço ↔ profissional.
  Sem isso, o booking público (WEB-7B) exibe combinações inválidas ao visitante.
- Arquivo(s) afetado(s): `apps/api/src/public-booking/` (controller + service de vitrine),
  `packages/shared/src/dto/public-vitrine.dto.ts`, `docs/API_CONTRACTS.md` §17.1.
- Correção aplicada: nenhuma — PR futuro.
- Teste/validação executado: a definir no PR.
- Gate: exige ratificação humana antes da implementação, pois altera `API_CONTRACTS.md` §17.1
  e DTO público.
- Status final: ABERTO

### PROP-E2c — API de gerenciamento do vínculo `professional_services` (desmembramento de PROP-E2 §5)
- Data: 2026-06-23
- PR/Fase: Pré-WEB-3
- Severidade: ALTA
- Erro encontrado: não existe endpoint/API para criar ou remover vínculos em `professional_services`.
  A tabela existe (`DATABASE_SCHEMA_V2 §6.3`) com FKs compostas tenant-safe, mas é apenas lida
  (nunca escrita) pelos repositórios de `appointments`, `public-booking` e `scheduling`.
- Sintoma: impossível vincular/desvincular serviços a profissionais via API. WEB-3 não tem superfície
  para gerenciar quais serviços cada profissional presta.
- Causa raiz: `API_CONTRACTS.md` §20.1/§20.2 não especificam endpoint de vínculo; o
  `ProfessionalsController` (`apps/api/src/professionals/professionals.controller.ts`) não implementa
  rota equivalente.
- Impacto: WEB-3 continua bloqueado até existir endpoint de gerenciamento de vínculo. O enforcement
  de E2a já rejeita combinações inválidas, mas sem a API de gestão o vínculo não pode ser criado
  pela interface.
- Arquivo(s) afetado(s): `apps/api/src/professionals/` (controller + service + repository),
  `packages/shared/src/dto/` (schemas de vínculo), `docs/API_CONTRACTS.md` §20.
- Correção aplicada: nenhuma — PR futuro (`PR-BE-PROF-SVC-MGMT`).
- Teste/validação executado: a definir no PR de implementação.
- Decisão ratificada (2026-06-23 — PR-PROP-E2C-PROFESSIONAL-SERVICES-MGMT-01):
  1. `GET /professionals/:id/services` — leitura dos vínculos atuais. Retorna
     `{ professionalId: uuid, serviceIds: uuid[] }`. `serviceIds: []` é válido.
  2. `PUT /professionals/:id/services` com `{ serviceIds: uuid[] }` — substituição total da lista de
     serviços vinculados ao profissional. Idempotente: replay com mesma lista = no-op. Duplicados no
     payload são deduplicados pelo backend.
  3. Concorrência: last-write-wins no MVP, sem `If-Match`/version.
  4. Roles: OWNER e MANAGER.
  5. Remoção de vínculo é permitida mesmo com agendamentos futuros existentes. Agendamentos existentes
     não são alterados. A remoção afeta apenas novos agendamentos (`POST /appointments`) e
     availability futura (`GET /availability`), ambos já protegidos pelo enforcement de E2a
     (`422 PROFESSIONAL_SERVICE_NOT_LINKED`).
  6. Nenhum `error.code` novo necessário. Erros: `404 NOT_FOUND` (profissional/serviço inexistente,
     inativo ou outro tenant), `422 VALIDATION_ERROR` (payload inválido), `403 AUTHZ_DENIED` (role).
  7. `organization_id` nunca no payload — vem do claim `org` (ADR-020). Queries dentro de
     `withTenantContext`. FKs compostas existentes garantem tenant safety no banco.
  8. Nenhuma migration/DDL necessária. Tabela `professional_services` já existe (schema §6.3).
- Emenda de validação (2026-06-23 — PR-DOC-PROP-E2C-AMEND-VALIDATION-01):
  1. `PUT /professionals/:id/services` é all-or-nothing. O backend deve validar todos os
     `serviceIds` antes de aplicar qualquer `DELETE`/`INSERT`. Se qualquer item for inválido,
     nenhum vínculo é alterado.
  2. Erros do `professionalId` no path: profissional inexistente, inativo ou de outro tenant →
     `404 NOT_FOUND`. O recurso-alvo da rota é o profissional; `404` no path é a convenção
     correta (§4).
  3. Erros de `serviceIds` no body (validados ANTES de qualquer mutação):
     * `serviceIds` ausente ou não-array → `422 VALIDATION_ERROR` com `details`.
     * Item que não é UUID → `422 VALIDATION_ERROR` com `details[{ field: "serviceIds[i]",
       issue: "invalid_uuid" }]`.
     * `serviceId` que não existe no escopo da organização atual ou não pode ser resolvido com
       segurança → `422 VALIDATION_ERROR` com `details[{ field: "serviceIds[i]", issue:
       "not_found" }]`. A mensagem/`details` NÃO deve revelar se o `serviceId` existe em outro
       tenant.
     * Motivo: `422` com `details[]` é a convenção do contrato para validação semântica de
       payload (§4). `404` fica reservado para o recurso do path. O envelope `VALIDATION_ERROR`
       não vaza existência cross-tenant.
  4. Serviço `inactive`: é permitido manter ou criar vínculo `professional_services` com serviço
     `active=false`. `active` controla exposição pública (vitrine), disponibilidade (availability)
     e novos bookings — não a existência do vínculo de configuração. O vínculo
     `professional_services` representa capacidade/configuração do profissional, não
     disponibilidade atual. Agendamentos e availability continuam protegidos pelas regras
     existentes: E2a já rejeita novas reservas para combinações sem vínculo; serviço `inactive`
     já não é oferecido em availability/booking independentemente do vínculo.
  5. Remoção de vínculo: `serviceIds` omitidos no `PUT` são removidos por delta. Remoção continua
     permitida mesmo com agendamentos existentes (item 5 da decisão original mantido).
  6. O `PR-BE-PROF-SVC-MGMT` deve materializar estas regras no `API_CONTRACTS.md`, DTOs/shared e
     backend.
- Status final: RATIFICADA (implementação pendente no `PR-BE-PROF-SVC-MGMT`)

### PROP-E4 — Envelope de lista/paginação consistente (proposta — DEFERIDA)
- Data: a confirmar na fonte
- PR/Fase: restrição transversal da camada web (não construída agora)
- Severidade: MÉDIA
- Erro encontrado: envelopes de resposta de lista inconsistentes entre endpoints, o que **fecharia** a
  porta para paginação aditiva por cursor no futuro.
- Sintoma: latente — só dói quando uma lista precisar paginar.
- Causa raiz: ausência de shape padronizado de lista.
- Impacto: evolutibilidade de API. **Deferida**: não se constrói agora, mas a restrição transversal do
  roadmap impede moldar DTO de lista de forma que feche a evolução.
- Arquivo(s) afetado(s): nenhum agora (apenas restrição de design nos PRs WEB).
- Correção aplicada: **nenhuma** — diferida. Mitigação ativa: respostas de lista devem seguir o shape
  canônico `{ items, nextCursor }` quando paginação/lista se aplicar (`API_CONTRACTS §1`), mesmo retornando
  tudo hoje.
- Teste/validação executado: não se aplica (deferida).
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: revisão de DTO de lista em cada PR-WEB (gate transversal).
- Status final: ACEITO_COMO_PENDÊNCIA (deferida; restrição transversal ativa)

### INV-WEB-001 — Slug público inexistente retorna 500
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: ALTA
- Erro encontrado: `GET /api/v1/public/:orgSlug` e `GET /api/v1/public/:orgSlug/professionals` retornam
  `500 INTERNAL_ERROR` para slug inexistente.
- Sintoma: ao consultar slug público inexistente, a API responde erro interno em vez de erro controlado.
- Causa raiz: a ser investigada em PR posterior; o PR-DIAG-WEB registrou o comportamento runtime, sem fix.
- Impacto: impacta WEB-7A. A vitrine pública precisa tratar slug inexistente como `404 NOT_FOUND`, não como
  falha genérica de servidor.
- Arquivo(s) afetado(s): nenhum neste PR documental. Correção futura deve ocorrer fora deste PR.
- Correção aplicada: nenhuma. Este PR apenas registra o achado.
- Teste/validação executado: PR-DIAG-WEB observou o retorno runtime `500 INTERNAL_ERROR`. Correção ainda
  **NÃO EXECUTADA**.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste negativo futuro para slug inexistente em `GET /api/v1/public/:orgSlug` e
  `GET /api/v1/public/:orgSlug/professionals`, esperando `404 NOT_FOUND`.
- Status final: ABERTO

### INV-WEB-002 — Cancelamento público com token inválido retorna 500
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: ALTA
- Erro encontrado: `POST /api/v1/public/cancel/preview` e `POST /api/v1/public/cancel` retornam
  `500 INTERNAL_ERROR` para token inválido.
- Sintoma: ao enviar token inválido, a API responde erro interno em vez de `410 Gone` com código de
  cancelamento inválido/expirado.
- Causa raiz: a ser investigada em PR posterior; o PR-DIAG-WEB registrou o comportamento runtime, sem fix.
- Impacto: impacta WEB-7C. A superfície pública de cancelamento deve ocultar estado interno e responder
  `410 Gone` para token inválido/expirado/já usado, conforme contrato.
- Arquivo(s) afetado(s): nenhum neste PR documental. Correção futura deve ocorrer fora deste PR.
- Correção aplicada: nenhuma. Este PR apenas registra o achado.
- Teste/validação executado: PR-DIAG-WEB observou o retorno runtime `500 INTERNAL_ERROR`. Correção ainda
  **NÃO EXECUTADA**.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: teste negativo futuro para `POST /api/v1/public/cancel/preview` e
  `POST /api/v1/public/cancel` com token inválido, esperando `410 Gone`.
- Status final: ABERTO

### INV-WEB-003 — Divergência de nomenclatura entre DTOs shared e contrato/roadmap
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: BAIXA
- Erro encontrado: há divergência de nomenclatura entre DTOs existentes em `packages/shared` e nomes citados
  no contrato/roadmap.
- Sintoma: rastreabilidade fica mais difícil para executor web ao cruzar contrato, roadmap e exports reais.
- Causa raiz: deriva documental/nomenclatural entre artefatos.
- Impacto: baixo; não bloqueia execução por si só, mas deve ser rastreado para evitar workaround local de
  contrato nos PRs WEB.
- Arquivo(s) afetado(s): nenhum neste PR documental. Correção futura, se necessária, deve respeitar a
  hierarquia documental.
- Correção aplicada: nenhuma. Registrado como rastreabilidade; não bloquear execução.
- Teste/validação executado: PR-DIAG-WEB inventariou a divergência. Correção **NÃO EXECUTADA**.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: em cada PR-WEB, se o tipo não existir no shared, parar e registrar divergência
  antes de workaround.
- Status final: ACEITO_COMO_PENDÊNCIA

### INV-WEB-004 — `PasswordChangeInput` citado no contrato não exportado no shared
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: BAIXA
- Erro encontrado: `PasswordChangeInput` é mencionado no contrato, mas não está exportado no
  `packages/shared`.
- Sintoma: consumidor web que seguir `API_CONTRACTS §21` não encontra o schema/tipo exportado.
- Causa raiz: lacuna de export no shared ou divergência de materialização do contrato.
- Impacto: baixo para a fase pública imediata, mas deve ser corrigido em PR posterior antes de tela/fluxo que
  consuma troca de senha.
- Arquivo(s) afetado(s): nenhum neste PR documental. Correção futura deve ocorrer fora deste PR.
- Correção aplicada: nenhuma. Este PR apenas registra o achado.
- Teste/validação executado: PR-DIAG-WEB inventariou a ausência de export. Correção **NÃO EXECUTADA**.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: validação futura de exports do shared contra `API_CONTRACTS §21`.
- Status final: ABERTO

### INV-WEB-005 — Claims do access token não exportadas como schema no shared
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: BAIXA
- Erro encontrado: claims do access token (`sub`, `org?`, `sid`) não são exportadas como schema no
  `packages/shared`.
- Sintoma: `API_CONTRACTS §21` cita os claims, mas não há schema compartilhado dedicado para o frontend.
- Causa raiz: decisão arquitetural de sessão centrada em `/auth/me`, não em decodificação de JWT pelo front.
- Impacto: baixo e intencional para a web. O frontend não deve decodificar token; a fonte única do estado de
  sessão é `/auth/me`.
- Arquivo(s) afetado(s): nenhum.
- Correção aplicada: **não corrigir por padrão**. Registrar como decisão intencional: claims não exportadas
  como schema no shared não são bloqueio enquanto a web seguir `/auth/me` como fonte única.
- Teste/validação executado: não se aplica; decisão de governança registrada.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: revisões web devem rejeitar lógica que decodifique access token no cliente para
  sintetizar sessão.
- Status final: ACEITO_COMO_PENDÊNCIA

### INV-WEB-006 — Web pública já existe parcialmente; premissa greenfield estava incorreta
- Data: 2026-06-23
- PR/Fase: PR-DIAG-WEB
- Severidade: ALTA
- Erro encontrado: o roadmap/conductor afirmavam que a web era apenas shell autenticado, mas o repo já contém
  páginas e componentes públicos: vitrine, booking flow, slot picker, confirmation screen e cancel form.
- Sintoma: a trilha ativa tratava WEB-7A/7B/7C como criação greenfield, quando o inventário mostra fluxos
  públicos parciais já presentes.
- Causa raiz: premissa de condução desatualizada após implementação parcial da web pública.
- Impacto: altera a condução da fase pública. WEB-7A/7B/7C devem ser tratados como auditar + reconciliar +
  completar + corrigir bugs públicos, e dependem das correções INV-WEB-001/002 antes da fase pública.
- Arquivo(s) afetado(s): `docs/WEB_IMPLEMENTATION_ROADMAP.md`, `.opencode/agents/conductor.md` e, como
  espelho ativo, `.claude/agents/conductor.md`.
- Correção aplicada: neste PR documental, a trilha de condução foi atualizada para refletir que a web pública
  não é greenfield.
- Teste/validação executado: validação documental por `rg`; nenhum build/teste funcional executado.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: novos handoffs WEB-7A/7B/7C devem partir de inventário/reconciliação, não de
  criação do zero.
- Status final: ABERTO

### DIV-PR-4.3 — Design-spec primária ausente (divergência documental)
- Data: a confirmar na fonte
- PR/Fase: PR-4.3 / Fase 4
- Severidade: BAIXA
- Erro encontrado: a especificação de design primária `nexos-booking-design-spec.md` não está no repo; a
  UI foi/é construída contra o complemento secundário `FRONTEND_DESIGN_REF.md`.
- Sintoma: divergência entre documento esperado e documento disponível na execução do frontend.
- Causa raiz: ausência do artefato primário de design no repositório.
- Impacto: risco de drift visual/UX se a spec primária aparecer depois divergindo do `FRONTEND_DESIGN_REF`.
  **Observação correlata:** o agente `frontend-builder.md` instrui o inverso (trata a spec primária como
  presente e o `FRONTEND_DESIGN_REF` como complemento opcional) — o fallback do agente não cobre o caso
  real (primária ausente). Reconciliar o `frontend-builder.md` a esta divergência.
- Arquivo(s) afetado(s): camada `apps/web` (referência de design); `frontend-builder.md` (instrução de fonte).
- Correção aplicada: nenhuma — registrado como divergência. **Documento que prevalece enquanto a primária
  não existir:** `FRONTEND_DESIGN_REF.md` (decisão explícita do roadmap §5/§12).
- Teste/validação executado: não se aplica.
- Branch/commit relacionado: não se aplica.
- Prevenção de regressão: ao surgir a spec primária, reconciliar contra o que foi construído e registrar
  o delta.
- Status final: ACEITO_COMO_PENDÊNCIA (UI segue `FRONTEND_DESIGN_REF.md` até a primária aparecer)

### INV-RLS-001 — GRANT genérico de setup regrediu hardening append-only de audit_logs
- Data: 2026-06-23
- PR/Fase: PR-FIX-RLS-RUNTIME-ROLE-01 (preparação de ambiente) · detectado no PR-REVERIFY-RLS-RUNTIME-01
- Severidade: ALTA
- Erro encontrado: durante a preparação de ambiente do PR-FIX-RLS-RUNTIME-ROLE-01, o comando
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime` concedeu
  `UPDATE`/`DELETE` em `audit_logs` para `app_runtime`, regredindo o hardening append-only da
  migration 0006 (`DATABASE_SCHEMA_V2 §10.9`).
- Sintoma: o PR-REVERIFY-RLS-RUNTIME-01 (2ª tentativa) detectou grants de `UPDATE`/`DELETE` em
  `audit_logs` durante a Prova 4b, contaminando o re-VERIFY.
- Causa raiz: o `GRANT ... ON ALL TABLES` genérico não foi seguido pelo `REVOKE UPDATE, DELETE ON
  audit_logs FROM app_runtime` específico do hardening. A migration 0006 aplica a ordem correta
  (GRANTs → REVOKE), mas um re-GRANT manual posterior desfaz o REVOKE.
- Impacto: `audit_logs` perdeu temporariamente a propriedade append-only. Sem evidência de impacto
  em produção neste diagnóstico. Em produção, o risco é mitigado somente se o provisionamento/IaC
  aplicar a ordem correta: GRANT genérico seguido do REVOKE específico de audit_logs.
- Arquivo(s) afetado(s): nenhum arquivo versionado. Ação de ambiente (psql manual durante setup).
- Correção aplicada: `REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime` reaplicado manualmente.
  O PR-DIAG-RLS-GRANTS-APP-RUNTIME-01 confirmou em 2026-06-23 que os grants atuais estão corretos:
  `audit_logs` possui apenas `INSERT`/`SELECT` para `app_runtime`.
- Teste/validação executado: `PR-DIAG-RLS-GRANTS-APP-RUNTIME-01` auditou `information_schema.role_table_grants`
  e confirmou 0 grants de `UPDATE`/`DELETE` em `audit_logs` para `app_runtime`. Default privileges
  para novas tabelas: `app_runtime=arwd` (append/read/write/delete).
- Prevenção de regressão: scripts de provisionamento/IaC devem aplicar o `REVOKE UPDATE, DELETE ON
  audit_logs FROM app_runtime` após qualquer `GRANT ... ON ALL TABLES` genérico, reproduzindo a
  ordem da migration 0006. Idealmente, o setup local deve executar a migration 0006 completa em vez
  de grants manuais.
- Status final: CORRIGIDO

---

## Áreas de atenção recorrentes (onde os bugs tendem a aparecer — checar primeiro)

Não são bugs; são pistas de onde olhar, derivadas dos riscos técnicos das fontes:

- **RLS / contexto:** query sem `withTenantContext` (nega tudo) ou GUC `''` sob pooling (`22P02`/`500`
  intermitente) — conferir `NULLIF`/`COALESCE` nas policies e `set_config` parametrizado.
- **Migrations:** ordem 0002→0003 (FK composta exige `UNIQUE (org,id)` antes); `EXCLUDE`/`btree_gist`.
- **Idempotência:** replay devolvendo status errado; takeover sem CAS executando em dobro; `IN_PROGRESS`
  bloqueando o pool.
- **Agenda:** evento fora da transação; validar transição depois do UPDATE; gate de jornada ausente;
  remarcação não atualizando a expiração do token; âncora de grade divergente sob DST.
- **Auth/sessão:** confusão de algoritmo do JWT; cookie com `Path` errado; IP real não resolvido;
  `resolveActiveOrg` espalhado; logout/`DISABLED` não derrubando o socket (kick).
- **Privacidade:** PII em log/`metadata`/payload de socket; visitante sobrescrevendo cadastro de balcão;
  scrub de `note` incompleto na anonimização.
