import type { AudioFeatures } from "./AudioAnalysisEngine";

export interface GenreClassification {
  genre: string;
  confidence: number;
  subgenre?: string;
  characteristics: string[];
  reasoning: string[];
}

export interface GenreProfile {
  name: string;
  tempoRange: [number, number];
  keyPreferences: string[];
  modePreference: "major" | "minor" | "both";
  spectralCharacteristics: { brightness: [number, number]; harmonicity: [number, number]; dynamicRange: [number, number] };
  rhythmicFeatures: { syncopation: number; complexity: number; steadiness: number };
  instrumentalFeatures: { bassPresence: number; percussionStrength: number; harmonicComplexity: number };
}

export class GenreClassifier {
  private genreProfiles = new Map<string, GenreProfile>();

  constructor() {
    this.initializeGenreProfiles();
  }

  classifyGenre(features: AudioFeatures): GenreClassification {
    const scores = new Map<string, number>();
    const reasonings = new Map<string, string[]>();
    for (const [genreName, profile] of this.genreProfiles) {
      const { score, reasoning } = this.scoreGenre(features, profile);
      scores.set(genreName, score);
      reasonings.set(genreName, reasoning);
    }
    let bestGenre = "Unknown";
    let bestScore = 0;
    for (const [genre, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestGenre = genre;
      }
    }
    return { genre: bestGenre, confidence: Math.min(bestScore, 1), subgenre: this.detectSubgenre(features, bestGenre), characteristics: this.getGenreCharacteristics(features, bestGenre), reasoning: reasonings.get(bestGenre) || [] };
  }

  private scoreGenre(features: AudioFeatures, profile: GenreProfile): { score: number; reasoning: string[] } {
    let totalScore = 0;
    let maxScore = 0;
    const reasoning: string[] = [];
    const tempoScore = this.scoreTempoMatch(features.tempo, profile.tempoRange);
    totalScore += tempoScore * 0.25;
    maxScore += 0.25;
    if (tempoScore > 0.7) reasoning.push(`Tempo ${features.tempo} BPM matches ${profile.name} range`);
    const keyScore = this.scoreKeyMatch(features.key, features.mode, profile);
    totalScore += keyScore * 0.15;
    maxScore += 0.15;
    if (keyScore > 0.7) reasoning.push(`Key ${features.key} ${features.mode} typical for ${profile.name}`);
    const spectralScore = this.scoreSpectralMatch(features, profile.spectralCharacteristics);
    totalScore += spectralScore * 0.3;
    maxScore += 0.3;
    if (spectralScore > 0.7) reasoning.push(`Spectral characteristics match ${profile.name} profile`);
    const rhythmScore = this.scoreRhythmMatch(features, profile.rhythmicFeatures);
    totalScore += rhythmScore * 0.2;
    maxScore += 0.2;
    if (rhythmScore > 0.7) reasoning.push(`Rhythmic patterns typical of ${profile.name}`);
    const instrumentalScore = this.scoreInstrumentalMatch(features, profile.instrumentalFeatures);
    totalScore += instrumentalScore * 0.1;
    maxScore += 0.1;
    if (instrumentalScore > 0.7) reasoning.push(`Instrumental characteristics match ${profile.name}`);
    return { score: maxScore > 0 ? totalScore / maxScore : 0, reasoning };
  }

  private scoreTempoMatch(tempo: number, range: [number, number]): number {
    const [min, max] = range;
    if (tempo >= min && tempo <= max) return 1;
    const distance = Math.min(Math.abs(tempo - min), Math.abs(tempo - max));
    const tolerance = (max - min) * 0.2;
    return Math.max(0, 1 - distance / tolerance);
  }

  private scoreKeyMatch(key: string, mode: "major" | "minor", profile: GenreProfile): number {
    let score = 0;
    if (profile.modePreference === "both" || profile.modePreference === mode) score += 0.5;
    if (profile.keyPreferences.includes(key) || profile.keyPreferences.includes("any")) score += 0.5;
    return score;
  }

  private scoreSpectralMatch(features: AudioFeatures, spectral: GenreProfile["spectralCharacteristics"]): number {
    const avgCentroid = features.spectralCentroid.reduce((a, b) => a + b, 0) / features.spectralCentroid.length;
    let score = this.scoreRange(avgCentroid, spectral.brightness);
    score += this.scoreRange(features.harmonicity, spectral.harmonicity);
    score += this.scoreRange(features.dynamicRange, spectral.dynamicRange);
    return score / 3;
  }

  private scoreRhythmMatch(features: AudioFeatures, rhythmic: GenreProfile["rhythmicFeatures"]): number {
    const syncopation = this.calculateSyncopation(features);
    const complexity = this.calculateRhythmicComplexity(features);
    const steadiness = this.calculateRhythmicSteadiness(features);
    return (this.scoreValue(syncopation, rhythmic.syncopation, 0.3) + this.scoreValue(complexity, rhythmic.complexity, 0.3) + this.scoreValue(steadiness, rhythmic.steadiness, 0.3)) / 3;
  }

  private scoreInstrumentalMatch(features: AudioFeatures, instrumental: GenreProfile["instrumentalFeatures"]): number {
    const bass = this.calculateBassPresence(features);
    const percussion = this.calculatePercussionStrength(features);
    const harmonic = this.calculateHarmonicComplexity(features);
    return (this.scoreValue(bass, instrumental.bassPresence, 0.3) + this.scoreValue(percussion, instrumental.percussionStrength, 0.3) + this.scoreValue(harmonic, instrumental.harmonicComplexity, 0.3)) / 3;
  }

  private scoreRange(value: number, range: [number, number]): number {
    const [min, max] = range;
    if (value >= min && value <= max) return 1;
    const distance = Math.min(Math.abs(value - min), Math.abs(value - max));
    const tolerance = (max - min) * 0.2;
    return Math.max(0, 1 - distance / tolerance);
  }

  private scoreValue(actual: number, expected: number, tolerance: number): number {
    return Math.max(0, 1 - Math.abs(actual - expected) / tolerance);
  }

  private calculateSyncopation(features: AudioFeatures): number {
    if (features.spectralFlux.length === 0) return 0;
    const mean = features.spectralFlux.reduce((a, b) => a + b, 0) / features.spectralFlux.length;
    const variance = features.spectralFlux.reduce((sum, val) => sum + (val - mean) ** 2, 0) / features.spectralFlux.length;
    return Math.min(1, variance / 1000);
  }

  private calculateRhythmicComplexity(features: AudioFeatures): number {
    if (features.zeroCrossingRate.length === 0) return 0;
    const mean = features.zeroCrossingRate.reduce((a, b) => a + b, 0) / features.zeroCrossingRate.length;
    const variance = features.zeroCrossingRate.reduce((sum, val) => sum + (val - mean) ** 2, 0) / features.zeroCrossingRate.length;
    return Math.min(1, variance * 1000);
  }

  private calculateRhythmicSteadiness(features: AudioFeatures): number {
    const energyVariance = this.calculateEnergyVariance(features.energyProfile);
    return Math.max(0, Math.min(1, features.tempoConfidence * (1 - energyVariance)));
  }

  private calculateBassPresence(features: AudioFeatures): number {
    const avgCentroid = features.spectralCentroid.reduce((a, b) => a + b, 0) / features.spectralCentroid.length;
    return Math.max(0, Math.min(1, 1 - avgCentroid / 2000));
  }

  private calculatePercussionStrength(features: AudioFeatures): number {
    const avgFlux = features.spectralFlux.reduce((a, b) => a + b, 0) / features.spectralFlux.length;
    const avgZCR = features.zeroCrossingRate.reduce((a, b) => a + b, 0) / features.zeroCrossingRate.length;
    return Math.min(1, (avgFlux / 100 + avgZCR * 10) / 2);
  }

  private calculateHarmonicComplexity(features: AudioFeatures): number {
    const tonalVariance = this.calculateTonalVariance(features.tonalCentroid);
    return Math.min(1, features.inharmonicity + tonalVariance);
  }

  private calculateEnergyVariance(energyProfile: number[]): number {
    if (energyProfile.length === 0) return 0;
    const mean = energyProfile.reduce((a, b) => a + b, 0) / energyProfile.length;
    const variance = energyProfile.reduce((sum, val) => sum + (val - mean) ** 2, 0) / energyProfile.length;
    return Math.min(1, variance / (mean * mean + 1e-10));
  }

  private calculateTonalVariance(tonalCentroid: number[]): number {
    if (tonalCentroid.length === 0) return 0;
    const mean = tonalCentroid.reduce((a, b) => a + b, 0) / tonalCentroid.length;
    const variance = tonalCentroid.reduce((sum, val) => sum + (val - mean) ** 2, 0) / tonalCentroid.length;
    return Math.min(1, variance);
  }

  private getGenreCharacteristics(features: AudioFeatures, _genre: string): string[] {
    const char: string[] = [];
    if (features.tempo < 80) char.push("Slow tempo");
    else if (features.tempo > 140) char.push("Fast tempo");
    else char.push("Moderate tempo");
    char.push(`${features.key} ${features.mode}`);
    if (features.loudness > 0.7) char.push("High energy");
    else if (features.loudness < 0.3) char.push("Low energy");
    else char.push("Moderate energy");
    char.push(features.dynamicRange > 0.5 ? "Dynamic" : "Compressed");
    return char;
  }

  private detectSubgenre(features: AudioFeatures, mainGenre: string): string | undefined {
    const rules: Record<string, Record<string, (f: AudioFeatures) => boolean>> = {
      Electronic: {
        House: (f) => f.tempo >= 120 && f.tempo <= 130,
        Techno: (f) => f.tempo >= 130 && f.tempo <= 150,
        Dubstep: (f) => f.tempo >= 140 && f.tempo <= 150 && f.dynamicRange > 0.6,
        Ambient: (f) => f.tempo < 100 && f.loudness < 0.4,
      },
      Rock: {
        "Hard Rock": (f) => f.loudness > 0.7 && f.dynamicRange > 0.5,
        Alternative: (f) => f.mode === "minor" && f.harmonicity < 0.6,
        "Classic Rock": (f) => f.tempo >= 110 && f.tempo <= 140,
      },
      "Hip Hop": {
        Trap: (f) => f.tempo >= 140 && f.tempo <= 180,
        "Boom Bap": (f) => f.tempo >= 80 && f.tempo <= 100,
        Drill: (f) => f.tempo >= 130 && f.tempo <= 150 && f.mode === "minor",
      },
    };
    const genreRules = rules[mainGenre];
    if (!genreRules) return undefined;
    for (const [subgenre, rule] of Object.entries(genreRules)) {
      if (rule(features)) return subgenre;
    }
    return undefined;
  }

  private initializeGenreProfiles(): void {
    const profiles: GenreProfile[] = [
      { name: "Electronic", tempoRange: [100, 180], keyPreferences: ["any"], modePreference: "both", spectralCharacteristics: { brightness: [2000, 8000], harmonicity: [0.3, 0.8], dynamicRange: [0.3, 0.9] }, rhythmicFeatures: { syncopation: 0.6, complexity: 0.7, steadiness: 0.8 }, instrumentalFeatures: { bassPresence: 0.8, percussionStrength: 0.9, harmonicComplexity: 0.6 } },
      { name: "Rock", tempoRange: [100, 160], keyPreferences: ["E", "A", "D", "G", "C"], modePreference: "both", spectralCharacteristics: { brightness: [1500, 6000], harmonicity: [0.5, 0.9], dynamicRange: [0.4, 0.8] }, rhythmicFeatures: { syncopation: 0.4, complexity: 0.5, steadiness: 0.7 }, instrumentalFeatures: { bassPresence: 0.7, percussionStrength: 0.8, harmonicComplexity: 0.7 } },
      { name: "Hip Hop", tempoRange: [70, 150], keyPreferences: ["any"], modePreference: "minor", spectralCharacteristics: { brightness: [1000, 5000], harmonicity: [0.4, 0.8], dynamicRange: [0.5, 0.9] }, rhythmicFeatures: { syncopation: 0.8, complexity: 0.6, steadiness: 0.6 }, instrumentalFeatures: { bassPresence: 0.9, percussionStrength: 0.9, harmonicComplexity: 0.5 } },
      { name: "Pop", tempoRange: [100, 140], keyPreferences: ["C", "G", "D", "A", "F"], modePreference: "major", spectralCharacteristics: { brightness: [1500, 5000], harmonicity: [0.6, 0.9], dynamicRange: [0.3, 0.7] }, rhythmicFeatures: { syncopation: 0.3, complexity: 0.4, steadiness: 0.8 }, instrumentalFeatures: { bassPresence: 0.6, percussionStrength: 0.7, harmonicComplexity: 0.6 } },
      { name: "Jazz", tempoRange: [60, 200], keyPreferences: ["Bb", "F", "C", "G", "D"], modePreference: "both", spectralCharacteristics: { brightness: [1000, 6000], harmonicity: [0.7, 0.95], dynamicRange: [0.6, 0.9] }, rhythmicFeatures: { syncopation: 0.9, complexity: 0.8, steadiness: 0.5 }, instrumentalFeatures: { bassPresence: 0.7, percussionStrength: 0.6, harmonicComplexity: 0.9 } },
      { name: "Classical", tempoRange: [40, 180], keyPreferences: ["C", "G", "D", "A", "F", "Bb", "Eb"], modePreference: "both", spectralCharacteristics: { brightness: [800, 4000], harmonicity: [0.8, 0.98], dynamicRange: [0.7, 0.95] }, rhythmicFeatures: { syncopation: 0.2, complexity: 0.6, steadiness: 0.7 }, instrumentalFeatures: { bassPresence: 0.5, percussionStrength: 0.3, harmonicComplexity: 0.9 } },
      { name: "Reggae", tempoRange: [60, 90], keyPreferences: ["any"], modePreference: "both", spectralCharacteristics: { brightness: [1000, 4000], harmonicity: [0.6, 0.85], dynamicRange: [0.4, 0.7] }, rhythmicFeatures: { syncopation: 0.7, complexity: 0.5, steadiness: 0.8 }, instrumentalFeatures: { bassPresence: 0.9, percussionStrength: 0.7, harmonicComplexity: 0.5 } },
      { name: "Country", tempoRange: [80, 140], keyPreferences: ["G", "C", "D", "A", "E"], modePreference: "major", spectralCharacteristics: { brightness: [1200, 5000], harmonicity: [0.7, 0.9], dynamicRange: [0.4, 0.8] }, rhythmicFeatures: { syncopation: 0.3, complexity: 0.4, steadiness: 0.8 }, instrumentalFeatures: { bassPresence: 0.6, percussionStrength: 0.6, harmonicComplexity: 0.6 } },
    ];
    for (const p of profiles) this.genreProfiles.set(p.name, p);
  }
}
