"use client";

import { Loader2, Trash2 } from "lucide-react";
import type { AppointmentListItemDTO } from "@nexos/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clamp,
  formatTimeInTimeZone,
} from "@/components/schedule/schedule-utils";

interface ScheduleAppointmentCardProps {
  appointment: AppointmentListItemDTO;
  timezone: string;
  top: number;
  height: number;
  left?: string;
  width?: string;
  secondaryLabel?: string;
  onCancel?: (appointmentId: string, version: number) => void;
  isCancelling?: boolean;
}

const palettes = [
  { bg: "var(--cat-1-bg)", border: "var(--cat-1-line)", text: "var(--cat-1-ink)" },
  { bg: "var(--cat-2-bg)", border: "var(--cat-2-line)", text: "var(--cat-2-ink)" },
  { bg: "var(--cat-3-bg)", border: "var(--cat-3-line)", text: "var(--cat-3-ink)" },
  { bg: "var(--cat-4-bg)", border: "var(--cat-4-line)", text: "var(--cat-4-ink)" },
  { bg: "var(--cat-5-bg)", border: "var(--cat-5-line)", text: "var(--cat-5-ink)" },
];

const statusLabels: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "No-show",
  SCHEDULED: "Pendente",
};

function getPalette(seed: string) {
  const hash = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palettes[hash % palettes.length]!;
}

export function ScheduleAppointmentCard({
  appointment,
  timezone,
  top,
  height,
  left = "0%",
  width = "100%",
  secondaryLabel,
  onCancel,
  isCancelling,
}: ScheduleAppointmentCardProps) {
  const palette = getPalette(appointment.serviceNameSnapshot);
  const range = `${formatTimeInTimeZone(appointment.startsAt, timezone)}–${formatTimeInTimeZone(appointment.endsAt, timezone)}`;
  const visualHeight = clamp(height, 48, 9999);

  return (
    <article
      className={cn(
        "absolute overflow-hidden rounded-xl border px-4 py-3 shadow-[var(--shadow-operational-card)]",
        appointment.status === "CANCELLED" && "opacity-60",
      )}
      style={{
        top,
        left,
        width,
        height: visualHeight,
        backgroundColor: palette.bg,
        borderColor: palette.border,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight" style={{ color: palette.text }}>
            {appointment.serviceNameSnapshot}
          </p>
          <p className="truncate text-[11px] font-medium text-[var(--color-foreground)]/90">
            {appointment.clientName}
          </p>
          {secondaryLabel ? (
            <p className="truncate text-[10px] font-medium text-[var(--color-muted-foreground)]">
              {secondaryLabel}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] font-medium text-[var(--color-muted-foreground)]">
            {range}
          </p>
        </div>

        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-foreground)]/90">
          {statusLabels[appointment.status] ?? appointment.status}
        </span>
      </div>

      {appointment.status === "CONFIRMED" && onCancel ? (
        <div className="absolute bottom-2 right-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full bg-black/10 text-[var(--color-foreground)]/90 hover:bg-black/20"
            onClick={() => onCancel(appointment.id, appointment.version)}
            disabled={isCancelling}
          >
            {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
