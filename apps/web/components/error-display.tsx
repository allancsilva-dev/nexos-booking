import type { ErrorBody } from "@nexos/shared";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorDisplayProps {
  error: ErrorBody;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({ error, onRetry, className }: ErrorDisplayProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-12", className)}>
      <div className="rounded-full bg-red-500/10 p-3">
        <AlertTriangle className="h-6 w-6 text-[var(--color-destructive)]" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xs font-mono text-[var(--color-muted-foreground)] uppercase tracking-wider">
          {error.code}
        </p>
        <p className="text-sm text-[var(--color-foreground)] max-w-md">
          {error.message}
        </p>
        {error.requestId && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Ref: {error.requestId}
          </p>
        )}
      </div>
      {error.details && error.details.length > 0 && (
        <ul className="space-y-1 text-xs text-left max-w-xs">
          {error.details.map((d, i) => (
            <li key={i} className="flex gap-1">
              <span className="font-mono text-[var(--color-muted-foreground)] shrink-0">
                {d.field}:
              </span>
              <span className="text-[var(--color-foreground)]">{d.issue}</span>
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
