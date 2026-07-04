/**
 * UI Sounds — Lightweight sonic feedback for key interactions.
 *
 * Uses Web Audio API to generate short tones programmatically.
 * No external audio files needed — all sounds are synthesized.
 * Respects user preference: sounds are disabled by default and
 * enabled via localStorage toggle (bb-ui-sounds-enabled).
 *
 * Design principles (from Universal Audio Skillset):
 * - Sounds guide, not distract
 * - Different intents have different sonic profiles
 * - All sounds are consistent and predictable
 * - Duration < 100ms for feedback tones
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx || audioCtx.state === "closed") {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/** Whether UI sounds are enabled (opt-in via localStorage). */
export function isUiSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("bb-ui-sounds-enabled") === "1";
}

/** Toggle UI sounds on/off. */
export function setUiSoundsEnabled(enabled: boolean): void {
  localStorage.setItem("bb-ui-sounds-enabled", enabled ? "1" : "0");
}

/**
 * Play a short sine-wave blip.
 * @param frequency Hz (pitch of the tone)
 * @param duration Seconds (how long it plays)
 * @param volume 0-1 gain
 */
function playTone(frequency: number, duration: number, volume = 0.15): void {
  if (!isUiSoundsEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

/**
 * Play a two-tone ascending blip (success confirmation).
 */
function playChime(baseFreq: number, volume = 0.12): void {
  if (!isUiSoundsEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const notes = [baseFreq, baseFreq * 1.5]; // Perfect fifth
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.08;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.12);
  });
}

// ─── Public Sound API ─────────────────────────────────────────────

/** Soft click — mute toggle, button press. */
export function playSoundClick(): void {
  playTone(800, 0.04, 0.08);
}

/** Slightly brighter click — solo toggle. */
export function playSoundSolo(): void {
  playTone(1200, 0.05, 0.1);
}

/** Short low thud — stop/reset action. */
export function playSoundStop(): void {
  playTone(200, 0.06, 0.1);
}

/** Ascending chime — export complete, stems ready. */
export function playSoundSuccess(): void {
  playChime(880, 0.12);
}

/** Descending tone — error or failure. */
export function playSoundError(): void {
  playTone(300, 0.15, 0.12);
}

/** Very subtle tick — slider snap to detent (0 dB, center pan). */
export function playSoundDetent(): void {
  playTone(2000, 0.02, 0.05);
}
