import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import { PitchTempoPlugin } from "pitch-plugin";
/** Mute, solo, pitch, time stretch, fade — hot-swap mix immediately when these change. */
export function stemRoutingSignature(states: Record<string, StemEditorState>, stemIds: string[]): string {
  return stemIds
    .map((id) => {
      const s = states[id] ?? defaultStemState();
      return `${id}:m${s.muted ? 1 : 0}s${s.soloed ? 1 : 0}p${s.pitchSemitones}ts${s.timeStretch}fi${s.fadeIn ?? 0}fo${s.fadeOut ?? 0}`;
    })
    .join("|");
}

/** Trim only — debounce rapid drags. */
export function stemTrimSignature(states: Record<string, StemEditorState>, stemIds: string[]): string {
  return stemIds
    .map((id) => {
      const s = states[id] ?? defaultStemState();
      return `${id}:${s.trim.start}:${s.trim.end}`;
    })
    .join("|");
}

/** Pitch + timeStretch only — for detecting pitch/tempo-only changes. */
export function stemPitchTempoSignature(states: Record<string, StemEditorState>, stemIds: string[]): string {
  return stemIds
    .map((id) => {
      const s = states[id] ?? defaultStemState();
      return `${id}:p${s.pitchSemitones}ts${s.timeStretch}`;
    })
    .join("|");
}

/** Mute + solo only — for detecting structural routing changes. */
export function stemMuteSoloSignature(states: Record<string, StemEditorState>, stemIds: string[]): string {
  return stemIds
    .map((id) => {
      const s = states[id] ?? defaultStemState();
      return `${id}:m${s.muted ? 1 : 0}s${s.soloed ? 1 : 0}`;
    })
    .join("|");
}

/** Pitch, stretch, trim, fade for one stem (preview hot-swap). */
export function stemPreviewStructuralSignature(st: StemEditorState): string {
  return `p${st.pitchSemitones}ts${st.timeStretch}tr${st.trim.start}-${st.trim.end}fi${st.fadeIn ?? 0}fo${st.fadeOut ?? 0}`;
}

/**
 * Whether a stem's current state requires the phase vocoder plugin.
 * At default values (pitch=0, timeStretch=1.0) the plugin adds unnecessary
 * spectral processing — bypass it for playback and export.
 */
export function stemNeedsPlugin(st: StemEditorState): boolean {
  const pitchActive = Math.abs(st.pitchSemitones) > 0.01;
  const tempoActive = Math.abs(st.timeStretch - 1.0) > 0.001;
  return pitchActive || tempoActive;
}

/** Create PitchTempoPlugin instances for stems that need pitch/tempo processing. */
export async function createStemPluginPool(
  ctx: BaseAudioContext,
  stems: readonly { id: string; st: StemEditorState }[],
): Promise<{ plugins: Map<string, PitchTempoPlugin>; available: boolean }> {
  const plugins = new Map<string, PitchTempoPlugin>();
  const needsAny = stems.some(({ st }) => stemNeedsPlugin(st));
  if (!needsAny) return { plugins, available: false };

  try {
    // Parallelize plugin initialization: create all plugin instances first,
    // then call ready() in parallel. This reduces wall-clock time when many
    // stems require plugins while still allowing per-plugin failures.
    const entries = stems.filter(({ st }) => stemNeedsPlugin(st));
    if (entries.length === 0) return { plugins, available: false };

    const instances = new Map<string, PitchTempoPlugin>();
    for (const { id } of entries) {
      const plugin = new PitchTempoPlugin({ audioContext: ctx as AudioContext });
      instances.set(id, plugin);
    }

    // Call ready() in parallel and collect successes.
    const settles = await Promise.allSettled(
      Array.from(instances.entries()).map(([id, plugin]) =>
        plugin.ready().then(() => id),
      ),
    );

    for (const s of settles) {
      if (s.status === "fulfilled") {
        const id = s.value as string;
        const plugin = instances.get(id)!;
        plugins.set(id, plugin);
      }
    }

    // Destroy any instances that failed to initialize.
    for (const [id, inst] of instances.entries()) {
      if (!plugins.has(id)) inst.destroy();
    }

    return { plugins, available: plugins.size > 0 };
  } catch (err) {
    console.warn("[createStemPluginPool] PitchTempoPlugin init failed, using legacy playbackRate:", err);
    for (const plugin of plugins.values()) plugin.destroy();
    plugins.clear();
    return { plugins, available: false };
  }
}

export function destroyStemPluginPool(plugins: Map<string, PitchTempoPlugin>): void {
  for (const plugin of plugins.values()) plugin.destroy();
  plugins.clear();
}
