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
        "rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] p-5",
        className,
      )}
    >
      <div
        className={cn(
          "text-5xl font-extrabold tracking-tight text-[var(--color-foreground)]",
          accent && "text-[var(--color-metric-positive)]",
        )}
      >
        {value}
      </div>
      <p className="mt-2 text-base font-medium text-[var(--color-muted-foreground)]">{label}</p>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );
}
