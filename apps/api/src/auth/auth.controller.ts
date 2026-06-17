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
import type { Request, Response } from "express";

import { AuthService } from "./auth.service";
import { AuthGuard } from "./guards/auth.guard";
import { CsrfGuard } from "./guards/csrf.guard";
import type { RegisterInput } from "./dto/register.dto";
import type { LoginInput } from "./dto/login.dto";
import type { SwitchOrgInput } from "./dto/switch-org.dto";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";
const REFRESH_TTL_MS = 30 * 86400_000;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
  });
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

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  async register(
    @Body() body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = getClientIp(req);
    const result = await this.auth.register(body, ip);

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
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = getClientIp(req);
    const result = await this.auth.login(body, ip);

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
    @Body() body: SwitchOrgInput,
    @Req() req: Request,
  ) {
    const payload = (req as unknown as { accessPayload: { sub: string; sid: string; org?: string } }).accessPayload;
    return this.auth.switchOrg(payload.sub, payload.sid, body);
  }
}
