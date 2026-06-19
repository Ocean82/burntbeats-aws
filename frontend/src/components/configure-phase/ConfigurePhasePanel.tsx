import { useCallback } from "react";
import { ConfigureGlobalControls } from "./ConfigureGlobalControls";
import { ConfigureStemLane } from "./ConfigureStemLane";
import type { StemDefinition } from "../../types";
import type { StemEditorState } from "../../stem-editor-state";
import { cn } from "../../utils/cn";

export interface ConfigurePhasePanelProps {
  visibleStems: Array<StemDefinition & { url?: string }>;
  stemStates: Record<string, StemEditorState>;
  onStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
}

export function ConfigurePhasePanel({
  visibleStems,
  stemStates,
  onStemStateChange,
}: ConfigurePhasePanelProps) {
  const hasStems = visibleStems.length > 0;

  const handleStemChange = useCallback(
    (stemId: string) => (patch: Partial<StemEditorState>) => {
      onStemStateChange(stemId, patch);
    },
    [onStemStateChange],
  );

  return (
    <section aria-label="Configure" className="border-t border-border/50">
      <div className="flex flex-col gap-lg px-md pb-md sm:px-lg pt-lg">
        {/* Global controls section */}
        <ConfigureGlobalControls />

        {/* Per-stem controls section */}
        {hasStems ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Stems</h3>
            <div className="flex flex-col gap-2">
              {visibleStems.map((stem) => {
                const state = stemStates[stem.id];
                if (!state) return null;
                return (
                  <ConfigureStemLane
                    key={stem.id}
                    stem={stem}
                    state={state}
                    onStateChange={handleStemChange(stem.id)}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className={cn(
            "rounded-xl border border-white/10 bg-white/[0.02] p-lg text-sm text-muted-foreground",
          )}>
            Split or load stems to configure per-stem settings.
          </div>
        )}
      </div>
    </section>
  );
}
