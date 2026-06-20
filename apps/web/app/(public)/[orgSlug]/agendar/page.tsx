"use client";

import { useState, useEffect, use } from "react";
import type { PublicVitrineResponse } from "@nexos/shared";
import { BookingFlow } from "@/components/public/booking-flow";
import { LoadingState } from "@/components/loading-state";
import { ErrorFeedback } from "@/components/public/error-feedback";
import { apiFetch, ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";

export default function AgendarPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);

  const [vitrine, setVitrine] = useState<PublicVitrineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    code: string;
    message: string;
    requestId: string;
    retryAfterSeconds?: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const result = await apiFetch<PublicVitrineResponse>(
          `/api/v1/public/${encodeURIComponent(orgSlug)}`
        );
        if (!cancelled) {
          setVitrine(result);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError({
            code: err.code,
            message: err.message,
            requestId: err.requestId,
            retryAfterSeconds: err.status === 429 ? 5 : undefined,
          });
        } else {
          setError({
            code: INTERNAL_ERROR,
            message: "Erro ao carregar os dados.",
            requestId: "",
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgSlug]);

  if (loading) {
    return (
      <LoadingState variant="skeleton" message="Carregando..." />
    );
  }

  if (error) {
    return (
      <ErrorFeedback
        code={error.code}
        message={error.message}
        requestId={error.requestId}
        retryAfterSeconds={error.retryAfterSeconds}
        onRetry={() => {
          setError(null);
          setLoading(true);
          apiFetch<PublicVitrineResponse>(
            `/api/v1/public/${encodeURIComponent(orgSlug)}`
          )
            .then((result) => {
              setVitrine(result);
              setLoading(false);
            })
            .catch((err) => {
              setLoading(false);
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
                  code: INTERNAL_ERROR,
                  message: "Erro ao carregar os dados.",
                  requestId: "",
                });
              }
            });
        }}
      />
    );
  }

  if (!vitrine) return null;

  return <BookingFlow orgSlug={orgSlug} vitrine={vitrine} />;
}
