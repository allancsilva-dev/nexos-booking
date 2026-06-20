"use client";

import { useMeQuery } from "@/hooks/use-auth";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { ApiError } from "@/lib/http-client";
import { UNAUTHENTICATED, INTERNAL_ERROR } from "@/lib/error-codes";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  const { status: bootstrapStatus, user: bootstrapUser } = useAuthBootstrap();
  const { data: meData, isLoading, isError, error, refetch } = useMeQuery();

  const user = meData?.user ?? bootstrapUser;

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
          action={{ label: "Começar", onClick: () => {} }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
          Painel
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Bem-vindo, {user.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <h3 className="text-sm font-medium text-[var(--color-muted-foreground)]">
            Agenda de hoje
          </h3>
          <p className="mt-2 text-2xl font-bold text-[var(--color-foreground)]">
            --
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Em breve
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <h3 className="text-sm font-medium text-[var(--color-muted-foreground)]">
            Agendamentos
          </h3>
          <p className="mt-2 text-2xl font-bold text-[var(--color-foreground)]">
            --
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Em breve
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <h3 className="text-sm font-medium text-[var(--color-muted-foreground)]">
            Profissionais
          </h3>
          <p className="mt-2 text-2xl font-bold text-[var(--color-foreground)]">
            --
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Em breve
          </p>
        </div>
      </div>
    </div>
  );
}
