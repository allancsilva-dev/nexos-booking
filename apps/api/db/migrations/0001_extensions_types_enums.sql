-- btree_gist: permite usar '=' em colunas escalares dentro de EXCLUDE USING gist
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Postgres não tem range nativo de TIME; criamos um para a jornada de trabalho
CREATE TYPE timerange AS RANGE (subtype = time);

-- Enums de domínio (estáveis)
CREATE TYPE org_role           AS ENUM ('OWNER', 'MANAGER', 'PROFESSIONAL');
CREATE TYPE membership_status   AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');
CREATE TYPE appointment_status  AS ENUM ('SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE appointment_source  AS ENUM ('PANEL', 'PUBLIC');
CREATE TYPE actor_type          AS ENUM ('STAFF', 'CLIENT', 'SYSTEM');
CREATE TYPE appointment_event_type AS ENUM ('CREATED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE idempotency_state   AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE verification_purpose AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');
