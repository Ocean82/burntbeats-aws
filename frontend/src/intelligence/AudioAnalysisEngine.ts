export interface AudioFeatures {
  duration: number;
  sampleRate: number;
  channels: number;
  spectralCentroid: number[];
  spectralRolloff: number[];
  spectralFlux: number[];
  mfcc: number[][];
  chromaVector: number[][];
  rms: number[];
  zeroCrossingRate: number[];
  tempo: number;
  tempoConfidence: number;
  key: string;
  keyConfidence: number;
  mode: "major" | "minor";
  loudness: number;
  dynamicRange: number;
  energyProfile: number[];
  harmonicity: number;
  inharmonicity: number;
  tonalCentroid: number[];
}

export interface BeatInfo {
  bpm: number;
  confidence: number;
  beats: number[];
  downbeats: number[];
  timeSignature: { numerator: number; denominator: number };
}

export interface PitchInfo {
  fundamentalFreq: number;
  pitchClass: number;
  octave: number;
  confidence: number;
  harmonics: number[];
}

export class AudioAnalysisEngine {
  private audioContext: AudioContext;
  private fftSize = 2048;
  private hopSize = 512;
  private windowFunction: Float32Array;

  constructor() {
    const AC: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AC();
    this.windowFunction = this.createHanningWindow(this.fftSize);
  }

  async analyzeAudio(audioBuffer: AudioBuffer): Promise<AudioFeatures> {
    const monoData = this.convertToMono(audioBuffer);
    const [spectralFeatures, temporalFeatures, beatInfo, pitchInfo, energyFeatures] = await Promise.all([
      this.extractSpectralFeatures(monoData, audioBuffer.sampleRate),
      this.extractTemporalFeatures(monoData, audioBuffer.sampleRate),
      this.detectBeats(monoData, audioBuffer.sampleRate),
      this.detectPitch(monoData, audioBuffer.sampleRate),
      this.extractEnergyFeatures(monoData, audioBuffer.sampleRate),
    ]);
    const keyInfo = this.detectKey(spectralFeatures.chromaVector);
    return {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      spectralCentroid: spectralFeatures.spectralCentroid,
      spectralRolloff: spectralFeatures.spectralRolloff,
      spectralFlux: spectralFeatures.spectralFlux,
      mfcc: spectralFeatures.mfcc,
      chromaVector: spectralFeatures.chromaVector,
      rms: temporalFeatures.rms,
      zeroCrossingRate: temporalFeatures.zeroCrossingRate,
      tempo: beatInfo.bpm,
      tempoConfidence: beatInfo.confidence,
      key: keyInfo.key,
      keyConfidence: keyInfo.confidence,
      mode: keyInfo.mode,
      loudness: energyFeatures.loudness,
      dynamicRange: energyFeatures.dynamicRange,
      energyProfile: energyFeatures.energyProfile,
      harmonicity: pitchInfo.harmonics.length > 0 ? this.calculateHarmonicity(pitchInfo.harmonics) : 0,
      inharmonicity: pitchInfo.harmonics.length > 0 ? this.calculateInharmonicity(pitchInfo.harmonics) : 0,
      tonalCentroid: this.calculateTonalCentroid(spectralFeatures.chromaVector),
    };
  }

  private async extractSpectralFeatures(audioData: Float32Array, sampleRate: number) {
    const frames = Math.floor((audioData.length - this.fftSize) / this.hopSize) + 1;
    const spectralCentroid: number[] = [];
    const spectralRolloff: number[] = [];
    const spectralFlux: number[] = [];
    const mfcc: number[][] = [];
    const chromaVector: number[][] = [];
    let previousSpectrum: Float32Array | null = null;
    for (let frame = 0; frame < frames; frame++) {
      const startSample = frame * this.hopSize;
      const frameData = audioData.slice(startSample, startSample + this.fftSize);
      const windowedFrame = this.applyWindow(frameData);
      const spectrum = await this.computeFFT(windowedFrame);
      const magnitudes = this.computeMagnitudes(spectrum);
      spectralCentroid.push(this.computeSpectralCentroid(magnitudes, sampleRate));
      spectralRolloff.push(this.computeSpectralRolloff(magnitudes, sampleRate));
      mfcc.push(this.computeMFCC(magnitudes, sampleRate));
      chromaVector.push(this.computeChromaVector(magnitudes, sampleRate));
      if (previousSpectrum) spectralFlux.push(this.computeSpectralFlux(magnitudes, previousSpectrum));
      previousSpectrum = magnitudes;
    }
    return { spectralCentroid, spectralRolloff, spectralFlux, mfcc, chromaVector };
  }

  private async extractTemporalFeatures(audioData: Float32Array, sampleRate: number) {
    const frameSize = Math.floor(sampleRate * 0.025);
    const hopSize = Math.floor(frameSize / 2);
    const frames = Math.floor((audioData.length - frameSize) / hopSize) + 1;
    const rms: number[] = [];
    const zeroCrossingRate: number[] = [];
    for (let frame = 0; frame < frames; frame++) {
      const startSample = frame * hopSize;
      const frameData = audioData.slice(startSample, startSample + frameSize);
      rms.push(this.computeRMS(frameData));
      zeroCrossingRate.push(this.computeZeroCrossingRate(frameData));
    }
    return { rms, zeroCrossingRate };
  }

  private async extractEnergyFeatures(audioData: Float32Array, sampleRate: number) {
    const frameSize = Math.floor(sampleRate * 0.1);
    const hopSize = Math.floor(frameSize / 2);
    const frames = Math.floor((audioData.length - frameSize) / hopSize) + 1;
    const energyProfile: number[] = [];
    let totalEnergy = 0;
    let maxEnergy = 0;
    let minEnergy = Infinity;
    for (let frame = 0; frame < frames; frame++) {
      const startSample = frame * hopSize;
      const frameData = audioData.slice(startSample, startSample + frameSize);
      const energy = this.computeEnergy(frameData);
      energyProfile.push(energy);
      totalEnergy += energy;
      maxEnergy = Math.max(maxEnergy, energy);
      minEnergy = Math.min(minEnergy, energy);
    }
    return { loudness: totalEnergy / frames, dynamicRange: maxEnergy - minEnergy, energyProfile };
  }

  private async detectBeats(audioData: Float32Array, sampleRate: number): Promise<BeatInfo> {
    const onsets = await this.detectOnsets(audioData, sampleRate);
    const tempoInfo = this.estimateTempo(onsets, sampleRate);
    const beats = this.trackBeats(onsets, tempoInfo.bpm, sampleRate);
    const downbeats = this.detectDownbeats(beats, tempoInfo.bpm);
    return {
      bpm: tempoInfo.bpm,
      confidence: tempoInfo.confidence,
      beats,
      downbeats,
      timeSignature: { numerator: 4, denominator: 4 },
    };
  }

  private async detectPitch(audioData: Float32Array, sampleRate: number): Promise<PitchInfo> {
    const frameSize = Math.floor(sampleRate * 0.05);
    const pitches: number[] = [];
    const confidences: number[] = [];
    for (let i = 0; i < audioData.length - frameSize; i += frameSize) {
      const frame = audioData.slice(i, i + frameSize);
      const pitchInfo = this.autocorrelationPitch(frame, sampleRate);
      if (pitchInfo.confidence > 0.5) {
        pitches.push(pitchInfo.frequency);
        confidences.push(pitchInfo.confidence);
      }
    }
    if (pitches.length === 0) {
      return { fundamentalFreq: 0, pitchClass: 0, octave: 0, confidence: 0, harmonics: [] };
    }
    const sortedPitches = [...pitches].sort((a, b) => a - b);
    const fundamentalFreq = sortedPitches[Math.floor(sortedPitches.length / 2)];
    const confidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    return {
      fundamentalFreq,
      pitchClass: this.frequencyToPitchClass(fundamentalFreq),
      octave: this.frequencyToOctave(fundamentalFreq),
      confidence,
      harmonics: this.detectHarmonics(fundamentalFreq, audioData, sampleRate),
    };
  }

  private detectKey(chromaVectors: number[][]): { key: string; mode: "major" | "minor"; confidence: number } {
    if (chromaVectors.length === 0) return { key: "C", mode: "major", confidence: 0 };
    const avgChroma = new Array(12).fill(0);
    for (const chroma of chromaVectors) {
      for (let i = 0; i < 12; i++) avgChroma[i] += chroma[i];
    }
    for (let i = 0; i < 12; i++) avgChroma[i] /= chromaVectors.length;
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    let bestKey = "C";
    let bestMode: "major" | "minor" = "major";
    let bestCorrelation = -1;
    for (let root = 0; root < 12; root++) {
      const majorCorr = this.correlateWithProfile(avgChroma, majorProfile, root);
      if (majorCorr > bestCorrelation) {
        bestCorrelation = majorCorr;
        bestKey = noteNames[root];
        bestMode = "major";
      }
      const minorCorr = this.correlateWithProfile(avgChroma, minorProfile, root);
      if (minorCorr > bestCorrelation) {
        bestCorrelation = minorCorr;
        bestKey = noteNames[root];
        bestMode = "minor";
      }
    }
    return { key: bestKey, mode: bestMode, confidence: Math.max(0, Math.min(1, bestCorrelation)) };
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

  private createHanningWindow(size: number): Float32Array {
    const win = new Float32Array(size);
    for (let i = 0; i < size; i++) win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    return win;
  }

  private applyWindow(frame: Float32Array): Float32Array {
    const windowed = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) windowed[i] = frame[i] * this.windowFunction[i];
    return windowed;
  }

  private async computeFFT(frame: Float32Array) {
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = this.fftSize;
    const buffer = this.audioContext.createBuffer(1, frame.length, this.audioContext.sampleRate);
    buffer.copyToChannel(frame as Float32Array<ArrayBuffer>, 0);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    const frequencyData = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(frequencyData);
    const result: { real: number; imag: number }[] = [];
    for (let i = 0; i < frequencyData.length; i++) {
      const magnitude = Math.pow(10, frequencyData[i] / 20);
      result.push({ real: magnitude, imag: 0 });
    }
    return result;
  }

  private computeMagnitudes(spectrum: { real: number; imag: number }[]): Float32Array {
    const magnitudes = new Float32Array(spectrum.length);
    for (let i = 0; i < spectrum.length; i++) magnitudes[i] = Math.sqrt(spectrum[i].real ** 2 + spectrum[i].imag ** 2);
    return magnitudes;
  }

  private computeSpectralCentroid(magnitudes: Float32Array, sampleRate: number): number {
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      const frequency = (i * sampleRate) / (2 * magnitudes.length);
      numerator += frequency * magnitudes[i];
      denominator += magnitudes[i];
    }
    return denominator > 0 ? numerator / denominator : 0;
  }

  private computeSpectralRolloff(magnitudes: Float32Array, sampleRate: number): number {
    const totalEnergy = magnitudes.reduce((sum, mag) => sum + mag, 0);
    const threshold = 0.85 * totalEnergy;
    let cumulativeEnergy = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      cumulativeEnergy += magnitudes[i];
      if (cumulativeEnergy >= threshold) return (i * sampleRate) / (2 * magnitudes.length);
    }
    return sampleRate / 2;
  }

  private computeSpectralFlux(current: Float32Array, previous: Float32Array): number {
    let flux = 0;
    for (let i = 0; i < Math.min(current.length, previous.length); i++) {
      const diff = current[i] - previous[i];
      flux += diff > 0 ? diff : 0;
    }
    return flux;
  }

  private computeMFCC(magnitudes: Float32Array, sampleRate: number): number[] {
    const melBands = 13;
    const melFilters = this.createMelFilterBank(magnitudes.length, sampleRate, melBands);
    const melSpectrum = new Float32Array(melBands);
    for (let i = 0; i < melBands; i++) {
      for (let j = 0; j < magnitudes.length; j++) melSpectrum[i] += magnitudes[j] * melFilters[i][j];
      melSpectrum[i] = Math.log(melSpectrum[i] + 1e-10);
    }
    const mfcc: number[] = [];
    for (let i = 0; i < melBands; i++) {
      let coeff = 0;
      for (let j = 0; j < melBands; j++) coeff += melSpectrum[j] * Math.cos((Math.PI * i * (j + 0.5)) / melBands);
      mfcc.push(coeff);
    }
    return mfcc;
  }

  private computeChromaVector(magnitudes: Float32Array, sampleRate: number): number[] {
    const chroma = new Array(12).fill(0);
    for (let i = 1; i < magnitudes.length; i++) {
      const frequency = (i * sampleRate) / (2 * magnitudes.length);
      chroma[this.frequencyToPitchClass(frequency)] += magnitudes[i];
    }
    const sum = chroma.reduce((a, b) => a + b, 0);
    return sum > 0 ? chroma.map((c) => c / sum) : chroma;
  }

  private computeRMS(frame: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] ** 2;
    return Math.sqrt(sum / frame.length);
  }

  private computeZeroCrossingRate(frame: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < frame.length; i++) {
      if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) crossings++;
    }
    return crossings / frame.length;
  }

  private computeEnergy(frame: Float32Array): number {
    let energy = 0;
    for (let i = 0; i < frame.length; i++) energy += frame[i] ** 2;
    return energy;
  }

  private async detectOnsets(audioData: Float32Array, sampleRate: number): Promise<number[]> {
    const onsets: number[] = [];
    const frameSize = Math.floor(sampleRate * 0.05);
    const hopSize = Math.floor(frameSize / 4);
    let previousEnergy = 0;
    for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
      const frame = audioData.slice(i, i + frameSize);
      const energy = this.computeEnergy(frame);
      if (energy > previousEnergy * 1.5 && energy > 0.01) onsets.push(i / sampleRate);
      previousEnergy = energy;
    }
    return onsets;
  }

  private estimateTempo(onsets: number[], _sampleRate: number): { bpm: number; confidence: number } {
    if (onsets.length < 2) return { bpm: 120, confidence: 0 };
    const intervals: number[] = [];
    for (let i = 1; i < onsets.length; i++) intervals.push(onsets[i] - onsets[i - 1]);
    const intervalCounts = new Map<number, number>();
    for (const interval of intervals) {
      const quantized = Math.round(interval * 10) / 10;
      intervalCounts.set(quantized, (intervalCounts.get(quantized) || 0) + 1);
    }
    let bestInterval = 0.5;
    let maxCount = 0;
    for (const [interval, count] of intervalCounts) {
      if (count > maxCount && interval > 0.2 && interval < 2.0) {
        maxCount = count;
        bestInterval = interval;
      }
    }
    return { bpm: Math.round(60 / bestInterval), confidence: maxCount / intervals.length };
  }

  private trackBeats(onsets: number[], bpm: number, _sampleRate: number): number[] {
    const beatInterval = 60 / bpm;
    const beats: number[] = [];
    if (onsets.length === 0) {
      for (let time = 0; time < 60; time += beatInterval) beats.push(time);
    } else {
      let currentTime = onsets[0];
      beats.push(currentTime);
      while (currentTime < onsets[onsets.length - 1]) {
        currentTime += beatInterval;
        beats.push(currentTime);
      }
    }
    return beats;
  }

  private detectDownbeats(beats: number[], _bpm: number): number[] {
    const downbeats: number[] = [];
    for (let i = 0; i < beats.length; i += 4) {
      if (beats[i]) downbeats.push(beats[i]);
    }
    return downbeats;
  }

  private autocorrelationPitch(frame: Float32Array, sampleRate: number): { frequency: number; confidence: number } {
    const minPeriod = Math.floor(sampleRate / 800);
    const maxPeriod = Math.floor(sampleRate / 80);
    let maxCorrelation = 0;
    let bestPeriod = 0;
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let correlation = 0;
      let count = 0;
      for (let i = 0; i < frame.length - period; i++) {
        correlation += frame[i] * frame[i + period];
        count++;
      }
      correlation /= count;
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestPeriod = period;
      }
    }
    return { frequency: bestPeriod > 0 ? sampleRate / bestPeriod : 0, confidence: maxCorrelation };
  }

  private frequencyToPitchClass(frequency: number): number {
    if (frequency <= 0) return 0;
    return (Math.floor(12 * Math.log2(frequency / 440)) % 12 + 12) % 12;
  }

  private frequencyToOctave(frequency: number): number {
    if (frequency <= 0) return 4;
    return Math.floor((12 * Math.log2(frequency / 440)) / 12) + 4;
  }

  private detectHarmonics(fundamental: number, _audioData: Float32Array, sampleRate: number): number[] {
    const harmonics: number[] = [];
    for (let harmonic = 2; harmonic <= 8; harmonic++) {
      const harmonicFreq = fundamental * harmonic;
      if (harmonicFreq < sampleRate / 2) harmonics.push(harmonicFreq);
    }
    return harmonics;
  }

  private calculateHarmonicity(harmonics: number[]): number {
    return harmonics.length / 8;
  }

  private calculateInharmonicity(harmonics: number[]): number {
    return 1 - this.calculateHarmonicity(harmonics);
  }

  private calculateTonalCentroid(chromaVectors: number[][]): number[] {
    if (chromaVectors.length === 0) return new Array(6).fill(0);
    const avgChroma = new Array(12).fill(0);
    for (const chroma of chromaVectors) {
      for (let i = 0; i < 12; i++) avgChroma[i] += chroma[i];
    }
    for (let i = 0; i < 12; i++) avgChroma[i] /= chromaVectors.length;
    const centroid = new Array(6).fill(0);
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      centroid[0] += avgChroma[i] * Math.cos(angle);
      centroid[1] += avgChroma[i] * Math.sin(angle);
    }
    return centroid;
  }

  private createMelFilterBank(fftSize: number, sampleRate: number, numBands: number): number[][] {
    const filters: number[][] = [];
    for (let i = 0; i < numBands; i++) {
      const filter = new Array(fftSize).fill(0);
      const centerFreq = ((i + 1) * sampleRate) / (2 * numBands);
      const centerBin = Math.floor((centerFreq * fftSize * 2) / sampleRate);
      const bandwidth = Math.floor(fftSize / numBands);
      for (let j = Math.max(0, centerBin - bandwidth); j < Math.min(fftSize, centerBin + bandwidth); j++) {
        filter[j] = Math.max(0, 1 - Math.abs(j - centerBin) / bandwidth);
      }
      filters.push(filter);
    }
    return filters;
  }

  private correlateWithProfile(chroma: number[], profile: number[], root: number): number {
    let correlation = 0;
    for (let i = 0; i < 12; i++) correlation += chroma[i] * profile[(i + root) % 12];
    return correlation;
  }
}
