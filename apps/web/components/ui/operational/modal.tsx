"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface OperationalModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function OperationalModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: OperationalModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 bg-black/72 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="operational-modal-title"
        aria-describedby={description ? "operational-modal-description" : undefined}
        className={cn(
          "relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational)] text-[var(--color-foreground)] shadow-[var(--shadow-operational-ambient)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-strong)] px-5 py-5 sm:px-6">
          <div className="space-y-1">
            <h2 id="operational-modal-title" className="text-xl font-bold tracking-tight">
              {title}
            </h2>
            {description ? (
              <p
                id="operational-modal-description"
                className="max-w-[60ch] text-sm text-[var(--color-muted-foreground)]"
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-[var(--color-muted-foreground)] hover:bg-white/5"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[min(72vh,720px)] overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border-strong)] px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
