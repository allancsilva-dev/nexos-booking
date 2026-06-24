"use client";

import type { PublicVitrineResponse } from "@nexos/shared";
import { cn } from "@/lib/utils";

interface VitrineDisplayProps {
  data: PublicVitrineResponse;
  onSelectService?: (serviceId: string) => void;
  selectedServiceId?: string;
  className?: string;
}

function formatPrice(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency,
  });
}

export function VitrineDisplay({
  data,
  onSelectService,
  selectedServiceId,
  className,
}: VitrineDisplayProps) {
  return (
    <div className={cn("space-y-8", className)}>
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-[var(--color-foreground)]">
          {data.name}
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Agende seu horário online
        </p>
      </div>

      <section aria-labelledby="services-heading">
        <h2
          id="services-heading"
          className="text-lg font-semibold text-[var(--color-foreground)] mb-4"
        >
          Servicos
        </h2>
        {data.services.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Nenhum servico disponivel no momento.
          </p>
        ) : (
          <ul className="grid gap-3" role="list">
            {data.services.map((service) => {
              const isSelected = selectedServiceId === service.id;
              const hasProfessionals = service.professionalSlugs.length > 0;
              // Resolve slug → nome do catálogo data.professionals
              const professionalNames = service.professionalSlugs
                .map((slug) => data.professionals.find((p) => p.slug === slug)?.name)
                .filter((n): n is string => n != null);

              return (
                <li key={service.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left rounded-[var(--radius-card)] border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                      isSelected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-muted-foreground)]"
                    )}
                    onClick={() => hasProfessionals && onSelectService?.(service.id)}
                    aria-pressed={isSelected}
                    disabled={!hasProfessionals}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium text-[var(--color-foreground)]">
                          {service.name}
                        </span>
                        <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                          {service.durationMin}min
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-[var(--color-foreground)]">
                        {formatPrice(service.priceCents, service.currency)}
                      </span>
                    </div>
                    {hasProfessionals ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {professionalNames.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1 rounded-[var(--radius-control)] bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: "var(--gradient-accent)" }}
                              aria-hidden="true"
                            />
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                        Nenhum profissional disponível
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="professionals-heading">
        <h2
          id="professionals-heading"
          className="text-lg font-semibold text-[var(--color-foreground)] mb-4"
        >
          Profissionais
        </h2>
        {data.professionals.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Nenhum profissional disponivel no momento.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" role="list">
            {data.professionals.map((pro) => (
              <li
                key={pro.slug}
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-foreground)]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "var(--gradient-accent)" }}
                  aria-hidden="true"
                />
                {pro.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
