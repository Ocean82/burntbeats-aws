/**
 * DrumMachineWorkspace — Drum tab content with lazy-mounted audio hooks.
 */
import "../midi-convert/midi-tokens.css";
import "./drum-machine.css";
import type { UseSubscriptionResult } from "../../hooks/useSubscription";
import { DrumMachinePanel } from "./DrumMachinePanel";
import { PatternPresetBar } from "./PatternPresetBar";
import { useBeatMaker } from "../../hooks/useBeatMaker";
import { useMasterBus } from "../../hooks/useMasterBus";
import { usePatternStorage } from "../../hooks/usePatternStorage";
import { useBeatMakerEntitlements } from "../../hooks/useBeatMakerEntitlements";
import { PatternChainView } from "./PatternChainView";
import { usePatternChain } from "../../hooks/usePatternChain";

export interface DrumMachineWorkspaceProps {
  subscription: UseSubscriptionResult;
  onViewPlans?: () => void;
}

export function DrumMachineWorkspace({
  subscription,
  onViewPlans,
}: DrumMachineWorkspaceProps) {
  const masterBus = useMasterBus();
  const beatMaker = useBeatMaker({
    getAudioContext: masterBus.getAudioContext,
    getOutputNode: masterBus.getGridGainNode,
  });
  const patternStorage = usePatternStorage();
  const entitlements = useBeatMakerEntitlements(subscription);
  const patternChain = usePatternChain();

  return (
    <div className="space-y-0">
      <div className="px-md pt-md">
        <PatternPresetBar
          beatMaker={beatMaker}
          storage={patternStorage}
          entitlements={entitlements}
        />
      </div>
      <DrumMachinePanel
        embedded
        beatMaker={beatMaker}
        masterBus={masterBus}
        canExportFullMidi={entitlements.limits.canExportFullMidi}
        canUseVariations={entitlements.limits.canUseVariations}
        onExportGated={onViewPlans}
        onVariationGated={onViewPlans}
      />
      <PatternChainView
        presets={patternStorage.savedPatterns.map(p => p.preset)}
        patternChain={patternChain}
        beatMaker={beatMaker}
      />
    </div>
  );
}
