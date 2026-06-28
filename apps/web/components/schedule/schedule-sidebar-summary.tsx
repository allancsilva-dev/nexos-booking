"use client";

import type { AppointmentListItemDTO } from "@nexos/shared";
import { formatCurrency, formatTimeInTimeZone } from "@/components/schedule/schedule-utils";
import { OperationalMetricCard } from "@/components/ui/operational/metric-card";

interface ScheduleSidebarSummaryProps {
  appointments: AppointmentListItemDTO[];
  timezone: string;
  totalWindowMinutes: number;
  nowMinutes?: number | null;
  nowIso?: string | null;
  title?: string;
  subtitle?: string;
  emptyUpcomingLabel?: string;
  children?: React.ReactNode;
}

function isActiveAppointment(appointment: AppointmentListItemDTO) {
  return appointment.status !== "CANCELLED";
}

export function ScheduleSidebarSummary({
  appointments,
  timezone,
  totalWindowMinutes,
  nowMinutes,
  nowIso,
  title = "Resumo do dia",
  subtitle = "Leitura rápida de volume, ocupação e próximos atendimentos.",
  emptyUpcomingLabel = "Sem próximos atendimentos neste dia.",
  children,
}: ScheduleSidebarSummaryProps) {
  const activeAppointments = appointments.filter(isActiveAppointment);
  const occupiedMinutes = activeAppointments.reduce((sum, appointment) => {
    const start = new Date(appointment.startsAt).getTime();
    const end = new Date(appointment.endsAt).getTime();
    return sum + Math.max(0, (end - start) / 60000);
  }, 0);
  const occupancy = totalWindowMinutes > 0
    ? Math.min(100, Math.round((occupiedMinutes / totalWindowMinutes) * 100))
    : 0;

  const futureAppointments = activeAppointments
    .filter((appointment) => {
      if (nowIso) {
        return new Date(appointment.startsAt).getTime() >= new Date(nowIso).getTime();
      }
      if (typeof nowMinutes !== "number") return true;
      const parts = formatTimeInTimeZone(appointment.startsAt, timezone).split(":").map(Number);
      return ((parts[0] ?? 0) * 60) + (parts[1] ?? 0) >= nowMinutes;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 5);

  const estimatedRevenue = activeAppointments.reduce(
    (sum, appointment) => sum + appointment.servicePriceCentsSnapshot,
    0,
  );

  return (
    <div className="space-y-6 p-5">
      {children}

      <div className="space-y-1">
        <h2 className="text-3xl font-extrabold tracking-tight text-[var(--color-foreground)]">
          {title}
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <OperationalMetricCard
          label="Atendimentos"
          value={activeAppointments.length}
          accent
        />
        <OperationalMetricCard
          label="Ocupação"
          value={`${occupancy}%`}
        />
      </div>

      {estimatedRevenue > 0 ? (
        <OperationalMetricCard
          label="Faturamento estimado"
          value={formatCurrency(estimatedRevenue, activeAppointments[0]?.serviceCurrencySnapshot ?? "BRL")}
          className="gap-0"
          footer={
            <div className="h-3 overflow-hidden rounded-full bg-[var(--color-operational-chip)]">
              <div
                className="h-full rounded-full bg-[var(--color-timeline-now)]"
                style={{ width: `${Math.max(12, occupancy)}%` }}
              />
            </div>
          }
        />
      ) : null}

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Próximos
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Até 5 atendimentos futuros a partir do horário atual.
          </p>
        </div>
        <div className="space-y-3">
          {futureAppointments.length === 0 ? (
            <div className="rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] px-4 py-4 text-sm text-[var(--color-muted-foreground)]">
              {emptyUpcomingLabel}
            </div>
          ) : (
            futureAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="flex items-center gap-4 rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] px-4 py-4"
              >
                <div className="h-11 w-1 rounded-full bg-[var(--color-timeline-now)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold text-[var(--color-foreground)]">{appointment.clientName}</p>
                  <p className="truncate text-sm text-[var(--color-muted-foreground)]">
                    {appointment.serviceNameSnapshot}
                  </p>
                </div>
                <div className="text-lg font-bold text-[var(--color-foreground)]">
                  {formatTimeInTimeZone(appointment.startsAt, timezone)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
