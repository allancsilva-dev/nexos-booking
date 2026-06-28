"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type { ServiceDTO } from "@nexos/shared";
import type { CreateServiceInput, UpdateServiceInput } from "@/lib/service-schemas";

// ---------------------------------------------------------------------------
// GET /services
//
// O backend retorna ServiceDTO[] (array plano). PROP-E4 (envelope de lista
// { items, nextCursor }) está deferida. Se o shape mudar no futuro, o ajuste
// fica isolado neste hook — a página não conhece o envelope.
// ---------------------------------------------------------------------------

export function useServicesQuery(activeOrgId: string | null | undefined) {
  return useQuery({
    queryKey: ["services", activeOrgId ?? ""],
    queryFn: () => apiFetch<ServiceDTO[]>("/api/v1/services"),
    enabled: !!activeOrgId,
  });
}

// ---------------------------------------------------------------------------
// POST /services
// ---------------------------------------------------------------------------

export function useCreateServiceMutation(activeOrgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateServiceInput) => {
      // Constrói payload conforme API_CONTRACTS §20.2.
      // currency é opcional — omitido se vazio, o DB usa default "BRL".
      const payload: Record<string, unknown> = {
        name: input.name,
        durationMin: input.durationMin,
        priceCents: input.priceCents,
        bufferAfterMin: input.bufferAfterMin ?? 0,
      };
      if (input.currency && input.currency.length === 3) {
        payload.currency = input.currency;
      }
      return apiFetch<ServiceDTO>("/api/v1/services", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", activeOrgId] });
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH /services/:id
// ---------------------------------------------------------------------------

export function useUpdateServiceMutation(activeOrgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UpdateServiceInput;
    }) => {
      // Partial update — envia apenas campos definidos.
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.durationMin !== undefined) payload.durationMin = input.durationMin;
      if (input.priceCents !== undefined) payload.priceCents = input.priceCents;
      if (input.bufferAfterMin !== undefined) {
        payload.bufferAfterMin = input.bufferAfterMin;
      }
      if (input.currency !== undefined && input.currency.length === 3) {
        payload.currency = input.currency;
      }
      if (input.active !== undefined) payload.active = input.active;

      return apiFetch<ServiceDTO>(`/api/v1/services/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", activeOrgId] });
    },
  });
}
