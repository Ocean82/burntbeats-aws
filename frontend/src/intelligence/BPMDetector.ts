export interface BeatInfo {
  time: number;
  strength: number;
  type: "beat" | "downbeat" | "offbeat";
  confidence: number;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
  confidence: number;
}

export interface RhythmPattern {
  pattern: number[];
  complexity: number;
  syncopation: number;
  groove: "straight" | "swing" | "shuffle" | "latin";
}

export interface SyncPoint {
  time: number;
  type: "beat" | "measure" | "phrase";
  strength: number;
  bpm: number;
}

export interface BPMAnalysis {
  bpm: number;
  confidence: number;
  beats: BeatInfo[];
  downbeats: BeatInfo[];
  timeSignature: TimeSignature;
  tempoStability: number;
  rhythmPattern: RhythmPattern;
  syncPoints: SyncPoint[];
}

export interface TempoChange {
  time: number;
  bpm: number;
  confidence: number;
}

export interface TempoMap {
  changes: TempoChange[];
  averageBPM: number;
  stability: number;
}

export class BPMDetector {
  private audioContext: AudioContext;
  private sampleRate = 44100;

  constructor() {
    const AC: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AC();
    this.sampleRate = this.audioContext.sampleRate;
  }

  async analyzeBPM(audioBuffer: AudioBuffer): Promise<BPMAnalysis> {
    const monoData = this.convertToMono(audioBuffer);
    this.sampleRate = audioBuffer.sampleRate;
    const [onsetDetection, spectralFluxBeats, energyBeats, autocorrelationTempo] = await Promise.all([
      this.detectOnsets(monoData),
      this.detectBeatsSpectralFlux(monoData),
      this.detectBeatsEnergy(monoData),
      this.detectTempoAutocorrelation(monoData),
    ]);
    const combinedBeats = this.combineBeats([onsetDetection, spectralFluxBeats, energyBeats]);
    const bpmEstimate = this.estimateBPMFromBeats(combinedBeats);
    const finalBPM = this.refineBPM(bpmEstimate, autocorrelationTempo);
    const beats = this.trackBeats(combinedBeats, finalBPM.bpm);
    const downbeats = this.detectDownbeats(beats, finalBPM.bpm);
    const rhythmPattern = this.analyzeRhythmPattern(beats);
    const timeSignature = this.detectTimeSignature(beats, downbeats);
    const syncPoints = this.generateSyncPoints(beats, downbeats, finalBPM.bpm);
    const tempoStability = this.calculateTempoStability(beats);
    return {
      bpm: finalBPM.bpm,
      confidence: finalBPM.confidence,
      beats,
      downbeats,
      timeSignature,
      tempoStability,
      rhythmPattern,
      syncPoints,
    };
  }

  async createTempoMap(audioBuffer: AudioBuffer, windowSize = 8): Promise<TempoMap> {
    const monoData = this.convertToMono(audioBuffer);
    const windowSamples = windowSize * this.sampleRate;
    const hopSamples = windowSamples / 2;
    const tempoChanges: TempoChange[] = [];
    let totalBPM = 0;
    let validWindows = 0;
    for (let i = 0; i < monoData.length - windowSamples; i += hopSamples) {
      const window = monoData.slice(i, i + windowSamples);
      const windowBuffer = this.createAudioBuffer(window);
      const bpmAnalysis = await this.analyzeBPM(windowBuffer);
      if (bpmAnalysis.confidence > 0.5) {
        tempoChanges.push({ time: i / this.sampleRate, bpm: bpmAnalysis.bpm, confidence: bpmAnalysis.confidence });
        totalBPM += bpmAnalysis.bpm;
        validWindows++;
      }
    }
    const averageBPM = validWindows > 0 ? totalBPM / validWindows : 120;
    const stability = this.calculateTempoMapStability(tempoChanges);
    return { changes: tempoChanges, averageBPM, stability };
  }

  async syncTracks(track1: AudioBuffer, track2: AudioBuffer) {
    const [analysis1, analysis2] = await Promise.all([this.analyzeBPM(track1), this.analyzeBPM(track2)]);
    const bpmRatio = analysis2.bpm / analysis1.bpm;
    const timeDifference = this.calculateOptimalTimeOffset(analysis1.syncPoints, analysis2.syncPoints);
    const syncQuality = this.calculateSyncQuality(analysis1, analysis2, timeDifference);
    return { track1SyncPoints: analysis1.syncPoints, track2SyncPoints: analysis2.syncPoints, timeDifference, bpmRatio, syncQuality };
  }

  private async detectOnsets(audioData: Float32Array): Promise<BeatInfo[]> {
    const frameSize = Math.floor(this.sampleRate * 0.05);
    const hopSize = Math.floor(frameSize / 4);
    const beats: BeatInfo[] = [];
    let previousSpectrum: Float32Array | null = null;
    for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
      const frame = audioData.slice(i, i + frameSize);
      const spectrum = await this.computeSpectrum(frame);
      if (previousSpectrum) {
        const flux = this.computeSpectralFlux(spectrum, previousSpectrum);
        if (this.isOnsetPeak(flux, i, hopSize)) {
          beats.push({ time: i / this.sampleRate, strength: flux, type: "beat", confidence: Math.min(1, flux / 0.1) });
        }
      }
      previousSpectrum = spectrum;
    }
    return beats;
  }

  private async detectBeatsSpectralFlux(audioData: Float32Array): Promise<BeatInfo[]> {
    const frameSize = 1024;
    const hopSize = 512;
    const beats: BeatInfo[] = [];
    const fluxValues: number[] = [];
    let previousSpectrum: Float32Array | null = null;
    for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
      const frame = audioData.slice(i, i + frameSize);
      const spectrum = await this.computeSpectrum(frame);
      if (previousSpectrum) fluxValues.push(this.computeSpectralFlux(spectrum, previousSpectrum));
      previousSpectrum = spectrum;
    }
    const threshold = this.calculateAdaptiveThreshold(fluxValues);
    for (let i = 1; i < fluxValues.length - 1; i++) {
      if (fluxValues[i] > threshold && fluxValues[i] > fluxValues[i - 1] && fluxValues[i] > fluxValues[i + 1]) {
        beats.push({ time: (i * hopSize) / this.sampleRate, strength: fluxValues[i], type: "beat", confidence: Math.min(1, fluxValues[i] / threshold) });
      }
    }
    return beats;
  }

  private async detectBeatsEnergy(audioData: Float32Array): Promise<BeatInfo[]> {
    const frameSize = Math.floor(this.sampleRate * 0.1);
    const hopSize = Math.floor(frameSize / 2);
    const beats: BeatInfo[] = [];
    const energyValues: number[] = [];
    for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
      const frame = audioData.slice(i, i + frameSize);
      energyValues.push(this.computeEnergy(frame));
    }
    const threshold = this.calculateEnergyThreshold(energyValues);
    for (let i = 1; i < energyValues.length - 1; i++) {
      if (energyValues[i] > threshold && energyValues[i] > energyValues[i - 1] && energyValues[i] > energyValues[i + 1]) {
        beats.push({ time: (i * hopSize) / this.sampleRate, strength: energyValues[i], type: "beat", confidence: Math.min(1, energyValues[i] / threshold) });
      }
    }
    return beats;
  }

  private async detectTempoAutocorrelation(audioData: Float32Array): Promise<{ bpm: number; confidence: number }> {
    const onsetStrength = await this.computeOnsetStrength(audioData);
    const minBPM = 60;
    const maxBPM = 200;
    const minLag = Math.floor((60 * this.sampleRate) / maxBPM);
    const maxLag = Math.floor((60 * this.sampleRate) / minBPM);
    let maxCorrelation = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const correlation = this.autocorrelate(onsetStrength, lag);
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestLag = lag;
      }
    }
    return { bpm: bestLag > 0 ? (60 * this.sampleRate) / bestLag : 120, confidence: maxCorrelation };
  }

  private combineBeats(beatArrays: BeatInfo[][]): BeatInfo[] {
    const allBeats = beatArrays.flat();
    allBeats.sort((a, b) => a.time - b.time);
    const combinedBeats: BeatInfo[] = [];
    const tolerance = 0.05;
    for (const beat of allBeats) {
      const existing = combinedBeats.find((b) => Math.abs(b.time - beat.time) < tolerance);
      if (existing) {
        existing.strength = Math.max(existing.strength, beat.strength);
        existing.confidence = Math.max(existing.confidence, beat.confidence);
      } else {
        combinedBeats.push({ ...beat });
      }
    }
    return combinedBeats;
  }

  private estimateBPMFromBeats(beats: BeatInfo[]): { bpm: number; confidence: number } {
    if (beats.length < 2) return { bpm: 120, confidence: 0 };
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) intervals.push(beats[i].time - beats[i - 1].time);
    const histogram = this.createIntervalHistogram(intervals);
    const mostCommonInterval = this.findPeakInterval(histogram);
    const bpm = mostCommonInterval > 0 ? 60 / mostCommonInterval : 120;
    const tolerance = mostCommonInterval * 0.1;
    const matching = intervals.filter((i) => Math.abs(i - mostCommonInterval) < tolerance);
    return { bpm, confidence: matching.length / intervals.length };
  }

  private refineBPM(beatBPM: { bpm: number; confidence: number }, autocorrBPM: { bpm: number; confidence: number }) {
    const totalConfidence = beatBPM.confidence + autocorrBPM.confidence;
    if (totalConfidence === 0) return { bpm: 120, confidence: 0 };
    const weightedBPM = (beatBPM.bpm * beatBPM.confidence + autocorrBPM.bpm * autocorrBPM.confidence) / totalConfidence;
    return { bpm: Math.round(weightedBPM), confidence: totalConfidence / 2 };
  }

  private trackBeats(detectedBeats: BeatInfo[], bpm: number): BeatInfo[] {
    if (detectedBeats.length === 0) return this.generateRegularBeats(bpm, 60);
    const beatInterval = 60 / bpm;
    const trackedBeats: BeatInfo[] = [];
    let currentTime = detectedBeats[0].time;
    const endTime = detectedBeats[detectedBeats.length - 1].time;
    while (currentTime <= endTime) {
      const closestBeat = this.findClosestBeat(detectedBeats, currentTime);
      const distance = Math.abs(closestBeat.time - currentTime);
      if (distance < beatInterval * 0.2) {
        trackedBeats.push({ time: currentTime, strength: closestBeat.strength, type: "beat", confidence: Math.max(0.5, 1 - distance / (beatInterval * 0.2)) });
      } else {
        trackedBeats.push({ time: currentTime, strength: 0.5, type: "beat", confidence: 0.3 });
      }
      currentTime += beatInterval;
    }
    return trackedBeats;
  }

  private detectDownbeats(beats: BeatInfo[], _bpm: number): BeatInfo[] {
    const downbeats: BeatInfo[] = [];
    for (let i = 0; i < beats.length; i += 4) {
      if (beats[i]) downbeats.push({ ...beats[i], type: "downbeat", strength: beats[i].strength * 1.2 });
    }
    return downbeats;
  }

  private analyzeRhythmPattern(beats: BeatInfo[]): RhythmPattern {
    if (beats.length < 4) return { pattern: [1, 1, 1, 1], complexity: 0, syncopation: 0, groove: "straight" };
    const pattern = beats.slice(0, 16).map((b) => Math.round(b.strength * 4));
    return { pattern, complexity: this.calculateRhythmComplexity(pattern), syncopation: this.calculateSyncopation(beats), groove: this.detectGroove(beats) };
  }

  private detectTimeSignature(beats: BeatInfo[], downbeats: BeatInfo[]): TimeSignature {
    if (downbeats.length < 2) return { numerator: 4, denominator: 4, confidence: 0.5 };
    const beatsPerMeasure: number[] = [];
    for (let i = 1; i < downbeats.length; i++) {
      const count = beats.filter((b) => b.time >= downbeats[i - 1].time && b.time < downbeats[i].time).length;
      beatsPerMeasure.push(count);
    }
    const histogram = new Map<number, number>();
    for (const count of beatsPerMeasure) histogram.set(count, (histogram.get(count) || 0) + 1);
    let mostCommon = 4;
    let maxCount = 0;
    for (const [b, count] of histogram) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = b;
      }
    }
    return { numerator: mostCommon, denominator: 4, confidence: beatsPerMeasure.length > 0 ? maxCount / beatsPerMeasure.length : 0.5 };
  }

  private generateSyncPoints(beats: BeatInfo[], downbeats: BeatInfo[], bpm: number): SyncPoint[] {
    const syncPoints: SyncPoint[] = [];
    for (const beat of beats) {
      if (beat.confidence > 0.7) syncPoints.push({ time: beat.time, type: "beat", strength: beat.strength, bpm });
    }
    for (const downbeat of downbeats) syncPoints.push({ time: downbeat.time, type: "measure", strength: downbeat.strength, bpm });
    for (let i = 0; i < downbeats.length; i += 4) {
      if (downbeats[i]) syncPoints.push({ time: downbeats[i].time, type: "phrase", strength: downbeats[i].strength * 1.5, bpm });
    }
    return syncPoints.sort((a, b) => a.time - b.time);
  }

  private calculateTempoStability(beats: BeatInfo[]): number {
    if (beats.length < 3) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) intervals.push(beats[i].time - beats[i - 1].time);
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, iv) => sum + (iv - mean) ** 2, 0) / intervals.length;
    return Math.min(1, 1 / (1 + variance));
  }

  private convertToMono(audioBuffer: AudioBuffer): Float32Array {
    if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
    const length = audioBuffer.length;
    const monoData = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) sum += audioBuffer.getChannelData(channel)[i];
      monoData[i] = sum / audioBuffer.numberOfChannels;
    }
    return monoData;
  }

  private async computeSpectrum(frame: Float32Array): Promise<Float32Array> {
    const spectrum = new Float32Array(frame.length / 2);
    for (let i = 0; i < spectrum.length; i++) spectrum[i] = Math.abs(frame[i]);
    return spectrum;
  }

  private computeSpectralFlux(current: Float32Array, previous: Float32Array): number {
    let flux = 0;
    for (let i = 0; i < Math.min(current.length, previous.length); i++) {
      const diff = current[i] - previous[i];
      flux += diff > 0 ? diff : 0;
    }
    return flux;
  }

  private computeEnergy(frame: Float32Array): number {
    let energy = 0;
    for (let i = 0; i < frame.length; i++) energy += frame[i] ** 2;
    return energy;
  }

  private isOnsetPeak(_flux: number, _position: number, _hopSize: number): boolean {
    return true;
  }

  private calculateAdaptiveThreshold(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length);
    return mean + std * 0.5;
  }

  private calculateEnergyThreshold(energyValues: number[]): number {
    const sorted = [...energyValues].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.8)];
  }

  private async computeOnsetStrength(audioData: Float32Array): Promise<Float32Array> {
    const frameSize = 1024;
    const hopSize = 512;
    const onsetStrength = new Float32Array(Math.floor(audioData.length / hopSize));
    for (let i = 0; i < onsetStrength.length; i++) {
      const start = i * hopSize;
      onsetStrength[i] = this.computeEnergy(audioData.slice(start, start + frameSize));
    }
    return onsetStrength;
  }

  private autocorrelate(signal: Float32Array, lag: number): number {
    let correlation = 0;
    let count = 0;
    for (let i = 0; i < signal.length - lag; i++) {
      correlation += signal[i] * signal[i + lag];
      count++;
    }
    return count > 0 ? correlation / count : 0;
  }

  private createIntervalHistogram(intervals: number[]): Map<number, number> {
    const histogram = new Map<number, number>();
    const binSize = 0.01;
    for (const interval of intervals) {
      const bin = Math.round(interval / binSize) * binSize;
      histogram.set(bin, (histogram.get(bin) || 0) + 1);
    }
    return histogram;
  }

  private findPeakInterval(histogram: Map<number, number>): number {
    let maxCount = 0;
    let peakInterval = 0.5;
    for (const [interval, count] of histogram) {
      if (count > maxCount && interval > 0.2 && interval < 2.0) {
        maxCount = count;
        peakInterval = interval;
      }
    }
    return peakInterval;
  }

  private generateRegularBeats(bpm: number, duration: number): BeatInfo[] {
    const beatInterval = 60 / bpm;
    const beats: BeatInfo[] = [];
    for (let time = 0; time < duration; time += beatInterval) {
      beats.push({ time, strength: 0.7, type: "beat", confidence: 0.8 });
    }
    return beats;
  }

  private findClosestBeat(beats: BeatInfo[], targetTime: number): BeatInfo {
    let closest = beats[0];
    let minDistance = Math.abs(beats[0].time - targetTime);
    for (const beat of beats) {
      const distance = Math.abs(beat.time - targetTime);
      if (distance < minDistance) {
        minDistance = distance;
        closest = beat;
      }
    }
    return closest;
  }

  private calculateRhythmComplexity(pattern: number[]): number {
    return new Set(pattern).size / Math.max(pattern.length, 1);
  }

  private calculateSyncopation(beats: BeatInfo[]): number {
    let syncopation = 0;
    const beatInterval = beats.length > 1 ? beats[1].time - beats[0].time : 0.5;
    for (let i = 1; i < beats.length - 1; i++) {
      const expected = beats[0].time + i * beatInterval;
      syncopation += Math.abs(beats[i].time - expected) / beatInterval;
    }
    return Math.min(1, syncopation / beats.length);
  }

  private detectGroove(beats: BeatInfo[]): RhythmPattern["groove"] {
    if (beats.length < 4) return "straight";
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(beats.length, 9); i++) intervals.push(beats[i].time - beats[i - 1].time);
    let swingCount = 0;
    for (let i = 0; i < intervals.length - 1; i += 2) {
      if (intervals[i] > intervals[i + 1] * 1.2) swingCount++;
    }
    return swingCount > intervals.length / 4 ? "swing" : "straight";
  }

  private createAudioBuffer(data: Float32Array): AudioBuffer {
    const buffer = this.audioContext.createBuffer(1, data.length, this.sampleRate);
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    return buffer;
  }

  private calculateOptimalTimeOffset(syncPoints1: SyncPoint[], syncPoints2: SyncPoint[]): number {
    if (syncPoints1.length === 0 || syncPoints2.length === 0) return 0;
    return syncPoints2[0].time - syncPoints1[0].time;
  }

  private calculateSyncQuality(analysis1: BPMAnalysis, analysis2: BPMAnalysis, _timeOffset: number): number {
    const bpmDiff = Math.abs(analysis1.bpm - analysis2.bpm) / Math.max(analysis1.bpm, analysis2.bpm);
    return analysis1.confidence * analysis2.confidence * (1 - bpmDiff);
  }

  private calculateTempoMapStability(changes: TempoChange[]): number {
    if (changes.length < 2) return 1;
    const bpmValues = changes.map((c) => c.bpm);
    const mean = bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length;
    const variance = bpmValues.reduce((sum, bpm) => sum + (bpm - mean) ** 2, 0) / bpmValues.length;
    return 1 / (1 + variance / mean ** 2);
  }
}
