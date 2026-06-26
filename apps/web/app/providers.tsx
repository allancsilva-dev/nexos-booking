"use client";

import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import {
  useAuthStore,
} from "@/stores/auth-store";
import {
  AuthBootstrapContext,
  type BootstrapResult,
} from "@/hooks/use-auth-bootstrap";
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

  // -----------------------------------------------------------------------
  // ADR-020 / PR-BUGFIX-1 (defeito B1):
  //
  // `refreshSession(token)` é a origem única de promoção para
  // `authenticated` ou `idle`. Chama GET /auth/me e, opcionalmente,
  // POST /auth/switch-org (quando savedOrgId existe mas activeOrg é null).
  //
  // `setResult` permanece INTERNO — nunca é exposto no contexto.
  // Mutations (login/register) recebem apenas `refreshSession`, sem
  // capacidade de sintetizar estado diretamente.
  // -----------------------------------------------------------------------
  const refreshSession = useCallback(
    async (token: string) => {
      async function handleMeFailure(response: Response) {
        // Falha em /auth/me: NÃO promover authenticated.
        // Segue padrão de erro já estabelecido no bootstrap original.
        clearAuth();
        const code = await readErrorCode(response);
        if (response.status === 401 && !isSessionExpiredCode(code)) {
          // Sessão inexistente mas não expirada por token inválido:
          // retorna ao estado neutro (login) sem mensagem de erro.
          setResult({ status: "idle" });
        } else if (isSessionExpiredCode(code)) {
          setResult({ status: "error", error: "Session expired" });
        } else if (response.status >= 500) {
          setResult({ status: "error", error: "API unavailable" });
        } else {
          setResult({ status: "error", error: "Failed to fetch user" });
        }
      }

      try {
        const meRes = await fetch("/api/v1/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Request-Id": crypto.randomUUID(),
          },
        });

        if (!meRes.ok) {
          await handleMeFailure(meRes);
          return;
        }

        const meData: MeResponse = await meRes.json();
        const savedOrgId = useAuthStore.getState().savedOrgId;

        // Caso: activeOrg ausente mas há um savedOrgId — tenta switch-org
        // para recompor a sessão sem exigir nova escolha do usuário.
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
              const switchData = (await switchRes.json()) as {
                accessToken?: string;
              };
              const switchedToken = switchData.accessToken ?? token;
              if (switchData.accessToken) {
                // switch-org emitiu novo token — atualiza memória.
                setAccessToken(switchData.accessToken);
              }

              const switchedMeRes = await fetch("/api/v1/auth/me", {
                headers: {
                  Authorization: `Bearer ${switchedToken}`,
                  "X-Request-Id": crypto.randomUUID(),
                },
              });

              if (!switchedMeRes.ok) {
                await handleMeFailure(switchedMeRes);
                return;
              }

              const switchedMeData: MeResponse = await switchedMeRes.json();

              if (!switchedMeData.activeOrg) {
                setSavedOrgId(null);
                setResult({
                  status: "idle",
                  user: switchedMeData.user,
                  memberships: switchedMeData.memberships,
                });
                return;
              }

              setResult({
                status: "authenticated",
                user: switchedMeData.user,
                memberships: switchedMeData.memberships,
              });
              return;
            }
          } catch {
            // switch-org falhou (rede/erro inesperado); limpa hint e cai
            // no bloco idle abaixo para o usuário escolher a org.
          }

          // switch-org não disponível ou recusado: limpa savedOrgId e
          // apresenta seleção de org.
          setSavedOrgId(null);
          setResult({
            status: "idle",
            user: meData.user,
            memberships: meData.memberships,
          });
          return;
        }

        // Caso: multi-org sem savedOrgId — exige escolha de org.
        if (!meData.activeOrg && !savedOrgId) {
          setResult({
            status: "idle",
            user: meData.user,
            memberships: meData.memberships,
          });
          return;
        }

        // Caso: activeOrg definida (single-org ou org já ativa) — sessão completa.
        setResult({
          status: "authenticated",
          user: meData.user,
          memberships: meData.memberships,
        });
      } catch {
        // Falha abrupta de rede/parse em /auth/me nunca pode vazar como
        // unhandled rejection nem promover authenticated.
        clearAuth();
        setResult({ status: "error", error: "API unavailable" });
      }
    },
    // setAccessToken e setSavedOrgId são estáveis (Zustand selectors);
    // clearAuth igualmente. useCallback evita recriar a função a cada render.
    [setAccessToken, setSavedOrgId, clearAuth]
  );

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

        // Token válido: persiste em memória e delega toda a lógica de
        // promoção para refreshSession — fonte única (ADR-020).
        setAccessToken(token);

        if (!cancelled) {
          await refreshSession(token);
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
  }, [setAccessToken, setSavedOrgId, clearAuth, refreshSession]);

  // Expõe `refreshSession` (não `setResult`) no contexto.
  // Mutations chamam refreshSession(token) e o estado é produzido
  // internamente via GET /auth/me — sem síntese externa.
  return (
    <AuthBootstrapContext.Provider value={{ result, refreshSession }}>
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
