import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  testId?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Accessible label for the group */
  "aria-label": string;
  className?: string;
  testId?: string;
}

/** Hardware-style segmented toggle for product surfaces. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  className,
  testId,
}: SegmentedControlProps<T>) {
  const instanceId = useId();
  const layoutId = `segmented-indicator-${testId || instanceId}`;

  return (
    <div
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex rounded-xl border border-border bg-muted p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={opt.testId}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "tap-feedback relative z-[1] min-h-[44px] rounded-lg px-md py-xs text-xs font-medium transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
              selected
                ? "text-primary-200"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-primary-500/20 shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
