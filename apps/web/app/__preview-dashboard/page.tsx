// TEMP preview route — render dashboard panels with mock data, no auth. Delete after screenshot.
import { CalendarDays, TrendingUp, DollarSign, UserPlus } from "lucide-react";
import { OperationalStatCard } from "@/components/ui/operational/stat-card";
import {
  Panel,
  RevenueWeekCard,
  OccupancyCard,
  TopServicesCard,
  TONE_COLORS,
} from "@/components/dashboard/dashboard-panels";

const REVENUE = {
  total: "R$ 8.940",
  trend: "+12% vs. semana anterior",
  rangeLabel: "Semana atual",
  days: [
    { day: "Seg", pct: 60 },
    { day: "Ter", pct: 80 },
    { day: "Qua", pct: 95, today: true },
    { day: "Qui", pct: 70 },
    { day: "Sex", pct: 90 },
    { day: "Sáb", pct: 100 },
    { day: "Dom", pct: 28 },
  ],
};
const OCC = [
  { name: "Bruno Alves", pct: 90, color: TONE_COLORS[0] },
  { name: "Carla Dias", pct: 75, color: TONE_COLORS[1] },
  { name: "Diego Souza", pct: 85, color: TONE_COLORS[2] },
  { name: "Marina Reis", pct: 60, color: TONE_COLORS[3] },
];
const SVCS = [
  { rank: 1, name: "Corte + Barba", count: 42, pct: 100, color: TONE_COLORS[0] },
  { rank: 2, name: "Corte", count: 38, pct: 90, color: TONE_COLORS[0] },
  { rank: 3, name: "Coloração", count: 21, pct: 50, color: TONE_COLORS[1] },
  { rank: 4, name: "Barba", count: 18, pct: 43, color: TONE_COLORS[4] },
];
const NEXT = [
  { id: "1", who: "Tiago Nunes", svc: "Barba", time: "13:30", pro: "Bruno" },
  { id: "2", who: "Caio Ribeiro", svc: "Corte + Barba", time: "14:00", pro: "Diego" },
  { id: "3", who: "Lia Reis", svc: "Hidratação", time: "14:30", pro: "Carla" },
  { id: "4", who: "Paula Santos", svc: "Coloração", time: "15:00", pro: "Marina" },
];

export default function PreviewDashboard() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] p-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
        <h1 className="text-2xl font-extrabold text-[var(--color-foreground)]">Dashboard</h1>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <OperationalStatCard tone="cyan" icon={<CalendarDays className="h-[17px] w-[17px]" />} value="14" label="Atendimentos hoje" />
          <OperationalStatCard tone="emerald" icon={<TrendingUp className="h-[17px] w-[17px]" />} value="82%" trend="+5%" label="Ocupação" mock />
          <OperationalStatCard tone="amber" icon={<DollarSign className="h-[17px] w-[17px]" />} value="R$ 1.480" trend="+12%" label="Faturamento hoje" mock />
          <OperationalStatCard tone="violet" icon={<UserPlus className="h-[17px] w-[17px]" />} value="3" trend="hoje" label="Novos clientes" mock />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
          <RevenueWeekCard mock {...REVENUE} />
          <OccupancyCard mock rows={OCC} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Próximos atendimentos"
            action={<span className="text-xs font-bold text-[var(--color-accent-strong)]">Ver agenda</span>}
          >
            <div className="mt-4 flex flex-col gap-2.5">
              {NEXT.map((a, i) => (
                <div key={a.id} className="flex items-center gap-3.5 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 py-3">
                  <div className="h-[38px] w-1 shrink-0 rounded-full" style={{ background: TONE_COLORS[i % TONE_COLORS.length] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-[var(--color-foreground)]">{a.who}</div>
                    <div className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">{a.svc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold text-[var(--color-foreground)]">{a.time}</div>
                    <div className="text-[11px] text-[var(--color-muted-foreground)]">{a.pro}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <TopServicesCard mock rows={SVCS} />
        </div>
      </div>
    </div>
  );
}
