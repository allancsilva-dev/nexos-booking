"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Link2 } from "lucide-react";
import {
  useServicesQuery,
  useProfessionalServicesQuery,
  useSetProfessionalServicesMutation,
} from "@/hooks/use-professionals";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/loading-state";
import { ApiError } from "@/lib/http-client";
import { formatGlobalError } from "@/lib/error-handler";
import type { ProfessionalServicesInput } from "@nexos/shared";
import { OperationalModal } from "@/components/ui/operational/modal";

interface Props {
  activeOrgId: string;
  professionalId: string;
  professionalName: string;
}

export function ServiceLinkEditor({ activeOrgId, professionalId, professionalName }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const synced = useRef(false);

  const servicesQuery = useServicesQuery(activeOrgId);
  const linkQuery = useProfessionalServicesQuery(activeOrgId, open ? professionalId : null);
  const setLinkMutation = useSetProfessionalServicesMutation(activeOrgId);

  // Sync checkboxes with server data on first load after expand
  useEffect(() => {
    if (linkQuery.data && !synced.current) {
      setSelected(new Set(linkQuery.data.serviceIds));
      synced.current = true;
    }
  }, [linkQuery.data]);

  // Reset sync flag when collapsed
  function closeModal() {
    setOpen(false);
    synced.current = false;
  }

  const services = servicesQuery.data ?? [];
  const isLoading = servicesQuery.isLoading || linkQuery.isLoading;

  async function handleSave() {
    const input: ProfessionalServicesInput = { serviceIds: [...selected] };
    try {
      await setLinkMutation.mutateAsync({ professionalId, input });
      closeModal();
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
    <>
      <Button
        variant="outline"
        size="sm"
        className="bg-[var(--color-surface-operational-strong)] hover:bg-[var(--color-muted)]"
        onClick={() => setOpen(true)}
      >
        <Link2 className="h-4 w-4" />
        Serviços
      </Button>
      <OperationalModal
        open={open}
        title={`Serviços de ${professionalName}`}
        description="Escolha quais serviços este profissional pode receber na agenda e no link público."
        onClose={closeModal}
        footer={
          <>
            <Button
              size="sm"
              variant="outline"
              className="bg-[var(--color-surface-operational-strong)] hover:bg-[var(--color-muted)]"
              onClick={closeModal}
            >
              Fechar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={setLinkMutation.isPending}>
              {setLinkMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Salvar vínculos
            </Button>
          </>
        }
      >
        {isLoading ? (
          <LoadingState variant="inline" message="Carregando..." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((svc) => (
              <label
                key={svc.id}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] px-3 py-3 transition-colors hover:bg-[var(--color-accent-soft)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(svc.id)}
                  onChange={() => toggle(svc.id)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)]"
                />
                <span className="min-w-0">
                  <span
                    className={
                      svc.active
                        ? "block text-sm font-medium text-[var(--color-foreground)]"
                        : "block text-sm font-medium text-[var(--color-muted-foreground)]"
                    }
                  >
                    {svc.name}
                  </span>
                  <span className="block text-xs text-[var(--color-muted-foreground)]">
                    {svc.active ? "Disponível para vínculo" : "Serviço inativo"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </OperationalModal>
    </>
  );
}
