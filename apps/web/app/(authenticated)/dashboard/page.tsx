"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMeQuery } from "@/hooks/use-auth";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { useOrganizationQuery } from "@/hooks/use-organization";
import { useProfessionalsQuery } from "@/hooks/use-professionals";
import { useAppointmentsQuery } from "@/hooks/use-schedule";
import { useDashboardOverview } from "@/hooks/use-dashboard";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { ApiError } from "@/lib/http-client";
import { UNAUTHENTICATED, INTERNAL_ERROR } from "@/lib/error-codes";
import {
  LayoutDashboard,
  CalendarDays,
  TrendingUp,
  DollarSign,
  UserPlus,
} from "lucide-react";
import { PageChrome } from "@/components/shell/page-chrome";
import { PublicBookingLinkCard } from "@/components/dashboard/public-booking-link-card";
import { OperationalStatCard } from "@/components/ui/operational/stat-card";
import {
  Panel,
  RevenueWeekCard,
  OccupancyCard,
  TopServicesCard,
  TONE_COLORS,
} from "@/components/dashboard/dashboard-panels";
import {
  addDaysToCivilDate,
  getCivilDateInTimeZone,
} from "@/components/schedule/schedule-utils";

// Ocupação ainda sem fonte de capacidade no backend MVP: exibida como exemplo (MockTag).
const MOCK_OCCUPANCY_PCT = [90, 75, 85, 60];

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Variação percentual vs. baseline. "—" quando não há base de comparação. */
function formatTrend(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "novo" : "—";
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { status: bootstrapStatus, user: bootstrapUser } = useAuthBootstrap();
  const { data: meData, isLoading, isError, error, refetch } = useMeQuery();

  const user = meData?.user ?? bootstrapUser;
  const activeOrgId = meData?.activeOrg ?? null;
  const slug =
    meData?.memberships.find((m) => m.organizationId === meData.activeOrg)
      ?.slug ?? null;

  const { data: organization } = useOrganizationQuery(activeOrgId);
  const { data: professionals } = useProfessionalsQuery(activeOrgId);

  const timezone = organization?.timezone ?? "America/Sao_Paulo";
  const today = organization
    ? getCivilDateInTimeZone(new Date(), timezone)
    : null;
  const rangeTo = today ? addDaysToCivilDate(today, 7) : null;

  const appointmentsQuery = useAppointmentsQuery(
    activeOrgId,
    null,
    today,
    rangeTo,
  );

  const proNameById = useMemo(() => {
    const map = new Map<string, string>();
    (professionals ?? []).forEach((p) => map.set(p.id, p.name));
    return map;
  }, [professionals]);

  const { todayCount, nextAppointments } = useMemo(() => {
    const items = (appointmentsQuery.data ?? [])
      .filter((a) => a.status !== "CANCELLED")
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const now = Date.now();
    return {
      todayCount: items.filter(
        (a) => getCivilDateInTimeZone(new Date(a.startsAt), timezone) === today,
      ).length,
      nextAppointments: items
        .filter((a) => new Date(a.startsAt).getTime() >= now)
        .slice(0, 6),
    };
  }, [appointmentsQuery.data, timezone, today]);

  const occupancyRows = useMemo(
    () =>
      (professionals ?? []).slice(0, 4).map((p, i) => ({
        name: p.name,
        pct: MOCK_OCCUPANCY_PCT[i % MOCK_OCCUPANCY_PCT.length],
        color: TONE_COLORS[i % TONE_COLORS.length],
      })),
    [professionals],
  );

  const overviewQuery = useDashboardOverview(activeOrgId);
  const overview = overviewQuery.data;
  const overviewLoading = overviewQuery.isLoading;
  const currency = overview?.currency ?? organization?.currency ?? "BRL";

  const revenueWeek = useMemo(() => {
    if (!overview) return null;
    const max = Math.max(...overview.week.days.map((d) => d.revenueCents), 0);
    return {
      total: formatCurrency(overview.week.totalCents, currency),
      trend: `${formatTrend(overview.week.totalCents, overview.week.previousTotalCents)} vs. semana anterior`,
      rangeLabel: "Semana atual",
      days: overview.week.days.map((d) => ({
        day: d.weekday,
        pct: max > 0 ? (d.revenueCents / max) * 100 : 0,
        today: d.date === today,
      })),
    };
  }, [overview, currency, today]);

  const topServices = useMemo(() => {
    if (!overview) return null;
    const max = Math.max(...overview.topServices.map((s) => s.count), 0);
    return overview.topServices.map((s, i) => ({
      rank: i + 1,
      name: s.name,
      count: s.count,
      pct: max > 0 ? (s.count / max) * 100 : 0,
      color: TONE_COLORS[i % TONE_COLORS.length],
    }));
  }, [overview]);

  const statsLoading = appointmentsQuery.isLoading;

  function formatTime(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  }

  if (bootstrapStatus === "loading" || isLoading) {
    return <LoadingState variant="skeleton" message="Carregando painel..." />;
  }

  if (bootstrapStatus === "error") {
    return (
      <ErrorDisplay
        error={{
          code: UNAUTHENTICATED,
          message: "Sessão expirada. Faça login novamente.",
          requestId: "",
          timestamp: new Date().toISOString() as never,
        }}
        onRetry={() => (window.location.href = "/login")}
      />
    );
  }

  if (isError) {
    const errorBody =
      error instanceof ApiError
        ? {
            code: error.code,
            message: error.message,
            requestId: error.requestId,
            timestamp: new Date().toISOString() as never,
          }
        : {
            code: INTERNAL_ERROR,
            message: "Erro ao carregar dados do usuário",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          };

    return <ErrorDisplay error={errorBody} onRetry={() => refetch()} />;
  }

  if (!user) {
    return (
      <EmptyState
        icon={<LayoutDashboard className="h-8 w-8" />}
        title="Bem-vindo ao Nexos"
        description="Configure sua empresa para começar a usar a agenda."
        action={{
          label: "Começar",
          onClick: () => router.push("/settings/organization"),
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      <PageChrome
        title="Dashboard"
        subtitle={`Bem-vindo, ${user.name.split(" ")[0]}`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <OperationalStatCard
          tone="cyan"
          icon={<CalendarDays className="h-[17px] w-[17px]" />}
          value={statsLoading ? "…" : String(todayCount)}
          label="Atendimentos hoje"
        />
        <OperationalStatCard
          tone="emerald"
          icon={<TrendingUp className="h-[17px] w-[17px]" />}
          value="82%"
          trend="+5%"
          label="Ocupação"
          mock
        />
        <OperationalStatCard
          tone="amber"
          icon={<DollarSign className="h-[17px] w-[17px]" />}
          value={
            overviewLoading || !overview
              ? "…"
              : formatCurrency(overview.today.revenueCents, currency)
          }
          trend={
            overview
              ? formatTrend(
                  overview.today.revenueCents,
                  overview.yesterday.revenueCents,
                )
              : undefined
          }
          label="Faturamento hoje"
        />
        <OperationalStatCard
          tone="violet"
          icon={<UserPlus className="h-[17px] w-[17px]" />}
          value="3"
          trend="hoje"
          label="Novos clientes"
          mock
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <RevenueWeekCard
          {...(revenueWeek ?? {
            total: overviewLoading ? "…" : formatCurrency(0, currency),
            trend: "—",
            rangeLabel: "Semana atual",
            days: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => ({
              day,
              pct: 0,
            })),
          })}
        />
        <OccupancyCard mock rows={occupancyRows} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Próximos atendimentos"
          action={
            <button
              type="button"
              onClick={() => router.push("/schedule")}
              className="text-xs font-bold text-[var(--color-accent-strong)]"
            >
              Ver agenda
            </button>
          }
        >
          {statsLoading ? (
            <div className="mt-4">
              <LoadingState variant="inline" message="Carregando agenda..." />
            </div>
          ) : nextAppointments.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">
              Nenhum atendimento agendado para os próximos dias.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2.5">
              {nextAppointments.map((appt, i) => (
                <div
                  key={appt.id}
                  className="flex items-center gap-3.5 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 py-3"
                >
                  <div
                    className="h-[38px] w-1 shrink-0 rounded-full"
                    style={{ background: TONE_COLORS[i % TONE_COLORS.length] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-[var(--color-foreground)]">
                      {appt.clientName}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
                      {appt.serviceNameSnapshot}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-bold text-[var(--color-foreground)]">
                      {formatTime(appt.startsAt)}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted-foreground)]">
                      {proNameById.get(appt.professionalId) ?? "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <TopServicesCard rows={topServices ?? []} />
      </div>

      <PublicBookingLinkCard slug={slug} />
    </div>
  );
}
