"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import type { PublicVitrineResponse } from "@nexos/shared";
import { VitrineDisplay } from "@/components/public/vitrine-display";
import { LoadingState } from "@/components/loading-state";
import { ErrorFeedback } from "@/components/public/error-feedback";
import { EmptyState } from "@/components/empty-state";
import { apiFetch, ApiError } from "@/lib/http-client";
import { INTERNAL_ERROR } from "@/lib/error-codes";

export default function VitrinePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = use(params);
  const router = useRouter();

  const [data, setData] = useState<PublicVitrineResponse | null>(null);
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
          setData(result);
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
            message: "Erro ao carregar os dados da empresa.",
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
      <LoadingState
        variant="skeleton"
        message="Carregando servicos..."
      />
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
          apiFetch<PublicVitrineResponse>(`/api/v1/public/${encodeURIComponent(orgSlug)}`)
            .then((result) => {
              setData(result);
              setLoading(false);
            })
            .catch((err) => {
              setLoading(false);
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
                  message: "Erro ao carregar os dados da empresa.",
                  requestId: "",
                });
              }
            });
        }}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Empresa nao encontrada"
        description="Nao foi possivel carregar os dados desta empresa."
      />
    );
  }

  return (
    <VitrineDisplay
      data={data}
      onSelectService={(serviceId) => {
        router.push(`/${encodeURIComponent(orgSlug)}/agendar?serviceId=${serviceId}`);
      }}
    />
  );
}
