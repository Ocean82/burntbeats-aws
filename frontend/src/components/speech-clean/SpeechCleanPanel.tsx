import { AlertCircle, Loader2, Mic2 } from "lucide-react";
import { AUDIO_INPUT_ACCEPT } from "../../config";
import { useEffect, useState } from "react";
import { useSpeechEnhance } from "../../hooks/useSpeechEnhance";
import { InfoPopover } from "../ui/InfoPopover";
import { useAudioFileDuration } from "../../hooks/useAudioFileDuration";
import { computeTokensFromDurationSeconds } from "../../utils/tokenCost";
import { UsageTokenRow } from "../processing-settings/UsageTokenRow";
import { SpeechUploadZone } from "./SpeechUploadZone";
import { SpeechEnhanceProgress } from "./SpeechEnhanceProgress";
import { SpeechResultPlayer } from "./SpeechResultPlayer";

export interface SpeechCleanPanelProps {
  usageBalance?: number | null;
  usageLoading?: boolean;
  subscriptionInactive?: boolean;
}

export function SpeechCleanPanel({
  usageBalance = null,
  usageLoading = false,
  subscriptionInactive = false,
}: SpeechCleanPanelProps) {
  const {
    inputRef,
    uploadedFile,
    uploadName,
    isDragging,
    setIsDragging,
    denoise,
    setDenoise,
    batch,
    setBatch,
    isEnhancing,
    isUploading,
    uploadProgress,
    enhanceProgress,
    statusMessage,
    error,
    setError,
    outputUrl,
    handleBrowse,
    acceptFile,
    handleClear,
    triggerEnhance,
  } = useSpeechEnhance();
  const durationSec = useAudioFileDuration(uploadedFile);
  const estimatedTokens = computeTokensFromDurationSeconds(durationSec);
  const [originalBlobUrl, setOriginalBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadedFile || !outputUrl) {
      setOriginalBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadedFile);
    setOriginalBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedFile, outputUrl]);

  return (
    <div data-testid="speech-clean-panel" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-400/15 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/35 bg-cyan-500/15">
            <Mic2 className="h-5 w-5 text-cyan-300" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Speech Clean
            </h2>
            <p className="mt-0.5 max-w-xl text-sm text-cyan-100/55">
              Denoise and restore voice recordings. This tool is tuned for speech — not music stem separation.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
          Speech only
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_INPUT_ACCEPT}
        aria-label="Upload audio file for speech enhancement"
        className="sr-only"
        onChange={(e) => {
          acceptFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <SpeechUploadZone
        uploadName={uploadName}
        uploadedFile={uploadedFile}
        durationSec={durationSec}
        estimatedTokens={estimatedTokens}
        onBrowse={handleBrowse}
        onClear={handleClear}
        onDrop={acceptFile}
        isDragging={isDragging}
        onSetIsDragging={setIsDragging}
      />

      <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={denoise}
            onChange={(e) => setDenoise(e.target.checked)}
            disabled={isEnhancing}
            className="rounded border-cyan-400/40 bg-cyan-950/40 text-cyan-400 focus:ring-cyan-400/50"
          />
          Remove background noise
        </label>
        <span className="inline-flex items-center gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={batch}
              onChange={(e) => setBatch(e.target.checked)}
              disabled={isEnhancing}
              className="rounded border-cyan-400/40 bg-cyan-950/40 text-cyan-400 focus:ring-cyan-400/50"
            />
            Long recording mode
          </label>
          <InfoPopover
            label="Long recording mode help"
            title="Long recording mode"
            body="Splits long files into chunks for more stable processing. Best for podcasts, interviews, and recordings over several minutes."
          />
        </span>
      </div>

      {!subscriptionInactive &&
        (usageLoading || usageBalance !== null || estimatedTokens !== null) && (
          <UsageTokenRow
            usageBalance={usageBalance}
            usageLoading={usageLoading}
            estimatedSplitTokens={estimatedTokens}
            estimatedExpandTokens={null}
            splitResultStemsLength={0}
            isExpanding={false}
            isSplitting={isEnhancing}
            isSample={false}
            jobLabel="This job"
            showBalance={false}
          />
        )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="speech-enhance-button"
          onClick={() => void triggerEnhance()}
          disabled={!uploadedFile || isEnhancing || !!outputUrl}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-cyan-300/50 bg-gradient-to-r from-cyan-600/90 to-sky-600/90 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(34,211,238,0.2)] transition hover:from-cyan-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isEnhancing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Cleaning…
            </>
          ) : outputUrl ? (
            "Enhancement complete"
          ) : (
            "Clean speech"
          )}
        </button>
        {outputUrl && (
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[44px] rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 hover:border-white/30 hover:text-white"
          >
            New recording
          </button>
        )}
      </div>

      <SpeechEnhanceProgress
        isEnhancing={isEnhancing}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        enhanceProgress={enhanceProgress}
        statusMessage={statusMessage}
      />

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

      {outputUrl && !isEnhancing && (
        <SpeechResultPlayer
          outputUrl={outputUrl}
          uploadName={uploadName}
          originalBlobUrl={originalBlobUrl}
        />
      )}
    </div>
  );
}
