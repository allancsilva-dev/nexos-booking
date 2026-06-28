"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMeQuery } from "@/hooks/use-auth";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { useOrganizationQuery } from "@/hooks/use-organization";
import { useProfessionalsQuery } from "@/hooks/use-professionals";
import { useAppointmentsQuery } from "@/hooks/use-schedule";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { ApiError } from "@/lib/http-client";
import { UNAUTHENTICATED, INTERNAL_ERROR } from "@/lib/error-codes";
import { LayoutDashboard } from "lucide-react";
import { PublicBookingLinkCard } from "@/components/dashboard/public-booking-link-card";
import { OperationalPageHeader } from "@/components/ui/operational/page-header";
import { OperationalMetricCard } from "@/components/ui/operational/metric-card";
import {
  addDaysToCivilDate,
  getCivilDateInTimeZone,
} from "@/components/schedule/schedule-utils";

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
  // Janela: de hoje até +7 dias (to é limite exclusivo, como na agenda).
  const rangeTo = today ? addDaysToCivilDate(today, 7) : null;

  const appointmentsQuery = useAppointmentsQuery(
    activeOrgId,
    null,
    today,
    rangeTo,
  );

  const { todayCount, upcomingCount } = useMemo(() => {
    const items = (appointmentsQuery.data ?? []).filter(
      (a) => a.status !== "CANCELLED",
    );
    return {
      upcomingCount: items.length,
      todayCount: items.filter(
        (a) => getCivilDateInTimeZone(new Date(a.startsAt), timezone) === today,
      ).length,
    };
  }, [appointmentsQuery.data, timezone, today]);

  const statsLoading = appointmentsQuery.isLoading;

  if (bootstrapStatus === "loading" || isLoading) {
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando painel..." />
      </div>
    );
  }

  if (bootstrapStatus === "error") {
    return (
      <div className="p-6">
        <ErrorDisplay
          error={{
            code: UNAUTHENTICATED,
            message: "Sessão expirada. Faça login novamente.",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          }}
          onRetry={() => window.location.href = "/login"}
        />
      </div>
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

    return (
      <div className="p-6">
        <ErrorDisplay error={errorBody} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<LayoutDashboard className="h-8 w-8" />}
          title="Bem-vindo ao Nexos"
          description="Configure sua empresa para começar a usar a agenda."
          action={{
            label: "Começar",
            onClick: () => router.push("/settings/organization"),
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <OperationalPageHeader
        title="Painel"
        description={`Bem-vindo, ${user.name}. Acompanhe volume da agenda, equipe ativa e acesso ao link público sem sair da operação.`}
        meta={
          <span className="inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
            Visão geral
          </span>
        }
      />

      <PublicBookingLinkCard slug={slug} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <OperationalMetricCard
          label={todayCount === 1 ? "agendamento hoje" : "agendamentos hoje"}
          value={statsLoading ? "…" : String(todayCount)}
          accent
        />
        <OperationalMetricCard
          label="hoje + próximos 7 dias"
          value={statsLoading ? "…" : String(upcomingCount)}
        />
        <OperationalMetricCard
          label={
            professionals?.length === 1 ? "profissional ativo" : "profissionais ativos"
          }
          value={professionals ? String(professionals.length) : "…"}
        />
      </div>
    </div>
  );
}
