# EXECUTION_PROMPT_PROTOCOL — gabarito de prompt por PR (`nexos-booking`)

**Versão:** v1.1 · **Natureza:** GABARITO (molde reutilizável), não instância.

> **Leia isto primeiro.** Este arquivo é o **molde abstrato** dos 13 blocos que todo prompt de execução
> de PR segue. Ele **não** é o prompt de nenhum PR específico. Um prompt já preenchido para um PR (ex.: o
> prompt do `PR-VERIFY-RLS-RUNTIME-01`) é uma **instância** deste gabarito — não confunda os dois. Se um
> arquivo "protocolo" começar com "PROMPT 1 — PR-…" e trouxer comandos concretos, é instância, não este
> gabarito.

---

## 0. Para que serve e quem usa

- **Objetivo:** garantir que todo despacho de PR ao executor (OpenCode/subagentes) tenha a mesma
  estrutura de 13 blocos, com **restrição antes de capacidade**, gates de parada e provas obrigatórias —
  para evitar escopo solto, falso PASS e premissa incorreta (lição **F2/sid**).
- **Quem compõe:** o `conductor` compõe (ou, em PRs densos, dispara o `design-auditor`) o prompt de cada
  PR a partir da **trilha de condução ativa** + deste gabarito. Diagnósticos read-only podem ser compostos
  direto da seção do roadmap correspondente; gates de segurança usam o prompt **escrito à mão**.
- **Quem executa:** o subagente executor segue o prompt **estritamente**, um PR por vez.
- **Quem aprova:** o **humano** aprova nos gates (5b e fechamento). Commit/push são **sempre** do humano.

## 1. Princípios invariantes (valem para todo PR)

- **Papel do executor:** "**executor de UM ÚNICO PR**". Nunca "engenheiro sênior". **Restrição vem
  primeiro**; capacidade depois.
- **Um PR por vez. Sem antecipar fase futura. Sem commit.**
- **Ordem de autoridade documental:** `ARCHITECTURE_DECISIONS.md` (ADR) → `DATABASE_SCHEMA_V2.md` →
  `API_CONTRACTS.md` → `PLANNING.md` → `IMPLEMENTATION_ROADMAP.md`. `POST_MVP_*` é **referência futura**,
  nunca fonte. `MVP_EXECUTION_PLAN.md`, `IMPLEMENTATION_ROADMAP.md` e `WEB_IMPLEMENTATION_ROADMAP.md`
  **organizam** a execução — **não são contrato**; em conflito, vence a hierarquia acima.
  `PATCHES_PLANNING_E_SCHEMA.md` é histórico/aplicado, não fonte ativa.
- **Lock documental:** ADR/SCHEMA/API/PLANNING/ROADMAP **não se editam**. Divergência descoberta na
  execução vira **PROPOSTA no `BUGFIX_LOG.md`** (via docs-reporter), nunca alteração silenciosa.
- **`NÃO EXECUTADO` nunca vira PASS por inferência.** Comando que não rodou é `NÃO EXECUTADO`, ponto.
- **Builders só rodam após o 5b aprovado pelo humano.** Pular o 5b foi a causa de falso PASS no passado.
- **Veredito:** `PASS` · `PASS_COM_RESSALVA` · `BLOCKED`. **Enquanto a CI estiver deferida (D10),** o
  desfecho permitido de PR de build é **`PASS_PROVISÓRIO_CI_PENDENTE`** — nunca `PASS` pleno (esse só na
  passada única de CI no fim). **Diagnósticos read-only têm veredito próprio** (ex.: inventário → MAPA;
  verificação de segurança → PASS/FAIL binário).
- **Commit/push são do humano**, em qualquer PR.

---

## 2. Os 13 blocos (o gabarito)

> Preencha cada bloco para o PR em questão. Mantenha a ordem e os nomes. Onde diz "(adapte por tipo de
> PR)", veja a seção 4.

### [1] IDENTIFICAÇÃO
Quem é o executor e qual é o PR. Frase de papel: "Você é o executor de UM ÚNICO PR do `nexos-booking`:
`<ID-DO-PR>`. Você NÃO é engenheiro sênior, não tem autonomia de escopo." **Restrição primeiro.** Diga em
uma linha qual é a função única do PR.

### [2] REGRA CENTRAL
Um PR só, sem antecipar nenhum outro. Liste o que é **proibido por natureza** neste PR (no mínimo:
`git add`/`git commit`/`git push`; para read-only: também escrever arquivo, DDL, migration, alterar
role/grant/.env, escrever código, qualquer `INSERT/UPDATE/DELETE`).

### [3] FONTES OBRIGATÓRIAS DE LEITURA (antes de qualquer comando)
Os documentos e **§/ADR exatos** que o executor deve ler antes de agir, mais os caminhos de código que
pode inspecionar. Cite seção/linha, não "o documento inteiro". As fontes têm de **existir no repo** na
forma correta — premissa incorreta aqui produz falso PASS (F2/sid).

### [4] ORDEM DE AUTORIDADE DOCUMENTAL
Reafirme a hierarquia (princípio 1.3) e a regra de que divergência **não se corrige aqui** — vira proposta
no `BUGFIX_LOG` (bloco 12).

### [5a] AUDITORIA DE ESTADO
O que o executor levanta **sem alterar nada** para formar a figura atual: o que já existe, o que falta, o
que só dá para confirmar depois (e por isso fica para depois do 5b). Separe "levantável agora" de "depende
de inspeção efetiva".

### [5b] AUDITORIA DE DESENHO — **PARADA OBRIGATÓRIA**
Antes de **qualquer** escrita, `curl`, comando em runtime ou inspeção efetiva, o executor **DEVOLVE e
PARA** para aprovação humana, entregando um **mapa ancorado em §X/ADR**:
1. O que será tocado e o que **NÃO** pode ser tocado; invariantes que precisam sobreviver; onde parar se
   houver conflito.
2. Para PRs que rodam comandos: a **lista exata** dos comandos/`curl`/SQL que pretende rodar, cada um
   ancorado em §/ADR.
3. O que conta como **prova positiva** e como **prova negativa** em cada checagem.
**Nenhum builder, `curl` ou inspeção roda antes deste mapa voltar e o humano aprovar.** "Compor sem prompt
manual" **não** dispensa o 5b.

### [6] OBJETIVO
O resultado do PR em uma a três linhas, objetivo e verificável. Para verificação: resultado binário com
prova. Para build: o comportamento entregue. Para proposta: a decisão a ratificar.

### [7] ESCOPO PERMITIDO
Exatamente o que o executor pode tocar/rodar. (adapte por tipo de PR)

### [8] ESCOPO PROIBIDO
O que encerra em `BLOCKED` se forçado. Inclua sempre: editar fora do escopo; antecipar PR futuro;
commit/push; "corrigir" bug que pertence a outro PR; afrouxar invariante de segurança. (adapte por tipo)

### [9] ARQUIVOS ESPERADOS
Os caminhos que o PR deve produzir/alterar. Para read-only: "**nenhum arquivo alterado**; saída é o
relatório (bloco 11)". Marque como **provisórios** se dependerem de um diagnóstico ainda não feito.

### [10] VALIDAÇÕES OBRIGATÓRIAS (**prova positiva E negativa**)
Como se prova que o PR está certo. **Todo ramo de erro exige prova negativa.** O que não foi rodado entra
como `NÃO EXECUTADO`, jamais PASS. Para verificações de segurança: prova direta no banco/runtime, não por
endpoint HTTP (guard/controller pode mascarar).

### [11] RELATÓRIO OBRIGATÓRIO
O que o executor entrega ao final, incluindo **seção de "COMANDOS/PASSOS NÃO EXECUTADOS E MOTIVO"** (impede
PASS implícito quando algo falha por permissão, falta de dado ou ambiente incompleto). Para read-only:
o MAPA/relatório. Para build: arquivos alterados, o que ficou deliberadamente fora, testes/comandos
rodados e os `NÃO EXECUTADO`.

### [12] REGRAS DE PARADA
- **Trava documental:** não alterar canônico; divergência → proposta no `BUGFIX_LOG`.
- Se qualquer passo exigir escrita/privilégio que viole o bloco 8: **PARE e reporte**, não execute.
- **Sem gate humano no 5b aprovado, não rode inspeção/build.**

### [13] ENTREGA FINAL ESPERADA
O artefato final e o **veredito** no vocabulário do princípio 1.7. Diga explicitamente o que este veredito
**bloqueia** a jusante (ex.: um VERIFY em FAIL bloqueia qualquer builder tenant-scoped até ficar verde).

---

## 3. Premissas canônicas que TODO handoff embute (lição F2/sid)

Carregue estas como premissa em todo prompt aplicável, para o auditor/executor não validar contra suposição
errada:

- `/auth/me` é **fonte única** do estado de sessão (sem sintetizar do body).
- `Idempotency-Key` **estável por submissão** em toda mutação; `If-Match: <version>` em remarcação/ações.
- Matriz de transições / `alignToSlotGrid` vêm do `packages/shared` (não redeclarar contrato local).
- Público **sempre** rejeita fora da jornada; **token no body**, nunca em path/query; `consent` obrigatório.
- **`403`** (mesma org, sem permissão) × **`404`** (cross-tenant/inexistente).
- **RLS provada → isolamento provado**: sem o VERIFY verde, isolamento não é critério de aceite de tela.
- **Sem PII** em log/`metadata`/socket.
- **`NÃO EXECUTADO` nunca vira PASS por inferência** · **builders só após 5b** · **commit/push são do humano**.

---

## 4. Adaptação por tipo de PR (o gabarito é o mesmo; alguns blocos mudam)

- **Diagnóstico read-only (ex.: inventário, verificação):** blocos 7/8 = leitura + comandos read-only,
  sem escrita; bloco 9 = nenhum arquivo; bloco 11 = MAPA/relatório; bloco 13 = veredito próprio (MAPA, ou
  PASS/FAIL binário), **não** PASS/FAIL de build. O 5b lista os comandos/`curl` antes de rodar.
- **Build de backend:** blocos 7/8 limitam a `apps/api/**` (+ `packages/shared` só se o contrato já
  permitir); bloco 10 exige testes com prova positiva e negativa; bloco 13 fecha em
  `PASS_PROVISÓRIO_CI_PENDENTE` sob D10.
- **Build de frontend:** executor `frontend-builder`, edita **só** `apps/web/**`; mudança em `shared`
  (contrato) ou instalar dependência fora do 5b → PARA e devolve `BLOCKED`; demais regras iguais ao build.
- **Proposta que muda canônico (PROP-*):** não implementa; bloco 11/13 entregam a **PROPOSTA/ADR** para
  ratificação humana, registrada no `BUGFIX_LOG`. Implementação só vem em PR posterior, após ratificada.

---

## 5. Nota sobre instâncias

Prompts já preenchidos (ex.: `PR-VERIFY-RLS-RUNTIME-01`, `PR-DIAG-WEB`) são **instâncias** deste gabarito e
vivem como arquivos próprios — não dentro deste documento. Manter este arquivo como molde puro evita que um
prompt de PR seja lido por engano como "o protocolo".
