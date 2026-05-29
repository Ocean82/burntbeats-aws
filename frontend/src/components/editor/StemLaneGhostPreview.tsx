import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../utils/cn";

const GHOST_STEMS = [
  { label: "Vox", color: "var(--stem-vocals)", height: "68%" },
  { label: "Drums", color: "var(--stem-drums)", height: "82%" },
  { label: "Bass", color: "var(--stem-bass)", height: "55%" },
  { label: "Melody", color: "var(--stem-melody)", height: "72%" },
] as const;

export interface StemLaneGhostPreviewProps {
  className?: string;
  /** Taller bars for hero / landing */
  variant?: "compact" | "hero";
}

/** Shared stem-lane silhouette used on landing and empty editor timeline. */
export function StemLaneGhostPreview({
  className,
  variant = "compact",
}: StemLaneGhostPreviewProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const barHeight =
    variant === "hero"
      ? "h-[clamp(3rem,10vw,5.5rem)]"
      : "h-[clamp(2.5rem,8vw,4rem)]";

  return (
    <div
      className={cn(
        "flex items-end justify-center gap-[clamp(0.5rem,2vw,1.25rem)]",
        barHeight,
        className,
      )}
      aria-hidden
    >
      {GHOST_STEMS.map((stem, i) => (
        <motion.div
          key={stem.label}
          className="flex flex-col items-center gap-1"
          initial={reduceMotion ? false : { opacity: 0, scaleY: 0.6 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { delay: 0.08 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }
          }
          style={{ transformOrigin: "bottom" }}
        >
          <div
            className="w-[clamp(1.5rem,3vw,2.75rem)] rounded-t-md opacity-40"
            style={{
              height: stem.height,
              background: `linear-gradient(180deg, color-mix(in srgb, ${stem.color} 55%, transparent), transparent)`,
              boxShadow: `0 0 16px color-mix(in srgb, ${stem.color} 25%, transparent)`,
            }}
          />
          <span
            className="text-[9px] font-semibold tracking-wide"
            style={{ color: stem.color, opacity: 0.65 }}
          >
            {stem.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
