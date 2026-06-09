/**
 * drumSynth — Web Audio drum synthesis engine.
 *
 * Each instrument is synthesized using oscillators and noise buffers
 * to create convincing drum sounds without loading samples.
 */
import type { DrumInstrument } from "./types";

/**
 * Play a drum sound at the given time.
 * Velocity scales the output gain (0-127 → 0-1).
 */
export function playDrumVoice(
  ctx: AudioContext,
  instrument: DrumInstrument,
  time: number,
  velocity: number,
  destination: AudioNode = ctx.destination,
): void {
  const vol = Math.max(0, Math.min(1, velocity / 127));
  if (vol === 0) return;

  switch (instrument) {
    case "kick":
      synthKick(ctx, time, vol, destination);
      break;
    case "snare":
      synthSnare(ctx, time, vol, destination);
      break;
    case "closedHat":
      synthClosedHat(ctx, time, vol, destination);
      break;
    case "openHat":
      synthOpenHat(ctx, time, vol, destination);
      break;
    case "clap":
      synthClap(ctx, time, vol, destination);
      break;
    case "ride":
      synthRide(ctx, time, vol, destination);
      break;
    case "tomHi":
      synthTom(ctx, time, vol, destination, 200);
      break;
    case "tomLo":
      synthTom(ctx, time, vol, destination, 100);
      break;
  }
}

// ─── Individual Drum Voices ───────────────────────────────────────

function synthKick(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
) {
  // Body: sine oscillator with pitch sweep
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(50, time + 0.07);
  gain.gain.setValueAtTime(vol * 0.95, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.35);

  // Click: short burst for transient
  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = "square";
  click.frequency.setValueAtTime(400, time);
  click.frequency.exponentialRampToValueAtTime(80, time + 0.02);
  clickGain.gain.setValueAtTime(vol * 0.4, time);
  clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  click.connect(clickGain);
  clickGain.connect(dest);
  click.start(time);
  click.stop(time + 0.04);
}

function synthSnare(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
) {
  // Body: short sine thump
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(220, time);
  osc.frequency.exponentialRampToValueAtTime(120, time + 0.04);
  oscGain.gain.setValueAtTime(vol * 0.5, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  osc.connect(oscGain);
  oscGain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.1);

  // Noise: white noise through bandpass for the snare rattle
  const bufLen = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2000;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.7, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
  src.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(dest);
  src.start(time);
}

function synthClosedHat(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
) {
  const bufLen = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 10000;
  bp.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(hp);
  hp.connect(bp);
  bp.connect(gain);
  gain.connect(dest);
  src.start(time);
}

function synthOpenHat(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
) {
  const bufLen = Math.floor(ctx.sampleRate * 0.2);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 9000;
  bp.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 0.45, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
  src.connect(hp);
  hp.connect(bp);
  bp.connect(gain);
  gain.connect(dest);
  src.start(time);
}

function synthClap(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
) {
  // Multiple short noise bursts layered for a clap texture
  for (let burst = 0; burst < 3; burst++) {
    const offset = burst * 0.008;
    const bufLen = Math.floor(ctx.sampleRate * 0.02);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.35, time + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.04);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(dest);
    src.start(time + offset);
  }

  // Tail: longer noise
  const tailLen = Math.floor(ctx.sampleRate * 0.1);
  const tailBuf = ctx.createBuffer(1, tailLen, ctx.sampleRate);
  const tailData = tailBuf.getChannelData(0);
  for (let i = 0; i < tailLen; i++) tailData[i] = Math.random() * 2 - 1;
  const tailSrc = ctx.createBufferSource();
  tailSrc.buffer = tailBuf;
  const tailBp = ctx.createBiquadFilter();
  tailBp.type = "bandpass";
  tailBp.frequency.value = 1400;
  tailBp.Q.value = 0.5;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(vol * 0.5, time + 0.024);
  tailGain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
  tailSrc.connect(tailBp);
  tailBp.connect(tailGain);
  tailGain.connect(dest);
  tailSrc.start(time + 0.024);
}

function synthRide(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
) {
  // Metallic overtones via detuned square oscillators
  const freqs = [340, 560, 730];
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.55);
  }

  // High noise shimmer
  const bufLen = Math.floor(ctx.sampleRate * 0.3);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 8000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * 0.12, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  src.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  src.start(time);
}

function synthTom(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
  baseFreq: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq * 2, time);
  osc.frequency.exponentialRampToValueAtTime(baseFreq, time + 0.05);
  gain.gain.setValueAtTime(vol * 0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.25);

  // Body resonance
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(baseFreq * 1.5, time);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, time + 0.1);
  gain2.gain.setValueAtTime(vol * 0.3, time);
  gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  osc2.connect(gain2);
  gain2.connect(dest);
  osc2.start(time);
  osc2.stop(time + 0.2);
}
