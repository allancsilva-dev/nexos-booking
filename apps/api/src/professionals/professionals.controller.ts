import {
  Controller,
  Inject,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";

import { ProfessionalsService } from "./professionals.service";
import { WorkingHoursService } from "../scheduling/working-hours.service";
import { AvailabilityBlocksService } from "../scheduling/availability-blocks.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";
import type { CreateProfessionalInput } from "./dto/create-professional.dto";
import type { UpdateProfessionalInput } from "./dto/update-professional.dto";
import type { WorkingHoursInput } from "@nexos/shared";
import type { CreateBlockInput } from "../scheduling/dto/create-block.dto";

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
    @Inject(AvailabilityBlocksService)
    private readonly blocksService: AvailabilityBlocksService,
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

  @Get(":professionalId/blocks")
  @UseGuards(AuthGuard, TenantGuard)
  async getBlocks(
    @Req() req: Request,
    @Param("professionalId") professionalId: string,
    @Query() query: { from?: string; to?: string },
  ) {
    const tenant = getTenant(req);
    const { from, to } = query;
    if (!from || !to) {
      throw new HttpException(
        { error: { code: "VALIDATION_ERROR" as const, message: "from and to query parameters are required" } },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return this.blocksService.getBlocks(tenant.orgId, professionalId, from, to);
  }

  @Post(":professionalId/blocks")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async createBlock(
    @Req() req: Request,
    @Param("professionalId") professionalId: string,
    @Body() body: CreateBlockInput,
  ) {
    const tenant = getTenant(req);
    return this.blocksService.createBlock(tenant.orgId, professionalId, tenant.userId, body);
  }

  @Delete(":professionalId/blocks/:blockId")
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER")
  async deleteBlock(
    @Req() req: Request,
    @Param("professionalId") professionalId: string,
    @Param("blockId") blockId: string,
  ) {
    const tenant = getTenant(req);
    await this.blocksService.deleteBlock(tenant.orgId, professionalId, tenant.userId, blockId);
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
