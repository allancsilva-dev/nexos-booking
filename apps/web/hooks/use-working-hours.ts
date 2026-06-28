"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  WorkingHoursInput,
  CreateBlockInput,
  AvailabilityBlockDTO,
  ShiftDTO,
} from "@nexos/shared";

type WorkingHoursApiShift = ShiftDTO & { id?: string };
type WorkingHoursApiResponse = WorkingHoursInput | WorkingHoursApiShift[];

function isShiftArray(value: unknown): value is WorkingHoursApiShift[] {
  return Array.isArray(value);
}

function normalizeWorkingHoursResponse(
  payload: WorkingHoursApiResponse | null | undefined,
): WorkingHoursInput {
  if (!payload) {
    return { shifts: [] };
  }

  if (isShiftArray(payload)) {
    return {
      shifts: payload.map((shift) => ({
        weekday: shift.weekday,
        startTime: shift.startTime,
        endTime: shift.endTime,
      })),
    };
  }

  return {
    shifts: Array.isArray(payload.shifts) ? payload.shifts : [],
  };
}

// ── Working Hours ─────────────────────────────────────────────────

export function useWorkingHoursQuery(
  activeOrgId: string | null | undefined,
  professionalId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["working-hours", activeOrgId ?? "", professionalId ?? ""],
    queryFn: async () =>
      normalizeWorkingHoursResponse(
        await apiFetch<WorkingHoursApiResponse>(
          `/api/v1/professionals/${professionalId}/working-hours`,
        ),
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
    mutationFn: async (input: WorkingHoursInput) =>
      normalizeWorkingHoursResponse(
        await apiFetch<WorkingHoursApiResponse>(
          `/api/v1/professionals/${professionalId}/working-hours`,
          { method: "PUT", body: JSON.stringify(input) },
        ),
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
  const { from, to } = useMemo(() => blockWindow(), []);
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
  return useMutation({
    mutationFn: (input: CreateBlockInput) =>
      apiFetch<AvailabilityBlockDTO>(
        `/api/v1/professionals/${professionalId}/blocks`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["blocks", activeOrgId, professionalId],
      });
    },
  });
}

export function useDeleteBlockMutation(
  activeOrgId: string,
  professionalId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockId: string) =>
      apiFetch<void>(
        `/api/v1/professionals/${professionalId}/blocks/${blockId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["blocks", activeOrgId, professionalId],
      });
    },
  });
}
