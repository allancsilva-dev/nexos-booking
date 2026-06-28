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
import {
  OperationalPanel,
  OperationalPanelContent,
} from "@/components/ui/operational/panel";
import { OperationalPageHeader } from "@/components/ui/operational/page-header";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { toast } from "sonner";
import { formatGlobalError } from "@/lib/error-handler";
import type { CreateProfessionalInput, UpdateProfessionalInput } from "@/lib/professional-schemas";
import { Clock3, Plus, Pencil, Users } from "lucide-react";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <OperationalPageHeader
          title="Equipe"
          description="Cadastre profissionais, organize a operação diária e prepare a base para agenda, serviços e jornada."
          meta={
            <span className="inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
              Operação de equipe
            </span>
          }
        />
        {showCreateForm ? (
          <ProfessionalForm mode="create" isPending={createMutation.isPending} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
        ) : (
          <OperationalPanel variant="muted">
            <OperationalPanelContent className="pt-6">
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="Nenhum profissional"
                description="Cadastre o primeiro profissional da equipe para começar a distribuir serviços e configurar jornadas."
                action={{ label: "Criar profissional", onClick: () => setShowCreateForm(true) }}
              />
            </OperationalPanelContent>
          </OperationalPanel>
        )}
      </div>
    );
  }

  // ── data ──

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <OperationalPageHeader
        title="Equipe"
        description="Mantenha profissionais ativos, prontos para jornada e vinculados aos serviços certos antes de abrir mais horários na agenda."
        meta={
          <>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
              Operação de equipe
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] px-3 py-1 text-sm font-semibold text-[var(--color-foreground)]">
              {professionals.length} profissionais
            </span>
          </>
        }
        actions={
          !showCreateForm && !editingId ? (
            <Button onClick={() => setShowCreateForm(true)} className="bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-accent)]">
            <Plus className="h-4 w-4" /> Novo profissional
          </Button>
          ) : null
        }
      />

      {showCreateForm && (
        <ProfessionalForm mode="create" isPending={createMutation.isPending} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
      )}

      <div className="space-y-4">
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
            <OperationalPanel key={prof.id} variant="muted">
              <OperationalPanelContent className="pt-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-accent-soft)] text-sm font-bold text-[var(--color-accent-strong)]">
                      {getInitials(prof.name)}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-bold text-[var(--color-foreground)]">
                          {prof.name}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            prof.active
                              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                              : "border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] text-[var(--color-muted-foreground)]"
                          }`}
                          title={prof.active ? "Ativo" : "Inativo"}
                        >
                          {prof.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                        <span className="inline-flex rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] px-2.5 py-1 font-medium">
                          /{prof.slug}
                        </span>
                        <span>
                          {prof.active
                            ? "Disponível para receber serviços e jornada."
                            : "Precisa ser reativado para voltar à operação."}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <ServiceLinkEditor activeOrgId={activeOrgId!} professionalId={prof.id} professionalName={prof.name} />
                    <Button asChild variant="outline" size="sm" className="bg-[var(--color-surface-operational-strong)] hover:bg-[var(--color-muted)]">
                      <Link href={`/professionals/${prof.id}/hours`}>
                        <Clock3 className="h-4 w-4" /> Jornada
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-[var(--color-surface-operational-strong)] hover:bg-[var(--color-muted)]"
                      onClick={() => handleToggleActive(prof.id, prof.active)}
                      disabled={updateMutation.isPending}
                    >
                      {prof.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-[var(--color-surface-operational-strong)] hover:bg-[var(--color-muted)]"
                      onClick={() => { setShowCreateForm(false); setEditingId(prof.id); }}
                      disabled={updateMutation.isPending}
                    >
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                  </div>
                </div>
              </OperationalPanelContent>
            </OperationalPanel>
          ),
        )}
      </div>
    </div>
  );
}
