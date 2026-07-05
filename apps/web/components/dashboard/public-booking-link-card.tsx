"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OperationalPanel,
  OperationalPanelContent,
  OperationalPanelDescription,
  OperationalPanelHeader,
  OperationalPanelTitle,
} from "@/components/ui/operational/panel";

interface PublicBookingLinkCardProps {
  slug: string | null;
}

export function PublicBookingLinkCard({ slug }: PublicBookingLinkCardProps) {
  const [copied, setCopied] = useState(false);

  const url =
    slug && typeof window !== "undefined"
      ? `${window.location.origin}/${slug}/agendar`
      : "";

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  return (
    <OperationalPanel variant="muted">
      <OperationalPanelHeader>
        <OperationalPanelTitle>Agenda externa</OperationalPanelTitle>
        <OperationalPanelDescription>
          Compartilhe este link para clientes agendarem online.
        </OperationalPanelDescription>
      </OperationalPanelHeader>
      <OperationalPanelContent>

        {slug ? (
          <>
            <div>
              <p className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Link público
              </p>
              <p className="mt-1 truncate rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] px-3 py-2 font-mono text-sm text-[var(--color-foreground)]">
                {url}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={handleCopy}>
                <Copy className="h-4 w-4" />
                {copied ? "Link copiado" : "Copiar link"}
              </Button>
              <Button asChild variant="outline" className="bg-[var(--color-surface-operational-strong)] hover:bg-[var(--color-operational-chip)]">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Abrir
                </a>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Não foi possível montar o link público da organização.
          </p>
        )}
      </OperationalPanelContent>
    </OperationalPanel>
  );
}
