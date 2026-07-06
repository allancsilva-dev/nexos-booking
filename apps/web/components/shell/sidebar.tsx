"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Scissors,
  UserRound,
  Clock,
  Settings,
  MoreHorizontal,
  X,
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
    <aside className="hidden h-screen w-[var(--spacing-sidebar)] flex-none flex-col items-center gap-1.5 border-r border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] py-[18px] lg:flex">
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

const primaryMobileItems = navItems.slice(0, 3);
const secondaryMobileItems = [...navItems.slice(3), {
  label: "Configurações",
  href: "/settings/organization",
  icon: Settings,
}];

export function MobileNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = secondaryMobileItems.some((item) =>
    isItemActive(pathname, item.href),
  );

  return (
    <>
      {moreOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      {moreOpen ? (
        <div
          id="mobile-more-menu"
          className="fixed inset-x-3 bottom-[84px] z-50 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] p-2 shadow-[var(--shadow-operational-ambient)] lg:hidden"
        >
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
              Mais
            </span>
            <button
              type="button"
              aria-label="Fechar menu"
              className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-nav)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-operational-chip)]"
              onClick={() => setMoreOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {secondaryMobileItems.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(pathname, item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-[var(--radius-nav)] px-3 text-sm font-bold transition-colors",
                    active
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                      : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-operational-chip)] hover:text-[var(--color-foreground)]",
                  )}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--color-border-strong)] px-2 pt-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(2,6,23,0.28)] lg:hidden">
        <div className="grid grid-cols-4 gap-1">
          {primaryMobileItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-nav)] text-[11px] font-bold transition-colors",
                  active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                    : "text-[var(--color-muted-foreground)]",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-nav)] text-[11px] font-bold transition-colors",
              moreOpen || moreActive
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]"
                : "text-[var(--color-muted-foreground)]",
            )}
            aria-expanded={moreOpen}
            aria-controls="mobile-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal className="h-5 w-5" />
            Mais
          </button>
        </div>
      </nav>
    </>
  );
}
