"use client";

import { useMeQuery } from "@/hooks/use-auth";
import {
  useOrganizationQuery,
  useUpdateOrganizationMutation,
} from "@/hooks/use-organization";
import { OrgSettingsForm } from "@/components/settings/org-settings-form";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import type { UpdateOrgInput } from "@/lib/org-schemas";

export default function OrgSettingsPage() {
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  const {
    data: org,
    isLoading,
    isError,
    error,
    refetch,
  } = useOrganizationQuery(activeOrgId);

  const updateMutation = useUpdateOrganizationMutation(activeOrgId ?? "");

  async function handleUpdate(data: UpdateOrgInput) {
    await updateMutation.mutateAsync(data);
  }

  // ---- loading ----

  if (!activeOrgId || isLoading) {
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando configurações..." />
      </div>
    );
  }

  // ---- error ----

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
            message: "Erro ao carregar configurações",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          };
    return (
      <div className="p-6">
        <ErrorDisplay error={errorBody} onRetry={() => refetch()} />
      </div>
    );
  }

  // ---- data ----

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Gerencie os dados da sua empresa
        </p>
      </div>

      {org && (
        <OrgSettingsForm
          org={org}
          isPending={updateMutation.isPending}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}
