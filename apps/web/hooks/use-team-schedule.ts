"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  AvailabilityBlockDTO,
  ProfessionalDTO,
  ShiftDTO,
  WorkingHoursInput,
} from "@nexos/shared";

export type TeamBlock = AvailabilityBlockDTO & {
  professionalName: string;
};

export type TeamAvailabilityRow = {
  professional: ProfessionalDTO;
  shifts: ShiftDTO[];
};

function blockWindow() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 90);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function useTeamBlocks(
  activeOrgId: string | null | undefined,
  professionals: ProfessionalDTO[] | undefined,
) {
  const { from, to } = blockWindow();
  const queries = useQueries({
    queries: (professionals ?? []).map((professional) => ({
      queryKey: ["team-blocks", activeOrgId ?? "", professional.id, from, to],
      queryFn: () =>
        apiFetch<AvailabilityBlockDTO[]>(
          `/api/v1/professionals/${professional.id}/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      enabled: !!activeOrgId,
    })),
  });

  const blocks = queries
    .flatMap((query, index) => {
      const professional = professionals?.[index];
      if (!professional || !query.data) {
        return [];
      }

      return query.data.map((block) => ({
        ...block,
        professionalName: professional.name,
      }));
    })
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );

  return {
    blocks,
    isLoading: queries.some((query) => query.isLoading),
  };
}

export function useTeamAvailability(
  activeOrgId: string | null | undefined,
  professionals: ProfessionalDTO[] | undefined,
) {
  const queries = useQueries({
    queries: (professionals ?? []).map((professional) => ({
      queryKey: ["team-working-hours", activeOrgId ?? "", professional.id],
      queryFn: () =>
        apiFetch<WorkingHoursInput>(
          `/api/v1/professionals/${professional.id}/working-hours`,
        ),
      enabled: !!activeOrgId,
    })),
  });

  const rows = (professionals ?? []).map((professional, index) => ({
    professional,
    shifts: queries[index]?.data?.shifts ?? [],
  }));

  return {
    rows,
    isLoading: queries.some((query) => query.isLoading),
  };
}

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
      queryClient.invalidateQueries({ queryKey: ["team-blocks", activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ["blocks", activeOrgId] });
    },
  });
}
