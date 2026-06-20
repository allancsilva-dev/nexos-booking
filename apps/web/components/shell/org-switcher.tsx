"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useSwitchOrgMutation } from "@/hooks/use-auth";
import { apiFetch, ApiError } from "@/lib/http-client";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { Check, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTERNAL_ERROR } from "@/lib/error-codes";

interface OrgItem {
  id: string;
  name: string;
  slug: string;
}

export function OrgSwitcher() {
  const savedOrgId = useAuthStore((s) => s.savedOrgId);
  const switchOrgMutation = useSwitchOrgMutation();

  const {
    data: orgs,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["organizations", "me"],
    queryFn: () => apiFetch<OrgItem[]>("/api/v1/organizations/me"),
  });

  if (isLoading) {
    return <LoadingState variant="inline" message="Carregando empresas..." />;
  }

  if (isError) {
    const errorBody =
      error instanceof ApiError
        ? { code: error.code, message: error.message, requestId: error.requestId, timestamp: new Date().toISOString() as never }
        : { code: INTERNAL_ERROR, message: "Erro ao carregar empresas", requestId: "", timestamp: new Date().toISOString() as never };

    return (
      <div className="py-2">
        <ErrorDisplay error={errorBody} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!orgs || orgs.length === 0) {
    return (
      <div className="px-2 py-3 text-center">
        <Building2 className="mx-auto h-5 w-5 text-[var(--color-muted-foreground)]" />
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          Nenhuma empresa encontrada
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <p className="px-2 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">
        Empresas
      </p>
      {orgs.map((org) => {
        const isActive = org.id === savedOrgId;
        return (
          <button
            key={org.id}
            onClick={() => {
              if (!isActive) {
                switchOrgMutation.mutate({ organizationId: org.id });
              }
            }}
            disabled={switchOrgMutation.isPending}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--radius-nav)] px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--color-muted)]",
              isActive && "bg-[var(--color-primary)]/10"
            )}
          >
            <Building2
              className={cn(
                "h-4 w-4 shrink-0",
                isActive
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--color-muted-foreground)]"
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="truncate text-[var(--color-foreground)] text-xs">
                {org.name}
              </p>
              <p className="truncate text-[10px] text-[var(--color-muted-foreground)]">
                {org.slug}
              </p>
            </div>
            {isActive && (
              <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            )}
            {switchOrgMutation.isPending && switchOrgMutation.variables?.organizationId === org.id && (
              <LoadingState variant="inline" />
            )}
          </button>
        );
      })}
    </div>
  );
}
