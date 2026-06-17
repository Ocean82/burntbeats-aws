import { cn } from "../../utils/cn";
import type { SplitIntent } from "../../utils/splitIntent";
import { QUICK_INTENTS } from "../../utils/splitIntent";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

export interface SplitIntentQuickActionsProps {
  selected: SplitIntent;
  onSelect: (intent: SplitIntent) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}

function QuickActionButton({
  label,
  hint,
  isActive,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
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

  if (!hint) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span className="inline-flex">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-56 px-2 py-1.5 text-xs leading-snug"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

export function SplitIntentQuickActions({
  selected,
  onSelect,
  disabled = false,
  hideLabel = false,
}: SplitIntentQuickActionsProps) {
  const selectedKey = JSON.stringify({
    task: selected.task,
    targets: selected.targets,
    mode: selected.mode,
  });

  return (
    <div className="flex flex-col gap-xs">
      {!hideLabel && (
        <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </span>
      )}
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_INTENTS.map(({ id, label, hint, intent }) => {
            const key = JSON.stringify({
              task: intent.task,
              targets: intent.targets,
              mode: intent.mode,
            });
            const isActive = key === selectedKey;
            return (
              <QuickActionButton
                key={id}
                label={label}
                hint={hint}
                isActive={isActive}
                disabled={disabled}
                onClick={() => onSelect(intent)}
              />
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
