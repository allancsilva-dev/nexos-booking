"use client";

import { use } from "react";
import { useMeQuery } from "@/hooks/use-auth";
import {
  useWorkingHoursQuery,
  useSetWorkingHoursMutation,
  useBlocksQuery,
  useCreateBlockMutation,
  useDeleteBlockMutation,
} from "@/hooks/use-working-hours";
import { WorkingHoursEditor } from "@/components/professionals/working-hours-editor";
import { BlocksManager } from "@/components/professionals/blocks-manager";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import type { WorkingHoursInput, CreateBlockInput } from "@nexos/shared";

export default function ProfessionalHoursPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: professionalId } = use(params);
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  const {
    data: workingHours,
    isLoading: whLoading,
    isError: whError,
    error: whErr,
    refetch: whRefetch,
  } = useWorkingHoursQuery(activeOrgId, professionalId);

  const {
    data: blocks,
    isLoading: blocksLoading,
    isError: blocksError,
    error: blocksErr,
    refetch: blocksRefetch,
  } = useBlocksQuery(activeOrgId, professionalId);

  const saveHoursMutation = useSetWorkingHoursMutation(
    activeOrgId ?? "",
    professionalId,
  );
  const createBlockMutation = useCreateBlockMutation(
    activeOrgId ?? "",
    professionalId,
  );
  const deleteBlockMutation = useDeleteBlockMutation(
    activeOrgId ?? "",
    professionalId,
  );

  // ── loading ──

  if (!activeOrgId || whLoading) {
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando..." />
      </div>
    );
  }

  // ── error ──

  if (whError) {
    const e =
      whErr instanceof ApiError
        ? { code: whErr.code, message: whErr.message, requestId: whErr.requestId, timestamp: new Date().toISOString() as never }
        : { code: INTERNAL_ERROR, message: "Erro ao carregar", requestId: "", timestamp: new Date().toISOString() as never };
    return (
      <div className="p-6">
        <ErrorDisplay error={e} onRetry={() => whRefetch()} />
      </div>
    );
  }

  const blocksErrorBody =
    blocksError && blocksErr instanceof ApiError
      ? { code: blocksErr.code, message: blocksErr.message, requestId: blocksErr.requestId, timestamp: new Date().toISOString() as never }
      : blocksError
        ? { code: INTERNAL_ERROR, message: "Erro ao carregar bloqueios", requestId: "", timestamp: new Date().toISOString() as never }
        : null;

  // ── data ──

  async function handleSaveHours(input: WorkingHoursInput) {
    await saveHoursMutation.mutateAsync(input);
  }

  async function handleCreateBlock(input: CreateBlockInput) {
    await createBlockMutation.mutateAsync(input);
  }

  async function handleDeleteBlock(blockId: string) {
    await deleteBlockMutation.mutateAsync(blockId);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
          Jornada e bloqueios
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Configure os horários do profissional
        </p>
      </div>

      <WorkingHoursEditor
        data={workingHours}
        isLoading={whLoading}
        isPending={saveHoursMutation.isPending}
        onSave={handleSaveHours}
      />

      {blocksErrorBody ? (
        <ErrorDisplay error={blocksErrorBody} onRetry={() => blocksRefetch()} />
      ) : (
        <BlocksManager
          activeOrgId={activeOrgId!}
          professionalId={professionalId}
          blocks={blocks}
          isLoading={blocksLoading}
          isCreating={createBlockMutation.isPending}
          isDeleting={deleteBlockMutation.isPending}
          onCreate={handleCreateBlock}
          onDelete={handleDeleteBlock}
        />
      )}
    </div>
  );
}
