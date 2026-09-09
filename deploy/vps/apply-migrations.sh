#!/usr/bin/env sh
set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-apps/api/db/migrations}"

# Dois modos de operação:
#
#   a) banco EXTERNO (produção real): o Postgres é gerido fora deste repositório
#      e a stack da aplicação (docker-compose.prod.yml) apenas se liga a ele.
#        DB_CONTAINER=dbnexos-booking ./deploy/vps/apply-migrations.sh
#
#   b) stack completa docker-compose.vps.yml (legada / de teste), que sobe o
#      próprio serviço "postgres". Usado quando DB_CONTAINER não é definido.
DB_CONTAINER="${DB_CONTAINER:-}"
DB_ENV_FILE="${DB_ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-deploy/vps/.env.vps}"

if [ -n "$DB_CONTAINER" ]; then
  # ATENÇÃO: o container do banco externo pode ter sido criado com um
  # POSTGRES_DB diferente do banco da aplicação (é o caso de dbnexos-booking,
  # criado com POSTGRES_DB=nexos_financeiro). Por isso NUNCA confiamos no env
  # do container: banco, usuário e APP_RUNTIME_PASSWORD vêm do env file da
  # aplicação e são injetados por cima no docker exec.
  from_env_file() {
    [ -f "$DB_ENV_FILE" ] || return 0
    sed -n "s/^$1=//p" "$DB_ENV_FILE" | head -n 1
  }

  [ -n "${POSTGRES_DB:-}" ] || POSTGRES_DB="$(from_env_file POSTGRES_DB)"
  [ -n "${POSTGRES_USER:-}" ] || POSTGRES_USER="$(from_env_file POSTGRES_USER)"
  [ -n "${APP_RUNTIME_PASSWORD:-}" ] || APP_RUNTIME_PASSWORD="$(from_env_file APP_RUNTIME_PASSWORD)"

  : "${POSTGRES_DB:?POSTGRES_DB ausente: defina no ambiente ou em $DB_ENV_FILE}"
  : "${POSTGRES_USER:?POSTGRES_USER ausente: defina no ambiente ou em $DB_ENV_FILE}"
  : "${APP_RUNTIME_PASSWORD:?APP_RUNTIME_PASSWORD ausente: defina no ambiente ou em $DB_ENV_FILE}"
  export POSTGRES_DB POSTGRES_USER APP_RUNTIME_PASSWORD

  echo "alvo: container=$DB_CONTAINER banco=$POSTGRES_DB usuario=$POSTGRES_USER"

  db_up() { :; }
  db_sh() {
    docker exec -i \
      -e POSTGRES_DB -e POSTGRES_USER -e APP_RUNTIME_PASSWORD \
      "$DB_CONTAINER" sh -lc "$1"
  }
else
  compose() {
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
  }

  db_up() { compose up -d postgres; }
  db_sh() { compose exec -T postgres sh -lc "$1"; }
fi

db_up

db_sh 'until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do sleep 1; done'

db_sh 'psql -v ON_ERROR_STOP=1 -v app_runtime_password="$APP_RUNTIME_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
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
  applied="$(db_sh \
    "psql -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"SELECT 1 FROM public.schema_migrations WHERE filename = '$name'\"")"

  if [ "$applied" = "1" ]; then
    echo "skip $name"
    continue
  fi

  echo "apply $name"
  db_sh 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$migration"
  db_sh \
    "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"INSERT INTO public.schema_migrations(filename) VALUES ('$name')\""
done

# Garante DML nas tabelas já existentes (as DEFAULT PRIVILEGES só cobrem tabelas
# criadas DEPOIS do ALTER; este GRANT cobre as que as migrations acabaram de criar).
# audit_logs volta a ser append-only, conforme migration 0006.
db_sh 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime;
SQL
