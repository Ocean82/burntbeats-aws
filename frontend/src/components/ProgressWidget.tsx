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
    <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-[11px] text-white/70">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-semibold uppercase tracking-[0.2em] text-white/55">
          Progress &amp; rewards
        </p>
        <span className="text-[10px] text-white/45">
          {doneCount}/{total} steps
        </span>
      </div>
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            "h-full rounded-full bg-amber-400 transition-[width]",
            doneCount === total && "shadow-[0_0_18px_rgba(251,191,36,0.8)]"
          )}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {milestones.map((m) => (
          <span
            key={m.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
              m.done
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                : "border-white/10 bg-white/5 text-white/60",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                m.done ? "bg-emerald-300" : "bg-white/35",
              )}
            />
            {m.label}
          </span>
        ))}
      </div>
      {onViewPlans && doneCount === total && (
        <button
          type="button"
          className="mt-2 text-[10px] font-semibold text-amber-200 underline underline-offset-2 hover:text-amber-100"
          onClick={onViewPlans}
        >
          See plans that match how you use Burnt Beats
        </button>
      )}
    </div>
  );
}

