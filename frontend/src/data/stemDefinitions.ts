/**
 * Static stem definitions: colors, labels, placeholder waveforms.
 * Shared across App, MultiStemEditor, and any future stem-related components.
 */
import type { StemDefinition } from "../types";

const WAVEFORM_BINS = 1024;

function generateWaveform(seed: number, length = WAVEFORM_BINS, bias = 0.58): number[] {
  return Array.from({ length }, (_, index) => {
    const phaseA = Math.sin((index + 1) * (seed * 0.28));
    const phaseB = Math.cos((index + 4) * (seed * 0.16));
    const phaseC = Math.sin((index + seed) * 0.11) * 0.3;
    const contour = Math.sin((index / length) * Math.PI * 2.6 + seed) * 0.18;
    const value = Math.abs((phaseA + phaseB + phaseC) / 2.5 + contour + bias);
    return Math.max(0.12, Math.min(1, value));
  });
}

export const stemDefinitions: StemDefinition[] = [
  {
    id: "vocals",
    label: "Vocals",
    subtitle: "Lead and harmonies",
    flavor: "Air, presence, top-end sheen",
    glow: "#ff845c",
    glowSoft: "rgba(255, 132, 92, 0.36)",
    waveform: generateWaveform(2.7, WAVEFORM_BINS, 0.54),
  },
  {
    id: "drums",
    label: "Drums",
    subtitle: "Kick, snare, hats",
    flavor: "Transient punch and impact",
    glow: "#ffb347",
    glowSoft: "rgba(255, 179, 71, 0.34)",
    waveform: generateWaveform(4.4, WAVEFORM_BINS, 0.62),
  },
  {
    id: "bass",
    label: "Bass",
    subtitle: "Low-end body",
    flavor: "Warmth, depth, sub control",
    glow: "#ff5a3d",
    glowSoft: "rgba(255, 90, 61, 0.34)",
    waveform: generateWaveform(6.2, WAVEFORM_BINS, 0.68),
  },
  {
    id: "melody",
    label: "Melody",
    subtitle: "Keys, synths, guitars",
    flavor: "Movement, width, sparkle",
    glow: "#ffd36a",
    glowSoft: "rgba(255, 211, 106, 0.32)",
    waveform: generateWaveform(8.1, WAVEFORM_BINS, 0.56),
  },
  {
    id: "instrumental",
    label: "Instrumental",
    subtitle: "All non-vocal",
    flavor: "Drums, bass, melody combined",
    glow: "#8b9dc3",
    glowSoft: "rgba(139, 157, 195, 0.34)",
    waveform: generateWaveform(5.2, WAVEFORM_BINS, 0.55),
  },
  {
    id: "other",
    label: "Other",
    subtitle: "Keys, synths, guitars",
    flavor: "Melodic elements",
    glow: "#ffd36a",
    glowSoft: "rgba(255, 211, 106, 0.32)",
    waveform: generateWaveform(8.1, WAVEFORM_BINS, 0.56),
  },
];

const stemIdToDefinition: Record<string, StemDefinition> = Object.fromEntries(
  stemDefinitions.map((d) => [d.id, d])
);

export function getStemDefinition(id: string): StemDefinition {
  const mapped = id === "other" ? "melody" : id;
  return stemIdToDefinition[mapped] ?? stemIdToDefinition.instrumental!;
}

export const pipelineSteps = [
  { title: "Upload & split", blurb: "Your track is split into separate stems." },
  { title: "Listen & tweak", blurb: "Hear each stem, adjust levels and trim." },
  { title: "Load to mix", blurb: "Stems are ready to mix and play together." },
  { title: "Play & export", blurb: "Play the full mix, then download your master." },
];
