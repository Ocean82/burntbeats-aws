import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, Trash2, Check, Sliders } from "lucide-react";
import { cn } from "../utils/cn";

type MixerState = {
  gain: number;
  pan: number;
  width: number;
  send: number;
};

type TrimState = {
  start: number;
  end: number;
};

export interface MixerPreset {
  id: string;
  name: string;
  createdAt: number;
  mixerState: Record<string, MixerState>;
  trimMap: Record<string, TrimState>;
  mutedStems: Record<string, boolean>;
}

interface MixerPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPreset: (preset: MixerPreset) => void;
  currentMixerState: Record<string, MixerState>;
  currentTrimMap: Record<string, TrimState>;
  currentMutedStems: Record<string, boolean>;
}

const PRESETS_STORAGE_KEY = "burnt-beats-mixer-presets";

const DEFAULT_PRESETS: MixerPreset[] = [
  {
    id: "vocals-forward",
    name: "Vocals Forward",
    createdAt: Date.now(),
    mixerState: {
      vocals: { gain: 3.0, pan: 0, width: 85, send: 50 },
      drums: { gain: -2.0, pan: 0, width: 60, send: 20 },
      bass: { gain: -1.5, pan: 0, width: 40, send: 15 },
      melody: { gain: -1.0, pan: 0, width: 75, send: 30 },
    },
    trimMap: {},
    mutedStems: {},
  },
  {
    id: "instrumental-focus",
    name: "Instrumental Focus",
    createdAt: Date.now(),
    mixerState: {
      vocals: { gain: -6.0, pan: 0, width: 70, send: 30 },
      drums: { gain: 1.5, pan: 0, width: 70, send: 25 },
      bass: { gain: 1.0, pan: 0, width: 50, send: 20 },
      melody: { gain: 2.0, pan: 0, width: 90, send: 45 },
    },
    trimMap: {},
    mutedStems: {},
  },
  {
    id: "dj-performance",
    name: "DJ Performance",
    createdAt: Date.now(),
    mixerState: {
      vocals: { gain: 0, pan: 0, width: 80, send: 40 },
      drums: { gain: 2.5, pan: 0, width: 65, send: 20 },
      bass: { gain: 2.0, pan: 0, width: 45, send: 15 },
      melody: { gain: -0.5, pan: 0, width: 85, send: 35 },
    },
    trimMap: {},
    mutedStems: {},
  },
];

export function MixerPresetsModal({
  isOpen,
  onClose,
  onLoadPreset,
  currentMixerState,
  currentTrimMap,
  currentMutedStems,
}: MixerPresetsModalProps) {
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
                    <h2 className="text-lg font-semibold text-white">Mixer Presets</h2>
                    <p className="text-xs text-white/50">Save and load your mix settings</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Save New Preset */}
              {showSaveForm ? (
                <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                  <input
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
