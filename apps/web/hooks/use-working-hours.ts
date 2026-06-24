"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  WorkingHoursInput,
  CreateBlockInput,
  AvailabilityBlockDTO,
} from "@nexos/shared";

// ── Working Hours ─────────────────────────────────────────────────

export function useWorkingHoursQuery(
  activeOrgId: string | null | undefined,
  professionalId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["working-hours", activeOrgId ?? "", professionalId ?? ""],
    queryFn: () =>
      apiFetch<WorkingHoursInput>(
        `/api/v1/professionals/${professionalId}/working-hours`,
      ),
    enabled: !!activeOrgId && !!professionalId,
  });
}

export function useSetWorkingHoursMutation(
  activeOrgId: string,
  professionalId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkingHoursInput) =>
      apiFetch<WorkingHoursInput>(
        `/api/v1/professionals/${professionalId}/working-hours`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["working-hours", activeOrgId, professionalId],
      });
    },
  });
}

// ── Blocks ────────────────────────────────────────────────────────

function blockWindow() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function useBlocksQuery(
  activeOrgId: string | null | undefined,
  professionalId: string | null | undefined,
) {
  const { from, to } = blockWindow();
  return useQuery({
    queryKey: ["blocks", activeOrgId ?? "", professionalId ?? "", from, to],
    queryFn: () =>
      apiFetch<AvailabilityBlockDTO[]>(
        `/api/v1/professionals/${professionalId}/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: !!activeOrgId && !!professionalId,
  });
}

export function useCreateBlockMutation(
  activeOrgId: string,
  professionalId: string,
) {
  const queryClient = useQueryClient();
  const { from, to } = blockWindow();
  return useMutation({
    mutationFn: (input: CreateBlockInput) =>
      apiFetch<AvailabilityBlockDTO>(
        `/api/v1/professionals/${professionalId}/blocks`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["blocks", activeOrgId, professionalId, from, to],
      });
    },
  });
}

export function useDeleteBlockMutation(
  activeOrgId: string,
  professionalId: string,
) {
  const queryClient = useQueryClient();
  const { from, to } = blockWindow();
  return useMutation({
    mutationFn: (blockId: string) =>
      apiFetch<void>(
        `/api/v1/professionals/${professionalId}/blocks/${blockId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["blocks", activeOrgId, professionalId, from, to],
      });
    },
  });
}
