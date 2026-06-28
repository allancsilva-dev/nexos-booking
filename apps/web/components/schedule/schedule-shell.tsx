"use client";

import type { ReactNode } from "react";

interface ScheduleShellProps {
  header: ReactNode;
  grid: ReactNode;
  sidebar: ReactNode;
}

export function ScheduleShell({ header, grid, sidebar }: ScheduleShellProps) {
  return (
    <section className="min-h-screen bg-[var(--color-surface-operational)] text-[var(--color-foreground)]">
      <div className="flex min-h-screen min-w-0 flex-col">
        <div className="border-b border-[var(--color-border-strong)]">{header}</div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">{grid}</div>
          <aside className="hidden w-[320px] shrink-0 border-l border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] xl:block">
            {sidebar}
          </aside>
        </div>
        <aside className="border-t border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] xl:hidden">
          {sidebar}
        </aside>
      </div>
    </section>
  );
}
