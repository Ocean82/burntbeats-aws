/**
 * Contextual empty state component.
 *
 * Displays a friendly, inviting placeholder when a page or section has no
 * content yet. Includes an icon, heading, description, and call-to-action.
 */
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  /** Icon or illustration to display. */
  icon: ReactNode;
  /** Short heading describing the empty state. */
  title: string;
  /** Longer description with guidance on what to do next. */
  description?: string;
  /** Primary call-to-action button. */
  action?: EmptyStateAction;
  /** Optional secondary action (e.g., "Learn more"). */
  secondaryAction?: EmptyStateAction;
  /** Additional content below the description. */
  children?: ReactNode;
  /** Additional CSS classes on the root container. */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-stretch gap-md rounded-2xl border border-border/50 bg-muted/10 px-lg py-2xl text-center",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border/40 bg-muted/30 text-muted-foreground">
        {icon}
      </div>

      <div className="copy-block mx-auto flex w-full max-w-md flex-col gap-xs">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-readable text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {children}

      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-sm pt-sm">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="fire-button tap-feedback px-lg py-sm text-sm"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="ghost-button tap-feedback px-md py-sm text-sm"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
