import { Injectable } from "@nestjs/common";
import { DependencyUnavailableException } from "../common/exceptions/dependency-unavailable.exception";

export interface AsaasCheckoutInput {
  organizationId: string;
  planCode: string;
  planName: string;
  cycle: string;
  valueCents: number;
  nextDueDate: string;
}

@Injectable()
export class AsaasProvider {
  private readonly apiBase = (process.env.ASAAS_API_BASE_URL ?? "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");

  private get apiKey(): string {
    const value = process.env.ASAAS_API_KEY?.trim();
    if (!value) throw new DependencyUnavailableException("ASAAS is not configured");
    return value;
  }

  async createCheckout(input: AsaasCheckoutInput): Promise<{ id: string; url: string }> {
    const appUrl = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const response = await this.request<{ id: string }>("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        billingTypes: ["CREDIT_CARD"],
        chargeTypes: ["RECURRENT"],
        minutesToExpire: 60,
        externalReference: input.organizationId,
        callback: {
          successUrl: `${appUrl}/settings/billing?checkout=success`,
          cancelUrl: `${appUrl}/settings/billing?checkout=canceled`,
          expiredUrl: `${appUrl}/settings/billing?checkout=expired`,
        },
        items: [{
          externalReference: input.planCode,
          name: `Nexos Booking — ${input.planName}`,
          description: "Assinatura do sistema de agendamentos Nexos Booking",
          quantity: 1,
          value: input.valueCents / 100,
        }],
        subscription: { cycle: input.cycle, nextDueDate: input.nextDueDate },
      }),
    });

    const checkoutHost = this.apiBase.includes("sandbox")
      ? "https://sandbox.asaas.com"
      : "https://asaas.com";
    return { id: response.id, url: `${checkoutHost}/checkoutSession/show?id=${encodeURIComponent(response.id)}` };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });

    // Asaas keeps already-generated charges after removing a subscription.
    const result = await this.request<{ data?: Array<{ id: string; status: string }> }>(
      `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=100`,
    );
    const removable = new Set(["PENDING", "OVERDUE"]);
    await Promise.all(
      (result.data ?? [])
        .filter((payment) => removable.has(payment.status))
        .map((payment) => this.request(`/payments/${encodeURIComponent(payment.id)}`, { method: "DELETE" })),
    );
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${path}`, {
        ...init,
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: "application/json",
          access_token: this.apiKey,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new DependencyUnavailableException("ASAAS request failed");
    }

    if (!response.ok) {
      throw new DependencyUnavailableException(`ASAAS returned HTTP ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
