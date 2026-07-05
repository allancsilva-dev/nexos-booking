"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type { ClientDetailDTO, ClientListItemDTO } from "@nexos/shared";

type ClientListResponse = {
  items: ClientListItemDTO[];
  nextCursor: string | null;
};

export function useClientsQuery(
  activeOrgId: string | null | undefined,
  search?: string,
) {
  const normalizedSearch = search?.trim() ?? "";

  return useQuery({
    queryKey: ["clients", activeOrgId ?? "", normalizedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (normalizedSearch) {
        params.set("search", normalizedSearch);
      }

      return apiFetch<ClientListResponse>(`/api/v1/clients?${params}`);
    },
    enabled: !!activeOrgId,
  });
}

export function useClientDetailQuery(
  activeOrgId: string | null | undefined,
  clientId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["client-detail", activeOrgId ?? "", clientId ?? ""],
    queryFn: () => apiFetch<ClientDetailDTO>(`/api/v1/clients/${clientId}`),
    enabled: !!activeOrgId && !!clientId,
  });
}
