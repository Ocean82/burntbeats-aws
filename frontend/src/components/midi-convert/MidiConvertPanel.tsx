/**
 * MidiConvertPanel — main panel orchestrating the MIDI conversion flow.
 * Pattern matches SpeechCleanPanel: source → settings → action → progress → result.
 * Includes batch conversion support for converting all stems at once.
 */
import { Check, Download, Layers, Loader2, Music, Pencil, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMidiConvert, type MidiConvertResult } from "../../hooks/useMidiConvert";
import { useAppStore } from "../../store/appStore";
import { cn } from "../../utils/cn";
import { buildMidiDownloadName, midiErrorMessage } from "../../utils/midiErrors";
import { WorkflowStepper } from "../ui/WorkflowStepper";
import { MidiSourceSelector } from "./MidiSourceSelector";
import { MidiSourcePreview } from "./MidiSourcePreview";
import { MidiConvertSettings } from "./MidiConvertSettings";
import { MidiConvertProgress } from "./MidiConvertProgress";
import { MidiResultPanel } from "./MidiResultPanel";
import { MidiNoteEditor } from "./MidiNoteEditor";
import { MidiLaneDrawer } from "./MidiLaneDrawer";
import { editorTracksFromBatchJobs } from "../../utils/midiBatchTracks";
import { authHeaders } from "../../api/auth";
import { API_BASE } from "../../config";
import { trackEvent } from "../../analytics/events";
import { ErrorState } from "../ui/error-state";
import { SuccessFlash } from "../ui/success-flash";
import "./midi-tokens.css";

export interface MidiConvertPanelProps {
  usageBalance?: number | null;
  usageLoading?: boolean;
  subscriptionInactive?: boolean;
  onViewPlans?: () => void;
  onOpenExportHistory?: () => void;
}

export function MidiConvertPanel({
  usageBalance = null,
  usageLoading = false,
  subscriptionInactive = false,
  onViewPlans,
  onOpenExportHistory,
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
    isDownloadingMidi,
    downloadError,
    setDownloadError,
    downloadSourceLabel,
    triggerConvert,
    batchJobs,
    isBatchMode,
    batchProgress,
    triggerBatchConvert,
    retryBatchJob,
    clearBatch,
    cancelBatch,
    activeMidiJobId,
    jobToken,
    cancelConvert,
  } = useMidiConvert();

  const settingsSectionRef = useRef<HTMLDivElement>(null);
  const [batchViewResult, setBatchViewResult] = useState<{
    result: MidiConvertResult;
    jobId: string;
    jobToken: string;
    stemName: string;
  } | null>(null);
  const [batchMultiTrackOpen, setBatchMultiTrackOpen] = useState(false);

  const handleViewPlans = useCallback(
    (source: "token_low" | "subscription_inactive" | "batch_token_low") => {
      trackEvent("midi_upgrade_cta_clicked", { source });
      onViewPlans?.();
    },
    [onViewPlans],
  );

  const displayResult = result ?? batchViewResult?.result ?? null;
  const displayJobId = result ? activeMidiJobId : batchViewResult?.jobId ?? null;
  const displayJobToken = result ? jobToken : batchViewResult?.jobToken ?? null;

  const comparisonSource = useMemo(
    () => ({
      sourceMode,
      uploadedFile,
      splitStemUrl: selectedSplitStemUrl,
      loadedStemUrl: selectedLoadedStem?.url ?? null,
      loadedStemLabel: selectedLoadedStem?.label,
      midiJobId: displayJobId,
      midiJobToken: displayJobToken,
    }),
    [
      sourceMode,
      uploadedFile,
      selectedSplitStemUrl,
      selectedLoadedStem,
      displayJobId,
      displayJobToken,
    ],
  );

  const batchEditorTracks = useMemo(
    () => editorTracksFromBatchJobs(batchJobs),
    [batchJobs],
  );

  const batchCompletedCount = batchJobs.filter((j) => j.status === "completed").length;
  const batchFailedCount = batchJobs.filter((j) => j.status === "failed").length;
  const batchDone =
    isBatchMode &&
    batchJobs.length > 0 &&
    batchJobs.every((j) =>
      ["completed", "failed", "cancelled"].includes(j.status),
    );

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
  const batchCost = splitResultStems.length * 1;
  const canBatch =
    showBatchButton &&
    usageBalance !== null &&
    usageBalance >= batchCost;
  const isBatchInProgress = isBatchMode && batchJobs.some((j) => j.status === "converting" || j.status === "pending");

  const workflowActiveId = displayResult
    ? "result"
    : isConverting || isUploading || isBatchInProgress
      ? "convert"
      : hasSourceSelected
        ? "settings"
        : "source";
  const workflowCompleted = [
    ...(hasSourceSelected ? ["source"] : []),
    ...(hasSourceSelected && !isConverting && !isUploading ? ["settings"] : []),
    ...(displayResult || batchJobs.some((j) => j.status === "completed") || batchDone
      ? ["convert"]
      : []),
    ...(displayResult || batchDone ? ["result"] : []),
  ];

  // Export ZIP state
  const [isExportingZip, setIsExportingZip] = useState(false);

  // Drawer collapse states
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const openedSettingsForResultRef = useRef(false);

  // Task 17.1: SuccessFlash — fires when result transitions from null to non-null with notes
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const prevResultRef = useRef(displayResult);
  useEffect(() => {
    const hadNotes =
      displayResult !== null &&
      displayResult.notesDetected > 0 &&
      prevResultRef.current === null;
    if (hadNotes) {
      setShowSuccessFlash(true);
    }
    // Collapse settings on result so the piano roll gets maximum room
    if (displayResult && !openedSettingsForResultRef.current) {
      setSettingsDrawerOpen(false);
      openedSettingsForResultRef.current = true;
    }
    if (!displayResult) {
      openedSettingsForResultRef.current = false;
    }
    prevResultRef.current = displayResult;
  }, [displayResult]);

  const scrollToSettings = useCallback(() => {
    setSettingsDrawerOpen(true);
    requestAnimationFrame(() => {
      settingsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const downloadAllAsZip = useCallback(async () => {
    const completedJobs = batchJobs.filter(
      (j) => j.status === "completed" && j.fileUrl && j.jobToken && j.jobId,
    );
    if (completedJobs.length === 0) return;

    setIsExportingZip(true);
    try {
      const headers = await authHeaders();
      const payload = {
        mode: "stems",
        format: "midi1",
        selected_stems: completedJobs.map((job) => job.stemName),
        source_jobs: completedJobs.map((job) => ({
          job_id: job.jobId,
          stem_name: job.stemName,
          bpm: settings.quantizeBpm || 120,
        })),
      };
      const createRes = await fetch(`${API_BASE}/api/midi/export`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(
          midiErrorMessage(
            "export_zip",
            typeof data.error === "string" ? data.error : null,
          ),
        );
      }
      const created = (await createRes.json()) as {
        export_id: string;
        export_token: string;
        status_url?: string;
        archive_url?: string;
      };
      const statusUrl = created.status_url;
      const archiveUrl = created.archive_url;
      if (!statusUrl || !archiveUrl || !created.export_token) {
        throw new Error("Export service returned incomplete response");
      }

      let attempts = 0;
      while (attempts < 160) {
        const statusRes = await fetch(statusUrl, {
          headers: { ...headers, "x-job-token": created.export_token },
        });
        if (!statusRes.ok) {
          const data = await statusRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to poll export status");
        }
        const statusData = (await statusRes.json()) as {
          status: string;
          error?: string;
        };
        if (statusData.status === "completed") break;
        if (statusData.status === "failed") {
          throw new Error(statusData.error || "Export job failed");
        }
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (attempts >= 160) {
        throw new Error("Export timed out");
      }

      const archiveRes = await fetch(archiveUrl, {
        headers: { ...headers, "x-job-token": created.export_token },
      });
      if (!archiveRes.ok) {
        const data = await archiveRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to download stems zip");
      }
      const zipBlob = await archiveRes.blob();
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stems-midi.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : midiErrorMessage("export_zip");
      setError(msg);
    } finally {
      setIsExportingZip(false);
    }
  }, [batchJobs, settings.quantizeBpm, setError]);

  const downloadSingleBatchMidi = useCallback(async (fileUrl: string, token: string, stemName: string, jobId: string) => {
    try {
      const headers = await authHeaders();
      const res = await fetch(fileUrl, {
        headers: { ...headers, "x-job-token": token },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          midiErrorMessage(
            "download",
            typeof data.error === "string" ? data.error : null,
          ),
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildMidiDownloadName({ stemName, jobId });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : midiErrorMessage("download");
      setError(msg);
    }
  }, [setError]);

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
        throw new Error(
          midiErrorMessage(
            "export_merge",
            typeof data.error === "string" ? data.error : null,
          ),
        );
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
      const msg =
        e instanceof Error
          ? e.message
          : midiErrorMessage("export_merge");
      setError(msg);
    } finally {
      setIsMerging(false);
    }
  }, [batchJobs, settings.quantizeBpm, setError]);

  const stage: "source" | "settings" | "editor" =
    !hasSourceSelected ? "source"
    : result ? "editor"
    : "settings";

  const sourceLabel =
    sourceMode === "split" ? (selectedStem || selectedSplitStemUrl ? selectedStem : "Split stem")
    : sourceMode === "loaded" ? (selectedLoadedStem?.label ?? "Loaded stem")
    : uploadName || "Audio file";

  const animProps = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
  };

  const settingsSubtitle = `${sourceMode === "split" ? "Split stem" : sourceMode === "loaded" ? "Loaded stem" : "Upload"} · ${(settings.minConfidence * 100).toFixed(0)}% Conf · ${settings.minNoteLengthMs}ms Min${settings.quantize ? ` · ${settings.quantizeBpm} BPM` : ""}`;

  return (
    <div data-testid="midi-convert-panel" className="midi-workspace flex flex-col gap-md">
      <WorkflowStepper
        steps={[
          { id: "source", label: "Source" },
          { id: "settings", label: "Settings" },
          { id: "convert", label: "Convert" },
          { id: "result", label: "Result" },
        ]}
        activeStepId={workflowActiveId}
        completedStepIds={workflowCompleted}
      />

      {/* Batch progress — always visible when batch mode */}
      {isBatchMode && batchJobs.length > 0 && (
        <div className="midi-batch-panel">
          {/* Progress summary */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {isBatchInProgress ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-accent-midi-300" />
                  {batchProgress.completed} of {batchProgress.total} stems converted
                </>
              ) : (
                <>
                  {batchProgress.completed} of {batchProgress.total} stems converted
                  {batchDone ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({batchCompletedCount} succeeded
                      {batchFailedCount > 0 ? `, ${batchFailedCount} failed` : ""})
                    </span>
                  ) : null}
                </>
              )}
            </p>
            {isBatchInProgress ? (
              <button
                type="button"
                onClick={() => void cancelBatch()}
                className="text-xs text-destructive-300 hover:underline"
              >
                Cancel batch
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  clearBatch();
                  setBatchViewResult(null);
                }}
                className="text-xs text-muted-foreground hover:text-secondary-foreground underline"
              >
                Clear batch
              </button>
            )}
          </div>

          {/* Per-stem status cards */}
          <AnimatePresence initial={false}>
            <div className="flex flex-col gap-xs">
              {batchJobs.map((job, idx) => (
                <motion.div
                  key={job.stemName}
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                  transition={{
                    type: "spring",
                    stiffness: 350,
                    damping: 22,
                    mass: 0.7,
                    delay: idx * 0.04,
                  }}
                  className={cn(
                    "midi-batch-card flex flex-col gap-xs rounded-lg border px-sm py-sm sm:flex-row sm:items-center sm:justify-between",
                    job.status === "pending" && "border-border bg-muted",
                    job.status === "converting" && "midi-batch-card--converting border-accent-midi/30 bg-accent-midi-950/15",
                    job.status === "completed" && "midi-batch-card--completed border-success/30 bg-success-muted/10",
                    job.status === "failed" && "midi-batch-card--failed border-destructive-500/30 bg-destructive-950/15",
                    job.status === "cancelled" && "border-border/60 bg-muted/40 opacity-70",
                  )}
                >
                <div className="flex min-w-0 flex-1 items-start gap-xs sm:items-center">
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
                  {job.status === "cancelled" && (
                    <X className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-secondary-foreground capitalize">
                      {job.stemName}
                    </span>
                    {job.status === "converting" && (
                      <span className="mt-2xs block text-xs text-muted-foreground">
                        {job.statusMessage || "Converting…"}
                        {typeof job.progress === "number" ? ` · ${job.progress}%` : ""}
                      </span>
                    )}
                    {job.status === "failed" && job.error && (
                      <span className="mt-2xs block text-xs text-destructive-300/90 line-clamp-2">
                        {job.error}
                      </span>
                    )}
                    {job.status === "cancelled" && (
                      <span className="mt-2xs block text-xs text-muted-foreground">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-xs self-end sm:self-auto">
                  {job.status === "completed" && job.result && job.result.notesDetected > 0 && job.jobId && job.jobToken && (
                    <button
                      type="button"
                      onClick={() =>
                        setBatchViewResult({
                          result: job.result!,
                          jobId: job.jobId!,
                          jobToken: job.jobToken!,
                          stemName: job.stemName,
                        })
                      }
                      className="midi-btn text-xs"
                    >
                      <Pencil className="h-3 w-3" />
                      Open in editor
                    </button>
                  )}
                  {job.status === "completed" && job.fileUrl && job.jobToken && job.jobId && (
                    <button
                      type="button"
                      onClick={() =>
                        void downloadSingleBatchMidi(
                          job.fileUrl!,
                          job.jobToken!,
                          job.stemName,
                          job.jobId!,
                        )
                      }
                      className="midi-btn text-xs"
                    >
                      <Download className="h-3 w-3" />
                      .mid
                    </button>
                  )}
                  {job.status === "failed" && splitJobId && (
                    <button
                      type="button"
                      onClick={() => void retryBatchJob(splitJobId, idx)}
                      className="midi-btn text-xs"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>

          {/* Download All as ZIP + Multi-track buttons */}
          {batchJobs.some((j) => j.status === "completed") && !isBatchInProgress && (
            <div className="flex flex-wrap items-center gap-sm pt-xs">
              <button
                type="button"
                data-testid="midi-batch-download-zip"
                onClick={() => void downloadAllAsZip()}
                disabled={isExportingZip}
                className="midi-btn midi-btn--play text-sm"
              >
                {isExportingZip ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting ZIP…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download All as ZIP
                  </>
                )}
              </button>

              {batchEditorTracks.length >= 2 && (
                <button
                  type="button"
                  data-testid="midi-batch-open-editor"
                  onClick={() => {
                    setBatchViewResult(null);
                    setBatchMultiTrackOpen(true);
                  }}
                  className="midi-btn midi-btn--play text-sm"
                >
                  <Pencil className="h-4 w-4" />
                  Open multi-track editor
                </button>
              )}

              {batchJobs.filter((j) => j.status === "completed").length >= 2 && (
                <button
                  type="button"
                  data-testid="midi-batch-multitrack"
                  onClick={() => void downloadMultiTrack()}
                  disabled={isMerging}
                  className="midi-btn text-sm"
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

      {/* Progressive stages */}
      <AnimatePresence mode="wait">
        {stage === "source" && (
          <motion.div key="stage-source" {...animProps}>
            <div className="midi-workspace-section">
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

              {hasSourceSelected && (
                <MidiSourcePreview
                  sourceMode={sourceMode}
                  uploadedFile={uploadedFile}
                  splitStemUrl={selectedSplitStemUrl}
                  loadedStemUrl={selectedLoadedStem?.url ?? null}
                  loadedStemLabel={selectedLoadedStem?.label}
                  midiJobId={activeMidiJobId}
                  disabled={isConverting || isUploading}
                />
              )}
            </div>
          </motion.div>
        )}

        {stage === "settings" && (
          <motion.div key="stage-settings" {...animProps} className="flex flex-col gap-md">
            {/* Source summary bar */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-sm py-xs">
              <div className="flex items-center gap-xs text-sm min-w-0">
                <Music className="h-4 w-4 shrink-0 text-accent-midi-200" />
                <span className="font-medium text-secondary-foreground truncate capitalize">{sourceLabel}</span>
              </div>
              {!isConverting && !isUploading && (
                <button
                  type="button"
                  onClick={() => {
                    if (isBatchMode) { clearBatch(); setBatchViewResult(null); }
                    handleClear();
                  }}
                  className="text-xs text-muted-foreground hover:text-secondary-foreground underline shrink-0 ml-2"
                >
                  Change source
                </button>
              )}
            </div>

            {/* Settings */}
            <div ref={settingsSectionRef} className="midi-workspace-section">
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
                midiJobId={activeMidiJobId}
                disabled={isConverting || isUploading}
              />

              <MidiConvertSettings
                settings={settings}
                onUpdate={updateSettings}
                disabled={isConverting || isUploading}
              />
            </div>

            {/* Usage info */}
            {!subscriptionInactive && !usageLoading && (
              <div className="flex items-center gap-xs text-xs text-muted-foreground px-sm py-1">
                <span>
                  Cost: <span className="font-medium text-accent-midi-200">1 token</span> per conversion
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
                    {usageBalance < 1 && onViewPlans ? (
                      <button
                        type="button"
                        onClick={() => handleViewPlans("token_low")}
                        className="text-xs font-medium text-accent-midi-300 underline-offset-2 hover:underline"
                      >
                        Get more tokens
                      </button>
                    ) : usageBalance < 1 ? (
                      <span className="text-destructive-300/80 text-meta">— not enough tokens</span>
                    ) : null}
                  </>
                )}
              </div>
            )}

            {/* Convert button */}
            {!isBatchMode && (
              <div className="flex flex-wrap items-center gap-sm">
                {subscriptionInactive ? (
                  <>
                    <div className="midi-callout">
                      <p className="midi-callout__title">Subscribe to unlock MIDI conversion</p>
                      <p className="midi-callout__body">
                        Paid plans include Audio-to-MIDI. Each conversion uses 1 token from your balance.
                      </p>
                    </div>
                    {onViewPlans ? (
                      <button
                        type="button"
                        onClick={() => handleViewPlans("subscription_inactive")}
                        className="midi-btn midi-btn--play text-sm"
                      >
                        View plans
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid="midi-convert-button"
                    onClick={() => void triggerConvert(splitJobId)}
                    disabled={!canConvert}
                    className="midi-btn midi-btn--play text-sm px-lg disabled:opacity-45"
                  >
                    {isConverting || isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isUploading ? "Uploading…" : "Converting…"}
                      </>
                    ) : (
                      "Convert to MIDI"
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Batch button */}
            {showBatchButton && !subscriptionInactive && (
              <div className="flex flex-wrap items-center gap-sm px-sm">
                <button
                  type="button"
                  data-testid="midi-batch-convert-button"
                  onClick={() => splitJobId && void triggerBatchConvert(splitJobId, stemNames)}
                  disabled={!canBatch}
                  className="midi-btn text-sm"
                >
                  <Music className="h-4 w-4" aria-hidden />
                  Convert All Stems
                </button>
                <span className="text-xs text-muted-foreground">
                  Estimated cost:{" "}
                  <span className="font-medium text-accent-midi-200">{batchCost} tokens</span>
                  {" "}({splitResultStems.length} stems × 1)
                </span>
                {usageBalance !== null && usageBalance < batchCost && onViewPlans ? (
                  <button
                    type="button"
                    onClick={() => handleViewPlans("batch_token_low")}
                    className="text-xs font-medium text-accent-midi-300 underline-offset-2 hover:underline"
                  >
                    Upgrade for {batchCost} tokens
                  </button>
                ) : usageBalance !== null && usageBalance < batchCost ? (
                  <span className="text-xs text-destructive-300/80">
                    — not enough tokens (need {batchCost}, have {Math.floor(usageBalance)})
                  </span>
                ) : null}
              </div>
            )}

            {/* Progress bar */}
            <MidiConvertProgress
              isConverting={isConverting}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              progress={progress}
              statusMessage={statusMessage}
              onCancel={cancelConvert}
            />
          </motion.div>
        )}

        {stage === "editor" && (
          <motion.div key="stage-editor" {...animProps} className="flex flex-col gap-md">
            <MidiLaneDrawer
              title="Conversion config"
              subtitle={settingsDrawerOpen ? undefined : settingsSubtitle}
              open={settingsDrawerOpen}
              onToggle={() => setSettingsDrawerOpen((v) => !v)}
            >
              <div ref={settingsSectionRef}>
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
                  midiJobId={activeMidiJobId}
                  disabled={isConverting || isUploading}
                />

                <MidiConvertSettings
                  settings={settings}
                  onUpdate={updateSettings}
                  disabled={isConverting || isUploading}
                />
              </div>
              <button
                type="button"
                data-testid="midi-convert-again-button"
                onClick={() => {
                  setBatchViewResult(null);
                  void triggerConvert(splitJobId);
                }}
                disabled={!canConvert}
                className="midi-btn text-sm mt-sm"
              >
                Convert again
              </button>
            </MidiLaneDrawer>

            {result && (
              <MidiResultPanel
                result={result}
                onDownload={downloadMidi}
                isDownloading={isDownloadingMidi}
                downloadError={downloadError}
                onNewConversion={() => {
                  setDownloadError(null);
                  setBatchViewResult(null);
                  handleClear();
                }}
                jobId={displayJobId}
                jobToken={displayJobToken}
                sourceLabel={batchViewResult?.stemName ?? downloadSourceLabel ?? undefined}
                initialMode="edit"
                onApplyReconvertBpm={(bpm) => {
                  updateSettings({ quantizeBpm: bpm, quantize: true });
                }}
                onAdjustSettings={scrollToSettings}
                onRetry={() => {
                  setDownloadError(null);
                  void triggerConvert(splitJobId);
                }}
                onOpenExportHistory={onOpenExportHistory ?? undefined}
                comparisonSource={comparisonSource}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch multi-track editor — all completed stems as separate tracks */}
      {isBatchMode && batchMultiTrackOpen && batchEditorTracks.length >= 2 && (
        <div className="flex flex-col gap-sm rounded-lg border border-accent-midi/25 bg-accent-midi-950/10 p-sm">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <div>
              <p className="text-sm font-semibold text-secondary-foreground">
                Multi-track editor
              </p>
              <p className="text-xs text-muted-foreground">
                {batchEditorTracks.length} stems loaded — edit, solo, and render together.
                Use <span className="font-medium">Save all stems</span> to write each track back to its job,
                or <span className="font-medium">Export</span> in the editor toolbar for one merged MIDI file.
              </p>
            </div>
            <button
              type="button"
              className="midi-btn text-xs"
              onClick={() => setBatchMultiTrackOpen(false)}
            >
              Close editor
            </button>
          </div>
          <MidiNoteEditor
            key={batchEditorTracks.map((t) => t.id).join("-")}
            initialNotes={[]}
            initialTracks={batchEditorTracks}
            bpm={settings.quantizeBpm || 120}
            sourceLabel="batch-stems"
          />
        </div>
      )}

      {/* Open editor overlay: when batch mode has batchViewResult, show result panel above stage */}
      {isBatchMode && batchViewResult && (
        <div className="flex flex-col gap-md">
          <MidiLaneDrawer
            title="Conversion config"
            subtitle={settingsDrawerOpen ? undefined : settingsSubtitle}
            open={settingsDrawerOpen}
            onToggle={() => setSettingsDrawerOpen((v) => !v)}
          >
            <div ref={settingsSectionRef}>
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
                midiJobId={activeMidiJobId}
                disabled={isConverting || isUploading}
              />

              <MidiConvertSettings
                settings={settings}
                onUpdate={updateSettings}
                disabled={isConverting || isUploading}
              />
            </div>
            <button
              type="button"
              data-testid="midi-convert-again-button"
              onClick={() => {
                setBatchViewResult(null);
                void triggerConvert(splitJobId);
              }}
              disabled={!canConvert}
              className="midi-btn text-sm mt-sm"
            >
              Convert again
            </button>
          </MidiLaneDrawer>

          <MidiResultPanel
            result={batchViewResult.result}
            onDownload={downloadMidi}
            isDownloading={isDownloadingMidi}
            downloadError={downloadError}
            onNewConversion={() => {
              setDownloadError(null);
              setBatchViewResult(null);
            }}
            jobId={batchViewResult.jobId}
            jobToken={batchViewResult.jobToken}
            sourceLabel={batchViewResult.stemName}
            initialMode="edit"
            onApplyReconvertBpm={(bpm) => {
              updateSettings({ quantizeBpm: bpm, quantize: true });
            }}
            onAdjustSettings={scrollToSettings}
            onRetry={() => {
              setDownloadError(null);
              void triggerConvert(splitJobId);
            }}
            onOpenExportHistory={onOpenExportHistory ?? undefined}
            comparisonSource={comparisonSource}
          />

          <button
            type="button"
            onClick={() => setBatchViewResult(null)}
            className="midi-btn text-sm self-start"
          >
            ← Back to batch results
          </button>
        </div>
      )}

      {/* Error — AnimatePresence for smooth dismiss */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="midi-error"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          >
            <ErrorState
              variant="server"
              title="Conversion failed"
              description={error}
              onRetry={() => { setError(null); void triggerConvert(splitJobId); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success flash — fires when conversion completes */}
      <SuccessFlash show={showSuccessFlash} onComplete={() => setShowSuccessFlash(false)} />
    </div>
  );
}
