import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const MAX_REQUEST_ID_LENGTH = 128;
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeRequestId(input: string | undefined): string {
  if (!input || input.trim().length === 0) return crypto.randomUUID();
  if (input.length > MAX_REQUEST_ID_LENGTH) return crypto.randomUUID();
  if (/[\r\n]/.test(input)) return crypto.randomUUID();
  if (!UUID_V4_REGEX.test(input)) return crypto.randomUUID();
  return input.toLowerCase();
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = sanitizeRequestId(
    req.headers["x-request-id"] as string | undefined,
  );

  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);

  next();
}
