-- SaaS billing: plans, per-organization entitlement, checkout reconciliation and webhook inbox.

CREATE TABLE billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  provider_cycle text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  currency char(3) NOT NULL DEFAULT 'BRL',
  months smallint NOT NULL CHECK (months IN (1, 6, 12)),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_plans_code_uk UNIQUE (code),
  CONSTRAINT billing_plans_code_ck CHECK (code IN ('MONTHLY', 'SEMIANNUAL', 'ANNUAL')),
  CONSTRAINT billing_plans_cycle_ck CHECK (provider_cycle IN ('MONTHLY', 'SEMIANNUALLY', 'YEARLY'))
);

CREATE TABLE billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES billing_plans(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'ASAAS',
  provider_customer_id text,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'TRIALING',
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_subscriptions_org_uk UNIQUE (organization_id),
  CONSTRAINT billing_subscriptions_status_ck CHECK (status IN ('TRIALING', 'CHECKOUT_PENDING', 'ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END', 'CANCELED', 'EXPIRED'))
);
CREATE UNIQUE INDEX billing_subscriptions_provider_sub_uk ON billing_subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE billing_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  provider_checkout_id text NOT NULL,
  checkout_url text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT billing_checkout_provider_uk UNIQUE (provider_checkout_id),
  CONSTRAINT billing_checkout_status_ck CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELED'))
);
CREATE INDEX billing_checkout_org_created_idx ON billing_checkout_sessions(organization_id, created_at DESC);

CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
  provider_payment_id text NOT NULL,
  status text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  due_date text NOT NULL,
  paid_at timestamptz,
  provider_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_invoices_provider_payment_uk UNIQUE (provider_payment_id)
);
CREATE INDEX billing_invoices_org_due_idx ON billing_invoices(organization_id, due_date DESC);

CREATE TABLE billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_webhook_provider_event_uk UNIQUE (provider_event_id),
  CONSTRAINT billing_webhook_state_ck CHECK (state IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'))
);
CREATE INDEX billing_webhook_pending_idx ON billing_webhook_events(next_attempt_at) WHERE processed_at IS NULL AND failed_at IS NULL;

INSERT INTO billing_plans (code, name, provider_cycle, price_cents, months) VALUES
  ('MONTHLY', 'Mensal', 'MONTHLY', 5990, 1),
  ('SEMIANNUAL', 'Semestral', 'SEMIANNUALLY', 32340, 6),
  ('ANNUAL', 'Anual', 'YEARLY', 57500, 12);

-- Existing organizations receive a fresh seven-day trial at rollout.
INSERT INTO billing_subscriptions (organization_id, status, trial_ends_at)
SELECT id, 'TRIALING', now() + interval '7 days' FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_checkout_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_subscriptions_tenant_or_system ON billing_subscriptions
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false))
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false));

CREATE POLICY billing_checkout_tenant_or_system ON billing_checkout_sessions
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false))
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false));

CREATE POLICY billing_invoices_tenant_or_system ON billing_invoices
  USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false))
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    OR COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false));

CREATE POLICY billing_webhooks_system_only ON billing_webhook_events
  USING (COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false))
  WITH CHECK (COALESCE(NULLIF(current_setting('app.is_system', true), '')::boolean, false));
