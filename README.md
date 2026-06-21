# nexos-booking

SaaS de agendamento online para salões e barbearias. Multi-tenant, real-time, agenda anti-conflito com isolamento reforçado por Row-Level Security.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js (App Router), Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | NestJS, Drizzle ORM, PostgreSQL, Socket.IO |
| Validação | Zod (schemas compartilhados via `packages/shared`) |
| Auth | JWT (access + refresh rotativo), Argon2id |
| Real-time | WebSocket (invalidação, sem PII) + outbox relay |
| Infra local | Docker Compose (PostgreSQL + API + Web) |
| Monorepo | pnpm workspaces + Turborepo |

## Estrutura

```
apps/
  api/         # NestJS — regras de negócio, auth, agenda
  web/         # Next.js — painel autenticado + página pública
packages/
  shared/      # Tipos Zod, DTOs, ErrorCode, helpers (contrato único)
  config/      # ESLint, TypeScript, Prettier compartilhados
```

## Setup rápido

```bash
pnpm install
cp .env.example .env              # editar placeholders
docker compose up -d postgres     # só o banco
pnpm --filter @nexos/api migrate:fresh
pnpm dev                          # raiz do projeto → Turborepo sobe API + Web
```

Todos os comandos `pnpm` são executados na **raiz do projeto**. O Turborepo gerencia os workspaces automaticamente.

## Comandos

| Comando | Descrição |
|---|---|
| `pnpm dev` | Sobe API (:3001) + Web (:3000) via Turborepo |
| `pnpm --filter @nexos/api dev` | Sobe apenas a API (NestJS) |
| `pnpm --filter @nexos/web dev` | Sobe apenas o frontend (Next.js) |
| `pnpm build` | Build de todos os pacotes |
| `pnpm lint` | Lint em todos os pacotes |
| `pnpm --filter @nexos/api migrate:fresh` | Recria banco e aplica migrations do zero |
| `pnpm --filter @nexos/api test:db` | Testes de isolamento RLS |
| `pnpm --filter @nexos/api test:auth` | Testes de autenticação |
| `docker compose up -d` | Sobe serviços (PostgreSQL, API, Web) |
| `docker compose down` | Derruba serviços |

## Documentação

A documentação completa do projeto está em `docs/`:

| Documento | Conteúdo |
|---|---|
| `ARCHITECTURE_DECISIONS.md` | Decisões arquiteturais (ADR-001 a ADR-026) |
| `DATABASE_SCHEMA_V2.md` | Schema SQL canônico, RLS, migrations |
| `API_CONTRACTS.md` | Contrato HTTP, endpoints, envelope de erro |
| `PLANNING.md` | Visão de produto, escopo MVP, regras de negócio |
| `IMPLEMENTATION_ROADMAP.md` | Sequência de PRs por fase |
| `BUGFIX_LOG.md` | Histórico de bugs e correções |

## MVP

O MVP cobre 6 fases, implementadas em 28 PRs:

- **Fase 0** — Fundação (monorepo, CI, shared)
- **Fase 1** — Banco, contexto de tenant, auth, organizations
- **Fase 2** — Cadastro operacional (professionals, services, jornada)
- **Fase 3** — Agenda e anti-conflito (disponibilidade, idempotência, mutações)
- **Fase 4** — Página pública (booking sem login, cancelamento por token)
- **Fase 5** — Real-time (outbox relay, WebSocket)
- **Fase 6** — Notificações, histórico, clientes, LGPD
