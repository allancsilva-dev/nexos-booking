"use client";

import type { ReactNode } from "react";

interface ScheduleShellProps {
  header: ReactNode;
  grid: ReactNode;
  sidebar: ReactNode;
}

export function ScheduleShell({ header, grid, sidebar }: ScheduleShellProps) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] text-[var(--color-foreground)]">
      <div className="flex min-w-0 flex-col">
        <div className="border-b border-[var(--color-border)]">{header}</div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">{grid}</div>
          <aside className="hidden w-[320px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] xl:block">
            {sidebar}
          </aside>
        </div>
        <aside className="border-t border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] xl:hidden">
          {sidebar}
        </aside>
      </div>
    </section>
  );
}
