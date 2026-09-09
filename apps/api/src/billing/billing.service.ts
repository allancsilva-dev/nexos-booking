import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { BillingPlan, BillingStatus, CreateBillingCheckoutInput } from "@nexos/shared";
import {
  billingCheckoutSessions,
  billingInvoices,
  billingPlans,
  billingSubscriptions,
} from "../../db/schema";
import type { DbTransaction } from "../db/db.types";
import { BillingRepository } from "./billing.repository";
import { AsaasProvider } from "./asaas.provider";
import { effectiveBillingStatus, hasFullBillingAccess } from "./billing-access";
import { DomainException } from "../common/exceptions/domain.exception";

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function planDto(row: typeof billingPlans.$inferSelect): BillingPlan {
  return { code: row.code as BillingPlan["code"], name: row.name, cycle: row.provider_cycle as BillingPlan["cycle"], priceCents: row.price_cents, currency: "BRL", months: row.months };
}

function iso(value: Date | null): string | null { return value?.toISOString() ?? null; }

function saoPauloDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dateAtSaoPauloStart(value: string): Date {
  return new Date(`${value}T00:00:00-03:00`);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

@Injectable()
export class BillingService {
  constructor(
    @Inject(BillingRepository) private readonly repo: BillingRepository,
    @Inject(AsaasProvider) private readonly provider: AsaasProvider,
  ) {}

  createTrial(tx: DbTransaction, organizationId: string) {
    return this.repo.createTrial(tx, organizationId, new Date(Date.now() + TRIAL_MS));
  }

  async plans(): Promise<BillingPlan[]> { return (await this.repo.listPlans()).map(planDto); }

  async status(orgId: string, userId: string): Promise<BillingStatus> {
    const result = await this.repo.findSubscriptionWithPlan(orgId, userId);
    const current = result[0];
    if (!current) throw new NotFoundException("Billing subscription not found");
    const row = current.subscription;
    return {
      status: effectiveBillingStatus(row) as BillingStatus["status"],
      accessMode: hasFullBillingAccess(row) ? "FULL" : "READ_ONLY",
      trialEndsAt: iso(row.trial_ends_at), currentPeriodEndsAt: iso(row.current_period_ends_at), graceEndsAt: iso(row.grace_ends_at),
      cancelAtPeriodEnd: row.cancel_at_period_end,
      plan: current.plan ? planDto(current.plan) : null,
    };
  }

  async invoices(orgId: string, userId: string) {
    return (await this.repo.listInvoices(orgId, userId)).map((row) => ({
      id: row.id, providerPaymentId: row.provider_payment_id, status: row.status,
      amountCents: row.amount_cents, dueDate: row.due_date, paidAt: iso(row.paid_at),
    }));
  }

  async createCheckout(orgId: string, userId: string, input: CreateBillingCheckoutInput) {
    const [plan] = await this.repo.findPlan(input.planCode);
    if (!plan) throw new NotFoundException("Billing plan not found");
    const [subscription] = await this.repo.findSubscription(orgId, userId);
    if (!subscription) throw new NotFoundException("Billing subscription not found");
    if (["ACTIVE", "CANCEL_AT_PERIOD_END"].includes(subscription.status) && subscription.current_period_ends_at && subscription.current_period_ends_at > new Date()) {
      throw new DomainException("BAD_REQUEST", "Plan changes are available after the current paid period", HttpStatus.CONFLICT);
    }

    const [existing] = await this.repo.findReusableCheckout(orgId, plan.id, userId);
    if (existing) return { checkoutUrl: existing.checkout_url, expiresAt: existing.expires_at.toISOString() };

    const now = new Date();
    const firstDue = subscription.trial_ends_at && subscription.trial_ends_at > now ? subscription.trial_ends_at : now;
    const checkout = await this.provider.createCheckout({
      organizationId: orgId, planCode: plan.code, planName: plan.name,
      cycle: plan.provider_cycle, valueCents: plan.price_cents, nextDueDate: saoPauloDate(firstDue),
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.repo.saveCheckout(orgId, userId, { planId: plan.id, providerId: checkout.id, url: checkout.url, expiresAt });
    return { checkoutUrl: checkout.url, expiresAt: expiresAt.toISOString() };
  }

  async cancel(orgId: string, userId: string) {
    const [subscription] = await this.repo.findSubscription(orgId, userId);
    if (!subscription) throw new NotFoundException("Billing subscription not found");
    if (subscription.provider_subscription_id) await this.provider.cancelSubscription(subscription.provider_subscription_id);
    const [updated] = await this.repo.markCancelAtPeriodEnd(orgId, userId);
    return { cancelAtPeriodEnd: true, accessUntil: iso(updated?.current_period_ends_at ?? updated?.trial_ends_at ?? null) };
  }

  ingestWebhook(event: { id?: unknown; event?: unknown; [key: string]: unknown }) {
    if (typeof event.id !== "string" || typeof event.event !== "string") throw new Error("Invalid ASAAS webhook envelope");
    return this.repo.ingestWebhook(event.id, event.event, event);
  }

  processWebhookBatch() { return this.repo.processWebhookBatch((tx, event) => this.processEvent(tx, event.event_type, event.payload)); }

  private async processEvent(tx: DbTransaction, eventType: string, raw: unknown): Promise<void> {
    const payload = raw as Record<string, unknown>;
    const payment = (payload.payment ?? {}) as Record<string, unknown>;
    const providerSubscriptionId = typeof payment.subscription === "string" ? payment.subscription : null;
    const subscriptionEvent = (payload.subscription ?? {}) as Record<string, unknown>;
    const checkout = (payload.checkout ?? {}) as Record<string, unknown>;
    const externalReference = [payment.externalReference, subscriptionEvent.externalReference, checkout.externalReference, payload.externalReference]
      .find((value): value is string => typeof value === "string") ?? null;
    let rows = providerSubscriptionId
      ? await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.provider_subscription_id, providerSubscriptionId)).limit(1)
      : [];
    if (rows.length === 0 && externalReference) {
      rows = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.organization_id, externalReference)).limit(1);
    }

    if (eventType.startsWith("CHECKOUT_") && typeof checkout.id === "string") {
      await tx.update(billingCheckoutSessions).set({ status: eventType.includes("PAID") || eventType.includes("COMPLETED") ? "COMPLETED" : "CANCELED", completed_at: new Date() })
        .where(eq(billingCheckoutSessions.provider_checkout_id, checkout.id));
      return;
    }

    if (eventType.startsWith("SUBSCRIPTION_") && typeof subscriptionEvent.id === "string") {
      const found = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.provider_subscription_id, subscriptionEvent.id)).limit(1);
      if (found[0] && ["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"].includes(eventType) && !found[0].cancel_at_period_end) {
        await tx.update(billingSubscriptions).set({ status: "CANCELED", canceled_at: new Date(), updated_at: new Date() }).where(eq(billingSubscriptions.id, found[0].id));
      }
      return;
    }

    const subscription = rows[0];
    if (!subscription || typeof payment.id !== "string") return;
    if (providerSubscriptionId && !subscription.provider_subscription_id) {
      await tx.update(billingSubscriptions).set({ provider_subscription_id: providerSubscriptionId, updated_at: new Date() }).where(eq(billingSubscriptions.id, subscription.id));
    }

    const eventAt = (() => {
      if (typeof payload.dateCreated !== "string") return new Date();
      const normalized = payload.dateCreated.includes("T") ? payload.dateCreated : payload.dateCreated.replace(" ", "T");
      const parsed = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}-03:00`);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    })();
    const existing = await tx.select().from(billingInvoices).where(eq(billingInvoices.provider_payment_id, payment.id)).limit(1);
    if (existing[0]?.provider_event_at && existing[0].provider_event_at > eventAt) return;
    const dueDate = typeof payment.dueDate === "string" ? payment.dueDate : saoPauloDate(new Date());
    const amountCents = typeof payment.value === "number" ? Math.round(payment.value * 100) : 0;
    const paid = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(eventType);

    await tx.insert(billingInvoices).values({
      organization_id: subscription.organization_id, subscription_id: subscription.id, provider_payment_id: payment.id,
      status: eventType, amount_cents: amountCents, due_date: dueDate, paid_at: paid ? eventAt : null, provider_event_at: eventAt,
    }).onConflictDoUpdate({ target: billingInvoices.provider_payment_id, set: { status: eventType, amount_cents: amountCents, due_date: dueDate, paid_at: paid ? eventAt : existing[0]?.paid_at, provider_event_at: eventAt, updated_at: new Date() } });

    if (eventType === "PAYMENT_CREATED") return;
    if (paid) {
      const planRows = subscription.plan_id ? await tx.select().from(billingPlans).where(eq(billingPlans.id, subscription.plan_id)).limit(1) : [];
      if (!planRows[0]) throw new Error("Plan unavailable for paid subscription");
      const periodStart = dateAtSaoPauloStart(dueDate);
      await tx.update(billingSubscriptions).set({
        status: subscription.cancel_at_period_end ? "CANCEL_AT_PERIOD_END" : "ACTIVE",
        current_period_starts_at: periodStart, current_period_ends_at: addMonths(periodStart, planRows[0].months),
        grace_ends_at: null, updated_at: new Date(),
      }).where(eq(billingSubscriptions.id, subscription.id));
      return;
    }
    if (["PAYMENT_OVERDUE", "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED"].includes(eventType)) {
      await tx.update(billingSubscriptions).set({ status: "PAST_DUE", grace_ends_at: new Date(Date.now() + GRACE_MS), updated_at: new Date() }).where(eq(billingSubscriptions.id, subscription.id));
      return;
    }
    if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"].includes(eventType)) {
      await tx.update(billingSubscriptions).set({ status: "EXPIRED", current_period_ends_at: new Date(), grace_ends_at: null, updated_at: new Date() }).where(eq(billingSubscriptions.id, subscription.id));
    }
  }
}
