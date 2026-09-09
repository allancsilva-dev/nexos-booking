"use client";

import Link from "next/link";
import { AlertCircle, Clock3, CreditCard } from "lucide-react";
import { useBillingStatus } from "@/hooks/use-billing";

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function BillingBanner() {
  const { data } = useBillingStatus();
  if (!data) return null;
  const trialDays = daysUntil(data.trialEndsAt);
  const showTrial = data.status === "TRIALING" && trialDays !== null && trialDays <= 3;
  const showWarning = data.status === "PAST_DUE";
  const showBlocked = data.accessMode === "READ_ONLY";
  if (!showTrial && !showWarning && !showBlocked) return null;

  const Icon = showBlocked ? AlertCircle : showWarning ? CreditCard : Clock3;
  const text = showBlocked
    ? "Sua conta está em modo somente leitura. Escolha um plano para voltar a operar."
    : showWarning
      ? `Não conseguimos renovar sua assinatura. Você tem ${daysUntil(data.graceEndsAt) ?? 0} dia(s) para atualizar o pagamento.`
      : `Seu período grátis termina em ${trialDays} dia(s). Escolha um plano sem interromper sua agenda.`;

  return (
    <div className="flex flex-none items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-[max(1rem,env(safe-area-inset-left))] py-2.5 pr-[max(1rem,env(safe-area-inset-right))] text-sm text-[var(--color-foreground)] sm:px-6 sm:pr-6">
      <Icon className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <p className="min-w-0 flex-1 text-xs font-semibold sm:text-sm">{text}</p>
      <Link href="/settings/billing" className="shrink-0 rounded-[var(--radius-nav)] bg-amber-300 px-3 py-2 text-xs font-extrabold text-amber-950 transition-colors hover:bg-amber-200">
        Ver planos
      </Link>
    </div>
  );
}
