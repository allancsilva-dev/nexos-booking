FROM node:24-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json prettier.config.mjs eslint.config.mjs ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json

RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages

# next.config rewrites() é avaliado em BUILD e congelado no routes-manifest.
# Sem isto o destino do rewrite /api fica gravado como http://localhost:3001
# (errado dentro da rede Docker). O valor runtime não reescreve o manifest.
ARG NEXT_INTERNAL_API_BASE_URL=http://api:3001
ENV NEXT_INTERNAL_API_BASE_URL=${NEXT_INTERNAL_API_BASE_URL}

RUN pnpm --filter @nexos/shared build && pnpm --filter @nexos/web build

WORKDIR /app/apps/web

EXPOSE 3020

CMD ["pnpm", "start", "--hostname", "0.0.0.0", "--port", "3020"]
