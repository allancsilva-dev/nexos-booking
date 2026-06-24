"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { CreateBlockInput, AvailabilityBlockDTO } from "@nexos/shared";
import { ApiError } from "@/lib/http-client";
import { formatGlobalError } from "@/lib/error-handler";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";

/** Converte datetime-local (ex: "2026-06-24T14:30") para ISO-8601 com offset. */
function toIsoWithOffset(localValue: string): string {
  const d = new Date(localValue);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${localValue}:00${sign}${hh}:${mm}`;
}

function formatBlockRange(block: AvailabilityBlockDTO): string {
  const start = new Date(block.startsAt);
  const end = new Date(block.endsAt);
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} → ${fmt(end)}`;
}

interface Props {
  activeOrgId: string;
  professionalId: string;
  blocks: AvailabilityBlockDTO[] | undefined;
  isLoading: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  onCreate: (input: CreateBlockInput) => Promise<void>;
  onDelete: (blockId: string) => Promise<void>;
}

export function BlocksManager({
  blocks,
  isLoading,
  isCreating,
  isDeleting,
  onCreate,
  onDelete,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");

  function resetForm() {
    setStartsAt("");
    setEndsAt("");
    setReason("");
    setFormError("");
    setShowForm(false);
  }

  async function handleCreate() {
    if (!startsAt || !endsAt) {
      setFormError("Preencha início e fim.");
      return;
    }
    if (startsAt >= endsAt) {
      setFormError("Fim deve ser maior que início.");
      return;
    }
    setFormError("");

    const input: CreateBlockInput = {
      startsAt: toIsoWithOffset(startsAt),
      endsAt: toIsoWithOffset(endsAt),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };

    try {
      await onCreate(input);
      resetForm();
    } catch (err) {
      if (err instanceof ApiError) {
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, { description: `${code} — Ref: ${requestId || "N/A"}` });
      } else {
        toast.error("Erro ao conectar.");
      }
    }
  }

  async function handleDelete(blockId: string) {
    try {
      await onDelete(blockId);
    } catch (err) {
      if (err instanceof ApiError) {
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, { description: `${code} — Ref: ${requestId || "N/A"}` });
      } else {
        toast.error("Erro ao conectar.");
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Bloqueios</CardTitle>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Novo bloqueio
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="space-y-2 border border-[var(--color-border)] rounded-[var(--radius-control)] p-3">
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs text-[var(--color-muted-foreground)]">Início</label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs text-[var(--color-muted-foreground)]">Fim</label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <Input
              placeholder="Motivo (opcional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="h-8 text-xs"
            />
            {formError && (
              <p className="text-xs text-[var(--color-destructive)]">{formError}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={isCreating}>
                {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Criar
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingState variant="inline" message="Carregando bloqueios..." />
        ) : blocks && blocks.length > 0 ? (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between text-sm border border-[var(--color-border)] rounded-[var(--radius-control)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[var(--color-foreground)] truncate">
                    {formatBlockRange(b)}
                  </p>
                  {b.reason && (
                    <p className="text-xs text-[var(--color-muted-foreground)] truncate">
                      {b.reason}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(b.id)}
                  disabled={isDeleting}
                  className="text-[var(--color-destructive)] shrink-0 ml-2"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum bloqueio"
            description="Adicione bloqueios para dias específicos."
          />
        )}
      </CardContent>
    </Card>
  );
}
