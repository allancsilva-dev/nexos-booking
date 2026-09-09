import assert from "node:assert/strict";
import { BillingStatusSchema, CreateBillingCheckoutSchema } from "@nexos/shared";
import type { ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { effectiveBillingStatus, hasFullBillingAccess, type BillingSubscriptionRow } from "../src/billing/billing-access";
import { SubscriptionAccessInterceptor } from "../src/billing/subscription-access.interceptor";
import type { BillingRepository } from "../src/billing/billing.repository";

function subscription(overrides: Partial<BillingSubscriptionRow>): BillingSubscriptionRow {
  const now = new Date();
  return {
    id: crypto.randomUUID(), organization_id: crypto.randomUUID(), plan_id: null,
    provider: "ASAAS", provider_customer_id: null, provider_subscription_id: null,
    status: "TRIALING", trial_ends_at: new Date(now.getTime() + 1000),
    current_period_starts_at: null, current_period_ends_at: null, grace_ends_at: null,
    cancel_at_period_end: false, canceled_at: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

async function main() {

const now = new Date("2026-07-13T12:00:00.000Z");
assert.equal(hasFullBillingAccess(subscription({ status: "TRIALING", trial_ends_at: new Date("2026-07-14T12:00:00.000Z") }), now), true);
assert.equal(hasFullBillingAccess(subscription({ status: "TRIALING", trial_ends_at: new Date("2026-07-13T11:59:59.000Z") }), now), false);
assert.equal(effectiveBillingStatus(subscription({ status: "PAST_DUE", grace_ends_at: new Date("2026-07-13T11:59:59.000Z") }), now), "EXPIRED");
assert.equal(hasFullBillingAccess(subscription({ status: "CANCEL_AT_PERIOD_END", current_period_ends_at: new Date("2026-08-13T12:00:00.000Z"), cancel_at_period_end: true }), now), true);
assert.equal(CreateBillingCheckoutSchema.safeParse({ planCode: "ANNUAL" }).success, true);
assert.equal(CreateBillingCheckoutSchema.safeParse({ planCode: "WEEKLY" }).success, false);
assert.equal(BillingStatusSchema.safeParse({ status: "ACTIVE", accessMode: "FULL", trialEndsAt: null, currentPeriodEndsAt: "2026-08-13T12:00:00.000Z", graceEndsAt: null, cancelAtPeriodEnd: false, plan: { code: "MONTHLY", name: "Mensal", cycle: "MONTHLY", priceCents: 5990, currency: "BRL", months: 1 } }).success, true);

const previousEnforcement = process.env.BILLING_ENFORCEMENT_ENABLED;
process.env.BILLING_ENFORCEMENT_ENABLED = "true";
const request = { method: "POST", path: "/api/v1/services", tenant: { orgId: crypto.randomUUID(), userId: crypto.randomUUID() } };
const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
const expired = subscription({ status: "EXPIRED", trial_ends_at: new Date("2026-07-01T00:00:00.000Z") });
const denied = new SubscriptionAccessInterceptor({ findSubscription: async () => [expired] } as unknown as BillingRepository);
await assert.rejects(() => denied.intercept(context, { handle: () => of("denied") }), (error: unknown) => typeof error === "object" && error !== null && "errorCode" in error && error.errorCode === "SUBSCRIPTION_REQUIRED");
const allowed = new SubscriptionAccessInterceptor({ findSubscription: async () => [subscription({ trial_ends_at: new Date(Date.now() + 60_000) })] } as unknown as BillingRepository);
assert.equal(await firstValueFrom(await allowed.intercept(context, { handle: () => of("allowed") })), "allowed");
if (previousEnforcement === undefined) delete process.env.BILLING_ENFORCEMENT_ENABLED;
else process.env.BILLING_ENFORCEMENT_ENABLED = previousEnforcement;

console.log("Billing contracts: PASS");
}

void main();
