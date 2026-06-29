"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type {
  AvailabilitySlot,
  CreateAppointmentInput,
  WorkingHoursInput,
} from "@nexos/shared";
import { useMeQuery } from "@/hooks/use-auth";
import { useOrganizationQuery } from "@/hooks/use-organization";
import {
  useProfessionalsQuery,
  useProfessionalServicesQuery,
} from "@/hooks/use-professionals";
import { useServicesQuery } from "@/hooks/use-services";
import {
  useAppointmentsQuery,
  useAvailabilityQuery,
  useCancelAppointmentMutation,
  useCreateAppointmentMutation,
} from "@/hooks/use-schedule";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { ScheduleCreatePanel } from "@/components/schedule/schedule-create-panel";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { ScheduleHeader } from "@/components/schedule/schedule-header";
import { ScheduleShell } from "@/components/schedule/schedule-shell";
import { ScheduleSidebarSummary } from "@/components/schedule/schedule-sidebar-summary";
import { ScheduleWeekGrid } from "@/components/schedule/schedule-week-grid";
import { OperationalModal } from "@/components/ui/operational/modal";
import { PageChrome } from "@/components/shell/page-chrome";
import {
  addDaysToCivilDate,
  getCivilDateInTimeZone,
  getMinutesInTimeZone,
  getStartOfWeek,
  getWeekDates,
  getWeekdayFromCivilDate,
  parseTimeToMinutes,
  type WorkingWindow,
} from "@/components/schedule/schedule-utils";
import { ApiError, apiFetch } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { formatGlobalError } from "@/lib/error-handler";
import { toast } from "sonner";

type ViewMode = "day" | "week";

function dayRange(date: string) {
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    const fallback = new Date().toISOString().slice(0, 10);
    return dayRange(fallback);
  }
  const [y, m, d] = parts;
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  if (Number.isNaN(next.getTime())) {
    const fallback = new Date().toISOString().slice(0, 10);
    return dayRange(fallback);
  }
  return { from: date, to: next.toISOString().slice(0, 10) };
}

function weekRange(date: string) {
  const from = getStartOfWeek(date);
  return { from, to: addDaysToCivilDate(from, 7) };
}

function toErrorBody(error: unknown, fallbackMessage: string) {
  return error instanceof ApiError
    ? {
        code: error.code,
        message: error.message,
        requestId: error.requestId,
        timestamp: new Date().toISOString() as never,
      }
    : {
        code: INTERNAL_ERROR,
        message: fallbackMessage,
        requestId: "",
        timestamp: new Date().toISOString() as never,
      };
}

export default function SchedulePage() {
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  const {
    data: organization,
    isLoading: orgLoading,
    isError: orgError,
    error: orgErr,
    refetch: orgRefetch,
  } = useOrganizationQuery(activeOrgId);
  const {
    data: professionals,
    isLoading: professionalsLoading,
    isError: professionalsError,
    error: professionalsErr,
    refetch: professionalsRefetch,
  } = useProfessionalsQuery(activeOrgId);
  const {
    data: services,
  } = useServicesQuery(activeOrgId);

  const [date, setDate] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [createDate, setCreateDate] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createProfessionalId, setCreateProfessionalId] = useState<string | null>(null);
  const [createServiceId, setCreateServiceId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

  useEffect(() => {
    if (!organization?.timezone) return;
    const today = getCivilDateInTimeZone(new Date(), organization.timezone);
    setDate((current) => current || today);
    setCreateDate((current) => current || today);
  }, [organization?.timezone]);

  const range = useMemo(
    () => (viewMode === "week" ? weekRange(date || "1970-01-01") : dayRange(date || "1970-01-01")),
    [date, viewMode],
  );

  const appointmentsQuery = useAppointmentsQuery(
    activeOrgId,
    null,
    date ? range.from : null,
    date ? range.to : null,
  );

  const workingHoursQueries = useQueries({
    queries: (professionals ?? []).map((professional) => ({
      queryKey: ["working-hours", activeOrgId ?? "", professional.id],
      queryFn: () =>
        apiFetch<WorkingHoursInput>(
          `/api/v1/professionals/${professional.id}/working-hours`,
        ),
      enabled: !!activeOrgId,
    })),
  });

  // Serviços vinculados ao profissional escolhido no painel de criação.
  // O backend rejeita combinações não vinculadas (PROFESSIONAL_SERVICE_NOT_LINKED),
  // então o dropdown só pode oferecer os serviços que o profissional realmente atende.
  const professionalServicesQuery = useProfessionalServicesQuery(
    activeOrgId,
    createOpen ? createProfessionalId : null,
  );

  const availableServices = useMemo(() => {
    if (!createProfessionalId) return [];
    if (!professionalServicesQuery.data) return undefined;
    const linkedIds = new Set(professionalServicesQuery.data.serviceIds);
    return (services ?? []).filter((service) => linkedIds.has(service.id));
  }, [createProfessionalId, professionalServicesQuery.data, services]);

  const availabilityRange = useMemo(
    () => (createDate ? dayRange(createDate) : { from: null, to: null }),
    [createDate],
  );
  const availabilityQuery = useAvailabilityQuery(
    activeOrgId,
    createProfessionalId,
    createServiceId,
    availabilityRange.from,
    availabilityRange.to,
  );

  const createMutation = useCreateAppointmentMutation(activeOrgId ?? "");
  const cancelMutation = useCancelAppointmentMutation(activeOrgId ?? "");

  const timezone = organization?.timezone ?? "America/Sao_Paulo";
  const pxPerHour = 82;
  const visibleDates = useMemo(
    () => (viewMode === "week" ? getWeekDates(date) : date ? [date] : []),
    [date, viewMode],
  );

  const workWindowsByDateByProfessional = useMemo(() => {
    const map = new Map<string, Map<string, WorkingWindow[]>>();

    for (const visibleDate of visibleDates) {
      map.set(visibleDate, new Map());
    }

    (professionals ?? []).forEach((professional, index) => {
      const shifts = workingHoursQueries[index]?.data?.shifts ?? [];

      for (const visibleDate of visibleDates) {
        const weekday = getWeekdayFromCivilDate(visibleDate);
        const dayWindows = shifts
          .filter((shift) => shift.weekday === weekday)
          .map((shift) => ({
            startMin: parseTimeToMinutes(shift.startTime),
            endMin: parseTimeToMinutes(shift.endTime),
          }))
          .sort((a, b) => a.startMin - b.startMin);

        map.get(visibleDate)?.set(professional.id, dayWindows);
      }
    });

    return map;
  }, [professionals, visibleDates, workingHoursQueries]);

  const workWindowsByProfessional = useMemo(
    () => workWindowsByDateByProfessional.get(date) ?? new Map<string, WorkingWindow[]>(),
    [date, workWindowsByDateByProfessional],
  );

  const workWindowsByDate = useMemo(() => {
    const map = new Map<string, WorkingWindow[]>();

    for (const visibleDate of visibleDates) {
      const dayWindows = Array.from(workWindowsByDateByProfessional.get(visibleDate)?.values() ?? []).flat();
      map.set(visibleDate, dayWindows);
    }

    return map;
  }, [visibleDates, workWindowsByDateByProfessional]);

  const allAppointments = useMemo(
    () => (appointmentsQuery.data ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [appointmentsQuery.data],
  );

  const appointmentsByProfessional = useMemo(() => {
    const map = new Map<string, typeof allAppointments>();
    for (const professional of professionals ?? []) {
      map.set(professional.id, []);
    }
    for (const appointment of allAppointments) {
      const existing = map.get(appointment.professionalId) ?? [];
      existing.push(appointment);
      map.set(appointment.professionalId, existing);
    }
    return map;
  }, [allAppointments, professionals]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, typeof allAppointments>();
    for (const visibleDate of visibleDates) {
      map.set(visibleDate, []);
    }
    for (const appointment of allAppointments) {
      const appointmentDate = getCivilDateInTimeZone(new Date(appointment.startsAt), timezone);
      const existing = map.get(appointmentDate);
      if (existing) {
        existing.push(appointment);
      }
    }
    for (const visibleDate of visibleDates) {
      map.get(visibleDate)?.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [allAppointments, timezone, visibleDates]);

  const workingHoursLoading = workingHoursQueries.some((query) => query.isLoading);

  const scheduleBounds = useMemo(() => {
    // Janela-base garante que a grade nunca colapse para o tamanho de um único
    // card (ex.: dia sem expediente configurado). A partir dela, expandimos para
    // englobar o expediente E qualquer agendamento fora dele, evitando overflow.
    let startMin = 9 * 60;
    let endMin = 18 * 60;

    const windows = Array.from(workWindowsByDate.values()).flat();
    if (windows.length > 0) {
      startMin = Math.min(...windows.map((window) => window.startMin));
      endMin = Math.max(...windows.map((window) => window.endMin));
    }

    if (allAppointments.length > 0) {
      const mins = allAppointments.flatMap((appointment) => [
        getMinutesInTimeZone(appointment.startsAt, timezone),
        getMinutesInTimeZone(appointment.endsAt, timezone),
      ]);
      startMin = Math.min(startMin, Math.floor(Math.min(...mins) / 60) * 60);
      endMin = Math.max(endMin, Math.ceil(Math.max(...mins) / 60) * 60);
    }

    return { startMin, endMin };
  }, [allAppointments, timezone, workWindowsByDate]);

  const orgToday = getCivilDateInTimeZone(new Date(), timezone);
  const nowLineDate = useMemo(() => {
    if (viewMode === "day") return date === orgToday ? orgToday : null;
    return visibleDates.includes(orgToday) ? orgToday : null;
  }, [date, orgToday, viewMode, visibleDates]);
  const nowLineTop = useMemo(() => {
    if (!nowLineDate) return null;
    const nowMinutes = getMinutesInTimeZone(new Date().toISOString(), timezone);
    if (nowMinutes < scheduleBounds.startMin || nowMinutes > scheduleBounds.endMin) {
      return null;
    }
    return ((nowMinutes - scheduleBounds.startMin) * pxPerHour) / 60;
  }, [nowLineDate, pxPerHour, scheduleBounds.endMin, scheduleBounds.startMin, timezone]);

  const nowMinutes = useMemo(
    () => (nowLineDate ? getMinutesInTimeZone(new Date().toISOString(), timezone) : null),
    [nowLineDate, timezone],
  );

  function openCreatePanel(nextProfessionalId?: string | null) {
    setCreateOpen(true);
    setCreateDate(date);
    setSelectedSlot(null);
    if (nextProfessionalId !== undefined) {
      setCreateProfessionalId(nextProfessionalId);
      setCreateServiceId(null);
    }
  }

  function handleCreateProfessionalChange(id: string) {
    setCreateProfessionalId(id || null);
    setCreateServiceId(null);
    setSelectedSlot(null);
  }

  function handleCreateServiceChange(id: string) {
    setCreateServiceId(id || null);
    setSelectedSlot(null);
  }

  function handleCreateDateChange(nextDate: string) {
    setCreateDate(nextDate);
    setSelectedSlot(null);
  }

  async function handleCreate(input: CreateAppointmentInput, idempotencyKey: string) {
    try {
      const startsAtIso = selectedSlot?.startsAt ?? input.startsAt;
      await createMutation.mutateAsync({
        input: {
          ...input,
          startsAt: startsAtIso,
          professionalId: createProfessionalId!,
          serviceId: createServiceId!,
        },
        idempotencyKey,
      });
      setSelectedSlot(null);
      setCreateOpen(false);
      toast.success("Agendamento criado");
    } catch (err) {
      if (err instanceof ApiError && err.code === "APPOINTMENT_CONFLICT") {
        availabilityQuery.refetch();
      }
      throw err;
    }
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

  if (!activeOrgId || orgLoading || professionalsLoading || !date) {
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando agenda..." />
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="p-6">
        <ErrorDisplay
          error={toErrorBody(orgErr, "Erro ao carregar organização")}
          onRetry={() => orgRefetch()}
        />
      </div>
    );
  }

  if (professionalsError) {
    return (
      <div className="p-6">
        <ErrorDisplay
          error={toErrorBody(professionalsErr, "Erro ao carregar profissionais")}
          onRetry={() => professionalsRefetch()}
        />
      </div>
    );
  }

  if (appointmentsQuery.isError) {
    return (
      <div className="p-6">
        <ErrorDisplay
          error={toErrorBody(appointmentsQuery.error, "Erro ao carregar agendamentos")}
          onRetry={() => appointmentsQuery.refetch()}
        />
      </div>
    );
  }

  const totalWindowMinutes =
    Array.from(workWindowsByDateByProfessional.values()).reduce(
      (sum, dayMap) =>
        sum +
        Array.from(dayMap.values()).reduce(
          (daySum, windows) =>
            daySum + windows.reduce((windowSum, window) => windowSum + (window.endMin - window.startMin), 0),
          0,
        ),
      0,
    );

  const navigationStep = viewMode === "week" ? 7 : 1;

  return (
    <>
      <PageChrome title="Agenda" subtitle="Atendimentos por profissional" />
      <ScheduleShell
        header={
          <ScheduleHeader
            date={date}
            timeZone={timezone}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onPrev={() => setDate((current) => addDaysToCivilDate(current, -navigationStep))}
            onNext={() => setDate((current) => addDaysToCivilDate(current, navigationStep))}
            onToday={() => setDate(orgToday)}
            onOpenCreate={() => openCreatePanel()}
          />
        }
        grid={
          viewMode === "day" ? (
            <ScheduleGrid
              professionals={professionals ?? []}
              appointmentsByProfessional={appointmentsByProfessional}
              timezone={timezone}
              workWindowsByProfessional={workWindowsByProfessional}
              globalStartMin={scheduleBounds.startMin}
              globalEndMin={scheduleBounds.endMin}
              pxPerHour={pxPerHour}
              nowLineTop={nowLineTop}
              isLoading={appointmentsQuery.isLoading || workingHoursLoading}
              isEmpty={allAppointments.length === 0}
              onOpenCreate={() => openCreatePanel()}
              onCancel={handleCancel}
              isCancelling={cancelMutation.isPending}
            />
          ) : (
            <ScheduleWeekGrid
              dates={visibleDates}
              professionals={professionals ?? []}
              appointmentsByDate={appointmentsByDate}
              workWindowsByDate={workWindowsByDate}
              timezone={timezone}
              globalStartMin={scheduleBounds.startMin}
              globalEndMin={scheduleBounds.endMin}
              pxPerHour={pxPerHour}
              nowLineDate={nowLineDate}
              nowLineTop={nowLineTop}
              isLoading={appointmentsQuery.isLoading || workingHoursLoading}
              isEmpty={allAppointments.length === 0}
              onOpenCreate={() => openCreatePanel()}
              onCancel={handleCancel}
              isCancelling={cancelMutation.isPending}
            />
          )
        }
        sidebar={
          <ScheduleSidebarSummary
            appointments={allAppointments}
            timezone={timezone}
            totalWindowMinutes={totalWindowMinutes}
            nowMinutes={nowMinutes}
            nowIso={nowLineDate ? new Date().toISOString() : null}
            title={viewMode === "week" ? "Resumo da semana" : "Resumo do dia"}
            subtitle={
              viewMode === "week"
                ? "Leitura rápida de volume, ocupação e próximos atendimentos da semana."
                : "Leitura rápida de volume, ocupação e próximos atendimentos."
            }
            emptyUpcomingLabel={
              viewMode === "week"
                ? "Sem próximos atendimentos nesta semana."
                : "Sem próximos atendimentos neste dia."
            }
          />
        }
      />
      <OperationalModal
        open={createOpen}
        title="Novo agendamento"
        description="Escolha profissional, serviço e slot antes de preencher cliente."
        onClose={() => setCreateOpen(false)}
        className="max-w-4xl"
      >
        <ScheduleCreatePanel
          professionals={professionals}
          services={availableServices}
          professionalHasNoServices={
            !!createProfessionalId &&
            Array.isArray(availableServices) &&
            availableServices.length === 0
          }
          professionalId={createProfessionalId}
          serviceId={createServiceId}
          date={createDate}
          selectedSlot={selectedSlot}
          availability={availabilityQuery.data}
          availabilityLoading={availabilityQuery.isLoading}
          availabilityError={availabilityQuery.isError ? availabilityQuery.error : null}
          isPending={createMutation.isPending}
          onProfessionalChange={handleCreateProfessionalChange}
          onServiceChange={handleCreateServiceChange}
          onDateChange={handleCreateDateChange}
          onSelectSlot={setSelectedSlot}
          onSubmit={handleCreate}
          onClearSlot={() => setSelectedSlot(null)}
        />
      </OperationalModal>
    </>
  );
}
