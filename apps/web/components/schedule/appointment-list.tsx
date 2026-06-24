"use client";

import { Trash2, Loader2 } from "lucide-react";
import type { AppointmentListItemDTO } from "@nexos/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";

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

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
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
    <div className="space-y-2">
      {appointments.map((a) => (
        <Card key={a.id}>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-[var(--color-foreground)] truncate">
                  {a.clientName}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                  {STATUS_LABELS[a.status] ?? a.status}
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                {formatTime(a.startsAt)} – {formatTime(a.endsAt)}
              </p>
              {/* Snapshot do serviço — NÃO busca serviço atual */}
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {a.serviceNameSnapshot} · {a.serviceDurationMinSnapshot}min ·{" "}
                {formatPrice(a.servicePriceCentsSnapshot, a.serviceCurrencySnapshot)}
              </p>
              {a.clientPhone && (
                <p className="text-xs text-[var(--color-muted-foreground)]">{a.clientPhone}</p>
              )}
            </div>
            {a.status === "CONFIRMED" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--color-destructive)] shrink-0"
                onClick={() => onCancel(a.id, a.version)}
                disabled={isCancelling}
              >
                {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
