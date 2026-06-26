"use client";

import { useState } from "react";
import Link from "next/link";
import { useMeQuery } from "@/hooks/use-auth";
import {
  useProfessionalsQuery,
  useCreateProfessionalMutation,
  useUpdateProfessionalMutation,
} from "@/hooks/use-professionals";
import { ProfessionalForm } from "@/components/professionals/professional-form";
import { ServiceLinkEditor } from "@/components/professionals/service-link-editor";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { toast } from "sonner";
import { formatGlobalError } from "@/lib/error-handler";
import type { CreateProfessionalInput, UpdateProfessionalInput } from "@/lib/professional-schemas";
import { Clock3, Plus, Pencil, Users } from "lucide-react";

export default function ProfessionalsPage() {
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  const {
    data: professionals,
    isLoading,
    isError,
    error,
    refetch,
  } = useProfessionalsQuery(activeOrgId);

  const createMutation = useCreateProfessionalMutation(activeOrgId ?? "");
  const updateMutation = useUpdateProfessionalMutation(activeOrgId ?? "");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── handlers ──

  async function handleCreate(data: CreateProfessionalInput) {
    await createMutation.mutateAsync(data);
    setShowCreateForm(false);
  }

  async function handleUpdate(data: UpdateProfessionalInput) {
    if (!editingId) return;
    await updateMutation.mutateAsync({ id: editingId, input: data });
    setEditingId(null);
  }

  async function handleToggleActive(professionalId: string, active: boolean) {
    try {
      await updateMutation.mutateAsync({
        id: professionalId,
        input: { active: !active },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, { description: `${code} — Ref: ${requestId || "N/A"}` });
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    }
  }

  // ── loading ──

  if (!activeOrgId || isLoading) {
    return (
      <div className="p-6">
        <LoadingState variant="skeleton" message="Carregando equipe..." />
      </div>
    );
  }

  // ── error ──

  if (isError) {
    const errorBody =
      error instanceof ApiError
        ? { code: error.code, message: error.message, requestId: error.requestId, timestamp: new Date().toISOString() as never }
        : { code: INTERNAL_ERROR, message: "Erro ao carregar equipe", requestId: "", timestamp: new Date().toISOString() as never };
    return (
      <div className="p-6">
        <ErrorDisplay error={errorBody} onRetry={() => refetch()} />
      </div>
    );
  }

  // ── empty ──

  if (!professionals || professionals.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Equipe</h1>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Gerencie os profissionais</p>
          </div>
        </div>
        {showCreateForm ? (
          <ProfessionalForm mode="create" isPending={createMutation.isPending} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
        ) : (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="Nenhum profissional"
            description="Cadastre o primeiro profissional da equipe."
            action={{ label: "Criar profissional", onClick: () => setShowCreateForm(true) }}
          />
        )}
      </div>
    );
  }

  // ── data ──

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Equipe</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Gerencie os profissionais</p>
        </div>
        {!showCreateForm && !editingId && (
          <Button onClick={() => setShowCreateForm(true)} size="sm">
            <Plus className="h-4 w-4" /> Novo profissional
          </Button>
        )}
      </div>

      {showCreateForm && (
        <ProfessionalForm mode="create" isPending={createMutation.isPending} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
      )}

      <div className="space-y-3">
        {professionals.map((prof) =>
          editingId === prof.id ? (
            <ProfessionalForm
              key={prof.id}
              mode="edit"
              defaultValues={{ name: prof.name, slug: prof.slug, active: prof.active }}
              isPending={updateMutation.isPending}
              onSubmit={handleUpdate}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <Card key={prof.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-[var(--color-foreground)] truncate">{prof.name}</h3>
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${prof.active ? "bg-green-500" : "bg-[var(--color-muted-foreground)]"}`}
                        title={prof.active ? "Ativo" : "Inativo"}
                      />
                    </div>
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{prof.slug}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <ServiceLinkEditor activeOrgId={activeOrgId!} professionalId={prof.id} professionalName={prof.name} />
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/professionals/${prof.id}/hours`}>
                        <Clock3 className="h-4 w-4" /> Jornada
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(prof.id, prof.active)}
                      disabled={updateMutation.isPending}
                    >
                      {prof.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setShowCreateForm(false); setEditingId(prof.id); }}
                      disabled={updateMutation.isPending}
                    >
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
