"use client";

import type { AppointmentListItemDTO, ProfessionalDTO } from "@nexos/shared";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";
import {
  formatHourLabel,
  type WorkingWindow,
} from "@/components/schedule/schedule-utils";
import { ScheduleProfessionalColumn } from "@/components/schedule/schedule-professional-column";

interface ScheduleGridProps {
  professionals: ProfessionalDTO[];
  appointmentsByProfessional: Map<string, AppointmentListItemDTO[]>;
  timezone: string;
  workWindowsByProfessional: Map<string, WorkingWindow[]>;
  globalStartMin: number;
  globalEndMin: number;
  pxPerHour: number;
  nowLineTop?: number | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  onOpenCreate: () => void;
  onCancel?: (appointmentId: string, version: number) => void;
  isCancelling?: boolean;
}

export function ScheduleGrid({
  professionals,
  appointmentsByProfessional,
  timezone,
  workWindowsByProfessional,
  globalStartMin,
  globalEndMin,
  pxPerHour,
  nowLineTop,
  isLoading,
  isEmpty,
  onOpenCreate,
  onCancel,
  isCancelling,
}: ScheduleGridProps) {
  const totalMinutes = globalEndMin - globalStartMin;
  const bodyHeight = (totalMinutes / 60) * pxPerHour;
  const hours = [];

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
      <div className="relative flex min-w-[900px]">
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
          {professionals.map((professional) => (
            <ScheduleProfessionalColumn
              key={professional.id}
              professional={professional}
              appointments={appointmentsByProfessional.get(professional.id) ?? []}
              timezone={timezone}
              dayWindows={workWindowsByProfessional.get(professional.id) ?? []}
              globalStartMin={globalStartMin}
              globalEndMin={globalEndMin}
              pxPerHour={pxPerHour}
              onCancel={onCancel}
              isCancelling={isCancelling}
            />
          ))}

          {typeof nowLineTop === "number" ? (
            <div
              className="pointer-events-none absolute left-0 right-0 z-20 h-0.5 bg-[var(--color-timeline-now)] shadow-[var(--shadow-timeline-now)]"
              style={{ top: 68 + nowLineTop }}
            >
              <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-[var(--color-timeline-now)]" />
            </div>
          ) : null}

          {isEmpty ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8">
              <div className="pointer-events-auto rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-operational-empty)] px-8 py-7 text-center shadow-[var(--shadow-operational-ambient)]">
                <p className="text-xl font-bold text-[var(--color-foreground)]">Nenhum atendimento neste dia</p>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  A grade continua pronta para operação. Crie um agendamento para começar.
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
