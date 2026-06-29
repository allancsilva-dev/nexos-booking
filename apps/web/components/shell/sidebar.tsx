"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Scissors,
  UserRound,
  Clock,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";

const navItems: {
  label: string;
  href: string;
  icon: typeof Users;
  disabled?: boolean;
}[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agenda", href: "/schedule", icon: CalendarDays },
  { label: "Clientes", href: "/clients", icon: Users },
  { label: "Serviços", href: "/services", icon: Scissors },
  { label: "Profissionais", href: "/professionals", icon: UserRound },
  { label: "Horários", href: "/horarios", icon: Clock },
];

function isItemActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[var(--spacing-sidebar)] flex-none flex-col items-center gap-1.5 border-r border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] py-[18px]">
      <div
        style={{ background: "var(--gradient-accent)" }}
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-[11px] text-[var(--color-primary-foreground)] shadow-[0_6px_16px_rgba(8,145,178,0.35)]"
      >
        <Scissors className="h-[19px] w-[19px]" strokeWidth={2.3} />
      </div>

      {navItems.map((item) => {
        const Icon = item.icon;

        if (item.disabled) {
          return (
            <div
              key={item.label}
              title={`${item.label} (em breve)`}
              className="flex h-[42px] w-[42px] cursor-not-allowed items-center justify-center rounded-[11px] text-[var(--color-muted-foreground)] opacity-40"
            >
              <Icon className="h-5 w-5" />
            </div>
          );
        }

        const active = isItemActive(pathname, item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            title={item.label}
            className={cn(
              "flex h-[42px] w-[42px] items-center justify-center rounded-[11px] transition-colors",
              active
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-operational-chip)] hover:text-[var(--color-foreground)]",
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}

      <div className="flex-1" />

      <Link
        href="/settings/organization"
        title="Configurações"
        className={cn(
          "flex h-[42px] w-[42px] items-center justify-center rounded-[11px] transition-colors",
          isItemActive(pathname, "/settings")
            ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
            : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-operational-chip)] hover:text-[var(--color-foreground)]",
        )}
      >
        <Settings className="h-5 w-5" />
      </Link>

      <ThemeToggle />
      <UserMenu />
    </aside>
  );
}
