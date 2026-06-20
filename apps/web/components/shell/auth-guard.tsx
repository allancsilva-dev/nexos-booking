"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthBootstrap } from "@/hooks/use-auth-bootstrap";
import { LoadingState } from "@/components/loading-state";
import { ErrorDisplay } from "@/components/error-display";
import { OrgSwitcher } from "@/components/shell/org-switcher";
import { UNAUTHENTICATED } from "@/lib/error-codes";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { status, error } = useAuthBootstrap();

  if (status === "loading") {
    return <LoadingState variant="skeleton" message="Carregando sessão..." />;
  }

  if (status === "error") {
    return (
      <ErrorDisplay
        error={{
          code: UNAUTHENTICATED,
          message: error ?? "Sessão expirada. Faça login novamente.",
          requestId: "",
          timestamp: new Date().toISOString() as never,
        }}
        onRetry={() => router.push("/login")}
      />
    );
  }

  if (status === "idle") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
        <OrgSwitcher />
      </div>
    );
  }

  return <>{children}</>;
}
