import {
  Controller,
  Inject,
  Get,
  Req,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";

import { DashboardService } from "./dashboard.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";

interface TenantInfo {
  orgId: string;
  userId: string;
  role: string;
}

function getTenant(req: Request): TenantInfo {
  const tenant = (req as unknown as { tenant?: TenantInfo }).tenant;
  if (!tenant) {
    throw new NotFoundException("Organization not found");
  }
  return tenant;
}

@Controller("dashboard")
export class DashboardController {
  constructor(
    @Inject(DashboardService)
    private readonly service: DashboardService,
  ) {}

  @Get("overview")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async overview(@Req() req: Request) {
    const tenant = getTenant(req);
    return this.service.getOverview(tenant.orgId, tenant.userId);
  }
}
