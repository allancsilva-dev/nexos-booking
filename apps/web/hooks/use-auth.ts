"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/http-client";
import type { LoginInput, RegisterInput, SwitchOrgInput, MeResponse } from "@/lib/auth-schemas";

export function useLoginMutation() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      return apiFetch<{ accessToken: string; user: MeResponse["user"] }>(
        "/api/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      );
    },
    onSuccess: (data) => {
      if (data.accessToken) {
        setAccessToken(data.accessToken);
      }
    },
  });
}

export function useRegisterMutation() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);

  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      return apiFetch<{ accessToken: string; user: MeResponse["user"] }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      );
    },
    onSuccess: (data) => {
      if (data.accessToken) {
        setAccessToken(data.accessToken);
      }
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
