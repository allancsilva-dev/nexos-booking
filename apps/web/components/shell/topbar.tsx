"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Globe } from "lucide-react";
import { useMeQuery } from "@/hooks/use-auth";
import { usePageChrome } from "@/components/shell/page-chrome";

interface RouteChrome {
  match: (pathname: string) => boolean;
  title: string;
  subtitle: string;
}

const ROUTE_CHROME: RouteChrome[] = [
  { match: (p) => p === "/dashboard", title: "Dashboard", subtitle: "Visão geral da operação" },
  { match: (p) => p.startsWith("/schedule"), title: "Agenda", subtitle: "Atendimentos por profissional" },
  { match: (p) => p.includes("/hours"), title: "Horários & bloqueios", subtitle: "Jornada, folgas e fechamentos" },
  { match: (p) => p.startsWith("/professionals"), title: "Profissionais", subtitle: "Equipe e especialidades" },
  { match: (p) => p.startsWith("/services"), title: "Serviços", subtitle: "Catálogo de serviços e preços" },
  { match: (p) => p.startsWith("/settings"), title: "Configurações", subtitle: "Dados do estabelecimento e da página pública" },
];

export function Topbar() {
  const pathname = usePathname();
  const { title, subtitle, action } = usePageChrome();
  const { data: meData } = useMeQuery();

  const slug =
    meData?.memberships.find((m) => m.organizationId === meData.activeOrg)?.slug ??
    null;

  const route = ROUTE_CHROME.find((r) => r.match(pathname));
  const resolvedTitle = title || route?.title || "Nexos";
  const resolvedSubtitle = subtitle || route?.subtitle || "";

  return (
    <header className="flex h-16 flex-none items-center gap-3.5 border-b border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] px-4 sm:px-6">
      <div className="min-w-0">
        <div className="truncate text-[17px] font-extrabold leading-tight tracking-[-0.01em] text-[var(--color-foreground)]">
          {resolvedTitle}
        </div>
        {resolvedSubtitle ? (
          <div className="truncate text-xs font-semibold text-[var(--color-muted-foreground)]">
            {resolvedSubtitle}
          </div>
        ) : null}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        className="hidden items-center gap-2 rounded-[var(--radius-nav)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] px-3 py-2 text-xs font-semibold text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)] sm:flex"
      >
        <Search className="h-3.5 w-3.5" />
        Buscar
      </button>

      {slug ? (
        <Link
          href={`/${slug}/agendar`}
          target="_blank"
          className="flex items-center gap-2 rounded-[var(--radius-nav)] border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] px-3.5 py-2 text-[13px] font-bold text-[var(--color-accent-strong)] transition-colors hover:border-[var(--color-accent-strong)]"
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Página pública</span>
        </Link>
      ) : null}

      {action}
    </header>
  );
}
