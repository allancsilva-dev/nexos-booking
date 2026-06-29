"use client";

import { useMemo } from "react";
import {
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  AvailabilityBlockDTO,
  WorkingHoursInput,
  ShiftDTO,
  ProfessionalDTO,
} from "@nexos/shared";

// ---------------------------------------------------------------------------
// Org-level views aggregate per-professional endpoints (no org-wide route in
// the API). One query per professional, run in parallel via useQueries.
// ---------------------------------------------------------------------------

function blockWindow() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);
  return { from: from.toISOString(), to: to.toISOString() };
}

type WorkingHoursApiResponse = WorkingHoursInput | (ShiftDTO & { id?: string })[];

function normalizeShifts(payload: WorkingHoursApiResponse | null | undefined): ShiftDTO[] {
  if (!payload) return [];
  const shifts = Array.isArray(payload) ? payload : payload.shifts;
  return (shifts ?? []).map((s) => ({
    weekday: s.weekday,
    startTime: s.startTime,
    endTime: s.endTime,
  }));
}

export interface TeamBlock extends AvailabilityBlockDTO {
  professionalName: string;
}

export interface TeamAvailabilityRow {
  professional: ProfessionalDTO;
  shifts: ShiftDTO[];
}

/** Upcoming blocks across the whole team, sorted ascending by start. */
export function useTeamBlocks(
  activeOrgId: string | null | undefined,
  professionals: ProfessionalDTO[] | undefined,
) {
  const { from, to } = useMemo(() => blockWindow(), []);
  const list = professionals ?? [];

  const results = useQueries({
    queries: list.map((p) => ({
      queryKey: ["blocks", activeOrgId ?? "", p.id, from, to],
      queryFn: () =>
        apiFetch<AvailabilityBlockDTO[]>(
          `/api/v1/professionals/${p.id}/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      enabled: !!activeOrgId,
    })),
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    list.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [list]);

  const blocks = useMemo(() => {
    const now = Date.now();
    const all: TeamBlock[] = [];
    results.forEach((r) => {
      (r.data ?? []).forEach((b) =>
        all.push({
          ...b,
          professionalName: nameById.get(b.professionalId) ?? "Profissional",
        }),
      );
    });
    return all
      .filter((b) => new Date(b.endsAt).getTime() >= now)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    // results identity changes each render; depend on serialised data instead.
  }, [results.map((r) => r.dataUpdatedAt).join(","), nameById]);

  return {
    blocks,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}

/** Working-hours summary for every professional. */
export function useTeamAvailability(
  activeOrgId: string | null | undefined,
  professionals: ProfessionalDTO[] | undefined,
) {
  const list = professionals ?? [];

  const results = useQueries({
    queries: list.map((p) => ({
      queryKey: ["working-hours", activeOrgId ?? "", p.id],
      queryFn: async () =>
        normalizeShifts(
          await apiFetch<WorkingHoursApiResponse>(
            `/api/v1/professionals/${p.id}/working-hours`,
          ),
        ),
      enabled: !!activeOrgId,
    })),
  });

  const rows: TeamAvailabilityRow[] = list.map((p, i) => ({
    professional: p,
    shifts: results[i]?.data ?? [],
  }));

  return {
    rows,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}

/** Delete any block when the professional id is only known at row level. */
export function useDeleteTeamBlockMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      professionalId,
      blockId,
    }: {
      professionalId: string;
      blockId: string;
    }) =>
      apiFetch<void>(
        `/api/v1/professionals/${professionalId}/blocks/${blockId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks", activeOrgId] });
    },
  });
}
