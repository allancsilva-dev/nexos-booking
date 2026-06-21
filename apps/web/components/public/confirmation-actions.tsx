"use client";

import { useState } from "react";
import { Copy, Check, CalendarPlus } from "lucide-react";
import { WhatsAppLink } from "./whatsapp-link";
import { cn } from "@/lib/utils";

interface ConfirmationActionsProps {
  serviceName: string;
  professionalName: string;
  startsAt: string;
  endsAt: string;
  cancelToken: string;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
}

function formatGoogleDates(startsAt: string, endsAt: string): string {
  const toGoogle = (iso: string) => {
    const d = new Date(iso);
    const formatted = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(d);
    return formatted.replace(" ", "T").replace(/[-:]/g, "");
  };
  return `${toGoogle(startsAt)}/${toGoogle(endsAt)}`;
}

export function ConfirmationActions({
  serviceName,
  professionalName,
  startsAt,
  endsAt,
  cancelToken,
}: ConfirmationActionsProps) {
  const [copied, setCopied] = useState(false);

  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${serviceName} com ${professionalName}`)}&dates=${formatGoogleDates(startsAt, endsAt)}`;

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(cancelToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback: show token text for manual copy
    }
  };

  const actionClass = cn(
    "inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition-colors",
    "hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
  );

  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label="Ações pós-agendamento">
      <button
        type="button"
        onClick={copyToken}
        className={actionClass}
        aria-label="Copiar link de cancelamento"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-green-500" />
            Copiado!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copiar link de cancelamento
          </>
        )}
      </button>

      <WhatsAppLink
        serviceName={serviceName}
        professionalName={professionalName}
        date={formatDate(startsAt)}
        time={formatTime(startsAt)}
      />

      <a
        href={calendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={actionClass}
        aria-label="Adicionar ao Google Calendar"
      >
        <CalendarPlus className="h-4 w-4" />
        Adicionar ao calendário
      </a>
    </div>
  );
}
