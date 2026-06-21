"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  PublicVitrineResponse,
  AvailabilityResponse,
  PublicBookingResponse,
} from "@nexos/shared";
import { VitrineDisplay } from "@/components/public/vitrine-display";
import { SlotPicker } from "@/components/public/slot-picker";
import { ErrorFeedback } from "@/components/public/error-feedback";
import { ConfirmationScreen } from "@/components/public/confirmation-screen";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { cn } from "@/lib/utils";

type Step = "service" | "professional" | "slot" | "client" | "confirm" | "confirming" | "done" | "error";

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

export function BookingFlow({ orgSlug, vitrine, className }: BookingFlowProps) {
  const [step, setStep] = useState<Step>("service");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedProfessionalSlug, setSelectedProfessionalSlug] = useState<string | null>(null);
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
  const [bookingResult, setBookingResult] = useState<{
    professionalName: string;
    serviceName: string;
    startsAt: string;
    endsAt: string;
    cancelToken: string;
  } | null>(null);

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const availabilityAbortRef = useRef<AbortController | null>(null);

  const selectedService = vitrine.services.find((s) => s.id === selectedServiceId);

  const fetchAvailability = useCallback(
    async (professionalSlug: string, serviceId: string) => {
      availabilityAbortRef.current?.abort();
      const controller = new AbortController();
      availabilityAbortRef.current = controller;

      setAvailabilityLoading(true);
      setError(null);

      const now = new Date();
      const from = now.toISOString();
      const to = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      try {
        const result = await apiFetch<AvailabilityResponse>(
          `/api/v1/public/${orgSlug}/professionals/${encodeURIComponent(professionalSlug)}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${encodeURIComponent(serviceId)}`,
          {
            signal: controller.signal,
          }
        );
        if (!controller.signal.aborted) {
          setAvailability(result);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof ApiError) {
          if (!controller.signal.aborted) {
            setError({
              code: err.code,
              message: err.message,
              requestId: err.requestId,
              retryAfterSeconds: err.status === 429 ? 5 : undefined,
            });
            setStep("error");
          }
        } else {
          if (!controller.signal.aborted) {
            setError({
              code: INTERNAL_ERROR,
              message: "Erro ao buscar horarios disponiveis.",
              requestId: "",
            });
            setStep("error");
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setAvailabilityLoading(false);
        }
      }
    },
    [orgSlug]
  );

  useEffect(() => {
    return () => {
      availabilityAbortRef.current?.abort();
    };
  }, []);

  const handleSelectService = useCallback(
    (serviceId: string) => {
      setSelectedServiceId(serviceId);
      setSelectedProfessionalSlug(null);
      setSelectedSlot(null);
      setAvailability(null);
      setStep("professional");
    },
    []
  );

  const handleSelectProfessional = useCallback(
    (professionalSlug: string) => {
      setSelectedProfessionalSlug(professionalSlug);
      setSelectedSlot(null);
      setAvailability(null);
      if (selectedServiceId) {
        fetchAvailability(professionalSlug, selectedServiceId);
      }
      setStep("slot");
    },
    [selectedServiceId, fetchAvailability]
  );

  const handleSelectSlot = useCallback(
    (slot: { date: string; startsAt: string; endsAt: string }) => {
      setSelectedSlot(slot);
      setStep("client");
    },
    []
  );

  const handleClientSubmit = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!client.name.trim()) errors.name = "Nome e obrigatorio.";
    if (!client.phone.trim()) errors.phone = "Telefone e obrigatorio.";
    setClientErrors(errors);

    if (Object.keys(errors).length === 0) {
      setStep("confirm");
    }
  }, [client]);

  const [inlineErrors, setInlineErrors] = useState<Record<string, string>>({});

  const handleConfirmBooking = useCallback(async () => {
    if (!selectedServiceId || !selectedProfessionalSlug || !selectedSlot) return;

    setStep("confirming");
    setError(null);
    setInlineErrors({});

    const payload = {
      professionalSlug: selectedProfessionalSlug,
      serviceId: selectedServiceId,
      startsAt: selectedSlot.startsAt,
      client: {
        name: client.name.trim(),
        phone: client.phone.trim(),
      },
      consent: true as const,
    };

    try {
      const result = await apiFetch<PublicBookingResponse>(
        `/api/v1/public/${orgSlug}/appointments`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Idempotency-Key": idempotencyKeyRef.current,
          },
        }
      );

      const cancelTokenMatch = result.cancelUrl.match(/\/cancelar\/(.+)$/);
      const cancelToken = cancelTokenMatch
        ? cancelTokenMatch[1]
        : result.cancelUrl;

      setBookingResult({
        professionalName: result.professional.name,
        serviceName: result.service.name,
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        cancelToken,
      });
      setStep("done");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "APPOINTMENT_CONFLICT") {
          setStep("error");
          setError({
            code: err.code,
            message: err.message,
            requestId: err.requestId,
          });

          if (selectedServiceId && selectedProfessionalSlug) {
            fetchAvailability(selectedProfessionalSlug, selectedServiceId);
          }
          setSelectedSlot(null);
          return;
        }

        if (err.code === "RATE_LIMITED") {
          setStep("error");
          setError({
            code: err.code,
            message: err.message,
            requestId: err.requestId,
            retryAfterSeconds: 5,
          });
          return;
        }

        if (err.code === "VALIDATION_ERROR") {
          const fieldErrors: Record<string, string> = {};
          if (Array.isArray(err.details)) {
            for (const detail of err.details) {
              fieldErrors[detail.field] = detail.issue;
            }
          }
          if (Object.keys(fieldErrors).length > 0) {
            setInlineErrors(fieldErrors);
            setStep("confirm");
          } else {
            setStep("error");
            setError({
              code: err.code,
              message: err.message,
              requestId: err.requestId,
            });
          }
          return;
        }

        setStep("error");
        setError({
          code: err.code,
          message: err.message,
          requestId: err.requestId,
        });
      } else {
        setStep("error");
        setError({
          code: INTERNAL_ERROR,
          message: "Erro inesperado ao confirmar agendamento.",
          requestId: "",
        });
      }
    }
  }, [
    orgSlug,
    selectedServiceId,
    selectedProfessionalSlug,
    selectedSlot,
    client,
    fetchAvailability,
  ]);

  function handleBack() {
    switch (step) {
      case "professional":
        setStep("service");
        setSelectedProfessionalSlug(null);
        setSelectedSlot(null);
        setAvailability(null);
        break;
      case "slot":
        setStep("professional");
        setSelectedSlot(null);
        setAvailability(null);
        break;
      case "client":
        setStep("slot");
        setClientErrors({});
        break;
      case "confirm":
        setStep("client");
        break;
      default:
        break;
    }
  }

  function handleErrorRetry() {
    setError(null);

    if (
      selectedServiceId &&
      selectedProfessionalSlug &&
      (step === "slot" || step === "error")
    ) {
      setStep("slot");
      fetchAvailability(selectedProfessionalSlug, selectedServiceId);
    } else if (step === "confirm" || step === "confirming") {
      setStep("confirm");
    }
  }

  function handleConflictRefetch() {
    setError(null);
    setStep("slot");
    if (selectedServiceId && selectedProfessionalSlug) {
      fetchAvailability(selectedProfessionalSlug, selectedServiceId);
    }
  }

  function handleNewBooking() {
    setStep("service");
    setSelectedServiceId(null);
    setSelectedProfessionalSlug(null);
    setSelectedSlot(null);
    setClient({ name: "", phone: "" });
    setAvailability(null);
    setBookingResult(null);
    setError(null);
    setClientErrors({});
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  if (step === "done" && bookingResult) {
    return (
      <ConfirmationScreen
        professionalName={bookingResult.professionalName}
        serviceName={bookingResult.serviceName}
        startsAt={bookingResult.startsAt}
        endsAt={bookingResult.endsAt}
        cancelToken={bookingResult.cancelToken}
        onNewBooking={handleNewBooking}
        className={className}
      />
    );
  }

  if (step === "error" && error) {
    return (
      <ErrorFeedback
        code={error.code}
        message={
          error.code === "APPOINTMENT_CONFLICT"
            ? "Este horario acabou de ser reservado. Os horarios disponiveis foram atualizados."
            : error.message
        }
        requestId={error.requestId}
        retryAfterSeconds={error.retryAfterSeconds}
        onRetry={error.code === "APPOINTMENT_CONFLICT" ? undefined : handleErrorRetry}
        onRefetch={error.code === "APPOINTMENT_CONFLICT" ? handleConflictRefetch : undefined}
        className={className}
      />
    );
  }

  if (step === "confirming") {
    return (
      <LoadingState message="Confirmando agendamento..." className={className} />
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <nav aria-label="Etapas do agendamento" className="flex items-center gap-1 text-sm">
        {(["service", "professional", "slot", "client", "confirm"] as Step[]).map(
          (s, i) => {
            const stepLabels: Record<Step, string> = {
              service: "Servico",
              professional: "Profissional",
              slot: "Horario",
              client: "Dados",
              confirm: "Confirmar",
              confirming: "Confirmar",
              done: "Concluido",
              error: "Erro",
            };

            const currentIdx = [
              "service",
              "professional",
              "slot",
              "client",
              "confirm",
            ].indexOf(step);

            const isActive = i === currentIdx;
            const isPast = i < currentIdx;

            return (
              <span key={s} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-[var(--color-muted-foreground)]" aria-hidden="true">
                    /
                  </span>
                )}
                <span
                  className={cn(
                    isActive && "text-[var(--color-primary)] font-semibold",
                    isPast && "text-[var(--color-muted-foreground)]",
                    !isActive && !isPast && "text-[var(--color-muted-foreground)]"
                  )}
                >
                  {stepLabels[s]}
                </span>
              </span>
            );
          }
        )}
      </nav>

      {step === "service" && (
        <VitrineDisplay
          data={vitrine}
          onSelectService={handleSelectService}
          selectedServiceId={selectedServiceId ?? undefined}
        />
      )}

      {step === "professional" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack} aria-label="Voltar">
              Voltar
            </Button>
          </div>

          {selectedService && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Servico selecionado</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-[var(--color-foreground)]">
                  {selectedService.name} · {selectedService.durationMin}min ·{" "}
                  {(selectedService.priceCents / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: selectedService.currency,
                  })}
                </span>
              </CardContent>
            </Card>
          )}

          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            Escolha o profissional
          </h2>
          <ul className="grid gap-3" role="listbox" aria-label="Profissionais">
            {vitrine.professionals.map((pro) => (
              <li key={pro.slug} role="option" aria-selected={selectedProfessionalSlug === pro.slug}>
                <button
                  type="button"
                  className={cn(
                    "w-full text-left rounded-[var(--radius-card)] border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                    selectedProfessionalSlug === pro.slug
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-muted-foreground)]"
                  )}
                  onClick={() => handleSelectProfessional(pro.slug)}
                >
                  <span className="text-sm font-medium text-[var(--color-foreground)]">
                    {pro.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === "slot" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack} aria-label="Voltar">
              Voltar
            </Button>
          </div>

          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            Escolha o horario
          </h2>

          {availabilityLoading ? (
            <LoadingState message="Buscando horarios..." />
          ) : availability ? (
            <SlotPicker
              days={availability.days}
              timezone={availability.timezone}
              selectedSlot={selectedSlot}
              onSelectSlot={handleSelectSlot}
              loading={availabilityLoading}
            />
          ) : null}
        </div>
      )}

      {step === "client" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack} aria-label="Voltar">
              Voltar
            </Button>
          </div>

          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            Seus dados
          </h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Nome</Label>
              <Input
                id="client-name"
                type="text"
                placeholder="Seu nome completo"
                value={client.name}
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
                aria-invalid={!!clientErrors.name}
                aria-describedby={clientErrors.name ? "client-name-error" : undefined}
                autoComplete="name"
              />
              {clientErrors.name && (
                <p id="client-name-error" className="text-sm text-[var(--color-destructive)]">
                  {clientErrors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-phone">Telefone</Label>
              <Input
                id="client-phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={client.phone}
                onChange={(e) => {
                  setClient((prev) => ({ ...prev, phone: e.target.value }));
                  if (clientErrors.phone) {
                    setClientErrors((prev) => {
                      const next = { ...prev };
                      delete next.phone;
                      return next;
                    });
                  }
                }}
                aria-invalid={!!clientErrors.phone}
                aria-describedby={clientErrors.phone ? "client-phone-error" : undefined}
                autoComplete="tel"
              />
              {clientErrors.phone && (
                <p id="client-phone-error" className="text-sm text-[var(--color-destructive)]">
                  {clientErrors.phone}
                </p>
              )}
            </div>

            <Button className="w-full" onClick={handleClientSubmit}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && selectedService && selectedSlot && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleBack} aria-label="Voltar">
              Voltar
            </Button>
          </div>

          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            Confirmar agendamento
          </h2>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">Servico</span>
                <span className="font-medium text-[var(--color-foreground)]">
                  {selectedService.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">Profissional</span>
                <span className="font-medium text-[var(--color-foreground)]">
                  {vitrine.professionals.find((p) => p.slug === selectedProfessionalSlug)?.name ??
                    selectedProfessionalSlug}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">Data/Hora</span>
                <span className="font-medium text-[var(--color-foreground)]">
                  {selectedSlot.startsAt}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">Nome</span>
                <span className="font-medium text-[var(--color-foreground)]">{client.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">Telefone</span>
                <span className="font-medium text-[var(--color-foreground)]">{client.phone}</span>
              </div>
            </CardContent>
          </Card>

          {Object.keys(inlineErrors).length > 0 && (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-4 space-y-1" role="alert">
              {Object.entries(inlineErrors).map(([field, issue]) => (
                <p key={field} className="text-sm text-[var(--color-destructive)]">
                  {issue}
                </p>
              ))}
            </div>
          )}

          <p className="text-xs text-[var(--color-muted-foreground)]">
            Ao confirmar, voce autoriza o armazenamento do seu nome e telefone para este agendamento,
            conforme a LGPD.
          </p>

          <Button className="w-full" onClick={handleConfirmBooking}>
            Confirmar agendamento
          </Button>
        </div>
      )}
    </div>
  );
}
