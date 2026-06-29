import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <main className="mx-auto max-w-4xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
