/**
 * VisualTunerPanel — microphone pitch tuner with ember/ice styling.
 */
import { Mic, MicOff, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getFreqName } from "../../utils/musicTheory";
import { cn } from "../../utils/cn";
import { getTool } from "../../data/toolCatalog";
import { ToolNicknameBadge } from "../hub/ToolNicknameBadge";
import { PanelHeader, SectionLabel } from "../ui";

const REFERENCE_PITCHES = [
  { label: "E2", freq: 82.41 },
  { label: "A2", freq: 110.0 },
  { label: "D3", freq: 146.83 },
  { label: "G3", freq: 196.0 },
  { label: "B3", freq: 246.94 },
  { label: "E4", freq: 329.63 },
];

function autocorrelate(buffer: Float32Array, sampleRate: number): number {
  let bestOffset = -1;
  let bestCorr = 0;
  const minOffset = Math.floor(sampleRate / 1000);
  const maxOffset = Math.floor(sampleRate / 60);

  for (let offset = minOffset; offset < maxOffset; offset++) {
    let corr = 0;
    for (let i = 0; i < maxOffset; i++) {
      corr += Math.abs(buffer[i] - buffer[i + offset]);
    }
    corr = 1 - corr / maxOffset;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = offset;
    }
  }

  if (bestOffset <= 0 || bestCorr < 0.9) return 0;
  return sampleRate / bestOffset;
}

export interface VisualTunerPanelProps {
  onGoToEditor?: () => void;
}

export function VisualTunerPanel({ onGoToEditor }: VisualTunerPanelProps) {
  const tunerTool = getTool("tuner");
  const [active, setActive] = useState(false);
  const [freq, setFreq] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setActive(false);
    setFreq(0);
    setLevel(0);
  }, []);

  const startMic = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      ctxRef.current = ctx;
      streamRef.current = stream;

      const buffer = new Float32Array(analyser.fftSize);

      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        setLevel(Math.min(1, rms * 8));

        const detected = autocorrelate(buffer, ctx.sampleRate);
        if (detected > 0) setFreq(detected);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setActive(true);
    } catch {
      setError("Microphone access denied or unavailable.");
    }
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  const noteInfo = freq > 0 ? getFreqName(freq) : null;
  const cents = noteInfo?.cents ?? 0;
  const needleRotation = Math.max(-45, Math.min(45, cents * 0.45));

  return (
    <div className="ui-panel overflow-hidden" data-testid="visual-tuner-panel">
      <PanelHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-xs">
            {tunerTool.primaryName}
            {tunerTool.nickname ? <ToolNicknameBadge nickname={tunerTool.nickname} /> : null}
          </span>
        }
        subtitle={tunerTool.panelSubtitle ?? tunerTool.description}
      />

      <div className="p-md">
        <SectionLabel>Input</SectionLabel>
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <button
            type="button"
            onClick={() => (active ? stopMic() : void startMic())}
            className={cn(
              "inline-flex items-center gap-xs rounded-lg border px-md py-sm text-sm font-medium transition",
              active
                ? "border-primary-400/40 bg-primary-500/15 text-primary-200"
                : "border-accent-midi/30 bg-accent-midi/10 text-accent-midi-200 hover:bg-accent-midi/20",
            )}
          >
            {active ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {active ? "Stop mic" : "Start mic"}
          </button>
          {error && <p className="text-xs text-destructive-300">{error}</p>}
        </div>

        <div className="mt-lg flex flex-col items-center">
          <div
            className="relative h-40 w-64 rounded-t-full border border-primary-400/25 bg-gradient-to-b from-primary-950/40 to-muted/60"
            aria-live="polite"
          >
            <div className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden rounded-t-full">
              <div
                className="absolute bottom-0 left-1/2 h-[90%] w-0.5 origin-bottom bg-gradient-to-t from-primary-400 to-warning-300 transition-transform duration-75"
                style={{ transform: `translateX(-50%) rotate(${needleRotation}deg)` }}
              />
            </div>
            <div className="absolute inset-x-0 bottom-2 text-center">
              {noteInfo ? (
                <>
                  <p className="text-3xl font-bold text-accent-midi-100">
                    {noteInfo.note}
                    <span className="text-lg text-accent-midi-300">{noteInfo.octave}</span>
                  </p>
                  <p className="text-sm tabular-nums text-warning-300">
                    {cents >= 0 ? "+" : ""}
                    {cents.toFixed(0)} cents
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">{freq.toFixed(1)} Hz</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {active ? "Listening…" : "Start mic to tune"}
                </p>
              )}
            </div>
          </div>

          <div className="mt-sm h-2 w-64 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-accent-midi-400 to-primary-400 transition-all duration-75"
              style={{ width: `${level * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-lg">
          <SectionLabel>Reference pitches</SectionLabel>
          <div className="mt-sm flex flex-wrap gap-xs">
            {REFERENCE_PITCHES.map((ref) => (
              <button
                key={ref.label}
                type="button"
                onClick={() => {
                  const ctx = new AudioContext();
                  const osc = ctx.createOscillator();
                  osc.frequency.value = ref.freq;
                  osc.connect(ctx.destination);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.6);
                }}
                className="rounded-md border border-accent-midi/25 bg-accent-midi/10 px-sm py-1 text-xs font-medium text-accent-midi-200 hover:bg-accent-midi/20"
              >
                {ref.label}
              </button>
            ))}
          </div>
        </div>

        {onGoToEditor && (
          <div className="mt-lg border-t border-border/60 pt-md">
            <button
              type="button"
              onClick={onGoToEditor}
              className="inline-flex items-center gap-xs rounded-lg border border-primary-400/35 bg-primary-500/15 px-md py-sm text-sm font-medium text-primary-200 hover:bg-primary-500/25"
            >
              Open MIDI editor
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
