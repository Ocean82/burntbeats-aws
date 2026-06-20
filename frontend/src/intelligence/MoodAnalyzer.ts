import type { AudioFeatures } from "./AudioAnalysisEngine";
import type { GenreClassification } from "./GenreClassifier";
import type { BPMAnalysis } from "./BPMDetector";

export interface EnergyProfile {
  level: number;
  category: "very-low" | "low" | "medium" | "high" | "very-high";
  dynamics: "static" | "building" | "declining" | "fluctuating";
  intensity: number;
  drive: number;
}

export interface ValenceProfile {
  level: number;
  category: "very-negative" | "negative" | "neutral" | "positive" | "very-positive";
  emotional_tone: "dark" | "melancholic" | "neutral" | "uplifting" | "euphoric";
}

export interface ArousalProfile {
  level: number;
  category: "very-calm" | "calm" | "moderate" | "excited" | "very-excited";
  tension: number;
  urgency: number;
}

export interface EmotionScores {
  happiness: number;
  sadness: number;
  anger: number;
  fear: number;
  surprise: number;
  excitement: number;
  relaxation: number;
  nostalgia: number;
  romance: number;
  mystery: number;
  triumph: number;
  melancholy: number;
  aggression: number;
  serenity: number;
}

export interface MoodAnalysis {
  primaryMood: string;
  secondaryMood?: string;
  confidence: number;
  energy: EnergyProfile;
  valence: ValenceProfile;
  arousal: ArousalProfile;
  emotions: EmotionScores;
  musicalCharacteristics: {
    keyMood: string;
    tempoMood: string;
    harmonicMood: string;
    rhythmicMood: string;
    spectralMood: string;
    dynamicMood: string;
  };
  recommendations: Array<{ type: string; suggestion: string; reasoning: string; confidence: number }>;
}

export class MoodAnalyzer {
  analyzeMood(audioFeatures: AudioFeatures, _genreInfo?: GenreClassification, bpmInfo?: BPMAnalysis): MoodAnalysis {
    const musicalFeatures = this.extractMusicalMoodFeatures(audioFeatures);
    const energy = this.analyzeEnergy(audioFeatures, bpmInfo);
    const valence = this.analyzeValence(audioFeatures, musicalFeatures);
    const arousal = this.analyzeArousal(audioFeatures, energy);
    const emotions = this.calculateEmotionScores(audioFeatures, energy, valence, arousal);
    const { primaryMood, secondaryMood, confidence } = this.determineMoods(emotions, energy, valence, arousal);
    const recommendations = this.generateMoodRecommendations(primaryMood, emotions, musicalFeatures);
    return { primaryMood, secondaryMood, confidence, energy, valence, arousal, emotions, musicalCharacteristics: musicalFeatures, recommendations };
  }

  private extractMusicalMoodFeatures(features: AudioFeatures) {
    return {
      keyMood: this.analyzeKeyMood(features.key, features.mode),
      tempoMood: this.analyzeTempoMood(features.tempo),
      harmonicMood: this.analyzeHarmonicMood(features.harmonicity, features.inharmonicity),
      rhythmicMood: this.analyzeRhythmicMood(features),
      spectralMood: this.analyzeSpectralMood(features.spectralCentroid),
      dynamicMood: this.analyzeDynamicMood(features.dynamicRange, features.loudness),
    };
  }

  private analyzeEnergy(features: AudioFeatures, bpmInfo?: BPMAnalysis): EnergyProfile {
    const tempoEnergy = Math.min(100, ((features.tempo - 60) / 140) * 100);
    const loudnessEnergy = features.loudness * 100;
    const avgCentroid = features.spectralCentroid.reduce((a, b) => a + b, 0) / features.spectralCentroid.length;
    const brightnessEnergy = Math.min(100, (avgCentroid / 3000) * 100);
    const dynamicEnergy = features.dynamicRange * 100;
    const rhythmicDrive = this.calculateRhythmicDrive(features);
    let energyScore = tempoEnergy * 0.3 + loudnessEnergy * 0.25 + brightnessEnergy * 0.2 + dynamicEnergy * 0.15 + rhythmicDrive * 0.1;
    let intensityScore = loudnessEnergy * 0.4 + dynamicEnergy * 0.3;
    let driveScore = rhythmicDrive * 0.7;
    if (bpmInfo) driveScore += bpmInfo.tempoStability * 30;
    const avgFlux = features.spectralFlux.reduce((a, b) => a + b, 0) / features.spectralFlux.length;
    intensityScore += Math.min(30, avgFlux * 1000);
    energyScore = Math.max(0, Math.min(100, energyScore));
    intensityScore = Math.max(0, Math.min(100, intensityScore));
    driveScore = Math.max(0, Math.min(100, driveScore));
    let category: EnergyProfile["category"];
    if (energyScore < 20) category = "very-low";
    else if (energyScore < 40) category = "low";
    else if (energyScore < 60) category = "medium";
    else if (energyScore < 80) category = "high";
    else category = "very-high";
    const energyVariance = this.calculateEnergyVariance(features.energyProfile);
    let dynamics: EnergyProfile["dynamics"];
    if (energyVariance < 0.1) dynamics = "static";
    else if (this.isEnergyBuilding(features.energyProfile)) dynamics = "building";
    else if (this.isEnergyDeclining(features.energyProfile)) dynamics = "declining";
    else dynamics = "fluctuating";
    return { level: energyScore, category, dynamics, intensity: intensityScore, drive: driveScore };
  }

  private analyzeValence(features: AudioFeatures, _musicalFeatures: { keyMood: string }): ValenceProfile {
    let valenceScore = 50;
    if (features.mode === "major") valenceScore += 25;
    else valenceScore -= 25;
    if (features.tempo > 120) valenceScore += ((features.tempo - 120) / 80) * 15;
    else if (features.tempo < 80) valenceScore -= ((80 - features.tempo) / 40) * 20;
    if (features.harmonicity > 0.7) valenceScore += 10;
    else if (features.harmonicity < 0.4) valenceScore -= 15;
    const avgCentroid = features.spectralCentroid.reduce((a, b) => a + b, 0) / features.spectralCentroid.length;
    if (avgCentroid > 2000) valenceScore += 10;
    else if (avgCentroid < 1000) valenceScore -= 10;
    if (features.dynamicRange > 0.6) valenceScore += 5;
    valenceScore = Math.max(0, Math.min(100, valenceScore));
    let category: ValenceProfile["category"];
    if (valenceScore < 20) category = "very-negative";
    else if (valenceScore < 40) category = "negative";
    else if (valenceScore < 60) category = "neutral";
    else if (valenceScore < 80) category = "positive";
    else category = "very-positive";
    let emotional_tone: ValenceProfile["emotional_tone"];
    if (valenceScore < 15) emotional_tone = "dark";
    else if (valenceScore < 35) emotional_tone = "melancholic";
    else if (valenceScore < 65) emotional_tone = "neutral";
    else if (valenceScore < 85) emotional_tone = "uplifting";
    else emotional_tone = "euphoric";
    return { level: valenceScore, category, emotional_tone };
  }

  private analyzeArousal(features: AudioFeatures, energy: EnergyProfile): ArousalProfile {
    let arousalScore = energy.level * 0.5;
    arousalScore += Math.min(100, (features.tempo / 180) * 100) * 0.25;
    let urgencyScore = Math.min(100, Math.max(0, features.tempo - 100));
    const avgFlux = features.spectralFlux.reduce((a, b) => a + b, 0) / features.spectralFlux.length;
    arousalScore += Math.min(100, avgFlux * 2000) * 0.15;
    const avgZCR = features.zeroCrossingRate.reduce((a, b) => a + b, 0) / features.zeroCrossingRate.length;
    arousalScore += Math.min(100, avgZCR * 5000) * 0.1;
    let tensionScore = (1 - features.harmonicity) * 60 + features.dynamicRange * 40;
    arousalScore = Math.max(0, Math.min(100, arousalScore));
    tensionScore = Math.max(0, Math.min(100, tensionScore));
    urgencyScore = Math.max(0, Math.min(100, urgencyScore));
    let category: ArousalProfile["category"];
    if (arousalScore < 20) category = "very-calm";
    else if (arousalScore < 40) category = "calm";
    else if (arousalScore < 60) category = "moderate";
    else if (arousalScore < 80) category = "excited";
    else category = "very-excited";
    return { level: arousalScore, category, tension: tensionScore, urgency: urgencyScore };
  }

  private calculateEmotionScores(features: AudioFeatures, energy: EnergyProfile, valence: ValenceProfile, arousal: ArousalProfile): EmotionScores {
    const emotions: EmotionScores = { happiness: 0, sadness: 0, anger: 0, fear: 0, surprise: 0, excitement: 0, relaxation: 0, nostalgia: 0, romance: 0, mystery: 0, triumph: 0, melancholy: 0, aggression: 0, serenity: 0 };
    emotions.happiness = Math.max(0, (valence.level - 50) * 2) * (arousal.level / 100);
    emotions.sadness = Math.max(0, (50 - valence.level) * 2) * (1 - arousal.level / 100);
    emotions.anger = Math.max(0, 40 - valence.level) * (arousal.level / 100) * (energy.level / 100);
    emotions.fear = Math.max(0, 45 - valence.level) * (arousal.level / 100) * (arousal.tension / 100);
    emotions.excitement = (arousal.level / 100) * (energy.level / 100) * 100;
    emotions.relaxation = (1 - arousal.level / 100) * Math.max(0, 1 - Math.abs(valence.level - 50) / 50) * 100;
    emotions.melancholy = Math.max(0, 50 - valence.level) * (1 - energy.level / 100);
    if (features.mode === "minor") emotions.melancholy *= 1.5;
    emotions.romance = Math.max(0, 1 - Math.abs(valence.level - 60) / 40) * Math.max(0, 1 - Math.abs(arousal.level - 30) / 30) * features.harmonicity * 100;
    emotions.triumph = (valence.level / 100) * (energy.level / 100) * 100;
    if (features.mode === "major") emotions.triumph *= 1.2;
    emotions.serenity = Math.max(0, 1 - Math.abs(valence.level - 55) / 45) * (1 - arousal.level / 100) * features.harmonicity * 100;
    emotions.aggression = Math.max(0, 45 - valence.level) * (energy.level / 100) * (arousal.level / 100);
    emotions.mystery = Math.max(0, (60 - valence.level) / 60) * Math.max(0, 1 - Math.abs(arousal.level - 50) / 50) * (1 - features.harmonicity) * 100;
    emotions.nostalgia = Math.max(0, 1 - Math.abs(valence.level - 45) / 45) * (1 - arousal.level / 100) * 100;
    emotions.surprise = (arousal.level / 100) * features.dynamicRange * 100;
    for (const key of Object.keys(emotions) as (keyof EmotionScores)[]) emotions[key] = Math.max(0, Math.min(100, emotions[key]));
    return emotions;
  }

  private determineMoods(emotions: EmotionScores, energy: EnergyProfile, valence: ValenceProfile, arousal: ArousalProfile): { primaryMood: string; secondaryMood?: string; confidence: number } {
    const emotionMoodMap: Record<string, number> = {
      Happy: emotions.happiness + emotions.excitement * 0.5,
      Sad: emotions.sadness + emotions.melancholy * 0.7,
      Energetic: energy.level + emotions.excitement * 0.5,
      Calm: emotions.relaxation + emotions.serenity * 0.8,
      Romantic: emotions.romance,
      Aggressive: emotions.aggression + emotions.anger * 0.8,
      Mysterious: emotions.mystery,
      Triumphant: emotions.triumph,
      Melancholic: emotions.melancholy + emotions.sadness * 0.5,
      Peaceful: emotions.serenity + emotions.relaxation * 0.6,
      Nostalgic: emotions.nostalgia,
      Tense: arousal.tension,
      Uplifting: emotions.happiness + (valence.level > 70 ? 20 : 0),
      Dark: valence.level < 30 ? (50 - valence.level) * 2 : 0,
      Bright: valence.level > 70 ? (valence.level - 50) * 2 : 0,
    };
    const moodCandidates: Array<{ mood: string; score: number }> = [];
    for (const [mood, score] of Object.entries(emotionMoodMap)) {
      if (score > 20) moodCandidates.push({ mood, score });
    }
    moodCandidates.sort((a, b) => b.score - a.score);
    if (moodCandidates.length === 0) return { primaryMood: "Neutral", confidence: 0.5 };
    const primaryMood = moodCandidates[0].mood;
    const secondaryMood = moodCandidates.length > 1 && moodCandidates[1].score > 30 ? moodCandidates[1].mood : undefined;
    const confidence = moodCandidates.length > 1 ? Math.min(1, (moodCandidates[0].score - moodCandidates[1].score) / 50) : Math.min(1, moodCandidates[0].score / 100);
    return { primaryMood, secondaryMood, confidence };
  }

  private generateMoodRecommendations(primaryMood: string, emotions: EmotionScores, _musicalFeatures: any) {
    const recommendations: Array<{ type: string; suggestion: string; reasoning: string; confidence: number }> = [];
    if (primaryMood === "Happy") recommendations.push({ type: "enhancement", suggestion: "Add bright, major chord progressions", reasoning: "Major chords enhance the positive emotional impact", confidence: 0.8 });
    if (primaryMood === "Sad") recommendations.push({ type: "enhancement", suggestion: "Use minor keys and slower tempos", reasoning: "Minor keys and slower tempos reinforce melancholic emotions", confidence: 0.9 });
    if (primaryMood === "Energetic") recommendations.push({ type: "enhancement", suggestion: "Increase rhythmic drive and dynamic range", reasoning: "Strong rhythms and dynamics enhance energy perception", confidence: 0.85 });
    if (emotions.happiness > 60) recommendations.push({ type: "complement", suggestion: "Consider adding rhythmic elements to enhance the joyful feeling", reasoning: "Rhythmic complexity can amplify positive emotions", confidence: 0.7 });
    return recommendations;
  }

  private analyzeKeyMood(key: string, mode: "major" | "minor"): string {
    const keyMoods: Record<string, { major: string; minor: string }> = {
      C: { major: "Pure, innocent", minor: "Melancholic, serious" },
      G: { major: "Bright, cheerful", minor: "Thoughtful, introspective" },
      D: { major: "Triumphant, joyful", minor: "Passionate, intense" },
      A: { major: "Confident, bold", minor: "Romantic, yearning" },
      E: { major: "Brilliant, sharp", minor: "Grief, despair" },
      F: { major: "Pastoral, gentle", minor: "Dark, brooding" },
      Bb: { major: "Noble, heroic", minor: "Mysterious, ominous" },
    };
    return keyMoods[key]?.[mode] || `${mode} tonality`;
  }

  private analyzeTempoMood(tempo: number): string {
    if (tempo < 60) return "Very slow, meditative";
    if (tempo < 80) return "Slow, relaxed";
    if (tempo < 100) return "Moderate, walking pace";
    if (tempo < 120) return "Comfortable, flowing";
    if (tempo < 140) return "Energetic, driving";
    if (tempo < 160) return "Fast, exciting";
    return "Very fast, intense";
  }

  private analyzeHarmonicMood(harmonicity: number, _inharmonicity: number): string {
    if (harmonicity > 0.8) return "Consonant, stable";
    if (harmonicity > 0.6) return "Mostly consonant";
    if (harmonicity > 0.4) return "Mixed consonance/dissonance";
    if (harmonicity > 0.2) return "Dissonant, tense";
    return "Very dissonant, unstable";
  }

  private analyzeRhythmicMood(features: AudioFeatures): string {
    const avgZCR = features.zeroCrossingRate.reduce((a, b) => a + b, 0) / features.zeroCrossingRate.length;
    if (avgZCR > 0.1) return "Complex, active";
    if (avgZCR > 0.05) return "Moderate complexity";
    return "Simple, steady";
  }

  private analyzeSpectralMood(spectralCentroid: number[]): string {
    const avg = spectralCentroid.reduce((a, b) => a + b, 0) / spectralCentroid.length;
    if (avg > 3000) return "Very bright, sharp";
    if (avg > 2000) return "Bright, clear";
    if (avg > 1000) return "Balanced, warm";
    if (avg > 500) return "Dark, mellow";
    return "Very dark, deep";
  }

  private analyzeDynamicMood(dynamicRange: number, _loudness: number): string {
    if (dynamicRange > 0.7) return "Very dynamic, expressive";
    if (dynamicRange > 0.5) return "Dynamic, varied";
    if (dynamicRange > 0.3) return "Moderately dynamic";
    if (dynamicRange > 0.1) return "Compressed, steady";
    return "Very compressed, flat";
  }

  private calculateRhythmicDrive(features: AudioFeatures): number {
    const avgFlux = features.spectralFlux.reduce((a, b) => a + b, 0) / features.spectralFlux.length;
    const avgZCR = features.zeroCrossingRate.reduce((a, b) => a + b, 0) / features.zeroCrossingRate.length;
    return Math.min(100, avgFlux * 1000 + avgZCR * 500);
  }

  private calculateEnergyVariance(energyProfile: number[]): number {
    if (energyProfile.length === 0) return 0;
    const mean = energyProfile.reduce((a, b) => a + b, 0) / energyProfile.length;
    const variance = energyProfile.reduce((sum, val) => sum + (val - mean) ** 2, 0) / energyProfile.length;
    return Math.min(1, variance / (mean * mean + 1e-10));
  }

  private isEnergyBuilding(energyProfile: number[]): boolean {
    if (energyProfile.length < 3) return false;
    const third = Math.floor(energyProfile.length / 3);
    const firstAvg = energyProfile.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const lastAvg = energyProfile.slice(-third).reduce((a, b) => a + b, 0) / third;
    return lastAvg > firstAvg * 1.2;
  }

  private isEnergyDeclining(energyProfile: number[]): boolean {
    if (energyProfile.length < 3) return false;
    const third = Math.floor(energyProfile.length / 3);
    const firstAvg = energyProfile.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const lastAvg = energyProfile.slice(-third).reduce((a, b) => a + b, 0) / third;
    return firstAvg > lastAvg * 1.2;
  }
}
