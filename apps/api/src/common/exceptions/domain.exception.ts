import { HttpException, HttpStatus } from "@nestjs/common";
import type { ErrorCode } from "@nexos/shared";

export class DomainException extends HttpException {
  public readonly errorCode: ErrorCode;
  public readonly retryAfterSeconds?: number;

  constructor(errorCode: ErrorCode, message: string, status: HttpStatus, retryAfterSeconds?: number) {
    super(message, status);
    this.errorCode = errorCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class EmailTakenException extends DomainException {
  constructor() {
    super("EMAIL_TAKEN", "Email already registered", HttpStatus.CONFLICT);
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor(message = "Invalid credentials") {
    super("INVALID_CREDENTIALS", message, HttpStatus.UNAUTHORIZED);
  }
}

export class RefreshReusedException extends DomainException {
  constructor() {
    super("REFRESH_REUSED", "Refresh token reused", HttpStatus.UNAUTHORIZED);
  }
}

export class TokenExpiredException extends DomainException {
  constructor(message = "Session expired") {
    super("TOKEN_EXPIRED", message, HttpStatus.UNAUTHORIZED);
  }
}

export class NoActiveOrgException extends DomainException {
  constructor() {
    super("NO_ACTIVE_ORG", "No active organization", HttpStatus.FORBIDDEN);
  }
}

export class AuthzDeniedException extends DomainException {
  constructor() {
    super("AUTHZ_DENIED", "Authorization denied", HttpStatus.FORBIDDEN);
  }
}

export class LastOwnerException extends DomainException {
  constructor() {
    super(
      "LAST_OWNER",
      "Cannot remove the last owner",
      HttpStatus.CONFLICT,
    );
  }
}

export class AlreadyMemberException extends DomainException {
  constructor() {
    super(
      "ALREADY_MEMBER",
      "User is already a member",
      HttpStatus.CONFLICT,
    );
  }
}

export class SlugTakenException extends DomainException {
  constructor() {
    super("SLUG_TAKEN", "Slug is already taken", HttpStatus.CONFLICT);
  }
}

export class InviteTokenInvalidException extends DomainException {
  constructor() {
    super("INVITE_TOKEN_INVALID", "Invitation token is invalid", HttpStatus.GONE);
  }
}

export class InviteTokenExpiredException extends DomainException {
  constructor() {
    super(
      "INVITE_TOKEN_EXPIRED",
      "Invitation token has expired",
      HttpStatus.GONE,
    );
  }
}

export class EmailNotVerifiedException extends DomainException {
  constructor() {
    super(
      "EMAIL_NOT_VERIFIED",
      "Email must be verified to invite members",
      HttpStatus.FORBIDDEN,
    );
  }
}

export class SlugReservedException extends DomainException {
  constructor() {
    super("SLUG_RESERVED", "Slug is reserved", HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class ProfessionalUserTakenException extends DomainException {
  constructor() {
    super(
      "PROFESSIONAL_USER_TAKEN",
      "User is already linked to another professional",
      HttpStatus.CONFLICT,
    );
  }
}

export class AppointmentConflictException extends DomainException {
  constructor() {
    super(
      "APPOINTMENT_CONFLICT",
      "Slot already occupied",
      HttpStatus.CONFLICT,
    );
  }
}

export class AppointmentVersionConflictException extends DomainException {
  constructor() {
    super(
      "APPOINTMENT_VERSION_CONFLICT",
      "Appointment was modified by another request",
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidStatusTransitionException extends DomainException {
  constructor() {
    super(
      "INVALID_STATUS_TRANSITION",
      "Invalid status transition",
      HttpStatus.CONFLICT,
    );
  }
}

export class OutsideWorkingHoursException extends DomainException {
  constructor() {
    super(
      "OUTSIDE_WORKING_HOURS",
      "Appointment is outside working hours",
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class WithinBlockException extends DomainException {
  constructor() {
    super(
      "WITHIN_BLOCK",
      "Appointment falls within an availability block",
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class CancelTokenInvalidException extends DomainException {
  constructor() {
    super(
      "CANCEL_TOKEN_INVALID",
      "Cancel token is invalid",
      HttpStatus.GONE,
    );
  }
}

export class CancelTokenExpiredException extends DomainException {
  constructor() {
    super(
      "CANCEL_TOKEN_EXPIRED",
      "Cancel token has expired",
      HttpStatus.GONE,
    );
  }
}

export class CancelTokenGoneException extends DomainException {
  constructor() {
    super(
      "CANCEL_TOKEN_INVALID",
      "Cancel token is no longer valid",
      HttpStatus.GONE,
    );
  }
}
