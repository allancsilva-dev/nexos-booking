"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CalendarDays,
  Scissors,
  Users,
  UserRound,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";

const navItems = [
  { label: "Painel", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agenda", href: "/schedule", icon: CalendarDays },
  { label: "Serviços", href: "/services", icon: Scissors },
  { label: "Equipe", href: "/professionals", icon: Users },
  { label: "Clientes", href: "#", icon: UserRound, disabled: true },
  { label: "Configurações", href: "/settings/organization", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[var(--spacing-sidebar)] flex-col border-r border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)]">
      <div className="flex h-16 items-center justify-center border-b border-[var(--color-border-strong)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-nav)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
          <Scissors className="h-4 w-4" />
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          if (item.disabled) {
            return (
              <div
                key={item.label}
                className="flex cursor-not-allowed flex-col items-center gap-1 rounded-[var(--radius-nav)] px-2 py-2.5 text-[var(--color-muted-foreground)] opacity-40"
                title={item.label}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-[9px] leading-none">{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[var(--radius-nav)] px-2 py-2.5 transition-colors",
                isActive
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                  : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-operational-chip)] hover:text-[var(--color-foreground)]"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[9px] leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-[var(--color-border-strong)] p-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </aside>
  );
}
