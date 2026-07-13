"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type {
  AvailabilityResponse,
  AppointmentListResponse,
  AppointmentDTO,
  CreateAppointmentInput,
  RescheduleInput,
  AppointmentEventDTO,
} from "@nexos/shared";

function invalidateScheduleQueries(queryClient: ReturnType<typeof useQueryClient>, activeOrgId: string) {
  queryClient.invalidateQueries({ queryKey: ["appointments", activeOrgId] });
  queryClient.invalidateQueries({ queryKey: ["availability", activeOrgId] });
  queryClient.invalidateQueries({ queryKey: ["dashboard-overview", activeOrgId] });
  queryClient.invalidateQueries({ queryKey: ["clients", activeOrgId] });
}

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

export function useAppointmentDetailQuery(
  activeOrgId: string | null,
  appointmentId: string | null,
) {
  return useQuery({
    queryKey: ["appointment-detail", activeOrgId ?? "", appointmentId ?? ""],
    queryFn: () => apiFetch<AppointmentDTO>(`/api/v1/appointments/${appointmentId}`),
    enabled: !!(activeOrgId && appointmentId),
  });
}

export function useAppointmentEventsQuery(
  activeOrgId: string | null,
  appointmentId: string | null,
) {
  return useQuery({
    queryKey: ["appointment-events", activeOrgId ?? "", appointmentId ?? ""],
    queryFn: () => apiFetch<AppointmentEventDTO[]>(`/api/v1/appointments/${appointmentId}/events`),
    enabled: !!(activeOrgId && appointmentId),
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

export function useRescheduleAppointmentMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      appointmentId,
      version,
      input,
      idempotencyKey,
    }: {
      appointmentId: string;
      version: number;
      input: RescheduleInput;
      idempotencyKey: string;
    }) => apiFetch<AppointmentDTO>(`/api/v1/appointments/${appointmentId}`, {
      method: "PATCH",
      version,
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey },
    }),
    onSuccess: (appointment) => {
      queryClient.setQueryData(
        ["appointment-detail", activeOrgId, appointment.id],
        appointment,
      );
      invalidateScheduleQueries(queryClient, activeOrgId);
    },
  });
}

export type AppointmentTerminalAction = "cancel" | "complete" | "no-show";

export function useAppointmentTerminalMutation(activeOrgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ appointmentId, version, action, idempotencyKey }: {
      appointmentId: string;
      version: number;
      action: AppointmentTerminalAction;
      idempotencyKey: string;
    }) => apiFetch<AppointmentDTO>(`/api/v1/appointments/${appointmentId}/${action}`, {
      method: "POST",
      version,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
    onSuccess: (appointment) => {
      queryClient.setQueryData(
        ["appointment-detail", activeOrgId, appointment.id],
        appointment,
      );
      invalidateScheduleQueries(queryClient, activeOrgId);
    },
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
