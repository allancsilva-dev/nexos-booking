import { Controller, Get, Param, Query, Req, HttpException, HttpStatus } from "@nestjs/common";
import type { Request } from "express";
import { PublicBookingService } from "./public-booking.service";

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
  constructor(private readonly service: PublicBookingService) {}

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
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("serviceId") serviceId: string,
  ) {
    if (!serviceId) {
      validationError([{ field: "serviceId", issue: "required" }]);
    }
    if (!from || !to) {
      const missing: { field: string; issue: string }[] = [];
      if (!from) missing.push({ field: "from", issue: "required" });
      if (!to) missing.push({ field: "to", issue: "required" });
      validationError(missing);
    }
    return this.service.getAvailability(
      getClientIp(req),
      orgSlug,
      professionalSlug,
      { from, to, serviceId },
    );
  }
}
