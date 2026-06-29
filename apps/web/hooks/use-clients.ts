"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type { ClientListItemDTO, ClientDetailDTO } from "@nexos/shared";

interface ClientsListResponse {
  items: ClientListItemDTO[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// GET /clients?search=
//
// Resposta paginada por cursor ({ items, nextCursor }). A página consome só
// `items`; a paginação por cursor fica encapsulada aqui (PROP futura).
// ---------------------------------------------------------------------------

export function useClientsQuery(
  activeOrgId: string | null | undefined,
  search: string,
) {
  const trimmed = search.trim();
  return useQuery({
    queryKey: ["clients", activeOrgId ?? "", trimmed],
    queryFn: () => {
      const qs = trimmed ? `?search=${encodeURIComponent(trimmed)}` : "";
      return apiFetch<ClientsListResponse>(`/api/v1/clients${qs}`);
    },
    enabled: !!activeOrgId,
  });
}

// ---------------------------------------------------------------------------
// GET /clients/:id
// ---------------------------------------------------------------------------

export function useClientDetailQuery(
  activeOrgId: string | null | undefined,
  clientId: string | null,
) {
  return useQuery({
    queryKey: ["client", activeOrgId ?? "", clientId ?? ""],
    queryFn: () => apiFetch<ClientDetailDTO>(`/api/v1/clients/${clientId}`),
    enabled: !!activeOrgId && !!clientId,
  });
}
