import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-16", className)}>
      <div className="rounded-full bg-[var(--color-muted)] p-4">
        {icon ?? <PackageOpen className="h-8 w-8 text-[var(--color-muted-foreground)]" />}
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-[var(--color-foreground)]">
          {title}
        </h3>
        <p className="text-sm text-[var(--color-muted-foreground)] max-w-sm">
          {description}
        </p>
      </div>
      {action && (
        <Button variant="default" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
