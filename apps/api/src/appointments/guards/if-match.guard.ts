import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { REQUIRE_IF_MATCH_KEY } from "../decorators/require-if-match.decorator";

@Injectable()
export class IfMatchGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresIfMatch = this.reflector.get<boolean>(
      REQUIRE_IF_MATCH_KEY,
      context.getHandler(),
    );

    if (!requiresIfMatch) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ifMatch = req.headers["if-match"] as string | undefined;

    if (!ifMatch) {
      throw new HttpException(
        {
          error: {
            code: "BAD_REQUEST" as const,
            message: "If-Match header required",
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const version = parseInt(ifMatch, 10);
    if (isNaN(version)) {
      throw new HttpException(
        {
          error: {
            code: "BAD_REQUEST" as const,
            message: "If-Match header must be an integer",
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (req.method === "PATCH") {
      const body = req.body as Record<string, unknown> | undefined;
      const hasStartsAt = body && typeof body.startsAt === "string" && body.startsAt.length > 0;
      const hasNote = body && typeof body.note === "string" && body.note.length > 0;
      if (!hasStartsAt && !hasNote) {
        throw new HttpException(
          {
            error: {
              code: "VALIDATION_ERROR" as const,
              message: "At least one of startsAt or note is required",
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    (req as unknown as { ifMatchVersion: number }).ifMatchVersion = version;
    return true;
  }
}
