"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2, CalendarClock } from "lucide-react";
import { useProfessionalsQuery } from "@/hooks/use-professionals";
import {
  useTeamBlocks,
  useTeamAvailability,
  useDeleteTeamBlockMutation,
  type TeamBlock,
  type TeamAvailabilityRow,
} from "@/hooks/use-team-schedule";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { EmptyState } from "@/components/empty-state";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { formatGlobalError } from "@/lib/error-handler";
import type { ShiftDTO } from "@nexos/shared";

interface Props {
  orgId: string;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarCat(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 5) + 1;
}

/** Compress sorted weekday numbers into "Seg–Sex, Dom". */
function weekdayRanges(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const d = sorted[i];
    if (d === prev + 1) {
      prev = d;
      continue;
    }
    runs.push(start === prev ? WEEKDAYS[start] : `${WEEKDAYS[start]}–${WEEKDAYS[prev]}`);
    start = d;
    prev = d;
  }
  return runs.join(", ");
}

function summarizeShifts(shifts: ShiftDTO[]): { hours: string; off: string } {
  if (shifts.length === 0) {
    return { hours: "Sem jornada definida", off: "" };
  }
  // Group days that share the same time range.
  const byRange = new Map<string, number[]>();
  shifts.forEach((s) => {
    const key = `${s.startTime}–${s.endTime}`;
    const arr = byRange.get(key) ?? [];
    arr.push(s.weekday);
    byRange.set(key, arr);
  });
  const hours = [...byRange.entries()]
    .map(([range, days]) => `${weekdayRanges(days)} · ${range}`)
    .join("  ·  ");

  const worked = new Set(shifts.map((s) => s.weekday));
  const offDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !worked.has(d));
  const off = offDays.length === 0 ? "" : `Folga: ${weekdayRanges(offDays)}`;
  return { hours, off };
}

function blockDateParts(iso: string) {
  const d = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(d),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(d)
      .replace(".", ""),
    weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(d),
  };
}

export function HorariosScreen({ orgId }: Props) {
  const {
    data: professionals,
    isLoading: prosLoading,
    isError: prosError,
    error: prosErr,
    refetch,
  } = useProfessionalsQuery(orgId);

  const { blocks, isLoading: blocksLoading } = useTeamBlocks(
    orgId,
    professionals,
  );
  const { rows, isLoading: availLoading } = useTeamAvailability(
    orgId,
    professionals,
  );
  const deleteBlock = useDeleteTeamBlockMutation(orgId);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(block: TeamBlock) {
    if (
      !window.confirm(
        `Remover o bloqueio de ${block.professionalName}? Esses horários voltam a ficar disponíveis.`,
      )
    ) {
      return;
    }
    setDeletingId(block.id);
    try {
      await deleteBlock.mutateAsync({
        professionalId: block.professionalId,
        blockId: block.id,
      });
      toast.success("Bloqueio removido");
    } catch (err) {
      if (err instanceof ApiError) {
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, {
          description: `${code} — Ref: ${requestId || "N/A"}`,
        });
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (prosLoading) {
    return <LoadingState variant="skeleton" message="Carregando horários..." />;
  }

  if (prosError) {
    const errorBody =
      prosErr instanceof ApiError
        ? {
            code: prosErr.code,
            message: prosErr.message,
            requestId: prosErr.requestId,
            timestamp: new Date().toISOString() as never,
          }
        : {
            code: INTERNAL_ERROR,
            message: "Erro ao carregar horários",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          };
    return <ErrorDisplay error={errorBody} onRetry={() => refetch()} />;
  }

  if (!professionals || professionals.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-8 w-8" />}
        title="Sem profissionais"
        description="Cadastre profissionais para definir jornadas e bloqueios."
      />
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {/* ── Próximos bloqueios ── */}
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-[22px]">
        <h2 className="text-sm font-extrabold text-[var(--color-foreground)]">
          Próximos bloqueios
        </h2>
        <p className="mb-3.5 mt-1 text-[12.5px] text-[var(--color-muted-foreground)]">
          Folgas, feriados e fechamentos. Esses horários não aparecem na página
          pública.
        </p>

        {blocksLoading ? (
          <LoadingState variant="inline" message="Carregando bloqueios..." />
        ) : blocks.length === 0 ? (
          <p className="py-6 text-[13px] text-[var(--color-muted-foreground)]">
            Nenhum bloqueio nos próximos 90 dias. Defina folgas na jornada de
            cada profissional.
          </p>
        ) : (
          <div className="flex flex-col">
            {blocks.map((b) => {
              const d = blockDateParts(b.startsAt);
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3.5 border-t border-[var(--color-operational-line)] py-3.5 first:border-t-0"
                >
                  <div className="w-[46px] flex-none text-center">
                    <div className="text-[17px] font-extrabold leading-none text-[var(--color-accent-strong)]">
                      {d.day}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase text-[var(--color-muted-foreground)]">
                      {d.month}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-[var(--color-foreground)]">
                      {b.reason ?? "Bloqueio"}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
                      {b.professionalName} · {d.weekday}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(b)}
                    disabled={deletingId === b.id}
                    title="Remover bloqueio"
                    className="text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-destructive)] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Disponibilidade da equipe ── */}
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-[22px]">
        <h2 className="text-sm font-extrabold text-[var(--color-foreground)]">
          Disponibilidade da equipe
        </h2>
        <p className="mb-3.5 mt-1 text-[12.5px] text-[var(--color-muted-foreground)]">
          Resumo da jornada de cada profissional.
        </p>

        {availLoading ? (
          <LoadingState variant="inline" message="Carregando jornadas..." />
        ) : (
          <div className="flex flex-col">
            {rows.map((row: TeamAvailabilityRow) => {
              const { hours, off } = summarizeShifts(row.shifts);
              const cat = avatarCat(row.professional.id);
              return (
                <div
                  key={row.professional.id}
                  className="flex items-center gap-3.5 border-t border-[var(--color-operational-line)] py-3.5 first:border-t-0"
                >
                  <div
                    className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] text-xs font-bold"
                    style={{
                      background: `var(--cat-${cat}-bg)`,
                      color: `var(--cat-${cat}-ink)`,
                    }}
                  >
                    {initials(row.professional.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-[var(--color-foreground)]">
                      {row.professional.name}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--color-muted-foreground)]">
                      {hours}
                    </div>
                  </div>
                  {off && (
                    <span className="flex-none text-[11px] font-semibold text-[var(--color-muted-foreground)]">
                      {off}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
