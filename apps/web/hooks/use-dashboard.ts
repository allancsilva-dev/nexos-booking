"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http-client";
import type { DashboardOverviewResponse } from "@nexos/shared";

export function useDashboardOverview(activeOrgId: string | null) {
  return useQuery({
    queryKey: ["dashboard-overview", activeOrgId ?? ""],
    queryFn: () =>
      apiFetch<DashboardOverviewResponse>("/api/v1/dashboard/overview"),
    enabled: !!activeOrgId,
  });
}
