# Pitch-Plug-in — Integration Guide

## Overview

This package provides real-time pitch shifting and tempo adjustment for audio stems, designed to slot in as a post-processing step after stem separation.

## Installation

Copy this package into your monorepo or install from a local path:

```bash
# From your parent app
npm install ../pitch-plugin
# or link it
npm link ../pitch-plugin
```

## Quick Start — Drop-in Widget

The simplest integration: pass your decoded `AudioBuffer` stems and get a full UI.

```tsx
import { PitchTempoWidget } from 'pitch-plugin';
import type { StemInput } from 'pitch-plugin';

function PostSplitView({ stems }: { stems: StemInput[] }) {
  return (
    <PitchTempoWidget
      stems={stems}
      onPlaybackEnd={() => console.log('done')}
      onStateChange={(state) => {
        // Sync with parent app state if needed
        console.log('pitch:', state.globalPitch, 'tempo:', state.globalTempo);
      }}
    />
  );
}
```

### StemInput format

```ts
interface StemInput {
  id: string;           // unique key, e.g. "vocals"
  label: string;        // display name
  emoji?: string;       // optional icon
  color: string;        // hex color for UI
  buffer: AudioBuffer;  // decoded audio from your splitter
}
```

## Headless Hook — Custom UI

If you want full control over the UI but want the audio engine managed for you:

```tsx
import { useAudioEngine } from 'pitch-plugin';

function MyCustomPlayer({ stems }) {
  const engine = useAudioEngine({ stems });

  return (
    <div>
      <button onClick={engine.play}>Play</button>
      <button onClick={engine.pause}>Pause</button>
      <input
        type="range"
        min={-3} max={3} step={0.1}
        value={engine.globalPitch}
        onChange={(e) => engine.setGlobalPitch(Number(e.target.value))}
      />
      <span>{engine.globalPitch} semitones</span>
    </div>
  );
}
```

## Low-Level DSP — Direct Plugin Access

For maximum control (e.g. integrating into an existing Web Audio graph):

```ts
import { PitchTempoPlugin } from 'pitch-plugin';

const ctx = new AudioContext();
const plugin = new PitchTempoPlugin({ audioContext: ctx });
await plugin.ready();

// Wire into your existing graph
sourceNode.connect(plugin.inputNode);
plugin.outputNode.connect(ctx.destination);

// Control
plugin.setPitchSemitones(+2);
plugin.setTempoRatio(1.05);
plugin.bypass(false);
```

## Sharing an AudioContext

If your parent app already has an `AudioContext`, pass it to avoid creating a second one:

```tsx
<PitchTempoWidget
  stems={stems}
  audioContext={myExistingAudioContext}
/>
```

## Props Reference

### `PitchTempoWidget`

| Prop | Type | Description |
|------|------|-------------|
| `stems` | `StemInput[]` | **Required.** Audio stems to process. |
| `audioContext` | `AudioContext` | Optional shared context. |
| `onStateChange` | `(state) => void` | Called on every state update. |
| `onPlaybackEnd` | `() => void` | Called when playback reaches the end. |
| `compact` | `boolean` | Smaller knobs, reduced height. |
| `hideSections` | `string[]` | Hide: `'spectrum'`, `'transport'`, `'stems'`, `'metadata'` |
| `className` | `string` | Additional CSS class for root element. |

## Build Commands

```bash
# Dev server (demo app)
npm run dev

# Build as importable library (ES module + types)
npm run build

# Build demo as single HTML file
npm run build:demo

# Type check
npm run typecheck
```

## Architecture

```
src/
├── index.ts              # Public barrel export
├── types.ts              # Shared TypeScript types
├── PitchTempoWidget.tsx  # Batteries-included UI component
├── hooks/
│   └── useAudioEngine.ts # Headless audio engine hook
├── components/           # Composable UI pieces
│   ├── KnobControl.tsx
│   ├── StemTrack.tsx
│   ├── SpectrumAnalyzer.tsx
│   └── WaveformDisplay.tsx
└── dsp/                  # Audio processing core
    ├── PitchTempoPlugin.ts       # Main-thread plugin wrapper
    ├── pitchTempoProcessor.ts    # AudioWorklet processor (phase vocoder)
    └── syntheticAudio.ts         # Test tone generators
```

## Styling

The widget uses Tailwind CSS utility classes. If your parent app already uses Tailwind CSS 4+, the classes will work automatically — no extra stylesheet needed.

If your parent app does **not** use Tailwind, you have two options:

1. **Add Tailwind to your parent app** (recommended) — the widget's classes will just work.
2. **Wrap the widget in a scoped container** and include Tailwind via CDN for that container only.

The widget renders white text on a transparent background by default, so place it inside a dark-themed container.
