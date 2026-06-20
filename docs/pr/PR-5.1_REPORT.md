# PR #5.1 — Outbox Relay Core (Publisher + Relay + Fast-Path + Dead-Letter)

**Status:** `PASS_PROVISÓRIO_CI_PENDENTE`

## Resumo

- **Publisher interface** + **EventEmitter impl** injetados via DI (`IPublisher` / `NestEventEmitterPublisher`)
- **Relay**: outbox relay com `withSystemContext`, `FOR UPDATE SKIP LOCKED` e dead-letter
- **Fast-path**: marca `published_at` pós-commit após emissão direta
- **Partial index** adicionado ao Drizzle (alinhado com a migration 0004)
- **Deps**: `@nestjs/event-emitter` adicionado ao projeto
- **8 arquivos** (5 criados + 3 modificados + deps)
- **15 testes** em `test-outbox.mjs`
- **Lint + build**: PASS
- **Fase 5** iniciada
