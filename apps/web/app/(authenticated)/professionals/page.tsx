"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMeQuery } from "@/hooks/use-auth";
import {
  useProfessionalsQuery,
  useCreateProfessionalMutation,
  useUpdateProfessionalMutation,
  useServicesQuery,
  useProfessionalServiceIds,
} from "@/hooks/use-professionals";
import { useOrganizationQuery } from "@/hooks/use-organization";
import { useAppointmentsQuery } from "@/hooks/use-schedule";
import {
  addDaysToCivilDate,
  getCivilDateInTimeZone,
} from "@/components/schedule/schedule-utils";
import { ProfessionalForm } from "@/components/professionals/professional-form";
import { ServiceLinkEditor } from "@/components/professionals/service-link-editor";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { PageChrome } from "@/components/shell/page-chrome";
import { ActionButton } from "@/components/ui/operational/action-button";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { toast } from "sonner";
import { formatGlobalError } from "@/lib/error-handler";
import type { CreateProfessionalInput, UpdateProfessionalInput } from "@/lib/professional-schemas";
import { Clock3, Plus, Pencil, Users, Scissors, Star, CalendarCheck } from "lucide-react";

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

  // Dados derivados para os cartões (especialidades + métricas)
  const { data: services } = useServicesQuery(activeOrgId);
  const serviceIdsByPro = useProfessionalServiceIds(activeOrgId, professionals);
  const { data: organization } = useOrganizationQuery(activeOrgId);

  const timezone = organization?.timezone ?? "America/Sao_Paulo";
  const today = getCivilDateInTimeZone(new Date(), timezone);
  const tomorrow = addDaysToCivilDate(today, 1);
  const todayAppts = useAppointmentsQuery(activeOrgId, null, today, tomorrow);

  const serviceNameById = useMemo(() => {
    const m = new Map<string, string>();
    (services ?? []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [services]);

  const todayCountByPro = useMemo(() => {
    const m = new Map<string, number>();
    (todayAppts.data ?? [])
      .filter((a) => a.status !== "CANCELLED")
      .forEach((a) => m.set(a.professionalId, (m.get(a.professionalId) ?? 0) + 1));
    return m;
  }, [todayAppts.data]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const chromeAction = useMemo(
    () =>
      !showCreateForm && !editingId ? (
        <ActionButton
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowCreateForm(true)}
        >
          Novo profissional
        </ActionButton>
      ) : null,
    [showCreateForm, editingId],
  );

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
    return <LoadingState variant="skeleton" message="Carregando equipe..." />;
  }

  // ── error ──

  if (isError) {
    const errorBody =
      error instanceof ApiError
        ? { code: error.code, message: error.message, requestId: error.requestId, timestamp: new Date().toISOString() as never }
        : { code: INTERNAL_ERROR, message: "Erro ao carregar equipe", requestId: "", timestamp: new Date().toISOString() as never };
    return <ErrorDisplay error={errorBody} onRetry={() => refetch()} />;
  }

  // ── empty ──

  if (!professionals || professionals.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1180px]">
        <PageChrome title="Profissionais" subtitle="Equipe e especialidades" />
        {showCreateForm ? (
          <ProfessionalForm mode="create" isPending={createMutation.isPending} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
        ) : (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="Nenhum profissional"
            description="Cadastre o primeiro profissional da equipe para começar a distribuir serviços e configurar jornadas."
            action={{ label: "Criar profissional", onClick: () => setShowCreateForm(true) }}
          />
        )}
      </div>
    );
  }

  // ── data ──

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      <PageChrome
        title="Profissionais"
        subtitle="Equipe e especialidades"
        action={chromeAction}
      />

      {showCreateForm && (
        <div className="mb-4">
          <ProfessionalForm mode="create" isPending={createMutation.isPending} onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {professionals.map((prof, i) =>
          editingId === prof.id ? (
            <div key={prof.id} className="lg:col-span-2">
              <ProfessionalForm
                mode="edit"
                defaultValues={{ name: prof.name, slug: prof.slug, active: prof.active }}
                isPending={updateMutation.isPending}
                onSubmit={handleUpdate}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div
              key={prof.id}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-5"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] text-[17px] font-extrabold"
                  style={{
                    background: `var(--cat-${(i % 5) + 1}-bg)`,
                    color: `var(--cat-${(i % 5) + 1}-ink)`,
                  }}
                >
                  {getInitials(prof.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15.5px] font-extrabold tracking-[-0.01em] text-[var(--color-foreground)]">
                    {prof.name}
                  </div>
                  <div className="truncate text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
                    /{prof.slug}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    prof.active
                      ? "bg-[var(--cat-2-bg)] text-[var(--cat-2-ink)]"
                      : "bg-[var(--color-operational-chip)] text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {prof.active ? "Ativo" : "Inativo"}
                </span>
              </div>

              {(() => {
                const ids = serviceIdsByPro.get(prof.id) ?? [];
                const names = ids
                  .map((id) => serviceNameById.get(id))
                  .filter((n): n is string => Boolean(n));
                return (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {names.length === 0 ? (
                      <span className="text-[12px] font-medium text-[var(--color-muted-foreground)]">
                        Nenhum serviço vinculado
                      </span>
                    ) : (
                      <>
                        {names.slice(0, 4).map((name) => (
                          <span
                            key={name}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-muted-foreground)]"
                          >
                            {name}
                          </span>
                        ))}
                        {names.length > 4 && (
                          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-muted-foreground)]">
                            +{names.length - 4}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[16px] font-extrabold text-[var(--color-foreground)]">
                    <Scissors className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
                    {(serviceIdsByPro.get(prof.id) ?? []).length}
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-[var(--color-muted-foreground)]">
                    Serviços
                  </div>
                </div>
                <div className="rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[16px] font-extrabold text-[var(--color-accent-strong)]">
                    <CalendarCheck className="h-3.5 w-3.5" />
                    {todayCountByPro.get(prof.id) ?? 0}
                  </div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-[var(--color-muted-foreground)]">
                    Hoje
                  </div>
                </div>
                <div className="rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[16px] font-extrabold text-[var(--color-muted-foreground)]">
                    <Star className="h-3.5 w-3.5" />—
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-[var(--color-muted-foreground)]">
                    Avaliação
                    <span className="rounded-full bg-[var(--color-operational-chip)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                      Em breve
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ServiceLinkEditor activeOrgId={activeOrgId!} professionalId={prof.id} professionalName={prof.name} />
                <Button asChild variant="outline" size="sm" className="bg-[var(--color-surface-operational-muted)] hover:bg-[var(--color-muted)]">
                  <Link href={`/professionals/${prof.id}/hours`}>
                    <Clock3 className="h-4 w-4" /> Jornada
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-[var(--color-surface-operational-muted)] hover:bg-[var(--color-muted)]"
                  onClick={() => handleToggleActive(prof.id, prof.active)}
                  disabled={updateMutation.isPending}
                >
                  {prof.active ? "Desativar" : "Ativar"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-[var(--color-surface-operational-muted)] hover:bg-[var(--color-muted)]"
                  onClick={() => { setShowCreateForm(false); setEditingId(prof.id); }}
                  disabled={updateMutation.isPending}
                >
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
