"use client";

import type { AppointmentListItemDTO, ProfessionalDTO } from "@nexos/shared";
import {
  buildInactiveRanges,
  formatHourLabel,
  getInitials,
  getMinutesInTimeZone,
  type WorkingWindow,
} from "@/components/schedule/schedule-utils";
import { ScheduleAppointmentCard } from "@/components/schedule/schedule-appointment-card";

interface ScheduleProfessionalColumnProps {
  professional: ProfessionalDTO;
  appointments: AppointmentListItemDTO[];
  timezone: string;
  dayWindows: WorkingWindow[];
  globalStartMin: number;
  globalEndMin: number;
  pxPerHour: number;
  onCancel?: (appointmentId: string, version: number) => void;
  isCancelling?: boolean;
}

export function ScheduleProfessionalColumn({
  professional,
  appointments,
  timezone,
  dayWindows,
  globalStartMin,
  globalEndMin,
  pxPerHour,
  onCancel,
  isCancelling,
}: ScheduleProfessionalColumnProps) {
  const totalMinutes = globalEndMin - globalStartMin;
  const bodyHeight = (totalMinutes / 60) * pxPerHour;
  const inactiveRanges = buildInactiveRanges(globalStartMin, globalEndMin, dayWindows);

  return (
    <div className="min-w-[240px] flex-1">
      <div className="flex items-center gap-3 px-3 pb-4 pt-1">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-operational-chip)] text-base font-bold text-[var(--color-accent-strong)]">
          {getInitials(professional.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-[var(--color-foreground)]">{professional.name}</p>
          <p className="truncate text-sm text-[var(--color-muted-foreground)]">
            {dayWindows.length > 0
              ? `${formatHourLabel(dayWindows[0]!.startMin)}–${formatHourLabel(dayWindows[dayWindows.length - 1]!.endMin)}`
              : "Sem expediente"}
          </p>
        </div>
      </div>

      <div
        className="relative border-l border-[var(--color-border-strong)] bg-[var(--color-surface-operational)]"
        style={{
          height: bodyHeight,
          backgroundImage: `linear-gradient(to bottom, transparent 0, transparent calc(${pxPerHour}px - 1px), var(--color-operational-line) calc(${pxPerHour}px - 1px), var(--color-operational-line) ${pxPerHour}px)`,
          backgroundSize: `100% ${pxPerHour}px`,
        }}
      >
        {inactiveRanges.map((range) => {
          const top = ((range.startMin - globalStartMin) * pxPerHour) / 60;
          const height = ((range.endMin - range.startMin) * pxPerHour) / 60;

          return (
            <div
              key={`${professional.id}-${range.startMin}-${range.endMin}`}
              className="absolute inset-x-0 bg-[var(--color-operational-overlay)]"
              style={{ top, height }}
            />
          );
        })}

        {appointments.map((appointment) => {
          const startMin = getMinutesInTimeZone(appointment.startsAt, timezone);
          const endMin = getMinutesInTimeZone(appointment.endsAt, timezone);
          const top = ((startMin - globalStartMin) * pxPerHour) / 60;
          const height = ((endMin - startMin) * pxPerHour) / 60;

          return (
            <ScheduleAppointmentCard
              key={appointment.id}
              appointment={appointment}
              timezone={timezone}
              top={top}
              height={height}
              left="6px"
              width="calc(100% - 12px)"
              onCancel={onCancel}
              isCancelling={isCancelling}
            />
          );
        })}

        {appointments.length === 0 ? (
          <div className="absolute left-3 right-3 top-4 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-operational-overlay)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
            Nenhum agendamento neste dia.
          </div>
        ) : null}

        {dayWindows.length === 0 ? (
          <div className="absolute bottom-4 left-3 right-3 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-operational-overlay)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
            Profissional sem jornada configurada para este dia.
          </div>
        ) : null}
      </div>
    </div>
  );
}
