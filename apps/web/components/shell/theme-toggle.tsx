"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = resolvedTheme === "light";
  const nextTheme = isLight ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={isLight ? "Ativar tema escuro" : "Ativar tema claro"}
      title={isLight ? "Tema escuro" : "Tema claro"}
      className="flex w-full items-center justify-center rounded-[var(--radius-nav)] px-2 py-2.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-operational-chip)] hover:text-[var(--color-foreground)]"
    >
      {mounted && isLight ? (
        <Moon className="h-5 w-5 shrink-0" />
      ) : (
        <Sun className="h-5 w-5 shrink-0" />
      )}
    </button>
  );
}
