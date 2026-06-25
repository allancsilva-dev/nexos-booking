import {
  Controller,
  Get,
  Post,
  HttpCode,
  Param,
  Query,
  Body,
  Req,
  Inject,
  HttpException,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { PublicBookingService } from "./public-booking.service";
import { PublicTenantGuard } from "./guards/public-tenant.guard";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { AvailabilityQuerySchema, PublicBookingInputSchema } from "@nexos/shared";
import type { PublicBookingInput } from "@nexos/shared";

function getClientIp(req: Request): string {
  return req.ip ?? "unknown";
}

function validationError(details: { field: string; issue: string }[]): never {
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

@Controller("public")
export class PublicBookingController {
  constructor(
    @Inject(PublicBookingService)
    private readonly service: PublicBookingService,
  ) {}

  @Get(":orgSlug")
  async vitrine(@Req() req: Request, @Param("orgSlug") slug: string) {
    return this.service.getVitrine(getClientIp(req), slug);
  }

  @Get(":orgSlug/professionals")
  async listProfessionals(@Req() req: Request, @Param("orgSlug") slug: string) {
    return this.service.getProfessionals(getClientIp(req), slug);
  }

  @Get(":orgSlug/professionals/:professionalSlug/availability")
  async availability(
    @Req() req: Request,
    @Param("orgSlug") orgSlug: string,
    @Param("professionalSlug") professionalSlug: string,
    @Query() query: { date?: string; from?: string; to?: string; serviceId?: string },
  ) {
    if (!query.serviceId) {
      validationError([{ field: "serviceId", issue: "required" }]);
    }

    const parsed = AvailabilityQuerySchema.safeParse(query);
    if (!parsed.success) {
      validationError(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          issue: issue.message,
        })),
      );
    }

    return this.service.getAvailability(
      getClientIp(req),
      orgSlug,
      professionalSlug,
      parsed.data,
    );
  }

  @Idempotent()
  @UseGuards(PublicTenantGuard)
  @Post(":orgSlug/appointments")
  async bookAppointment(
    @Req() req: Request,
    @Param("orgSlug") orgSlug: string,
    @Body() body: unknown,
  ) {
    const parsed = PublicBookingInputSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        issue: issue.code === "invalid_type" ? "required" : issue.code,
      }));
      validationError(details);
    }
    const result = await this.service.bookAppointment(
      getClientIp(req),
      orgSlug,
      parsed.data as PublicBookingInput,
    );
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Post("cancel/preview")
  async previewCancel(@Req() req: Request, @Body() body: unknown) {
    const token: string | undefined =
      typeof body === "object" && body !== null && "token" in body
        ? (body as { token: string }).token
        : undefined;
    if (!token) {
      validationError([{ field: "token", issue: "required" }]);
    }
    return this.service.previewCancel(getClientIp(req), token);
  }

  @HttpCode(HttpStatus.OK)
  @Post("cancel")
  async cancelByToken(@Req() req: Request, @Body() body: unknown) {
    const token: string | undefined =
      typeof body === "object" && body !== null && "token" in body
        ? (body as { token: string }).token
        : undefined;
    if (!token) {
      validationError([{ field: "token", issue: "required" }]);
    }
    return this.service.cancelByToken(getClientIp(req), token);
  }
}
