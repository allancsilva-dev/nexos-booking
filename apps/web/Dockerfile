FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

# Manifests do workspace isolados: camada só invalidada quando alguma dependência muda.
FROM base AS manifests

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json prettier.config.mjs eslint.config.mjs ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json

FROM manifests AS builder

RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages

# next.config rewrites() é avaliado em BUILD e congelado no routes-manifest.
# Sem isto o destino do rewrite /api fica gravado como http://localhost:3001
# (errado dentro da rede Docker). O valor runtime não reescreve o manifest.
ARG NEXT_INTERNAL_API_BASE_URL=http://api:3001
ENV NEXT_INTERNAL_API_BASE_URL=${NEXT_INTERNAL_API_BASE_URL}
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}

RUN pnpm --filter @nexos/shared build && pnpm --filter @nexos/web build

# Runner: só as dependências de produção de @nexos/web e @nexos/shared,
# mais o build do Next. Sem devDependencies e sem o código-fonte.
FROM manifests AS runner

ENV NODE_ENV=production

# Mantido também em runtime: next start relê next.config para servir os rewrites.
ARG NEXT_INTERNAL_API_BASE_URL=http://api:3001
ENV NEXT_INTERNAL_API_BASE_URL=${NEXT_INTERNAL_API_BASE_URL}

RUN pnpm install --frozen-lockfile --prod --filter @nexos/web --filter @nexos/shared

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder --chown=node:node /app/apps/web/.next apps/web/.next
COPY apps/web/next.config.ts apps/web/next.config.ts

USER node

WORKDIR /app/apps/web

EXPOSE 3020

CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3020"]
