-- BUG-033: isolate global identity rows while preserving narrow pre-auth flows.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_can_view_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    target_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM public.organization_users actor
      JOIN public.organization_users target
        ON target.organization_id = actor.organization_id
      WHERE actor.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND actor.organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        AND actor.status = 'ACTIVE'
        AND target.user_id = target_user_id
    );
$$;

CREATE POLICY users_visible_identity ON users
  FOR SELECT USING (app_can_view_user(id));
CREATE POLICY users_update_self ON users
  FOR UPDATE
  USING (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY users_owner_functions ON users
  USING (current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.users'::regclass)))
  WITH CHECK (current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.users'::regclass)));

CREATE POLICY refresh_sessions_self ON refresh_sessions
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY refresh_sessions_owner_functions ON refresh_sessions
  USING (current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.refresh_sessions'::regclass)))
  WITH CHECK (current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.refresh_sessions'::regclass)));

CREATE POLICY verification_tokens_self ON verification_tokens
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY verification_tokens_owner_functions ON verification_tokens
  USING (current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.verification_tokens'::regclass)))
  WITH CHECK (current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.verification_tokens'::regclass)));

CREATE OR REPLACE FUNCTION app_auth_find_user_by_email(requested_email text)
RETURNS TABLE (
  id uuid, name text, email text, password_hash text, phone text,
  email_verified_at timestamptz, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.name, u.email, u.password_hash, u.phone,
         u.email_verified_at, u.created_at, u.updated_at
  FROM public.users u
  WHERE lower(u.email) = lower(trim(requested_email))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_auth_create_user(
  requested_name text,
  requested_email text,
  requested_password_hash text
)
RETURNS TABLE (
  id uuid, name text, email text, password_hash text, phone text,
  email_verified_at timestamptz, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.users (name, email, password_hash)
  VALUES (requested_name, lower(trim(requested_email)), requested_password_hash)
  RETURNING users.id, users.name, users.email, users.password_hash, users.phone,
            users.email_verified_at, users.created_at, users.updated_at;
$$;

CREATE OR REPLACE FUNCTION app_auth_find_user_by_id(requested_id uuid)
RETURNS TABLE (
  id uuid, name text, email text, password_hash text, phone text,
  email_verified_at timestamptz, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.name, u.email, u.password_hash, u.phone,
         u.email_verified_at, u.created_at, u.updated_at
  FROM public.users u
  WHERE u.id = requested_id
    AND u.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_auth_resolve_refresh_user(requested_hash text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT user_id FROM public.refresh_sessions WHERE token_hash = requested_hash LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_auth_resolve_verification_user(
  requested_hash text,
  requested_purpose text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT user_id
  FROM public.verification_tokens
  WHERE token_hash = requested_hash AND purpose = requested_purpose
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_auth_find_invitation_by_hash(requested_hash text)
RETURNS TABLE (
  id uuid, organization_id uuid, email text, role text, token_hash text,
  invited_by uuid, expires_at timestamptz, accepted_at timestamptz, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.id, i.organization_id, i.email, i.role, i.token_hash,
         i.invited_by, i.expires_at, i.accepted_at, i.created_at
  FROM public.invitations i
  WHERE i.token_hash = requested_hash
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_maintenance_cleanup_refresh_sessions()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.refresh_sessions WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION app_maintenance_cleanup_verification_tokens()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.verification_tokens WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION app_can_view_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_create_user(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_find_user_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_resolve_refresh_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_resolve_verification_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_find_invitation_by_hash(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_maintenance_cleanup_refresh_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_maintenance_cleanup_verification_tokens() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_can_view_user(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_auth_find_user_by_email(text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_auth_create_user(text, text, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_auth_find_user_by_id(uuid) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_auth_resolve_refresh_user(text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_auth_resolve_verification_user(text, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_auth_find_invitation_by_hash(text) TO app_runtime;
GRANT EXECUTE ON FUNCTION app_maintenance_cleanup_refresh_sessions() TO app_runtime;
GRANT EXECUTE ON FUNCTION app_maintenance_cleanup_verification_tokens() TO app_runtime;

REVOKE ALL ON users, refresh_sessions, verification_tokens FROM app_runtime;
GRANT SELECT (id, name, email, phone, email_verified_at, created_at, updated_at) ON users TO app_runtime;
GRANT UPDATE (name, email, password_hash, phone, email_verified_at, updated_at) ON users TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_sessions, verification_tokens TO app_runtime;
