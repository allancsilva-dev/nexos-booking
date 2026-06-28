"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatScheduleHeading } from "@/components/schedule/schedule-utils";

interface ScheduleHeaderProps {
  date: string;
  timeZone: string;
  viewMode: "day" | "week";
  onViewModeChange: (viewMode: "day" | "week") => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenCreate: () => void;
}

export function ScheduleHeader({
  date,
  timeZone,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onOpenCreate,
}: ScheduleHeaderProps) {
  const heading = formatScheduleHeading(date, timeZone, viewMode);

  return (
    <header className="flex flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold capitalize tracking-tight text-[var(--color-foreground)]">
            {heading.title}
          </h1>
          <p className="text-sm font-medium text-[var(--color-muted-foreground)]">
            {heading.subtitle}
          </p>
        </div>

        <div className="flex items-center rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] p-1">
          <Button variant="ghost" size="icon" className="h-10 w-10 text-[var(--color-muted-foreground)] hover:bg-[var(--color-operational-chip)]" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button className="h-10 rounded-xl bg-[var(--color-accent-soft)] px-5 text-[var(--color-accent-strong)] hover:bg-[var(--color-accent-soft)]/80" onClick={onToday}>
            Hoje
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-[var(--color-muted-foreground)] hover:bg-[var(--color-operational-chip)]" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] p-1">
          <button
            type="button"
            className={cn(
              "rounded-xl px-5 py-2 text-base font-semibold transition-colors",
              viewMode === "day"
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                : "text-[var(--color-muted-foreground)]",
            )}
            onClick={() => onViewModeChange("day")}
          >
            Dia
          </button>
          <button
            type="button"
            className={cn(
              "rounded-xl px-5 py-2 text-base font-semibold transition-colors",
              viewMode === "week"
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                : "text-[var(--color-muted-foreground)]",
            )}
            onClick={() => onViewModeChange("week")}
          >
            Semana
          </button>
        </div>

        <Button
          size="lg"
          className="h-12 rounded-2xl bg-[var(--color-primary)] px-6 text-base font-semibold text-[var(--color-primary-foreground)] hover:bg-[var(--color-accent)]"
          onClick={onOpenCreate}
        >
          <Plus className="h-5 w-5" />
          Agendar
        </Button>
      </div>
    </header>
  );
}
