import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const csrf = req.headers["x-csrf"];

    if (csrf !== "1") {
      throw new ForbiddenException("Missing or invalid X-CSRF header");
    }

    return true;
  }
}
