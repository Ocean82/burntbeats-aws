/**
 * Structured error state component.
 *
 * Replaces raw error strings with a professional, consistent error display
 * that includes contextual icon, title, description, and actionable buttons.
 */
import type { ReactNode } from "react";
import {
  WifiOff,
  ServerCrash,
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "../../utils/cn";

export type ErrorVariant =
  | "network"
  | "auth"
  | "server"
  | "validation"
  | "generic";

export interface ErrorStateAction {
  label: string;
  onClick: () => void;
}

export interface ErrorStateProps {
  /** Visual variant determines icon and accent color. */
  variant?: ErrorVariant;
  /** Short, human-readable title. */
  title?: string;
  /** Longer description of what happened. */
  description?: string;
  /** Primary action button (e.g., "Retry", "Sign In"). */
  action?: ErrorStateAction;
  /** Optional retry handler — renders a "Try Again" button if provided. */
  onRetry?: () => void;
  /** Additional content below the description. */
  children?: ReactNode;
  /** Additional CSS classes on the root container. */
  className?: string;
}

const VARIANT_CONFIG: Record<
  ErrorVariant,
  { icon: typeof WifiOff; defaultTitle: string; accentClass: string }
> = {
  network: {
    icon: WifiOff,
    defaultTitle: "Connection lost",
    accentClass: "text-warning border-warning/30 bg-warning-muted/20",
  },
  auth: {
    icon: ShieldAlert,
    defaultTitle: "Authentication required",
    accentClass: "text-primary-400 border-primary-400/30 bg-primary-900/20",
  },
  server: {
    icon: ServerCrash,
    defaultTitle: "Something went wrong",
    accentClass: "text-destructive border-destructive/30 bg-error-muted/20",
  },
  validation: {
    icon: AlertTriangle,
    defaultTitle: "Invalid input",
    accentClass: "text-warning border-warning/30 bg-warning-muted/20",
  },
  generic: {
    icon: AlertCircle,
    defaultTitle: "An error occurred",
    accentClass: "text-muted-foreground border-border bg-muted/20",
  },
};

export function ErrorState({
  variant = "generic",
  title,
  description,
  action,
  onRetry,
  children,
  className,
}: ErrorStateProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;
  const displayTitle = title || config.defaultTitle;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex flex-col items-center gap-md rounded-2xl border px-lg py-xl text-center",
        config.accentClass,
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-current/10">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-xs">
        <h3 className="text-base font-semibold text-foreground">
          {displayTitle}
        </h3>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {children}

      {(action || onRetry) && (
        <div className="flex flex-wrap items-center justify-center gap-sm pt-xs">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ghost-button tap-feedback inline-flex items-center gap-xs text-sm"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          )}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="fire-button tap-feedback px-md py-sm text-sm"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
