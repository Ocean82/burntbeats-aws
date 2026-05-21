/**
 * MidiConvertPanel — main panel orchestrating the MIDI conversion flow.
 * Pattern matches SpeechCleanPanel: source → settings → action → progress → result.
 * Includes batch conversion support for converting all stems at once.
 */
import { AlertCircle, Check, Download, Loader2, Music, RefreshCw, X } from "lucide-react";
import { useCallback, useState } from "react";
import JSZip from "jszip";
import { useMidiConvert } from "../../hooks/useMidiConvert";
import { useAppStore } from "../../store/appStore";
import { MidiSourceSelector } from "./MidiSourceSelector";
import { MidiConvertSettings } from "./MidiConvertSettings";
import { MidiConvertProgress } from "./MidiConvertProgress";
import { MidiResultPanel } from "./MidiResultPanel";
import { authHeaders } from "../../api/auth";

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
    // Batch
    batchJobs,
    isBatchMode,
    batchProgress,
    triggerBatchConvert,
    retryBatchJob,
    clearBatch,
  } = useMidiConvert();

  const canConvert =
    !isConverting &&
    !result &&
    !isBatchMode &&
    ((sourceMode === "split" && selectedStem && splitJobId) ||
      (sourceMode === "upload" && uploadedFile));

  // Batch conversion helpers
  const stemNames = splitResultStems.map((s) => s.id);
  const showBatchButton =
    splitResultStems.length >= 2 &&
    !isConverting &&
    !isBatchMode &&
    !result &&
    sourceMode === "split";
  const batchCost = splitResultStems.length * 0.5;
  const canBatch =
    showBatchButton &&
    usageBalance !== null &&
    usageBalance >= batchCost;
  const isBatchInProgress = isBatchMode && batchJobs.some((j) => j.status === "converting" || j.status === "pending");

  // ZIP download state
  const [isZipping, setIsZipping] = useState(false);

  const downloadAllAsZip = useCallback(async () => {
    const completedJobs = batchJobs.filter((j) => j.status === "completed" && j.fileUrl && j.jobToken);
    if (completedJobs.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();

      for (const job of completedJobs) {
        const headers = await authHeaders();
        const res = await fetch(job.fileUrl!, {
          headers: { ...headers, "x-job-token": job.jobToken! },
        });
        if (!res.ok) continue;
        const blob = await res.blob();
        zip.file(`${job.stemName}.mid`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stems-midi.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — individual downloads still available
    } finally {
      setIsZipping(false);
    }
  }, [batchJobs]);

  const downloadSingleBatchMidi = useCallback(async (fileUrl: string, token: string, stemName: string) => {
    try {
      const headers = await authHeaders();
      const res = await fetch(fileUrl, {
        headers: { ...headers, "x-job-token": token },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stemName}.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(fileUrl, "_blank");
    }
  }, []);

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

      {/* Batch Convert All Stems button */}
      {showBatchButton && !subscriptionInactive && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="midi-batch-convert-button"
            onClick={() => splitJobId && void triggerBatchConvert(splitJobId, stemNames)}
            disabled={!canBatch}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-violet-300/40 bg-gradient-to-r from-violet-700/70 to-purple-700/70 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_16px_rgba(139,92,246,0.15)] transition hover:from-violet-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Music className="h-4 w-4" aria-hidden />
            Convert All Stems
          </button>
          <span className="text-xs text-white/50">
            Estimated cost:{" "}
            <span className="font-medium text-violet-200">{batchCost} tokens</span>
            {" "}({splitResultStems.length} stems × 0.5)
          </span>
          {usageBalance !== null && usageBalance < batchCost && (
            <span className="text-xs text-red-300/80">
              — not enough tokens (need {batchCost}, have {Math.floor(usageBalance)})
            </span>
          )}
        </div>
      )}

      {/* Batch progress UI */}
      {isBatchMode && batchJobs.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-400/20 bg-violet-950/20 p-4">
          {/* Progress summary */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">
              {isBatchInProgress ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-violet-300" />
                  {batchProgress.completed} of {batchProgress.total} stems converted
                </>
              ) : (
                <>{batchProgress.completed} of {batchProgress.total} stems converted</>
              )}
            </p>
            {!isBatchInProgress && (
              <button
                type="button"
                onClick={clearBatch}
                className="text-xs text-white/50 hover:text-white/80 underline"
              >
                Clear batch
              </button>
            )}
          </div>

          {/* Per-stem status cards */}
          <div className="flex flex-col gap-2">
            {batchJobs.map((job, idx) => (
              <div
                key={job.stemName}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {/* Status indicator */}
                  {job.status === "pending" && (
                    <span className="h-2.5 w-2.5 rounded-full bg-white/30" />
                  )}
                  {job.status === "converting" && (
                    <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
                  )}
                  {job.status === "completed" && (
                    <Check className="h-4 w-4 text-green-400" />
                  )}
                  {job.status === "failed" && (
                    <X className="h-4 w-4 text-red-400" />
                  )}
                  <span className="text-sm text-white/80 capitalize">{job.stemName}</span>
                  {job.status === "failed" && job.error && (
                    <span className="ml-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">
                      {job.error.slice(0, 50)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Individual download button for completed stems */}
                  {job.status === "completed" && job.fileUrl && job.jobToken && (
                    <button
                      type="button"
                      onClick={() => void downloadSingleBatchMidi(job.fileUrl!, job.jobToken!, job.stemName)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 hover:border-white/30 hover:text-white"
                    >
                      <Download className="h-3 w-3" />
                      .mid
                    </button>
                  )}
                  {/* Retry button for failed stems */}
                  {job.status === "failed" && splitJobId && (
                    <button
                      type="button"
                      onClick={() => void retryBatchJob(splitJobId, idx)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-500/20"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Download All as ZIP button */}
          {batchJobs.some((j) => j.status === "completed") && !isBatchInProgress && (
            <button
              type="button"
              data-testid="midi-batch-download-zip"
              onClick={() => void downloadAllAsZip()}
              disabled={isZipping}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 self-start rounded-xl border border-violet-300/40 bg-violet-600/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-600/50 disabled:opacity-50"
            >
              {isZipping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Zipping…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download All as ZIP
                </>
              )}
            </button>
          )}
        </div>
      )}

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
          onApplySuggestedBpm={(bpm) => {
            updateSettings({ quantizeBpm: bpm, quantize: true });
          }}
        />
      )}
    </div>
  );
}
