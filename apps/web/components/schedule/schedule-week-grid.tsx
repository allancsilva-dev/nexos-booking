"use client";

import type { AppointmentListItemDTO, ProfessionalDTO } from "@nexos/shared";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";
import { ScheduleAppointmentCard } from "@/components/schedule/schedule-appointment-card";
import {
  buildInactiveRanges,
  formatDayLabel,
  formatHourLabel,
  formatWeekdayLabel,
  getMinutesInTimeZone,
  mergeWorkingWindows,
  type WorkingWindow,
} from "@/components/schedule/schedule-utils";

interface ScheduleWeekGridProps {
  dates: string[];
  professionals: ProfessionalDTO[];
  appointmentsByDate: Map<string, AppointmentListItemDTO[]>;
  workWindowsByDate: Map<string, WorkingWindow[]>;
  timezone: string;
  globalStartMin: number;
  globalEndMin: number;
  pxPerHour: number;
  nowLineDate?: string | null;
  nowLineTop?: number | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  onOpenCreate: () => void;
  onCancel?: (appointmentId: string, version: number) => void;
  isCancelling?: boolean;
}

type AppointmentLane = {
  appointment: AppointmentListItemDTO;
  lane: number;
  laneCount: number;
};

function buildAppointmentLanes(
  appointments: AppointmentListItemDTO[],
  timezone: string,
): AppointmentLane[] {
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const laneEnds: number[] = [];
  const laneAssignments = new Map<string, number>();
  const collisionGroups: AppointmentListItemDTO[][] = [];
  let currentGroup: AppointmentListItemDTO[] = [];
  let currentGroupEnd = -1;

  for (const appointment of sorted) {
    const startMin = getMinutesInTimeZone(appointment.startsAt, timezone);
    const endMin = getMinutesInTimeZone(appointment.endsAt, timezone);
    let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= startMin);

    if (laneIndex === -1) {
      laneIndex = laneEnds.length;
      laneEnds.push(endMin);
    } else {
      laneEnds[laneIndex] = endMin;
    }

    laneAssignments.set(appointment.id, laneIndex);

    if (currentGroup.length === 0 || startMin < currentGroupEnd) {
      currentGroup.push(appointment);
      currentGroupEnd = Math.max(currentGroupEnd, endMin);
      continue;
    }

    collisionGroups.push(currentGroup);
    currentGroup = [appointment];
    currentGroupEnd = endMin;
  }

  if (currentGroup.length > 0) {
    collisionGroups.push(currentGroup);
  }

  const laneCountByAppointment = new Map<string, number>();
  for (const group of collisionGroups) {
    const lanesInGroup = Math.max(
      ...group.map((appointment) => (laneAssignments.get(appointment.id) ?? 0) + 1),
      1,
    );
    for (const appointment of group) {
      laneCountByAppointment.set(appointment.id, lanesInGroup);
    }
  }

  return sorted.map((appointment) => ({
    appointment,
    lane: laneAssignments.get(appointment.id) ?? 0,
    laneCount: laneCountByAppointment.get(appointment.id) ?? 1,
  }));
}

export function ScheduleWeekGrid({
  dates,
  professionals,
  appointmentsByDate,
  workWindowsByDate,
  timezone,
  globalStartMin,
  globalEndMin,
  pxPerHour,
  nowLineDate,
  nowLineTop,
  isLoading,
  isEmpty,
  onOpenCreate,
  onCancel,
  isCancelling,
}: ScheduleWeekGridProps) {
  const totalMinutes = globalEndMin - globalStartMin;
  const bodyHeight = (totalMinutes / 60) * pxPerHour;
  const hours = [];
  const professionalNames = new Map(professionals.map((professional) => [professional.id, professional.name]));

  for (let min = globalStartMin; min <= globalEndMin; min += 60) {
    hours.push(min);
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando agenda..." />
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto px-4 py-6 lg:px-6">
      <div className="relative flex min-w-[1120px]">
        <div className="w-16 shrink-0 pr-3">
          <div className="h-[68px]" />
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((min) => (
              <div
                key={min}
                className="absolute right-0 -translate-y-3 text-sm font-semibold text-[var(--color-muted-foreground)]"
                style={{ top: ((min - globalStartMin) * pxPerHour) / 60 }}
              >
                {formatHourLabel(min)}
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex min-w-0 flex-1">
          {dates.map((date) => {
            const appointments = appointmentsByDate.get(date) ?? [];
            const mergedWindows = mergeWorkingWindows(workWindowsByDate.get(date) ?? []);
            const inactiveRanges = buildInactiveRanges(globalStartMin, globalEndMin, mergedWindows);
            const lanes = buildAppointmentLanes(appointments, timezone);

            return (
              <div key={date} className="min-w-[220px] flex-1">
                <div className="px-3 pb-4 pt-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                    {formatWeekdayLabel(date, timezone)}
                  </p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">
                    {formatDayLabel(date, timezone)}
                  </p>
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
                        key={`${date}-${range.startMin}-${range.endMin}`}
                        className="absolute inset-x-0 bg-[var(--color-operational-overlay)]"
                        style={{ top, height }}
                      />
                    );
                  })}

                  {lanes.map(({ appointment, lane, laneCount }) => {
                    const startMin = getMinutesInTimeZone(appointment.startsAt, timezone);
                    const endMin = getMinutesInTimeZone(appointment.endsAt, timezone);
                    const top = ((startMin - globalStartMin) * pxPerHour) / 60;
                    const height = ((endMin - startMin) * pxPerHour) / 60;
                    const laneWidth = `calc(${100 / laneCount}% - 10px)`;
                    const laneLeft = `calc(${(100 / laneCount) * lane}% + 5px)`;

                    return (
                      <ScheduleAppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        timezone={timezone}
                        top={top}
                        height={height}
                        left={laneLeft}
                        width={laneWidth}
                        secondaryLabel={professionalNames.get(appointment.professionalId) ?? "Profissional"}
                        onCancel={onCancel}
                        isCancelling={isCancelling}
                      />
                    );
                  })}

                  {typeof nowLineTop === "number" && nowLineDate === date ? (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-20 h-0.5 bg-[var(--color-timeline-now)] shadow-[var(--shadow-timeline-now)]"
                      style={{ top: nowLineTop }}
                    >
                      <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-[var(--color-timeline-now)]" />
                    </div>
                  ) : null}

                  {appointments.length === 0 ? (
                    <div className="absolute left-3 right-3 top-4 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-operational-overlay)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
                      Nenhum agendamento neste dia.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {isEmpty ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8">
              <div className="pointer-events-auto rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-operational-empty)] px-8 py-7 text-center shadow-[var(--shadow-operational-ambient)]">
                <p className="text-xl font-bold text-[var(--color-foreground)]">Nenhum atendimento nesta semana</p>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  Grade semanal pronta para operação. Crie um agendamento para começar.
                </p>
                <Button className="mt-5" onClick={onOpenCreate}>
                  Agendar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
