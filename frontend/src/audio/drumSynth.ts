/**
 * drumSynth — Web Audio drum synthesis engine.
 *
 * Each instrument is synthesized using oscillators and noise buffers
 * to create convincing drum sounds without loading samples.
 *
 * Kit presets can override synthesis parameters via the optional `params`
 * argument on each voice function.
 */
import type { DrumInstrument } from "./types";

// ─── Param helpers ────────────────────────────────────────────────

function paramValue<T extends Record<string, unknown>>(params: T | undefined, key: string, fallback: number): number {
  const v = params?.[key as keyof T];
  return typeof v === "number" ? v : fallback;
}

// ─── Voice API ────────────────────────────────────────────────────

export function playDrumVoice(
  ctx: AudioContext,
  instrument: DrumInstrument,
  time: number,
  velocity: number,
  destination: AudioNode = ctx.destination,
  kitParams?: Record<string, number> | undefined,
): void {
  const vol = Math.max(0, Math.min(1, velocity / 127));
  if (vol === 0) return;

  const instParams = kitParams?.[instrument] as Record<string, number> | undefined;

  switch (instrument) {
    case "kick":
      synthKick(ctx, time, vol, destination, instParams);
      break;
    case "snare":
      synthSnare(ctx, time, vol, destination, instParams);
      break;
    case "closedHat":
      synthClosedHat(ctx, time, vol, destination, instParams);
      break;
    case "openHat":
      synthOpenHat(ctx, time, vol, destination, instParams);
      break;
    case "clap":
      synthClap(ctx, time, vol, destination, instParams);
      break;
    case "ride":
      synthRide(ctx, time, vol, destination, instParams);
      break;
    case "tomHi":
      synthTom(ctx, time, vol, destination, paramValue(instParams, "baseFreq", 200), instParams);
      break;
    case "tomLo":
      synthTom(ctx, time, vol, destination, paramValue(instParams, "baseFreq", 100), instParams);
      break;
  }
}

// ─── Individual Drum Voices ───────────────────────────────────────

function synthKick(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
  p?: Record<string, number>,
) {
  const startFreq = paramValue(p, "startFreq", 160);
  const endFreq = paramValue(p, "endFreq", 50);
  const bodyDecay = paramValue(p, "bodyDecay", 0.3);
  const clickFreq = paramValue(p, "clickFreq", 400);
  const clickDecay = paramValue(p, "clickDecay", 0.03);
  const bodyVol = paramValue(p, "bodyVol", 0.95);
  const clickVol = paramValue(p, "clickVol", 0.4);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.07);
  gain.gain.setValueAtTime(vol * bodyVol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + bodyDecay);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + bodyDecay + 0.05);

  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = "square";
  click.frequency.setValueAtTime(clickFreq, time);
  click.frequency.exponentialRampToValueAtTime(endFreq, time + 0.02);
  clickGain.gain.setValueAtTime(vol * clickVol, time);
  clickGain.gain.exponentialRampToValueAtTime(0.001, time + clickDecay);
  click.connect(clickGain);
  clickGain.connect(dest);
  click.start(time);
  click.stop(time + clickDecay + 0.02);
}

function synthSnare(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
  p?: Record<string, number>,
) {
  const bodyFreq = paramValue(p, "bodyFreq", 220);
  const bodyEndFreq = paramValue(p, "bodyEndFreq", 120);
  const bodyDecay = paramValue(p, "bodyDecay", 0.08);
  const noiseHP = paramValue(p, "noiseHP", 2000);
  const noiseVol = paramValue(p, "noiseVol", 0.7);
  const noiseDecay = paramValue(p, "noiseDecay", 0.14);
  const bodyVol = paramValue(p, "bodyVol", 0.5);

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(bodyFreq, time);
  osc.frequency.exponentialRampToValueAtTime(bodyEndFreq, time + 0.04);
  oscGain.gain.setValueAtTime(vol * bodyVol, time);
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + bodyDecay);
  osc.connect(oscGain);
  oscGain.connect(dest);
  osc.start(time);
  osc.stop(time + bodyDecay + 0.02);

  const bufLen = Math.floor(ctx.sampleRate * noiseDecay);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = noiseHP;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * noiseVol, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + noiseDecay);
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
  p?: Record<string, number>,
) {
  const hpFreq = paramValue(p, "hpFreq", 7000);
  const bpFreq = paramValue(p, "bpFreq", 10000);
  const bpQ = paramValue(p, "bpQ", 1.2);
  const hatVol = paramValue(p, "vol", 0.4);
  const decay = paramValue(p, "decay", 0.05);

  const bufLen = Math.floor(ctx.sampleRate * decay);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = hpFreq;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = bpFreq;
  bp.Q.value = bpQ;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * hatVol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
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
  p?: Record<string, number>,
) {
  const hpFreq = paramValue(p, "hpFreq", 6000);
  const bpFreq = paramValue(p, "bpFreq", 9000);
  const bpQ = paramValue(p, "bpQ", 0.8);
  const hatVol = paramValue(p, "vol", 0.45);
  const decay = paramValue(p, "decay", 0.25);

  const bufLen = Math.floor(ctx.sampleRate * decay);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = hpFreq;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = bpFreq;
  bp.Q.value = bpQ;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * hatVol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
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
  p?: Record<string, number>,
) {
  const burstCount = Math.round(paramValue(p, "burstCount", 3));
  const bpFreq = paramValue(p, "bpFreq", 1200);
  const bpQ = paramValue(p, "bpQ", 0.6);
  const burstVol = paramValue(p, "burstVol", 0.35);
  const burstGap = paramValue(p, "burstGap", 0.008);
  const burstLen = paramValue(p, "burstLen", 0.02);
  const tailBpFreq = paramValue(p, "tailBpFreq", 1400);
  const tailVol = paramValue(p, "tailVol", 0.5);
  const tailDecay = paramValue(p, "tailDecay", 0.13);

  for (let burst = 0; burst < burstCount; burst++) {
    const offset = burst * burstGap;
    const bufLen = Math.floor(ctx.sampleRate * burstLen);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = bpFreq;
    bp.Q.value = bpQ;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * burstVol, time + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, time + offset + burstLen);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(dest);
    src.start(time + offset);
  }

  const tailLen = Math.floor(ctx.sampleRate * tailDecay);
  const tailBuf = ctx.createBuffer(1, tailLen, ctx.sampleRate);
  const tailData = tailBuf.getChannelData(0);
  for (let i = 0; i < tailLen; i++) tailData[i] = Math.random() * 2 - 1;
  const tailSrc = ctx.createBufferSource();
  tailSrc.buffer = tailBuf;
  const tailBp = ctx.createBiquadFilter();
  tailBp.type = "bandpass";
  tailBp.frequency.value = tailBpFreq;
  tailBp.Q.value = 0.5;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(vol * tailVol, time + burstGap * (burstCount - 1) + burstLen);
  tailGain.gain.exponentialRampToValueAtTime(0.001, time + burstGap * (burstCount - 1) + burstLen + tailDecay);
  tailSrc.connect(tailBp);
  tailBp.connect(tailGain);
  tailGain.connect(dest);
  tailSrc.start(time + burstGap * (burstCount - 1) + burstLen);
}

function synthRide(
  ctx: AudioContext,
  time: number,
  vol: number,
  dest: AudioNode,
  p?: Record<string, number>,
) {
  const oscVol = paramValue(p, "oscVol", 0.08);
  const noiseHP = paramValue(p, "noiseHP", 8000);
  const noiseVol = paramValue(p, "noiseVol", 0.12);
  const noiseDecay = paramValue(p, "noiseDecay", 0.4);
  const freqs: number[] = paramValue(p, "freqs1", 340) > 0
    ? [paramValue(p, "freqs1", 340), paramValue(p, "freqs2", 560), paramValue(p, "freqs3", 730)]
    : [340, 560, 730];

  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * oscVol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.55);
  }

  const bufLen = Math.floor(ctx.sampleRate * noiseDecay);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = noiseHP;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol * noiseVol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + noiseDecay);
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
  p?: Record<string, number>,
) {
  const startMult = paramValue(p, "startMult", 2);
  const endMult = paramValue(p, "endMult", 1);
  const decay = paramValue(p, "decay", 0.22);
  const bodyVol = paramValue(p, "bodyVol", 0.8);
  const bodyDecay = paramValue(p, "bodyDecay", 0.18);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq * startMult, time);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * endMult, time + 0.05);
  gain.gain.setValueAtTime(vol * bodyVol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + decay + 0.05);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(baseFreq * 1.5, time);
  osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, time + 0.1);
  gain2.gain.setValueAtTime(vol * 0.3, time);
  gain2.gain.exponentialRampToValueAtTime(0.001, time + bodyDecay);
  osc2.connect(gain2);
  gain2.connect(dest);
  osc2.start(time);
  osc2.stop(time + bodyDecay + 0.05);
}
