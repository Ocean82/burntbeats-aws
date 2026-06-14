import {
  CheckCircle2,
  Download,
  Library,
  Piano,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { StemLaneGhostPreview } from "../editor/StemLaneGhostPreview";

const WORKSPACE_TABS = ["Stem editor", "MIDI", "Beats"] as const;
const STEM_ROWS = [
  { label: "Vocals", value: "Ready", colorClass: "bg-[var(--stem-vocals)]" },
  { label: "Drums", value: "Ready", colorClass: "bg-[var(--stem-drums)]" },
  { label: "Bass", value: "Ready", colorClass: "bg-[var(--stem-bass)]" },
  { label: "Melody", value: "Ready", colorClass: "bg-[var(--stem-melody)]" },
] as const;

export function LandingProductShowcase() {
  return (
    <section
      aria-label="Product workspace preview"
      className="glass-panel mirror-sheen relative mx-auto w-full max-w-4xl overflow-hidden rounded-4xl p-xs text-left sm:p-sm lg:p-md"
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-white/10 via-white/0 to-transparent" />

      <div className="relative rounded-[1.4rem] border border-border/80 bg-background/40 p-sm shadow-elevation-lg sm:p-md">
        <div className="flex flex-wrap items-start justify-between gap-sm rounded-xl border border-border/70 bg-muted/50 px-sm py-xs sm:items-center">
          <div className="flex min-w-0 items-center gap-sm">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-midi-gold/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-success-500/80" />
            </div>
            <div className="flex min-w-0 items-center gap-xs">
              <img
                src="/logo-emblem.png"
                alt=""
                className="logo-emblem h-7 w-7"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Burnt Beats
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Split · Mix · Master · Export
                </p>
              </div>
            </div>
          </div>

          <div className="inline-flex w-full items-center justify-center gap-xs rounded-full border border-success-400/25 bg-success-500/10 px-sm py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-success-100 sm:w-auto sm:justify-start">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />4 stems
            ready
          </div>
        </div>

        <div className="mt-sm flex flex-wrap items-center gap-xs rounded-xl border border-border/70 bg-muted/35 p-2xs">
          {WORKSPACE_TABS.map((tab, index) => (
            <div
              key={tab}
              className={
                index === 0
                  ? "inline-flex min-h-10 items-center gap-xs rounded-lg border border-primary-400/50 bg-primary-500/20 px-sm text-sm font-medium text-primary-100"
                  : "inline-flex min-h-10 items-center gap-xs rounded-lg border border-transparent px-sm text-sm font-medium text-muted-foreground"
              }
            >
              {tab}
            </div>
          ))}
        </div>

        <div className="mt-md grid gap-md xl:grid-cols-[16rem_minmax(0,1fr)]">
          <section className="rounded-2xl border border-border/70 bg-muted/28 p-sm sm:p-md">
            <div className="flex flex-col items-start justify-between gap-sm sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-semibold text-foreground">Source</p>
                <p className="text-xs text-muted-foreground">
                  Upload audio or reopen a saved split
                </p>
              </div>
              <div className="rounded-full border border-border bg-background/60 px-sm py-1 text-[11px] font-medium text-primary-100">
                3 min · 3 tokens
              </div>
            </div>

            <div className="mt-md space-y-sm">
              <div className="rounded-xl border border-border/70 bg-background/50 p-sm">
                <div className="flex items-start gap-sm">
                  <div className="rounded-lg border border-primary-400/25 bg-primary-500/10 p-2">
                    <Upload
                      className="h-4 w-4 text-primary-200"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      festival-remix-demo.wav
                    </p>
                    <p className="text-xs text-muted-foreground">
                      4-stem split · browser processing
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/40 p-sm">
                <div className="flex items-start gap-sm">
                  <div className="rounded-lg border border-primary-400/25 bg-primary-500/10 p-2">
                    <SlidersHorizontal
                      className="h-4 w-4 text-primary-200"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Workflow stays live
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Mix levels, reopen jobs from My stems, then hand off into
                      MIDI or export.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/70 bg-background/35 p-sm sm:p-md">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Timeline
                </p>
                <p className="text-xs text-muted-foreground">
                  Stem editor with live mix workspace
                </p>
              </div>
              <div className="rounded-full border border-border/70 bg-muted/45 px-sm py-1 text-[11px] font-medium text-secondary-foreground">
                Export ready
              </div>
            </div>

            <div className="mt-md rounded-2xl border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-sm sm:p-md">
              <div className="grid grid-cols-4 gap-xs text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
                <span>00:00</span>
                <span>01:12</span>
                <span>02:24</span>
                <span>03:00</span>
              </div>

              <div className="mt-md rounded-xl border border-border/60 bg-background/40 px-xs py-sm sm:px-sm sm:py-md">
                <StemLaneGhostPreview
                  variant="compact"
                  className="justify-between gap-xs sm:gap-md"
                />
              </div>

              <div className="mt-md grid gap-xs sm:grid-cols-2">
                {STEM_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-background/45 px-sm py-xs"
                  >
                    <div className="flex items-center gap-xs">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${row.colorClass}`}
                      />
                      <span className="text-sm font-medium text-secondary-foreground">
                        {row.label}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-md grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/40 px-sm py-sm">
            <div className="flex items-center gap-xs text-sm font-medium text-foreground">
              <Library
                className="h-4 w-4 text-primary-200"
                aria-hidden="true"
              />
              My stems replay
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Reopen past jobs instead of losing the session to a download
              folder.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/40 px-sm py-sm">
            <div className="flex items-center gap-xs text-sm font-medium text-foreground">
              <Piano className="h-4 w-4 text-midi-gold/90" aria-hidden="true" />
              MIDI handoff
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Move from separated audio into note data inside the same
              workstation.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/40 px-sm py-sm">
            <div className="flex items-center gap-xs text-sm font-medium text-foreground">
              <Download
                className="h-4 w-4 text-success-300"
                aria-hidden="true"
              />
              Export ready
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Finish the mix, compare the result, then export without
              context-switching.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
