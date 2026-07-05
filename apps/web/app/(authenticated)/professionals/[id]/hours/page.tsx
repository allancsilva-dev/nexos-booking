"use client";

import { useParams } from "next/navigation";
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
import { OperationalPageHeader } from "@/components/ui/operational/page-header";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import type { WorkingHoursInput, CreateBlockInput } from "@nexos/shared";

function toErrorDisplayBody(error: unknown, fallbackMessage: string) {
  return error instanceof ApiError
    ? {
        code: error.code,
        message: error.message,
        requestId: error.requestId,
        timestamp: new Date().toISOString() as never,
      }
    : {
        code: INTERNAL_ERROR,
        message: fallbackMessage,
        requestId: "",
        timestamp: new Date().toISOString() as never,
      };
}

export default function ProfessionalHoursPage() {
  const params = useParams<{ id: string }>();
  const professionalId = params.id;
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
    return (
      <div className="p-6">
        <ErrorDisplay
          error={toErrorDisplayBody(whErr, "Erro ao carregar")}
          onRetry={() => whRefetch()}
        />
      </div>
    );
  }

  const blocksErrorBody =
    blocksError
      ? toErrorDisplayBody(blocksErr, "Erro ao carregar bloqueios")
        : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <OperationalPageHeader
        title="Jornada"
        description="Horários de atendimento da semana e ausências do profissional."
      />

      <WorkingHoursEditor
        data={workingHours}
        isLoading={whLoading}
        isPending={saveHoursMutation.isPending}
        onSave={async (input: WorkingHoursInput) => {
          await saveHoursMutation.mutateAsync(input);
        }}
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
          onCreate={async (input: CreateBlockInput) => {
            await createBlockMutation.mutateAsync(input);
          }}
          onDelete={async (blockId: string) => {
            await deleteBlockMutation.mutateAsync(blockId);
          }}
        />
      )}
    </div>
  );
}
