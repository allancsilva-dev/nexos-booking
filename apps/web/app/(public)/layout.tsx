import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <main className="mx-auto w-full max-w-4xl pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))] sm:pt-8 sm:pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
