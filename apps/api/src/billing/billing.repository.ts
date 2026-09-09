import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { DbService, withTenantContext } from "../db";
import { withSystemContext } from "../db/system-context";
import {
  billingCheckoutSessions,
  billingInvoices,
  billingPlans,
  billingSubscriptions,
  billingWebhookEvents,
} from "../../db/schema";
import type { DbTransaction } from "../db/db.types";

@Injectable()
export class BillingRepository {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  createTrial(tx: DbTransaction, organizationId: string, trialEndsAt: Date) {
    return tx.insert(billingSubscriptions).values({ organization_id: organizationId, status: "TRIALING", trial_ends_at: trialEndsAt });
  }

  listPlans() {
    return this.db.client.select().from(billingPlans).where(eq(billingPlans.active, true)).orderBy(billingPlans.months);
  }

  findPlan(code: string) {
    return this.db.client.select().from(billingPlans).where(and(eq(billingPlans.code, code), eq(billingPlans.active, true))).limit(1);
  }

  findSubscription(orgId: string, userId: string | null = null) {
    return withTenantContext(this.db, orgId, userId, (tx) => tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.organization_id, orgId)).limit(1));
  }

  findSubscriptionWithPlan(orgId: string, userId: string | null = null) {
    return withTenantContext(this.db, orgId, userId, (tx) => tx
      .select({ subscription: billingSubscriptions, plan: billingPlans })
      .from(billingSubscriptions)
      .leftJoin(billingPlans, eq(billingSubscriptions.plan_id, billingPlans.id))
      .where(eq(billingSubscriptions.organization_id, orgId)).limit(1));
  }

  listInvoices(orgId: string, userId: string) {
    return withTenantContext(this.db, orgId, userId, (tx) => tx.select().from(billingInvoices)
      .where(eq(billingInvoices.organization_id, orgId)).orderBy(desc(billingInvoices.due_date)).limit(24));
  }

  findReusableCheckout(orgId: string, planId: string, userId: string) {
    return withTenantContext(this.db, orgId, userId, (tx) => tx.select().from(billingCheckoutSessions).where(and(
      eq(billingCheckoutSessions.organization_id, orgId), eq(billingCheckoutSessions.plan_id, planId),
      eq(billingCheckoutSessions.status, "PENDING"), gt(billingCheckoutSessions.expires_at, new Date()),
    )).orderBy(desc(billingCheckoutSessions.created_at)).limit(1));
  }

  saveCheckout(orgId: string, userId: string, data: { planId: string; providerId: string; url: string; expiresAt: Date }) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      await tx.update(billingSubscriptions).set({ plan_id: data.planId, status: "CHECKOUT_PENDING", updated_at: new Date() })
        .where(eq(billingSubscriptions.organization_id, orgId));
      return tx.insert(billingCheckoutSessions).values({ organization_id: orgId, plan_id: data.planId, provider_checkout_id: data.providerId, checkout_url: data.url, expires_at: data.expiresAt }).returning();
    });
  }

  markCancelAtPeriodEnd(orgId: string, userId: string) {
    return withTenantContext(this.db, orgId, userId, (tx) => tx.update(billingSubscriptions).set({ status: "CANCEL_AT_PERIOD_END", cancel_at_period_end: true, canceled_at: new Date(), updated_at: new Date() }).where(eq(billingSubscriptions.organization_id, orgId)).returning());
  }

  ingestWebhook(providerEventId: string, eventType: string, payload: unknown) {
    return withSystemContext(this.db, (tx) => tx.insert(billingWebhookEvents).values({ provider_event_id: providerEventId, event_type: eventType, payload }).onConflictDoNothing({ target: billingWebhookEvents.provider_event_id }));
  }

  async processWebhookBatch(processor: (tx: DbTransaction, event: typeof billingWebhookEvents.$inferSelect) => Promise<void>) {
    return withSystemContext(this.db, async (tx) => {
      const rows = await tx.select().from(billingWebhookEvents).where(and(
        isNull(billingWebhookEvents.processed_at), isNull(billingWebhookEvents.failed_at), lte(billingWebhookEvents.next_attempt_at, new Date()),
      )).orderBy(billingWebhookEvents.created_at).limit(25).for("update", { skipLocked: true });
      for (const row of rows) {
        try {
          await processor(tx, row);
          await tx.update(billingWebhookEvents).set({ state: "PROCESSED", processed_at: new Date(), last_error: null }).where(eq(billingWebhookEvents.id, row.id));
        } catch (error) {
          const attempts = row.attempts + 1;
          const failed = attempts >= 10;
          await tx.update(billingWebhookEvents).set({
            state: failed ? "FAILED" : "PENDING", attempts,
            next_attempt_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 15) * 1000),
            failed_at: failed ? new Date() : null,
            last_error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown webhook error",
          }).where(eq(billingWebhookEvents.id, row.id));
        }
      }
      return rows.length;
    });
  }
}
