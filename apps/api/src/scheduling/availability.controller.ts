import {
  Controller,
  Inject,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";

import { AvailabilityService } from "./availability.service";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { AvailabilityQuerySchema } from "@nexos/shared";

interface TenantInfo {
  orgId: string;
  userId: string;
  role: string;
}

function getTenant(req: Request): TenantInfo {
  const tenant = (req as unknown as { tenant?: TenantInfo }).tenant;
  if (!tenant) {
    throw new HttpException(
      { error: { code: "AUTH_REQUIRED", message: "Not authenticated" } },
      HttpStatus.UNAUTHORIZED,
    );
  }
  return tenant;
}

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function validationError(
  details: { field: string; issue: string }[],
): never {
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

@Controller()
export class AvailabilityController {
  constructor(
    @Inject(AvailabilityService)
    private readonly service: AvailabilityService,
  ) {}

  @Get("professionals/:professionalId/availability")
  @UseGuards(AuthGuard, TenantGuard)
  async getAvailability(
    @Req() req: Request,
    @Param("professionalId") professionalId: string,
    @Query() query: { from?: string; to?: string; serviceId?: string },
  ) {
    const tenant = getTenant(req);

    const serviceId = query.serviceId;
    const from = query.from;
    const to = query.to;

    if (!serviceId) {
      validationError([
        { field: "serviceId", issue: "required" },
      ]);
    }
    if (!isUUID(serviceId)) {
      validationError([
        { field: "serviceId", issue: "invalid_uuid" },
      ]);
    }
    if (!from || !to) {
      const missing: { field: string; issue: string }[] = [];
      if (!from) missing.push({ field: "from", issue: "required" });
      if (!to) missing.push({ field: "to", issue: "required" });
      validationError(missing);
    }

    const parsed = AvailabilityQuerySchema.safeParse({
      from,
      to,
      serviceId,
    });
    if (!parsed.success) {
      const details = parsed.error.issues.map((e) => ({
        field: e.path.join("."),
        issue: e.message,
      }));
      validationError(details);
    }

    return this.service.getAvailability(
      tenant.orgId,
      tenant.userId,
      tenant.role,
      professionalId,
      parsed.data!,
    );
  }
}
