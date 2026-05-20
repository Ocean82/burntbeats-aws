/**
 * MidiConvertPanel — main panel orchestrating the MIDI conversion flow.
 * Pattern matches SpeechCleanPanel: source → settings → action → progress → result.
 */
import { AlertCircle, Loader2, Music } from "lucide-react";
import { useMidiConvert } from "../../hooks/useMidiConvert";
import { useAppStore } from "../../store/appStore";
import { MidiSourceSelector } from "./MidiSourceSelector";
import { MidiConvertSettings } from "./MidiConvertSettings";
import { MidiConvertProgress } from "./MidiConvertProgress";
import { MidiResultPanel } from "./MidiResultPanel";

export interface MidiConvertPanelProps {
  usageBalance?: number | null;
  usageLoading?: boolean;
  subscriptionInactive?: boolean;
}

export function MidiConvertPanel({
  usageBalance = null,
  usageLoading = false,
  subscriptionInactive = false,
}: MidiConvertPanelProps) {
  const { splitResultStems, splitJobId } = useAppStore();

  const {
    sourceMode,
    setSourceMode,
    selectedStem,
    setSelectedStem,
    uploadedFile,
    uploadName,
    acceptFile,
    handleBrowse,
    handleClear,
    inputRef,
    settings,
    updateSettings,
    isConverting,
    progress,
    statusMessage,
    error,
    setError,
    result,
    downloadMidi,
    triggerConvert,
  } = useMidiConvert();

  const canConvert =
    !isConverting &&
    !result &&
    ((sourceMode === "split" && selectedStem && splitJobId) ||
      (sourceMode === "upload" && uploadedFile));

  return (
    <div data-testid="midi-convert-panel" className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-400/15 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/35 bg-violet-500/15">
            <Music className="h-5 w-5 text-violet-300" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Audio to MIDI
            </h2>
            <p className="mt-0.5 max-w-xl text-sm text-violet-100/55">
              Convert any stem or audio file into a downloadable MIDI file. Great for remixing in your DAW.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="shrink-0 rounded-full border border-violet-400/35 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200">
            Audio → MIDI
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Available to all paid plans — limited time
          </span>
        </div>
      </div>

      {/* Source selection */}
      <MidiSourceSelector
        sourceMode={sourceMode}
        onSourceModeChange={setSourceMode}
        selectedStem={selectedStem}
        onSelectStem={setSelectedStem}
        splitResultStems={splitResultStems}
        uploadedFile={uploadedFile}
        uploadName={uploadName}
        onBrowse={handleBrowse}
        onDrop={acceptFile}
        inputRef={inputRef}
        disabled={isConverting}
      />

      {/* Settings */}
      <MidiConvertSettings
        settings={settings}
        onUpdate={updateSettings}
        disabled={isConverting}
      />

      {/* Usage info */}
      {!subscriptionInactive && !usageLoading && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span>
            Cost: <span className="text-violet-200 font-medium">0.5 tokens</span> per conversion
          </span>
          {usageBalance !== null && (
            <>
              <span className="text-white/20">|</span>
              <span>
                Balance:{" "}
                <span className={`font-medium ${usageBalance < 1 ? "text-red-300" : "text-violet-200"}`}>
                  {Math.floor(usageBalance)} tokens
                </span>
              </span>
              {usageBalance < 1 && (
                <span className="text-red-300/80 text-[10px]">
                  — not enough tokens
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Convert button */}
      <div className="flex flex-wrap items-center gap-3">
        {subscriptionInactive ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3">
            <p className="text-sm font-medium text-amber-100">
              Subscribe to unlock MIDI conversion
            </p>
            <p className="text-xs text-amber-100/60">
              All paid plans include access to Audio-to-MIDI. Each conversion uses 0.5 tokens from your balance.
            </p>
          </div>
        ) : (
          <button
            type="button"
            data-testid="midi-convert-button"
            onClick={() => void triggerConvert(splitJobId)}
            disabled={!canConvert}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-violet-300/50 bg-gradient-to-r from-violet-600/90 to-purple-600/90 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(139,92,246,0.2)] transition hover:from-violet-500 hover:to-purple-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isConverting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Converting…
              </>
            ) : result ? (
              "Conversion complete"
            ) : (
              "Convert to MIDI"
            )}
          </button>
        )}
        {result && !subscriptionInactive && (
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[44px] rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 hover:border-white/30 hover:text-white"
          >
            New conversion
          </button>
        )}
      </div>

      {/* Progress */}
      <MidiConvertProgress
        isConverting={isConverting}
        progress={progress}
        statusMessage={statusMessage}
      />

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-500/35 bg-red-950/25 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto shrink-0 text-xs text-red-300/80 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Result */}
      {result && !isConverting && (
        <MidiResultPanel
          result={result}
          onDownload={downloadMidi}
          onNewConversion={handleClear}
        />
      )}
    </div>
  );
}
