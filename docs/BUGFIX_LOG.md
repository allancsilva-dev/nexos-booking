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
> - Status possível: `ABERTO` · `EM_ANÁLISE` · `CORRIGIDO` · `VALIDADO` · `NÃO_REPRODUZ` · `ACEITO_COMO_PENDÊNCIA`.
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
- Status final: ABERTO | EM_ANÁLISE | CORRIGIDO | VALIDADO | NÃO_REPRODUZ | ACEITO_COMO_PENDÊNCIA
```

---

## Índice de bugs

| ID | Data | PR/Fase | Severidade | Título | Status |
|---|---|---|---|---|---|
| BUG-012 | a confirmar | PR-1.4 → PR-BUGFIX-1 | BLOQUEANTE | Runtime conecta como role superuser → RLS inerte (= PEND-001) | ABERTO |
| PROP-E1 | a confirmar | Pré-PR backend (web) | ALTA | Snapshot de preço no agendamento | EM_ANÁLISE |
| PROP-E2 | a confirmar | Pré-PR backend (web) | ALTA | Exigir vínculo `professional_services` na reserva/disponibilidade | EM_ANÁLISE |
| PROP-E4 | a confirmar | Transversal web | MÉDIA | Envelope de lista/paginação consistente | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-001 | 2026-06-23 | PR-DIAG-WEB | ALTA | Slug público inexistente retorna 500 | ABERTO |
| INV-WEB-002 | 2026-06-23 | PR-DIAG-WEB | ALTA | Cancelamento público com token inválido retorna 500 | ABERTO |
| INV-WEB-003 | 2026-06-23 | PR-DIAG-WEB | BAIXA | Divergência de nomenclatura entre DTOs shared e contrato/roadmap | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-004 | 2026-06-23 | PR-DIAG-WEB | BAIXA | `PasswordChangeInput` citado no contrato não exportado no shared | ABERTO |
| INV-WEB-005 | 2026-06-23 | PR-DIAG-WEB | BAIXA | Claims do access token não exportadas como schema no shared | ACEITO_COMO_PENDÊNCIA |
| INV-WEB-006 | 2026-06-23 | PR-DIAG-WEB | ALTA | Web pública já existe parcialmente; roadmap/conductor partiam de premissa greenfield | ABERTO |
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
- Data: a confirmar na fonte
- PR/Fase: pré-PR de backend da camada web (`PR-BE-PROF-SVC`), gate antes de WEB-3/WEB-5B/WEB-7A
- Severidade: ALTA
- Erro encontrado: a junção `professional_services` (`§6.3`) existe, mas **não é exigida** em §15/§16/§17.
  Vitrine e painel podem marcar um profissional para um serviço que ele não presta.
- Sintoma: agendamento aceito para combinação profissional↔serviço inválida; a junção vira peso morto;
  evoluções "qualquer profissional" (`PLANNING §10.2`) e override por profissional ficam sem fonte de
  verdade.
- Causa raiz: regra de negócio "profissional oferece serviço" não é pré-condição nem filtro nas rotas de
  criação e disponibilidade.
- Impacto: correção de agenda e da vitrine pública; **muda canônico** (clarificação de contrato em
  §15/§16/§17 + código de erro dedicado).
- Arquivo(s) afetado(s): validação de criação (painel + público); `GET /availability`; `GET /public/:orgSlug`
  (relacionar serviço↔profissional, não listas planas); `packages/shared`.
- Correção aplicada: **nenhuma** — é **PROPOSTA**. ADR/clarificação ratificada antes de implementar.
  Vínculo vira **pré-condição** (`422 VALIDATION_ERROR`/código dedicado) e **filtro**. Escopo proibido:
  quebrar o formato agregável de slots de §15 ("qualquer profissional" futuro).
- Teste/validação executado: a definir — aceite (−): reservar profissional que não presta o serviço →
  `422`; vitrine não oferece a combinação.
- Branch/commit relacionado: `PR-BE-PROF-SVC` (a abrir após ADR).
- Prevenção de regressão: teste negativo de reserva com combinação inválida; teste de vitrine sem a
  combinação.
- Status final: EM_ANÁLISE (proposta aberta, aguardando ADR/ratificação)

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
