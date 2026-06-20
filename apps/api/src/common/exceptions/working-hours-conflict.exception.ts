import { HttpStatus } from "@nestjs/common";
import { DomainException } from "./domain.exception";

export class WorkingHoursConflictException extends DomainException {
  constructor() {
    super(
      "WORKING_HOURS_CONFLICT",
      "Working hours overlap detected",
      HttpStatus.CONFLICT,
    );
  }
}
