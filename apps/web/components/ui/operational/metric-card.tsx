import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OperationalMetricCardProps {
  label: string;
  value: ReactNode;
  accent?: boolean;
  footer?: ReactNode;
  className?: string;
}

export function OperationalMetricCard({
  label,
  value,
  accent = false,
  footer,
  className,
}: OperationalMetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] p-4 sm:p-5",
        className,
      )}
    >
      <div
        className={cn(
          "text-3xl font-extrabold tracking-tight text-[var(--color-foreground)] sm:text-5xl",
          accent && "text-[var(--color-metric-positive)]",
        )}
      >
        {value}
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--color-muted-foreground)] sm:text-base">{label}</p>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );
}
