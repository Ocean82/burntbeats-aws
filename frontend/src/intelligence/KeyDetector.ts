const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface KeyDetectionResult {
  key: string;
  mode: "major" | "minor";
  confidence: number;
  alternativeKeys: Array<{ key: string; mode: "major" | "minor"; confidence: number }>;
  chromaticProfile: number[];
  keyStrength: number;
  tonalCenterStrength: number;
}

export interface TranspositionOptions {
  fromKey: string;
  fromMode: "major" | "minor";
  toKey: string;
  toMode: "major" | "minor";
  preserveMode?: boolean;
  algorithm?: "chromatic" | "diatonic" | "intelligent";
}

export interface TranspositionResult {
  success: boolean;
  originalKey: string;
  targetKey: string;
  semitoneShift: number;
  scaleMapping: Record<string, string>;
  preservedIntervals: boolean;
  warnings: string[];
}

export class KeyDetector {
  private circleOfFifths = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];

  detectKeyFromChroma(chromaVector: number[]): KeyDetectionResult {
    const correlations = new Map<string, number>();
    for (let root = 0; root < 12; root++) {
      const majorKey = NOTE_NAMES[root];
      const minorKey = NOTE_NAMES[root];
      correlations.set(`${majorKey}_major`, this.pearsonCorrelation(chromaVector, this.rotateArray(MAJOR_PROFILE, root)));
      correlations.set(`${minorKey}_minor`, this.pearsonCorrelation(chromaVector, this.rotateArray(MINOR_PROFILE, root)));
    }
    const bestMatch = this.findBestKeyMatch(correlations);
    const confidence = this.calculateConfidence(correlations, bestMatch);
    const alternatives = this.getAlternativeKeys(correlations, bestMatch);
    return {
      key: bestMatch.key,
      mode: bestMatch.mode,
      confidence,
      alternativeKeys: alternatives,
      chromaticProfile: chromaVector,
      keyStrength: bestMatch.strength,
      tonalCenterStrength: this.calculateTonalCenterStrength(chromaVector, bestMatch),
    };
  }

  async detectKey(audioBuffer: AudioBuffer): Promise<KeyDetectionResult> {
    const chroma = await this.extractChromaFeatures(audioBuffer);
    return this.detectKeyFromChroma(chroma);
  }

  transposeKey(options: TranspositionOptions): TranspositionResult {
    try {
      const fromKeyIndex = this.getKeyIndex(options.fromKey);
      const toKeyIndex = this.getKeyIndex(options.toKey);
      if (fromKeyIndex === -1 || toKeyIndex === -1) {
        return { success: false, originalKey: options.fromKey, targetKey: options.toKey, semitoneShift: 0, scaleMapping: {}, preservedIntervals: false, warnings: ["Invalid key specified"] };
      }
      let semitoneShift = toKeyIndex - fromKeyIndex;
      if (semitoneShift > 6) semitoneShift -= 12;
      if (semitoneShift < -6) semitoneShift += 12;
      if (!options.preserveMode && options.fromMode !== options.toMode) {
        if (options.fromMode === "major" && options.toMode === "minor") semitoneShift -= 3;
        else if (options.fromMode === "minor" && options.toMode === "major") semitoneShift += 3;
      }
      const scaleMapping = this.generateScaleMapping(options.fromKey, options.fromMode, semitoneShift, options.algorithm || "intelligent");
      const preservedIntervals = this.checkPreservedIntervals(options.fromKey, options.fromMode, options.toKey, options.toMode);
      const warnings = this.generateTranspositionWarnings(options, semitoneShift);
      return { success: true, originalKey: `${options.fromKey} ${options.fromMode}`, targetKey: `${options.toKey} ${options.toMode}`, semitoneShift, scaleMapping, preservedIntervals, warnings };
    } catch (error: unknown) {
      return { success: false, originalKey: options.fromKey, targetKey: options.toKey, semitoneShift: 0, scaleMapping: {}, preservedIntervals: false, warnings: [`Transposition failed: ${error instanceof Error ? error.message : String(error)}`] };
    }
  }

  getCompatibleKeys(key: string, mode: "major" | "minor"): Array<{ key: string; mode: "major" | "minor"; relationship: string; compatibility: number }> {
    const keyIndex = this.getKeyIndex(key);
    if (keyIndex === -1) return [];
    const compatible: Array<{ key: string; mode: "major" | "minor"; relationship: string; compatibility: number }> = [];
    if (mode === "major") {
      const relMinor = this.circleOfFifths[(keyIndex + 9) % 12];
      compatible.push({ key: relMinor, mode: "minor", relationship: "relative minor", compatibility: 0.95 });
    } else {
      const relMajor = this.circleOfFifths[(keyIndex + 3) % 12];
      compatible.push({ key: relMajor, mode: "major", relationship: "relative major", compatibility: 0.95 });
    }
    compatible.push({ key, mode: mode === "major" ? "minor" : "major", relationship: `parallel ${mode === "major" ? "minor" : "major"}`, compatibility: 0.85 });
    compatible.push({ key: this.circleOfFifths[(keyIndex + 11) % 12], mode, relationship: "subdominant", compatibility: 0.8 });
    compatible.push({ key: this.circleOfFifths[(keyIndex + 1) % 12], mode, relationship: "dominant", compatibility: 0.8 });
    return compatible.sort((a, b) => b.compatibility - a.compatibility);
  }

  private async extractChromaFeatures(audioBuffer: AudioBuffer): Promise<number[]> {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const chromaVector = new Array(12).fill(0);
    const fftSize = 4096;
    const hopSize = fftSize / 4;
    const windowFunction = this.createHannWindow(fftSize);
    for (let i = 0; i < channelData.length - fftSize; i += hopSize) {
      const window = channelData.slice(i, i + fftSize);
      for (let j = 0; j < fftSize; j++) window[j] *= windowFunction[j];
      const magnitudes = this.computeFFTMagnitudes(Array.from(window));
      for (let bin = 1; bin < magnitudes.length; bin++) {
        const frequency = (bin * sampleRate) / fftSize;
        if (frequency > 80 && frequency < 2000) {
          chromaVector[this.frequencyToChroma(frequency)] += magnitudes[bin];
        }
      }
    }
    const sum = chromaVector.reduce((a, b) => a + b, 0);
    return sum > 0 ? chromaVector.map((x) => x / sum) : chromaVector;
  }

  private computeFFTMagnitudes(signal: number[]): Float32Array {
    const N = signal.length;
    const magnitudes = new Float32Array(N);
    for (let k = 0; k < N / 2; k++) {
      let real = 0;
      let imag = 0;
      for (let n = 0; n < N; n++) {
        const angle = (-2 * Math.PI * k * n) / N;
        real += signal[n] * Math.cos(angle);
        imag += signal[n] * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(real * real + imag * imag);
    }
    return magnitudes;
  }

  private findBestKeyMatch(correlations: Map<string, number>): { key: string; mode: "major" | "minor"; strength: number } {
    let bestKey = "";
    let bestMode: "major" | "minor" = "major";
    let bestCorrelation = -1;
    for (const [keyMode, correlation] of correlations) {
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        const [key, mode] = keyMode.split("_");
        bestKey = key;
        bestMode = mode as "major" | "minor";
      }
    }
    return { key: bestKey, mode: bestMode, strength: bestCorrelation };
  }

  private calculateConfidence(correlations: Map<string, number>, _bestMatch: { key: string; mode: "major" | "minor"; strength: number }): number {
    const values = Array.from(correlations.values()).sort((a, b) => b - a);
    const separation = values[0] - (values[1] || 0);
    return Math.min(1, Math.max(0, separation * 2 + 0.5));
  }

  private getAlternativeKeys(correlations: Map<string, number>, _bestMatch: { key: string; mode: "major" | "minor"; strength: number }): Array<{ key: string; mode: "major" | "minor"; confidence: number }> {
    return Array.from(correlations.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(1, 4)
      .map(([keyMode, correlation]) => {
        const [key, mode] = keyMode.split("_");
        return { key, mode: mode as "major" | "minor", confidence: Math.max(0, correlation) };
      });
  }

  private getKeyIndex(key: string): number {
    return this.circleOfFifths.indexOf(key);
  }

  private frequencyToChroma(frequency: number): number {
    return ((Math.round(12 * Math.log2(frequency / 440)) % 12) + 12) % 12;
  }

  private createHannWindow(size: number): number[] {
    const win = new Array(size);
    for (let i = 0; i < size; i++) win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    return win;
  }

  private rotateArray(arr: number[], positions: number): number[] {
    const len = arr.length;
    const p = ((positions % len) + len) % len;
    return arr.slice(p).concat(arr.slice(0, p));
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
    const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
    const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private generateScaleMapping(_fromKey: string, _fromMode: "major" | "minor", semitoneShift: number, _algorithm: string): Record<string, string> {
    const mapping: Record<string, string> = {};
    for (let i = 0; i < NOTE_NAMES.length; i++) mapping[NOTE_NAMES[i]] = NOTE_NAMES[(i + semitoneShift + 12) % 12];
    return mapping;
  }

  private checkPreservedIntervals(_fromKey: string, fromMode: "major" | "minor", _toKey: string, toMode: "major" | "minor"): boolean {
    return fromMode === toMode;
  }

  private generateTranspositionWarnings(options: TranspositionOptions, semitoneShift: number): string[] {
    const warnings: string[] = [];
    if (Math.abs(semitoneShift) > 6) warnings.push("Large interval transposition may affect musical character");
    if (options.fromMode !== options.toMode && !options.preserveMode) warnings.push("Mode change will alter the harmonic character");
    return warnings;
  }

  private calculateTonalCenterStrength(chromaVector: number[], bestMatch: { key: string; mode: "major" | "minor"; strength: number }): number {
    const keyIndex = this.getKeyIndex(bestMatch.key);
    return keyIndex >= 0 ? chromaVector[keyIndex] : 0;
  }
}
