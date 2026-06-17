-- 0006_functions_and_rls
-- Funções SECURITY DEFINER, resolvers públicos, ENABLE/FORCE RLS,
-- policies de tenant e hardening de segurança do banco.
-- Pré-requisito: role app_runtime provisionada via infra/IaC (§10.2).

-- ═══════════════════════════════════════════════════════════════════
-- 1. FUNÇÃO DE MEMBERSHIP (base da RLS de identidade)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app_is_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = target_org
      AND user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
$$;

REVOKE ALL ON FUNCTION app_is_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_member(uuid) TO app_runtime;

-- ═══════════════════════════════════════════════════════════════════
-- 2. RESOLVERS PÚBLICOS (ADR-017)
--    Lookups legítimos antes de existir contexto de tenant.
--    Devolvem só os IDs mínimos; app então abre withTenantContext
--    e lê a linha completa sob RLS normal.
-- ═══════════════════════════════════════════════════════════════════

-- 2.1 Rota pública: slug → organization_id
CREATE OR REPLACE FUNCTION app_resolve_org_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM organizations WHERE lower(slug) = lower(p_slug);
$$;

-- 2.2 Cancelamento público: hash do token → (org, appointment)
CREATE OR REPLACE FUNCTION app_resolve_appointment_by_cancel_hash(p_hash text)
RETURNS TABLE (organization_id uuid, appointment_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.organization_id, a.id
  FROM appointments a
  WHERE a.public_cancel_token_hash = p_hash;
$$;

-- 2.3 Aceite de convite: hash do token → (org, invitation)
CREATE OR REPLACE FUNCTION app_resolve_invitation_by_hash(p_hash text)
RETURNS TABLE (organization_id uuid, invitation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.organization_id, i.id
  FROM invitations i
  WHERE i.token_hash = p_hash;
$$;

REVOKE ALL ON FUNCTION app_resolve_org_by_slug(text)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_appointment_by_cancel_hash(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION app_resolve_invitation_by_hash(text)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_resolve_org_by_slug(text)                TO app_runtime;
GRANT EXECUTE ON FUNCTION app_resolve_appointment_by_cancel_hash(text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_resolve_invitation_by_hash(text)         TO app_runtime;

-- ═══════════════════════════════════════════════════════════════════
-- 3. RLS — ENABLE + FORCE em todas as tabelas com tenant
-- ═══════════════════════════════════════════════════════════════════

-- 3.1 Identity/bootstrap
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE  ROW LEVEL SECURITY;

ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users FORCE  ROW LEVEL SECURITY;

-- 3.2 Operacionais — tenant_isolation (8 tabelas)
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals FORCE  ROW LEVEL SECURITY;

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE  ROW LEVEL SECURITY;

ALTER TABLE professional_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_services FORCE  ROW LEVEL SECURITY;

ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours FORCE  ROW LEVEL SECURITY;

ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_blocks FORCE  ROW LEVEL SECURITY;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE  ROW LEVEL SECURITY;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE  ROW LEVEL SECURITY;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE  ROW LEVEL SECURITY;

-- 3.3 Operacionais — tenant_or_system (3 tabelas, ADR-017 §10.8)
ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_events FORCE  ROW LEVEL SECURITY;

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE  ROW LEVEL SECURITY;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE  ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- 4. POLICIES
--    Toda leitura de GUC usa NULLIF(current_setting(...), '')
--    antes do cast (A3 — anti-22P02 sob pooling).
--    is_system usa COALESCE(NULLIF(...)::boolean, false).
-- ═══════════════════════════════════════════════════════════════════

-- 4.1 organizations — tenant_or_member (usa app_is_member)
CREATE POLICY tenant_or_member ON organizations
  USING (
    id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR app_is_member(id)
  );

-- 4.2 organization_users — tenant_or_self
CREATE POLICY tenant_or_self ON organization_users
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- 4.3 Operacionais — tenant_isolation (8 tabelas)
--     Lê o GUC app.current_organization_id. Sem contexto → NULL → nega tudo.
CREATE POLICY tenant_isolation ON professionals
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON services
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON professional_services
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON working_hours
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON availability_blocks
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON clients
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON appointments
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON audit_logs
  USING      (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid);

-- 4.4 Operacionais — tenant_or_system (3 tabelas, ADR-017 §10.8)
--     Jobs cross-tenant (relay do outbox, limpeza de idempotência/convites)
--     operam com app.is_system = true via withSystemContext.
CREATE POLICY tenant_or_system ON appointment_events
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  );

CREATE POLICY tenant_or_system ON idempotency_keys
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  );

CREATE POLICY tenant_or_system ON invitations
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false)
  );

-- 4.5 audit_logs — eventos globais (ADR-017 §10.5)
--     INSERT de eventos sem tenant (LOGIN_FAILED, etc.) permitido.
--     Leitura de linhas globais NÃO tem policy (invisíveis ao app).
CREATE POLICY global_security_events ON audit_logs
  FOR INSERT
  WITH CHECK (organization_id IS NULL);

-- ═══════════════════════════════════════════════════════════════════
-- 5. HARDENING DE SEGURANÇA DO BANCO (ADR-021 §10.9)
--    Pré-requisito: role app_runtime provisionada por infra/IaC (§10.2).
--    CREATE ROLE, senha e grants de ambiente NÃO entram em migration.
-- ═══════════════════════════════════════════════════════════════════

-- Least-privilege no schema: nada implícito para PUBLIC
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT  USAGE ON SCHEMA public TO app_runtime;

-- audit_logs é APPEND-ONLY: a app escreve, mas não reescreve nem apaga
REVOKE UPDATE, DELETE ON audit_logs FROM app_runtime;

-- Limites de execução na role da aplicação
ALTER ROLE app_runtime SET statement_timeout = '8s';
ALTER ROLE app_runtime SET idle_in_transaction_session_timeout = '15s';
