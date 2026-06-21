"use client";

import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmationActions } from "@/components/public/confirmation-actions";
import { cn } from "@/lib/utils";

interface ConfirmationScreenProps {
  professionalName: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  cancelToken: string;
  onNewBooking?: () => void;
  className?: string;
}

function formatDateTime(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "America/Sao_Paulo",
      }),
      time: d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

export function ConfirmationScreen({
  professionalName,
  serviceName,
  startsAt,
  endsAt,
  cancelToken,
  onNewBooking,
  className,
}: ConfirmationScreenProps) {
  const { date, time } = formatDateTime(startsAt);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-col items-center gap-3 pt-8">
        <div className="rounded-full bg-green-500/10 p-3">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-foreground)]">
          Agendamento confirmado!
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes do agendamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-muted-foreground)]">Profissional</span>
            <span className="font-medium text-[var(--color-foreground)]">{professionalName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-muted-foreground)]">Servico</span>
            <span className="font-medium text-[var(--color-foreground)]">{serviceName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-muted-foreground)]">Data</span>
            <span className="font-medium text-[var(--color-foreground)]">{date}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-muted-foreground)]">Horario</span>
            <span className="font-medium text-[var(--color-foreground)]">{time}</span>
          </div>
        </CardContent>
      </Card>

      <ConfirmationActions
        serviceName={serviceName}
        professionalName={professionalName}
        startsAt={startsAt}
        endsAt={endsAt}
        cancelToken={cancelToken}
      />

      {onNewBooking && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onNewBooking}>
            Fazer novo agendamento
          </Button>
        </div>
      )}
    </div>
  );
}
