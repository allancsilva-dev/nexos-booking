"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Link2 } from "lucide-react";
import {
  useServicesQuery,
  useProfessionalServicesQuery,
  useSetProfessionalServicesMutation,
} from "@/hooks/use-professionals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";
import { ApiError } from "@/lib/http-client";
import { formatGlobalError } from "@/lib/error-handler";
import type { ProfessionalServicesInput } from "@nexos/shared";

interface Props {
  activeOrgId: string;
  professionalId: string;
  professionalName: string;
}

export function ServiceLinkEditor({ activeOrgId, professionalId, professionalName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const synced = useRef(false);

  const servicesQuery = useServicesQuery(activeOrgId);
  const linkQuery = useProfessionalServicesQuery(activeOrgId, expanded ? professionalId : null);
  const setLinkMutation = useSetProfessionalServicesMutation(activeOrgId);

  // Sync checkboxes with server data on first load after expand
  useEffect(() => {
    if (linkQuery.data && !synced.current) {
      setSelected(new Set(linkQuery.data.serviceIds));
      synced.current = true;
    }
  }, [linkQuery.data]);

  // Reset sync flag when collapsed
  function collapse() {
    setExpanded(false);
    synced.current = false;
  }

  if (!expanded) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
        <Link2 className="h-4 w-4" />
        Serviços
      </Button>
    );
  }

  const services = servicesQuery.data ?? [];
  const isLoading = servicesQuery.isLoading || linkQuery.isLoading;

  async function handleSave() {
    const input: ProfessionalServicesInput = { serviceIds: [...selected] };
    try {
      await setLinkMutation.mutateAsync({ professionalId, input });
      collapse();
    } catch (err) {
      if (err instanceof ApiError) {
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, { description: `${code} — Ref: ${requestId || "N/A"}` });
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    }
  }

  function toggle(serviceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }

  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Serviços de {professionalName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <LoadingState variant="inline" message="Carregando..." />
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {services.map((svc) => (
              <label
                key={svc.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[var(--color-muted)]/30 rounded px-1 py-0.5"
              >
                <input
                  type="checkbox"
                  checked={selected.has(svc.id)}
                  onChange={() => toggle(svc.id)}
                  className="h-4 w-4 rounded border-[var(--color-border)]"
                />
                <span className={svc.active ? "" : "text-[var(--color-muted-foreground)]"}>
                  {svc.name}
                  {!svc.active && " (inativo)"}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={setLinkMutation.isPending}>
            {setLinkMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Salvar vínculos
          </Button>
          <Button size="sm" variant="outline" onClick={collapse}>
            Fechar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
