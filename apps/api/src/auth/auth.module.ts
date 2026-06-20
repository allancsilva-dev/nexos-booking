import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { PasswordService } from "./password/password.service";
import { JwtService } from "./jwt/jwt.service";
import { SessionService } from "./sessions/session.service";
import { ResendSender } from "./notifications/resend-sender";
import { ScrubbedLogger } from "../common/logger/scrubbed-logger.service";
import { AuthGuard } from "./guards/auth.guard";
import { CsrfGuard } from "./guards/csrf.guard";
import { TenantGuard } from "./guards/tenant.guard";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    PasswordService,
    JwtService,
    SessionService,
    ResendSender,
    ScrubbedLogger,
    AuthGuard,
    CsrfGuard,
    TenantGuard,
  ],
  exports: [
    AuthGuard,
    CsrfGuard,
    TenantGuard,
    JwtService,
    AuthService,
  ],
})
export class AuthModule {}
