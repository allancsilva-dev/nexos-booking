import { z } from "zod";

export const BILLING_PLAN_CODES = ["MONTHLY", "SEMIANNUAL", "ANNUAL"] as const;
export const BILLING_STATUSES = [
  "TRIALING",
  "CHECKOUT_PENDING",
  "ACTIVE",
  "PAST_DUE",
  "CANCEL_AT_PERIOD_END",
  "CANCELED",
  "EXPIRED",
] as const;

export const BillingPlanSchema = z.object({
  code: z.enum(BILLING_PLAN_CODES),
  name: z.string(),
  cycle: z.enum(["MONTHLY", "SEMIANNUALLY", "YEARLY"]),
  priceCents: z.number().int().nonnegative(),
  currency: z.literal("BRL"),
  months: z.number().int().positive(),
});

export const BillingStatusSchema = z.object({
  status: z.enum(BILLING_STATUSES),
  accessMode: z.enum(["FULL", "READ_ONLY"]),
  trialEndsAt: z.string().datetime().nullable(),
  currentPeriodEndsAt: z.string().datetime().nullable(),
  graceEndsAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  plan: BillingPlanSchema.nullable(),
});

export const BillingInvoiceSchema = z.object({
  id: z.string().uuid(),
  providerPaymentId: z.string(),
  status: z.string(),
  amountCents: z.number().int().nonnegative(),
  dueDate: z.string(),
  paidAt: z.string().datetime().nullable(),
});

export const CreateBillingCheckoutSchema = z.object({
  planCode: z.enum(BILLING_PLAN_CODES),
});

export type BillingPlan = z.infer<typeof BillingPlanSchema>;
export type BillingStatus = z.infer<typeof BillingStatusSchema>;
export type BillingInvoice = z.infer<typeof BillingInvoiceSchema>;
export type CreateBillingCheckoutInput = z.infer<typeof CreateBillingCheckoutSchema>;
