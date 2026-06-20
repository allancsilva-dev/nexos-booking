import { HttpException, HttpStatus } from "@nestjs/common";

export class DomainException extends HttpException {
  public readonly errorCode: string;

  constructor(errorCode: string, message: string, status: HttpStatus) {
    super(message, status);
    this.errorCode = errorCode;
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
