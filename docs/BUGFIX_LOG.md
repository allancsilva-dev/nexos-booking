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
| — | — | — | — | *(sem registros ainda)* | — |

> Atualizar esta tabela a cada nova entrada e a cada mudança de status.

---

## Registros

> *(Nenhum registro ainda. As entradas serão adicionadas abaixo, em ordem crescente de ID, durante o
> desenvolvimento.)*

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
