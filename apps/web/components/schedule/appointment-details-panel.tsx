"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  APPOINTMENT_TRANSITIONS,
  type AppointmentStatus,
  type AvailabilitySlot,
} from "@nexos/shared";
import { CalendarClock, Check, Loader2, UserX, X } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { SlotPicker } from "@/components/schedule/slot-picker";
import {
  formatCurrency,
  formatTimeInTimeZone,
  getCivilDateInTimeZone,
} from "@/components/schedule/schedule-utils";
import {
  useAppointmentDetailQuery,
  useAppointmentEventsQuery,
  useAppointmentTerminalMutation,
  useAvailabilityQuery,
  useRescheduleAppointmentMutation,
  type AppointmentTerminalAction,
} from "@/hooks/use-schedule";
import { useStableIdempotencyKey } from "@/hooks/use-stable-idempotency-key";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";

type Props = {
  open: boolean;
  appointmentId: string | null;
  activeOrgId: string;
  timezone: string;
  professionalName?: string;
  onClose: () => void;
};

const statusLabels: Record<AppointmentStatus, string> = {
  SCHEDULED: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
};

const actionCopy: Record<AppointmentTerminalAction, { label: string; question: string }> = {
  cancel: { label: "Cancelar", question: "Cancelar este agendamento?" },
  complete: { label: "Concluir", question: "Marcar atendimento como concluído?" },
  "no-show": { label: "Não compareceu", question: "Marcar cliente como não compareceu?" },
};

function nextCivilDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

function retryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

export function AppointmentDetailsPanel({
  open,
  appointmentId,
  activeOrgId,
  timezone,
  professionalName,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const detail = useAppointmentDetailQuery(activeOrgId, open ? appointmentId : null);
  const events = useAppointmentEventsQuery(activeOrgId, open ? appointmentId : null);
  const reschedule = useRescheduleAppointmentMutation(activeOrgId);
  const terminal = useAppointmentTerminalMutation(activeOrgId);
  const rescheduleKey = useStableIdempotencyKey();
  const terminalKey = useStableIdempotencyKey();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);
  const [note, setNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<AppointmentTerminalAction | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const appointment = detail.data;
  const availability = useAvailabilityQuery(
    activeOrgId,
    editing ? appointment?.professionalId ?? null : null,
    editing ? appointment?.serviceId ?? null : null,
    editing && date ? date : null,
    editing && date ? nextCivilDate(date) : null,
  );

  useEffect(() => {
    if (!appointment) return;
    setNote(appointment.note ?? "");
    setDate(getCivilDateInTimeZone(new Date(appointment.startsAt), timezone));
  }, [appointment, timezone]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button, input, textarea")?.focus();

    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      )];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [onClose, open]);

  const transitions = useMemo(
    () => appointment ? APPOINTMENT_TRANSITIONS[appointment.status] : [],
    [appointment],
  );

  function close(): void {
    rescheduleKey.resetKey();
    terminalKey.resetKey();
    setEditing(false);
    setConfirmAction(null);
    setOperationError(null);
    onClose();
  }

  async function submitReschedule(): Promise<void> {
    if (!appointment || (!slot && note === (appointment.note ?? ""))) return;
    setOperationError(null);
    try {
      await reschedule.mutateAsync({
        appointmentId: appointment.id,
        version: appointment.version,
        input: {
          ...(slot ? { startsAt: slot.startsAt } : {}),
          ...(note !== (appointment.note ?? "") ? { note } : {}),
        },
        idempotencyKey: rescheduleKey.getKey(),
      });
      rescheduleKey.resetKey();
      setSlot(null);
      setEditing(false);
      toast.success(slot ? "Agendamento remarcado" : "Observação atualizada");
      void events.refetch();
    } catch (error) {
      if (!retryable(error)) rescheduleKey.resetKey();
      if (error instanceof ApiError && error.code === "APPOINTMENT_CONFLICT") {
        setSlot(null);
        void availability.refetch();
        setOperationError("Horário ficou indisponível. Escolha outro slot.");
      } else if (error instanceof ApiError && error.code === "APPOINTMENT_VERSION_CONFLICT") {
        setSlot(null);
        void detail.refetch();
        setOperationError("Agendamento mudou em outra tela. Dados foram atualizados.");
      } else if (error instanceof ApiError && error.code === "INVALID_STATUS_TRANSITION") {
        void detail.refetch();
        setEditing(false);
        setOperationError("Estado mudou e esta ação não está mais disponível.");
      } else {
        setOperationError("Não foi possível salvar. Tente novamente.");
      }
    }
  }

  async function submitTerminal(): Promise<void> {
    if (!appointment || !confirmAction) return;
    setOperationError(null);
    try {
      await terminal.mutateAsync({
        appointmentId: appointment.id,
        version: appointment.version,
        action: confirmAction,
        idempotencyKey: terminalKey.getKey(),
      });
      terminalKey.resetKey();
      toast.success(`${actionCopy[confirmAction].label}: atualizado`);
      setConfirmAction(null);
      void events.refetch();
    } catch (error) {
      if (!retryable(error)) terminalKey.resetKey();
      if (error instanceof ApiError && (
        error.code === "APPOINTMENT_VERSION_CONFLICT" ||
        error.code === "INVALID_STATUS_TRANSITION"
      )) {
        void detail.refetch();
        setConfirmAction(null);
        setOperationError("Agendamento mudou em outra tela. Dados foram atualizados.");
      } else {
        setOperationError("Não foi possível concluir a ação. Tente novamente.");
      }
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      <button
        type="button"
        aria-label="Fechar detalhes"
        className="absolute inset-0 bg-black/72"
        onClick={close}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-panel-title"
        className="relative z-10 flex max-h-[94dvh] w-full flex-col rounded-t-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational)] text-[var(--color-foreground)] sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-none sm:border-y-0 sm:border-r-0"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border-strong)] px-5 py-5 sm:px-6">
          <div>
            <h2 id="appointment-panel-title" className="text-xl font-bold">Detalhes do agendamento</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Consulte dados antes de alterar estado ou horário.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={close}>
            <X />
          </Button>
        </header>

        <div className="nb-scroll flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {detail.isLoading ? <LoadingState variant="skeleton" message="Carregando detalhes..." /> : null}
          {detail.isError ? (
            <ErrorDisplay
              error={{ code: INTERNAL_ERROR, message: "Erro ao carregar agendamento", requestId: "", timestamp: new Date().toISOString() as never }}
              onRetry={() => detail.refetch()}
            />
          ) : null}

          {appointment ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{appointment.clientName}</p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">{appointment.clientPhone ?? "Telefone não informado"}</p>
                </div>
                <span className="rounded-full bg-[var(--color-operational-chip)] px-3 py-1 text-xs font-bold">
                  {statusLabels[appointment.status]}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-[var(--color-operational-line)] py-5 text-sm">
                <div><dt className="text-[var(--color-muted-foreground)]">Serviço</dt><dd className="mt-1 font-semibold">{appointment.serviceNameSnapshot}</dd></div>
                <div><dt className="text-[var(--color-muted-foreground)]">Profissional</dt><dd className="mt-1 font-semibold">{professionalName ?? "Profissional"}</dd></div>
                <div><dt className="text-[var(--color-muted-foreground)]">Horário</dt><dd className="mt-1 font-semibold">{formatTimeInTimeZone(appointment.startsAt, timezone)}–{formatTimeInTimeZone(appointment.endsAt, timezone)}</dd></div>
                <div><dt className="text-[var(--color-muted-foreground)]">Valor</dt><dd className="mt-1 font-semibold">{formatCurrency(appointment.servicePriceCentsSnapshot, appointment.serviceCurrencySnapshot)}</dd></div>
                <div><dt className="text-[var(--color-muted-foreground)]">Duração</dt><dd className="mt-1 font-semibold">{appointment.serviceDurationMinSnapshot} min</dd></div>
                <div><dt className="text-[var(--color-muted-foreground)]">Versão</dt><dd className="mt-1 font-semibold">{appointment.version}</dd></div>
              </dl>

              {operationError ? (
                <div role="alert" className="rounded-[var(--radius-control)] bg-[var(--color-destructive)]/12 px-4 py-3 text-sm font-semibold text-[var(--color-destructive)]">
                  {operationError}
                </div>
              ) : null}

              {editing ? (
                <section className="space-y-4" aria-labelledby="reschedule-title">
                  <div><h3 id="reschedule-title" className="font-bold">Remarcar ou editar observação</h3><p className="text-sm text-[var(--color-muted-foreground)]">Somente horários livres podem ser escolhidos.</p></div>
                  <div className="space-y-2"><Label htmlFor="reschedule-date">Data</Label><Input id="reschedule-date" type="date" value={date} onChange={(event) => { setDate(event.target.value); setSlot(null); rescheduleKey.resetKey(); }} /></div>
                  <SlotPicker data={availability.data} isLoading={availability.isLoading} selectedSlot={slot} onSelectSlot={(next) => { setSlot(next); rescheduleKey.resetKey(); }} />
                  <div className="space-y-2"><Label htmlFor="appointment-note">Observação</Label><textarea id="appointment-note" className="min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--color-input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" maxLength={500} value={note} onChange={(event) => { setNote(event.target.value); rescheduleKey.resetKey(); }} /></div>
                  <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => { setEditing(false); setSlot(null); rescheduleKey.resetKey(); }}>Voltar</Button><Button onClick={() => void submitReschedule()} disabled={reschedule.isPending || (!slot && note === (appointment.note ?? ""))}>{reschedule.isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />}Salvar alteração</Button></div>
                </section>
              ) : confirmAction ? (
                <section className="space-y-4 rounded-[var(--radius-card)] bg-[var(--color-operational-chip)] p-4" aria-live="polite">
                  <div><h3 className="font-bold">{actionCopy[confirmAction].question}</h3><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Esta ação altera estado operacional do atendimento.</p></div>
                  <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setConfirmAction(null); terminalKey.resetKey(); }}>Voltar</Button><Button variant={confirmAction === "cancel" ? "destructive" : "default"} onClick={() => void submitTerminal()} disabled={terminal.isPending}>{terminal.isPending ? <Loader2 className="animate-spin" /> : null}Confirmar</Button></div>
                </section>
              ) : transitions.length > 0 ? (
                <section className="space-y-3" aria-labelledby="actions-title">
                  <h3 id="actions-title" className="font-bold">Ações</h3>
                  <div className="flex flex-wrap gap-2">
                    {transitions.includes("RESCHEDULED") ? <Button variant="outline" onClick={() => setEditing(true)}><CalendarClock />Remarcar</Button> : null}
                    {transitions.includes("COMPLETED") ? <Button variant="outline" onClick={() => setConfirmAction("complete")}><Check />Concluir</Button> : null}
                    {transitions.includes("NO_SHOW") ? <Button variant="outline" onClick={() => setConfirmAction("no-show")}><UserX />Não compareceu</Button> : null}
                    {transitions.includes("CANCELLED") ? <Button variant="outline" className="text-[var(--color-destructive)]" onClick={() => setConfirmAction("cancel")}><X />Cancelar</Button> : null}
                  </div>
                </section>
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">Agendamento encerrado. Nenhuma ação disponível.</p>
              )}

              <section className="space-y-3" aria-labelledby="history-title">
                <h3 id="history-title" className="font-bold">Histórico</h3>
                {events.isLoading ? <LoadingState variant="inline" message="Carregando histórico..." /> : null}
                <ol className="space-y-2">
                  {(events.data ?? []).map((event) => (
                    <li key={event.id} className="flex justify-between gap-4 border-t border-[var(--color-operational-line)] pt-2 text-sm">
                      <span className="font-medium">{event.eventType}</span>
                      <time className="text-[var(--color-muted-foreground)]">{new Date(event.occurredAt).toLocaleString("pt-BR", { timeZone: timezone })}</time>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
