import type { ReactNode } from "react";
import { AuthGuard } from "@/components/shell/auth-guard";
import { Sidebar } from "@/components/shell/sidebar";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[var(--color-background)]">
        <Sidebar />
        <main className="pl-[var(--spacing-sidebar)]">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
