import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  variant?: "spinner" | "skeleton" | "inline";
  message?: string;
  className?: string;
}

export function LoadingState({ variant = "spinner", message, className }: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)]", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {message && <span>{message}</span>}
      </span>
    );
  }

  if (variant === "skeleton") {
    return (
      <div className={cn("space-y-4 p-6", className)}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
      {message && (
        <p className="text-sm text-[var(--color-muted-foreground)]">{message}</p>
      )}
    </div>
  );
}
