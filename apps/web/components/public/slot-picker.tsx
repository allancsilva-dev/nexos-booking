"use client";

import { useCallback, useRef, useEffect } from "react";
import type { AvailabilityDay } from "@nexos/shared";
import { cn } from "@/lib/utils";

interface SlotPickerProps {
  days: AvailabilityDay[];
  timezone: string;
  selectedSlot: { date: string; startsAt: string; endsAt: string } | null;
  onSelectSlot: (slot: { date: string; startsAt: string; endsAt: string }) => void;
  loading?: boolean;
  className?: string;
}

function formatTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });
  } catch {
    return iso;
  }
}

function formatDateLabel(dateStr: string, tz: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: tz,
    });
  } catch {
    return dateStr;
  }
}

export function SlotPicker({
  days,
  timezone,
  selectedSlot,
  onSelectSlot,
  loading,
  className,
}: SlotPickerProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const allSlots = days.flatMap((day) =>
    day.slots.map((slot) => ({
      date: day.date,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      key: `${day.date}|${slot.startsAt}`,
    }))
  );

  const selectedKey = selectedSlot
    ? `${selectedSlot.date}|${selectedSlot.startsAt}`
    : null;

  useEffect(() => {
    if (selectedKey) {
      const btn = buttonRefs.current.get(selectedKey);
      btn?.focus();
    }
  }, [selectedKey]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const cols = 3;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          {
            const next = Math.min(index + 1, allSlots.length - 1);
            if (next !== index) {
              buttonRefs.current.get(allSlots[next]?.key ?? "")?.focus();
            }
          }
          return;
        case "ArrowLeft":
          e.preventDefault();
          {
            const next = Math.max(index - 1, 0);
            if (next !== index) {
              buttonRefs.current.get(allSlots[next]?.key ?? "")?.focus();
            }
          }
          return;
        case "ArrowDown":
          e.preventDefault();
          {
            const next = Math.min(index + cols, allSlots.length - 1);
            if (next !== index) {
              buttonRefs.current.get(allSlots[next]?.key ?? "")?.focus();
            }
          }
          return;
        case "ArrowUp":
          e.preventDefault();
          {
            const next = Math.max(index - cols, 0);
            if (next !== index) {
              buttonRefs.current.get(allSlots[next]?.key ?? "")?.focus();
            }
          }
          return;
        case "Escape":
          (e.currentTarget as HTMLElement)?.blur();
          return;
        default:
          return;
      }
    },
    [allSlots]
  );

  if (days.length === 0 && !loading) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)] text-center py-8">
        Nenhum horario disponivel no periodo.
      </p>
    );
  }

  return (
    <div className={cn("space-y-6", className)} ref={gridRef} role="grid" aria-label="Horarios disponiveis">
      {days.map((day) => (
        <div key={day.date} role="rowgroup" aria-label={formatDateLabel(day.date, timezone)}>
          <h3 className="text-sm font-medium text-[var(--color-muted-foreground)] mb-2">
            {formatDateLabel(day.date, timezone)}
          </h3>
          {day.slots.length === 0 ? (
            <p className="text-xs text-[var(--color-muted-foreground)] pl-1">
              Sem horarios neste dia.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2" role="row">
              {day.slots.map((slot) => {
                const key = `${day.date}|${slot.startsAt}`;
                const isSelected = selectedKey === key;
                const globalIndex = allSlots.findIndex((s) => s.key === key);

                return (
                  <button
                    key={key}
                    ref={(el) => {
                      if (el) buttonRefs.current.set(key, el);
                      else buttonRefs.current.delete(key);
                    }}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-label={`${formatTime(slot.startsAt, timezone)} as ${formatTime(slot.endsAt, timezone)}`}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                      isSelected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                        : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:border-[var(--color-muted-foreground)]"
                    )}
                    disabled={loading}
                    onClick={() =>
                      onSelectSlot({
                        date: day.date,
                        startsAt: slot.startsAt,
                        endsAt: slot.endsAt,
                      })
                    }
                    onKeyDown={(e) => handleKeyDown(e, globalIndex)}
                  >
                    {formatTime(slot.startsAt, timezone)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
