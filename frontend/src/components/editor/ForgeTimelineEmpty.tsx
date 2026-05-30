import { StemLaneGhostPreview } from "./StemLaneGhostPreview";

export interface ForgeTimelineEmptyProps {
  onFocusSource?: () => void;
}

/** Empty mixer timeline: forge ghost lanes instead of generic dashed card. */
export function ForgeTimelineEmpty({ onFocusSource }: ForgeTimelineEmptyProps) {
  return (
    <div
      className="flex w-full flex-col items-stretch justify-center gap-lg rounded-xl border border-border/60 bg-chrome/40 px-lg py-10 text-center"
      role="region"
      aria-label="Timeline waiting for stems"
    >
      <StemLaneGhostPreview variant="compact" className="mx-auto" />
      <div className="copy-block-sm mx-auto space-y-xs">
        <p className="text-sm font-semibold text-secondary-foreground">
          Timeline opens after split
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Upload a track or load stem files in Source above. Lanes appear here ready
          to mix and export.
        </p>
        {onFocusSource ? (
          <button
            type="button"
            onClick={onFocusSource}
            className="ghost-button tap-feedback mt-sm min-h-[44px] rounded-full border border-border px-md py-xs text-xs font-medium text-secondary-foreground transition hover:text-foreground"
          >
            Go to source
          </button>
        ) : null}
      </div>
    </div>
  );
}
