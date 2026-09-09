import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { CreateBillingCheckoutSchema } from "@nexos/shared";
import { BillingService } from "./billing.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { parseBody } from "../common/validation/parse-body";

function tenant(req: Request) {
  const value = (req as unknown as { tenant?: { orgId: string; userId: string; role: string } }).tenant;
  if (!value) throw new UnauthorizedException();
  return value;
}

function secureTokenEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

@Controller("billing")
export class BillingController {
  constructor(@Inject(BillingService) private readonly service: BillingService) {}

  @Get("plans")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  plans() { return this.service.plans(); }

  @Get("status")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  status(@Req() req: Request) { const t = tenant(req); return this.service.status(t.orgId, t.userId); }

  @Get("invoices")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  invoices(@Req() req: Request) { const t = tenant(req); return this.service.invoices(t.orgId, t.userId); }

  @Post("checkout")
  @Idempotent()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  checkout(@Req() req: Request, @Body() body: unknown) {
    const t = tenant(req);
    return this.service.createCheckout(t.orgId, t.userId, parseBody(CreateBillingCheckoutSchema, body));
  }

  @Post("cancel")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  cancel(@Req() req: Request) { const t = tenant(req); return this.service.cancel(t.orgId, t.userId); }

  @Post("webhooks/asaas")
  @HttpCode(200)
  async webhook(@Headers("asaas-access-token") token: string | undefined, @Body() body: unknown) {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
    if (!expected || !token || !secureTokenEqual(token, expected)) throw new UnauthorizedException();
    await this.service.ingestWebhook(body as Record<string, unknown>);
    return { received: true };
  }
}
