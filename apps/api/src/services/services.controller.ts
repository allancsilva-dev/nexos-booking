import {
  Controller,
  Inject,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";

import { ServicesService } from "./services.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";
import type { CreateServiceInput } from "./dto/create-service.dto";
import type { UpdateServiceInput } from "./dto/update-service.dto";

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

@Controller("services")
export class ServicesController {
  constructor(
    @Inject(ServicesService)
    private readonly service: ServicesService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  async findAll(@Req() req: Request) {
    const tenant = getTenant(req);
    return this.service.findAll(tenant.orgId);
  }

  @Post()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async create(
    @Body() body: CreateServiceInput,
    @Req() req: Request,
  ) {
    const tenant = getTenant(req);
    return this.service.create(tenant.orgId, tenant.userId, body);
  }

  @Patch(":id")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateServiceInput,
    @Req() req: Request,
  ) {
    const tenant = getTenant(req);
    return this.service.update(tenant.orgId, id, tenant.userId, body);
  }
}
