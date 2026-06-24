"use client";

import type { AvailabilityResponse, AvailabilitySlot } from "@nexos/shared";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { Calendar } from "lucide-react";

interface Props {
  data: AvailabilityResponse | undefined;
  isLoading: boolean;
  selectedSlot: AvailabilitySlot | null;
  onSelectSlot: (slot: AvailabilitySlot) => void;
}

function formatTime(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
  } catch {
    return iso.slice(11, 16);
  }
}

export function SlotPicker({ data, isLoading, selectedSlot, onSelectSlot }: Props) {
  if (isLoading) {
    return <LoadingState variant="inline" message="Buscando horários..." />;
  }

  if (!data || data.days.length === 0 || data.days.every((d) => d.slots.length === 0)) {
    return (
      <EmptyState
        icon={<Calendar className="h-8 w-8" />}
        title="Nenhum horário disponível"
        description="Tente outra data ou profissional."
      />
    );
  }

  return (
    <div className="space-y-4">
      {data.days.map((day) => (
        <div key={day.date}>
          <p className="text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
            {new Date(day.date + "T00:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
            })}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {day.slots.map((slot) => {
              const key = slot.startsAt;
              const selected = selectedSlot?.startsAt === key;
              return (
                <button
                  key={key}
                  onClick={() => onSelectSlot(slot)}
                  className={`rounded-[var(--radius-control)] border px-2 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]/50"
                  }`}
                >
                  {formatTime(slot.startsAt, data.timezone)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
