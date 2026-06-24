"use client";

import { useState, useEffect, useRef } from "react";
import type { CancelPreviewResponse } from "@nexos/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/loading-state";
import { ErrorFeedback } from "@/components/public/error-feedback";
import { apiFetch, ApiError } from "@/lib/http-client";
import { cn } from "@/lib/utils";

type Step = "input" | "loading" | "preview" | "confirming" | "result" | "error";

interface ErrorState {
  code: string;
  message: string;
  requestId: string;
  retryAfterSeconds?: number;
}

export function CancelForm({
  className,
  initialToken,
}: {
  className?: string;
  initialToken?: string;
}) {
  const [token, setToken] = useState(initialToken ?? "");
  const [step, setStep] = useState<Step>(
    initialToken ? "loading" : "input",
  );
  const [preview, setPreview] = useState<CancelPreviewResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const autoFired = useRef(false);

  // Auto-preview quando initialToken é fornecido (roda uma única vez)
  useEffect(() => {
    if (initialToken && !autoFired.current) {
      autoFired.current = true;
      handlePreviewWithToken(initialToken);
    }
  }, [initialToken]);

  async function handlePreviewWithToken(t: string) {
    setStep("loading");
    setError(null);

    try {
      const result = await apiFetch<CancelPreviewResponse>(
        "/api/v1/public/cancel/preview",
        {
          method: "POST",
          body: JSON.stringify({ token: t }),
        },
      );
      setPreview(result);
      setStep("preview");
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          code: err.code,
          message: err.message,
          requestId: err.requestId,
          retryAfterSeconds: err.status === 429 ? 5 : undefined,
        });
      } else {
        setError({
          code: "INTERNAL_ERROR",
          message: "Erro inesperado ao verificar o token.",
          requestId: "",
        });
      }
      setStep("error");
    }
  }

  async function handlePreview() {
    if (!token.trim()) return;
    await handlePreviewWithToken(token.trim());
  }

  async function handleConfirm() {
    if (!token.trim()) return;
    setStep("confirming");
    setError(null);

    try {
      await apiFetch("/api/v1/public/cancel", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      setStep("result");
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          code: err.code,
          message: err.message,
          requestId: err.requestId,
          retryAfterSeconds:
            err.status === 429 ? 5 : undefined,
        });
      } else {
        setError({
          code: "INTERNAL_ERROR",
          message: "Erro inesperado ao cancelar.",
          requestId: "",
        });
      }
      setStep("error");
    }
  }

  function handleBack() {
    setStep("input");
    setError(null);
    setPreview(null);
  }

  if (step === "loading" || step === "confirming") {
    return (
      <LoadingState
        message={step === "loading" ? "Verificando token..." : "Cancelando agendamento..."}
        className={className}
      />
    );
  }

  if (step === "error" && error) {
    const isCancelToken =
      error.code.startsWith("CANCEL_TOKEN_");

    return (
      <div className={cn(className)}>
        <ErrorFeedback
          code={error.code}
          message={isCancelToken ? "Este link de cancelamento nao e mais valido." : error.message}
          requestId={error.requestId}
          retryAfterSeconds={error.retryAfterSeconds}
          onRetry={isCancelToken ? undefined : handleBack}
        />
      </div>
    );
  }

  if (step === "result") {
    return (
      <div className={cn("flex flex-col items-center gap-6 py-12", className)}>
        <div className="rounded-full bg-green-500/10 p-3">
          <svg
            className="h-6 w-6 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
            Agendamento cancelado
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Seu horario foi liberado. Obrigado por avisar!
          </p>
        </div>
        <Button variant="outline" onClick={handleBack}>
          Voltar
        </Button>
      </div>
    );
  }

  if (step === "preview" && preview) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirmar cancelamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-muted-foreground)]">Profissional</span>
              <span className="font-medium text-[var(--color-foreground)]">
                {preview.professionalName}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-muted-foreground)]">Servico</span>
              <span className="font-medium text-[var(--color-foreground)]">
                {preview.serviceName}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-muted-foreground)]">Data/Hora</span>
              <span className="font-medium text-[var(--color-foreground)]">
                {preview.startsAt}
              </span>
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={handleBack}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleConfirm}
          >
            Confirmar cancelamento
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
          Cancelar agendamento
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Insira o codigo de cancelamento recebido na confirmacao do agendamento.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cancel-token">Codigo de cancelamento</Label>
          <Input
            id="cancel-token"
            type="text"
            placeholder="Cole o codigo aqui"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && token.trim()) {
                handlePreview();
              }
            }}
            autoComplete="off"
          />
        </div>

        <Button
          className="w-full"
          disabled={!token.trim()}
          onClick={handlePreview}
        >
          Verificar agendamento
        </Button>
      </div>
    </div>
  );
}
