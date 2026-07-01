import { useCallback, useMemo, useState } from "react";
import { Brain, Activity, Music, Zap, Radio, Waves } from "lucide-react";
import { useAudio } from "@/contexts/AudioContext";
import { AudioAnalysisEngine } from "@/intelligence/AudioAnalysisEngine";
import type { AudioFeatures } from "@/intelligence/AudioAnalysisEngine";
import { BPMDetector } from "@/intelligence/BPMDetector";
import type { BPMAnalysis } from "@/intelligence/BPMDetector";
import { KeyDetector } from "@/intelligence/KeyDetector";
import type { KeyDetectionResult } from "@/intelligence/KeyDetector";
import { GenreClassifier } from "@/intelligence/GenreClassifier";
import type { GenreClassification } from "@/intelligence/GenreClassifier";
import { MoodAnalyzer } from "@/intelligence/MoodAnalyzer";
import type { MoodAnalysis } from "@/intelligence/MoodAnalyzer";

type AnalysisState = "idle" | "analyzing" | "done" | "error";
type AnalysisResults = {
  audioFeatures: AudioFeatures;
  bpm: BPMAnalysis;
  key: KeyDetectionResult;
  genre: GenreClassification;
  mood: MoodAnalysis;
};

export interface AudioIntelligencePanelProps {
  onClose?: () => void;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">{title}</h3>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const hue = value > 0.7 ? 140 : value > 0.4 ? 45 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: `oklch(0.6 ${hue === 140 ? 0.15 : hue === 45 ? 0.12 : 0.14} ${hue})` }}
        />
      </div>
      <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function GenreTag({ label, confidence }: { label: string; confidence?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-secondary-foreground">
      {label}
      {confidence !== undefined && (
        <span className="text-[10px] text-muted-foreground">{(confidence * 100).toFixed(0)}%</span>
      )}
    </span>
  );
}

export function AudioIntelligencePanel({ onClose: _onClose }: AudioIntelligencePanelProps) {
  const audio = useAudio();
  const [state, setState] = useState<AnalysisState>("idle");
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engine = useMemo(() => new AudioAnalysisEngine(), []);
  const bpmDetector = useMemo(() => new BPMDetector(), []);
  const keyDetector = useMemo(() => new KeyDetector(), []);
  const genreClassifier = useMemo(() => new GenreClassifier(), []);
  const moodAnalyzer = useMemo(() => new MoodAnalyzer(), []);

  const hasAudio = Object.keys(audio.stemBuffers).length > 0;
  const firstBuffer = useMemo(() => {
    const buffers = Object.values(audio.stemBuffers);
    return buffers[0] ?? null;
  }, [audio.stemBuffers]);

  const handleAnalyze = useCallback(async () => {
    if (!firstBuffer) return;
    setState("analyzing");
    setError(null);
    try {
      const [audioFeatures, bpm] = await Promise.all([
        engine.analyzeAudio(firstBuffer),
        bpmDetector.analyzeBPM(firstBuffer),
      ]);
      const key = keyDetector.detectKeyFromChroma(audioFeatures.chromaVector[0] ?? new Array(12).fill(1 / 12));
      const genre = genreClassifier.classifyGenre(audioFeatures);
      const mood = moodAnalyzer.analyzeMood(audioFeatures, genre, bpm);
      setResults({ audioFeatures, bpm, key, genre, mood });
      setState("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setState("error");
    }
  }, [firstBuffer, engine, bpmDetector, keyDetector, genreClassifier, moodAnalyzer]);

  const analyzeDisabled = state === "analyzing" || !hasAudio;

  return (
    <div data-testid="audio-intelligence-panel" className="space-y-5">
      {!hasAudio && (
        <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground text-center gap-2">
          <Waves size={32} className="text-white/20" aria-hidden />
          <p>Load audio first</p>
        </div>
      )}

      {hasAudio && state === "idle" && (
        <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground text-center gap-4">
          <Radio size={32} className="text-white/20" aria-hidden />
          <p>Analyze your track to detect<br />BPM, key, genre, and mood</p>
          <button
            type="button"
            onClick={handleAnalyze}
            className="inline-flex items-center gap-2 rounded-lg bg-primary/20 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/30"
          >
            <Zap size={16} />
            Analyze Track
          </button>
        </div>
      )}

      {state === "analyzing" && (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm text-secondary-foreground">Analyzing...</p>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
          <p className="text-sm text-red-400">{error || "Analysis failed"}</p>
          <button
            type="button"
            onClick={handleAnalyze}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/20 hover:text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      {state === "done" && results && (
        <>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzeDisabled}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary/20 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/30 disabled:opacity-50"
          >
            <Zap size={16} />
            {analyzeDisabled ? "Analyzing..." : "Re-analyze"}
          </button>

          <section>
            <SectionHeader title="Tempo & Rhythm" />
            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={Activity} label="BPM" value={`${results.bpm.bpm}`} sub={`${results.bpm.timeSignature.numerator}/${results.bpm.timeSignature.denominator}`} />
              <StatCard icon={Brain} label="Stability" value={`${(results.bpm.tempoStability * 100).toFixed(0)}%`} sub={results.bpm.rhythmPattern.groove} />
            </div>
            <div className="mt-2">
               <p className="mb-1 text-[11px] text-muted-foreground">Confidence</p>
              <ConfidenceBar value={results.bpm.confidence} />
            </div>
          </section>

          <section>
            <SectionHeader title="Key & Harmony" />
            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={Music} label="Key" value={`${results.key.key} ${results.key.mode}`} />
              <StatCard icon={Brain} label="Confidence" value={`${(results.key.confidence * 100).toFixed(0)}%`} />
            </div>
            {results.key.alternativeKeys.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {results.key.alternativeKeys.slice(0, 3).map((alt) => (
                  <GenreTag key={`${alt.key}-${alt.mode}`} label={`${alt.key} ${alt.mode}`} confidence={alt.confidence} />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeader title="Genre" />
            <div className="mb-2 flex flex-wrap gap-1.5">
              <GenreTag label={results.genre.genre} confidence={results.genre.confidence} />
              {results.genre.subgenre && <GenreTag label={results.genre.subgenre} />}
            </div>
            {results.genre.characteristics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {results.genre.characteristics.map((c) => (
                   <span key={c} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] text-secondary-foreground">{c}</span>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeader title="Mood & Energy" />
            <div className="mb-2">
              <StatCard icon={Zap} label="Primary Mood" value={results.mood.primaryMood} sub={results.mood.secondaryMood ? `Also: ${results.mood.secondaryMood}` : undefined} />
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <StatCard icon={Zap} label="Energy" value={results.mood.energy.category.replace("-", " ")} sub={`${results.mood.energy.level.toFixed(0)}%`} />
              <StatCard icon={Brain} label="Valence" value={results.mood.valence.category.replace("-", " ")} sub={`${results.mood.valence.level.toFixed(0)}%`} />
              <StatCard icon={Activity} label="Arousal" value={results.mood.arousal.category.replace("-", " ")} sub={`${results.mood.arousal.level.toFixed(0)}%`} />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {results.mood.musicalCharacteristics.keyMood} &middot; {results.mood.musicalCharacteristics.tempoMood}
            </p>
          </section>

          {results.mood.recommendations.length > 0 && (
            <section>
              <SectionHeader title="Suggestions" />
              <ul className="space-y-1.5">
                {results.mood.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md bg-white/[0.03] px-3 py-2 text-xs text-secondary-foreground">
                    <span className="mt-0.5 text-primary">&bull;</span>
                    <span>{r.suggestion}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
