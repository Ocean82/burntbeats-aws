import { Check } from "lucide-react";
import { cn } from "@/utils/cn";
import type { AppPhase, StepDef } from "@/types/phases";

/** Ordered phase sequence for the split flow. */
const PHASE_ORDER: AppPhase[] = ["upload", "configure", "splitting", "workspace"];

/** Human-readable labels for each phase. */
const PHASE_LABELS: Record<AppPhase, string> = {
  upload: "Upload",
  configure: "Configure",
  splitting: "Splitting",
  workspace: "Workspace",
};

export interface StepProgressIndicatorProps {
  /** Current active phase of the split flow. */
  phase: AppPhase;
}

/**
 * Derives step definitions from the current phase.
 * All phases before current = "completed", current = "active", after = "upcoming".
 */
export function deriveSteps(phase: AppPhase): StepDef[] {
  const currentIndex = PHASE_ORDER.indexOf(phase);
  return PHASE_ORDER.map((id, idx) => ({
    id,
    label: PHASE_LABELS[id],
    state: idx < currentIndex ? "completed" : idx === currentIndex ? "active" : "upcoming",
  }));
}

/**
 * StepProgressIndicator — Non-interactive breadcrumb showing 4 phases.
 * Hidden when in "workspace" phase (Req 7.3).
 * NOT interactive — no buttons, no click handlers (Req 7.4).
 * Visually distinguishes completed/active/upcoming without relying on color alone (Req 7.2).
 */
export function StepProgressIndicator({ phase }: StepProgressIndicatorProps) {
  // Hide in workspace phase (Req 7.3)
  if (phase === "workspace") {
    return null;
  }

  const steps = deriveSteps(phase);

  return (
    <div
      data-testid="step-progress-indicator"
      role="list"
      aria-label="Split flow progress"
      className="flex items-center gap-1"
    >
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-1" role="listitem">
          {/* Step circle + label */}
          <div className="flex items-center gap-1.5">
            {/* Circle indicator */}
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                step.state === "completed" &&
                  "bg-primary-500 text-white border border-primary-400",
                step.state === "active" &&
                  "bg-primary-500/20 text-primary-100 border-2 border-primary-400 ring-2 ring-primary-400/30",
                step.state === "upcoming" &&
                  "bg-muted/40 text-muted-foreground border border-border/60",
              )}
              aria-hidden="true"
            >
              {step.state === "completed" ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <span>{idx + 1}</span>
              )}
            </span>

            {/* Label */}
            <span
              className={cn(
                "text-xs font-medium whitespace-nowrap transition-colors",
                step.state === "completed" && "text-foreground",
                step.state === "active" && "text-primary-100 font-semibold",
                step.state === "upcoming" && "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </div>

          {/* Connector line between steps */}
          {idx < steps.length - 1 && (
            <div
              className={cn(
                "h-px w-4 sm:w-6 transition-colors",
                step.state === "completed" ? "bg-primary-500" : "bg-border/60",
              )}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );
}
