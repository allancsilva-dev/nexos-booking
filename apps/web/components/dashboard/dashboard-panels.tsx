import type { ReactNode } from "react";

/** Accent palette shared with the dashboard charts (reads on light + dark). */
export const TONE_COLORS = ["#22d3ee", "#a78bfa", "#34d399", "#fb7185", "#fbbf24"];

/** Marks data that is illustrative until the backend exposes the metric. */
export function MockTag() {
  return (
    <span className="rounded-full bg-[var(--color-operational-chip)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
      exemplo
    </span>
  );
}

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  mock?: boolean;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, action, mock, children, className }: PanelProps) {
  return (
    <section
      className={
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-5 " +
        (className ?? "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-[var(--color-foreground)]">{title}</h2>
            {mock ? <MockTag /> : null}
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-xs font-semibold text-[var(--color-muted-foreground)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface RevenueDay {
  day: string;
  /** 0–100 relative height */
  pct: number;
  today?: boolean;
}

interface RevenueWeekCardProps {
  total: string;
  trend: string;
  rangeLabel: string;
  days: RevenueDay[];
  mock?: boolean;
}

export function RevenueWeekCard({ total, trend, rangeLabel, days, mock }: RevenueWeekCardProps) {
  return (
    <Panel
      title="Faturamento da semana"
      subtitle={rangeLabel}
      mock={mock}
      action={
        <div className="text-right">
          <div className="text-xl font-extrabold tracking-[-0.02em] text-[var(--color-accent-strong)]">
            {total}
          </div>
          <div className="text-[11.5px] font-bold text-[var(--color-metric-positive)]">{trend}</div>
        </div>
      }
    >
      <div className="relative mt-5 flex h-[170px] items-end gap-3.5 pb-6">
        {days.map((d) => (
          <div
            key={d.day}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <div
              className="w-full max-w-[34px] rounded-t-[7px] rounded-b-[4px]"
              style={{
                height: `${Math.max(d.pct, 4)}%`,
                background: d.today
                  ? "linear-gradient(180deg,#22d3ee,#0891b2)"
                  : "var(--color-operational-line)",
              }}
            />
            <span className="absolute bottom-0 text-[11px] font-semibold text-[var(--color-muted-foreground)]">
              {d.day}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

interface OccupancyRow {
  name: string;
  pct: number;
  color: string;
}

export function OccupancyCard({ rows, mock }: { rows: OccupancyRow[]; mock?: boolean }) {
  return (
    <Panel title="Ocupação por profissional" mock={mock}>
      <div className="mt-[18px] flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.name}>
            <div className="mb-[7px] flex items-center justify-between">
              <span className="flex items-center gap-2.5 text-[13px] font-semibold text-[var(--color-foreground)]">
                <span
                  className="h-[9px] w-[9px] rounded-[3px]"
                  style={{ background: r.color }}
                />
                {r.name}
              </span>
              <span className="text-[12.5px] font-bold text-[var(--color-muted-foreground)]">
                {r.pct}%
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-[4px] bg-[var(--color-operational-line)]">
              <div
                className="h-full rounded-[4px]"
                style={{ width: `${r.pct}%`, background: r.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

interface TopServiceRow {
  rank: number;
  name: string;
  count: number;
  pct: number;
  color: string;
}

export function TopServicesCard({ rows, mock }: { rows: TopServiceRow[]; mock?: boolean }) {
  return (
    <Panel title="Serviços mais agendados" mock={mock}>
      <div className="mt-[18px] flex flex-col gap-[15px]">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3.5">
            <span className="w-[18px] text-[13px] font-extrabold text-[var(--color-muted-foreground)]">
              {r.rank}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">
                  {r.name}
                </span>
                <span className="text-[12.5px] font-bold text-[var(--color-muted-foreground)]">
                  {r.count}
                </span>
              </div>
              <div className="h-[6px] overflow-hidden rounded-[4px] bg-[var(--color-operational-line)]">
                <div
                  className="h-full rounded-[4px]"
                  style={{ width: `${r.pct}%`, background: r.color }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
