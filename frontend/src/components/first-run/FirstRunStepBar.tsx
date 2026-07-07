import { cn } from "@/utils/cn";
import type { AppPhase } from "@/types/phases";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "configure", label: "Split" },
  { id: "workspace", label: "Export" },
] as const;

function stepIndex(phase: AppPhase): number {
  if (phase === "upload") return 0;
  if (phase === "configure" || phase === "splitting") return 1;
  return 2;
}

interface FirstRunStepBarProps {
  phase: AppPhase;
}

/** Compact 3-step guide for first-time users. */
export function FirstRunStepBar({ phase }: FirstRunStepBarProps) {
  const active = stepIndex(phase);

  return (
    <div
      className="mx-auto mb-md flex max-w-md items-center justify-center gap-2"
      aria-label="First split guide"
    >
      {STEPS.map((step, index) => {
        const isComplete = index < active;
        const isCurrent = index === active;
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold",
                isComplete && "bg-primary-500 text-white",
                isCurrent && "border-2 border-primary-400 bg-primary-500/20 text-primary-100",
                !isComplete && !isCurrent && "border border-border text-muted-foreground",
              )}
            >
              {index + 1}
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                isCurrent ? "text-primary-100" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <div
                className={cn(
                  "mx-1 h-px w-6",
                  isComplete ? "bg-primary-500" : "bg-border",
                )}
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
