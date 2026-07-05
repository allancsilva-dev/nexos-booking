#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-deploy/vps/.env.vps}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-apps/api/db/migrations}"

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose up -d postgres

compose exec -T postgres sh -lc 'until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do sleep 1; done'

compose exec -T postgres sh -lc \
  'psql -v ON_ERROR_STOP=1 -v app_runtime_password="$APP_RUNTIME_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT format(
  'CREATE ROLE app_runtime LOGIN PASSWORD %L',
  :'app_runtime_password'
)
WHERE NOT EXISTS (
  SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_runtime'
)
\gexec

SELECT format(
  'ALTER ROLE app_runtime WITH LOGIN PASSWORD %L',
  :'app_runtime_password'
)
\gexec

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Least-privilege DML para app_runtime nas tabelas que as migrations vão criar.
-- Em produção isto é gerido por infra/IaC (DATABASE_SCHEMA_V2 §10.2); aqui replicamos
-- o comportamento do gate-setup.sql para a stack de teste em VPS.
GRANT USAGE ON SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE current_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
SQL

for migration in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$migration")"
  applied="$(compose exec -T postgres sh -lc \
    "psql -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"SELECT 1 FROM public.schema_migrations WHERE filename = '$name'\"")"

  if [ "$applied" = "1" ]; then
    echo "skip $name"
    continue
  fi

  echo "apply $name"
  compose exec -T postgres sh -lc \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$migration"
  compose exec -T postgres sh -lc \
    "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"INSERT INTO public.schema_migrations(filename) VALUES ('$name')\""
done

# Garante DML nas tabelas já existentes (as DEFAULT PRIVILEGES só cobrem tabelas
# criadas DEPOIS do ALTER; este GRANT cobre as que as migrations acabaram de criar).
# audit_logs volta a ser append-only, conforme migration 0006.
compose exec -T postgres sh -lc \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime;
SQL
