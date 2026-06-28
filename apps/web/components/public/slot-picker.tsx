"use client";

import { useEffect, useMemo, useState } from "react";
import type { AvailabilityDay } from "@nexos/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SlotPickerProps {
  days: AvailabilityDay[];
  timezone: string;
  selectedSlot: { date: string; startsAt: string; endsAt: string } | null;
  onSelectSlot: (slot: { date: string; startsAt: string; endsAt: string }) => void;
  loading?: boolean;
  className?: string;
}

type CalendarSlot = {
  startsAt: string;
  endsAt: string;
};

function parseCivilDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
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

function formatSelectedDate(dateStr: string, tz: string): string {
  try {
    const { year, month, day } = parseCivilDate(dateStr);
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      timeZone: tz,
    }).format(new Date(year, month - 1, day));
  } catch {
    return dateStr;
  }
}

function buildMonthCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);

    return {
      date: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(
        current.getDate()
      ).padStart(2, "0")}`,
      dayNumber: current.getDate(),
      inMonth: current.getMonth() === month - 1,
    };
  });
}

export function SlotPicker({
  days,
  timezone,
  selectedSlot,
  onSelectSlot,
  loading,
  className,
}: SlotPickerProps) {
  const daysWithSlots = useMemo(() => days.filter((day) => day.slots.length > 0), [days]);

  const slotsByDate = useMemo(
    () =>
      new Map<string, CalendarSlot[]>(
        daysWithSlots.map((day) => [day.date, day.slots.map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt }))])
      ),
    [daysWithSlots]
  );

  const firstAvailableDate = daysWithSlots[0]?.date ?? null;
  const [visibleMonth, setVisibleMonth] = useState<string>(() =>
    getMonthKey(firstAvailableDate ?? new Date().toISOString().slice(0, 7) + "-01")
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(selectedSlot?.date ?? firstAvailableDate);

  useEffect(() => {
    if (selectedSlot?.date) {
      setSelectedDate(selectedSlot.date);
      setVisibleMonth(getMonthKey(selectedSlot.date));
      return;
    }

    if (selectedDate && slotsByDate.has(selectedDate)) {
      return;
    }

    setSelectedDate(firstAvailableDate);
    if (firstAvailableDate) {
      setVisibleMonth(getMonthKey(firstAvailableDate));
    }
  }, [firstAvailableDate, selectedDate, selectedSlot?.date, slotsByDate]);

  const selectedDaySlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : [];
  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);

  if (days.length === 0 && !loading) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
        Nenhum horario disponivel no periodo.
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold capitalize text-[var(--color-foreground)]">
            {getMonthLabel(visibleMonth)}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
              aria-label="Proximo mes"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map((label) => (
            <span key={label} className="py-0">
              {label}
            </span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-0.5" role="grid" aria-label="Calendario de disponibilidade">
          {monthCells.map((cell) => {
            const isSelected = selectedDate === cell.date;
            const hasSlots = slotsByDate.has(cell.date);

            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                disabled={!hasSlots || loading}
                aria-pressed={isSelected}
                onClick={() => setSelectedDate(cell.date)}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-[6px] border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] sm:h-10",
                  hasSlots && isSelected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : hasSlots
                      ? "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:border-[var(--color-primary)] hover:bg-[var(--color-muted)]"
                      : "border-transparent bg-transparent text-[var(--color-muted-foreground)] opacity-45",
                  !cell.inMonth && "text-[var(--color-muted-foreground)]"
                )}
              >
                {cell.dayNumber}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              Escolha o horario
            </h3>
            <p className="text-xs capitalize text-[var(--color-muted-foreground)]">
              {selectedDate
                ? formatSelectedDate(selectedDate, timezone)
                : "Escolha um dia no calendario para ver os horarios."}
            </p>
          </div>
          <span className="rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">
            {selectedDaySlots.length} disponiveis
          </span>
        </div>

        {selectedDaySlots.length === 0 ? (
          <p className="py-6 text-sm text-[var(--color-muted-foreground)]">
            Escolha um dia destacado para ver horarios disponiveis.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {selectedDaySlots.map((slot) => {
              const key = `${selectedDate}|${slot.startsAt}`;
              const isSelected = selectedSlot?.date === selectedDate && selectedSlot.startsAt === slot.startsAt;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    onSelectSlot({
                      date: selectedDate!,
                      startsAt: slot.startsAt,
                      endsAt: slot.endsAt,
                    })
                  }
                  className={cn(
                    "rounded-[var(--radius-control)] border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                    isSelected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                      : "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:border-[var(--color-muted-foreground)]"
                  )}
                >
                  {formatTime(slot.startsAt, timezone)}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
