import { cn } from "../../utils/cn";
import type { ReactNode } from "react";

export interface PrimaryActionCardProps {
  headline: string;
  subhead: string;
  cta: string;
  icon: ReactNode;
  stemColor: "vocals" | "drums" | "melody";
  onClick: () => void;
  className?: string;
  isNew?: boolean;
}

const STEM_COLORS: Record<string, { soft: string; solid: string; border: string }> = {
  vocals: { soft: "var(--stem-vocals-soft)", solid: "var(--stem-vocals)", border: "var(--stem-vocals)" },
  drums: { soft: "var(--stem-drums-soft)", solid: "var(--stem-drums)", border: "var(--stem-drums)" },
  melody: { soft: "var(--accent-midi-muted)", solid: "var(--accent-midi)", border: "var(--accent-midi)" },
};

export function PrimaryActionCard({
  headline,
  subhead,
  cta,
  icon,
  stemColor,
  onClick,
  className,
  isNew,
}: PrimaryActionCardProps) {
  const colors = STEM_COLORS[stemColor] || STEM_COLORS.vocals;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-surface-raised border border-border transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left",
        className,
      )}
      style={{ minHeight: 240 }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at top left, ${colors.soft} 0%, transparent 60%)`,
          }}
        />
      </div>

      <div className="relative p-8 h-full flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between mb-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: colors.soft }}
            >
              <div style={{ color: colors.solid }}>{icon}</div>
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {stemColor === "vocals" ? "Isolate & Remix" : stemColor === "drums" ? "Create" : "Transcribe"}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-3">
            {headline}
            {isNew && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30">
                New
              </span>
            )}
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-md">{subhead}</p>
        </div>

        <div className="flex items-center gap-2 font-medium mt-6" style={{ color: colors.solid }}>
          <span>{cta}</span>
          <svg
            className="w-4 h-4 transition-transform group-hover:translate-x-1"
            style={{
              transitionDuration: "var(--motion-normal)",
              transitionTimingFunction: "var(--ease-out-quart)",
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
}
