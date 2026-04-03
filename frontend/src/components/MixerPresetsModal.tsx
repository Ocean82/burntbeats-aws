import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Trash2, Check, Sliders } from "lucide-react";
import { defaultMixer, type MixerState, type TrimState } from "../types";
import { useModalA11y } from "../hooks/useModalA11y";

export interface MixerPreset {
  id: string;
  name: string;
  createdAt: number;
  mixerState: Record<string, MixerState>;
  trimMap: Record<string, TrimState>;
  mutedStems: Record<string, boolean>;
  pitchMap: Record<string, number>;
  timeStretchMap: Record<string, number>;
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
}

const PRESETS_STORAGE_KEY = "burnt-beats-mixer-presets";
const presetMixer = (gain: number, pan: number, width: number): MixerState => ({
  ...defaultMixer,
  gain,
  pan,
  width,
});

const DEFAULT_PRESETS: MixerPreset[] = [
  {
    id: "vocals-forward",
    name: "Vocals Forward",
    createdAt: Date.now(),
    mixerState: {
      vocals: presetMixer(3.0, 0, 85),
      drums: presetMixer(-2.0, 0, 60),
      bass: presetMixer(-1.5, 0, 40),
      melody: presetMixer(-1.0, 0, 75),
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
      vocals: presetMixer(-6.0, 0, 70),
      drums: presetMixer(1.5, 0, 70),
      bass: presetMixer(1.0, 0, 50),
      melody: presetMixer(2.0, 0, 90),
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
      vocals: presetMixer(0, 0, 80),
      drums: presetMixer(2.5, 0, 65),
      bass: presetMixer(2.0, 0, 45),
      melody: presetMixer(-0.5, 0, 85),
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
}: MixerPresetsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1412]/95 p-6 shadow-2xl backdrop-blur-xl"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mixer-presets-title"
              tabIndex={-1}
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                    <Sliders className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 id="mixer-presets-title" className="text-lg font-semibold text-white">Mixer Presets</h2>
                    <p className="text-xs text-white/65">Save and load your mix settings</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close mixer presets"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Save New Preset */}
              {showSaveForm ? (
                <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                  <label htmlFor="preset-name" className="mb-2 block text-sm font-medium text-amber-200">
                    Preset Name
                  </label>
                  <input
                    id="preset-name"
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Enter preset name..."
                    className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-amber-400/50 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={savePreset}
                      disabled={!newPresetName.trim()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-400 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Save Preset
                    </button>
                    <button
                      onClick={() => setShowSaveForm(false)}
                      className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] py-3 text-sm text-white/60 transition hover:border-white/30 hover:bg-white/[0.05] hover:text-white"
                >
                  <Save className="h-4 w-4" />
                  Save Current Mix as Preset
                </button>
              )}

              {/* Preset List */}
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]"
                  >
                    <div>
                      <span className="block text-sm font-medium text-white">{preset.name}</span>
                      <span className="text-xs text-white/40">
                        {preset.id.startsWith("custom-") ? "Custom" : "Default"} preset
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {preset.id.startsWith("custom-") && (
                        <button
                          onClick={() => deletePreset(preset.id)}
                          aria-label={`Delete preset ${preset.name}`}
                          title={`Delete preset ${preset.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleLoadPreset(preset)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
