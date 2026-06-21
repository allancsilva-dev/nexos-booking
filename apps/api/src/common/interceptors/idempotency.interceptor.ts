import {
  Injectable,
  Inject,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  HttpException,
  HttpStatus,
  RequestMethod,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { eq, and, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { from, of } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import type { Request, Response } from "express";

import { IDEMPOTENT_KEY } from "../decorators/idempotent.decorator";
import { DbService } from "../../db/db.service";
import { withTenantContext } from "../../db/tenant-context";
import { idempotencyKeys } from "../../../db/schema";
import { DomainException } from "../exceptions/domain.exception";
import { buildErrorEnvelope } from "../errors/build-error-envelope";
import type { TenantContext } from "../../auth/guards/tenant.guard";
import { isErrorCode, type ErrorCode } from "@nexos/shared";

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function hashPayload(body: unknown): string {
  return createHash("sha256").update(canonicalize(body ?? "")).digest("hex");
}

function resolveRoute(context: ExecutionContext): string {
  const controllerPath: string = Reflect.getMetadata("path", context.getClass()) ?? "";
  const handlerPath: string = Reflect.getMetadata("path", context.getHandler()) ?? "";
  const method: number | undefined = Reflect.getMetadata("method", context.getHandler());
  const httpMethod = method !== undefined ? (RequestMethod[method] ?? "UNKNOWN") : "UNKNOWN";

  const joined = `/${controllerPath}/${handlerPath}`
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";

  return `${httpMethod} ${joined}`;
}

function resolveTenantContext(req: Request): { orgId: string; userId: string | null } | null {
  const authTenant = (req as unknown as { tenant?: TenantContext }).tenant;
  if (authTenant?.orgId) {
    return { orgId: authTenant.orgId, userId: authTenant.userId };
  }
  const publicTenant = (req as unknown as { publicTenant?: { organizationId: string } }).publicTenant;
  if (publicTenant?.organizationId) {
    return { orgId: publicTenant.organizationId, userId: null };
  }
  return null;
}

function extractErrorCode(err: unknown): ErrorCode {
  if (err instanceof DomainException) return err.errorCode;
  if (err instanceof HttpException) {
    const body = err.getResponse();
    if (typeof body === "object" && body !== null) {
      const record = body as Record<string, unknown>;
      if (isErrorCode(record.code)) return record.code;

      const nestedError = record.error;
      if (typeof nestedError === "object" && nestedError !== null) {
        const nestedCode = (nestedError as Record<string, unknown>).code;
        if (isErrorCode(nestedCode)) return nestedCode;
      }
    }

    const status = err.getStatus();
    if (status === 400) return "BAD_REQUEST";
    if (status === 404) return "NOT_FOUND";
    if (status === 429) return "RATE_LIMITED";
    if (status === 401) return "UNAUTHENTICATED";
    if (status === 403) return "AUTHZ_DENIED";
    if (status === 422) return "VALIDATION_ERROR";
  }
  return "INTERNAL_ERROR";
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DbService) private readonly db: DbService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<ReturnType<CallHandler["handle"]>> {
    const isIdempotent = this.reflector.get<boolean>(IDEMPOTENT_KEY, context.getHandler());
    if (!isIdempotent) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers["idempotency-key"] as string | undefined;

    if (!key || !key.trim()) {
      throw new DomainException(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (key.length > 256) {
      throw new DomainException(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key exceeds 256 characters",
        HttpStatus.BAD_REQUEST,
      );
    }

    const route = resolveRoute(context);
    const tenantCtx = resolveTenantContext(req);
    if (!tenantCtx) {
      throw new DomainException(
        "BAD_REQUEST",
        "Tenant context required for idempotent operations",
        HttpStatus.BAD_REQUEST,
      );
    }
    const { orgId } = tenantCtx;
    const userId = tenantCtx.userId as string; // withTenantContext handles null internally
    const requestHash = hashPayload(req.body);

    const existing = await withTenantContext(this.db, orgId, userId, async (tx) => {
      return tx
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.organization_id, orgId),
            eq(idempotencyKeys.key, key),
            eq(idempotencyKeys.route, route),
          ),
        )
        .limit(1);
    });

    const row = existing[0];

    if (!row) {
      await withTenantContext(this.db, orgId, userId, async (tx) => {
        await tx.insert(idempotencyKeys).values({
          organization_id: orgId,
          key,
          route,
          request_hash: requestHash,
          state: "IN_PROGRESS",
          expires_at: new Date(Date.now() + 86400000),
        });
      });

      return this.executeAndUpdate(context, next, orgId, userId, key, route);
    }

    if (row.request_hash !== requestHash) {
      throw new DomainException(
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency key reused with different payload",
        HttpStatus.CONFLICT,
      );
    }

    if (row.state === "COMPLETED" || row.state === "FAILED") {
      const res = context.switchToHttp().getResponse<Response>();
      res.status(row.response_status_code ?? 200);
      return of(row.response);
    }

    if (row.state === "IN_PROGRESS") {
      const elapsed = Date.now() - new Date(row.created_at).getTime();
      if (elapsed < 60000) {
        throw new DomainException(
          "IDEMPOTENCY_IN_PROGRESS",
          "Request in progress",
          HttpStatus.CONFLICT,
          2,
        );
      }

      const casResult = await withTenantContext(this.db, orgId, userId, async (tx) => {
        return tx.execute(
          sql`UPDATE idempotency_keys SET created_at = now(), request_hash = ${requestHash} WHERE id = ${row.id} AND state = 'IN_PROGRESS' AND created_at < now() - interval '60 seconds'`,
        );
      });

      if ((casResult as unknown as { rowCount: number }).rowCount !== 1) {
        throw new DomainException(
          "IDEMPOTENCY_IN_PROGRESS",
          "Request in progress",
          HttpStatus.CONFLICT,
          2,
        );
      }

      return this.executeAndUpdate(context, next, orgId, userId, key, route);
    }

    throw new DomainException(
      "IDEMPOTENCY_IN_PROGRESS",
      "Unexpected idempotency state",
      HttpStatus.CONFLICT,
    );
  }

  private executeAndUpdate(
    context: ExecutionContext,
    next: CallHandler,
    orgId: string,
    userId: string,
    key: string,
    route: string,
  ) {
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap(async (response: unknown) => {
        const statusCode = context.switchToHttp().getResponse<Response>().statusCode;
        await withTenantContext(this.db, orgId, userId, async (tx) => {
          await tx
            .update(idempotencyKeys)
            .set({
              state: "COMPLETED",
              response: response,
              response_status_code: statusCode,
            })
            .where(
              and(
                eq(idempotencyKeys.organization_id, orgId),
                eq(idempotencyKeys.key, key),
                eq(idempotencyKeys.route, route),
              ),
            );
        });
      }),
      catchError((err: unknown) => {
        return from(
          (async () => {
            const statusCode =
              err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
            const errorCode = extractErrorCode(err);
            const message =
              err instanceof Error ? err.message : "Internal server error";
            const requestId = (req.headers["x-request-id"] as string) ?? "";

            const envelope = buildErrorEnvelope({
              code: errorCode,
              message,
              requestId,
            });

            try {
              await withTenantContext(this.db, orgId, userId, async (tx) => {
                await tx
                  .update(idempotencyKeys)
                  .set({
                    state: "FAILED",
                    response: envelope,
                    response_status_code: statusCode,
                  })
                  .where(
                    and(
                      eq(idempotencyKeys.organization_id, orgId),
                      eq(idempotencyKeys.key, key),
                      eq(idempotencyKeys.route, route),
                    ),
                  );
              });
            } catch (persistError) {
              console.error("[idempotency] failed to persist FAILED state", {
                requestId,
                route,
                error:
                  persistError instanceof Error
                    ? persistError.message
                    : "unknown",
              });
            }

            throw err;
          })(),
        );
      }),
    );
  }
}
