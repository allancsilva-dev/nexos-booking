import type { ReactNode } from "react";
import { Scissors } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] p-6">
      <div className="mb-8 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "var(--gradient-accent)" }}
        >
          <Scissors className="h-5 w-5 text-[var(--color-primary-foreground)]" />
        </div>
        <span className="text-xl font-bold text-[var(--color-foreground)]">
          Nexos
        </span>
      </div>
      {children}
    </div>
  );
}
