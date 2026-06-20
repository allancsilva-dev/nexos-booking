"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorCode = string;

interface ErrorFeedbackProps {
  code: ErrorCode;
  message: string;
  requestId?: string;
  retryAfterSeconds?: number;
  onRetry?: () => void;
  onRefetch?: () => void;
  className?: string;
}

export function ErrorFeedback({
  code,
  message,
  requestId,
  retryAfterSeconds,
  onRetry,
  onRefetch,
  className,
}: ErrorFeedbackProps) {
  const [countdown, setCountdown] = useState(retryAfterSeconds ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) return;

    setCountdown(retryAfterSeconds);

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [retryAfterSeconds]);

  const isConflict = code === "APPOINTMENT_CONFLICT";
  const isRateLimited = code === "RATE_LIMITED";
  const isCancelToken = code === "CANCEL_TOKEN_INVALID" || code === "CANCEL_TOKEN_EXPIRED";

  if (isRateLimited && countdown > 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 py-12",
          className
        )}
        role="alert"
      >
        <div className="rounded-full bg-yellow-500/10 p-3">
          <AlertTriangle className="h-6 w-6 text-yellow-500" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-[var(--color-foreground)]">
            Muitas requisicoes. Aguarde {countdown} segundo{countdown !== 1 ? "s" : ""}.
          </p>
        </div>
      </div>
    );
  }

  if (isConflict) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 py-6",
          className
        )}
        role="alert"
      >
        <div className="rounded-full bg-yellow-500/10 p-3">
          <AlertTriangle className="h-6 w-6 text-yellow-500" />
        </div>
        <div className="text-center space-y-4">
          <p className="text-sm text-[var(--color-foreground)] max-w-md">
            Este horario acabou de ser reservado. Os horarios disponiveis foram atualizados.
          </p>
          {onRefetch && (
            <Button
              variant="default"
              size="sm"
              onClick={onRefetch}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar horarios
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isCancelToken) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 py-12",
          className
        )}
        role="alert"
      >
        <div className="rounded-full bg-[var(--color-muted)] p-3">
          <AlertTriangle className="h-6 w-6 text-[var(--color-muted-foreground)]" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm text-[var(--color-foreground)]">
            Este link de cancelamento nao e mais valido.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-12",
        className
      )}
      role="alert"
    >
      <div className="rounded-full bg-red-500/10 p-3">
        <AlertTriangle className="h-6 w-6 text-[var(--color-destructive)]" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xs font-mono text-[var(--color-muted-foreground)] uppercase tracking-wider">
          {code}
        </p>
        <p className="text-sm text-[var(--color-foreground)] max-w-md">
          {message}
        </p>
        {requestId && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Ref: {requestId}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
