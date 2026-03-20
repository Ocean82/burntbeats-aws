import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";
import type { StemDefinition } from "../types";
import { pipelineSteps } from "../data/stemDefinitions";
import { PipelineStep } from "./PipelineStep";
import { cn } from "../utils/cn";

const MASTER_CHAIN = { compression: 2.4, limiter: -0.8, loudness: -9 } as const;

export interface StatusPanelProps {
  isSplitting: boolean;
  hasMixStems: boolean;
  splitProgress: number;
  activeStageBlurb: string;
  pipelineIndex: number;
  uploadName: string;
  isLoadingStems: boolean;
  visibleStems: StemDefinition[];
  loadedTracks: Record<string, boolean>;
  stemBuffers: Record<string, AudioBuffer>;
  masterChain?: typeof MASTER_CHAIN;
}

export function StatusPanel({
  isSplitting,
  hasMixStems,
  splitProgress,
  activeStageBlurb,
  pipelineIndex,
  uploadName,
  isLoadingStems,
  visibleStems,
  loadedTracks,
  stemBuffers,
  masterChain = MASTER_CHAIN,
}: StatusPanelProps) {
  const clampedProgress = Math.max(0, Math.min(splitProgress, 100));

  return (
    <>
      <p className="eyebrow">What&apos;s happening</p>
      <h2 className="font-display text-2xl tracking-[-0.04em] text-white mb-5">Status · Tracks · Master</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3" role="status" aria-live="polite">
          <span className="text-xs uppercase tracking-wider text-white/65">Status</span>
          <span className="font-semibold text-white">{isSplitting ? "Splitting…" : hasMixStems ? "Stems ready" : "Ready"}</span>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-white/65 mb-2">
            <span>Split progress</span><span>{clampedProgress}%</span>
          </div>
          <div className="progress-shimmer h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="progress-glow h-full rounded-full bg-[linear-gradient(90deg,#ff633d_0%,#ffbb61_44%,#ffe3a0_100%)]"
              initial={{ width: "0%" }}
              animate={{ width: `${clampedProgress}%` }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </div>
          <p className="mt-2 text-sm text-white/64">{activeStageBlurb}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {pipelineSteps.map((step, i) => (
          <PipelineStep key={step.title} title={step.title} active={i === pipelineIndex} done={i < pipelineIndex}>
            {step.blurb}
          </PipelineStep>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="h-5 w-5 text-white/70" strokeWidth={1.8} />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/65">
            Track status · {uploadName.replace(/\.[^/.]+$/, "")}
          </span>
          {isLoadingStems && <span className="text-xs text-amber-200/90">Loading stems…</span>}
        </div>
        <div className="space-y-2">
          {visibleStems.map((stem) => (
            <div key={stem.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className={cn("track-status-dot h-2 w-2 rounded-full", `track-status-dot-${stem.id}`)} />
              <span className="text-sm text-white">{stem.label}</span>
              <span className="text-xs text-white/65">
                {loadedTracks[stem.id] ? "Ready" : stemBuffers[stem.id] ? "Buffered" : isLoadingStems ? "Loading…" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/65 mb-3">Master chain</div>
        <div className="space-y-2 text-sm text-white/68">
          <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2"><span>Glue compression</span><span>{masterChain.compression} dB GR</span></div>
          <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2"><span>Limiter ceiling</span><span>{masterChain.limiter} dB</span></div>
          <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2"><span>Loudness target</span><span>{masterChain.loudness} LUFS</span></div>
        </div>
      </div>
      <p className="mt-5 text-xs text-white/65">
        Tip: Use <strong className="text-white/70">Play mix</strong> to hear everything together, then <strong className="text-white/70">Export WAV</strong> to download.
      </p>
    </>
  );
}

