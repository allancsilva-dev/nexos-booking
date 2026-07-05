"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Phone, Plus, Users } from "lucide-react";
import { useClientsQuery, useClientDetailQuery } from "@/hooks/use-clients";
import { useServicesQuery } from "@/hooks/use-services";
import { useProfessionalsQuery } from "@/hooks/use-professionals";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { cn } from "@/lib/utils";
import type { ClientListItemDTO } from "@nexos/shared";

interface Props {
  orgId: string;
}

// ── helpers ────────────────────────────────────────────────────────

const AVATAR_CATS = [1, 2, 3, 4, 5] as const;

function avatarCat(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_CATS[h % AVATAR_CATS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

function formatDateLong(iso: string | undefined): string {
  if (!iso) return "Sem visitas";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

const STATUS_META: Record<string, { label: string; cat: number }> = {
  SCHEDULED: { label: "Agendado", cat: 1 },
  CONFIRMED: { label: "Confirmado", cat: 1 },
  COMPLETED: { label: "Concluído", cat: 2 },
  NO_SHOW: { label: "Não compareceu", cat: 3 },
  CANCELLED: { label: "Cancelado", cat: 4 },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, cat: 5 };
}

function SoonBadge() {
  return (
    <span className="rounded-full bg-[var(--color-operational-chip)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted-foreground)]">
      Em breve
    </span>
  );
}

function Avatar({
  id,
  name,
  size,
}: {
  id: string;
  name: string;
  size: number;
}) {
  const cat = avatarCat(id);
  return (
    <div
      className="flex flex-none items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: size > 50 ? 16 : 11,
        fontSize: size > 50 ? 20 : 13,
        background: `var(--cat-${cat}-bg)`,
        color: `var(--cat-${cat}-ink)`,
      }}
    >
      {initials(name)}
    </div>
  );
}

// ── component ──────────────────────────────────────────────────────

export function ClientsScreen({ orgId }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error, refetch } = useClientsQuery(
    orgId,
    debounced,
  );
  const clients = data?.items;

  // Name lookups for the history rows.
  const { data: services } = useServicesQuery(orgId);
  const { data: professionals } = useProfessionalsQuery(orgId);
  const serviceName = useMemo(() => {
    const m = new Map<string, string>();
    services?.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [services]);
  const professionalName = useMemo(() => {
    const m = new Map<string, string>();
    professionals?.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [professionals]);

  // Auto-select the first client once a list is available.
  useEffect(() => {
    if (!clients || clients.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && clients.some((c) => c.id === prev) ? prev : clients[0].id,
    );
  }, [clients]);

  const { data: detail, isLoading: detailLoading } = useClientDetailQuery(
    orgId,
    selectedId,
  );

  const sortedHistory = useMemo(() => {
    if (!detail) return [];
    return [...detail.appointments].sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  }, [detail]);

  const nextAppointment = useMemo(() => {
    if (!detail) return null;
    const now = Date.now();
    const upcoming = detail.appointments
      .filter(
        (a) =>
          new Date(a.startsAt).getTime() >= now &&
          a.status !== "CANCELLED",
      )
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    return upcoming[0] ?? null;
  }, [detail]);

  // ---- loading (first load) ----
  if (isLoading) {
    return <LoadingState variant="skeleton" message="Carregando clientes..." />;
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
            message: "Erro ao carregar clientes",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          };
    return <ErrorDisplay error={errorBody} onRetry={() => refetch()} />;
  }

  const hasSearch = debounced.trim().length > 0;
  const isEmpty = !clients || clients.length === 0;

  return (
    <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-[18px] lg:grid-cols-[380px_1fr]">
      {/* ── list ── */}
      <div className="self-start rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-4">
        <div className="mb-3 flex items-center gap-2.5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 py-2.5">
          <Search className="h-[15px] w-[15px] text-[var(--color-muted-foreground)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full bg-transparent text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
        </div>

        {isEmpty ? (
          <p className="px-1 py-8 text-center text-[13px] text-[var(--color-muted-foreground)]">
            {hasSearch
              ? "Nenhum cliente encontrado."
              : "Nenhum cliente ainda."}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {clients!.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                active={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── detail ── */}
      <div className="flex flex-col gap-4">
        {isEmpty ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="Sem clientes"
            description="Os clientes aparecem aqui após o primeiro agendamento."
          />
        ) : detailLoading || !detail ? (
          <LoadingState variant="skeleton" message="Carregando ficha..." />
        ) : (
          <>
            {/* header card */}
            <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-[22px]">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar id={detail.id} name={detail.name} size={60} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[19px] font-extrabold tracking-tight text-[var(--color-foreground)]">
                    {detail.name}
                  </h2>
                  <div className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
                    <Phone className="h-[13px] w-[13px]" />
                    {detail.phone ?? "Sem telefone"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  title="Agendamento direto pela ficha — em breve"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 py-2 text-[13px] font-bold text-[var(--color-muted-foreground)] opacity-70"
                >
                  <Plus className="h-[15px] w-[15px]" />
                  Agendar
                  <SoonBadge />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <StatTile
                  value={String(detail.appointments.length)}
                  label="Visitas"
                />
                <StatTile value="—" label="Total gasto" soon />
                <StatTile
                  value={
                    nextAppointment
                      ? formatDateShort(nextAppointment.startsAt)
                      : "—"
                  }
                  label="Próximo"
                  accent={!!nextAppointment}
                />
              </div>
            </section>

            {/* history card */}
            <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-[22px]">
              <h3 className="mb-4 text-sm font-extrabold text-[var(--color-foreground)]">
                Histórico de atendimentos
              </h3>
              {sortedHistory.length === 0 ? (
                <p className="py-4 text-[13px] text-[var(--color-muted-foreground)]">
                  Nenhum atendimento registrado.
                </p>
              ) : (
                <div className="flex flex-col">
                  {sortedHistory.map((h) => {
                    const meta = statusMeta(h.status);
                    return (
                      <div
                        key={h.id}
                        className="flex items-center gap-3.5 border-t border-[var(--color-operational-line)] py-3.5 first:border-t-0"
                      >
                        <span
                          className="h-[34px] w-1 flex-none rounded-[3px]"
                          style={{ background: `var(--cat-${meta.cat}-line)` }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold text-[var(--color-foreground)]">
                            {serviceName.get(h.serviceId) ?? "Serviço"}
                          </div>
                          <div className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
                            {professionalName.get(h.professionalId) ??
                              "Profissional"}
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                          {formatDateShort(h.startsAt)}
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{
                            background: `var(--cat-${meta.cat}-bg)`,
                            color: `var(--cat-${meta.cat}-ink)`,
                          }}
                        >
                          {meta.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ── subcomponents ──────────────────────────────────────────────────

function ClientRow({
  client,
  active,
  onClick,
}: {
  client: ClientListItemDTO;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] p-2.5 text-left transition-colors",
        active
          ? "bg-[var(--color-accent-soft)]"
          : "hover:bg-[var(--color-operational-overlay)]",
      )}
    >
      <Avatar id={client.id} name={client.name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold text-[var(--color-foreground)]">
          {client.name}
        </div>
        <div className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
          {client.phone ?? "Sem telefone"}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
          {client.appointmentsCount != null
            ? `${client.appointmentsCount} ${client.appointmentsCount === 1 ? "visita" : "visitas"}`
            : ""}
        </div>
        <div className="text-[11px] text-[var(--color-muted-foreground)]">
          {formatDateLong(client.lastAppointmentAt)}
        </div>
      </div>
    </button>
  );
}

function StatTile({
  value,
  label,
  accent,
  soon,
}: {
  value: string;
  label: string;
  accent?: boolean;
  soon?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] p-3.5">
      <div
        className={cn(
          "text-[22px] font-extrabold tracking-tight",
          accent
            ? "text-[var(--color-accent-strong)]"
            : "text-[var(--color-foreground)]",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
          {label}
        </span>
        {soon && <SoonBadge />}
      </div>
    </div>
  );
}
