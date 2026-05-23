import { cn } from "../utils/cn";

type PipelineStepProps = {
  title: string;
  children: string;
  active: boolean;
  done: boolean;
};

export function PipelineStep({ title, children, active, done }: PipelineStepProps) {
  return (
    <div
      className={cn(
        "glass-card rounded-xl border px-md py-md transition-colors duration-[var(--motion-normal)] ease-[var(--ease-out-quart)]",
        active &&
          "border-primary-300/28 bg-[rgba(255,146,88,0.12)] shadow-[0_0_0_1px_rgba(255,157,94,0.12),0_12px_28px_rgba(255,116,56,0.1)]",
        done && !active && "border-border bg-muted",
        !done && !active && "border-border bg-muted",
      )}
    >
      <div className="flex items-center gap-sm">
        <span
          className={cn(
            "inline-flex h-3 w-3 rounded-full border border-border bg-muted transition-colors duration-[var(--motion-fast)]",
            active && "bg-[var(--accent)] shadow-[0_0_18px_var(--accent)]",
            done && !active && "bg-secondary",
          )}
        />
        <div className="font-display text-xl tracking-[-0.03em] text-foreground">
          {title}
        </div>
      </div>
      <div className="mt-xs pl-6 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
