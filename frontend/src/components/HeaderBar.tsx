import { cn } from "@/utils/cn";
import { LAYOUT } from "@/constants/layout";
import type { AppPhase } from "@/types/phases";
import { StepProgressIndicator } from "./StepProgressIndicator";
import { NewSplitAction } from "./NewSplitAction";

export interface HeaderBarProps {
  /** Current active phase of the split flow. */
  phase: AppPhase;
  /** Optional className override. */
  className?: string;
  /** Called when the user confirms a new split. Triggers reset to upload phase. */
  onReset?: () => void;
}

/**
 * HeaderBar — Top navigation bar for the transitional split flow.
 * Contains: branding (left), step progress indicator (center), account area (right).
 * Step progress indicator is hidden in "workspace" phase (Req 7.3).
 */
export function HeaderBar({ phase, className, onReset }: HeaderBarProps) {
  return (
    <header
      data-testid="header-bar"
      className={cn(
        "glass-panel flex items-center justify-between rounded-2xl px-md sm:px-lg",
        className,
      )}
      style={{ height: `${LAYOUT.HEADER_HEIGHT}px` }}
      aria-label="Burnt Beats"
    >
      {/* Left: Branding */}
      <div className="flex min-w-0 items-center gap-sm">
        <img
          src="/logo-emblem.png"
          alt=""
          className="logo-emblem h-8 w-8 shrink-0 sm:h-9 sm:w-9"
          aria-hidden="true"
        />
        <span className="logo-burnt">
          <span className="logo-burnt-fire text-lg font-bold sm:text-xl">
            Burnt Beats
          </span>
        </span>
      </div>

      {/* Center: Step Progress Indicator (hidden in workspace) */}
      <div className="hidden sm:flex flex-1 justify-center">
        <StepProgressIndicator phase={phase} />
      </div>

      {/* Right: New Split action + Account area */}
      <div className="flex items-center gap-sm">
        {/* New Split action — only in workspace phase (Req 6.1, 6.2) */}
        {phase === "workspace" && onReset && (
          <NewSplitAction onReset={onReset} />
        )}
        {/* Account area — placeholder for future integration */}
        <div
          className="h-8 w-8 rounded-full bg-muted/40 border border-border/60"
          aria-label="Account"
        />
      </div>
    </header>
  );
}
