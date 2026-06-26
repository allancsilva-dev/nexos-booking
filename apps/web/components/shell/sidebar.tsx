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
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[var(--spacing-sidebar)] flex-col border-r border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="flex h-14 items-center justify-center border-b border-[var(--color-border)]">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-nav)]"
          style={{ background: "var(--gradient-accent)" }}
        >
          <Scissors className="h-4 w-4 text-[var(--color-primary-foreground)]" />
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-2">
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
                className="flex flex-col items-center gap-1 rounded-[var(--radius-nav)] px-2 py-2 text-[var(--color-muted-foreground)] opacity-40 cursor-not-allowed"
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
                "flex flex-col items-center gap-1 rounded-[var(--radius-nav)] px-2 py-2 transition-colors",
                isActive
                  ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[9px] leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--color-border)] p-2">
        <UserMenu />
      </div>
    </aside>
  );
}
