import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { JwtService } from "../jwt/jwt.service";

export interface AuthenticatedRequest extends Request {
  accessPayload: {
    sub: string;
    sid: string;
    org?: string;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header");
    }

    const token = header.slice(7);

    try {
      const payload = await this.jwt.verifyAccess(token);
      req.accessPayload = {
        sub: payload.sub,
        sid: payload.sid,
        org: payload.org,
      };
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }

    return true;
  }
}
