"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/http-client";
import type {
  LoginInput,
  RegisterInput,
  SwitchOrgInput,
  MeResponse,
} from "@/lib/auth-schemas";
import { useRefreshSession } from "@/hooks/use-auth-bootstrap";

// ---------------------------------------------------------------------------
// ADR-020 / PR-BUGFIX-1 (defeito B1):
//
// Shapes de resposta de login e register são tipos inline mínimos — nunca
// redeclarados em auth-schemas.ts. Login e register NÃO leem user/activeOrg/
// memberships do body para sintetizar sessão. A promoção para authenticated
// ou idle ocorre EXCLUSIVAMENTE dentro de refreshSession(), via GET /auth/me.
// ---------------------------------------------------------------------------

/** Shape inline mínimo da resposta de POST /auth/login. */
type LoginBody = {
  accessToken: string;
};

/** Shape inline mínimo da resposta de POST /auth/register. */
type RegisterBody = {
  accessToken: string;
  organization: { id: string };
};

export function useLoginMutation() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  // refreshSession é a única forma de promover o estado de sessão.
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      return apiFetch<LoginBody>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: async (data) => {
      // Guard: sem token, nada é promovido.
      if (!data.accessToken) return;

      // Persiste o token em memória (ADR-004/012 — nunca localStorage).
      setAccessToken(data.accessToken);

      // Delega toda a lógica de promoção para refreshSession.
      // A ramificação authenticated/idle é decidida por GET /auth/me
      // (ADR-020), não pelo body de login.
      await refreshSession(data.accessToken);
    },
  });
}

export function useRegisterMutation() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setSavedOrgId = useAuthStore((s) => s.setSavedOrgId);
  // refreshSession é a única forma de promover o estado de sessão.
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      return apiFetch<RegisterBody>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: async (data) => {
      // Guard: sem token, nada é promovido.
      if (!data.accessToken) return;

      // Persiste o token em memória.
      setAccessToken(data.accessToken);

      // Register cria uma org — salva o hint para que refreshSession
      // possa tentar switch-org automaticamente via savedOrgId.
      // A promoção de sessão ainda ocorre via GET /auth/me.
      setSavedOrgId(data.organization.id);

      await refreshSession(data.accessToken);
    },
  });
}

export function useLogoutMutation() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        throw new Error("No access token available for logout");
      }
      await apiFetch("/api/v1/auth/logout", {
        method: "POST",
      });
    },
    onSettled: () => {
      clearAuth();
      queryClient.clear();
    },
  });
}

export function useMeQuery() {
  const token = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<MeResponse>("/api/v1/auth/me"),
    enabled: !!token,
  });
}

export function useSwitchOrgMutation() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setSavedOrgId = useAuthStore((s) => s.setSavedOrgId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SwitchOrgInput) => {
      return apiFetch<{ accessToken: string }>("/api/v1/auth/switch-org", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: (data, variables) => {
      if (data.accessToken) {
        setAccessToken(data.accessToken);
      }
      setSavedOrgId(variables.organizationId);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
