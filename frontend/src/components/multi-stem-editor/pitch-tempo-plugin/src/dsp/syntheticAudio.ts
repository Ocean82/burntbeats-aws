/**
 * Synthetic audio generators for the demo stems.
 * Generates mock stems when no real audio file is available.
 */

export interface StemAudioData {
  id: string;
  label: string;
  color: string;
  buffer: AudioBuffer;
  emoji: string;
}

const SAMPLE_RATE = 44100;
const DURATION = 8; // seconds



/** Generate a drum-like kick pattern */
function drumPattern(duration: number, sampleRate: number): Float32Array {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  // Quarter note kicks at 120 BPM
  const bpm = 120;
  const beatSamples = Math.floor((60 / bpm) * sampleRate);
  for (let beat = 0; beat < Math.floor(duration * bpm / 60); beat++) {
    const start = beat * beatSamples;
    // Kick: sine with exponential frequency sweep
    for (let i = 0; i < Math.min(sampleRate * 0.15, n - start); i++) {
      const t = i / sampleRate;
      const freq = 60 * Math.exp(-t * 20) + 40;
      const env = Math.exp(-t * 15);
      out[start + i] += env * Math.sin(2 * Math.PI * freq * t) * 0.7;
    }
    // Snare on 2 and 4
    if (beat % 2 === 1) {
      const snareStart = start;
      for (let i = 0; i < Math.min(sampleRate * 0.08, n - snareStart); i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 30);
        // Noise + tone
        out[snareStart + i] += env * (Math.random() * 2 - 1) * 0.4 +
          env * Math.sin(2 * Math.PI * 200 * t) * 0.2;
      }
    }
  }
  return out;
}

/** Generate bass line */
function bassLine(duration: number, sampleRate: number): Float32Array {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  const bpm = 120;
  const beatSamples = Math.floor((60 / bpm) * sampleRate);
  // Simple bass pattern: root notes
  const notes = [55, 55, 65.41, 49]; // A2, A2, C3, G2
  for (let beat = 0; beat < Math.floor(duration * bpm / 60); beat++) {
    const start = beat * beatSamples;
    const note = notes[beat % notes.length];
    for (let i = 0; i < Math.min(beatSamples * 0.8, n - start); i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 3) * 0.5 + 0.1;
      // Sawtooth approximation
      const phase = (note * t) % 1;
      out[start + i] += env * (phase * 2 - 1) * 0.4;
    }
  }
  return out;
}

/** Generate a chord pad */
function chordPad(duration: number, sampleRate: number): Float32Array {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  // A minor chord: A3(220), C4(261.63), E4(329.63)
  const chordNotes = [220, 261.63, 329.63, 440];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (const f of chordNotes) {
      s += Math.sin(2 * Math.PI * f * t) * 0.12;
    }
    // Slow attack envelope
    const env = Math.min(1, t / 0.5);
    out[i] = s * env;
  }
  return out;
}

/** Generate a melody line */
function melodyLine(duration: number, sampleRate: number): Float32Array {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  const bpm = 120;
  const beatSamples = Math.floor((60 / bpm) * sampleRate);
  // A minor pentatonic: A4, C5, D5, E5, G5
  const scale = [440, 523.25, 587.33, 659.25, 783.99];
  const melody = [0, 2, 4, 2, 1, 3, 4, 1]; // scale degrees
  for (let beat = 0; beat < Math.floor(duration * bpm / 60); beat++) {
    const start = beat * beatSamples;
    const freq = scale[melody[beat % melody.length]];
    for (let i = 0; i < Math.min(beatSamples * 0.7, n - start); i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 4);
      out[start + i] += env * Math.sin(2 * Math.PI * freq * t) * 0.3;
    }
  }
  return out;
}

/** Create a stereo AudioBuffer from a mono signal */
function monoToStereoBuffer(ctx: AudioContext | OfflineAudioContext, mono: Float32Array): AudioBuffer {
  const buffer = ctx.createBuffer(2, mono.length, SAMPLE_RATE);
  // Use explicit ArrayBuffer to avoid SharedArrayBuffer type issues
  const ch0 = new Float32Array(mono.buffer.slice(0) as ArrayBuffer);
  const ch1 = new Float32Array(mono.buffer.slice(0) as ArrayBuffer);
  buffer.copyToChannel(ch0, 0);
  buffer.copyToChannel(ch1, 1);
  return buffer;
}

/** Generate all mock stems */
export function generateStemBuffers(ctx: AudioContext | OfflineAudioContext): StemAudioData[] {
  return [
    {
      id: 'drums',
      label: 'Drums',
      color: '#ef4444',
      emoji: '🥁',
      buffer: monoToStereoBuffer(ctx, drumPattern(DURATION, SAMPLE_RATE)),
    },
    {
      id: 'bass',
      label: 'Bass',
      color: '#f59e0b',
      emoji: '🎸',
      buffer: monoToStereoBuffer(ctx, bassLine(DURATION, SAMPLE_RATE)),
    },
    {
      id: 'chords',
      label: 'Chords',
      color: '#3b82f6',
      emoji: '🎹',
      buffer: monoToStereoBuffer(ctx, chordPad(DURATION, SAMPLE_RATE)),
    },
    {
      id: 'melody',
      label: 'Melody',
      color: '#8b5cf6',
      emoji: '🎵',
      buffer: monoToStereoBuffer(ctx, melodyLine(DURATION, SAMPLE_RATE)),
    },
  ];
}

/** Generate a test sine wave at a given frequency for unit testing */
export function generateTestSine(ctx: AudioContext | OfflineAudioContext, freq: number, durationSec: number): AudioBuffer {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    mono[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
  }
  return monoToStereoBuffer(ctx, mono);
}

/** Detect dominant frequency from an AudioBuffer using autocorrelation */
export function detectDominantFrequency(buffer: AudioBuffer, sampleRate: number): number {
  const data = buffer.getChannelData(0);
  const len = Math.min(data.length, sampleRate); // max 1 second
  
  // YIN algorithm simplified: autocorrelation
  let bestLag = -1;
  let bestCorr = -1;
  const minLag = Math.floor(sampleRate / 1000); // max 1000 Hz
  const maxLag = Math.floor(sampleRate / 50);   // min 50 Hz

  for (let lag = minLag; lag < maxLag; lag++) {
    let corr = 0;
    let normA = 0, normB = 0;
    for (let i = 0; i < len - lag; i++) {
      corr  += data[i] * data[i + lag];
      normA += data[i] * data[i];
      normB += data[i + lag] * data[i + lag];
    }
    const norm = Math.sqrt(normA * normB);
    const normalizedCorr = norm > 1e-8 ? corr / norm : 0;
    if (normalizedCorr > bestCorr) {
      bestCorr = normalizedCorr;
      bestLag  = lag;
    }
  }

  return bestLag > 0 ? sampleRate / bestLag : 0;
}
