/**
 * DrumMachineWorkspace — Drum tab content with lazy-mounted audio hooks.
 */
import "../midi-convert/midi-tokens.css";
import "./drum-machine.css";
import type { UseSubscriptionResult } from "../../hooks/useSubscription";
import { DrumMachinePanel } from "./DrumMachinePanel";
import { PatternPresetBar } from "./PatternPresetBar";
import { useBeatMaker } from "../../hooks/useBeatMaker";
import { useBeatMakerGridFocus } from "../../hooks/useBeatMakerGridFocus";
import { useBeatMakerKeyboard } from "../../hooks/useBeatMakerKeyboard";
import { useMasterBus } from "../../hooks/useMasterBus";
import { usePatternStorage } from "../../hooks/usePatternStorage";
import { useBeatMakerEntitlements } from "../../hooks/useBeatMakerEntitlements";
import { PatternChainView } from "./PatternChainView";
import { usePatternChain } from "../../hooks/usePatternChain";

export interface DrumMachineWorkspaceProps {
  subscription: UseSubscriptionResult;
  onViewPlans?: () => void;
  reduceMotion?: boolean;
}

export function DrumMachineWorkspace({
  subscription,
  onViewPlans,
  reduceMotion = false,
}: DrumMachineWorkspaceProps) {
  const masterBus = useMasterBus();
  const beatMaker = useBeatMaker({
    getAudioContext: masterBus.getAudioContext,
    getOutputNode: masterBus.getGridGainNode,
  });
  const entitlements = useBeatMakerEntitlements(subscription);
  const patternStorage = usePatternStorage({
    canCloudSync: entitlements.limits.canCloudSync,
  });
  const patternChain = usePatternChain();
  const gridFocus = useBeatMakerGridFocus();

  useBeatMakerKeyboard({
    beatMaker,
    gridFocus,
    canExportFullMidi: entitlements.limits.canExportFullMidi,
    onExportGated: onViewPlans,
    enabled: true,
  });

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
        gridFocus={gridFocus}
        reduceMotion={reduceMotion}
        canExportFullMidi={entitlements.limits.canExportFullMidi}
        canUseVariations={entitlements.limits.canUseVariations}
        onExportGated={onViewPlans}
        onVariationGated={onViewPlans}
      />
      <PatternChainView
        presets={patternStorage.savedPatterns.map((p) => p.preset)}
        patternChain={patternChain}
        beatMaker={beatMaker}
        canExportFullMidi={entitlements.limits.canExportFullMidi}
      />
    </div>
  );
}
