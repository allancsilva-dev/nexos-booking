import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <main className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-4 sm:py-8">
        {children}
      </main>
    </div>
  );
}
