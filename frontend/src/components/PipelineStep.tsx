import { motion } from "framer-motion";
import { cn } from "../utils/cn";

type PipelineStepProps = {
  title: string;
  children: string;
  active: boolean;
  done: boolean;
};

export function PipelineStep({ title, children, active, done }: PipelineStepProps) {
  return (
    <motion.div
      className={cn(
        "glass-card rounded-xl border px-4 py-4 transition-colors duration-300",
        active &&
          "border-amber-300/28 bg-[rgba(255,146,88,0.12)] shadow-[0_0_0_1px_rgba(255,157,94,0.12),0_12px_28px_rgba(255,116,56,0.1)]",
        done && !active && "border-white/12 bg-white/5",
        !done && !active && "border-white/8 bg-black/20",
      )}
      initial={false}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex h-3 w-3 rounded-full border border-white/20 bg-white/10",
            active && "bg-[var(--accent)] shadow-[0_0_18px_var(--accent)]",
            done && !active && "bg-white/60",
          )}
        />
        <div className="font-display text-xl tracking-[-0.03em] text-white">
          {title}
        </div>
      </div>
      <div className="mt-2 pl-6 text-sm leading-6 text-white/60">
        {children}
      </div>
    </motion.div>
  );
}
