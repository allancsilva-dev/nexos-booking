# PR-1.7_REPORT — Frontend: Auth UI + Dashboard Shell + Auth Bootstrap

## 1. Status Final: PASS_PROVISÓRIO_CI_PENDENTE. CI remoto: PENDENTE (validação manual posterior)

## 2. Pré-condições

| Item | Status | Evidência |
|---|---|---|
| PR-0.3 | PASS confirmado | `docs/pr/PR-0.3_REPORT.md` — shared package (`@nexos/shared`) |
| PR-1.4 | PASS confirmado | `docs/pr/PR-1.4_REPORT.md` — auth backend (36/36 auth, 24/24 HTTP, 14/14 RLS) |
| PR-1.6 | PASS_PROVISÓRIO_CI_PENDENTE confirmado | `docs/pr/PR-1.6_REPORT.md` — organizations/staff backend (9 endpoints, 3 módulos) |

## 3. Auditoria de Desenho

### 3.1 Mapa 5b v3 — 33 arquivos criados + 5 modificados

```
Criados (C1-C33):
  C1:  apps/web/next.config.ts
  C2:  apps/web/postcss.config.mjs
  C3:  apps/web/app/globals.css
  C4:  apps/web/app/layout.tsx
  C5:  apps/web/app/page.tsx
  C6:  apps/web/app/providers.tsx
  C7:  apps/web/app/(auth)/layout.tsx
  C8:  apps/web/app/(auth)/login/page.tsx
  C9:  apps/web/app/(auth)/register/page.tsx
  C10: apps/web/app/(authenticated)/layout.tsx
  C11: apps/web/app/(authenticated)/dashboard/page.tsx
  C12: apps/web/lib/http-client.ts
  C13: apps/web/lib/error-codes.ts
  C14: apps/web/lib/auth-schemas.ts
  C15: apps/web/lib/utils.ts
  C16: apps/web/stores/auth-store.ts
  C17: apps/web/hooks/use-auth.ts
  C18: apps/web/hooks/use-auth-bootstrap.ts
  C19: apps/web/components/error-display.tsx
  C20: apps/web/components/loading-state.tsx
  C21: apps/web/components/empty-state.tsx
  C22: apps/web/components/shell/sidebar.tsx
  C23: apps/web/components/shell/user-menu.tsx
  C24: apps/web/components/shell/auth-guard.tsx
  C25: apps/web/components/shell/org-switcher.tsx
  C26: apps/web/components/auth/auth-hero.tsx
  C27: apps/web/components/auth/login-form.tsx
  C28: apps/web/components/auth/register-form.tsx
  C29: apps/web/components/ui/button.tsx
  C30: apps/web/components/ui/card.tsx
  C31: apps/web/components/ui/form.tsx
  C32: apps/web/components/ui/input.tsx
  C33: apps/web/components/ui/skeleton.tsx
  C34: apps/web/components/ui/dropdown-menu.tsx
  C35: apps/web/components/ui/avatar.tsx
  C36: apps/web/components/ui/separator.tsx
  C37: apps/web/components/ui/label.tsx

Modificados (M1-M5):
  M1: apps/web/package.json                          — +13 novas dependências
  M2: apps/web/tsconfig.json                         — configuração base Next.js
  M3: apps/web/next-env.d.ts                         — tipos Next.js
  M4: pnpm-workspace.yaml                            — +apps/web no workspace
  M5: pnpm-lock.yaml                                 — lockfile sincronizado com novas deps
```

### 3.2 Estrutura de pastas

```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              # Layout de autenticação (centered)
│   │   ├── login/page.tsx          # Login page (split hero + form)
│   │   └── register/page.tsx       # Register page
│   ├── (authenticated)/
│   │   ├── layout.tsx              # Layout autenticado (sidebar + guard)
│   │   └── dashboard/page.tsx      # Dashboard vazio (3 cards placeholder)
│   ├── globals.css                 # Design tokens (Tailwind v4 @theme)
│   ├── layout.tsx                  # Root layout (Providers + font)
│   ├── page.tsx                    # Redirect / → /login
│   └── providers.tsx               # QueryClient + ThemeProvider + AuthBootstrap
├── components/
│   ├── auth/
│   │   ├── auth-hero.tsx           # Hero branding (split layout)
│   │   ├── login-form.tsx          # Login form (react-hook-form + zod)
│   │   └── register-form.tsx       # Register form (react-hook-form + zod)
│   ├── shell/
│   │   ├── auth-guard.tsx          # Auth guard (loading/error/idle states)
│   │   ├── org-switcher.tsx        # Organization switcher (from GET /organizations/me)
│   │   ├── sidebar.tsx             # Sidebar (nav items disabled for future)
│   │   └── user-menu.tsx           # User dropdown (avatar + org switch + logout)
│   └── ui/
│       ├── avatar.tsx              # Radix Avatar wrapper
│       ├── button.tsx              # CVA button variants
│       ├── card.tsx                # Card component
│       ├── dropdown-menu.tsx       # Radix DropdownMenu wrapper
│       ├── empty-state.tsx         # Empty state (icon + title + action)
│       ├── error-display.tsx       # Error display (code + message + retry)
│       ├── form.tsx                # react-hook-form + Radix Label integration
│       ├── input.tsx               # Input component
│       ├── label.tsx               # Radix Label wrapper
│       ├── loading-state.tsx       # Loading state (spinner/skeleton/inline)
│       ├── separator.tsx           # Radix Separator wrapper
│       └── skeleton.tsx            # Skeleton loading component
├── hooks/
│   ├── use-auth.ts                 # Auth mutations (login, register, logout, switch-org)
│   └── use-auth-bootstrap.ts       # AuthBootstrap context + hook
├── lib/
│   ├── auth-schemas.ts             # Zod schemas (Login, Register, MeResponse)
│   ├── error-codes.ts              # Typed error code constants from @nexos/shared
│   ├── http-client.ts              # HTTP client (auto headers, 401-refresh, 1 retry)
│   └── utils.ts                    # cn() utility (clsx + tailwind-merge)
├── stores/
│   └── auth-store.ts              # Zustand store (accessToken + savedOrgId)
├── next.config.ts                  # Next.js config (rewrites /api/* → NestJS)
├── package.json                    # Dependencies
├── postcss.config.mjs              # Tailwind v4 PostCSS plugin
└── tsconfig.json                   # TypeScript config
```

### 3.3 Resultado da auditoria de desenho

**APTA PARA IMPLEMENTAÇÃO** — componente tree compatível com PR-1.4 e PR-1.6, Tailwind v4 como sistema de design, Zustand sem persist, TanStack Query com 1 retry, 3 estados (loading/error/empty) em todos componentes.

## 4. Implementação

### 4.1 Auth Bootstrap (`apps/web/app/providers.tsx:11-147`)

Fluxo de inicialização no cliente:

```
1. POST /api/v1/auth/refresh  (X-CSRF: 1, credentials: "include")
   ├── Falha → clearAuth() + status "error"
   └── Sucesso → token no Zustand
       └── GET /api/v1/auth/me  (Bearer token)
           ├── Falha → clearAuth() + status "error"
           ├── activeOrg presente → status "authenticated"
           ├── activeOrg ausente + savedOrgId presente → POST /auth/switch-org
           │   ├── Sucesso → token atualizado + status "authenticated"
           │   └── Falha → savedOrgId = null + status "idle"
           └── activeOrg ausente + sem savedOrgId → status "idle"
```

### 4.2 Login Page (`apps/web/app/(auth)/login/page.tsx`)

- Layout split: hero (branding) à esquerda (hidden em mobile), formulário à direita
- `AuthHero`: gradiente ciano, logo Nexos, tagline
- `LoginForm`: react-hook-form + zodResolver(LoginSchema), redirect /dashboard no sucesso
- Error handling: ApiError → toast sonner; erro de rede → toast genérico
- Inline error display para ApiError com code + message + requestId

### 4.3 Register Page (`apps/web/app/(auth)/register/page.tsx`)

- `RegisterForm`: react-hook-form + zodResolver(RegisterSchema)
- Campos: name, email, password (min 8), organizationName (opcional)
- Tratamento especial para `EMAIL_TAKEN` → toast dedicado
- Outros erros ApiError → toast com code + requestId

### 4.4 Dashboard Page (`apps/web/app/(authenticated)/dashboard/page.tsx`)

- 3 estados: loading (skeleton), error (ErrorDisplay + retry), sem usuário (EmptyState)
- Se autenticado: saudação com nome + 3 cards placeholder (Agenda, Agendamentos, Profissionais)
- Dados placeholder ("Em breve") — preparados para fases posteriores

### 4.5 Sidebar (`apps/web/components/shell/sidebar.tsx`)

- Fixada à esquerda, 68px de largura (`--spacing-sidebar`)
- 6 nav items: Painel (ativo), Agenda, Serviços, Equipe, Clientes, Configurações
- Itens 2-6 com `disabled: true`, `cursor-not-allowed`, `opacity-40`
- UserMenu no rodapé

### 4.6 OrgSwitcher (`apps/web/components/shell/org-switcher.tsx`)

- `useQuery({ queryKey: ["organizations", "me"], queryFn: () => apiFetch("/api/v1/organizations/me") })`
- 3 estados: loading (inline spinner), error (ErrorDisplay + retry), empty (mensagem)
- Lista de organizações com ícone Building2, nome, slug, check no ativo
- Switch via `useSwitchOrgMutation` → POST /auth/switch-org → atualiza token + savedOrgId + invalida cache me

### 4.7 HTTP Client (`apps/web/lib/http-client.ts`)

- `apiFetch<T>(path, options)` — wrapper sobre `fetch`
- Auto headers: `Content-Type: application/json`, `X-Request-Id`, `Authorization: Bearer` (se token no Zustand), `If-Match` (se version), `Idempotency-Key` (para POST/PUT/PATCH/DELETE)
- 401 refresh: chama `refreshAccessToken()` → POST /auth/refresh (X-CSRF:1), 1 tentativa extra
- Dedup de refresh: `refreshPromise` compartilhada (chamadas concorrentes reutilizam a mesma promise)
- Parse de erro: extrai `error.code`, `error.message`, `error.requestId` do envelope → `ApiError`

### 4.8 Zustand Store (`apps/web/stores/auth-store.ts`)

- `accessToken: string | null` — em memória apenas, sem persist (localStorage/sessionStorage)
- `savedOrgId: string | null` — client-side (não persiste no servidor)
- `setAccessToken`, `setSavedOrgId`, `clearAuth`

### 4.9 Design Tokens (`apps/web/app/globals.css`)

- Tailwind v4 `@theme` com CSS custom properties
- Paleta dark-first: `--color-background: #09090b`, `--color-foreground: #fafafa`
- Primary: `#22d3ee` (ciano), Accent: `#0891b2`
- Gradiente: `--gradient-accent: linear-gradient(145deg, #22d3ee, #0891b2)`
- Radii: frame 3px, card 14px, control 10px, nav 9px
- Spacing: sidebar 68px, panel-resumo 298px
- Fonte: Plus Jakarta Sans (via next/font/google)
- Tema escuro por padrão (`defaultTheme="dark"`, `enableSystem={false}`)

### 4.10 Error Codes (`apps/web/lib/error-codes.ts`)

- Constantes tipadas `ErrorCode` importadas de `@nexos/shared`
- `UNAUTHENTICATED`, `INTERNAL_ERROR`, `EMAIL_TAKEN`
- Nunca redeclaradas — referenciam o union type do shared package

### 4.11 Proxy API (`apps/web/next.config.ts`)

- Rewrites: `/api/:path*` → `http://localhost:3001/api/:path*`
- Encaminha todas as requisições da app web para o servidor NestJS

## 5. Dependências Novas

| Pacote | Versão | Propósito |
|---|---|---|
| `@nexos/shared` | workspace:* | Types, DTOs, error codes compartilhados |
| `@tanstack/react-query` | ^5 | Gerenciamento de estado do servidor, caching, mutations |
| `zustand` | ^5 | Estado cliente (accessToken, savedOrgId) |
| `sonner` | ^2 | Toasts (notificações) |
| `react-hook-form` | ^7 | Gerenciamento de formulários |
| `@hookform/resolvers` | ^3 | Integração zod ↔ react-hook-form |
| `zod` | ^3 | Validação de schemas (login, register, me) |
| `clsx` | ^2 | Concatenação condicional de classes |
| `tailwind-merge` | ^3 | Merge inteligente de classes Tailwind |
| `lucide-react` | ^0 | Ícones |
| `class-variance-authority` | ^0.7 | Variantes de componentes (Button) |
| `next-themes` | ^0.4 | Tema escuro/claro |
| `tailwindcss` | ^4 | Framework CSS utilitário |
| `@tailwindcss/postcss` | ^4 | Plugin PostCSS para Tailwind v4 |
| `@radix-ui/react-separator` | ^1 | Separator acessível |
| `@radix-ui/react-avatar` | ^1 | Avatar acessível |
| `@radix-ui/react-dropdown-menu` | ^2 | DropdownMenu acessível |
| `@radix-ui/react-slot` | ^1 | Slot para composição (FormControl) |
| `@radix-ui/react-label` | ^2 | Label acessível |

## 6. Resultado dos Testes

```
pnpm lint                                  → PASS (apps/web lint sem erros)
pnpm build                                 → PASS (Next.js build compila todas as rotas)
Testes manuais (login, register, dashboard) → NÃO EXECUTADOS (sem API rodando no sandbox)
```

## 7. Regras Críticas Verificadas (R1-R9)

| Regra | Descrição | Status | Evidência |
|---|---|---|---|
| R1 | Bearer token nunca persiste em localStorage / sessionStorage | IMPLEMENTADO | `auth-store.ts:13-19` — Zustand sem middleware `persist`. Token em memória apenas. Limpo em `clearAuth()`. |
| R2 | Header `X-CSRF: 1` obrigatório em `/auth/refresh` | IMPLEMENTADO | `http-client.ts:33-40` e `providers.tsx:22-29` — ambos incluem `"X-CSRF": "1"` no POST /auth/refresh. |
| R3 | Refresh token deduplicado (chamadas concorrentes) | IMPLEMENTADO | `http-client.ts:26-63` — `refreshPromise` singleton, chamadas 401 concorrentes reutilizam a mesma promise. |
| R4 | 401 → 1 retry max com refresh | IMPLEMENTADO | `http-client.ts:138-143` — detecta 401, tenta refresh, refaz request uma vez. Se falhar novamente, propaga erro. |
| R5 | QueryClient configurado com retry: 1, refetchOnWindowFocus: false | IMPLEMENTADO | `providers.tsx:152-159` — `defaultOptions.queries: { retry: 1, refetchOnWindowFocus: false }`. |
| R6 | Error codes nunca hardcoded — importados de @nexos/shared | IMPLEMENTADO | `error-codes.ts:1-8` — `import type { ErrorCode } from "@nexos/shared"`, constantes tipadas. |
| R7 | Todos componentes têm 3 estados (loading / error / empty) | IMPLEMENTADO | Dashboard (`dashboard/page.tsx:18-74`), OrgSwitcher (`org-switcher.tsx:34-60`), AuthGuard (`auth-guard.tsx:19-43`), UserMenu (`user-menu.tsx:40-50`). |
| R8 | Logout limpa store + cache em finally (garantia) | IMPLEMENTADO | `use-auth.ts:64-67` — `onSettled` (finally) executa `clearAuth()` + `queryClient.clear()` independente de sucesso/erro. Bearer obrigatório (linha 57-58: `if (!token) throw`). |
| R9 | Idempotency-Key automático em POST/PUT/PATCH/DELETE | IMPLEMENTADO | `http-client.ts:123-125` — `crypto.randomUUID()` gerado para mutations quando não fornecido explicitamente. |

## 8. Divergências e Decisões

### DIV-001: /auth/me retorna name/slug em memberships (não documentado no contrato §8)

**Observação:** A resposta de `/auth/me` inclui campos `name` e `slug` dentro de cada membership, que não constam no contrato (§8 da documentação de API). O OrgSwitcher (`org-switcher.tsx`) usa `GET /organizations/me` — endpoint do PR-1.6 — em vez de depender dos dados de membership para obter nome e slug das organizações.

**Decisão:** Uso de `/organizations/me` como fonte canônica para lista de organizações no OrgSwitcher. Dados de membership do `/auth/me` usados apenas para role e status.

### BUG-008: Auth DTOs locais, não em @nexos/shared (herdado do PR-1.4)

**Observação:** Os schemas `LoginSchema`, `RegisterSchema` e `SwitchOrgSchema` estão definidos localmente em `apps/web/lib/auth-schemas.ts` em vez de no shared package `@nexos/shared`. Herdado do PR-1.4, onde os DTOs de auth também são locais no backend.

**Decisão:** Mantido como dívida herdada. `MeResponseSchema` adicionado localmente para validação da resposta de `/auth/me`. Correção em PR futuro de remediação cross-package.

### BUG-007: Slug check-then-insert (herdado, não afeta frontend)

**Observação:** Documentado em `docs/BUGFIX_LOG.md`. `AuthService.generateSlug()` no backend usa SELECT → INSERT (check-then-insert), violando ADR-011. Não afeta o frontend diretamente.

**Decisão:** Registrado para rastreabilidade. Correção pendente no backend.

### DIV-002: Tailwind v4 como divergência consciente do spec visual

**Observação:** Tailwind v4 foi adotado em vez de Tailwind v3. API de configuração mudou: `@theme` block no CSS substitui `tailwind.config.ts`, `@import "tailwindcss"` substitui `@tailwind` directives, PostCSS plugin `@tailwindcss/postcss` em vez de `tailwindcss`.

**Decisão:** Tailwind v4 escolhido intencionalmente por ser a versão estável atual. Design tokens definidos como CSS custom properties no `@theme` block (`globals.css:3-27`). Sistema de cores dark-first com variante `.light`.

### DIV-003: Error codes centralizados em lib/error-codes.ts (typed from shared)

**Observação:** Constantes de error code são definidas como `export const UNAUTHENTICATED: ErrorCode = "UNAUTHENTICATED"` — usando o tipo `ErrorCode` importado de `@nexos/shared`. Isto garante type-safety (nunca uma string arbitrária), mas exige manter a lista sincronizada com o shared package.

**Decisão:** Padrão estabelecido. Toda referência a error codes no frontend passa por estas constantes, nunca strings hardcoded.

### DIV-004: Token em memória apenas (Zustand sem persist)

**Observação:** `accessToken` e `savedOrgId` são armazenados exclusivamente no Zustand store em memória. Nenhum middleware `persist` (localStorage/sessionStorage). Isto significa que um refresh de página sempre reinicia o fluxo de bootstrap (`/auth/refresh` → `/auth/me`).

**Decisão:** Abordagem segura por padrão. O token nunca toca o disco ou storage do navegador. O custo é um round-trip extra de refresh a cada full page load, mitigado pelo dedup do `refreshPromise`.

### DIV-005: Logout exige Bearer obrigatório

**Observação:** `useLogoutMutation` (`use-auth.ts:56-58`) lança erro se `accessToken` for null — "No access token available for logout". Isto é uma proteção: logout sem token não faz sentido (refresh cookie pode existir, mas sem Bearer o backend recusaria).

**Decisão:** Comportamento intencional. Se o token foi perdido (ex: clearAuth chamado), o usuário é redirecionado ao login sem chamada ao backend.

## 9. Pendências

| ID | Severidade | Descrição |
|---|---|---|
| PEND-001 | HIGH | CI remoto sem evidência — workflow `ci.yml` não inclui step de build/lint do `apps/web`. Validação completa depende de push + GitHub Actions. |
| PEND-002 | MEDIUM | Testes manuais não executados — sem API NestJS rodando no sandbox. Fluxos login, register, logout, bootstrap, switch-org não validados end-to-end. |
| PEND-003 | MEDIUM | verify-email, password-reset, resend pages — páginas de auth complementares (PR-1.5) sem UI correspondente. Débito para PR de frontend posterior. |
| PEND-004 | MEDIUM | Agenda B — sem módulo de agenda neste PR. Placeholder cards no dashboard. Débito para PR de frontend posterior. |
| PEND-005 | LOW | CSP headers no Next.js — headers de segurança (Content-Security-Policy) não configurados. Débito para Fase 4. |

## 10. Escopo Proibido Confirmado

**Não foi implementado ou alterado:**
- Agenda B (calendário, slots, bookings) — placeholder cards apenas
- verify-email page — sem UI (backend PR-1.5)
- password-reset page — sem UI (backend PR-1.5)
- resend-verification page — sem UI (backend PR-1.5)
- Módulos operacionais (serviços, equipe, clientes, configurações) — nav items disabled
- Nenhum acesso a `apps/api/` (backend NestJS)
- Nenhum acesso a `packages/shared/src/` (shared package source)
- Nenhum acesso a `docs/` canônicos (ADR, decision records)
- PR-1.8 (jobs de manutenção)
- Fase 2+ (Redis, real-time, public booking)

## 11. Arquivos Tocados (lista completa)

```
Criados (37):
  apps/web/next.config.ts
  apps/web/postcss.config.mjs
  apps/web/app/globals.css
  apps/web/app/layout.tsx
  apps/web/app/page.tsx
  apps/web/app/providers.tsx
  apps/web/app/(auth)/layout.tsx
  apps/web/app/(auth)/login/page.tsx
  apps/web/app/(auth)/register/page.tsx
  apps/web/app/(authenticated)/layout.tsx
  apps/web/app/(authenticated)/dashboard/page.tsx
  apps/web/lib/http-client.ts
  apps/web/lib/error-codes.ts
  apps/web/lib/auth-schemas.ts
  apps/web/lib/utils.ts
  apps/web/stores/auth-store.ts
  apps/web/hooks/use-auth.ts
  apps/web/hooks/use-auth-bootstrap.ts
  apps/web/components/error-display.tsx
  apps/web/components/loading-state.tsx
  apps/web/components/empty-state.tsx
  apps/web/components/shell/sidebar.tsx
  apps/web/components/shell/user-menu.tsx
  apps/web/components/shell/auth-guard.tsx
  apps/web/components/shell/org-switcher.tsx
  apps/web/components/auth/auth-hero.tsx
  apps/web/components/auth/login-form.tsx
  apps/web/components/auth/register-form.tsx
  apps/web/components/ui/button.tsx
  apps/web/components/ui/card.tsx
  apps/web/components/ui/form.tsx
  apps/web/components/ui/input.tsx
  apps/web/components/ui/skeleton.tsx
  apps/web/components/ui/dropdown-menu.tsx
  apps/web/components/ui/avatar.tsx
  apps/web/components/ui/separator.tsx
  apps/web/components/ui/label.tsx

Modificados (5):
  apps/web/package.json
  apps/web/tsconfig.json
  apps/web/next-env.d.ts
  pnpm-workspace.yaml
  pnpm-lock.yaml
```

## 12. Veredito Final

**Status: PASS_PROVISÓRIO_CI_PENDENTE**

- Auditoria de estado: APTA (PR-0.3 PASS, PR-1.4 PASS, PR-1.6 PASS_PROVISÓRIO_CI_PENDENTE confirmados)
- Auditoria de desenho: APTA (37 arquivos criados, 5 modificados, estrutura compatível com backend PR-1.4/PR-1.6)
- Lint: PASS (apps/web sem erros)
- Build: PASS (Next.js build compila todas as rotas)
- Testes manuais: NÃO EXECUTADOS (sem API rodando no sandbox)
- Regras críticas R1-R9: todas implementadas e verificadas
- 19 dependências novas em apps/web/package.json
- CI remoto: PENDENTE (workflow requer atualização com apps/web)
