import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Trash2, Check, Sliders } from "lucide-react";
import { defaultMixer, type MixerState, type TrimState } from "../types";
import { useModalA11y } from "../hooks/useModalA11y";
import { useProductMotion } from "../motion/useProductMotion";
import { VOCAL_CLEANUP_PRESET } from "../data/vocalCleanupPreset";

export interface MixerPreset {
  id: string;
  name: string;
  createdAt: number;
  mixerState: Record<string, MixerState>;
  trimMap: Record<string, TrimState>;
  mutedStems: Record<string, boolean>;
  pitchMap: Record<string, number>;
  timeStretchMap: Record<string, number>;
  fadeMap?: Record<string, { fadeIn: number; fadeOut: number }>;
}

interface MixerPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPreset: (preset: MixerPreset) => void;
  currentMixerState: Record<string, MixerState>;
  currentTrimMap: Record<string, TrimState>;
  currentMutedStems: Record<string, boolean>;
  currentPitchMap: Record<string, number>;
  currentTimeStretchMap: Record<string, number>;
  currentFadeMap: Record<string, { fadeIn: number; fadeOut: number }>;
}

const PRESETS_STORAGE_KEY = "burnt-beats-mixer-presets";
const presetMixer = (gain: number, pan: number, width: number): MixerState => ({
  ...defaultMixer,
  gain,
  pan,
  width,
});

const DEFAULT_PRESETS: MixerPreset[] = [
  VOCAL_CLEANUP_PRESET,
  {
    id: "vocals-forward",
    name: "Vocals Forward",
    createdAt: Date.now(),
    mixerState: {
      vocals: presetMixer(3.0, 0, 100),
      drums: presetMixer(-2.0, 0, 75),
      bass: presetMixer(-1.5, 0, 50),
      melody: presetMixer(-1.0, 0, 90),
    },
    trimMap: {},
    mutedStems: {},
    pitchMap: {},
    timeStretchMap: {},
  },
  {
    id: "instrumental-focus",
    name: "Instrumental Focus",
    createdAt: Date.now(),
    mixerState: {
      vocals: presetMixer(-6.0, 0, 85),
      drums: presetMixer(1.5, 0, 85),
      bass: presetMixer(1.0, 0, 60),
      melody: presetMixer(2.0, 0, 100),
    },
    trimMap: {},
    mutedStems: {},
    pitchMap: {},
    timeStretchMap: {},
  },
  {
    id: "dj-performance",
    name: "DJ Performance",
    createdAt: Date.now(),
    mixerState: {
      vocals: presetMixer(0, 0, 95),
      drums: presetMixer(2.5, 0, 80),
      bass: presetMixer(2.0, 0, 55),
      melody: presetMixer(-0.5, 0, 100),
    },
    trimMap: {},
    mutedStems: {},
    pitchMap: {},
    timeStretchMap: {},
  },
];

export function MixerPresetsModal({
  isOpen,
  onClose,
  onLoadPreset,
  currentMixerState,
  currentTrimMap,
  currentMutedStems,
  currentPitchMap,
  currentTimeStretchMap,
  currentFadeMap,
}: MixerPresetsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const motionCfg = useProductMotion();
  useModalA11y(isOpen, modalRef, onClose);

  const [presets, setPresets] = useState<MixerPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  // Load presets from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- init from localStorage on open
        setPresets([...DEFAULT_PRESETS, ...parsed]);
      } catch {
         
        setPresets(DEFAULT_PRESETS);
      }
    } else {
       
      setPresets(DEFAULT_PRESETS);
    }
  }, [isOpen]);

  const savePreset = () => {
    if (!newPresetName.trim()) return;

    const newPreset: MixerPreset = {
      id: `custom-${Date.now()}`,
      name: newPresetName.trim(),
      createdAt: Date.now(),
      mixerState: currentMixerState,
      trimMap: currentTrimMap,
      mutedStems: currentMutedStems,
      pitchMap: currentPitchMap,
      timeStretchMap: currentTimeStretchMap,
      fadeMap: currentFadeMap,
    };

    const customPresets = presets.filter((p) => p.id.startsWith("custom-"));
    const updatedCustomPresets = [...customPresets, newPreset];
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedCustomPresets));
    setPresets([...DEFAULT_PRESETS, ...updatedCustomPresets]);
    setNewPresetName("");
    setShowSaveForm(false);
  };

  const deletePreset = (id: string) => {
    const customPresets = presets.filter((p) => p.id.startsWith("custom-") && p.id !== id);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(customPresets));
    setPresets([...DEFAULT_PRESETS, ...customPresets]);
  };

  const handleLoadPreset = (preset: MixerPreset) => {
    onLoadPreset(preset);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-modal-backdrop bg-secondary backdrop-blur-sm"
            {...motionCfg.modalBackdrop}
            onClick={onClose}
          />

          <div className="fixed inset-0 z-modal flex items-center justify-center p-sm sm:p-md">
            <motion.div
              className="relative w-full max-w-md max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-3xl border border-border bg-popover/95 p-md shadow-elevation-xl backdrop-blur-xl sm:max-h-[calc(100vh-2rem)] sm:p-lg"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mixer-presets-title"
              tabIndex={-1}
              {...motionCfg.modalContent}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-lg flex items-start justify-between gap-sm">
                <div className="flex min-w-0 items-center gap-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/20">
                    <Sliders className="h-5 w-5 text-primary-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="mixer-presets-title" className="text-readable text-lg font-semibold text-foreground">Mixer Presets</h2>
                    <p className="text-readable text-xs text-muted-foreground">Save and load your mix settings</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close mixer presets"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Save New Preset */}
              {showSaveForm ? (
                <div className="mb-md rounded-xl border border-primary-400/30 bg-primary-500/10 p-md">
                  <label htmlFor="preset-name" className="mb-xs block text-sm font-medium text-primary-200">
                    Preset Name
                  </label>
                  <input
                    id="preset-name"
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Enter preset name..."
                    className="mb-sm w-full min-w-0 rounded-lg border border-border bg-muted px-sm py-xs text-sm text-foreground placeholder:text-muted-foreground focus:border-primary-400/50 focus:outline-none"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: modal just opened, user expects focus in name field
                    autoFocus
                  />
                  <div className="flex gap-xs">
                    <button
                      onClick={savePreset}
                      disabled={!newPresetName.trim()}
                      className="flex flex-1 items-center justify-center gap-xs rounded-lg bg-primary-500 px-md py-xs text-sm font-medium text-black transition hover:bg-primary-400 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Save Preset
                    </button>
                    <button
                      onClick={() => setShowSaveForm(false)}
                      className="rounded-lg border border-border px-md py-xs text-sm text-secondary-foreground transition hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="mb-md flex w-full items-center justify-center gap-xs rounded-xl border border-dashed border-border bg-muted/[0.02] py-sm text-sm text-muted-foreground transition hover:border-border hover:bg-muted/[0.05] hover:text-foreground"
                >
                  <Save className="h-4 w-4" />
                  Save Current Mix as Preset
                </button>
              )}

              {/* Preset List */}
              <div className="max-h-[300px] space-y-xs overflow-y-auto">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="group flex items-center justify-between gap-xs rounded-xl border border-border bg-muted/[0.03] px-md py-sm transition hover:bg-muted/[0.06]"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{preset.name}</span>
                      <span className="text-readable block text-xs text-muted-foreground">
                        {preset.id.startsWith("custom-") ? "Custom" : "Default"} preset
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-xs">
                      {preset.id.startsWith("custom-") && (
                        <button
                          onClick={() => deletePreset(preset.id)}
                          aria-label={`Delete preset ${preset.name}`}
                          title={`Delete preset ${preset.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-destructive-500/20 hover:text-destructive-400 group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleLoadPreset(preset)}
                        className="rounded-lg border border-border bg-muted px-sm py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
