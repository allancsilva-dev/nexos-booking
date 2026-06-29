"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  ServiceDTO,
  ProfessionalDTO,
  ProfessionalServicesResponse,
} from "@nexos/shared";
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

// ---------------------------------------------------------------------------
// Profissionais por serviço (agregado)
//
// Não há endpoint inverso (serviço → profissionais). Agregamos a lista de
// vínculos de cada profissional (GET /professionals/:id/services) e contamos
// quantos realizam cada serviço. N+1 aceitável para o tamanho de equipe do MVP.
// Requer papel OWNER/MANAGER; para PROFESSIONAL as queries falham e o mapa
// fica vazio (a contagem simplesmente não aparece).
// ---------------------------------------------------------------------------

export function useServiceProfessionalCounts(
  activeOrgId: string | null | undefined,
  professionals: ProfessionalDTO[] | undefined,
) {
  const list = professionals ?? [];

  const results = useQueries({
    queries: list.map((p) => ({
      queryKey: ["professional-services", activeOrgId ?? "", p.id],
      queryFn: () =>
        apiFetch<ProfessionalServicesResponse>(
          `/api/v1/professionals/${p.id}/services`,
        ),
      enabled: !!activeOrgId,
    })),
  });

  return useMemo(() => {
    const counts = new Map<string, number>();
    results.forEach((r) => {
      (r.data?.serviceIds ?? []).forEach((sid) =>
        counts.set(sid, (counts.get(sid) ?? 0) + 1),
      );
    });
    return counts;
  }, [results.map((r) => r.dataUpdatedAt).join(",")]);
}
