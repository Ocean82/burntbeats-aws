import { cn } from "../../utils/cn";
import type { SplitIntent } from "../../utils/splitIntent";
import { QUICK_INTENTS } from "../../utils/splitIntent";

export interface SplitIntentQuickActionsProps {
  selected: SplitIntent;
  onSelect: (intent: SplitIntent) => void;
  disabled?: boolean;
}

export function SplitIntentQuickActions({
  selected,
  onSelect,
  disabled = false,
}: SplitIntentQuickActionsProps) {
  const selectedKey = JSON.stringify({
    task: selected.task,
    targets: selected.targets,
    mode: selected.mode,
  });

  return (
    <div className="flex flex-col gap-xs">
      <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground">
        Quick actions
      </span>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_INTENTS.map(({ id, label, intent }) => {
          const key = JSON.stringify({
            task: intent.task,
            targets: intent.targets,
            mode: intent.mode,
          });
          const isActive = key === selectedKey;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(intent)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary-500 bg-primary-500/15 text-primary-200"
                  : "border-border bg-muted text-secondary-foreground hover:border-primary-500/40",
                disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
