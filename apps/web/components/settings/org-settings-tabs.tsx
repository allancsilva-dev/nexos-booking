"use client";

import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Loader2,
  ImageIcon,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { UpdateOrgSchema, type UpdateOrgInput } from "@/lib/org-schemas";
import { ApiError } from "@/lib/http-client";
import { applyFormFieldErrors } from "@/lib/error-handler";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/ui/operational/action-button";
import { cn } from "@/lib/utils";
import type { OrganizationDTO } from "@nexos/shared";

const FORM_FIELDS = ["name", "timezone", "slotIntervalMin"] as const;

type TabKey = "empresa" | "jornada" | "publica";

const TABS: { key: TabKey; label: string }[] = [
  { key: "empresa", label: "Empresa" },
  { key: "jornada", label: "Jornada" },
  { key: "publica", label: "Página pública" },
];

interface Props {
  org: OrganizationDTO;
  isPending: boolean;
  onSubmit: (data: UpdateOrgInput) => Promise<void>;
}

export function OrgSettingsTabs({ org, isPending, onSubmit }: Props) {
  const [tab, setTab] = useState<TabKey>("empresa");

  return (
    <div className="flex flex-col">
      {/* Segmented tab switcher (prototype: padding:4px pill row) */}
      <div
        role="tablist"
        aria-label="Seções de configuração"
        className="mb-[22px] flex w-max gap-1 rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-1"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              style={
                active ? { background: "var(--gradient-accent)" } : undefined
              }
              className={cn(
                "rounded-[7px] px-[15px] py-[7px] text-[12.5px] font-bold transition-colors",
                active
                  ? "text-[var(--color-primary-foreground)]"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "empresa" && (
        <EmpresaTab org={org} isPending={isPending} onSubmit={onSubmit} />
      )}
      {tab === "jornada" && <JornadaTab />}
      {tab === "publica" && <PublicaTab slug={org.slug} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function SettingsCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-[22px]",
        className,
      )}
    >
      <div className="mb-[18px] flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-[var(--color-foreground)]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-muted-foreground)]">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  className,
  soon,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  soon?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-2">
        <label
          htmlFor={htmlFor}
          className="text-xs font-semibold text-[var(--color-muted-foreground)]"
        >
          {label}
        </label>
        {soon && <SoonBadge />}
      </div>
      {children}
    </div>
  );
}

function SoonBadge() {
  return (
    <span className="rounded-full bg-[var(--color-operational-chip)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted-foreground)]">
      Em breve
    </span>
  );
}

const fieldInput =
  "h-auto rounded-[var(--radius-control)] border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 py-3 text-sm";

/** Read-only / not-yet-wired field rendered as a disabled input look-alike. */
function PlaceholderInput({ value }: { value: string }) {
  return (
    <div className="flex h-[46px] items-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 text-sm text-[var(--color-muted-foreground)]">
      {value}
    </div>
  );
}

/** Decorative on/off switch (matches prototype). Inert until wired. */
function Toggle({ on, disabled = true }: { on: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[22px] w-[38px] flex-none items-center rounded-full p-0.5 transition-colors",
        on
          ? "justify-end bg-[var(--color-accent)]"
          : "justify-start bg-[var(--color-border)]",
        disabled && "opacity-70",
      )}
    >
      <span className="h-[18px] w-[18px] rounded-full bg-white" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Empresa tab (wired: name, timezone, slotIntervalMin)
// ---------------------------------------------------------------------------

function EmpresaTab({ org, isPending, onSubmit }: Props) {
  const form = useForm<UpdateOrgInput>({
    resolver: zodResolver(UpdateOrgSchema),
    defaultValues: {
      name: org.name,
      timezone: org.timezone,
      slotIntervalMin: org.slotIntervalMin,
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;

  async function submit(data: UpdateOrgInput) {
    try {
      await onSubmit(data);
      reset(data);
      toast.success("Configurações salvas");
    } catch (err) {
      if (err instanceof ApiError) {
        const { applied, unknownFields } = applyFormFieldErrors(
          err,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          form.setError as any,
          FORM_FIELDS,
        );
        if (applied === 0 || unknownFields.length > 0) {
          const msg =
            unknownFields.length > 0
              ? unknownFields.map((d) => `${d.field}: ${d.issue}`).join("; ")
              : `${err.code}: ${err.message}`;
          toast.error(msg, { description: `Ref: ${err.requestId || "N/A"}` });
        }
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <SettingsCard title="Identidade">
        {/* Logo (placeholder) */}
        <div className="mb-[22px] flex items-center gap-[18px]">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[18px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] text-[var(--color-muted-foreground)]">
            <ImageIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-bold text-[var(--color-foreground)]">
                Logo do estabelecimento
              </p>
              <SoonBadge />
            </div>
            <p className="my-1 text-xs text-[var(--color-muted-foreground)]">
              PNG ou SVG, mínimo 256×256px
            </p>
            <span className="mt-1 inline-flex cursor-not-allowed rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 py-[7px] text-[12.5px] font-bold text-[var(--color-muted-foreground)] opacity-60">
              Enviar logo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome do estabelecimento" htmlFor="org-name" className="sm:col-span-2">
            <Input
              id="org-name"
              className={fieldInput}
              placeholder="Barbearia do Zé"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="mt-1.5 text-xs text-[var(--color-destructive)]">
                {errors.name.message}
              </p>
            )}
          </Field>

          <Field label="Segmento" soon>
            <PlaceholderInput value="Salão & Barbearia" />
          </Field>

          <Field label="Fuso horário (IANA)" htmlFor="org-tz">
            <Input
              id="org-tz"
              className={fieldInput}
              placeholder="America/Sao_Paulo"
              aria-invalid={!!errors.timezone}
              {...register("timezone")}
            />
            {errors.timezone && (
              <p className="mt-1.5 text-xs text-[var(--color-destructive)]">
                {errors.timezone.message}
              </p>
            )}
          </Field>

          <Field label="Intervalo dos slots (min)" htmlFor="org-slot">
            <Input
              id="org-slot"
              type="number"
              className={fieldInput}
              placeholder="30"
              aria-invalid={!!errors.slotIntervalMin}
              {...register("slotIntervalMin")}
            />
            {errors.slotIntervalMin && (
              <p className="mt-1.5 text-xs text-[var(--color-destructive)]">
                {errors.slotIntervalMin.message}
              </p>
            )}
          </Field>

          <Field label="Moeda">
            <PlaceholderInput value={org.currency} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Contato & endereço">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Telefone" soon>
            <PlaceholderInput value="(11) 98888-7777" />
          </Field>
          <Field label="E-mail" soon>
            <PlaceholderInput value="contato@exemplo.com" />
          </Field>
          <Field label="Endereço" soon className="sm:col-span-2">
            <PlaceholderInput value="Rua das Palmeiras, 240 — São Paulo" />
          </Field>
        </div>
      </SettingsCard>

      <div className="flex justify-end gap-2.5">
        <ActionButton
          variant="ghost"
          onClick={() => reset()}
          disabled={isPending || !isDirty}
        >
          Cancelar
        </ActionButton>
        <ActionButton type="submit" disabled={isPending || !isDirty}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar alterações
        </ActionButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Jornada tab (not yet wired at org level)
// ---------------------------------------------------------------------------

const JOURNEY = [
  { day: "Segunda", open: true, hours: "09:00 – 19:00", pause: "Pausa 12:00–13:00" },
  { day: "Terça", open: true, hours: "09:00 – 19:00", pause: "Pausa 12:00–13:00" },
  { day: "Quarta", open: true, hours: "09:00 – 19:00", pause: "Pausa 12:00–13:00" },
  { day: "Quinta", open: true, hours: "09:00 – 20:00", pause: "Pausa 12:00–13:00" },
  { day: "Sexta", open: true, hours: "09:00 – 20:00", pause: "Pausa 12:00–13:00" },
  { day: "Sábado", open: true, hours: "08:00 – 17:00", pause: "Sem pausa" },
  { day: "Domingo", open: false, hours: "Fechado", pause: "" },
];

function JornadaTab() {
  return (
    <SettingsCard
      title="Jornada de trabalho"
      description="Defina os horários de funcionamento. A página pública só oferece horários dentro da jornada."
      action={<SoonBadge />}
    >
      <div className="flex flex-col">
        {JOURNEY.map((j) => (
          <div
            key={j.day}
            className="flex items-center gap-4 border-t border-[var(--color-operational-line)] py-3.5 first:border-t-0"
          >
            <div className="flex w-[130px] items-center gap-3">
              <Toggle on={j.open} />
              <span
                className={cn(
                  "text-[13.5px] font-bold",
                  j.open
                    ? "text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)]",
                )}
              >
                {j.day}
              </span>
            </div>
            <div
              className={cn(
                "flex-1 text-[13px] font-semibold",
                j.open
                  ? "text-[var(--color-foreground)]"
                  : "text-[var(--color-muted-foreground)]",
              )}
            >
              {j.hours}
            </div>
            {j.pause && (
              <div className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                {j.pause}
              </div>
            )}
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

// ---------------------------------------------------------------------------
// Página pública tab (wired: booking link; rest pending)
// ---------------------------------------------------------------------------

const PUB_RULES = [
  {
    title: "Aceitar agendamentos online",
    desc: "Clientes podem marcar pela página pública",
    value: "",
    on: true,
  },
  {
    title: "Antecedência mínima",
    desc: "Tempo mínimo antes do horário para agendar",
    value: "15 min",
    on: true,
  },
  {
    title: "Confirmar por WhatsApp",
    desc: "Envia link de confirmação ao cliente",
    value: "",
    on: false,
  },
];

function PublicaTab({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://nexos.app";
  const url = `${origin}/${slug}/agendar`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        title="Link de agendamento"
        description="Compartilhe este link com seus clientes para agendarem online."
      >
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="flex flex-1 items-center gap-1 truncate rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] px-3.5 py-3 text-sm">
            <span className="text-[var(--color-muted-foreground)]">{origin}/</span>
            <span className="truncate font-bold text-[var(--color-accent-strong)]">
              {slug}
            </span>
          </div>
          <div className="flex gap-2.5">
            <ActionButton variant="ghost" onClick={handleCopy}>
              {copied ? (
                <Check className="h-[15px] w-[15px]" />
              ) : (
                <Copy className="h-[15px] w-[15px]" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </ActionButton>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-[var(--radius-nav)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] px-4 py-2 text-[13px] font-bold text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
            >
              <ExternalLink className="h-[15px] w-[15px]" />
              Abrir
            </a>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Janela de agendamento"
        description="Até onde no futuro o cliente pode marcar pela página pública."
        action={<SoonBadge />}
      >
        <div className="flex w-max gap-1 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-operational-muted)] p-1 opacity-70">
          <span className="rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--color-muted-foreground)]">
            Esta semana
          </span>
          <span className="rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--color-muted-foreground)]">
            Mês inteiro
          </span>
        </div>
      </SettingsCard>

      <SettingsCard title="Regras da página" action={<SoonBadge />}>
        <div className="flex flex-col">
          {PUB_RULES.map((r) => (
            <div
              key={r.title}
              className="flex items-center gap-4 border-t border-[var(--color-operational-line)] py-4 first:border-t-0"
            >
              <div className="flex-1">
                <div className="text-[13.5px] font-bold text-[var(--color-foreground)]">
                  {r.title}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {r.desc}
                </div>
              </div>
              {r.value && (
                <div className="text-[13px] font-bold text-[var(--color-foreground)]">
                  {r.value}
                </div>
              )}
              <Toggle on={r.on} />
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}
