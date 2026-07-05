import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OperationalPageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function OperationalPageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: OperationalPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational)] px-5 py-5 shadow-[var(--shadow-operational-ambient)] sm:px-6 sm:py-6 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="space-y-3">
        {meta ? <div className="flex flex-wrap gap-2">{meta}</div> : null}
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-foreground)]">
            {title}
          </h1>
          <p className="max-w-[65ch] text-sm text-[var(--color-muted-foreground)]">
            {description}
          </p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  );
}
