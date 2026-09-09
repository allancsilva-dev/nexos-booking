import type { InferSelectModel } from "drizzle-orm";
import type { billingSubscriptions } from "../../db/schema";

export type BillingSubscriptionRow = InferSelectModel<typeof billingSubscriptions>;

export function hasFullBillingAccess(row: BillingSubscriptionRow | undefined, now = new Date()): boolean {
  if (!row) return false;
  if (row.status === "TRIALING" || row.status === "CHECKOUT_PENDING") {
    return !!row.trial_ends_at && row.trial_ends_at > now;
  }
  if (row.status === "ACTIVE" || row.status === "CANCEL_AT_PERIOD_END") {
    return !!row.current_period_ends_at && row.current_period_ends_at > now;
  }
  if (row.status === "PAST_DUE") {
    return !!row.grace_ends_at && row.grace_ends_at > now;
  }
  return false;
}

export function effectiveBillingStatus(row: BillingSubscriptionRow, now = new Date()): BillingSubscriptionRow["status"] {
  if (hasFullBillingAccess(row, now)) return row.status;
  if ((row.status === "TRIALING" || row.status === "CHECKOUT_PENDING") && row.trial_ends_at && row.trial_ends_at <= now) return "EXPIRED";
  if (row.status === "PAST_DUE" && row.grace_ends_at && row.grace_ends_at <= now) return "EXPIRED";
  if ((row.status === "ACTIVE" || row.status === "CANCEL_AT_PERIOD_END") && row.current_period_ends_at && row.current_period_ends_at <= now) return row.cancel_at_period_end ? "CANCELED" : "EXPIRED";
  return row.status;
}
