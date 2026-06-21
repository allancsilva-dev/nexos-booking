"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppLinkProps {
  serviceName: string;
  professionalName: string;
  date: string;
  time: string;
}

export function WhatsAppLink({ serviceName, professionalName, date, time }: WhatsAppLinkProps) {
  const message = `Olá! Agendei ${serviceName} com ${professionalName} para ${date} às ${time}.`;
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition-colors",
        "hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      )}
      aria-label={`Abrir WhatsApp com mensagem: ${message}`}
    >
      <MessageCircle className="h-4 w-4" />
      Compartilhar via WhatsApp
    </a>
  );
}
