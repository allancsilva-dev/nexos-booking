import {
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import type { Response, Request } from "express";

import { buildErrorEnvelope } from "../errors/build-error-envelope";
import { RateLimitException } from "../exceptions/rate-limit.exception";
import { ValidationException } from "../exceptions/validation.exception";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId =
      (request.headers["x-request-id"] as string) ?? "unknown";

    if (exception instanceof RateLimitException) {
      response.setHeader("Retry-After", String(exception.retryAfterSeconds));
      response
        .status(exception.getStatus())
        .json(
          buildErrorEnvelope({
            code: "RATE_LIMITED",
            message: "Too many requests. Please try again later.",
            requestId,
          }),
        );
      return;
    }

    if (exception instanceof ValidationException) {
      const body = exception.getResponse() as {
        code: string;
        message: string;
        details: { field: string; issue: string }[];
      };
      response
        .status(exception.getStatus())
        .json(
          buildErrorEnvelope({
            code: "VALIDATION_ERROR",
            message: body.message,
            requestId,
            details: body.details,
          }),
        );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : typeof body === "object" && body !== null && "message" in body
            ? typeof (body as Record<string, unknown>).message === "string"
              ? ((body as Record<string, unknown>).message as string)
              : "Request failed."
            : "Request failed.";

      const code =
        status === 400
          ? ("BAD_REQUEST" as const)
          : status === 404
            ? ("NOT_FOUND" as const)
            : status === 409
              ? ("APPOINTMENT_CONFLICT" as const)
              : status === 429
                ? ("RATE_LIMITED" as const)
                : status === 401
                  ? ("UNAUTHENTICATED" as const)
                  : status === 403
                    ? ("AUTHZ_DENIED" as const)
                    : ("INTERNAL_ERROR" as const);

      response.status(status).json(
        buildErrorEnvelope({
          code,
          message,
          requestId,
        }),
      );
      return;
    }

    console.error(`[unhandled] requestId=${requestId}`, exception);

    response.status(500).json(
      buildErrorEnvelope({
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId,
      }),
    );
  }
}
