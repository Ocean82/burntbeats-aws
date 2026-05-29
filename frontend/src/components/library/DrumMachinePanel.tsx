/**
 * DrumMachinePanel — 16-step sequencer with Web Audio drum synth and MIDI export.
 */
import { Download, Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MidiNoteEvent } from "../../hooks/useMidiConvert";
import { downloadMidiBlob, exportNotesToMidi } from "../../utils/midiExport";
import { cn } from "../../utils/cn";
import { PanelHeader, SectionLabel } from "../ui";

const STEPS = 16;
const ROWS = [
  { id: "kick", label: "Kick", pitch: 36, freq: 60 },
  { id: "snare", label: "Snare", pitch: 38, freq: 180 },
  { id: "hat", label: "Hat", pitch: 42, freq: 8000 },
  { id: "clap", label: "Clap", pitch: 39, freq: 1200 },
] as const;

type Pattern = boolean[][];

function emptyPattern(): Pattern {
  return ROWS.map(() => Array(STEPS).fill(false));
}

function playDrum(ctx: AudioContext, freq: number, time: number, type: "kick" | "snare" | "hat" | "clap") {
  if (type === "kick") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.08);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.3);
  } else if (type === "snare" || type === "clap") {
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = type === "clap" ? 900 : 700;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(type === "clap" ? 0.5 : 0.65, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(time);
  } else {
    const bufferSize = ctx.sampleRate * 0.03;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(time);
  }
}

export function DrumMachinePanel({ embedded = false }: { embedded?: boolean }) {
  const [pattern, setPattern] = useState<Pattern>(emptyPattern);
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
    setCurrentStep(-1);
    stepRef.current = 0;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const toggleCell = useCallback((row: number, col: number) => {
    setPattern((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = !next[row][col];
      return next;
    });
  }, []);

  const playStep = useCallback(
    (step: number) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const t = ctx.currentTime;
      pattern.forEach((row, ri) => {
        if (row[step]) {
          playDrum(ctx, ROWS[ri].freq, t, ROWS[ri].id as "kick" | "snare" | "hat" | "clap");
        }
      });
    },
    [pattern],
  );

  const start = useCallback(async () => {
    stop();
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const stepMs = (60 / bpm / 4) * 1000;
    setPlaying(true);
    playStep(0);
    setCurrentStep(0);
    stepRef.current = 1;
    timerRef.current = setInterval(() => {
      const step = stepRef.current % STEPS;
      playStep(step);
      setCurrentStep(step);
      stepRef.current += 1;
    }, stepMs);
  }, [bpm, playStep, stop]);

  const exportMidi = useCallback(() => {
    const stepSec = 60 / bpm / 4;
    const notes: MidiNoteEvent[] = [];
    pattern.forEach((row, ri) => {
      row.forEach((on, step) => {
        if (on) {
          notes.push({
            pitch: ROWS[ri].pitch,
            start: step * stepSec,
            duration: stepSec * 0.8,
            velocity: 100,
          });
        }
      });
    });
    const blob = exportNotesToMidi(notes, bpm, "Drum Pattern");
    downloadMidiBlob(blob, "drum-pattern.mid");
  }, [pattern, bpm]);

  const body = (
    <div className="p-md">
        <div className="mb-sm flex flex-wrap items-center gap-sm">
          <SectionLabel>Transport</SectionLabel>
          <button
            type="button"
            onClick={() => (playing ? stop() : void start())}
            className="midi-btn text-xs"
          >
            {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Stop" : "Play"}
          </button>
          <label className="flex items-center gap-xs text-xs text-muted-foreground">
            BPM
            <input
              type="number"
              min={60}
              max={200}
              value={bpm}
              onChange={(e) => setBpm(Math.max(60, Math.min(200, Number(e.target.value) || 120)))}
              className="w-14 rounded border border-border bg-muted px-xs py-0.5 text-xs"
            />
          </label>
          <button type="button" onClick={exportMidi} className="midi-btn text-xs ml-auto">
            <Download className="h-3.5 w-3.5" />
            Export MIDI
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="mb-1 grid grid-cols-[64px_repeat(16,minmax(28px,1fr))] gap-1">
              <div />
              {Array.from({ length: STEPS }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-center text-[9px] tabular-nums",
                    i % 4 === 0 ? "text-primary-300" : "text-muted-foreground",
                  )}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            {ROWS.map((row, ri) => (
              <div
                key={row.id}
                className="mb-1 grid grid-cols-[64px_repeat(16,minmax(28px,1fr))] gap-1"
              >
                <span className="self-center text-xs font-medium text-accent-midi-200">
                  {row.label}
                </span>
                {pattern[ri].map((on, ci) => (
                  <button
                    key={ci}
                    type="button"
                    onClick={() => toggleCell(ri, ci)}
                    className={cn(
                      "aspect-square rounded-sm border transition",
                      on
                        ? "border-primary-400/50 bg-primary-500/40"
                        : "border-border bg-muted/50 hover:bg-muted",
                      playing && currentStep === ci && "ring-1 ring-warning-400/60",
                    )}
                    aria-label={`${row.label} step ${ci + 1}`}
                    aria-pressed={on}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
    </div>
  );

  if (embedded) {
    return (
      <div data-testid="drum-machine-panel">
        {body}
      </div>
    );
  }

  return (
    <div className="ui-panel overflow-hidden" data-testid="drum-machine-panel">
      <PanelHeader title="Drum Machine" subtitle="16-step pattern sequencer" />
      {body}
    </div>
  );
}
