import { HttpException, HttpStatus } from "@nestjs/common";
import type { ErrorDetail } from "@nexos/shared";

export class ValidationException extends HttpException {
  readonly details: ErrorDetail[];

  constructor(message: string, details: ErrorDetail[]) {
    super(
      { code: "VALIDATION_ERROR" as const, message, details },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.details = details;
  }
}
