"use client";

import { useAuthStore } from "@/stores/auth-store";

export type RefreshResult = {
  token: string | null;
  status: number;
  code: string | null;
};

let refreshPromise: Promise<RefreshResult> | null = null;

async function readCode(response: Response): Promise<string | null> {
  try {
    const body = await response.clone().json() as { error?: { code?: string } };
    return body.error?.code ?? null;
  } catch {
    return null;
  }
}

export function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Request-Id": crypto.randomUUID(),
          "X-CSRF": "1",
        },
      });
      if (!response.ok) {
        useAuthStore.getState().clearAuth();
        return { token: null, status: response.status, code: await readCode(response) };
      }

      const body = await response.json() as { accessToken?: string };
      const token = body.accessToken ?? null;
      if (token) useAuthStore.getState().setAccessToken(token);
      else useAuthStore.getState().clearAuth();
      return { token, status: response.status, code: null };
    } catch {
      return { token: null, status: 0, code: null };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
