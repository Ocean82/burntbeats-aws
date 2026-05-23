/**
 * MidiConvertPanel — main panel orchestrating the MIDI conversion flow.
 * Pattern matches SpeechCleanPanel: source → settings → action → progress → result.
 * Includes batch conversion support for converting all stems at once.
 */
import { AlertCircle, Check, Download, Layers, Loader2, Music, RefreshCw, X } from "lucide-react";
import { useCallback, useState } from "react";
import JSZip from "jszip";
import { useMidiConvert } from "../../hooks/useMidiConvert";
import { useAppStore } from "../../store/appStore";
import { MidiSourceSelector } from "./MidiSourceSelector";
import { MidiSourcePreview } from "./MidiSourcePreview";
import { MidiConvertSettings } from "./MidiConvertSettings";
import { MidiConvertProgress } from "./MidiConvertProgress";
import { MidiResultPanel } from "./MidiResultPanel";
import { authHeaders } from "../../api/auth";
import { API_BASE } from "../../config";

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
  const { splitJobId } = useAppStore();

  const {
    sourceMode,
    setSourceMode,
    selectedStem,
    setSelectedStem,
    selectedLoadedStemId,
    setSelectedLoadedStemId,
    uploadedFile,
    uploadName,
    acceptFile,
    handleBrowse,
    handleClear,
    inputRef,
    isDragging,
    setIsDragging,
    splitResultStems,
    loadedStems,
    selectedSplitStemUrl,
    selectedLoadedStem,
    hasSourceSelected,
    settings,
    updateSettings,
    isConverting,
    isUploading,
    uploadProgress,
    progress,
    statusMessage,
    error,
    setError,
    result,
    downloadMidi,
    triggerConvert,
    batchJobs,
    isBatchMode,
    batchProgress,
    triggerBatchConvert,
    retryBatchJob,
    clearBatch,
  } = useMidiConvert();

  const canConvert =
    !isConverting &&
    !isUploading &&
    !result &&
    !isBatchMode &&
    hasSourceSelected &&
    (sourceMode !== "split" || !!splitJobId);

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

  // Multi-track export state
  const [isMerging, setIsMerging] = useState(false);

  const downloadMultiTrack = useCallback(async () => {
    const completedJobs = batchJobs.filter((j) => j.status === "completed" && j.jobId);
    if (completedJobs.length < 2) return;

    setIsMerging(true);
    try {
      const headers = await authHeaders();
      const mergePayload = {
        jobs: completedJobs.map((j) => ({
          job_id: j.jobId,
          stem_name: j.stemName,
        })),
        bpm: settings.quantizeBpm || 120,
      };

      const res = await fetch(`${API_BASE}/api/midi/merge`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(mergePayload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Multi-track merge failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "multitrack.mid";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Multi-track export failed";
      setError(msg);
    } finally {
      setIsMerging(false);
    }
  }, [batchJobs, settings.quantizeBpm, setError]);

  return (
    <div data-testid="midi-convert-panel" className="flex flex-col gap-md">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-sm border-b border-accent-midi/25 pb-md">
        <div className="flex items-start gap-sm">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-midi/35 bg-accent-midi/15">
            <Music className="h-5 w-5 text-accent-midi-300" aria-hidden />
          </div>
          <div className="flex max-w-xl flex-col gap-2xs">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Audio to MIDI
            </h2>
            <p className="text-sm text-accent-midi-foreground/55">
              Convert any stem or audio file into a downloadable MIDI file. Great for remixing in your DAW.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-xs">
          <span className="shrink-0 rounded-full border border-accent-midi/35 bg-accent-midi/10 px-sm py-1 text-meta font-bold uppercase tracking-wider text-accent-midi-200">
            Audio → MIDI
          </span>
          <span className="inline-flex items-center gap-2xs rounded-full border border-primary-400/40 bg-primary-500/10 px-sm py-1 text-meta font-semibold uppercase tracking-wide text-primary-200">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-400" aria-hidden />
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
        loadedStems={loadedStems}
        selectedLoadedStemId={selectedLoadedStemId}
        onSelectLoadedStem={setSelectedLoadedStemId}
        uploadedFile={uploadedFile}
        uploadName={uploadName}
        onBrowse={handleBrowse}
        onDrop={acceptFile}
        inputRef={inputRef}
        isDragging={isDragging}
        onSetIsDragging={setIsDragging}
        disabled={isConverting || isUploading}
      />

      <MidiSourcePreview
        sourceMode={sourceMode}
        uploadedFile={uploadedFile}
        splitStemUrl={selectedSplitStemUrl}
        loadedStemUrl={selectedLoadedStem?.url ?? null}
        loadedStemLabel={selectedLoadedStem?.label}
        disabled={isConverting || isUploading}
      />

      {/* Settings */}
      <MidiConvertSettings
        settings={settings}
        onUpdate={updateSettings}
        disabled={isConverting || isUploading}
      />

      {/* Usage info */}
      {!subscriptionInactive && !usageLoading && (
        <div className="flex items-center gap-xs text-xs text-muted-foreground">
          <span>
            Cost: <span className="text-accent-midi-200 font-medium">0.5 tokens</span> per conversion
          </span>
          {usageBalance !== null && (
            <>
              <span className="text-muted-foreground">|</span>
              <span>
                Balance:{" "}
                <span className={`font-medium ${usageBalance < 1 ? "text-destructive-300" : "text-accent-midi-200"}`}>
                  {Math.floor(usageBalance)} tokens
                </span>
              </span>
              {usageBalance < 1 && (
                <span className="text-destructive-300/80 text-meta">
                  — not enough tokens
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Convert button */}
      <div className="flex flex-wrap items-center gap-sm">
        {subscriptionInactive ? (
          <div className="flex flex-col gap-xs rounded-xl border border-primary-400/20 bg-primary-500/5 px-md py-sm">
            <p className="text-sm font-medium text-primary-100">
              Subscribe to unlock MIDI conversion
            </p>
            <p className="text-xs text-primary-100/60">
              All paid plans include access to Audio-to-MIDI. Each conversion uses 0.5 tokens from your balance.
            </p>
          </div>
        ) : (
          <button
            type="button"
            data-testid="midi-convert-button"
            onClick={() => void triggerConvert(splitJobId)}
            disabled={!canConvert}
            className="inline-flex min-h-[44px] items-center justify-center gap-xs rounded-xl border border-accent-midi-300/50 bg-gradient-to-r from-accent-midi-600/90 to-accent-midi-500/90 px-lg py-sm text-sm font-bold text-foreground shadow-elevation-md transition hover:from-accent-midi-500 hover:to-accent-midi-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isConverting || isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isUploading ? "Uploading…" : "Converting…"}
              </>
            ) : result ? (
              "Conversion complete"
            ) : (
              "Convert to MIDI"
            )}
          </button>
        )}
      </div>

      {/* Batch Convert All Stems button */}
      {showBatchButton && !subscriptionInactive && (
        <div className="flex flex-wrap items-center gap-sm">
          <button
            type="button"
            data-testid="midi-batch-convert-button"
            onClick={() => splitJobId && void triggerBatchConvert(splitJobId, stemNames)}
            disabled={!canBatch}
            className="inline-flex min-h-[44px] items-center justify-center gap-xs rounded-xl border border-accent-midi-300/40 bg-gradient-to-r from-accent-midi-700/70 to-accent-midi-600/70 px-lg py-sm text-sm font-bold text-foreground shadow-elevation-sm transition hover:from-accent-midi-600 hover:to-accent-midi-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Music className="h-4 w-4" aria-hidden />
            Convert All Stems
          </button>
          <span className="text-xs text-muted-foreground">
            Estimated cost:{" "}
            <span className="font-medium text-accent-midi-200">{batchCost} tokens</span>
            {" "}({splitResultStems.length} stems × 0.5)
          </span>
          {usageBalance !== null && usageBalance < batchCost && (
            <span className="text-xs text-destructive-300/80">
              — not enough tokens (need {batchCost}, have {Math.floor(usageBalance)})
            </span>
          )}
        </div>
      )}

      {/* Batch progress UI */}
      {isBatchMode && batchJobs.length > 0 && (
        <div className="flex flex-col gap-sm rounded-xl border border-accent-midi/25 bg-accent-midi-950/20 p-md">
          {/* Progress summary */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {isBatchInProgress ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-accent-midi-300" />
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
                className="text-xs text-muted-foreground hover:text-secondary-foreground underline"
              >
                Clear batch
              </button>
            )}
          </div>

          {/* Per-stem status cards */}
          <div className="flex flex-col gap-xs">
            {batchJobs.map((job, idx) => (
              <div
                key={job.stemName}
                className="flex flex-col gap-xs rounded-lg border border-border bg-muted px-sm py-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 items-start gap-xs sm:items-center">
                  {/* Status indicator */}
                  {job.status === "pending" && (
                    <span className="mt-2xs h-2.5 w-2.5 shrink-0 rounded-full bg-secondary sm:mt-0" />
                  )}
                  {job.status === "converting" && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-midi-300" />
                  )}
                  {job.status === "completed" && (
                    <Check className="h-4 w-4 shrink-0 text-success" />
                  )}
                  {job.status === "failed" && (
                    <X className="h-4 w-4 shrink-0 text-destructive-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-secondary-foreground capitalize">
                      {job.stemName}
                    </span>
                    {job.status === "failed" && job.error && (
                      <span className="mt-2xs block text-xs text-destructive-300/90 line-clamp-2">
                        {job.error}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-xs self-end sm:self-auto">
                  {/* Individual download button for completed stems */}
                  {job.status === "completed" && job.fileUrl && job.jobToken && (
                    <button
                      type="button"
                      onClick={() => void downloadSingleBatchMidi(job.fileUrl!, job.jobToken!, job.stemName)}
                      className="inline-flex items-center gap-2xs rounded-lg border border-border px-sm py-1 text-xs text-secondary-foreground hover:border-border hover:text-foreground"
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
                      className="inline-flex items-center gap-2xs rounded-lg border border-primary-400/30 bg-primary-500/10 px-sm py-1 text-xs text-primary-200 hover:bg-primary-500/20"
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
            <div className="flex flex-wrap items-center gap-sm">
              <button
                type="button"
                data-testid="midi-batch-download-zip"
                onClick={() => void downloadAllAsZip()}
                disabled={isZipping}
                className="inline-flex min-h-[44px] items-center justify-center gap-xs rounded-xl border border-accent-midi-300/40 bg-accent-midi-600/30 px-lg py-xs text-sm font-semibold text-foreground transition hover:bg-accent-midi-600/50 disabled:opacity-50"
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

              {/* Multi-track MIDI export (single .mid with all stems as separate tracks) */}
              {batchJobs.filter((j) => j.status === "completed").length >= 2 && (
                <button
                  type="button"
                  data-testid="midi-batch-multitrack"
                  onClick={() => void downloadMultiTrack()}
                  disabled={isMerging}
                  className="inline-flex min-h-[44px] items-center justify-center gap-xs rounded-xl border border-primary-300/40 bg-primary-600/20 px-lg py-xs text-sm font-semibold text-foreground transition hover:bg-primary-600/35 disabled:opacity-50"
                >
                  {isMerging ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Merging…
                    </>
                  ) : (
                    <>
                      <Layers className="h-4 w-4" />
                      Export Multi-Track MIDI
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      <MidiConvertProgress
        isConverting={isConverting}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        progress={progress}
        statusMessage={statusMessage}
      />

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-xs rounded-xl border border-destructive-500/35 bg-destructive-950/25 px-md py-sm text-sm text-destructive-200"
        >
          <AlertCircle className="mt-2xs h-4 w-4 shrink-0" aria-hidden />
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto shrink-0 text-xs text-destructive-300/80 underline"
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
