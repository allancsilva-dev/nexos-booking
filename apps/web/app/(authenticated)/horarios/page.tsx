"use client";

import { useMeQuery } from "@/hooks/use-auth";
import { HorariosScreen } from "@/components/horarios/horarios-screen";
import { LoadingState } from "@/components/loading-state";
import { PageChrome } from "@/components/shell/page-chrome";

export default function HorariosPage() {
  const { data: meData } = useMeQuery();
  const activeOrgId = meData?.activeOrg ?? null;

  return (
    <>
      <PageChrome
        title="Horários & bloqueios"
        subtitle="Jornada, folgas e fechamentos"
      />
      {activeOrgId ? (
        <HorariosScreen orgId={activeOrgId} />
      ) : (
        <LoadingState variant="skeleton" message="Carregando horários..." />
      )}
    </>
  );
}
