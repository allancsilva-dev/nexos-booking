import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: "primary" | "ghost";
}

/**
 * Topbar / panel primary action. Mirrors the prototype's gradient pill
 * (cyan gradient, dark ink) and a quiet ghost variant for secondary actions.
 */
export function ActionButton({
  icon,
  variant = "primary",
  className,
  children,
  ...props
}: ActionButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      // O fundo gradient vai por inline style: `bg-[var(--gradient-accent)]` do
      // Tailwind vira background-color e ignora o gradient (texto escuro some no dark).
      style={isPrimary ? { background: "var(--gradient-accent)" } : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-nav)] px-4 py-2 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        isPrimary
          ? "text-[var(--color-primary-foreground)] shadow-[0_6px_16px_rgba(8,145,178,0.3)] hover:opacity-95"
          : "border border-[var(--color-border)] bg-[var(--color-surface-operational-strong)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
