import { cn } from "../../utils/cn";
import type { ReactNode } from "react";
import { ToolNicknameBadge } from "./ToolNicknameBadge";

export interface SecondaryToolCardProps {
  label: string;
  description?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  nickname?: string;
  tourId?: string;
}

export function SecondaryToolCard({
  label,
  description,
  icon,
  onClick,
  disabled,
  nickname,
  tourId,
}: SecondaryToolCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={tourId}
      disabled={disabled}
      className={cn(
        "group relative overflow-hidden rounded-xl bg-surface-raised border border-border hover:border-border/80 transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      style={{ minHeight: 100 }}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at top left, rgba(255,255,255,0.03) 0%, transparent 60%)",
          }}
        />
      </div>

      <div className="relative p-4 h-full flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--surface-2)" }}>
          <div className="text-muted-foreground group-hover:text-foreground transition-colors">{icon}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="text-sm font-medium text-foreground">{label}</div>
            {nickname ? <ToolNicknameBadge nickname={nickname} /> : null}
          </div>
          {description && (
            <div className="text-xs text-muted-foreground leading-snug line-clamp-2">{description}</div>
          )}
        </div>
      </div>
    </button>
  );
}
