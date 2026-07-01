import { cn } from "../../utils/cn";
import type { ReactNode } from "react";

export interface SecondaryToolCardProps {
  label: string;
  description?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export function SecondaryToolCard({ label, description, icon, onClick, disabled }: SecondaryToolCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{label}</div>
          {description && <div className="text-xs text-muted-foreground truncate">{description}</div>}
        </div>
      </div>
    </button>
  );
}
