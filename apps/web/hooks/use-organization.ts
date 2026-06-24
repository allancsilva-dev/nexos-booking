"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type { OrganizationDTO } from "@nexos/shared";
import type { UpdateOrgInput } from "@/lib/org-schemas";

// ---------------------------------------------------------------------------
// GET /organizations/:id
// ---------------------------------------------------------------------------

export function useOrganizationQuery(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["organization", orgId ?? ""],
    queryFn: () => apiFetch<OrganizationDTO>(`/api/v1/organizations/${orgId}`),
    enabled: !!orgId,
  });
}

// ---------------------------------------------------------------------------
// PATCH /organizations/:id
// ---------------------------------------------------------------------------

export function useUpdateOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateOrgInput) => {
      // Envia apenas name, timezone, slotIntervalMin (API_CONTRACTS §9).
      // slug e currency NUNCA vão no payload.
      return apiFetch<OrganizationDTO>(`/api/v1/organizations/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: input.name,
          timezone: input.timezone,
          slotIntervalMin: input.slotIntervalMin,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
    },
  });
}
