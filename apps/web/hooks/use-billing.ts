"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BillingInvoice, BillingPlan, BillingStatus, CreateBillingCheckoutInput } from "@nexos/shared";
import { apiFetch } from "@/lib/http-client";

export function useBillingPlans() {
  return useQuery({ queryKey: ["billing", "plans"], queryFn: () => apiFetch<BillingPlan[]>("/api/v1/billing/plans") });
}

export function useBillingStatus() {
  return useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => apiFetch<BillingStatus>("/api/v1/billing/status"),
    refetchInterval: (query) => query.state.data?.status === "CHECKOUT_PENDING" ? 3_000 : false,
  });
}

export function useBillingInvoices() {
  return useQuery({ queryKey: ["billing", "invoices"], queryFn: () => apiFetch<BillingInvoice[]>("/api/v1/billing/invoices") });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (input: CreateBillingCheckoutInput) => apiFetch<{ checkoutUrl: string; expiresAt: string }>("/api/v1/billing/checkout", {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input),
    }),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
  });
}

export function useCancelSubscription() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/v1/billing/cancel", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["billing"] }),
  });
}
