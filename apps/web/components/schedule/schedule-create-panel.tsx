"use client";

import type {
  AvailabilityResponse,
  AvailabilitySlot,
  CreateAppointmentInput,
  ErrorBody,
  ProfessionalDTO,
  ServiceDTO,
} from "@nexos/shared";
import { ScheduleFilters } from "@/components/schedule/schedule-filters";
import { SlotPicker } from "@/components/schedule/slot-picker";
import { CreateAppointmentForm } from "@/components/schedule/create-appointment-form";
import { ErrorDisplay } from "@/components/error-display";
import { LoadingState } from "@/components/loading-state";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";

interface ScheduleCreatePanelProps {
  professionals: ProfessionalDTO[] | undefined;
  services: ServiceDTO[] | undefined;
  professionalHasNoServices?: boolean;
  professionalId: string | null;
  serviceId: string | null;
  date: string;
  selectedSlot: AvailabilitySlot | null;
  availability: AvailabilityResponse | undefined;
  availabilityLoading: boolean;
  availabilityError: unknown;
  isPending: boolean;
  onProfessionalChange: (id: string) => void;
  onServiceChange: (id: string) => void;
  onDateChange: (date: string) => void;
  onSelectSlot: (slot: AvailabilitySlot) => void;
  onSubmit: (input: CreateAppointmentInput, idempotencyKey: string) => Promise<void>;
  onClearSlot: () => void;
}

export function ScheduleCreatePanel({
  professionals,
  services,
  professionalHasNoServices = false,
  professionalId,
  serviceId,
  date,
  selectedSlot,
  availability,
  availabilityLoading,
  availabilityError,
  isPending,
  onProfessionalChange,
  onServiceChange,
  onDateChange,
  onSelectSlot,
  onSubmit,
  onClearSlot,
}: ScheduleCreatePanelProps) {
  const canSearchSlots = Boolean(professionalId && serviceId);

  let availabilityErrorBody: ErrorBody | null = null;

  if (availabilityError) {
    availabilityErrorBody =
      availabilityError instanceof ApiError
        ? {
            code: availabilityError.code as ErrorBody["code"],
            message: availabilityError.message,
            requestId: availabilityError.requestId,
            timestamp: new Date().toISOString() as never,
          }
        : {
            code: INTERNAL_ERROR,
            message: "Erro ao carregar disponibilidade",
            requestId: "",
            timestamp: new Date().toISOString() as never,
          };
  }

  return (
    <div className="space-y-4">
      <ScheduleFilters
        professionals={professionals}
        services={services}
        professionalId={professionalId}
        serviceId={serviceId}
        date={date}
        onProfessionalChange={onProfessionalChange}
        onServiceChange={onServiceChange}
        onDateChange={onDateChange}
        disabled={false}
      />

      {professionalHasNoServices ? (
        <div className="rounded-[20px] border border-dashed border-amber-400/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
          Este profissional ainda não oferece nenhum serviço. Vincule serviços a
          ele em <span className="font-medium">Profissionais → Serviços</span>{" "}
          antes de agendar.
        </div>
      ) : !canSearchSlots ? (
        <div className="rounded-[20px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] px-4 py-4 text-sm text-[var(--color-muted-foreground)]">
          Selecione profissional e serviço para ver horários disponíveis.
        </div>
      ) : availabilityErrorBody ? (
        <ErrorDisplay error={availabilityErrorBody} onRetry={() => undefined} />
      ) : selectedSlot ? (
        <CreateAppointmentForm
          professionalId={professionalId!}
          serviceId={serviceId!}
          startsAt={selectedSlot.startsAt}
          isPending={isPending}
          onSubmit={onSubmit}
          onCancel={onClearSlot}
        />
      ) : (
        <div className="space-y-3">
          {availabilityLoading ? (
            <LoadingState variant="inline" message="Buscando horários..." />
          ) : null}
          <SlotPicker
            data={availability}
            isLoading={availabilityLoading}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
          />
        </div>
      )}
    </div>
  );
}
