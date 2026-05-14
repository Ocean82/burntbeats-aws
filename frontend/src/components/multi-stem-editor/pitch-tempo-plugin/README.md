# pitch-plugin

Real-time pitch shifting and tempo adjustment for audio stems via Web Audio API AudioWorklet. Designed as a post-processing module for a stem-splitting webapp.

---

## For Future Integration: What You Need to Know

This README is written for the AI agent (you) who will integrate this package into the larger stem-splitting webapp. Here are the critical focal points.

---

### 1. The Contract: `StemInput[]`

The entire integration hinges on one interface. Your stem splitter produces decoded audio — you pass it here:

```ts
interface StemInput {
  id: string;           // unique key matching your splitter output (e.g. "vocals", "drums")
  label: string;        // display name
  emoji?: string;       // optional, defaults to '🎵'
  color: string;        // hex color for UI theming
  buffer: AudioBuffer;  // THE KEY PIECE — decoded audio from your splitter
}
```

The `buffer` must be a valid `AudioBuffer`. If your splitter returns raw `ArrayBuffer` or `Float32Array`, you need to decode it first via `audioContext.decodeAudioData()` or construct it manually with `audioContext.createBuffer()`.

---

### 2. Three Integration Levels — Pick One

| Level | Import | When to use |
|-------|--------|-------------|
| **Widget** | `PitchTempoWidget` | Drop-in UI. Pass stems, get full player. |
| **Hook** | `useAudioEngine` | You want your own UI but managed audio graph. |
| **Class** | `PitchTempoPlugin` | Wire directly into an existing Web Audio graph. No React needed. |

**Most likely path:** Use `PitchTempoWidget` first to get it working, then switch to `useAudioEngine` if you need custom UI that matches the parent app's design system.

---

### 3. Critical: Reference Stability of `stems` Prop

**The `useAudioEngine` hook tears down and rebuilds the entire audio graph when `stems` changes by reference.** This means:

```tsx
// BAD — new array every render, engine re-inits 60x/sec
<PitchTempoWidget stems={splitterOutput.map(s => ({ ...s }))} />

// GOOD — stable reference, only changes when stems actually change
const memoizedStems = useMemo(() => stemInputs, [stemInputs]);
<PitchTempoWidget stems={memoizedStems} />
```

If your parent app stores stems in state, just pass the state variable directly — React state references are stable between renders unless you call the setter.

---

### 4. Sharing an AudioContext

If the parent app already has an `AudioContext` (likely, if it does audio decoding or playback), pass it:

```tsx
<PitchTempoWidget stems={stems} audioContext={parentCtx} />
```

**Why this matters:**
- Browsers limit the number of `AudioContext` instances (usually 6)
- A shared context avoids sample rate mismatches
- The plugin connects its output to `ctx.destination` via an AnalyserNode — if you need to route audio elsewhere (e.g. a recorder or export pipeline), you'll need to use the hook/class level and connect `plugin.outputNode` to your own destination

**If you don't pass one**, the plugin creates its own at 44100Hz.

---

### 5. Audio Graph Topology

```
[AudioBufferSourceNode per stem]
        ↓
[PitchTempoPlugin.inputNode] (GainNode)
        ↓
[AudioWorkletNode — phase vocoder]
        ↓
[PitchTempoPlugin.outputNode] (GainNode)
        ↓
[Per-stem GainNode] (mute/solo control)
        ↓
[AnalyserNode] (spectrum viz)
        ↓
[AudioContext.destination]
```

If you need to intercept audio (e.g. for export/download), tap into the per-stem GainNode output or the AnalyserNode output. At the hook level, you can get the AnalyserNode via `engine.getAnalyserNode()`.

---

### 6. Tailwind CSS Dependency

The widget renders Tailwind utility classes. Your parent app **must** have Tailwind CSS 4+ configured, or the widget will render unstyled. The library does NOT bundle its own CSS.

If the parent app uses a different CSS framework, you'll need to either:
- Add Tailwind to the parent app (it tree-shakes, so only used classes ship)
- Use the `useAudioEngine` hook and build your own UI with the parent's design system

---

### 7. Parameter Ranges (Hardcoded)

```ts
PARAM_META = {
  pitchSemitones: { min: -3, max: 3, step: 0.1 },
  tempoRatio:     { min: 0.85, max: 1.15, step: 0.01 },
}
```

These are intentionally conservative for the phase vocoder algorithm. Going beyond ±3 semitones or ±15% tempo produces audible artifacts. If the parent app needs wider ranges, the DSP layer needs to be swapped for Rubber Band WASM (see `DocumentationPanel.tsx` for licensing notes).

---

### 8. Latency

The phase vocoder introduces ~46ms latency (2048 samples at 44100Hz). This is the STFT analysis window and is unavoidable without reducing FFT size (which degrades quality). For a post-split tool where real-time monitoring is the use case, this is acceptable.

---

### 9. Files You'll Actually Touch During Integration

| File | Role |
|------|------|
| `src/index.ts` | Public API barrel — everything the parent imports |
| `src/types.ts` | The `StemInput` interface your splitter must conform to |
| `src/hooks/useAudioEngine.ts` | All audio logic — if something breaks, it's here |
| `src/PitchTempoWidget.tsx` | The drop-in UI component |
| `src/dsp/PitchTempoPlugin.ts` | DSP wrapper — parameter clamping, worklet management |
| `src/dsp/pitchTempoProcessor.ts` | The actual phase vocoder (AudioWorklet code as string blob) |

Files you can ignore: `App.tsx`, `main.tsx`, `TestPanel.tsx`, `DocumentationPanel.tsx`, `syntheticAudio.ts` — these are demo/dev-only.

---

### 10. `onStateChange` Behavior

The widget calls `onStateChange` when meaningful state changes (play/pause, pitch/tempo adjustment, mode switch, etc.) — but **NOT** on every animation frame. `currentTime` updates are internal to the widget's transport bar. If the parent needs real-time position tracking, use the hook directly and read `engine.currentTime`.

---

### 11. Build Commands

```bash
npm run build        # Library build → dist/index.js + dist/*.d.ts
npm run build:demo   # Demo app → demo-dist/index.html (single file)
npm run typecheck    # tsc --noEmit
npm run dev          # Vite dev server for the demo app
```

The parent app consumes this via:
- **Monorepo:** `"pitch-plugin": "workspace:*"` or `"file:../pitch-plugin"`
- **npm link:** `npm link ../pitch-plugin`
- **Copy dist:** Copy `dist/` into the parent's vendor folder and import from there

---

### 12. Known Gotchas

1. **AudioContext must be resumed after user gesture.** The plugin handles this in `play()` but if you call `PitchTempoPlugin` directly, you must ensure `ctx.state !== 'suspended'` before starting sources.

2. **The worklet processor code is a string blob** (`PITCH_TEMPO_PROCESSOR_CODE` in `pitchTempoProcessor.ts`). It's registered via `URL.createObjectURL(new Blob([...]))`. This works in all modern browsers but may need CSP adjustments if the parent app has strict `script-src` policies. Add `blob:` to your CSP if needed.

3. **`plugin.reset()` must be called before re-starting playback** after a stop. The hook handles this, but if you use the class directly, forgetting this causes phase accumulator drift (audio sounds wrong on second play).

4. **The `channels` field in `PitchTempoPlugin` is a dead `any[]`** — it exists only to satisfy a TypeScript reference in `reset()`. The actual channel reset happens via the worklet port message. Harmless but don't be confused by it.

5. **No export/download functionality built in.** If the parent app needs to export the pitch-shifted audio, you'll need to route the output through an `OfflineAudioContext` or `MediaRecorder`. The plugin's `inputNode`/`outputNode` API supports this — just connect differently.

---

### 13. Quick Smoke Test After Integration

```tsx
import { PitchTempoWidget } from 'pitch-plugin';
import type { StemInput } from 'pitch-plugin';

// Minimal test: one stem, synthetic sine wave
const ctx = new AudioContext();
const buffer = ctx.createBuffer(2, 44100 * 4, 44100);
const data = buffer.getChannelData(0);
for (let i = 0; i < data.length; i++) {
  data[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / 44100);
}
buffer.copyToChannel(data, 1);

const testStems: StemInput[] = [
  { id: 'test', label: 'Test Tone', color: '#8b5cf6', buffer }
];

// Render — should show widget with one stem, play button works
<PitchTempoWidget stems={testStems} />
```

If this plays a 440Hz tone and the pitch knob shifts it audibly, integration is working.
