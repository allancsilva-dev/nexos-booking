"use client";

import type { PublicVitrineResponse } from "@nexos/shared";
import { cn } from "@/lib/utils";

interface VitrineDisplayProps {
  data: PublicVitrineResponse;
  /** Clique no cabeçalho do serviço. No modo flow, expande/colapsa o card. */
  onSelectService?: (serviceId: string) => void;
  /** Quando fornecido, ativa o modo flow: card expansível com profissionais inline. */
  onSelectProfessional?: (serviceId: string, professionalSlug: string) => void;
  /** Serviço expandido/selecionado. */
  selectedServiceId?: string;
  /** Profissional selecionado dentro do serviço expandido. */
  selectedProfessionalSlug?: string;
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
  onSelectProfessional,
  selectedServiceId,
  selectedProfessionalSlug,
  className,
}: VitrineDisplayProps) {
  // Modo flow: card expansível com escolha de profissional inline.
  // Modo vitrine (landing): card simples que navega para o agendamento.
  const interactive = typeof onSelectProfessional === "function";

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
              const isExpanded = interactive && isSelected && hasProfessionals;
              // Resolve slug → profissional do catálogo data.professionals
              const professionals = service.professionalSlugs
                .map((slug) => data.professionals.find((p) => p.slug === slug))
                .filter((p): p is (typeof data.professionals)[number] => p != null);

              return (
                <li key={service.id}>
                  <div
                    className={cn(
                      "rounded-[var(--radius-card)] border transition-colors",
                      isSelected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-card)]",
                      !isSelected &&
                        hasProfessionals &&
                        "hover:border-[var(--color-muted-foreground)]"
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left p-4 rounded-[var(--radius-card)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                        !hasProfessionals && "cursor-not-allowed opacity-70"
                      )}
                      onClick={() => hasProfessionals && onSelectService?.(service.id)}
                      aria-pressed={interactive ? undefined : isSelected}
                      aria-expanded={interactive ? isExpanded : undefined}
                      aria-controls={
                        interactive
                          ? `service-${service.id}-professionals`
                          : undefined
                      }
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

                      {!hasProfessionals && (
                        <span className="mt-1 block text-xs text-[var(--color-muted-foreground)]">
                          Nenhum profissional disponível
                        </span>
                      )}

                      {/* Pré-visualização dos profissionais (chips). No modo flow,
                          escondida quando o card está expandido para dar lugar à escolha. */}
                      {hasProfessionals && !isExpanded && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {professionals.map((pro) => (
                            <span
                              key={pro.slug}
                              className="inline-flex items-center gap-1 rounded-[var(--radius-control)] bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]"
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: "var(--gradient-accent)" }}
                                aria-hidden="true"
                              />
                              {pro.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>

                    {/* Escolha de profissional inline (modo flow, card expandido) */}
                    {isExpanded && (
                      <div
                        id={`service-${service.id}-professionals`}
                        className="border-t border-[var(--color-border)] p-4 pt-3 space-y-2"
                      >
                        <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
                          Escolha o profissional
                        </p>
                        <ul
                          className="grid gap-2"
                          role="listbox"
                          aria-label={`Profissionais para ${service.name}`}
                        >
                          {professionals.map((pro) => {
                            const proSelected = selectedProfessionalSlug === pro.slug;
                            return (
                              <li
                                key={pro.slug}
                                role="option"
                                aria-selected={proSelected}
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "w-full text-left rounded-[var(--radius-control)] border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                                    proSelected
                                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium"
                                      : "border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-muted-foreground)]"
                                  )}
                                  onClick={() =>
                                    onSelectProfessional?.(service.id, pro.slug)
                                  }
                                >
                                  <span className="flex items-center gap-2 text-[var(--color-foreground)]">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ background: "var(--gradient-accent)" }}
                                      aria-hidden="true"
                                    />
                                    {pro.name}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
