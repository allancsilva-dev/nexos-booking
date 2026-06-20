import {
  Controller,
  Inject,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";

import { ProfessionalsService } from "./professionals.service";
import { WorkingHoursService } from "../scheduling/working-hours.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";
import type { CreateProfessionalInput } from "./dto/create-professional.dto";
import type { UpdateProfessionalInput } from "./dto/update-professional.dto";
import type { WorkingHoursInput } from "@nexos/shared";

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

@Controller("professionals")
export class ProfessionalsController {
  constructor(
    @Inject(ProfessionalsService)
    private readonly service: ProfessionalsService,
    @Inject(WorkingHoursService)
    private readonly workingHoursService: WorkingHoursService,
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
    @Body() body: CreateProfessionalInput,
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
    @Body() body: UpdateProfessionalInput,
    @Req() req: Request,
  ) {
    const tenant = getTenant(req);
    return this.service.update(tenant.orgId, id, tenant.userId, body);
  }

  @Get(":professionalId/working-hours")
  @UseGuards(AuthGuard, TenantGuard)
  async getWorkingHours(
    @Req() req: Request,
    @Param("professionalId") professionalId: string,
  ) {
    const tenant = getTenant(req);
    return this.workingHoursService.getWorkingHours(
      tenant.orgId,
      professionalId,
    );
  }

  @Put(":professionalId/working-hours")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async setWorkingHours(
    @Req() req: Request,
    @Param("professionalId") professionalId: string,
    @Body() body: WorkingHoursInput,
  ) {
    const tenant = getTenant(req);
    return this.workingHoursService.setWorkingHours(
      tenant.orgId,
      professionalId,
      tenant.userId,
      body,
    );
  }
}
