import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";
import type { StemDefinition } from "../types";
import { pipelineSteps } from "../data/stemDefinitions";
import { PipelineStep } from "./PipelineStep";
import { cn } from "../utils/cn";

import { MASTER_CHAIN } from "../config";

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
      <h2 className="font-display text-2xl tracking-[-0.04em] text-foreground mb-5">Status · Tracks · Master</h2>
      <div className="space-y-md">
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted px-md py-sm" role="status" aria-live="polite">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Status</span>
          <span className="font-semibold text-foreground">{isSplitting ? "Splitting…" : hasMixStems ? "Stems ready" : "Ready"}</span>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground mb-xs">
            <span>Split progress</span><span>{clampedProgress}%</span>
          </div>
          <div className="progress-shimmer h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="progress-glow h-full rounded-full bg-[linear-gradient(90deg,#ff633d_0%,#ffbb61_44%,#ffe3a0_100%)]"
              initial={{ width: "0%" }}
              animate={{ width: `${clampedProgress}%` }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </div>
          <p className="mt-xs text-sm text-muted-foreground">{activeStageBlurb}</p>
        </div>
      </div>
      <div className="mt-md space-y-xs">
        {pipelineSteps.map((step, i) => (
          <PipelineStep key={step.title} title={step.title} active={i === pipelineIndex} done={i < pipelineIndex}>
            {step.blurb}
          </PipelineStep>
        ))}
      </div>
      <div className="mt-lg rounded-xl border border-border bg-muted p-md">
        <div className="flex items-center gap-xs mb-sm">
          <FolderOpen className="h-5 w-5 text-secondary-foreground" strokeWidth={1.8} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Track status · {uploadName.replace(/\.[^/.]+$/, "")}
          </span>
          {isLoadingStems && <span className="text-xs text-primary-200/90">Loading stems…</span>}
        </div>
        <div className="space-y-xs">
          {visibleStems.map((stem) => (
            <div key={stem.id} className="flex items-center gap-xs rounded-xl border border-border bg-muted px-sm py-xs">
              <span className={cn("track-status-dot h-2 w-2 rounded-full", `track-status-dot-${stem.id}`)} />
              <span className="text-sm text-foreground">{stem.label}</span>
              <span className="text-xs text-muted-foreground">
                {loadedTracks[stem.id] ? "Ready" : stemBuffers[stem.id] ? "Buffered" : isLoadingStems ? "Loading…" : "Pending"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-lg rounded-xl border border-border bg-muted p-md">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-sm">Master chain</div>
        <div className="space-y-xs text-sm text-muted-foreground">
          <div className="flex justify-between rounded-lg bg-muted px-sm py-xs"><span>Glue compression</span><span>{masterChain.compression} dB GR</span></div>
          <div className="flex justify-between rounded-lg bg-muted px-sm py-xs"><span>Limiter ceiling</span><span>{masterChain.limiter} dB</span></div>
          <div className="flex justify-between rounded-lg bg-muted px-sm py-xs"><span>Loudness target</span><span>{masterChain.loudness} LUFS</span></div>
        </div>
      </div>
      <p className="mt-lg text-xs text-muted-foreground">
        Tip: Use <strong className="text-secondary-foreground">Play mix</strong> to hear everything together, then <strong className="text-secondary-foreground">Export WAV</strong> to download.
      </p>
    </>
  );
}

