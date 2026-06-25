-- gate-setup.sql
-- Provisionamento da role app_runtime EXCLUSIVAMENTE para ambiente de gate/CI.
-- Em produção, app_runtime é provisionada por infra/IaC (DATABASE_SCHEMA_V2.md §10.2).
-- Este arquivo NÃO é uma migration versionada. É executado pelo runner de CI
-- antes da sequência de migrations, em banco descartável, com credencial de owner.
-- NÃO contém senha real nem grants de produção.

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

-- Grants mínimos para que a role possa executar DML nas tabelas que as migrations criam.
-- O escopo é o banco descartável do gate. Em produção, grants são gerenciados por IaC.
ALTER DEFAULT PRIVILEGES FOR ROLE current_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
