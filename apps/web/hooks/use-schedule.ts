"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  AvailabilityResponse,
  AppointmentListResponse,
  AppointmentDTO,
  CreateAppointmentInput,
} from "@nexos/shared";

// ── Availability ──────────────────────────────────────────────────

export function useAvailabilityQuery(
  activeOrgId: string | null,
  professionalId: string | null,
  serviceId: string | null,
  from: string | null,
  to: string | null,
) {
  return useQuery({
    queryKey: [
      "availability",
      activeOrgId ?? "",
      professionalId ?? "",
      serviceId ?? "",
      from ?? "",
      to ?? "",
    ],
    queryFn: () =>
      apiFetch<AvailabilityResponse>(
        `/api/v1/professionals/${professionalId}/availability?from=${encodeURIComponent(from!)}&to=${encodeURIComponent(to!)}&serviceId=${encodeURIComponent(serviceId!)}`,
      ),
    enabled: !!(activeOrgId && professionalId && serviceId && from && to),
  });
}

// ── Appointments list ─────────────────────────────────────────────

export function useAppointmentsQuery(
  activeOrgId: string | null,
  professionalId: string | null,
  from: string | null,
  to: string | null,
) {
  return useQuery({
    queryKey: [
      "appointments",
      activeOrgId ?? "",
      professionalId ?? "",
      from ?? "",
      to ?? "",
    ],
    queryFn: async () => {
      const search = new URLSearchParams({
        from: from!,
        to: to!,
      });
      if (professionalId) {
        search.set("professionalId", professionalId);
      }
      const data = await apiFetch<AppointmentListResponse>(
        `/api/v1/appointments?${search.toString()}`,
      );
      return data.items; // envelope { items, nextCursor } isolado aqui
    },
    enabled: !!(activeOrgId && from && to),
  });
}

// ── Create ────────────────────────────────────────────────────────

export function useCreateAppointmentMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CreateAppointmentInput;
      idempotencyKey: string;
    }) =>
      apiFetch<AppointmentDTO>("/api/v1/appointments", {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments", activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ["availability", activeOrgId] });
    },
  });
}

// ── Cancel ────────────────────────────────────────────────────────

export function useCancelAppointmentMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      appointmentId,
      version,
      idempotencyKey,
    }: {
      appointmentId: string;
      version: number;
      idempotencyKey: string;
    }) =>
      apiFetch<AppointmentDTO>(`/api/v1/appointments/${appointmentId}/cancel`, {
        method: "POST",
        headers: {
          "If-Match": String(version),
          "Idempotency-Key": idempotencyKey,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments", activeOrgId] });
      queryClient.invalidateQueries({ queryKey: ["availability", activeOrgId] });
    },
  });
}
