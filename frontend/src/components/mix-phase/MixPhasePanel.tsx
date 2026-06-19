import type { ReactNode } from "react";
import type { StemDefinition } from "../../types";

export interface MixPhasePanelProps {
  stems: Array<StemDefinition & { url?: string }>;
  timeline: ReactNode;
}

export function MixPhasePanel({ stems, timeline }: MixPhasePanelProps) {
  return (
    <section aria-label="Mix" className="flex flex-col">
      {/* DAW console channel strip headers */}
      {stems.length > 0 && (
        <div className="flex items-center gap-1 border-b border-white/10 px-lg py-2">
          {stems.map((stem) => (
            <div
              key={stem.id}
              className="flex flex-1 items-center gap-1.5 rounded-md bg-white/[0.03] px-2 py-1"
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: stem.glow }}
              />
              <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {stem.label}
              </span>
            </div>
          ))}
          {/* Master badge */}
          <div className="flex w-16 shrink-0 items-center justify-center rounded-md bg-white/[0.03] px-2 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Master
            </span>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1">{timeline}</div>
    </section>
  );
}
