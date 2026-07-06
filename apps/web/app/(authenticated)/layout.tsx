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
            <main className="nb-scroll flex-1 overflow-y-auto px-[max(1rem,env(safe-area-inset-left))] py-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:px-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:py-6 sm:pb-[calc(6.25rem+env(safe-area-inset-bottom))] lg:pb-6">
              {children}
            </main>
          </div>
          <MobileNavigation />
        </div>
      </PageChromeProvider>
    </AuthGuard>
  );
}
