"use client";

import { useMemo, useState } from "react";
import type { AppointmentListItemDTO, ProfessionalDTO } from "@nexos/shared";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDayLabel,
  formatTimeInTimeZone,
  formatWeekdayLabel,
  getOperationalEndIso,
} from "@/components/schedule/schedule-utils";

interface ScheduleMobileListProps {
  dates: string[];
  professionals: ProfessionalDTO[];
  appointmentsByDate: Map<string, AppointmentListItemDTO[]>;
  timezone: string;
  viewMode: "day" | "week";
  isLoading?: boolean;
  onOpenCreate: () => void;
  onSelectAppointment?: (appointmentId: string) => void;
}

const statusLabels: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "No-show",
  SCHEDULED: "Pendente",
};

export function ScheduleMobileList({
  dates,
  professionals,
  appointmentsByDate,
  timezone,
  viewMode,
  isLoading,
  onOpenCreate,
  onSelectAppointment,
}: ScheduleMobileListProps) {
  const [professionalId, setProfessionalId] = useState("all");
  const professionalName = useMemo(
    () => new Map(professionals.map((p) => [p.id, p.name])),
    [professionals],
  );

  const visibleDates = dates.length > 0 ? dates : [];
  const visibleCount = visibleDates.reduce((count, date) => {
    const items = appointmentsByDate.get(date) ?? [];
    return (
      count +
      items.filter(
        (appointment) =>
          professionalId === "all" ||
          appointment.professionalId === professionalId,
      ).length
    );
  }, 0);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-4 text-sm font-semibold text-[var(--color-muted-foreground)]">
          Carregando agenda...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {professionals.length > 1 ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex min-w-max gap-2">
            <button
              type="button"
              className={filterClass(professionalId === "all")}
              onClick={() => setProfessionalId("all")}
            >
              Todos
            </button>
            {professionals.map((professional) => (
              <button
                key={professional.id}
                type="button"
                className={filterClass(professionalId === professional.id)}
                onClick={() => setProfessionalId(professional.id)}
              >
                {professional.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visibleCount === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] px-4 py-6 text-center">
          <p className="text-base font-extrabold text-[var(--color-foreground)]">
            {viewMode === "week"
              ? "Sem atendimentos nesta semana"
              : "Sem atendimentos neste dia"}
          </p>
          <p className="mx-auto mt-2 max-w-[34ch] text-sm text-[var(--color-muted-foreground)]">
            Crie um agendamento ou escolha outro profissional.
          </p>
          <Button className="mt-5 min-h-11" onClick={onOpenCreate}>
            <Plus className="h-4 w-4" />
            Agendar
          </Button>
        </div>
      ) : null}

      {visibleDates.map((date) => {
        const appointments = (appointmentsByDate.get(date) ?? [])
          .filter(
            (appointment) =>
              professionalId === "all" ||
              appointment.professionalId === professionalId,
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

        if (appointments.length === 0) {
          return null;
        }

        return (
          <section key={date} className="space-y-2.5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
                  {formatWeekdayLabel(date, timezone)}
                </p>
                <h2 className="text-lg font-extrabold text-[var(--color-foreground)]">
                  {formatDayLabel(date, timezone)}
                </h2>
              </div>
              <span className="rounded-full bg-[var(--color-operational-chip)] px-2.5 py-1 text-xs font-bold text-[var(--color-muted-foreground)]">
                {appointments.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {appointments.map((appointment) => (
                <MobileAppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  professionalName={
                    professionalName.get(appointment.professionalId) ??
                    "Profissional"
                  }
                  timezone={timezone}
                  onSelect={onSelectAppointment}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function filterClass(active: boolean) {
  return cn(
    "min-h-11 rounded-full border px-4 text-sm font-bold transition-colors",
    active
      ? "border-[var(--color-accent-strong)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
      : "border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] text-[var(--color-muted-foreground)]",
  );
}

function MobileAppointmentCard({
  appointment,
  professionalName,
  timezone,
  onSelect,
}: {
  appointment: AppointmentListItemDTO;
  professionalName: string;
  timezone: string;
  onSelect?: (appointmentId: string) => void;
}) {
  const start = formatTimeInTimeZone(appointment.startsAt, timezone);
  const end = formatTimeInTimeZone(getOperationalEndIso(appointment), timezone);
  const cancelled = appointment.status === "CANCELLED";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(appointment.id)}
      aria-label={`Abrir detalhes de ${appointment.clientName}`}
      className={cn(
        "w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
        cancelled && "opacity-65",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-tight text-[var(--color-foreground)]">
            {start} - {end}
          </p>
          <p className="mt-1 break-words text-sm font-bold text-[var(--color-foreground)]">
            {appointment.clientName}
          </p>
          <p className="mt-0.5 break-words text-sm text-[var(--color-muted-foreground)]">
            {appointment.serviceNameSnapshot}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--color-operational-chip)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-muted-foreground)]">
          {statusLabels[appointment.status] ?? appointment.status}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-operational-line)] pt-3">
        <div className="min-w-0 text-xs font-semibold text-[var(--color-muted-foreground)]">
          <span className="block truncate">{professionalName}</span>
          <span className="block">
            {formatCurrency(
              appointment.servicePriceCentsSnapshot,
              appointment.serviceCurrencySnapshot,
            )}
          </span>
        </div>

        <span className="text-xs font-bold text-[var(--color-accent-strong)]">Ver detalhes</span>
      </div>
    </button>
  );
}
