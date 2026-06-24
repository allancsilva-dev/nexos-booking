"use client";

import type { ProfessionalDTO, ServiceDTO } from "@nexos/shared";

interface Props {
  professionals: ProfessionalDTO[] | undefined;
  services: ServiceDTO[] | undefined;
  professionalId: string | null;
  serviceId: string | null;
  date: string;
  onProfessionalChange: (id: string) => void;
  onServiceChange: (id: string) => void;
  onDateChange: (date: string) => void;
  disabled: boolean;
}

export function ScheduleFilters({
  professionals,
  services,
  professionalId,
  serviceId,
  date,
  onProfessionalChange,
  onServiceChange,
  onDateChange,
  disabled,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={professionalId ?? ""}
        onChange={(e) => onProfessionalChange(e.target.value)}
        disabled={disabled}
        className="h-9 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)]"
      >
        <option value="">Profissional</option>
        {professionals?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={serviceId ?? ""}
        onChange={(e) => onServiceChange(e.target.value)}
        disabled={disabled || !professionalId}
        className="h-9 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)]"
      >
        <option value="">Serviço</option>
        {services?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.durationMin}min)
          </option>
        ))}
      </select>

      <input
        type="date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        disabled={disabled || !professionalId || !serviceId}
        className="h-9 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)]"
      />
    </div>
  );
}
