import * as React from "react";
import { cn } from "@/lib/utils";

const panelVariants = {
  default:
    "border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] text-[var(--color-foreground)] shadow-[var(--shadow-operational-card)]",
  muted:
    "border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] text-[var(--color-foreground)]",
  accent:
    "border-[var(--color-border-strong)] bg-[var(--color-surface-operational)] text-[var(--color-foreground)] shadow-[var(--shadow-operational-ambient)]",
} as const;

interface OperationalPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof panelVariants;
}

const OperationalPanel = React.forwardRef<HTMLDivElement, OperationalPanelProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <section
      ref={ref}
      className={cn(
        "rounded-[var(--radius-panel)] border",
        panelVariants[variant],
        className,
      )}
      {...props}
    />
  ),
);
OperationalPanel.displayName = "OperationalPanel";

const OperationalPanelHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-3 px-5 py-5 sm:px-6", className)}
    {...props}
  />
));
OperationalPanelHeader.displayName = "OperationalPanelHeader";

const OperationalPanelTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-bold tracking-tight text-[var(--color-foreground)]", className)}
    {...props}
  />
));
OperationalPanelTitle.displayName = "OperationalPanelTitle";

const OperationalPanelDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[var(--color-muted-foreground)]", className)}
    {...props}
  />
));
OperationalPanelDescription.displayName = "OperationalPanelDescription";

const OperationalPanelContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />
));
OperationalPanelContent.displayName = "OperationalPanelContent";

export {
  OperationalPanel,
  OperationalPanelHeader,
  OperationalPanelTitle,
  OperationalPanelDescription,
  OperationalPanelContent,
};
