import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MockTag } from "@/components/dashboard/dashboard-panels";

interface StatCardProps {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  trend?: string;
  /** tone of the icon chip + trend text */
  tone?: "cyan" | "emerald" | "amber" | "violet" | "rose";
  /** marks the value as illustrative until the backend exposes the metric */
  mock?: boolean;
  className?: string;
}

const TONES: Record<NonNullable<StatCardProps["tone"]>, { chip: string; fg: string }> = {
  cyan: { chip: "bg-[var(--cat-1-bg)]", fg: "text-[var(--cat-1-ink)]" },
  emerald: { chip: "bg-[var(--cat-2-bg)]", fg: "text-[var(--cat-2-ink)]" },
  amber: { chip: "bg-[var(--cat-3-bg)]", fg: "text-[var(--cat-3-ink)]" },
  rose: { chip: "bg-[var(--cat-4-bg)]", fg: "text-[var(--cat-4-ink)]" },
  violet: { chip: "bg-[var(--cat-5-bg)]", fg: "text-[var(--cat-5-ink)]" },
};

export function OperationalStatCard({
  icon,
  value,
  label,
  trend,
  tone = "cyan",
  mock,
  className,
}: StatCardProps) {
  const t = TONES[tone];
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-[18px]",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("flex h-[34px] w-[34px] items-center justify-center rounded-[10px]", t.chip, t.fg)}>
          {icon}
        </div>
        <div className="flex items-center gap-1.5">
          {trend ? (
            <span className="text-[11.5px] font-bold text-[var(--color-metric-positive)]">{trend}</span>
          ) : null}
          {mock ? <MockTag /> : null}
        </div>
      </div>
      <div className="mt-3.5 text-[27px] font-extrabold tracking-[-0.02em] text-[var(--color-foreground)]">
        {value}
      </div>
      <div className="mt-0.5 text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
        {label}
      </div>
    </div>
  );
}
