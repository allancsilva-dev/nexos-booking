import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { BillingRepository } from "./billing.repository";
import { hasFullBillingAccess } from "./billing-access";
import { SubscriptionRequiredException } from "../common/exceptions/domain.exception";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class SubscriptionAccessInterceptor implements NestInterceptor {
  constructor(@Inject(BillingRepository) private readonly repo: BillingRepository) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    if (process.env.BILLING_ENFORCEMENT_ENABLED !== "true") return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) return next.handle();

    const path = req.path;
    if (path.startsWith("/api/v1/auth/") || path.startsWith("/api/v1/billing/") || path === "/api/v1/public/cancel" || path === "/api/v1/public/cancel/preview") {
      return next.handle();
    }

    const tenant = (req as unknown as { tenant?: { orgId: string; userId: string }; publicTenant?: { organizationId: string } }).tenant;
    const publicTenant = (req as unknown as { publicTenant?: { organizationId: string } }).publicTenant;
    const orgId = tenant?.orgId ?? publicTenant?.organizationId;
    if (!orgId) return next.handle();
    const [subscription] = await this.repo.findSubscription(orgId, tenant?.userId ?? null);
    if (!hasFullBillingAccess(subscription)) throw new SubscriptionRequiredException();
    return next.handle();
  }
}
