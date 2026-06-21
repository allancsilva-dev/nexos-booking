import {
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import type { Response, Request } from "express";
import { isErrorCode, type ErrorCode } from "@nexos/shared";

import { buildErrorEnvelope } from "../errors/build-error-envelope";
import { RateLimitException } from "../exceptions/rate-limit.exception";
import { ValidationException } from "../exceptions/validation.exception";
import { DomainException } from "../exceptions/domain.exception";

function codeFromHttpException(exception: HttpException): ErrorCode {
  const body = exception.getResponse();
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    if (isErrorCode(record.code)) return record.code;

    const nestedError = record.error;
    if (typeof nestedError === "object" && nestedError !== null) {
      const nestedCode = (nestedError as Record<string, unknown>).code;
      if (isErrorCode(nestedCode)) return nestedCode;
    }
  }

  const status = exception.getStatus();
  if (status === 400) return "BAD_REQUEST";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "AUTHZ_DENIED";
  if (status === 422) return "VALIDATION_ERROR";
  return "INTERNAL_ERROR";
}

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

    if (exception instanceof DomainException) {
      if (exception.retryAfterSeconds !== undefined) {
        response.setHeader("Retry-After", String(exception.retryAfterSeconds));
      }
      response.status(exception.getStatus()).json(
        buildErrorEnvelope({
          code: exception.errorCode as ErrorCode,
          message: exception.message,
          requestId,
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

      const code = codeFromHttpException(exception);

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
