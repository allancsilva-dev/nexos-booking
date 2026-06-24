"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  ProfessionalDTO,
  ServiceDTO,
  ProfessionalServicesInput,
  ProfessionalServicesResponse,
} from "@nexos/shared";
import type {
  CreateProfessionalInput,
  UpdateProfessionalInput,
} from "@/lib/professional-schemas";

// ── List / Create / Update ──────────────────────────────────────

export function useProfessionalsQuery(activeOrgId: string | null | undefined) {
  return useQuery({
    queryKey: ["professionals", activeOrgId ?? ""],
    queryFn: () => apiFetch<ProfessionalDTO[]>("/api/v1/professionals"),
    enabled: !!activeOrgId,
  });
}

export function useCreateProfessionalMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProfessionalInput) =>
      apiFetch<ProfessionalDTO>("/api/v1/professionals", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["professionals", activeOrgId] }),
  });
}

export function useUpdateProfessionalMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProfessionalInput }) =>
      apiFetch<ProfessionalDTO>(`/api/v1/professionals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["professionals", activeOrgId] }),
  });
}

// ── Services ─────────────────────────────────────────────────────

export function useServicesQuery(activeOrgId: string | null | undefined) {
  return useQuery({
    queryKey: ["services", activeOrgId ?? ""],
    queryFn: () => apiFetch<ServiceDTO[]>("/api/v1/services"),
    enabled: !!activeOrgId,
  });
}

export function useProfessionalServicesQuery(
  activeOrgId: string | null | undefined,
  professionalId: string | null,
) {
  return useQuery({
    queryKey: ["professional-services", activeOrgId ?? "", professionalId ?? ""],
    queryFn: () =>
      apiFetch<ProfessionalServicesResponse>(
        `/api/v1/professionals/${professionalId}/services`,
      ),
    enabled: !!activeOrgId && !!professionalId,
  });
}

export function useSetProfessionalServicesMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      professionalId,
      input,
    }: {
      professionalId: string;
      input: ProfessionalServicesInput;
    }) =>
      apiFetch<ProfessionalServicesResponse>(
        `/api/v1/professionals/${professionalId}/services`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["professional-services", activeOrgId, variables.professionalId],
      });
    },
  });
}
