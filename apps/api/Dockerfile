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

RUN pnpm --filter @nexos/shared build && pnpm --filter @nexos/api build

# Runner: só as dependências de produção de @nexos/api e @nexos/shared,
# sem devDependencies e sem o código-fonte TypeScript.
FROM manifests AS runner

ENV NODE_ENV=production

RUN pnpm install --frozen-lockfile --prod --filter @nexos/api --filter @nexos/shared

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY apps/api/db apps/api/db
COPY apps/api/scripts apps/api/scripts

USER node

WORKDIR /app/apps/api

EXPOSE 3023

CMD ["node", "dist/src/main.js"]
