"use client";

import { Trash2, Loader2 } from "lucide-react";
import type { AppointmentListItemDTO } from "@nexos/shared";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";
import { formatPhoneBR } from "@/lib/phone";

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function hasServiceSnapshot(appointment: AppointmentListItemDTO) {
  return (
    typeof appointment.serviceNameSnapshot === "string" &&
    appointment.serviceNameSnapshot.length > 0 &&
    typeof appointment.serviceDurationMinSnapshot === "number" &&
    Number.isFinite(appointment.serviceDurationMinSnapshot) &&
    typeof appointment.servicePriceCentsSnapshot === "number" &&
    Number.isFinite(appointment.servicePriceCentsSnapshot) &&
    typeof appointment.serviceCurrencySnapshot === "string" &&
    appointment.serviceCurrencySnapshot.length > 0
  );
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
};

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "border-cyan-400/30 bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]",
  CANCELLED: "border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] text-[var(--color-muted-foreground)]",
  COMPLETED: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  NO_SHOW: "border-rose-400/30 bg-rose-500/10 text-rose-200",
};

interface Props {
  appointments: AppointmentListItemDTO[] | undefined;
  isLoading: boolean;
  isCancelling: boolean;
  onCancel: (appointmentId: string, version: number) => void;
}

export function AppointmentList({ appointments, isLoading, isCancelling, onCancel }: Props) {
  if (isLoading) {
    return <LoadingState variant="spinner" message="Carregando agendamentos..." />;
  }

  if (!appointments || appointments.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)] py-8 text-center">
        Nenhum agendamento neste período.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {appointments.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-3 rounded-[20px] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] px-4 py-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                {a.clientName}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  STATUS_STYLES[a.status] ?? "border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] text-[var(--color-muted-foreground)]"
                }`}
              >
                {STATUS_LABELS[a.status] ?? a.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {formatTime(a.startsAt)} – {formatTime(a.endsAt)}
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {hasServiceSnapshot(a)
                ? `${a.serviceNameSnapshot} · ${a.serviceDurationMinSnapshot}min · ${formatPrice(a.servicePriceCentsSnapshot, a.serviceCurrencySnapshot)}`
                : "Serviço indisponível no snapshot"}
            </p>
            {a.clientPhone && (
              <p className="text-xs text-[var(--color-muted-foreground)]">{formatPhoneBR(a.clientPhone)}</p>
            )}
          </div>
          {a.status === "CONFIRMED" && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-[var(--color-destructive)] hover:bg-red-500/10"
              onClick={() => onCancel(a.id, a.version)}
              disabled={isCancelling}
            >
              {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
