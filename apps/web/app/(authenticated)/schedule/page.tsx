"use client";

import { useState, useMemo } from "react";
import { useMeQuery } from "@/hooks/use-auth";
import { useProfessionalsQuery } from "@/hooks/use-professionals";
import { useServicesQuery } from "@/hooks/use-professionals";
import {
  useAvailabilityQuery,
  useAppointmentsQuery,
  useCreateAppointmentMutation,
  useCancelAppointmentMutation,
} from "@/hooks/use-schedule";
import { ScheduleFilters } from "@/components/schedule/schedule-filters";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { CreateAppointmentForm } from "@/components/schedule/create-appointment-form";
import { AppointmentList } from "@/components/schedule/appointment-list";
import { ErrorDisplay } from "@/components/error-display";
import { LoadingState } from "@/components/loading-state";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { toast } from "sonner";
import { formatGlobalError } from "@/lib/error-handler";
import type { CreateAppointmentInput } from "@nexos/shared";
import type { AvailabilitySlot } from "@nexos/shared";

function dateRange(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return { from: date, to: next.toISOString().slice(0, 10) };
}

export default function SchedulePage() {
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  const { data: professionals, isLoading: profsLoading, isError: profsError, error: profsErr, refetch: profsRefetch } =
    useProfessionalsQuery(activeOrgId);
  const { data: services, isLoading: svcsLoading } =
    useServicesQuery(activeOrgId);

  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

  const range = useMemo(() => dateRange(date), [date]);

  const availabilityQuery = useAvailabilityQuery(
    activeOrgId, professionalId, serviceId, range.from, range.to,
  );
  const appointmentsQuery = useAppointmentsQuery(
    activeOrgId, professionalId, range.from, range.to,
  );
  const createMutation = useCreateAppointmentMutation(activeOrgId ?? "");
  const cancelMutation = useCancelAppointmentMutation(activeOrgId ?? "");

  // ── handlers ──

  function handleProfessionalChange(id: string) {
    setProfessionalId(id || null);
    setSelectedSlot(null);
  }

  function handleServiceChange(id: string) {
    setServiceId(id || null);
    setSelectedSlot(null);
  }

  function handleDateChange(d: string) {
    setDate(d);
    setSelectedSlot(null);
  }

  async function handleCreate(input: CreateAppointmentInput, idempotencyKey: string) {
    // startsAt com offset explícito baseado no slot selecionado
    const startsAtIso = selectedSlot?.startsAt ?? input.startsAt;
    await createMutation.mutateAsync({
      input: { ...input, startsAt: startsAtIso, professionalId: professionalId!, serviceId: serviceId! },
      idempotencyKey,
    });
    setSelectedSlot(null);
    toast.success("Agendamento criado");
  }

  async function handleCancel(appointmentId: string, version: number) {
    const idempotencyKey = crypto.randomUUID();
    try {
      await cancelMutation.mutateAsync({ appointmentId, version, idempotencyKey });
      toast.success("Agendamento cancelado");
    } catch (err) {
      if (err instanceof ApiError) {
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, { description: `${code} — Ref: ${requestId || "N/A"}` });
      } else {
        toast.error("Erro ao cancelar.");
      }
    }
  }

  // ── loading ──

  if (!activeOrgId || profsLoading || svcsLoading) {
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando..." />
      </div>
    );
  }

  // ── error ──

  if (profsError) {
    const e = profsErr instanceof ApiError
      ? { code: profsErr.code, message: profsErr.message, requestId: profsErr.requestId, timestamp: new Date().toISOString() as never }
      : { code: INTERNAL_ERROR, message: "Erro ao carregar profissionais", requestId: "", timestamp: new Date().toISOString() as never };
    return (
      <div className="p-6">
        <ErrorDisplay error={e} onRetry={() => profsRefetch()} />
      </div>
    );
  }

  // ── data ──

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Agenda</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Gerencie os agendamentos
        </p>
      </div>

      <ScheduleFilters
        professionals={professionals}
        services={services}
        professionalId={professionalId}
        serviceId={serviceId}
        date={date}
        onProfessionalChange={handleProfessionalChange}
        onServiceChange={handleServiceChange}
        onDateChange={handleDateChange}
        disabled={profsLoading}
      />

      {selectedSlot ? (
        <CreateAppointmentForm
          professionalId={professionalId!}
          serviceId={serviceId!}
          startsAt={selectedSlot.startsAt}
          isPending={createMutation.isPending}
          onSubmit={handleCreate}
          onCancel={() => setSelectedSlot(null)}
        />
      ) : (
        <SlotPicker
          data={availabilityQuery.data}
          isLoading={availabilityQuery.isLoading}
          selectedSlot={null}
          onSelectSlot={setSelectedSlot}
        />
      )}

      <div>
        <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-3">
          Agendamentos do dia
        </h2>
        <AppointmentList
          appointments={appointmentsQuery.data}
          isLoading={appointmentsQuery.isLoading}
          isCancelling={cancelMutation.isPending}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
