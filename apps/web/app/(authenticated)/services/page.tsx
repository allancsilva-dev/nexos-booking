"use client";

import { useMemo, useState } from "react";
import { useMeQuery } from "@/hooks/use-auth";
import {
  useServicesQuery,
  useCreateServiceMutation,
  useUpdateServiceMutation,
  useServiceProfessionalCounts,
} from "@/hooks/use-services";
import { useProfessionalsQuery } from "@/hooks/use-professionals";
import { ServiceForm } from "@/components/services/service-form";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { PageChrome } from "@/components/shell/page-chrome";
import { ActionButton } from "@/components/ui/operational/action-button";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { toast } from "sonner";
import type { CreateServiceInput, UpdateServiceInput } from "@/lib/service-schemas";
import { formatGlobalError } from "@/lib/error-handler";
import { Plus, Pencil, Scissors, Clock, Users, Timer } from "lucide-react";

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency,
  }).format(cents / 100);
}

export default function ServicesPage() {
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  const {
    data: services,
    isLoading,
    isError,
    error,
    refetch,
  } = useServicesQuery(activeOrgId);

  const { data: professionals } = useProfessionalsQuery(activeOrgId);
  const proCounts = useServiceProfessionalCounts(activeOrgId, professionals);

  const createMutation = useCreateServiceMutation(activeOrgId ?? "");
  const updateMutation = useUpdateServiceMutation(activeOrgId ?? "");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const chromeAction = useMemo(
    () =>
      !showCreateForm && !editingId ? (
        <ActionButton
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowCreateForm(true)}
        >
          Novo serviço
        </ActionButton>
      ) : null,
    [showCreateForm, editingId],
  );

  // ---- handlers ----

  async function handleCreate(data: CreateServiceInput) {
    await createMutation.mutateAsync(data);
    setShowCreateForm(false);
  }

  async function handleUpdate(data: UpdateServiceInput) {
    if (!editingId) return;
    await updateMutation.mutateAsync({ id: editingId, input: data });
    setEditingId(null);
  }

  async function handleToggleActive(serviceId: string, active: boolean) {
    try {
      await updateMutation.mutateAsync({
        id: serviceId,
        input: { active: !active },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, {
          description: `${code} — Ref: ${requestId || "N/A"}`,
        });
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    }
  }

  // ---- loading ----

  if (!activeOrgId || isLoading) {
    return <LoadingState variant="skeleton" message="Carregando serviços..." />;
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
            message: "Erro ao carregar serviços",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          };
    return <ErrorDisplay error={errorBody} onRetry={() => refetch()} />;
  }

  // ---- empty ----

  if (!services || services.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1180px]">
        <PageChrome title="Serviços" subtitle="Catálogo de serviços e preços" />
        {showCreateForm ? (
          <ServiceForm
            mode="create"
            isPending={createMutation.isPending}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
        ) : (
          <EmptyState
            icon={<Scissors className="h-8 w-8" />}
            title="Nenhum serviço"
            description="Cadastre o primeiro serviço para começar."
            action={{
              label: "Criar serviço",
              onClick: () => setShowCreateForm(true),
            }}
          />
        )}
      </div>
    );
  }

  // ---- data ----

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <PageChrome
        title="Serviços"
        subtitle="Catálogo de serviços e preços"
        action={chromeAction}
      />

      {showCreateForm && (
        <div className="mb-4">
          <ServiceForm
            mode="create"
            isPending={createMutation.isPending}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--color-accent-soft)] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--color-accent-strong)]">
          Todos os serviços
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-border)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
          Categorias
          <span className="rounded-full bg-[var(--color-operational-chip)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Em breve
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {services.map((svc) =>
          editingId === svc.id ? (
            <div key={svc.id} className="lg:col-span-2">
              <ServiceForm
                mode="edit"
                defaultValues={{
                  name: svc.name,
                  durationMin: svc.durationMin,
                  bufferAfterMin: svc.bufferAfterMin,
                  priceCents: svc.priceCents,
                  currency: svc.currency,
                  active: svc.active,
                }}
                isPending={updateMutation.isPending}
                onSubmit={handleUpdate}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div
              key={svc.id}
              className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-[18px]"
            >
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px] bg-[var(--cat-1-bg)] text-[var(--cat-1-ink)]">
                <Scissors className="h-[21px] w-[21px]" />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[14.5px] font-bold text-[var(--color-foreground)]">
                  {svc.name}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {svc.durationMin} min
                  </span>
                  <span className="font-bold text-[var(--color-foreground)]">
                    {formatPrice(svc.priceCents, svc.currency)}
                  </span>
                  {svc.bufferAfterMin && svc.bufferAfterMin > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" />+{svc.bufferAfterMin} min
                    </span>
                  ) : null}
                  {proCounts.get(svc.id) ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {proCounts.get(svc.id)}{" "}
                      {proCounts.get(svc.id) === 1
                        ? "profissional"
                        : "profissionais"}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleActive(svc.id, svc.active)}
                  disabled={updateMutation.isPending}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    svc.active
                      ? "bg-[var(--cat-2-bg)] text-[var(--cat-2-ink)]"
                      : "bg-[var(--color-operational-chip)] text-[var(--color-muted-foreground)]"
                  }`}
                  title={svc.active ? "Clique para desativar" : "Clique para ativar"}
                >
                  {svc.active ? "Ativo" : "Inativo"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingId(svc.id);
                  }}
                  disabled={updateMutation.isPending}
                  className="text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
                  title="Editar serviço"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
