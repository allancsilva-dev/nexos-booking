"use client";

import { useRouter } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import { useMeQuery, useLogoutMutation } from "@/hooks/use-auth";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LoadingState } from "@/components/loading-state";
import { OrgSwitcher } from "@/components/shell/org-switcher";

export function UserMenu() {
  const router = useRouter();
  const logoutMutation = useLogoutMutation();
  const { status: bootstrapStatus, user: bootstrapUser } = useAuthBootstrap();
  const { data: meData, isLoading } = useMeQuery();

  const user = meData?.user ?? bootstrapUser;

  const initials = user
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    router.push("/login");
  }

  if (isLoading || bootstrapStatus === "loading") {
    return (
      <div className="flex items-center justify-center p-1">
        <LoadingState variant="inline" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-[var(--radius-nav)] p-1.5 outline-none transition-colors hover:bg-[var(--color-operational-chip)]">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-[var(--color-accent-soft)] text-[10px] text-[var(--color-accent-strong)]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="h-3 w-3 text-[var(--color-muted-foreground)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64 border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)]">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
            {user.name}
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)] truncate">
            {user.email}
          </p>
        </div>

        <DropdownMenuSeparator />

        <div className="px-1">
          <OrgSwitcher />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} className="text-[var(--color-destructive)]">
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
