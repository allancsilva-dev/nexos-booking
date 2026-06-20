"use client";

import type { ErrorBody, ErrorCode } from "@nexos/shared";
import { useAuthStore } from "@/stores/auth-store";
import { INTERNAL_ERROR } from "@/lib/error-codes";

export class ApiError extends Error {
  code: ErrorCode;
  requestId: string;
  status: number;
  details?: Array<{ field: string; issue: string }>;

  constructor(body: ErrorBody, status: number) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.requestId = body.requestId;
    this.status = status;
    this.details = body.details;
  }
}

interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  version?: number;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Request-Id": crypto.randomUUID(),
          "X-CSRF": "1",
        },
      });

      if (!res.ok) {
        useAuthStore.getState().clearAuth();
        return null;
      }

      const data = await res.json();
      const token = data.accessToken ?? null;

      if (token) {
        useAuthStore.getState().setAccessToken(token);
      }

      return token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function getHeaders(
  initHeaders?: Record<string, string>,
  version?: number
): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": crypto.randomUUID(),
    ...initHeaders,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (version !== undefined) {
    headers["If-Match"] = String(version);
  }

  return headers;
}

function isPostPutPatchDelete(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const envelope = await res.json();
    const errorBody: ErrorBody = envelope?.error ?? {
      code: INTERNAL_ERROR,
      message: "An unexpected error occurred",
      requestId: "",
      timestamp: new Date().toISOString() as never,
    };
    return new ApiError(errorBody, res.status);
  } catch {
    return new ApiError(
      {
        code: INTERNAL_ERROR,
        message: "An unexpected error occurred",
        requestId: "",
        timestamp: new Date().toISOString() as never,
      },
      res.status
    );
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { headers: initHeaders, version, ...rest } = options;
  const method = rest.method ?? "GET";

  const finalHeaders: Record<string, string> = { ...initHeaders };

  if (isPostPutPatchDelete(method) && !finalHeaders["Idempotency-Key"]) {
    finalHeaders["Idempotency-Key"] = crypto.randomUUID();
  }

  const makeRequest = async (): Promise<Response> => {
    const headers = getHeaders(finalHeaders, version);
    return fetch(path, {
      ...rest,
      method,
      headers,
    });
  };

  let res = await makeRequest();

  if (res.status === 401) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      res = await makeRequest();
    }
  }

  if (!res.ok) {
    throw await parseErrorResponse(res);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
