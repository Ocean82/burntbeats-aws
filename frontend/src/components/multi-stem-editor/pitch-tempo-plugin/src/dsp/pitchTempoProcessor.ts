/**
 * Pitch-Plug-in: Phase Vocoder AudioWorklet Processor
 * 
 * Self-contained phase vocoder for independent pitch shift and time stretch.
 * Algorithm: STFT-based phase vocoder with overlap-add synthesis.
 * - FFT size: 2048 (configurable)
 * - Hop size: FFT_SIZE / 4 (75% overlap)
 * - Window: Hann
 * 
 * Supports:
 *   - pitchRatio: independent pitch shift (no timing change)
 *   - tempoRatio: independent tempo change (no pitch change)
 *   - bypass: passthrough mode
 *   - Multi-channel (up to 2 channels / stereo)
 */

export const PITCH_TEMPO_PROCESSOR_NAME = 'pitch-tempo-processor';

// Inline worklet code as a string blob for viteSingleFile compatibility
export const PITCH_TEMPO_PROCESSOR_CODE = `
// ─────────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;

function makeHannWindow(size) {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos(TWO_PI * i / (size - 1)));
  }
  return win;
}

// In-place Cooley-Tukey FFT — complex interleaved [re, im, re, im, ...]
function fft(buf) {
  const n = buf.length >>> 1;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = buf[2*i];   buf[2*i]   = buf[2*j];   buf[2*j]   = tmp;
          tmp = buf[2*i+1]; buf[2*i+1] = buf[2*j+1]; buf[2*j+1] = tmp;
    }
  }
  // Butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TWO_PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let urRe = 1, urIm = 0;
      for (let j = 0; j < len >>> 1; j++) {
        const uRe = buf[2*(i+j)],   uIm = buf[2*(i+j)+1];
        const vRe = buf[2*(i+j+(len>>>1))],   vIm = buf[2*(i+j+(len>>>1))+1];
        const tvRe = urRe*vRe - urIm*vIm;
        const tvIm = urRe*vIm + urIm*vRe;
        buf[2*(i+j)]                = uRe + tvRe;
        buf[2*(i+j)+1]              = uIm + tvIm;
        buf[2*(i+j+(len>>>1))]      = uRe - tvRe;
        buf[2*(i+j+(len>>>1))+1]    = uIm - tvIm;
        const newUrRe = urRe*wRe - urIm*wIm;
        urIm = urRe*wIm + urIm*wRe;
        urRe = newUrRe;
      }
    }
  }
}

// In-place IFFT (complex interleaved) — conjugate trick
function ifft(buf) {
  const n = buf.length >>> 1;
  // Conjugate
  for (let i = 0; i < n; i++) buf[2*i+1] = -buf[2*i+1];
  fft(buf);
  // Conjugate + scale
  const inv = 1 / n;
  for (let i = 0; i < n; i++) {
    buf[2*i]   =  buf[2*i]   * inv;
    buf[2*i+1] = -buf[2*i+1] * inv;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Phase Vocoder Channel State
// ─────────────────────────────────────────────────────────────────

class PhaseVocoderChannel {
  constructor(fftSize) {
    this.fftSize = fftSize;
    this.hopSize  = fftSize >> 2;       // 25% hop = 75% overlap
    this.window   = makeHannWindow(fftSize);

    // Analysis ring buffer
    this.analysisBuffer = new Float32Array(fftSize);
    this.analysisWritePos = 0;

    // Phase accumulators (one per bin)
    this.lastPhase     = new Float32Array(fftSize);
    this.synthPhase    = new Float32Array(fftSize);

    // Synthesis overlap-add ring buffer
    this.outputBuffer  = new Float32Array(fftSize * 4); // ring — large enough
    this.outputReadPos = 0;
    this.outputWritePos = 0;

    // OLA normalization buffer (accumulates window²)
    this.normalizeBuffer = new Float32Array(fftSize * 4);

    // Fractional input / output counters for resampling
    this.inputAccum   = 0; // fractional samples consumed from input
    this.outputAccum  = 0; // fractional samples produced to output

    // Scratch FFT buffer [re0,im0,re1,im1,...]
    this.fftBuf  = new Float32Array(fftSize * 2);
    this.fftBuf2 = new Float32Array(fftSize * 2);

    // Expected phase advance per bin per hop
    this.omega = new Float32Array(fftSize);
    const hopF = this.hopSize;
    for (let k = 0; k < fftSize; k++) {
      this.omega[k] = TWO_PI * k * hopF / fftSize;
    }
    
    // Latency warmup flag
    this.filled = 0;
  }

  reset() {
    this.analysisBuffer.fill(0);
    this.lastPhase.fill(0);
    this.synthPhase.fill(0);
    this.outputBuffer.fill(0);
    this.normalizeBuffer.fill(0);
    this.outputReadPos = 0;
    this.outputWritePos = 0;
    this.inputAccum = 0;
    this.outputAccum = 0;
    this.filled = 0;
  }
}

// ─────────────────────────────────────────────────────────────────
//  Processor
// ─────────────────────────────────────────────────────────────────

class PitchTempoProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitchRatio',  defaultValue: 1.0, minValue: 0.707, maxValue: 1.414, automationRate: 'k-rate' },
      { name: 'tempoRatio',  defaultValue: 1.0, minValue: 0.8,   maxValue: 1.25,  automationRate: 'k-rate' },
      { name: 'bypass',      defaultValue: 0,   minValue: 0,     maxValue: 1,     automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);
    this.FFT_SIZE = 2048;
    this.HOP_SIZE = this.FFT_SIZE >> 2;

    this.channels = [
      new PhaseVocoderChannel(this.FFT_SIZE),
      new PhaseVocoderChannel(this.FFT_SIZE),
    ];

    // Input ring buffers — feed samples from Web Audio 128-frame quanta
    this.inputRing = [
      new Float32Array(this.FFT_SIZE * 8),
      new Float32Array(this.FFT_SIZE * 8),
    ];
    this.inputWrite = [0, 0];
    this.inputRead  = [0, 0];

    // Output ring buffer — pull by Web Audio 128-frame quanta
    this.outputRing = [
      new Float32Array(this.FFT_SIZE * 8),
      new Float32Array(this.FFT_SIZE * 8),
    ];
    this.outputWrite = [0, 0];
    this.outputRead  = [0, 0];

    this.ringSize = this.FFT_SIZE * 8;

    this.port.onmessage = (e) => {
      if (e.data.type === 'reset') {
        this.channels.forEach(ch => ch.reset());
        for (let c = 0; c < 2; c++) {
          this.inputRing[c].fill(0);
          this.inputWrite[c] = 0;
          this.inputRead[c]  = 0;
          this.outputRing[c].fill(0);
          this.outputWrite[c] = 0;
          this.outputRead[c]  = 0;
        }
      }
    };
  }

  // ── Phase vocoder frame processing ──────────────────────────────
  processFrame(ch, pitchRatio, timeRatio) {
    // timeRatio here is the ratio for OLA stretching (= tempoRatio for tempo stretch, or 1/pitchRatio for pitch-only)
    // For independent pitch+tempo: we time-stretch by timeRatio using phase vocoder,
    // then we resample the output by (pitchRatio * timeRatio) to produce the final pitch-shifted, tempo-adjusted signal.
    // 
    // The fundamental relation:
    //   pitchShiftedTempo = phasevocoder_timeStretch(1/pitchRatio) → resample_by_pitchRatio
    //   => pitch changes, duration stays (pure pitch shift)
    //
    //   tempoChange = phasevocoder_timeStretch(tempoRatio) → no resample
    //   => tempo changes, pitch stays
    //
    //   Both together: phasevocoder_timeStretch(tempoRatio/pitchRatio) → resample_by_pitchRatio
    //
    // We use analysisHopSize = HOP_SIZE (constant)
    // synthesisHopSize = HOP_SIZE * stretchFactor
    // stretchFactor = tempoRatio / pitchRatio  (> 1 = expand = slower tempo or lower pitch)
    // After OLA, the signal is stretched by stretchFactor.
    // We then resample by pitchRatio, giving final duration = original / tempoRatio.

    const N     = ch.fftSize;
    const aHop  = ch.hopSize;                // analysis hop (fixed)
    const stretchFactor = 1.0 / (pitchRatio);  // for pitch-only, tempoRatio handled separately
    const sHop  = aHop * stretchFactor;       // synthesis hop (float)

    const { analysisBuffer, window, fftBuf, lastPhase, synthPhase, omega } = ch;

    // Copy analysis buffer into FFT scratch, applying window
    for (let i = 0; i < N; i++) {
      fftBuf[2*i]   = analysisBuffer[i] * window[i];
      fftBuf[2*i+1] = 0;
    }
    fft(fftBuf);

    // Phase vocoder: compute true frequencies & accumulate synthesis phases
    for (let k = 0; k <= N >> 1; k++) {
      const re = fftBuf[2*k], im = fftBuf[2*k+1];
      const mag  = Math.sqrt(re*re + im*im);
      const phase = Math.atan2(im, re);

      // Phase difference (deviation from expected)
      let dPhase = phase - lastPhase[k] - omega[k];
      // Wrap to [-π, π]
      dPhase -= TWO_PI * Math.round(dPhase / TWO_PI);
      // True frequency
      const trueFreq = omega[k] + dPhase / aHop;
      lastPhase[k] = phase;

      // Accumulate synthesis phase
      synthPhase[k] += trueFreq * sHop;

      // Reconstruct bin
      fftBuf[2*k]   = mag * Math.cos(synthPhase[k]);
      fftBuf[2*k+1] = mag * Math.sin(synthPhase[k]);
    }
    // Mirror negative frequencies (conjugate symmetry)
    for (let k = (N >> 1) + 1; k < N; k++) {
      fftBuf[2*k]   =  fftBuf[2*(N-k)];
      fftBuf[2*k+1] = -fftBuf[2*(N-k)+1];
    }

    // IFFT
    ifft(fftBuf);

    // OLA — write into output ring
    const outRing     = ch.outputBuffer;
    const normRing    = ch.normalizeBuffer;
    const outSize     = outRing.length;
    const sHopInt     = Math.round(sHop);
    const writeStart  = ch.outputWritePos;

    for (let i = 0; i < N; i++) {
      const pos  = (writeStart + i) % outSize;
      outRing[pos]  += fftBuf[2*i] * window[i];
      normRing[pos] += window[i] * window[i];
    }

    // Advance write pointer by synthesis hop
    ch.outputWritePos = (ch.outputWritePos + sHopInt) % outSize;

    // Return the next sHopInt normalized output samples
    const out = new Float32Array(sHopInt);
    for (let i = 0; i < sHopInt; i++) {
      const pos = (ch.outputReadPos + i) % outSize;
      const norm = normRing[pos];
      out[i] = norm > 1e-8 ? outRing[pos] / norm : 0;
      // Clear after reading
      outRing[pos]  = 0;
      normRing[pos] = 0;
    }
    ch.outputReadPos = (ch.outputReadPos + sHopInt) % outSize;

    return out;
  }

  ringAvailable(c) {
    const d = this.inputWrite[c] - this.inputRead[c];
    return d < 0 ? d + this.ringSize : d;
  }

  outAvailable(c) {
    const d = this.outputWrite[c] - this.outputRead[c];
    return d < 0 ? d + this.ringSize : d;
  }

  process(inputs, outputs, parameters) {
    const pitchRatio = parameters.pitchRatio[0];
    const tempoRatio = parameters.tempoRatio[0];
    const bypass     = parameters.bypass[0] > 0.5;

    const input  = inputs[0]  || [];
    const output = outputs[0] || [];
    const numCh  = Math.max(input.length, 1);
    const QUANTUM = 128;

    if (bypass) {
      for (let c = 0; c < numCh; c++) {
        const inBuf  = input[c];
        const outBuf = output[c];
        if (inBuf && outBuf) {
          for (let i = 0; i < QUANTUM; i++) outBuf[i] = inBuf ? inBuf[i] || 0 : 0;
        }
      }
      return true;
    }

    // ── Feed input into ring ─────────────────────────────────────
    for (let c = 0; c < 2; c++) {
      const inBuf = input[c] || input[0] || [];
      for (let i = 0; i < QUANTUM; i++) {
        this.inputRing[c][this.inputWrite[c]] = inBuf[i] || 0;
        this.inputWrite[c] = (this.inputWrite[c] + 1) % this.ringSize;
      }
    }

    // ── Process frames and push to output ring ───────────────────
    // stretchFactor for OLA = 1/pitchRatio (pitch shift OLA stretch)
    // then tempoRatio applied via resampling output
    // Overall: stretchFactor_OLA = 1/pitchRatio
    // Then resample output by pitchRatio * tempoRatio

    // How many analysis hops can we process?
    const hopSize = this.FFT_SIZE >> 2;
    const N       = this.FFT_SIZE;

    for (let c = 0; c < 2; c++) {
      const ch = this.channels[c];
      ch.hopSize = hopSize; // ensure consistent

      while (this.ringAvailable(c) >= N) {
        // Fill analysis buffer from input ring
        for (let i = 0; i < N; i++) {
          const pos = (this.inputRead[c] + i) % this.ringSize;
          ch.analysisBuffer[i] = this.inputRing[c][pos];
        }
        // Advance input by one analysis hop
        this.inputRead[c] = (this.inputRead[c] + hopSize) % this.ringSize;

        // Process one frame
        const frameOut = this.processFrame(ch, pitchRatio, tempoRatio);

        // Resample frameOut by (pitchRatio * tempoRatio) to push into output ring
        // We need outputSamples = frameOut.length / tempoRatio samples
        // (pitchRatio OLA already handled, tempoRatio compression = fewer output samples)
        const outputCount = Math.round(frameOut.length / tempoRatio);
        for (let i = 0; i < outputCount; i++) {
          // Linear interpolate from frameOut
          const srcPos = (i / outputCount) * (frameOut.length - 1);
          const lo = Math.floor(srcPos);
          const hi = Math.min(lo + 1, frameOut.length - 1);
          const frac = srcPos - lo;
          const sample = frameOut[lo] * (1 - frac) + frameOut[hi] * frac;
          this.outputRing[c][this.outputWrite[c]] = sample;
          this.outputWrite[c] = (this.outputWrite[c] + 1) % this.ringSize;
        }
      }
    }

    // ── Pull output from ring into Web Audio output buffers ───────
    for (let c = 0; c < Math.min(numCh, 2); c++) {
      const outBuf = output[c];
      if (!outBuf) continue;
      const avail = this.outAvailable(c);
      for (let i = 0; i < QUANTUM; i++) {
        if (i < avail) {
          outBuf[i] = this.outputRing[c][this.outputRead[c]];
          this.outputRead[c] = (this.outputRead[c] + 1) % this.ringSize;
        } else {
          outBuf[i] = 0; // underrun: silence
        }
      }
    }

    return true;
  }
}

registerProcessor('pitch-tempo-processor', PitchTempoProcessor);
`;
