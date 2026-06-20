import {
  Controller,
  Inject,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";

import { AppointmentsService } from "./appointments.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { RolesGuard } from "../authorization/guards/roles.guard";
import { Roles } from "../authorization/decorators/roles.decorator";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { RequireIfMatch } from "./decorators/require-if-match.decorator";
import { IfMatchGuard } from "./guards/if-match.guard";
import { CreateAppointmentSchema, RescheduleSchema } from "@nexos/shared";
import type { TenantContext } from "../auth/guards/tenant.guard";

function getTenant(req: Request): TenantContext {
  const tenant = (req as unknown as { tenant?: TenantContext }).tenant;
  if (!tenant) {
    throw new HttpException(
      { error: { code: "UNAUTHENTICATED", message: "Not authenticated" } },
      HttpStatus.UNAUTHORIZED,
    );
  }
  return tenant;
}

@Controller("appointments")
export class AppointmentsController {
  constructor(
    @Inject(AppointmentsService)
    private readonly service: AppointmentsService,
  ) {}

  @Post()
  @Idempotent()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = CreateAppointmentSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((e) => ({
        field: e.path.join("."),
        issue: e.message,
      }));
      throw new HttpException(
        {
          error: {
            code: "VALIDATION_ERROR" as const,
            message: "Invalid input",
            details,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const tenant = getTenant(req);
    return this.service.create(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      parsed.data,
    );
  }

  @Patch(":id")
  @Idempotent()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, IfMatchGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  @RequireIfMatch()
  async reschedule(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = RescheduleSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((e) => ({
        field: e.path.join("."),
        issue: e.message,
      }));
      throw new HttpException(
        {
          error: {
            code: "VALIDATION_ERROR" as const,
            message: "Invalid input",
            details,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const version =
      (req as unknown as { ifMatchVersion: number }).ifMatchVersion;

    const tenant = getTenant(req);
    return this.service.reschedule(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      id,
      version,
      parsed.data,
    );
  }

  @Post(":id/cancel")
  @Idempotent()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, IfMatchGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  @RequireIfMatch()
  async cancel(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const version =
      (req as unknown as { ifMatchVersion: number }).ifMatchVersion;

    const tenant = getTenant(req);
    return this.service.cancel(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      id,
      version,
    );
  }

  @Post(":id/complete")
  @Idempotent()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, IfMatchGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  @RequireIfMatch()
  async complete(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const version =
      (req as unknown as { ifMatchVersion: number }).ifMatchVersion;

    const tenant = getTenant(req);
    return this.service.complete(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      id,
      version,
    );
  }

  @Post(":id/no-show")
  @Idempotent()
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, IfMatchGuard)
  @Roles("OWNER", "MANAGER", "PROFESSIONAL")
  @RequireIfMatch()
  async noShow(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const version =
      (req as unknown as { ifMatchVersion: number }).ifMatchVersion;

    const tenant = getTenant(req);
    return this.service.noShow(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      id,
      version,
    );
  }
}
