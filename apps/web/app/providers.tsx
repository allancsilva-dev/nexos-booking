"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { AuthBootstrapContext, type BootstrapResult } from "@/hooks/use-auth-bootstrap";
import type { MeResponse } from "@/lib/auth-schemas";

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
};

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as ErrorEnvelope;
    return body.error?.code ?? null;
  } catch {
    return null;
  }
}

function isSessionExpiredCode(code: string | null): boolean {
  return code === "TOKEN_EXPIRED" || code === "REFRESH_REUSED";
}

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const [result, setResult] = useState<BootstrapResult>({ status: "loading" });
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setSavedOrgId = useAuthStore((s) => s.setSavedOrgId);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: {
            "X-Request-Id": crypto.randomUUID(),
            "X-CSRF": "1",
          },
        });

        if (!refreshRes.ok) {
          const code = await readErrorCode(refreshRes);
          if (!cancelled) {
            clearAuth();
            if (refreshRes.status === 401 && !isSessionExpiredCode(code)) {
              setResult({ status: "idle" });
            } else if (isSessionExpiredCode(code)) {
              setResult({ status: "error", error: "Session expired" });
            } else if (refreshRes.status >= 500) {
              setResult({ status: "error", error: "API unavailable" });
            } else {
              setResult({ status: "error", error: "Failed to refresh session" });
            }
          }
          return;
        }

        const refreshData = await refreshRes.json();
        const token = refreshData.accessToken;

        if (!token) {
          if (!cancelled) {
            clearAuth();
            setResult({ status: "error", error: "No access token" });
          }
          return;
        }

        setAccessToken(token);

        const meRes = await fetch("/api/v1/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Request-Id": crypto.randomUUID(),
          },
        });

        if (!meRes.ok) {
          clearAuth();
          if (!cancelled)
            setResult({ status: "error", error: "Failed to fetch user" });
          return;
        }

        const meData: MeResponse = await meRes.json();
        const savedOrgId = useAuthStore.getState().savedOrgId;

        if (!meData.activeOrg && savedOrgId) {
          try {
            const switchRes = await fetch("/api/v1/auth/switch-org", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-Request-Id": crypto.randomUUID(),
              },
              body: JSON.stringify({ organizationId: savedOrgId }),
            });

            if (switchRes.ok) {
              const switchData = await switchRes.json();
              if (switchData.accessToken) {
                setAccessToken(switchData.accessToken);
              }
              if (!cancelled) {
                setResult({
                  status: "authenticated",
                  user: meData.user,
                  memberships: meData.memberships,
                });
              }
              return;
            }
          } catch {
            // switch-org failed, clear saved org and show idle
          }
          setSavedOrgId(null);
          if (!cancelled) {
            setResult({
              status: "idle",
              user: meData.user,
              memberships: meData.memberships,
            });
          }
          return;
        }

        if (!meData.activeOrg && !savedOrgId) {
          if (!cancelled) {
            setResult({
              status: "idle",
              user: meData.user,
              memberships: meData.memberships,
            });
          }
          return;
        }

        if (!cancelled) {
          setResult({
            status: "authenticated",
            user: meData.user,
            memberships: meData.memberships,
          });
        }
      } catch {
        if (!cancelled) {
          clearAuth();
          setResult({ status: "error", error: "API unavailable" });
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [setAccessToken, setSavedOrgId, clearAuth]);

  return (
    <AuthBootstrapContext.Provider value={result}>
      {children}
    </AuthBootstrapContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
      >
        <AuthBootstrap>
          {children}
          <Toaster theme="dark" />
        </AuthBootstrap>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
