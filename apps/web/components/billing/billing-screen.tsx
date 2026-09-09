"use client";

import { useSearchParams } from "next/navigation";
import { Check, Clock3, CreditCard, Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { BillingPlan } from "@nexos/shared";
import { useMeQuery } from "@/hooks/use-auth";
import { useBillingInvoices, useBillingPlans, useBillingStatus, useCancelSubscription, useCreateCheckout } from "@/hooks/use-billing";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";
import { cn } from "@/lib/utils";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

function statusLabel(status: string) {
  return ({ TRIALING: "Período grátis", CHECKOUT_PENDING: "Aguardando confirmação", ACTIVE: "Ativa", PAST_DUE: "Pagamento pendente", CANCEL_AT_PERIOD_END: "Cancelamento agendado", CANCELED: "Cancelada", EXPIRED: "Expirada" } as Record<string, string>)[status] ?? status;
}

function PlanOption({ plan, current, locked, owner, pending, onChoose }: { plan: BillingPlan; current: boolean; locked: boolean; owner: boolean; pending: boolean; onChoose: () => void }) {
  const monthlyEquivalent = plan.priceCents / plan.months;
  const saving = plan.months === 1 ? null : Math.round((1 - monthlyEquivalent / 5990) * 100);
  return (
    <section className={cn("flex min-h-[260px] flex-col rounded-[var(--radius-card)] bg-[var(--color-surface-operational-strong)] p-5", current ? "border border-[var(--color-accent-strong)]" : "border border-[var(--color-border)]")}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-base font-extrabold">{plan.name}</h2><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Cobrança antecipada</p></div>
        {saving ? <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-300">Economize {saving}%</span> : null}
      </div>
      <div className="mt-6"><strong className="text-3xl font-extrabold tracking-[-0.03em]">{money.format(plan.priceCents / 100)}</strong><span className="text-sm text-[var(--color-muted-foreground)]"> / {plan.months === 1 ? "mês" : `${plan.months} meses`}</span></div>
      {plan.months > 1 ? <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Equivale a {money.format(monthlyEquivalent / 100)} por mês</p> : null}
      <ul className="mt-6 space-y-2 text-sm">
        <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[var(--color-metric-positive)]" />Agenda, clientes e equipe sem limites por ciclo</li>
        <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[var(--color-metric-positive)]" />Renovação automática e segura</li>
      </ul>
      <Button className="mt-auto w-full" disabled={!owner || pending || current || locked} onClick={onChoose}>
        {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}{current ? "Plano atual" : locked ? "Disponível ao fim do período" : owner ? "Escolher plano" : "Somente o proprietário pode contratar"}
      </Button>
    </section>
  );
}

export function BillingScreen() {
  const params = useSearchParams();
  const plans = useBillingPlans();
  const status = useBillingStatus();
  const invoices = useBillingInvoices();
  const checkout = useCreateCheckout();
  const cancel = useCancelSubscription();
  const { data: me } = useMeQuery();
  const owner = me?.memberships.find((item) => item.organizationId === me.activeOrg)?.role === "OWNER";

  if (plans.isLoading || status.isLoading) return <LoadingState variant="skeleton" message="Carregando assinatura..." />;
  if (plans.isError || status.isError) {
    const error = plans.error ?? status.error;
    return <ErrorDisplay error={error instanceof ApiError ? { code: error.code, message: error.message, requestId: error.requestId, timestamp: new Date().toISOString() as never } : { code: INTERNAL_ERROR, message: "Não foi possível carregar a assinatura", requestId: "", timestamp: new Date().toISOString() as never }} onRetry={() => { plans.refetch(); status.refetch(); }} />;
  }
  const current = status.data!;
  const planSelectionLocked = ["ACTIVE", "CANCEL_AT_PERIOD_END"].includes(current.status) && !!current.currentPeriodEndsAt && new Date(current.currentPeriodEndsAt) > new Date();
  const accessEnd = current.status === "TRIALING" ? current.trialEndsAt : current.currentPeriodEndsAt;

  async function handleCancel() {
    if (!window.confirm("Cancelar a próxima renovação? Seu acesso continuará até o fim do período já pago.")) return;
    try { await cancel.mutateAsync(); toast.success("Renovação cancelada"); }
    catch { toast.error("Não foi possível cancelar a renovação"); }
  }

  return (
    <div className="space-y-6">
      {params.get("checkout") === "success" && current.status === "CHECKOUT_PENDING" ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-accent-soft)] p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent-strong)]" /><div><strong>Confirmando seu pagamento</strong><p className="text-xs text-[var(--color-muted-foreground)]">Esta página será atualizada assim que o ASAAS confirmar.</p></div></div>
      ) : null}

      <section className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="rounded-[var(--radius-control)] bg-[var(--color-accent-soft)] p-2.5"><ShieldCheck className="h-5 w-5 text-[var(--color-accent-strong)]" /></span><div><p className="text-xs font-semibold text-[var(--color-muted-foreground)]">Estado da conta</p><h2 className="mt-0.5 text-lg font-extrabold">{statusLabel(current.status)}</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{accessEnd ? `Acesso atual até ${date.format(new Date(accessEnd))}` : "Escolha um plano para continuar operando."}</p></div></div>
        {current.cancelAtPeriodEnd ? <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-300">Não será renovada</span> : null}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.data?.map((plan) => <PlanOption key={plan.code} plan={plan} current={current.plan?.code === plan.code && ["ACTIVE", "CANCEL_AT_PERIOD_END"].includes(current.status)} locked={planSelectionLocked} owner={owner} pending={checkout.isPending} onChoose={() => checkout.mutate({ planCode: plan.code })} />)}
      </div>

      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] p-5"><div className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-[var(--color-accent-strong)]" /><h2 className="font-extrabold">Últimas cobranças</h2></div>{owner && ["ACTIVE", "PAST_DUE"].includes(current.status) ? <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={handleCancel}>Cancelar renovação</Button> : null}</div>
        {invoices.data?.length ? <div className="nb-scroll overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs text-[var(--color-muted-foreground)]"><tr><th className="px-5 py-3">Vencimento</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3">Identificador</th></tr></thead><tbody>{invoices.data.map((invoice) => <tr key={invoice.id} className="border-t border-[var(--color-border)]"><td className="px-5 py-3">{date.format(new Date(`${invoice.dueDate}T12:00:00`))}</td><td className="px-5 py-3 font-bold">{money.format(invoice.amountCents / 100)}</td><td className="px-5 py-3">{statusLabel(invoice.status)}</td><td className="px-5 py-3 font-mono text-xs text-[var(--color-muted-foreground)]">{invoice.providerPaymentId}</td></tr>)}</tbody></table></div> : <div className="flex items-center gap-3 p-5 text-sm text-[var(--color-muted-foreground)]"><Clock3 className="h-4 w-4" />Nenhuma cobrança emitida ainda.</div>}
      </section>
    </div>
  );
}
