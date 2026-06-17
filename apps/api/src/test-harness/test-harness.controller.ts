import { Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";

import { ValidationException } from "../common/exceptions/validation.exception";
import { AuthGuard } from "../auth/guards/auth.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";

@Controller("__test")
export class TestHarnessController {
  @Get("throw")
  throwError(): never {
    throw new Error("Test unhandled error for exception filter validation");
  }

  @Post("semantic-validation")
  semanticValidation(): never {
    throw new ValidationException("One or more fields are invalid.", [
      { field: "startsAt", issue: "outside_working_hours" },
      { field: "serviceId", issue: "not_found" },
    ]);
  }

  @Post("echo")
  echo(@Req() req: Request, @Res() res: Response): void {
    res.status(200).json({
      headers: req.headers,
      method: req.method,
      url: req.url,
      body: req.body ?? null,
    });
  }

  @Get("tenant-required")
  @UseGuards(AuthGuard, TenantGuard)
  tenantRequired(): { ok: boolean } {
    return { ok: true };
  }
}
