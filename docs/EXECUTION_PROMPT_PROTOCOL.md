# EXECUTION_PROMPT_PROTOCOL — Protocolo de Prompt por PR (`nexos-booking`)

> Molde fixo que envelopa **todo** prompt de implementação enviado ao executor (Claude Code).
> Um prompt = **um único PR**. As partes **A** e **C** são invariantes; só o bloco **B** muda por PR.
>
> Status: **v1.0** (congelado). Alinhado à hierarquia de autoridade documental do
> `MVP_EXECUTION_PLAN.md`. Este protocolo **organiza** a execução; não é fonte de verdade normativa —
> o contrato vive em `ARCHITECTURE_DECISIONS.md`, `DATABASE_SCHEMA_V2.md` e `API_CONTRACTS.md`.

---

## A. Cabeçalho invariante (idêntico em todo prompt)

> Você é o executor de **um único PR** do projeto `nexos-booking`. Implemente **exclusivamente** o
> escopo deste PR. Não antecipe nenhum PR seguinte, não crie "tabela/rota só para deixar preparado",
> não refatore fora do escopo.
>
> **Fontes de verdade (ordem de autoridade para desempate):**
> `ARCHITECTURE_DECISIONS.md` → `DATABASE_SCHEMA_V2.md` → `API_CONTRACTS.md` → `PLANNING.md` →
> `IMPLEMENTATION_ROADMAP.md` → `POST_MVP_PRODUCT_ROADMAP.md` (este último só orienta futuro, **não**
> altera escopo). `PATCHES_PLANNING_E_SCHEMA.md` está **arquivado** — não usar para implementar.
> `MVP_EXECUTION_PLAN.md` e `IMPLEMENTATION_ROADMAP.md` **organizam** a execução; o detalhe normativo
> está nas três primeiras fontes + `packages/shared` (quando já materializado).
>
> **Regra de falta de informação:** se algo necessário não estiver nas **seções exatas** citadas no
> bloco B, ou se duas fontes divergirem, **pare e sinalize** (proponha entrada no `BUGFIX_LOG.md`
> aplicando a hierarquia de autoridade). Nunca invente, nunca assuma "default razoável".
>
> **Trava documental:** **não** alterar documentos canônicos, salvo se este PR pedir explicitamente.
> Divergência nova deve ser **reportada/proposta** no `BUGFIX_LOG.md` (apontando qual documento
> prevalece) — **nunca** corrigida silenciosamente no documento.
>
> **Sem commit automático.** Entregue os arquivos e o relatório; quem commita é o condutor.
>
> **Gate transversal (bloqueia merge em QUALQUER PR):**
> - CI verde (lint + build + testes do escopo do PR).
> - Migrations aplicam do zero (se o PR tocou schema).
> - Nenhum acesso a banco fora de `withTenantContext` / `withSystemContext` (o segundo só em
>   relay/manutenção).
> - Erro sempre no envelope padrão com `requestId`.
> - **Zero PII / segredo / token** em log, `metadata` ou payload de socket.
> - **Se um comando de validação não puder ser executado, reportá-lo como `NÃO EXECUTADO` com o
>   motivo. Nunca marcar `PASS` por inferência.**

---

## B. Bloco variável do PR (preenchido por PR)

```
PR: {{id}} — {{título}}
Objetivo: {{1–2 frases do MVP_EXECUTION_PLAN §5}}

Fonte de verdade deste PR — SEÇÃO EXATA OBRIGATÓRIA (ler ANTES de codar):
  - ADR: {{ex.: ADR-021, ADR-017}}
  - SCHEMA: {{ex.: DATABASE_SCHEMA_V2.md §10.1, §12}}
  - API_CONTRACTS: {{ex.: API_CONTRACTS.md §2/§3}}
  - shared: símbolos/contratos EXISTENTES a reutilizar; se ainda não existirem neste PR,
    criar apenas o que o escopo permitir (não tratar shared como autoridade antes de existir).

Escopo PERMITIDO (exatamente isto):
  - {{...}}

Escopo PROIBIDO (rejeitar se tentar):
  - {{itens deste PR que pertencem ao próximo}}
  - {{antecipações típicas: feature/migration/rota/auth fora do escopo}}

Dependências (devem já estar verdes/mergeadas):
  - {{PR-anteriores}}

Arquivos/pacotes esperados:
  - {{paths}}

Critérios de aceite (testáveis):
  - {{do MVP_EXECUTION_PLAN §5 / PLANNING §16}}

Comandos de validação:
  - {{pnpm lint / build / test / docker compose up / gate de migration}}

Riscos técnicos a vigiar:
  - {{do BUGFIX_LOG "áreas de atenção recorrentes" + riscos do PR}}

Evidências a coletar e devolver no relatório:
  - {{saída de CI, EXPLAIN, prova de RLS negando linhas, etc.}}
```

---

## C. Formato de entrega exigido do executor

Ao final, o executor devolve:

1. Lista de arquivos criados/alterados.
2. Resultado de **cada** comando de validação (`PASS` / `FAIL` / `NÃO EXECUTADO` + motivo — nunca
   `PASS` por inferência).
3. Confirmação item a item do **gate transversal** e dos **critérios de aceite** do PR.
4. Evidências pedidas no bloco B.
5. Qualquer divergência/lacuna encontrada, com a **proposta de registro** no `BUGFIX_LOG.md`
   (sem alterar o documento canônico).

**Sem PII, segredo, token ou stack sensível** em nenhum trecho do relatório. Referenciar por
ID/`requestId`.

---

## Changelog

- **v1.0** — versão congelada. Emendas de precisão sobre o rascunho inicial: (1) "seção exata
  obrigatória" na fonte de verdade; (2) `packages/shared` é fonte só quando já materializado, senão
  é escopo de criação; (3) comando não executável vira `NÃO EXECUTADO`, nunca `PASS` por inferência;
  (4) trava contra alteração documental silenciosa — divergência vai para o `BUGFIX_LOG.md`.
