import { Scissors } from "lucide-react";

export function AuthHero() {
  return (
    <div className="relative flex flex-col items-center justify-center px-8 py-16 text-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#22d3ee]/10 via-transparent to-[#0891b2]/10" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "var(--gradient-accent)" }}
        >
          <Scissors className="h-8 w-8 text-[var(--color-primary-foreground)]" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-foreground)]">
            Nexos
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)] max-w-xs">
            Agenda inteligente para barbearias
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <div className="h-1 w-8 rounded-full bg-[var(--color-primary)]" />
          <div className="h-1 w-4 rounded-full bg-[var(--color-accent)]" />
          <div className="h-1 w-2 rounded-full bg-[var(--color-muted-foreground)]" />
        </div>
      </div>
    </div>
  );
}
