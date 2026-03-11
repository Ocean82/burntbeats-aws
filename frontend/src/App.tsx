import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FolderOpen,
  Music2,
  Download,
  Play,
  Square,
  Sparkles,
  Sliders,
  RotateCcw,
  Volume2,
  VolumeX,
  Headphones,
  HelpCircle,
  Undo2,
  Redo2,
  Save,
  Repeat,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { splitStems, type SplitQuality, type StemResult } from "./api";
import { cn } from "./utils/cn";
import type { StemId, StemDefinition, MixerState, TrimState } from "./types";
import { defaultTrim, defaultMixer } from "./types";
import { getStemWaveform, setStemWaveform } from "./waveform-cache";
import { useKeyboardShortcuts, type ShortcutHandlers } from "./hooks/useKeyboardShortcuts";
import { useHistory } from "./hooks/useHistory";
import {
  HelpModal,
  ExportOptionsModal,
  MixerPresetsModal,
  OnboardingTour,
  BatchQueue,
  ComparisonToggle,
  PipelineStep,
  WaveformEditor,
  type ExportOptions,
  type MixerPreset,
  type QueueItem,
} from "./components";

const presetOptions = [
  "Full 4-Stem Split",
  "A Cappella",
  "Instrumental",
  "DJ Performance Pack",
];

const pipelineSteps = [
  { title: "Upload & split", blurb: "Your track is split into separate stems." },
  { title: "Listen & tweak", blurb: "Hear each stem, adjust levels and trim." },
  { title: "Load to mix", blurb: "Stems are ready to mix and play together." },
  { title: "Play & export", blurb: "Play the full mix, then download your master." },
];

/** Waveform bar count: high resolution so trim overlay matches transients (500–2000 range). */
const WAVEFORM_BINS = 1024;

function generateWaveform(seed: number, length = WAVEFORM_BINS, bias = 0.58) {
  return Array.from({ length }, (_, index) => {
    const phaseA = Math.sin((index + 1) * (seed * 0.28));
    const phaseB = Math.cos((index + 4) * (seed * 0.16));
    const phaseC = Math.sin((index + seed) * 0.11) * 0.3;
    const contour = Math.sin((index / length) * Math.PI * 2.6 + seed) * 0.18;
    const value = Math.abs((phaseA + phaseB + phaseC) / 2.5 + contour + bias);
    return Math.max(0.12, Math.min(1, value));
  });
}

/** Peak envelope from decoded AudioBuffer (max per bin across channels), normalized. Used so trim UI matches audible content. */
function computeWaveformFromBuffer(buffer: AudioBuffer, bins: number): number[] {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  if (length === 0) return Array(bins).fill(0.12);
  const binSize = length / bins;
  const values: number[] = [];
  let peak = 0;
  for (let i = 0; i < bins; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.min(length, Math.floor((i + 1) * binSize));
    let max = 0;
    for (let j = start; j < end; j++) {
      for (let c = 0; c < numChannels; c++) {
        const v = Math.abs(buffer.getChannelData(c)[j] ?? 0);
        if (v > max) max = v;
      }
    }
    values.push(max);
    if (max > peak) peak = max;
  }
  const scale = peak > 0 ? 1 / peak : 1;
  const minBar = 0.12;
  return values.map((v) => Math.max(minBar, Math.min(1, v * scale * 0.95 + minBar * 0.2)));
}

const stemDefinitions: StemDefinition[] = [
  {
    id: "vocals",
    label: "Vocals",
    subtitle: "Lead and harmonies",
    flavor: "Air, presence, top-end sheen",
    glow: "#ff845c",
    glowSoft: "rgba(255, 132, 92, 0.36)",
    waveform: generateWaveform(2.7, 72, 0.54),
  },
  {
    id: "drums",
    label: "Drums",
    subtitle: "Kick, snare, hats",
    flavor: "Transient punch and impact",
    glow: "#ffb347",
    glowSoft: "rgba(255, 179, 71, 0.34)",
    waveform: generateWaveform(4.4, 72, 0.62),
  },
  {
    id: "bass",
    label: "Bass",
    subtitle: "Low-end body",
    flavor: "Warmth, depth, sub control",
    glow: "#ff5a3d",
    glowSoft: "rgba(255, 90, 61, 0.34)",
    waveform: generateWaveform(6.2, 72, 0.68),
  },
  {
    id: "melody",
    label: "Melody",
    subtitle: "Keys, synths, guitars",
    flavor: "Movement, width, sparkle",
    glow: "#ffd36a",
    glowSoft: "rgba(255, 211, 106, 0.32)",
    waveform: generateWaveform(8.1, 72, 0.56),
  },
  {
    id: "instrumental",
    label: "Instrumental",
    subtitle: "All non-vocal",
    flavor: "Drums, bass, melody combined",
    glow: "#8b9dc3",
    glowSoft: "rgba(139, 157, 195, 0.34)",
    waveform: generateWaveform(5.2, 72, 0.55),
  },
  {
    id: "other",
    label: "Other",
    subtitle: "Keys, synths, guitars",
    flavor: "Melodic elements",
    glow: "#ffd36a",
    glowSoft: "rgba(255, 211, 106, 0.32)",
    waveform: generateWaveform(8.1, 72, 0.56),
  },
];

const stemIdToDefinition: Record<string, StemDefinition> = Object.fromEntries(
  stemDefinitions.map((d) => [d.id, d]),
);

const STEM_LABEL_COLOR_CLASS: Record<string, string> = {
  vocals: "stem-label-color-vocals",
  drums: "stem-label-color-drums",
  bass: "stem-label-color-bass",
  melody: "stem-label-color-melody",
  instrumental: "stem-label-color-instrumental",
  other: "stem-label-color-other",
};
function getStemDefinition(id: string): StemDefinition {
  const mapped = id === "other" ? "melody" : id;
  return stemIdToDefinition[mapped] ?? stemIdToDefinition.instrumental!;
}

const initialTrim: Record<string, TrimState> = {
  vocals: { start: 8, end: 92 },
  drums: { start: 4, end: 96 },
  bass: { start: 6, end: 89 },
  melody: { start: 12, end: 90 },
  instrumental: defaultTrim,
  other: defaultTrim,
};

const initialMixer: Record<string, MixerState> = {
  vocals: { gain: 1.8, pan: 2, width: 82, send: 46 },
  drums: { gain: 0.6, pan: 0, width: 64, send: 24 },
  bass: { gain: -1.4, pan: -3, width: 38, send: 16 },
  melody: { gain: 1.2, pan: 7, width: 88, send: 42 },
  instrumental: defaultMixer,
  other: defaultMixer,
};

function formatDb(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

/** Trim window in seconds, aligned to sample boundaries so export matches waveform/playback. */
function trimToSeconds(
  buffer: AudioBuffer,
  trim: TrimState
): { trimStart: number; trimEnd: number } {
  const length = buffer.length;
  const sr = buffer.sampleRate;
  const startSample = Math.floor((trim.start / 100) * length);
  const endSample = Math.min(Math.ceil((trim.end / 100) * length), length);
  const trimStart = Math.max(0, startSample / sr);
  const trimEnd = Math.min(buffer.duration, endSample / sr);
  return {
    trimStart,
    trimEnd: trimEnd > trimStart ? trimEnd : trimStart,
  };
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const offset = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let pos = offset;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, int16, true);
      pos += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

const NORMALIZE_PEAK_DB = -1;
const NORMALIZE_PEAK_LINEAR = Math.pow(10, NORMALIZE_PEAK_DB / 20);

function normalizeAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  let peak = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak <= 0) return buffer;
  const scale = NORMALIZE_PEAK_LINEAR / peak;
  const out = new OfflineAudioContext(
    numChannels,
    length,
    buffer.sampleRate
  ).createBuffer(numChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < length; i++) dst[i] = src[i] * scale;
  }
  return out;
}

function createStemPreviewBuffer(context: AudioContext, stemId: StemId) {
  const duration = 3.8;
  const frameCount = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(2, frameCount, context.sampleRate);

  const renderChannel = (channelData: Float32Array, stereoOffset: number) => {
    for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
      const time = sampleIndex / context.sampleRate;
      let value = 0;

      if (stemId === "vocals") {
        const progression = [220, 247, 262, 294];
        const note = progression[Math.floor(time / 0.95) % progression.length];
        const vibrato = 5 * Math.sin(2 * Math.PI * 5.4 * time);
        const airy = Math.sin(2 * Math.PI * (note + vibrato) * time);
        const overtone =
          0.38 * Math.sin(2 * Math.PI * (note * 2.02) * time + stereoOffset);
        const breath = 0.08 * Math.sin(2 * Math.PI * 28 * time);
        value = (airy + overtone + breath) * 0.22;
      }

      if (stemId === "drums") {
        const kickPhase = time % 0.6;
        const kick =
          Math.exp(-kickPhase * 14) *
          Math.sin(2 * Math.PI * (56 - kickPhase * 18) * time);
        const snareGate = Math.max(
          0,
          1 - Math.abs(((time + 0.3) % 0.6) - 0.3) * 18,
        );
        const snareNoise = (Math.random() * 2 - 1) * snareGate * 0.2;
        const hatGate =
          Math.max(0, 1 - ((time * 8.5 + stereoOffset) % 1)) * 0.05;
        const hat = Math.sin(2 * Math.PI * 4000 * time) * hatGate;
        value = kick * 0.82 + snareNoise + hat;
      }

      if (stemId === "bass") {
        const progression = [55, 55, 65.4, 49];
        const note = progression[Math.floor(time / 0.95) % progression.length];
        const envelope = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * time + 0.4);
        const sub = Math.sin(2 * Math.PI * note * time);
        const harmonic =
          0.24 * Math.sin(2 * Math.PI * note * 2 * time + 0.3 + stereoOffset);
        value = (sub + harmonic) * 0.28 * envelope;
      }

      if (stemId === "melody") {
        const progression = [440, 523.3, 659.2, 587.3, 784, 659.2, 523.3];
        const note = progression[Math.floor(time / 0.27) % progression.length];
        const triangle =
          (2 / Math.PI) *
          Math.asin(Math.sin(2 * Math.PI * note * time + stereoOffset));
        const shimmer = 0.2 * Math.sin(2 * Math.PI * note * 1.5 * time);
        value = (triangle + shimmer) * 0.21;
      }

      const fadeIn = Math.min(1, time / 0.08);
      const fadeOut = Math.min(1, (duration - time) / 0.16);
      channelData[sampleIndex] = value * fadeIn * fadeOut;
    }
  };

  renderChannel(buffer.getChannelData(0), 0);
  renderChannel(buffer.getChannelData(1), 0.22);

  return buffer;
}

function App() {
  const [selectedPreset, setSelectedPreset] = useState(presetOptions[0]);
  const [stemCount, setStemCount] = useState<2 | 4>(4);
  const [splitQuality, setSplitQuality] = useState<SplitQuality>("quality");
  const [selectedStems, setSelectedStems] = useState<Record<StemId, boolean>>({
    vocals: true,
    drums: true,
    bass: true,
    melody: true,
    instrumental: true,
    other: true,
  });
  const [uploadName, setUploadName] = useState("nightdrive_demo_master.wav");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [splitResultStems, setSplitResultStems] = useState<StemResult[]>([]);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitProgress, setSplitProgress] = useState(100);
  const [pipelineIndex, setPipelineIndex] = useState(pipelineSteps.length - 1);
  const [playingStem, setPlayingStem] = useState<string | null>(null);
  const [trimMap, setTrimMap] =
    useState<Record<string, TrimState>>(initialTrim);
  const [mixerState, setMixerState] =
    useState<Record<string, MixerState>>(initialMixer);
  const [mutedStems, setMutedStems] = useState<Record<string, boolean>>({
    vocals: false,
    drums: false,
    bass: false,
    melody: false,
    instrumental: false,
    other: false,
  });
  /** When any stem is soloed, only soloed stems are audible/exported; else per-track mute applies. */
  const [soloStems, setSoloStems] = useState<Record<string, boolean>>({});
  const [stemBuffers, setStemBuffers] = useState<Record<string, AudioBuffer>>(
    {},
  );
  const [stemWaveforms, setStemWaveforms] = useState<Record<string, number[]>>({});
  const [loadedTracks, setLoadedTracks] = useState<Record<string, boolean>>({});
  const [isLoadingStems, setIsLoadingStems] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [masterChain] = useState({
    compression: 2.4,
    limiter: -0.8,
    loudness: -9,
  });

  // New UI state for enhanced features
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [batchQueue, setBatchQueue] = useState<QueueItem[]>([]);
  const [batchQueueExpanded, setBatchQueueExpanded] = useState(true);
  const [collapsedStems, setCollapsedStems] = useState<Record<string, boolean>>({});
  const [originalAudioBuffer, setOriginalAudioBuffer] = useState<AudioBuffer | null>(null);
  const [selectedStemIndex, setSelectedStemIndex] = useState(0);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const playheadIntervalRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const mixDurationRef = useRef<number>(0);

  // History for undo/redo
  const mixerHistory = useHistory<Record<string, MixerState>>(initialMixer);
  const trimHistory = useHistory<Record<string, TrimState>>(initialTrim);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const mixSourceRefs = useRef<AudioBufferSourceNode[]>([]);
  const queueFileRef = useRef<Map<string, File>>(new Map());

  const visibleStems = useMemo(() => {
    if (splitResultStems.length > 0) {
      return splitResultStems.map((s) => ({
        ...getStemDefinition(s.id),
        id: s.id as StemId,
        url: s.url,
      }));
    }
    return stemDefinitions.filter((stem) => selectedStems[stem.id]);
  }, [splitResultStems, selectedStems]);

  useEffect(() => {
    if (!isSplitting) return;
    setPipelineIndex(0);
    const t1 = setTimeout(() => setPipelineIndex(1), 400);
    const t2 = setTimeout(() => setPipelineIndex(2), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isSplitting]);

  useEffect(() => {
    return () => {
      try {
        currentSourceRef.current?.stop();
      } catch {
        // Source may already be stopped during unmount.
      }
      mixSourceRefs.current.forEach((s) => {
        try {
          s.stop();
        } catch {
          // Ignored.
        }
      });
    };
  }, []);

  /** After split, stems (with urls) are loaded into AudioBuffers and rendered in StemCards for Hear/Solo/Mute/trim/mixer/Download. */
  const loadStemsIntoBuffers = useCallback(async () => {
    if (splitResultStems.length === 0) return;
    setIsLoadingStems(true);
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      setIsLoadingStems(false);
      return;
    }
    if (!audioContextRef.current)
      audioContextRef.current = new AudioContextCtor();
    const context = audioContextRef.current;
    await context.resume();
    const newLoaded: Record<string, boolean> = {};
    const newBuffers: Record<string, AudioBuffer> = {};
    for (const stem of splitResultStems) {
      if (stemBuffers[stem.id]) {
        newBuffers[stem.id] = stemBuffers[stem.id];
        newLoaded[stem.id] = true;
        continue;
      }
      try {
        const res = await fetch(stem.url);
        const arr = await res.arrayBuffer();
        const buffer = await context.decodeAudioData(arr);
        newBuffers[stem.id] = buffer;
        newLoaded[stem.id] = true;
      } catch (e) {
        console.error(`Failed to load stem ${stem.id}:`, e);
      }
    }
    setStemBuffers((prev) => ({ ...prev, ...newBuffers }));
    setLoadedTracks((prev) => ({ ...prev, ...newLoaded }));
    setIsLoadingStems(false);
  }, [splitResultStems, stemBuffers]);

  useEffect(() => {
    if (splitResultStems.length > 0) void loadStemsIntoBuffers();
  }, [splitResultStems, loadStemsIntoBuffers]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      const entries = Object.entries(stemBuffers);
      const stems = splitResultStems;
      if (entries.length === 0) return;

      const next: Record<string, number[]> = {};
      let index = 0;

      const processOne = async () => {
        if (cancelled) return;
        if (index >= entries.length) {
          if (!cancelled && Object.keys(next).length > 0) {
            setStemWaveforms((prev) => ({ ...prev, ...next }));
          }
          return;
        }
        const [id, buffer] = entries[index];
        index++;
        const url = stems.find((s) => s.id === id)?.url;
        let data: number[] | null = url
          ? await getStemWaveform(url, WAVEFORM_BINS)
          : null;
        if (cancelled) return;
        if (!data || data.length !== WAVEFORM_BINS) {
          data = computeWaveformFromBuffer(buffer, WAVEFORM_BINS);
          if (url) void setStemWaveform(url, WAVEFORM_BINS, data);
        }
        const waveformData: number[] = data;
        next[id] = waveformData;
        if (!cancelled) setStemWaveforms((prev) => ({ ...prev, [id]: waveformData }));
        // Yield to main thread to avoid "message/click handler took Nms" violations
        const scheduleNext =
          typeof requestIdleCallback !== "undefined"
            ? () => requestIdleCallback(() => void processOne())
            : () => setTimeout(() => void processOne(), 0);
        scheduleNext();
      };

      const scheduleFirst =
        typeof requestIdleCallback !== "undefined"
          ? () => requestIdleCallback(() => void processOne())
          : () => setTimeout(() => void processOne(), 0);
      scheduleFirst();
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [stemBuffers, splitResultStems]);

  const stopPreview = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Ignored because the source may have already ended.
      }
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }
    setPlayingStem(null);
  };

  const handlePreviewStem = useCallback(
    async (stemId: string, stemUrl?: string) => {
      if (playingStem === stemId) {
        stopPreview();
        return;
      }
      stopPreview();

      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextCtor) return;

      if (!audioContextRef.current)
        audioContextRef.current = new AudioContextCtor();
      const context = audioContextRef.current;
      await context.resume();

      let buffer: AudioBuffer;
      if (stemBuffers[stemId]) {
        buffer = stemBuffers[stemId];
      } else if (stemUrl) {
        const res = await fetch(stemUrl);
        const arr = await res.arrayBuffer();
        buffer = await context.decodeAudioData(arr);
        setStemBuffers((b) => ({ ...b, [stemId]: buffer }));
      } else {
        buffer = createStemPreviewBuffer(context, stemId as StemId);
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      gain.gain.value = 0.85;
      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
          setPlayingStem(null);
        }
      };
      currentSourceRef.current = source;
      source.start();
      setPlayingStem(stemId);
    },
    [playingStem, stemBuffers],
  );

  const loadStemsToTracks = useCallback(() => {
    void loadStemsIntoBuffers();
  }, [loadStemsIntoBuffers]);

  const handleStopMix = useCallback(() => {
    mixSourceRefs.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // Ignored.
      }
      s.disconnect();
    });
    mixSourceRefs.current = [];
    setIsPlayingMix(false);
    // Reset playhead
    if (playheadIntervalRef.current) {
      cancelAnimationFrame(playheadIntervalRef.current);
      playheadIntervalRef.current = null;
    }
    setPlayheadPosition(0);
  }, []);

  const handlePlayMix = useCallback(async () => {
    if (isPlayingMix) {
      handleStopMix();
      return;
    }
    stopPreview();
    // A/B comparison: play original when toggled to "Original"
    if (isComparing && showingOriginal && originalAudioBuffer) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
      const context = audioContextRef.current;
      await context.resume();
      const source = context.createBufferSource();
      source.buffer = originalAudioBuffer;
      source.connect(context.destination);
      source.onended = () => {
        mixSourceRefs.current = mixSourceRefs.current.filter((x) => x !== source);
        if (mixSourceRefs.current.length === 0) setIsPlayingMix(false);
      };
      source.start(0);
      mixSourceRefs.current = [source];
      setIsPlayingMix(true);
      mixDurationRef.current = originalAudioBuffer.duration;
      playStartTimeRef.current = context.currentTime;
      const updatePlayhead = () => {
        const elapsed = context.currentTime - playStartTimeRef.current;
        const progress = Math.min(100, (elapsed / mixDurationRef.current) * 100);
        setPlayheadPosition(progress);
        if (progress < 100) playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
      };
      playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
      return;
    }
    const hasSolo = splitResultStems.some((s) => soloStems[s.id]);
    const stemsToPlay = hasSolo
      ? splitResultStems.filter((s) => soloStems[s.id])
      : splitResultStems.filter((s) => !mutedStems[s.id]);
    if (stemsToPlay.length === 0) return;
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioContextRef.current)
      audioContextRef.current = new AudioContextCtor();
    const context = audioContextRef.current;
    await context.resume();
    const sources: AudioBufferSourceNode[] = [];
    for (const stem of stemsToPlay) {
      const buffer = stemBuffers[stem.id];
      if (!buffer) continue;
      const trim = trimMap[stem.id] ?? defaultTrim;
      const { trimStart, trimEnd } = trimToSeconds(buffer, trim);
      const playDuration = trimEnd - trimStart;
      const mixer = mixerState[stem.id] ?? defaultMixer;
      const gainVal = Math.pow(10, mixer.gain / 20);
      const source = context.createBufferSource();
      const gainNode = context.createGain();
      const panNode = context.createStereoPanner();
      source.buffer = buffer;
      gainNode.gain.value = gainVal;
      panNode.pan.value = mixer.pan / 20;
      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(context.destination);
      source.start(0, trimStart, trimStart + playDuration);
      source.onended = () => {
        mixSourceRefs.current = mixSourceRefs.current.filter((x) => x !== source);
        if (mixSourceRefs.current.length === 0) setIsPlayingMix(false);
      };
      sources.push(source);
    }
    mixSourceRefs.current = sources;
    setIsPlayingMix(true);
    
    // Track playhead position
    const firstStem = stemsToPlay[0];
    const buffer = stemBuffers[firstStem.id];
    if (buffer) {
      const trim = trimMap[firstStem.id] ?? defaultTrim;
      const { trimStart, trimEnd } = trimToSeconds(buffer, trim);
      mixDurationRef.current = trimEnd - trimStart;
      playStartTimeRef.current = context.currentTime;
      
      const updatePlayhead = () => {
        const elapsed = context.currentTime - playStartTimeRef.current;
        const progress = Math.min(100, (elapsed / mixDurationRef.current) * 100);
        setPlayheadPosition(progress);
        if (progress < 100 && isPlayingMix) {
          playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
        }
      };
      playheadIntervalRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [
    isPlayingMix,
    isComparing,
    showingOriginal,
    originalAudioBuffer,
    soloStems,
    splitResultStems,
    mutedStems,
    stemBuffers,
    trimMap,
    mixerState,
    handleStopMix,
  ]);

  const exportMasterWav = useCallback(
    async (options?: { normalize?: boolean; skipBusy?: boolean }) => {
      if (Object.keys(stemBuffers).length === 0) {
        setSplitError("Load stems to tracks first before exporting");
        return;
      }

      if (!options?.skipBusy) {
        setIsExporting(true);
        setSplitError(null);
      }

      try {
        const hasSolo = splitResultStems.some((s) => soloStems[s.id]);
        const stemsToMix = hasSolo
          ? splitResultStems.filter((s) => soloStems[s.id])
          : splitResultStems.filter((s) => !mutedStems[s.id]);

        let maxDuration = 0;
        const sources: {
          buffer: AudioBuffer;
          gain: number;
          pan: number;
          trimStart: number;
          trimEnd: number;
        }[] = [];

        for (const stem of stemsToMix) {
          const buffer = stemBuffers[stem.id];
          if (!buffer) continue;
          const trim = trimMap[stem.id] ?? defaultTrim;
          const { trimStart, trimEnd } = trimToSeconds(buffer, trim);
          const trimmedDuration = trimEnd - trimStart;
          maxDuration = Math.max(maxDuration, trimmedDuration);
          const mixer = mixerState[stem.id] ?? defaultMixer;
          sources.push({
            buffer,
            gain: Math.pow(10, mixer.gain / 20),
            pan: mixer.pan / 20,
            trimStart,
            trimEnd,
          });
        }

        if (maxDuration === 0) {
          throw new Error("No valid stems to export");
        }

        const exactFrameCount = Math.ceil(maxDuration * 44100);
        const context = new OfflineAudioContext(2, exactFrameCount, 44100);

        for (const { buffer, gain, pan, trimStart, trimEnd } of sources) {
          const source = context.createBufferSource();
          const gainNode = context.createGain();
          const panNode = context.createStereoPanner();

          source.buffer = buffer;
          gainNode.gain.value = gain;
          panNode.pan.value = pan;

          source.connect(gainNode);
          gainNode.connect(panNode);
          panNode.connect(context.destination);

          const playDuration = trimEnd - trimStart;
          source.start(0, trimStart, trimStart + playDuration);
        }

        let rendered = await context.startRendering();
        if (options?.normalize) {
          rendered = normalizeAudioBuffer(rendered);
        }
        const wavBlob = audioBufferToWav(rendered);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${uploadName.replace(/\.[^/.]+$/, "")}_master.wav`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setSplitError(e instanceof Error ? e.message : "Export failed");
      } finally {
        if (!options?.skipBusy) setIsExporting(false);
      }
    },
    [stemBuffers, splitResultStems, mixerState, mutedStems, soloStems, trimMap, uploadName]
  );

  const handleStemToggle = (stemId: StemId) => {
    setSelectedStems((current) => ({
      ...current,
      [stemId]: !current[stemId],
    }));
  };

  const handleFile = useCallback((file: File | null) => {
    if (!file) {
      setUploadedFile(null);
      setOriginalAudioBuffer(null);
      return;
    }
    setUploadName(file.name);
    setUploadedFile(file);
    setSplitProgress(0);
    setPipelineIndex(0);
    setSplitError(null);
    setSplitResultStems([]);
  }, []);

  // Decode uploaded file for A/B comparison (original vs mix)
  useEffect(() => {
    if (!uploadedFile) {
      setOriginalAudioBuffer(null);
      return;
    }
    let cancelled = false;
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    uploadedFile.arrayBuffer().then((buf) => {
      if (cancelled) return;
      return ctx.decodeAudioData(buf);
    }).then((buffer) => {
      if (!cancelled && buffer) setOriginalAudioBuffer(buffer);
    }).catch(() => {
      if (!cancelled) setOriginalAudioBuffer(null);
    });
    return () => {
      cancelled = true;
    };
  }, [uploadedFile]);

  const triggerSplit = useCallback(async () => {
    stopPreview();
    setSplitError(null);
    if (!uploadedFile) {
      setSplitError("Upload an audio file first.");
      return;
    }
    setIsSplitting(true);
    setSplitProgress(0);
    setPipelineIndex(0);
    try {
      const res = await splitStems(
        uploadedFile,
        String(stemCount) as "2" | "4",
        splitQuality,
        (status) => {
          setSplitProgress(status.progress);
          if (status.progress >= 100) setPipelineIndex(3);
          else if (status.progress >= 50) setPipelineIndex(2);
          else if (status.progress > 0) setPipelineIndex(1);
        },
      );
      setSplitResultStems(res.stems);
      setSplitProgress(100);
      setPipelineIndex(3);
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : "Split failed");
      setSplitProgress(0);
    } finally {
      setIsSplitting(false);
    }
  }, [uploadedFile, stemCount, splitQuality]);

  const activeStage = pipelineSteps[pipelineIndex];

  const resetTrackAdjustments = useCallback(() => {
    setTrimMap({ ...initialTrim });
    setMixerState({ ...initialMixer });
    trimHistory.reset({ ...initialTrim });
    mixerHistory.reset({ ...initialMixer });
  }, [trimHistory, mixerHistory]);

  // Load a mixer preset
  const handleLoadPreset = useCallback((preset: MixerPreset) => {
    if (Object.keys(preset.mixerState).length > 0) {
      setMixerState(preset.mixerState);
      mixerHistory.set(preset.mixerState);
    }
    if (Object.keys(preset.trimMap).length > 0) {
      setTrimMap(preset.trimMap);
      trimHistory.set(preset.trimMap);
    }
    if (Object.keys(preset.mutedStems).length > 0) {
      setMutedStems(preset.mutedStems);
    }
  }, [mixerHistory, trimHistory]);

  const downloadStemByUrl = useCallback(
    async (stem: StemResult, baseName: string): Promise<void> => {
      const res = await fetch(stem.url);
      if (!res.ok) throw new Error(`Failed to download stem: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}_${stem.id}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    },
    []
  );

  const handleExportWithOptions = useCallback(
    async (options: ExportOptions) => {
      const baseName = uploadName.replace(/\.[^/.]+$/, "");
      if (options.target === "stems" || options.target === "all") {
        if (splitResultStems.length === 0) {
          setSplitError("No stems to export. Split a track first.");
          return;
        }
      }
      setIsExporting(true);
      setSplitError(null);
      try {
        if (options.target === "master" || options.target === "all") {
          await exportMasterWav({
            normalize: options.normalize,
            skipBusy: true,
          });
        }
        if (options.target === "stems" || options.target === "all") {
          for (const stem of splitResultStems) {
            await downloadStemByUrl(stem, baseName);
          }
        }
        setShowExportModal(false);
      } catch (e) {
        setSplitError(e instanceof Error ? e.message : "Export failed");
      } finally {
        setIsExporting(false);
      }
    },
    [exportMasterWav, splitResultStems, uploadName, downloadStemByUrl]
  );

  // Comparison toggle
  const toggleComparison = useCallback(() => {
    setIsComparing((c) => !c);
    setShowingOriginal(false);
  }, []);

  const switchComparisonSource = useCallback(() => {
    setShowingOriginal((s) => !s);
  }, []);

  // Batch queue handlers
  const removeFromBatchQueue = useCallback((id: string) => {
    queueFileRef.current.delete(id);
    setBatchQueue((q) => q.filter((item) => item.id !== id));
  }, []);

  const clearCompletedFromQueue = useCallback(() => {
    setBatchQueue((q) => q.filter((item) => item.status !== "complete"));
  }, []);

  const addToBatchQueue = useCallback(() => {
    if (!uploadedFile) return;
    const id = crypto.randomUUID();
    setBatchQueue((q) => [
      ...q,
      { id, fileName: uploadedFile.name, fileSize: uploadedFile.size, status: "queued" as const, progress: 0 },
    ]);
    queueFileRef.current.set(id, uploadedFile);
  }, [uploadedFile]);

  const processNextInQueue = useCallback(async () => {
    const queued = batchQueue.find((i) => i.status === "queued");
    if (!queued) return;
    const file = queueFileRef.current.get(queued.id);
    if (!file) {
      setBatchQueue((q) => q.filter((i) => i.id !== queued.id));
      return;
    }
    setBatchQueue((q) =>
      q.map((i) => (i.id === queued.id ? { ...i, status: "processing" as const, progress: 0 } : i))
    );
    try {
      const res = await splitStems(
        file,
        String(stemCount) as "2" | "4",
        splitQuality,
        (status) => {
          setBatchQueue((q) =>
            q.map((i) => (i.id === queued.id ? { ...i, progress: status.progress } : i))
          );
        }
      );
      setBatchQueue((q) =>
        q.map((i) => (i.id === queued.id ? { ...i, status: "complete" as const, progress: 100 } : i))
      );
      setSplitResultStems(res.stems);
      setSplitError(null);
    } catch (err) {
      setBatchQueue((q) =>
        q.map((i) =>
          i.id === queued.id
            ? { ...i, status: "error" as const, error: err instanceof Error ? err.message : "Split failed" }
            : i
        )
      );
      setSplitError(err instanceof Error ? err.message : "Split failed");
    } finally {
      queueFileRef.current.delete(queued.id);
    }
  }, [batchQueue, stemCount, splitQuality]);

  // Keyboard shortcut handlers
  const shortcutHandlers: ShortcutHandlers = useMemo(() => ({
    playStop: () => {
      if (splitResultStems.length > 0) {
        void handlePlayMix();
      }
    },
    solo1: () => {
      const stemId = visibleStems[0]?.id;
      if (stemId) setSoloStems((c) => ({ ...c, [stemId]: !(c[stemId] ?? false) }));
    },
    solo2: () => {
      const stemId = visibleStems[1]?.id;
      if (stemId) setSoloStems((c) => ({ ...c, [stemId]: !(c[stemId] ?? false) }));
    },
    solo3: () => {
      const stemId = visibleStems[2]?.id;
      if (stemId) setSoloStems((c) => ({ ...c, [stemId]: !(c[stemId] ?? false) }));
    },
    solo4: () => {
      const stemId = visibleStems[3]?.id;
      if (stemId) setSoloStems((c) => ({ ...c, [stemId]: !(c[stemId] ?? false) }));
    },
    muteToggle: () => {
      const stemId = visibleStems[selectedStemIndex]?.id;
      if (stemId) setMutedStems((c) => ({ ...c, [stemId]: !(c[stemId] ?? false) }));
    },
    export: () => {
      if (splitResultStems.length > 0) {
        setShowExportModal(true);
      }
    },
    undo: () => {
      mixerHistory.undo();
      setMixerState(mixerHistory.state);
    },
    redo: () => {
      mixerHistory.redo();
      setMixerState(mixerHistory.state);
    },
    help: () => setShowHelpModal(true),
    escape: () => {
      if (showHelpModal) setShowHelpModal(false);
      else if (showExportModal) setShowExportModal(false);
      else if (showPresetsModal) setShowPresetsModal(false);
      else if (isPlayingMix) handleStopMix();
    },
  }), [
    splitResultStems,
    handlePlayMix,
    visibleStems,
    selectedStemIndex,
    mixerHistory,
    showHelpModal,
    showExportModal,
    showPresetsModal,
    isPlayingMix,
    handleStopMix,
  ]);

  // Activate keyboard shortcuts
  useKeyboardShortcuts(shortcutHandlers, true);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      {/* Onboarding Tour for new users */}
      <OnboardingTour onComplete={() => {}} onSkip={() => {}} />
      
      {/* Modals */}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportWithOptions}
        isExporting={isExporting}
        stemCount={splitResultStems.length}
      />
      <MixerPresetsModal
        isOpen={showPresetsModal}
        onClose={() => setShowPresetsModal(false)}
        onLoadPreset={handleLoadPreset}
        currentMixerState={mixerState}
        currentTrimMap={trimMap}
        currentMutedStems={mutedStems}
      />
      
      {/* Batch Queue */}
      {batchQueue.length > 0 && (
        <BatchQueue
          items={batchQueue}
          isExpanded={batchQueueExpanded}
          onToggleExpand={() => setBatchQueueExpanded((e) => !e)}
          onRemoveItem={removeFromBatchQueue}
          onClearCompleted={clearCompletedFromQueue}
          onProcessQueue={() => void processNextInQueue()}
        />
      )}
      
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="glass-panel mirror-sheen flex flex-col gap-6 rounded-[2rem] px-6 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-col gap-4 sm:gap-5">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-100/80">
              Stem Splitter / Mixer / Master
              <span className="h-1 w-1 rounded-full bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]" />
            </div>
            <div className="logo-burnt">
              <span className="logo-burnt-fire block text-4xl sm:text-5xl lg:text-6xl">
                Burnt Beats
              </span>
            </div>
            <p className="max-w-xl text-sm leading-6 text-white/70 sm:text-base">
              Split vocals, drums, bass, and melody → trim, level, pan → play mix, export.
            </p>
          </div>

          {/* Compact pipeline progress indicator */}
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <span className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                !uploadedFile 
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200" 
                  : "border-white/10 bg-white/5 text-white/65"
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", !uploadedFile ? "bg-amber-400" : "bg-white/40")} />
                Upload
              </span>
              <span className="text-white/20">→</span>
              <span className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                isSplitting 
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200" 
                  : uploadedFile && splitResultStems.length === 0 
                    ? "border-white/20 bg-white/5 text-white/70"
                    : "border-white/10 bg-white/5 text-white/65"
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", isSplitting ? "bg-amber-400 animate-pulse" : "bg-white/40")} />
                Split
              </span>
              <span className="text-white/20">→</span>
              <span className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-all",
                splitResultStems.length > 0 && !isExporting
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200" 
                  : "border-white/10 bg-white/5 text-white/65"
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", splitResultStems.length > 0 ? "bg-amber-400" : "bg-white/40")} />
                Mix & Export
              </span>
            </div>
            {splitResultStems.length > 0 && (
              <p className="text-xs text-green-400/80">
                {splitResultStems.length} stems ready
              </p>
            )}
            
            {/* Quick action buttons */}
            <div className="flex items-center gap-2">
              {/* Undo/Redo buttons */}
              <div className="flex items-center rounded-xl border border-white/10 bg-black/20">
                <button
                  type="button"
                  onClick={() => { mixerHistory.undo(); setMixerState(mixerHistory.state); }}
                  disabled={!mixerHistory.canUndo}
                  className="flex h-8 w-8 items-center justify-center text-white/65 transition hover:text-white disabled:opacity-30 disabled:hover:text-white/65"
                  title="Undo (Cmd/Ctrl + Z)"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <div className="h-4 w-px bg-white/10" />
                <button
                  type="button"
                  onClick={() => { mixerHistory.redo(); setMixerState(mixerHistory.state); }}
                  disabled={!mixerHistory.canRedo}
                  className="flex h-8 w-8 items-center justify-center text-white/65 transition hover:text-white disabled:opacity-30 disabled:hover:text-white/65"
                  title="Redo (Cmd/Ctrl + Y)"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>
              
              {/* Presets button */}
              <button
                type="button"
                onClick={() => setShowPresetsModal(true)}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white/60 transition hover:border-white/20 hover:text-white"
                title="Mixer presets"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Presets</span>
              </button>
              
              {/* Help button */}
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/65 transition hover:border-white/20 hover:text-white"
                title="Keyboard shortcuts (?)"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <motion.div
          className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-sm"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex w-max animate-scroll-text gap-12 py-2.5 text-xs uppercase tracking-[0.35em] text-white/60">
            <span>Drop track · Split · Mix · Export</span>
            <span>Fire-polished stem control with mirrored glass precision.</span>
            <span>Drop track · Split · Mix · Export</span>
            <span>Fire-polished stem control with mirrored glass precision.</span>
          </div>
        </motion.div>

        <motion.section
          className="flex flex-col gap-6"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.08 } },
            hidden: {},
          }}
        >
          <motion.div
            className="glass-panel mirror-sheen rounded-[2rem] p-5 sm:p-6"
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="eyebrow">Split & stems</p>
                <h2 className="font-display text-2xl tracking-[-0.04em] text-white">
                  Upload, split, then mix in one place
                </h2>
              </div>
              <div className="inline-flex items-center gap-3 rounded-full border border-amber-200/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                <span className="status-light" />
                {uploadName}
              </div>
            </div>

            <div className="space-y-4">
                {/* Step 1: Drop audio — glows when no file; dims after file selected */}
                <div
                  className={cn(
                    "transition-all duration-300",
                    uploadedFile && "opacity-75",
                  )}
                >
                  <p
                    className={cn(
                      "mb-2 text-[10px] font-semibold uppercase tracking-[0.35em] transition-colors",
                      !uploadedFile ? "text-amber-200/95" : "text-white/60",
                    )}
                  >
                    Step 1
                  </p>
                  <div
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDragging(false);
                      handleFile(event.dataTransfer.files?.[0] ?? null);
                    }}
                    className={cn(
                      "step-zone group relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-xl border px-4 py-3 text-left transition-all duration-300",
                      !uploadedFile &&
                        "step-zone-glow border-amber-400/40 bg-amber-950/30 shadow-[0_0_24px_rgba(255,140,80,0.35),0_0_48px_rgba(255,100,60,0.15)]",
                      uploadedFile &&
                        "border-white/10 bg-black/25",
                      isDragging && "scale-[1.01] border-amber-400/60 shadow-[0_0_32px_rgba(255,140,80,0.5)]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all icon-pulse-hover",
                        !uploadedFile
                          ? "border-amber-400/30 bg-amber-500/20 shadow-[0_0_16px_rgba(255,180,100,0.4)]"
                          : "border-white/12 bg-white/8",
                      )}
                    >
                      <Upload className="h-5 w-5 text-white" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {uploadedFile ? (
                        <span className="font-medium text-white">
                          {uploadName}
                        </span>
                      ) : (
                        <>
                          <span className="font-display text-lg tracking-tight text-white">
                            Drop your track here
                          </span>
                          <span className="ml-2 text-xs text-white/60">
                            or click to browse · WAV, MP3, AIFF
                          </span>
                        </>
                      )}
                    </div>
                    {uploadedFile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFile(null);
                        }}
                        className="ghost-button shrink-0 rounded-lg px-3 py-1.5 text-xs"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                {/* Step 2: Options & split — dim when no file; glows when file ready */}
                <div
                  className={cn(
                    "transition-all duration-300",
                    !uploadedFile && "pointer-events-none opacity-50",
                  )}
                >
                  <p
                    className={cn(
                      "mb-2 text-[10px] font-semibold uppercase tracking-[0.35em] transition-colors",
                      uploadedFile ? "text-amber-200/95" : "text-white/70",
                    )}
                  >
                    Step 2
                  </p>
                  <div
                    className={cn(
                      "rounded-xl border p-4 transition-all duration-300",
                      uploadedFile
                        ? "step-zone-glow border-amber-400/30 bg-amber-950/20 shadow-[0_0_20px_rgba(255,140,80,0.25),0_0_40px_rgba(255,100,60,0.1)]"
                        : "border-white/10 bg-black/25",
                    )}
                  >
                  <div className="space-y-5">
                    <div>
<p className="text-xs uppercase tracking-[0.3em] text-white/65">
                Stem count
                      </p>
                      <div className="mt-3 flex gap-3">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input
                            type="radio"
                            name="stemCount"
                            checked={stemCount === 2}
                            onChange={() => setStemCount(2)}
                            className="text-amber-300 focus:ring-amber-300"
                          />
                          2 stems (vocals + instrumental)
                        </label>
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input
                            type="radio"
                            name="stemCount"
                            checked={stemCount === 4}
                            onChange={() => setStemCount(4)}
                            className="text-amber-300 focus:ring-amber-300"
                          />
                          4 stems (vocals, drums, bass, other)
                        </label>
                      </div>
                    </div>
                    <div>
<p className="text-xs uppercase tracking-[0.3em] text-white/65">
                Quality vs speed
                      </p>
                      <div className="mt-3 flex gap-3">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input
                            type="radio"
                            name="splitQuality"
                            checked={splitQuality === "quality"}
                            onChange={() => setSplitQuality("quality")}
                            className="text-amber-300 focus:ring-amber-300"
                          />
                          Quality (better separation)
                        </label>
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 transition hover:bg-white/10">
                          <input
                            type="radio"
                            name="splitQuality"
                            checked={splitQuality === "speed"}
                            onChange={() => setSplitQuality("speed")}
                            className="text-amber-300 focus:ring-amber-300"
                          />
                          Speed (faster)
                        </label>
                      </div>
                    </div>
                    <div>
<p className="text-xs uppercase tracking-[0.3em] text-white/65">
                Preset
                      </p>
                      <select
                        id="stem-preset-select"
                        value={selectedPreset}
                        onChange={(event) =>
                          setSelectedPreset(event.target.value)
                        }
                        aria-label="Stem split preset"
                        title="Stem split preset"
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-white/7 px-4 py-3 text-sm text-white outline-none ring-0 transition focus:border-[var(--accent)]"
                      >
                        {presetOptions.map((option) => (
                          <option
                            key={option}
                            value={option}
                            className="bg-zinc-950 text-white"
                          >
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Show stem visibility toggles only after split is complete - progressive disclosure */}
                    {splitResultStems.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.3 }}
                    >
<p className="text-xs uppercase tracking-[0.3em] text-white/65">
                Pick stems to show
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {stemDefinitions.map((stem) => {
                          const on = selectedStems[stem.id] ?? false;
                          const baseClass =
                            "glow-toggle flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200";
                          const activeClass = "stem-toggle-active border-current shadow-lg";
                          const inactiveClass = "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:border-white/20";
                          const stemIdClass = `stem-toggle-${stem.id}`;
                          return on ? (
                            <button
                              key={stem.id}
                              type="button"
                              onClick={() => handleStemToggle(stem.id)}
                              className={cn(baseClass, stemIdClass, activeClass)}
                              aria-pressed="true"
                            >
                              <span className="flex items-center gap-3">
                                <span className={cn("stem-toggle-dot h-2.5 w-2.5 rounded-full transition-all stem-toggle-dot-on scale-110", stemIdClass)} />
                                {stem.label}
                              </span>
                              <span className="text-xs uppercase tracking-wider opacity-100">On</span>
                            </button>
                          ) : (
                            <button
                              key={stem.id}
                              type="button"
                              onClick={() => handleStemToggle(stem.id)}
                              className={cn(baseClass, stemIdClass, inactiveClass)}
                              aria-pressed="false"
                            >
                              <span className="flex items-center gap-3">
                                <span className={cn("stem-toggle-dot h-2.5 w-2.5 rounded-full transition-all", stemIdClass)} />
                                {stem.label}
                              </span>
                              <span className="text-xs uppercase tracking-wider opacity-50">Off</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                    )}

                    {splitError && (
                      <div className="rounded-2xl border border-red-400/30 bg-red-950/30 px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-200">Split failed</p>
                            <p className="mt-1 text-xs text-red-300/70">{splitError}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSplitError(null)}
                            className="text-red-300/60 hover:text-red-200 transition-colors text-xs"
                            aria-label="Dismiss error"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => void triggerSplit()}
                        disabled={!uploadedFile || isSplitting}
                        className="fire-button flex-1 justify-center disabled:opacity-60"
                      >
                        {isSplitting
                          ? "Splitting stems..."
                          : "Split and Generate Stem Rack"}
                      </button>
                      <button
                        type="button"
                        onClick={addToBatchQueue}
                        disabled={!uploadedFile || isSplitting}
                        className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
                      >
                        Add to queue
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              </div>

            <input
              ref={inputRef}
              id="stem-file-input"
              type="file"
              accept="audio/*"
              className="hidden"
              aria-label="Choose audio file to add as track"
              title="Choose audio file to add as track"
              onChange={(event) =>
                handleFile(event.target.files?.[0] ?? null)
              }
            />

            {/* Mixer section - only show after stems are generated (progressive disclosure) */}
            {splitResultStems.length > 0 ? (
              <motion.div 
                className="mt-6 border-t border-white/10 pt-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80 mb-1">Step 3</p>
                    <p className="text-sm text-white/70">
                      Trim, level & pan on each row. Play mix, then export.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        "icon-pulse-hover flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition",
                        isPlayingMix
                          ? "border-amber-400/50 bg-amber-500/20 text-amber-100"
                          : "ghost-button"
                      )}
                      onClick={() => void handlePlayMix()}
                      disabled={Object.keys(stemBuffers).length === 0}
                    >
                      {isPlayingMix ? <Square className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4" strokeWidth={2.5} />}
                      {isPlayingMix ? "Stop mix" : "Play mix"}
                    </button>
                    <button
                      type="button"
                      className="fire-button icon-pulse-hover flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm"
                      onClick={() => setShowExportModal(true)}
                      disabled={
                        isExporting || Object.keys(stemBuffers).length === 0
                      }
                    >
                      <Download className="h-4 w-4" strokeWidth={2} />
                      {isExporting ? "Rendering..." : "Export"}
                    </button>
                    {/* A/B Comparison toggle */}
                    <ComparisonToggle
                      isComparing={isComparing}
                      showingOriginal={showingOriginal}
                      onToggle={toggleComparison}
                      onSwitch={switchComparisonSource}
                      disabled={!originalAudioBuffer}
                    />
                    <button
                      type="button"
                      className="ghost-button flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
                      onClick={resetTrackAdjustments}
                      title="Reset trim, level & pan to defaults"
                    >
                      <RotateCcw className="h-4 w-4" strokeWidth={2} />
                      Reset levels
                    </button>
                  </div>
                </div>

                <div className="relative mt-4 rounded-2xl border border-white/10 bg-black/20 backdrop-blur-sm overflow-hidden">
                  <div className="flex flex-col gap-4 p-4">
                    {isLoadingStems && visibleStems.length > 0 ? (
                      visibleStems.map((stem) => (
                        <div
                          key={stem.id}
                          className="flex flex-col gap-3 rounded-[1.8rem] border border-white/10 bg-white/5 p-4 sm:p-5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-3 w-3 shrink-0 rounded-full skeleton" />
                            <div className="flex-1 space-y-2">
                              <div className="h-5 w-32 skeleton rounded" />
                              <div className="h-3 w-24 skeleton rounded" />
                            </div>
                          </div>
                          <div className="h-28 skeleton rounded-xl" />
                          <div className="h-20 skeleton rounded-xl" />
                        </div>
                      ))
                    ) : (
                    visibleStems.map((stem) => {
                      const stemUrl =
                        "url" in stem
                          ? (stem as StemDefinition & { url?: string }).url
                          : undefined;
                      const trim = trimMap[stem.id] ?? defaultTrim;
                      const mixer = mixerState[stem.id] ?? defaultMixer;
                      const isCollapsed = collapsedStems[stem.id] ?? true;
                      return (
                        <StemCard
                          key={stem.id}
                          stem={stem}
                          trim={trim}
                          isCollapsed={isCollapsed}
                          onToggleCollapsed={() =>
                            setCollapsedStems((c) => ({ ...c, [stem.id]: !(c[stem.id] ?? true) }))
                          }
                          realWaveform={stemWaveforms[stem.id]}
                          onTrimChange={(nextTrim) => {
                            const next = { ...trimMap, [stem.id]: nextTrim };
                            setTrimMap(next);
                            trimHistory.set(next);
                          }}
                          isPlaying={playingStem === stem.id}
                          onPreview={() => void handlePreviewStem(stem.id, stemUrl)}
                          muted={mutedStems[stem.id] ?? false}
                          onMute={() =>
                            setMutedStems((c) => ({ ...c, [stem.id]: !(c[stem.id] ?? false) }))
                          }
                          soloed={soloStems[stem.id] ?? false}
                          onSolo={() =>
                            setSoloStems((c) => ({ ...c, [stem.id]: !(c[stem.id] ?? false) }))
                          }
                          onDownload={
                            stemUrl
                              ? () => window.open(stemUrl, "_blank", "noopener")
                              : undefined
                          }
                          mixerValue={mixer}
                          onMixerChange={(value) => {
                            const next = { ...mixerState, [stem.id]: value };
                            setMixerState(next);
                            mixerHistory.set(next);
                          }}
                        />
                      );
                    })
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="mt-6 border-t border-white/10 pt-6">
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-12 text-center">
                  <Sliders className="h-10 w-10 text-white/25 mb-4" strokeWidth={1.5} />
                  <p className="text-white/65 text-sm font-medium mb-1">Mixer Controls</p>
                  <p className="text-white/60 text-xs max-w-xs">
                    Upload a track and split it to reveal stem controls for trimming, levels, and panning.
                  </p>
                </div>
              </div>
            )}
          </motion.div>

          <motion.div
            className="glass-panel rounded-[2rem] p-5 sm:p-6"
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <p className="eyebrow">What&apos;s happening</p>
            <h2 className="font-display text-2xl tracking-[-0.04em] text-white mb-5">
              Status · Tracks · Master
            </h2>

            <div className="space-y-4">
              <div 
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3"
                role="status"
                aria-live="polite"
              >
                <span className="text-xs uppercase tracking-wider text-white/65">
                  Status
                </span>
                <span className="font-semibold text-white">
                  {isSplitting ? "Splitting…" : splitResultStems.length > 0 ? "Stems ready" : "Ready"}
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-white/65 mb-2">
                  <span>Split progress</span>
                  <span>{splitProgress}%</span>
                </div>
                <div className="progress-shimmer h-2 overflow-hidden rounded-full bg-white/10 backdrop-blur-sm">
                  <div
                    className="progress-glow h-full rounded-full bg-[linear-gradient(90deg,#ff633d_0%,#ffbb61_44%,#ffe3a0_100%)] transition-all duration-300"
                    style={{ width: `${splitProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-white/64">{activeStage.blurb}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {pipelineSteps.map((step, index) => (
                <PipelineStep
                  key={step.title}
                  title={step.title}
                  active={index === pipelineIndex}
                  done={index < pipelineIndex}
                >
                  {step.blurb}
                </PipelineStep>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="h-5 w-5 text-white/70" strokeWidth={1.8} />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/65">
                  Track status · {uploadName.replace(/\.[^/.]+$/, "")}
                </span>
                {isLoadingStems && (
                  <span className="text-xs text-amber-200/90">Loading stems…</span>
                )}
              </div>
              <div className="space-y-2">
                {visibleStems.map((stem) => {
                  const isLoaded = loadedTracks[stem.id];
                  const hasBuffer = stemBuffers[stem.id];
                  return (
                    <div
                      key={stem.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: stem.glow,
                            boxShadow: `0 0 8px ${stem.glowSoft}`,
                          }}
                        />
                        <span className="text-sm text-white">{stem.label}</span>
                        <span className="text-xs text-white/65">
                          {isLoaded ? "Ready" : hasBuffer ? "Buffered" : isLoadingStems ? "Loading…" : "Pending"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
<div className="text-xs font-semibold uppercase tracking-wider text-white/65 mb-3">
                  Master chain
              </div>
              <div className="space-y-2 text-sm text-white/68">
                <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span>Glue compression</span>
                  <span>{masterChain.compression} dB GR</span>
                </div>
                <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span>Limiter ceiling</span>
                  <span>{masterChain.limiter} dB</span>
                </div>
                <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span>Loudness target</span>
                  <span>{masterChain.loudness} LUFS</span>
                </div>
              </div>
            </div>

            <p className="mt-5 text-xs text-white/65">
              Tip: Use <strong className="text-white/70">Play mix</strong> to hear everything together, then <strong className="text-white/70">Export WAV</strong> to download.
            </p>
          </motion.div>
        </motion.section>
      </div>
    </div>
  );
}

const metricIcons: Record<string, React.ReactNode> = {
  Separation: <Music2 className="h-4 w-4" strokeWidth={2} />,
  Preview: <Play className="h-4 w-4" strokeWidth={2} />,
  Mix: <Sliders className="h-4 w-4" strokeWidth={2} />,
  Download: <Download className="h-4 w-4" strokeWidth={2} />,
};

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <motion.div
      className="glass-card rounded-2xl px-4 py-4"
      initial={false}
      whileHover={{ y: -4, transition: { duration: 0.3 } }}
      transition={{ type: "tween", duration: 0.3 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-white/65">
            {label}
          </div>
          <div className="mt-2 text-base font-semibold text-white">{value}</div>
          <div className="mt-1 text-xs leading-5 text-white/60">{detail}</div>
        </div>
        <div className="icon-pulse-hover rounded-lg p-1.5 text-white/60 ring-1 ring-white/10">
          {metricIcons[label] ?? <Sparkles className="h-4 w-4" strokeWidth={2} />}
        </div>
      </div>
    </motion.div>
  );
}

function StemCard({
  stem,
  trim,
  realWaveform,
  onTrimChange,
  isPlaying,
  onPreview,
  muted,
  onMute,
  soloed,
  onSolo,
  onDownload,
  onLoadToTrack,
  mixerValue,
  onMixerChange,
  isCollapsed = true,
  onToggleCollapsed,
}: {
  stem: StemDefinition;
  stemUrl?: string;
  trim: TrimState;
  realWaveform?: number[];
  onTrimChange: (trim: TrimState) => void;
  isPlaying: boolean;
  onPreview: () => void;
  muted: boolean;
  onMute: () => void;
  soloed: boolean;
  onSolo: () => void;
  onDownload?: () => void;
  onLoadToTrack?: () => void;
  mixerValue?: MixerState;
  onMixerChange?: (value: MixerState) => void;
  playheadPosition?: number;
  onSeek?: (position: number) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const mixer = mixerValue ?? defaultMixer;
  const stemBg = { backgroundColor: `${stem.glow}10` };
  return (
    <motion.article
      className={cn(
        "glass-card stem-panel rounded-[1.8rem] border pl-0 pr-4 pt-4 pb-4 sm:pl-0 sm:pr-5 sm:pt-5 sm:pb-5 transition-all duration-300",
        muted && "opacity-50 grayscale-[30%]"
      )}
      style={{ borderLeft: `4px solid ${muted ? '#666' : stem.glow}`, ...stemBg }}
      aria-label={`Stem: ${stem.label}${muted ? ' (muted)' : ''}${soloed ? ' (soloed)' : ''}`}
      initial={false}
      whileHover={{ y: -3, transition: { duration: 0.3 } }}
      transition={{ type: "tween", duration: 0.3 }}
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pl-4 sm:pl-5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className={cn("h-3 w-3 shrink-0 rounded-full transition-all", muted && "opacity-40")}
            style={{
              backgroundColor: stem.glow,
              boxShadow: muted ? 'none' : `0 0 16px ${stem.glowSoft}`,
            }}
            aria-hidden
          />
          <div>
            <h3 className="font-display text-xl tracking-[-0.04em] text-white flex items-center gap-2">
              {stem.label}
              {soloed && <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/30">Solo</span>}
              {muted && <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-400/30">Muted</span>}
            </h3>
            <div className="text-xs text-white/70">{stem.subtitle}</div>
          </div>
          {onToggleCollapsed &&
            (isCollapsed ? (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="shrink-0 rounded-lg p-1.5 text-white/65 hover:text-white hover:bg-white/10 transition"
                title="Expand stem"
                aria-expanded="false"
                aria-label="Expand stem"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="shrink-0 rounded-lg p-1.5 text-white/65 hover:text-white hover:bg-white/10 transition"
                title="Collapse stem"
                aria-expanded="true"
                aria-label="Collapse stem"
              >
                <ChevronDown className="h-5 w-5" strokeWidth={2} />
              </button>
            ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPreview}
            className={cn(
              "icon-button icon-pulse-hover flex min-w-[6.5rem] items-center justify-center gap-1.5 text-xs",
              isPlaying && "border-amber-300/30 bg-white/10",
            )}
          >
            {isPlaying ? <Square className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Play className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {isPlaying ? "Stop" : "Hear"}
          </button>
          <button
            type="button"
            onClick={onSolo}
            className={cn(
              "icon-button icon-pulse-hover text-xs flex items-center gap-1.5",
              soloed && "border-amber-400/50 bg-amber-500/25 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.3)]",
            )}
            title={soloed ? "Disable solo mode" : "Solo this stem (mute others)"}
          >
            <Headphones className="h-3.5 w-3.5" strokeWidth={2} />
            {soloed ? "Unsolo" : "Solo"}
          </button>
          <button
            type="button"
            onClick={onMute}
            className={cn(
              "icon-button icon-pulse-hover text-xs flex items-center gap-1.5",
              muted && "border-red-400/40 bg-red-500/20 text-red-200"
            )}
            title={muted ? "Unmute this stem" : "Mute this stem"}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" strokeWidth={2} /> : <Volume2 className="h-3.5 w-3.5" strokeWidth={2} />}
            {muted ? "Unmute" : "Mute"}
          </button>
          {onDownload && (
            <button type="button" onClick={onDownload} className="icon-button icon-pulse-hover flex items-center gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Download
            </button>
          )}
          {onLoadToTrack && (
            <button type="button" onClick={onLoadToTrack} className="icon-button icon-pulse-hover flex items-center gap-1.5 text-xs">
              <Music2 className="h-3.5 w-3.5" strokeWidth={2} />
              Load to track
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
      <div className="px-4 sm:px-5">
        <WaveformEditor stem={stem} trim={trim} realWaveform={realWaveform} />
      </div>

      <div
        className="mt-3 grid gap-3 rounded-xl border border-white/10 py-3 pl-3 pr-3 sm:grid-cols-2 sm:pl-4"
        style={{ borderLeft: `3px solid ${stem.glow}` }}
      >
        <div className="flex items-center gap-2 pb-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: stem.glow }}
          />
          <span className={cn("text-[10px] font-semibold uppercase tracking-wider", STEM_LABEL_COLOR_CLASS[stem.id] ?? "stem-label-color-other")}>
            {stem.label} · Trim
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1" />
        <div>
<div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-white/65">
                <span>Trim Start</span>
            <span>{trim.start}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={70}
            value={trim.start}
            onChange={(event) =>
              onTrimChange({
                start: Math.min(Number(event.target.value), trim.end - 8),
                end: trim.end,
              })
            }
            className="burn-slider"
            aria-label={`${stem.label} trim start`}
          />
        </div>
        <div>
<div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-white/65">
                <span>Trim End</span>
            <span>{trim.end}%</span>
          </div>
          <input
            type="range"
            min={30}
            max={100}
            value={trim.end}
            onChange={(event) =>
              onTrimChange({
                start: trim.start,
                end: Math.max(Number(event.target.value), trim.start + 8),
              })
            }
            className="burn-slider"
            aria-label={`${stem.label} trim end`}
          />
        </div>
      </div>

      {onMixerChange && (
        <div
          className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 sm:gap-6 sm:pl-4"
          style={{ borderLeft: `3px solid ${stem.glow}` }}
        >
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: stem.glow }}
            />
            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", STEM_LABEL_COLOR_CLASS[stem.id] ?? "stem-label-color-other")}>
              {stem.label} · Level & pan
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[8rem]">
<span className="shrink-0 text-[10px] uppercase tracking-wider text-white/65">
                  Level
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.1}
              value={mixer.gain}
              onChange={(event) =>
                onMixerChange({ ...mixer, gain: Number(event.target.value) })
              }
              className="burn-slider flex-1"
              aria-label={`${stem.label} level`}
            />
            <span className="w-12 shrink-0 text-right text-xs text-white/70">
              {formatDb(mixer.gain)}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-[8rem]">
<span className="shrink-0 text-[10px] uppercase tracking-wider text-white/65">
                  Pan
            </span>
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={mixer.pan}
              onChange={(event) =>
                onMixerChange({ ...mixer, pan: Number(event.target.value) })
              }
              className="burn-slider flex-1"
              aria-label={`${stem.label} pan`}
            />
            <span className="w-10 shrink-0 text-right text-xs text-white/70">
              {mixer.pan > 0 ? `R${mixer.pan}` : mixer.pan < 0 ? `L${Math.abs(mixer.pan)}` : "C"}
            </span>
          </div>
        </div>
      )}
        </>
      )}
    </motion.article>
  );
}

export { App };
