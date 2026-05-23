import { cn } from "../utils/cn";

interface ProgressWidgetProps {
  milestones: { id: string; label: string; done: boolean }[];
  onViewPlans?: () => void;
}

export function ProgressWidget({ milestones, onViewPlans }: ProgressWidgetProps) {
  const total = milestones.length;
  const doneCount = milestones.filter((m) => m.done).length;
  const progressPct = total === 0 ? 0 : (doneCount / total) * 100;

  return (
    <div className="rounded-2xl border border-border bg-muted px-sm py-sm text-helper text-secondary-foreground">
      <div className="mb-1 flex items-center justify-between gap-xs">
        <p className="font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Progress &amp; rewards
        </p>
        <span className="text-meta text-muted-foreground">
          {doneCount}/{total} steps
        </span>
      </div>
      <div className="mb-xs h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-primary-400 transition-[width]",
            doneCount === total && "shadow-[0_0_18px_rgba(251,191,36,0.8)]"
          )}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-xs">
        {milestones.map((m) => (
          <span
            key={m.id}
            className={cn(
              "inline-flex items-center gap-2xs rounded-full border px-xs py-0.5",
              m.done
                ? "border-success-400/50 bg-success-500/15 text-success-100"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                m.done ? "bg-success-300" : "bg-secondary",
              )}
            />
            {m.label}
          </span>
        ))}
      </div>
      {onViewPlans && doneCount === total && (
        <button
          type="button"
          className="mt-xs text-meta font-semibold text-primary-200 underline underline-offset-2 hover:text-primary-100"
          onClick={onViewPlans}
        >
          See plans that match how you use Burnt Beats
        </button>
      )}
    </div>
  );
}

