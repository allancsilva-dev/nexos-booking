"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from "react";
import type {
  PublicVitrineResponse,
  AvailabilityResponse,
  PublicBookingResponse,
} from "@nexos/shared";
import { ConfirmationScreen } from "@/components/public/confirmation-screen";
import { ErrorFeedback } from "@/components/public/error-feedback";
import { LoadingState } from "@/components/loading-state";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { cn } from "@/lib/utils";
import { formatPhoneBR, PHONE_MAX_LENGTH } from "@/lib/phone";
import { useStableIdempotencyKey } from "@/hooks/use-stable-idempotency-key";
import { Scissors, User, CalendarDays, Star, ChevronLeft, ChevronRight } from "lucide-react";

type Step = "form" | "confirming" | "done" | "error";

interface ClientInfo {
  name: string;
  phone: string;
}

interface ErrorState {
  code: string;
  message: string;
  requestId: string;
  retryAfterSeconds?: number;
}

interface BookingFlowProps {
  orgSlug: string;
  vitrine: PublicVitrineResponse;
  className?: string;
}

const CAT_VARS = [1, 5, 2, 4, 3]; // cyan, violet, emerald, rose, amber

function getCivilDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCivilDays(dateStr: string, amount: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + amount));
  return next.toISOString().slice(0, 10);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year!, month! - 1, 1),
  );
}

function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year!, month! - 1 + offset, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

// Grade de 6 semanas (42 células) começando no domingo, como no protótipo.
function buildMonthGrid(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year!, month! - 1, 1);
  const start = new Date(year!, month! - 1, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return {
      date: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(
        current.getDate(),
      ).padStart(2, "0")}`,
      dayNumber: current.getDate(),
      inMonth: current.getMonth() === month! - 1,
    };
  });
}

const CAL_WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function formatSummaryWhen(dateStr: string, iso: string, tz: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12));
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: tz })
    .format(date)
    .replace(".", "");
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: tz })
    .format(date)
    .replace(".", "");
  return `${weekday}, ${d} ${month} · ${formatTime(iso, tz)}`;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    cents / 100,
  );
}

export function BookingFlow({ orgSlug, vitrine, className }: BookingFlowProps) {
  const [step, setStep] = useState<Step>("form");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedProfessionalSlug, setSelectedProfessionalSlug] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const [client, setClient] = useState<ClientInfo>({ name: "", phone: "" });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [inlineErrors, setInlineErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<{
    professionalName: string;
    serviceName: string;
    startsAt: string;
    endsAt: string;
    cancelUrl: string;
  } | null>(null);

  const availabilityAbortRef = useRef<AbortController | null>(null);
  const { getKey, resetKey } = useStableIdempotencyKey();

  const selectedService = vitrine.services.find((s) => s.id === selectedServiceId);
  const selectedProfessional = vitrine.professionals.find(
    (p) => p.slug === selectedProfessionalSlug,
  );

  // Serviços oferecidos pelo profissional escolhido (backend rejeita combinação não vinculada).
  const offeredServices = useMemo(() => {
    if (!selectedProfessionalSlug) return vitrine.services;
    return vitrine.services.filter((s) =>
      s.professionalSlugs.includes(selectedProfessionalSlug),
    );
  }, [vitrine.services, selectedProfessionalSlug]);

  const fetchAvailability = useCallback(
    async (professionalSlug: string, serviceId: string) => {
      availabilityAbortRef.current?.abort();
      const controller = new AbortController();
      availabilityAbortRef.current = controller;

      setAvailabilityLoading(true);
      setError(null);

      const from = getCivilDateInTimeZone(new Date(), vitrine.timezone);
      const to = addCivilDays(from, 7);

      try {
        const result = await apiFetch<AvailabilityResponse>(
          `/api/v1/public/${orgSlug}/professionals/${encodeURIComponent(professionalSlug)}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${encodeURIComponent(serviceId)}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setAvailability(result);
          const firstDay = result.days.find((d) => d.slots.length > 0);
          setSelectedDate(firstDay?.date ?? result.days[0]?.date ?? null);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;
        if (err instanceof ApiError) {
          setError({
            code: err.code,
            message: err.message,
            requestId: err.requestId,
            retryAfterSeconds: err.status === 429 ? 5 : undefined,
          });
        } else {
          setError({
            code: INTERNAL_ERROR,
            message: "Erro ao buscar horarios disponiveis.",
            requestId: "",
          });
        }
        setStep("error");
      } finally {
        if (!controller.signal.aborted) {
          setAvailabilityLoading(false);
        }
      }
    },
    [orgSlug, vitrine.timezone],
  );

  useEffect(() => {
    return () => {
      availabilityAbortRef.current?.abort();
    };
  }, []);

  const maybeFetch = useCallback(
    (pro: string | null, svc: string | null) => {
      if (pro && svc) fetchAvailability(pro, svc);
    },
    [fetchAvailability],
  );

  const handleSelectProfessional = useCallback(
    (slug: string) => {
      resetKey();
      setNotice(null);
      setSelectedProfessionalSlug(slug);
      setSelectedSlot(null);
      setSelectedDate(null);
      setAvailability(null);
      // Mantém o serviço apenas se o novo profissional o oferece.
      const keptService =
        selectedServiceId &&
        vitrine.services
          .find((s) => s.id === selectedServiceId)
          ?.professionalSlugs.includes(slug)
          ? selectedServiceId
          : null;
      setSelectedServiceId(keptService);
      maybeFetch(slug, keptService);
    },
    [resetKey, selectedServiceId, vitrine.services, maybeFetch],
  );

  const handleSelectService = useCallback(
    (serviceId: string) => {
      resetKey();
      setNotice(null);
      setSelectedServiceId(serviceId);
      setSelectedSlot(null);
      setSelectedDate(null);
      setAvailability(null);
      maybeFetch(selectedProfessionalSlug, serviceId);
    },
    [resetKey, selectedProfessionalSlug, maybeFetch],
  );

  const handleConfirm = useCallback(async () => {
    const errors: Record<string, string> = {};
    if (!selectedProfessionalSlug) errors.professional = "Escolha um profissional.";
    if (!selectedServiceId) errors.service = "Escolha um serviço.";
    if (!selectedSlot) errors.slot = "Escolha um horário.";
    if (!client.name.trim()) errors.name = "Nome é obrigatório.";
    if (!client.phone.trim()) errors.phone = "Telefone é obrigatório.";
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!selectedServiceId || !selectedProfessionalSlug || !selectedSlot) return;

    setStep("confirming");
    setError(null);
    setInlineErrors({});

    const payload = {
      professionalSlug: selectedProfessionalSlug,
      serviceId: selectedServiceId,
      startsAt: selectedSlot.startsAt,
      client: { name: client.name.trim(), phone: client.phone.trim() },
      consent: true as const,
    };

    try {
      const result = await apiFetch<PublicBookingResponse>(
        `/api/v1/public/${orgSlug}/appointments`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Idempotency-Key": getKey() },
        },
      );

      setBookingResult({
        professionalName: result.professional.name,
        serviceName: result.service.name,
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        cancelUrl: result.cancelUrl,
      });
      resetKey();
      setStep("done");
    } catch (err) {
      if (err instanceof ApiError) {
        resetKey();

        if (err.code === "APPOINTMENT_CONFLICT") {
          setSelectedSlot(null);
          setNotice(
            "Este horário acabou de ser reservado. Atualizamos os horários disponíveis.",
          );
          setStep("form");
          if (selectedServiceId && selectedProfessionalSlug) {
            fetchAvailability(selectedProfessionalSlug, selectedServiceId);
          }
          return;
        }

        if (err.code === "RATE_LIMITED") {
          setError({
            code: err.code,
            message: err.message,
            requestId: err.requestId,
            retryAfterSeconds: 5,
          });
          setStep("error");
          return;
        }

        if (err.code === "VALIDATION_ERROR") {
          const fieldErrors: Record<string, string> = {};
          const summaryErrors: Record<string, string> = {};
          if (Array.isArray(err.details)) {
            for (const detail of err.details) {
              if (detail.field === "client.name") fieldErrors.name = detail.issue;
              else if (detail.field === "client.phone") fieldErrors.phone = detail.issue;
              else summaryErrors[detail.field] = detail.issue;
            }
          }
          setClientErrors(fieldErrors);
          setInlineErrors(summaryErrors);
          if (Object.keys(fieldErrors).length === 0 && Object.keys(summaryErrors).length === 0) {
            setError({ code: err.code, message: err.message, requestId: err.requestId });
            setStep("error");
          } else {
            setStep("form");
          }
          return;
        }

        setError({ code: err.code, message: err.message, requestId: err.requestId });
        setStep("error");
      } else {
        setError({
          code: INTERNAL_ERROR,
          message: "Erro inesperado ao confirmar agendamento.",
          requestId: "",
        });
        setStep("error");
      }
    }
  }, [
    orgSlug,
    selectedServiceId,
    selectedProfessionalSlug,
    selectedSlot,
    client,
    fetchAvailability,
    getKey,
    resetKey,
  ]);

  function handleNewBooking() {
    resetKey();
    setStep("form");
    setSelectedServiceId(null);
    setSelectedProfessionalSlug(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setClient({ name: "", phone: "" });
    setAvailability(null);
    setBookingResult(null);
    setError(null);
    setClientErrors({});
    setInlineErrors({});
    setNotice(null);
  }

  function handleErrorRetry() {
    setError(null);
    setStep("form");
    if (selectedProfessionalSlug && selectedServiceId) {
      fetchAvailability(selectedProfessionalSlug, selectedServiceId);
    }
  }

  if (step === "done" && bookingResult) {
    return (
      <ConfirmationScreen
        professionalName={bookingResult.professionalName}
        serviceName={bookingResult.serviceName}
        startsAt={bookingResult.startsAt}
        endsAt={bookingResult.endsAt}
        cancelUrl={bookingResult.cancelUrl}
        timezone={vitrine.timezone}
        onNewBooking={handleNewBooking}
        className={className}
      />
    );
  }

  if (step === "error" && error) {
    return (
      <ErrorFeedback
        code={error.code}
        message={error.message}
        requestId={error.requestId}
        retryAfterSeconds={error.retryAfterSeconds}
        onRetry={handleErrorRetry}
        className={className}
      />
    );
  }

  const daysWithSlots = availability?.days ?? [];
  const activeDay = daysWithSlots.find((d) => d.date === selectedDate) ?? null;

  // ---- calendário mensal (janela de 7 dias: só os dias buscados são clicáveis) ----
  const availableDates = useMemo(
    () =>
      new Set(
        daysWithSlots.filter((d) => d.slots.length > 0).map((d) => d.date),
      ),
    [daysWithSlots],
  );
  const [calMonth, setCalMonth] = useState<string | null>(null);
  // Recentraliza o calendário sempre que a disponibilidade muda (novo pro/serviço).
  useEffect(() => {
    setCalMonth(null);
  }, [availability]);
  const visibleMonth =
    calMonth ??
    getMonthKey(
      selectedDate ??
        daysWithSlots.find((d) => d.slots.length > 0)?.date ??
        getCivilDateInTimeZone(new Date(), vitrine.timezone),
    );
  const monthCells = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)]",
        className,
      )}
    >
      {/* header */}
      <div className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[radial-gradient(120%_130%_at_0%_0%,#0e2230_0%,#0b1019_60%)] px-7 py-7">
        <div
          style={{ background: "var(--gradient-accent)" }}
          className="flex h-[60px] w-[60px] items-center justify-center rounded-[16px] text-[var(--color-primary-foreground)] shadow-[0_10px_24px_rgba(8,145,178,0.4)]"
        >
          <Scissors className="h-[30px] w-[30px]" strokeWidth={2.3} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[23px] font-extrabold tracking-[-0.02em] text-[var(--color-foreground)]">
            {vitrine.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-muted-foreground)]">
            <Star className="h-3.5 w-3.5 fill-[#fbbf24] text-[#fbbf24]" />
            Agendamento online
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px]">
        {/* ---- steps ---- */}
        <div className="flex flex-col gap-7 p-7">
          {/* PASSO 1 — profissional */}
          <section>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent-strong)]">
              Passo 1
            </div>
            <h2 className="mb-3.5 mt-1 text-[15px] font-extrabold text-[var(--color-foreground)]">
              Escolha o profissional
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {vitrine.professionals.map((pro, i) => {
                const active = pro.slug === selectedProfessionalSlug;
                const v = CAT_VARS[i % CAT_VARS.length];
                return (
                  <button
                    key={pro.slug}
                    type="button"
                    onClick={() => handleSelectProfessional(pro.slug)}
                    className={cn(
                      "flex flex-col items-center rounded-[13px] border px-2 py-3.5 text-center transition-colors",
                      active
                        ? "border-[var(--color-primary)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] hover:border-[var(--color-accent-strong)]",
                    )}
                  >
                    <span
                      className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-[14px] font-bold"
                      style={{ background: `var(--cat-${v}-bg)`, color: `var(--cat-${v}-ink)` }}
                    >
                      {getInitials(pro.name)}
                    </span>
                    <span className="mt-2 truncate text-[12.5px] font-bold text-[var(--color-foreground)]">
                      {pro.name}
                    </span>
                  </button>
                );
              })}
            </div>
            {clientErrors.professional ? (
              <p className="mt-2 text-xs text-[var(--color-destructive)]">{clientErrors.professional}</p>
            ) : null}
          </section>

          {/* PASSO 2 — serviço */}
          <section>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent-strong)]">
              Passo 2
            </div>
            <h2 className="mb-3.5 mt-1 text-[15px] font-extrabold text-[var(--color-foreground)]">
              Escolha o serviço
            </h2>
            {offeredServices.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Este profissional não tem serviços disponíveis.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {offeredServices.map((svc) => {
                  const active = svc.id === selectedServiceId;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => handleSelectService(svc.id)}
                      className={cn(
                        "flex items-center gap-3.5 rounded-[12px] border px-3.5 py-3 text-left transition-colors",
                        active
                          ? "border-[var(--color-primary)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] hover:border-[var(--color-accent-strong)]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                          active ? "border-[var(--color-primary)]" : "border-[var(--color-border-strong)]",
                        )}
                      >
                        {active ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-[var(--color-foreground)]">
                          {svc.name}
                        </span>
                        <span className="block text-[11.5px] text-[var(--color-muted-foreground)]">
                          {svc.durationMin} min
                        </span>
                      </span>
                      <span className="text-[14px] font-extrabold text-[var(--color-foreground)]">
                        {formatPrice(svc.priceCents, svc.currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {clientErrors.service ? (
              <p className="mt-2 text-xs text-[var(--color-destructive)]">{clientErrors.service}</p>
            ) : null}
          </section>

          {/* PASSO 3 — data e horário */}
          <section>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent-strong)]">
              Passo 3
            </div>
            <h2 className="mb-3.5 mt-1 text-[15px] font-extrabold text-[var(--color-foreground)]">
              Escolha a data
            </h2>

            {notice ? (
              <div className="mb-3 rounded-[10px] border border-[var(--cat-3-line)] bg-[var(--cat-3-bg)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--cat-3-ink)]">
                {notice}
              </div>
            ) : null}

            {!selectedProfessionalSlug || !selectedServiceId ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Selecione profissional e serviço para ver os horários.
              </p>
            ) : availabilityLoading ? (
              <LoadingState message="Buscando horários..." />
            ) : daysWithSlots.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Nenhum horário disponível nos próximos dias.
              </p>
            ) : (
              <>
                <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] p-4">
                  <div className="mb-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-extrabold capitalize text-[var(--color-foreground)]">
                        {getMonthLabel(visibleMonth)}
                      </span>
                      <span className="rounded-full bg-[var(--cat-1-bg)] px-2.5 py-[3px] text-[11px] font-bold text-[var(--cat-1-ink)]">
                        Esta semana
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[var(--color-muted-foreground)]">
                      <button
                        type="button"
                        aria-label="Mês anterior"
                        onClick={() => setCalMonth(shiftMonth(visibleMonth, -1))}
                        className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors hover:bg-[var(--color-surface-operational-strong)] hover:text-[var(--color-foreground)]"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Próximo mês"
                        onClick={() => setCalMonth(shiftMonth(visibleMonth, 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors hover:bg-[var(--color-surface-operational-strong)] hover:text-[var(--color-foreground)]"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {CAL_WEEKDAYS.map((w, i) => (
                      <div
                        key={i}
                        className="text-center text-[10.5px] font-bold text-[var(--color-muted-foreground)]"
                      >
                        {w}
                      </div>
                    ))}
                  </div>

                  <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                    {monthCells.map((cell) => {
                      const available = availableDates.has(cell.date);
                      const active = available && cell.date === selectedDate;
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          disabled={!available}
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedDate(cell.date);
                            setSelectedSlot(null);
                          }}
                          style={active ? { background: "var(--gradient-accent)" } : undefined}
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-[8px] text-[13px] font-bold transition-colors",
                            active
                              ? "text-[var(--color-primary-foreground)]"
                              : available
                                ? "border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] text-[var(--color-foreground)] hover:border-[var(--color-accent-strong)]"
                                : cn(
                                    "cursor-not-allowed text-[var(--color-muted-foreground)]",
                                    cell.inMonth ? "opacity-55" : "opacity-25",
                                  ),
                          )}
                        >
                          {cell.dayNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 text-[12px] font-bold text-[var(--color-muted-foreground)]">
                  Horários disponíveis
                </div>
                {activeDay && activeDay.slots.length > 0 ? (
                  <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {activeDay.slots.map((slot) => {
                      const active = selectedSlot?.startsAt === slot.startsAt;
                      return (
                        <button
                          key={slot.startsAt}
                          type="button"
                          onClick={() =>
                            setSelectedSlot({
                              date: activeDay.date,
                              startsAt: slot.startsAt,
                              endsAt: slot.endsAt,
                            })
                          }
                          style={active ? { background: "var(--gradient-accent)" } : undefined}
                          className={cn(
                            "rounded-[10px] py-2.5 text-center text-[12.5px] font-bold transition-colors",
                            active
                              ? "text-[var(--color-primary-foreground)]"
                              : "border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] text-[var(--color-foreground)] hover:border-[var(--color-accent-strong)]",
                          )}
                        >
                          {formatTime(slot.startsAt, vitrine.timezone)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                    Sem horários neste dia.
                  </p>
                )}
                {clientErrors.slot ? (
                  <p className="mt-2 text-xs text-[var(--color-destructive)]">{clientErrors.slot}</p>
                ) : null}
              </>
            )}
          </section>
        </div>

        {/* ---- summary sidebar ---- */}
        <div className="flex flex-col border-t border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] p-6 lg:border-l lg:border-t-0">
          <div className="mb-4 text-sm font-extrabold text-[var(--color-foreground)]">
            Seu agendamento
          </div>

          <div className="flex flex-col gap-3.5">
            <SummaryRow
              icon={<Scissors className="h-4 w-4" />}
              label="Serviço"
              value={selectedService?.name ?? "—"}
            />
            <SummaryRow
              icon={<User className="h-4 w-4" />}
              label="Profissional"
              value={selectedProfessional?.name ?? "—"}
            />
            <SummaryRow
              icon={<CalendarDays className="h-4 w-4" />}
              label="Data e hora"
              value={
                selectedSlot
                  ? formatSummaryWhen(selectedSlot.date, selectedSlot.startsAt, vitrine.timezone)
                  : "—"
              }
            />
          </div>

          <div className="my-5 h-px bg-[var(--color-border)]" />

          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[var(--color-muted-foreground)]">
              Total
            </span>
            <span className="text-[22px] font-extrabold tracking-[-0.02em] text-[var(--color-accent-strong)]">
              {selectedService ? formatPrice(selectedService.priceCents, selectedService.currency) : "—"}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            <Input
              placeholder="Seu nome"
              value={client.name}
              autoComplete="name"
              aria-invalid={!!clientErrors.name}
              onChange={(e) => {
                setClient((prev) => ({ ...prev, name: e.target.value }));
                if (clientErrors.name) {
                  setClientErrors((prev) => {
                    const next = { ...prev };
                    delete next.name;
                    return next;
                  });
                }
              }}
            />
            {clientErrors.name ? (
              <p className="text-xs text-[var(--color-destructive)]">{clientErrors.name}</p>
            ) : null}
            <Input
              type="tel"
              inputMode="tel"
              maxLength={PHONE_MAX_LENGTH}
              placeholder="Telefone (WhatsApp)"
              value={client.phone}
              autoComplete="tel"
              aria-invalid={!!clientErrors.phone}
              onChange={(e) => {
                const masked = formatPhoneBR(e.target.value);
                setClient((prev) => ({ ...prev, phone: masked }));
                if (clientErrors.phone) {
                  setClientErrors((prev) => {
                    const next = { ...prev };
                    delete next.phone;
                    return next;
                  });
                }
              }}
            />
            {clientErrors.phone ? (
              <p className="text-xs text-[var(--color-destructive)]">{clientErrors.phone}</p>
            ) : null}
          </div>

          {Object.keys(inlineErrors).length > 0 ? (
            <div
              role="alert"
              className="mt-3 rounded-[10px] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-3"
            >
              {Object.entries(inlineErrors).map(([field, issue]) => (
                <p key={field} className="text-xs text-[var(--color-destructive)]">
                  {issue}
                </p>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={step === "confirming"}
            style={{ background: "var(--gradient-accent)" }}
            className="mt-3.5 rounded-[11px] px-4 py-3.5 text-center text-[14px] font-extrabold text-[var(--color-primary-foreground)] shadow-[0_8px_20px_rgba(8,145,178,0.32)] transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {step === "confirming" ? "Confirmando..." : "Confirmar agendamento"}
          </button>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
            Você receberá a confirmação no WhatsApp. Ao confirmar, autoriza o uso do seu nome e
            telefone para este agendamento, conforme a LGPD.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold text-[var(--color-muted-foreground)]">
          {label}
        </div>
        <div className="truncate text-[13px] font-bold text-[var(--color-foreground)]">{value}</div>
      </div>
    </div>
  );
}
