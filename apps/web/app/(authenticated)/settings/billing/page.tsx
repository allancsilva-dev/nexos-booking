import { Suspense } from "react";
import { BillingScreen } from "@/components/billing/billing-screen";
import { PageChrome } from "@/components/shell/page-chrome";
import { LoadingState } from "@/components/loading-state";

export default function BillingPage() {
  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageChrome title="Plano e cobrança" subtitle="Assinatura da sua organização" />
      <Suspense fallback={<LoadingState variant="skeleton" message="Carregando assinatura..." />}><BillingScreen /></Suspense>
    </div>
  );
}
