"use client";

import { useState } from "react";
import { useMeQuery } from "@/hooks/use-auth";
import {
  useServicesQuery,
  useCreateServiceMutation,
  useUpdateServiceMutation,
} from "@/hooks/use-services";
import { ServiceForm } from "@/components/services/service-form";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { toast } from "sonner";
import type { CreateServiceInput, UpdateServiceInput } from "@/lib/service-schemas";
import { formatGlobalError } from "@/lib/error-handler";
import { Plus, Pencil, Scissors } from "lucide-react";

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

  const createMutation = useCreateServiceMutation(activeOrgId ?? "");
  const updateMutation = useUpdateServiceMutation(activeOrgId ?? "");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
    // Toggle inline fora do form — usa toast para erro global.
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
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando serviços..." />
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
            message: "Erro ao carregar serviços",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          };
    return (
      <div className="p-6">
        <ErrorDisplay error={errorBody} onRetry={() => refetch()} />
      </div>
    );
  }

  // ---- empty ----

  if (!services || services.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
              Serviços
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Gerencie os serviços oferecidos
            </p>
          </div>
        </div>
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            Serviços
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Gerencie os serviços oferecidos
          </p>
        </div>
        {!showCreateForm && !editingId && (
          <Button
            onClick={() => setShowCreateForm(true)}
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Novo serviço
          </Button>
        )}
      </div>

      {showCreateForm && (
        <ServiceForm
          mode="create"
          isPending={createMutation.isPending}
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      <div className="space-y-3">
        {services.map((svc) =>
          editingId === svc.id ? (
            <ServiceForm
              key={svc.id}
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
          ) : (
            <Card key={svc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-[var(--color-foreground)] truncate">
                      {svc.name}
                    </h3>
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        svc.active
                          ? "bg-green-500"
                          : "bg-[var(--color-muted-foreground)]"
                      }`}
                      title={svc.active ? "Ativo" : "Inativo"}
                    />
                  </div>
                  <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                    {svc.durationMin}min ·{" "}
                    {formatPrice(svc.priceCents, svc.currency)}
                    {svc.bufferAfterMin && svc.bufferAfterMin > 0
                      ? ` · +${svc.bufferAfterMin}min buffer`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(svc.id, svc.active)}
                    disabled={updateMutation.isPending}
                  >
                    {svc.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCreateForm(false);
                      setEditingId(svc.id);
                    }}
                    disabled={updateMutation.isPending}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
