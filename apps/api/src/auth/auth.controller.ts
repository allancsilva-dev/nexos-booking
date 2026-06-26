import {
  Controller,
  Inject,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";

import { AuthService } from "./auth.service";
import { AuthGuard } from "./guards/auth.guard";
import { CsrfGuard } from "./guards/csrf.guard";
import type { VerifyEmailInput } from "./dto/verify-email.dto";
import type { ForgotPasswordInput } from "./dto/forgot-password.dto";
import type { ResetPasswordInput } from "./dto/reset-password.dto";
import type { PasswordChangeInput } from "./dto/password-change.dto";
import type { AcceptInviteInput } from "./dto/accept-invite.dto";
import {
  RegisterInputSchema,
  LoginInputSchema,
  SwitchOrgInputSchema,
} from "@nexos/shared";
import { ValidationException } from "../common/exceptions/validation.exception";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";
const REFRESH_TTL_MS = 30 * 86400_000;

function getRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...getRefreshCookieOptions(),
    maxAge: REFRESH_TTL_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions());
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function getClientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? "127.0.0.1");
}

function validationDetails(
  issues: { path: PropertyKey[]; message: string }[],
) {
  return issues.map((issue) => ({
    field: issue.path.map(String).join("."),
    issue: issue.message,
  }));
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = RegisterInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationException(
        "Invalid input",
        validationDetails(parsed.error.issues),
      );
    }

    const ip = getClientIp(req);
    const result = await this.auth.register(parsed.data, ip, {
      failAfterUser:
        process.env.ENABLE_HTTP_TEST_HARNESS === "1" &&
        req.headers["x-test-register-fail-after-user"] === "1",
    });

    setRefreshCookie(res, result.refreshToken);

    return {
      user: result.user,
      organization: result.organization,
      accessToken: result.accessToken,
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = LoginInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationException(
        "Invalid input",
        validationDetails(parsed.error.issues),
      );
    }

    const ip = getClientIp(req);
    const result = await this.auth.login(parsed.data, ip);

    setRefreshCookie(res, result.refreshToken);

    return {
      user: result.user,
      activeOrg: result.activeOrg,
      accessToken: result.accessToken,
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = parseCookies(req);
    const token = cookies[REFRESH_COOKIE];
    if (!token) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Missing refresh token",
          requestId: (req.headers["x-request-id"] as string) ?? "unknown",
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] as string | undefined;

    const result = await this.auth.refresh(token, ip, userAgent);

    setRefreshCookie(res, result.refreshToken);

    return {
      user: result.user,
      activeOrg: result.activeOrg,
      accessToken: result.accessToken,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = (req as unknown as { accessPayload: { sub: string; sid: string; org?: string } }).accessPayload;
    await this.auth.logout(payload.sid);
    clearRefreshCookie(res);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Req() req: Request) {
    const payload = (req as unknown as { accessPayload: { sub: string; sid: string; org?: string } }).accessPayload;
    return this.auth.me(payload.sub, payload.org);
  }

  @Post("switch-org")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async switchOrg(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = SwitchOrgInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationException(
        "Invalid input",
        validationDetails(parsed.error.issues),
      );
    }

    const payload = (req as unknown as { accessPayload: { sub: string; sid: string; org?: string } }).accessPayload;
    return this.auth.switchOrg(payload.sub, payload.sid, parsed.data);
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: VerifyEmailInput) {
    return this.auth.verifyEmail(body.token);
  }

  @Post("verify-email/resend")
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AuthGuard)
  async resendVerification(@Req() req: Request) {
    const payload = (req as unknown as { accessPayload: { sub: string; sid: string; org?: string } }).accessPayload;
    await this.auth.resendVerification(payload.sub);
  }

  @Post("password/forgot")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    const ip = getClientIp(req);
    await this.auth.forgotPassword(body.email, ip);
  }

  @Post("password/reset")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordInput) {
    return this.auth.resetPassword(body.token, body.newPassword);
  }

  @Post("password/change")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async changePassword(
    @Body() body: PasswordChangeInput,
    @Req() req: Request,
  ) {
    const payload = (req as unknown as { accessPayload: { sub: string; sid: string; org?: string } }).accessPayload;
    return this.auth.changePassword(
      payload.sub,
      payload.sid,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post("accept-invite")
  async acceptInvite(
    @Body() body: AcceptInviteInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = (req as unknown as { accessPayload?: { sub: string } })
      .accessPayload;
    const userId = payload?.sub;

    const result = await this.auth.acceptInvite(
      body.token,
      userId,
      body.name,
      body.password,
    );

    if (result.refreshToken) {
      setRefreshCookie(res, result.refreshToken);
      res.status(HttpStatus.CREATED);
      return {
        user: result.user,
        organization: result.organization,
        accessToken: result.accessToken,
      };
    }

    return {
      organization: result.organization,
    };
  }
}
