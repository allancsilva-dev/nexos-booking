"use client";

import { useMeQuery } from "@/hooks/use-auth";
import { ClientsScreen } from "@/components/clients/clients-screen";
import { LoadingState } from "@/components/loading-state";
import { PageChrome } from "@/components/shell/page-chrome";

export default function ClientsPage() {
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  return (
    <>
      <PageChrome
        title="Clientes"
        subtitle="Histórico e ficha de cada cliente"
      />
      {activeOrgId ? (
        <ClientsScreen orgId={activeOrgId} />
      ) : (
        <LoadingState variant="skeleton" message="Carregando clientes..." />
      )}
    </>
  );
}
