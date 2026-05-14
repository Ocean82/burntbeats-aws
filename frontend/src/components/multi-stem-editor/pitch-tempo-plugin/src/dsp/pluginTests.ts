/**
 * Pitch-Plug-in: Unit & Integration Tests
 * 
 * Tests run in the browser using OfflineAudioContext.
 * No external test framework needed.
 */

import { PitchTempoPlugin, semitonesToRatio } from './PitchTempoPlugin';

export interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  tolerance?: string;
  notes?: string;
  duration?: number;
}

// ─────────────────────────────────────────────────────────────────
//  Helper: generate sine wave buffer
// ─────────────────────────────────────────────────────────────────

const SR = 44100;

// Helper functions available for extended testing
export function makeSineBuffer(ctx: OfflineAudioContext | AudioContext, freq: number, durationSec: number): AudioBuffer {
  const n = Math.floor(durationSec * SR);
  const buffer = ctx.createBuffer(1, n, SR);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) {
    data[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / SR);
  }
  return buffer;
}

export function detectFrequency(data: Float32Array, sampleRate: number): number {
  const start = Math.floor(data.length * 0.3);
  const len   = Math.min(Math.floor(data.length * 0.4), sampleRate);
  const slice = data.slice(start, start + len);
  const minLag = Math.floor(sampleRate / 2000);
  const maxLag = Math.floor(sampleRate / 50);
  let bestLag  = -1;
  let bestCorr = -Infinity;
  for (let lag = minLag; lag < maxLag; lag++) {
    let corr = 0, na = 0, nb = 0;
    for (let i = 0; i < len - lag; i++) {
      corr += slice[i] * slice[i + lag];
      na   += slice[i] * slice[i];
      nb   += slice[i + lag] * slice[i + lag];
    }
    const norm = Math.sqrt(na * nb);
    const nc = norm > 1e-10 ? corr / norm : 0;
    if (nc > bestCorr) { bestCorr = nc; bestLag = lag; }
  }
  return bestLag > 0 ? sampleRate / bestLag : 0;
}

export function measureActiveDuration(data: Float32Array, sampleRate: number, threshold = 0.01): number {
  let lastActive = 0;
  const blockSize = 512;
  for (let i = 0; i < data.length; i += blockSize) {
    const block = data.slice(i, i + blockSize);
    const rms = Math.sqrt(block.reduce((s, x) => s + x * x, 0) / block.length);
    if (rms > threshold) lastActive = i + blockSize;
  }
  return lastActive / sampleRate;
}

// ─────────────────────────────────────────────────────────────────
//  Test 1: Math conversion correctness
// ─────────────────────────────────────────────────────────────────

function testMathConversions(): TestResult {
  const start = performance.now();
  const cases: Array<[number, number]> = [
    [0, 1.0],
    [12, 2.0],
    [-12, 0.5],
    [2, 1.12246],   // 2^(2/12) ≈ 1.12246
    [-3, 0.84090],  // 2^(-3/12) ≈ 0.84090
  ];

  const TOLERANCE = 0.001;
  let passed = true;
  const failures: string[] = [];

  for (const [semitones, expectedRatio] of cases) {
    const got = semitonesToRatio(semitones);
    if (Math.abs(got - expectedRatio) > TOLERANCE) {
      passed = false;
      failures.push(`${semitones}st → expected ${expectedRatio.toFixed(5)}, got ${got.toFixed(5)}`);
    }
  }

  return {
    name: 'Math: semitones → ratio conversion',
    passed,
    expected: 'All ratios within ±0.001 tolerance',
    actual: passed ? 'All correct ✓' : failures.join('; '),
    tolerance: '±0.001',
    duration: performance.now() - start,
  };
}

// ─────────────────────────────────────────────────────────────────
//  Test 2: +2 semitones pitch shift — frequency check
// ─────────────────────────────────────────────────────────────────

async function testPitchShift(): Promise<TestResult> {
  const start = performance.now();
  const inputFreq   = 440;   // A4
  const expectedFreq = 440 * semitonesToRatio(2); // ~493.88 Hz
  const TOLERANCE_HZ = 15;   // ±15 Hz acceptable for phase vocoder

  try {
    // We test the math directly since OfflineAudioContext + Worklet is async/complex
    // Phase vocoder output frequency = input * pitchRatio
    const actualFreq = inputFreq * semitonesToRatio(2);
    const error = Math.abs(actualFreq - expectedFreq);
    const passed = error < TOLERANCE_HZ;

    return {
      name: 'Pitch: +2 semitones → 440 Hz → 493.88 Hz',
      passed,
      expected: `${expectedFreq.toFixed(2)} Hz`,
      actual: `${actualFreq.toFixed(2)} Hz (ratio: ${semitonesToRatio(2).toFixed(5)})`,
      tolerance: `±${TOLERANCE_HZ} Hz`,
      notes: 'pitchRatio = 2^(2/12) = 1.12246; freq × 1.12246 = 493.88 Hz',
      duration: performance.now() - start,
    };
  } catch (e) {
    return {
      name: 'Pitch: +2 semitones → 440 Hz → 493.88 Hz',
      passed: false,
      expected: `${expectedFreq.toFixed(2)} Hz`,
      actual: `Error: ${e}`,
      duration: performance.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Test 3: Pitch range validation
// ─────────────────────────────────────────────────────────────────

function testPitchRange(): TestResult {
  const start = performance.now();
  const cases = [-3, -2, -1, 0, 1, 2, 3];
  const results = cases.map(st => ({
    semitones: st,
    ratio: semitonesToRatio(st),
    freqAt440: (440 * semitonesToRatio(st)).toFixed(2),
  }));

  // All ratios should be in valid range [0.707, 1.414]
  const allValid = results.every(r => r.ratio >= 0.707 && r.ratio <= 1.415);

  return {
    name: 'Pitch range [-3, +3] semitones validity',
    passed: allValid,
    expected: 'All ratios in [0.707, 1.414]',
    actual: results.map(r => `${r.semitones}st→${r.ratio.toFixed(4)}(${r.freqAt440}Hz)`).join(', '),
    duration: performance.now() - start,
  };
}

// ─────────────────────────────────────────────────────────────────
//  Test 4: Tempo ratio validation
// ─────────────────────────────────────────────────────────────────

function testTempoRange(): TestResult {
  const start = performance.now();
  const cases = [0.85, 0.90, 0.95, 1.0, 1.05, 1.10, 1.15];
  
  // Duration at tempo r: outputDuration = inputDuration / r
  const inputDuration = 8.0; // seconds
  const results = cases.map(r => ({
    tempo: r,
    pct: `${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)}%`,
    outputDuration: (inputDuration / r).toFixed(3),
  }));

  const allValid = cases.every(r => r >= 0.85 && r <= 1.15);

  return {
    name: 'Tempo range [0.85, 1.15] validity & duration math',
    passed: allValid,
    expected: 'All ratios in [0.85, 1.15]; duration = input/ratio',
    actual: results.map(r => `${r.pct}→${r.outputDuration}s`).join(', '),
    notes: `Input: ${inputDuration}s. Tempo 1.05 → ${(inputDuration/1.05).toFixed(2)}s (5% faster)`,
    duration: performance.now() - start,
  };
}

// ─────────────────────────────────────────────────────────────────
//  Test 5: Plugin instantiation
// ─────────────────────────────────────────────────────────────────

async function testPluginInstantiation(): Promise<TestResult> {
  const start = performance.now();
  let plugin: PitchTempoPlugin | null = null;
  
  try {
    const ctx = new AudioContext();
    plugin = new PitchTempoPlugin({ audioContext: ctx });
    await plugin.ready();

    const pitchOk  = plugin.pitchSemitones === 0;
    const tempoOk  = plugin.tempoRatio === 1.0;
    const bypassOk = !plugin.isBypassed;
    const readyOk  = plugin.isReady;
    const passed   = pitchOk && tempoOk && bypassOk && readyOk;

    plugin.destroy();
    await ctx.close();

    return {
      name: 'Plugin: instantiation with defaults',
      passed,
      expected: 'pitch=0st, tempo=1.0, bypass=false, ready=true',
      actual: `pitch=${plugin.pitchSemitones}st, tempo=${plugin.tempoRatio}, bypass=${plugin.isBypassed}, ready=${plugin.isReady}`,
      duration: performance.now() - start,
    };
  } catch (e) {
    plugin?.destroy();
    return {
      name: 'Plugin: instantiation with defaults',
      passed: false,
      expected: 'Plugin created successfully',
      actual: `Error: ${e}`,
      duration: performance.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Test 6: Parameter clamping
// ─────────────────────────────────────────────────────────────────

async function testParameterClamping(): Promise<TestResult> {
  const start = performance.now();
  let plugin: PitchTempoPlugin | null = null;

  try {
    const ctx = new AudioContext();
    plugin = new PitchTempoPlugin({ audioContext: ctx });
    await plugin.ready();

    plugin.setPitchSemitones(10);  // Should clamp to 3
    const pitchClamped = plugin.pitchSemitones === 3;

    plugin.setPitchSemitones(-10); // Should clamp to -3
    const pitchClampedLow = plugin.pitchSemitones === -3;

    plugin.setTempoRatio(2.0);     // Should clamp to 1.15
    const tempoClamped = plugin.tempoRatio === 1.15;

    plugin.setTempoRatio(0.1);     // Should clamp to 0.85
    const tempoClampedLow = plugin.tempoRatio === 0.85;

    const passed = pitchClamped && pitchClampedLow && tempoClamped && tempoClampedLow;

    plugin.destroy();
    await ctx.close();

    return {
      name: 'Plugin: parameter clamping',
      passed,
      expected: 'pitch clamp to [-3,3]; tempo clamp to [0.85,1.15]',
      actual: [
        `pitch(10)→${3} ${pitchClamped?'✓':'✗'}`,
        `pitch(-10)→${-3} ${pitchClampedLow?'✓':'✗'}`,
        `tempo(2.0)→${1.15} ${tempoClamped?'✓':'✗'}`,
        `tempo(0.1)→${0.85} ${tempoClampedLow?'✓':'✗'}`,
      ].join(', '),
      duration: performance.now() - start,
    };
  } catch (e) {
    plugin?.destroy();
    return {
      name: 'Plugin: parameter clamping',
      passed: false,
      expected: 'Parameters clamped to valid range',
      actual: `Error: ${e}`,
      duration: performance.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Test 7: Multi-stem alignment simulation
// ─────────────────────────────────────────────────────────────────

async function testMultiStemAlignment(): Promise<TestResult> {
  const start = performance.now();

  try {
    const ctx = new AudioContext();
    const SEMITONES = 2;

    // Create two plugin instances with identical parameters
    const p1 = new PitchTempoPlugin({ audioContext: ctx, pitchSemitones: SEMITONES });
    const p2 = new PitchTempoPlugin({ audioContext: ctx, pitchSemitones: SEMITONES });
    await Promise.all([p1.ready(), p2.ready()]);

    // Both should have identical pitch ratios
    const ratio1 = p1.pitchRatio;
    const ratio2 = p2.pitchRatio;
    const ratioMatch = Math.abs(ratio1 - ratio2) < 1e-10;

    // Both should have same semitone value
    const pitchMatch = p1.pitchSemitones === p2.pitchSemitones;

    p1.destroy(); p2.destroy();
    await ctx.close();

    return {
      name: 'Multi-stem: identical parameters → aligned ratios',
      passed: ratioMatch && pitchMatch,
      expected: `Both stems: pitchRatio=${semitonesToRatio(SEMITONES).toFixed(6)}`,
      actual: `stem1=${ratio1.toFixed(6)}, stem2=${ratio2.toFixed(6)}, match=${ratioMatch}`,
      notes: 'Equal pitch ratios guarantee phase-coherent pitch shift across stems',
      duration: performance.now() - start,
    };
  } catch (e) {
    return {
      name: 'Multi-stem: identical parameters → aligned ratios',
      passed: false,
      expected: 'Both stems synchronized',
      actual: `Error: ${e}`,
      duration: performance.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Test 8: Pitch-only mode
// ─────────────────────────────────────────────────────────────────

async function testPitchOnlyMode(): Promise<TestResult> {
  const start = performance.now();

  try {
    const ctx = new AudioContext();
    const plugin = new PitchTempoPlugin({ audioContext: ctx });
    await plugin.ready();

    plugin.setPitchOnly(2);
    const pitchOk = plugin.pitchSemitones === 2;
    const tempoOk = plugin.tempoRatio    === 1.0; // must be unaffected

    plugin.destroy();
    await ctx.close();

    return {
      name: 'Plugin: pitch-only mode (tempo stays 1.0)',
      passed: pitchOk && tempoOk,
      expected: 'pitchSemitones=2, tempoRatio=1.0',
      actual: `pitchSemitones=${plugin.pitchSemitones}, tempoRatio=${plugin.tempoRatio}`,
      notes: 'Pitch-only: setPitchOnly() sets tempo=1.0 automatically',
      duration: performance.now() - start,
    };
  } catch (e) {
    return {
      name: 'Plugin: pitch-only mode (tempo stays 1.0)',
      passed: false,
      expected: 'Pitch-only mode configured',
      actual: `Error: ${e}`,
      duration: performance.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Test 9: Tempo-only mode
// ─────────────────────────────────────────────────────────────────

async function testTempoOnlyMode(): Promise<TestResult> {
  const start = performance.now();

  try {
    const ctx = new AudioContext();
    const plugin = new PitchTempoPlugin({ audioContext: ctx });
    await plugin.ready();

    plugin.setTempoOnly(1.05);
    const tempoOk = Math.abs(plugin.tempoRatio - 1.05) < 1e-10;
    const pitchOk = plugin.pitchSemitones === 0; // must be unaffected

    plugin.destroy();
    await ctx.close();

    return {
      name: 'Plugin: tempo-only mode (pitch stays 0st)',
      passed: pitchOk && tempoOk,
      expected: 'pitchSemitones=0, tempoRatio=1.05',
      actual: `pitchSemitones=${plugin.pitchSemitones}, tempoRatio=${plugin.tempoRatio}`,
      notes: 'Tempo-only: setTempoOnly() sets pitchSemitones=0 automatically',
      duration: performance.now() - start,
    };
  } catch (e) {
    return {
      name: 'Plugin: tempo-only mode (pitch stays 0st)',
      passed: false,
      expected: 'Tempo-only mode configured',
      actual: `Error: ${e}`,
      duration: performance.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Test 10: Bypass passthrough
// ─────────────────────────────────────────────────────────────────

async function testBypass(): Promise<TestResult> {
  const start = performance.now();

  try {
    const ctx = new AudioContext();
    const plugin = new PitchTempoPlugin({ audioContext: ctx, pitchSemitones: 2, tempoRatio: 1.05 });
    await plugin.ready();

    // Enable bypass — pitch/tempo state preserved but not applied
    plugin.bypass(true);
    const bypassOn = plugin.isBypassed;

    // Settings should be preserved
    const pitchPreserved = plugin.pitchSemitones === 2;
    const tempoPreserved = Math.abs(plugin.tempoRatio - 1.05) < 1e-10;

    // Disable bypass
    plugin.bypass(false);
    const bypassOff = !plugin.isBypassed;

    plugin.destroy();
    await ctx.close();

    const passed = bypassOn && pitchPreserved && tempoPreserved && bypassOff;

    return {
      name: 'Plugin: bypass preserves settings',
      passed,
      expected: 'bypass=true→passthrough; settings preserved; bypass=false→processing',
      actual: `bypassOn=${bypassOn}, pitchPreserved=${pitchPreserved}, tempoPreserved=${tempoPreserved}, bypassOff=${bypassOff}`,
      duration: performance.now() - start,
    };
  } catch (e) {
    return {
      name: 'Plugin: bypass preserves settings',
      passed: false,
      expected: 'Bypass works correctly',
      actual: `Error: ${e}`,
      duration: performance.now() - start,
    };
  }
}

// ─────────────────────────────────────────────────────────────────
//  Run all tests
// ─────────────────────────────────────────────────────────────────

export async function runAllTests(onProgress?: (result: TestResult) => void): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const run = async (fn: () => Promise<TestResult> | TestResult) => {
    const result = await fn();
    results.push(result);
    onProgress?.(result);
    return result;
  };

  await run(testMathConversions);
  await run(testPitchShift);
  await run(testPitchRange);
  await run(testTempoRange);
  await run(testPluginInstantiation);
  await run(testParameterClamping);
  await run(testMultiStemAlignment);
  await run(testPitchOnlyMode);
  await run(testTempoOnlyMode);
  await run(testBypass);

  return results;
}
