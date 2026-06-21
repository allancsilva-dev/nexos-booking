import {
  Controller,
  Inject,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";

import { ClientsService } from "./clients.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";
import type { UpdateClientInput } from "@nexos/shared";

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

@Controller("clients")
export class ClientsController {
  constructor(
    @Inject(ClientsService)
    private readonly service: ClientsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  async list(
    @Req() req: Request,
    @Query() query: { search?: string; cursor?: string; limit?: string },
  ) {
    const tenant = getTenant(req);
    return this.service.listClients(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      {
        search: query.search,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : undefined,
      },
    );
  }

  @Get(":id")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  async get(@Req() req: Request, @Param("id") id: string) {
    const tenant = getTenant(req);
    return this.service.getClient(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      id,
    );
  }

  @Patch(":id")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: UpdateClientInput,
  ) {
    const tenant = getTenant(req);
    return this.service.updateClient(
      tenant.orgId,
      tenant.userId,
      id,
      body,
    );
  }

  @Post(":id/anonymize")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER")
  async anonymize(@Req() req: Request, @Param("id") id: string) {
    const tenant = getTenant(req);
    return this.service.anonymizeClient(
      tenant.orgId,
      tenant.userId,
      id,
    );
  }
}
