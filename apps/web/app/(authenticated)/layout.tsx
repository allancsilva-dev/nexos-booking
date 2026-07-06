import type { ReactNode } from "react";
import { AuthGuard } from "@/components/shell/auth-guard";
import { MobileNavigation, Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { PageChromeProvider } from "@/components/shell/page-chrome";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <PageChromeProvider>
        <div className="flex h-dvh overflow-hidden bg-[var(--color-surface-operational)]">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="nb-scroll flex-1 overflow-y-auto p-4 pb-24 sm:p-6 sm:pb-28 lg:pb-6">
              {children}
            </main>
          </div>
          <MobileNavigation />
        </div>
      </PageChromeProvider>
    </AuthGuard>
  );
}
