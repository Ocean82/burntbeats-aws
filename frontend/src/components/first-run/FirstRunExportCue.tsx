import { Download, Sparkles } from "lucide-react";

interface FirstRunExportCueProps {
  onExport: () => void;
}

/** Shown after a first-time user's split completes — nudges export. */
export function FirstRunExportCue({ onExport }: FirstRunExportCueProps) {
  return (
    <div className="mx-md mb-md rounded-xl border border-primary-400/30 bg-primary-500/10 p-md sm:mx-lg">
      <div className="flex flex-wrap items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Step 3: Export your mix</p>
          <p className="mt-1 text-xs text-secondary-foreground">
            Your stems are ready. Export a WAV or MP3 master, or download individual stems.
          </p>
          <button
            type="button"
            onClick={onExport}
            className="fire-button tap-feedback mt-3 inline-flex items-center gap-2 rounded-lg px-md py-2 text-xs font-semibold"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export now
          </button>
        </div>
      </div>
    </div>
  );
}
