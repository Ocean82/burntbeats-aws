/**
 * Extended skeleton primitives for consistent loading states.
 *
 * Provides shape-specific skeleton placeholders that match the visual
 * structure of the content they replace, creating a polished loading experience.
 */
import { cn } from "../../utils/cn";

interface SkeletonBaseProps {
  className?: string;
}

/** Base shimmer animation class — shared by all variants. */
const SHIMMER_BASE =
  "animate-pulse rounded bg-muted/40";

/**
 * Text-shaped skeleton line. Configurable width for varied line lengths.
 */
export function SkeletonText({
  className,
  width = "100%",
}: SkeletonBaseProps & { width?: string }) {
  return (
    <div
      className={cn(SHIMMER_BASE, "h-3.5 rounded-full", className)}
      style={{ width }}
      aria-hidden="true"
    />
  );
}

/**
 * Circular skeleton (avatars, icons, status dots).
 */
export function SkeletonCircle({
  className,
  size = 40,
}: SkeletonBaseProps & { size?: number }) {
  return (
    <div
      className={cn(SHIMMER_BASE, "rounded-full", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/**
 * Rectangular skeleton (images, cards, panels).
 */
export function SkeletonRect({
  className,
  width = "100%",
  height = 80,
}: SkeletonBaseProps & { width?: string | number; height?: number }) {
  return (
    <div
      className={cn(SHIMMER_BASE, "rounded-xl", className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/**
 * Waveform-shaped skeleton — mimics the visual rhythm of an audio waveform.
 * Uses an SVG path for organic shape.
 */
export function SkeletonWaveform({
  className,
  height = 64,
}: SkeletonBaseProps & { height?: number }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl", className)}
      style={{ height }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
        className="h-full w-full animate-pulse"
      >
        <rect width="200" height="40" fill="currentColor" className="text-muted/30" />
        {/* Simulated waveform bars */}
        {Array.from({ length: 40 }, (_, i) => {
          const barHeight = 8 + Math.sin(i * 0.7) * 12 + Math.cos(i * 1.3) * 6;
          const y = (40 - barHeight) / 2;
          return (
            <rect
              key={i}
              x={i * 5}
              y={y}
              width={3}
              height={barHeight}
              rx={1.5}
              fill="currentColor"
              className="text-muted/50"
            />
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Card-shaped skeleton with header and body lines.
 */
export function SkeletonCard({ className }: SkeletonBaseProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-sm rounded-2xl border border-border/30 bg-muted/10 p-lg",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-sm">
        <SkeletonCircle size={32} />
        <SkeletonText width="40%" />
      </div>
      <div className="flex flex-col gap-xs pt-xs">
        <SkeletonText width="100%" />
        <SkeletonText width="85%" />
        <SkeletonText width="60%" />
      </div>
    </div>
  );
}

/**
 * Vertical meter skeleton (VU meters, level indicators).
 */
export function SkeletonMeter({
  className,
  height = 92,
}: SkeletonBaseProps & { height?: number }) {
  return (
    <div
      className={cn(SHIMMER_BASE, "w-5 rounded-full", className)}
      style={{ height }}
      aria-hidden="true"
    />
  );
}

/**
 * Full-width loading container with accessible status announcement.
 * Wraps skeleton content with proper ARIA attributes.
 */
export function SkeletonContainer({
  className,
  label = "Loading content",
  children,
}: SkeletonBaseProps & { label?: string; children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn("flex flex-col gap-md", className)}
    >
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}
