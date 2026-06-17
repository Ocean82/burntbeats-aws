import { Loader2, Mic2 } from "lucide-react";
import { AUDIO_INPUT_ACCEPT } from "../../config";
import { useEffect, useMemo } from "react";
import { useSpeechEnhance } from "../../hooks/useSpeechEnhance";
import { InfoPopover } from "../ui/InfoPopover";
import { useAudioFileDuration } from "../../hooks/useAudioFileDuration";
import { computeTokensFromDurationSeconds } from "../../utils/tokenCost";
import { UsageTokenRow } from "../processing-settings/UsageTokenRow";
import { SpeechUploadZone } from "./SpeechUploadZone";
import { SpeechEnhanceProgress } from "./SpeechEnhanceProgress";
import { SpeechResultPlayer } from "./SpeechResultPlayer";
import { ErrorState } from "../ui/error-state";
import { EmptyState } from "../ui/empty-state";

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
  const originalBlobUrl = useMemo(() => {
    if (!uploadedFile || !outputUrl) return null;
    return URL.createObjectURL(uploadedFile);
  }, [uploadedFile, outputUrl]);

  useEffect(() => {
    if (!originalBlobUrl) return;
    return () => URL.revokeObjectURL(originalBlobUrl);
  }, [originalBlobUrl]);

  return (
    <div data-testid="speech-clean-panel" className="flex flex-col gap-md">
      <div className="flex flex-wrap items-start justify-between gap-sm border-b border-info-400/15 pb-md">
        <div className="flex min-w-0 flex-1 items-start gap-sm">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-info-400/35 bg-info-500/15">
            <Mic2 className="h-5 w-5 text-info-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Speech Clean
            </h2>
            <p className="w-full shrink-0 mt-0.5 text-sm text-info-100/55">
              Denoise and restore voice recordings. This tool is tuned for
              speech, not music stem separation.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-info-400/35 bg-info-500/10 px-sm py-1 text-meta font-bold uppercase tracking-wider text-info-200">
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

      {!uploadedFile && !outputUrl && !isEnhancing && (
        <EmptyState
          icon={<Mic2 className="h-6 w-6" />}
          title="No enhancements yet"
          description="Enhance a vocal or speech recording to get started"
          action={{ label: "Enhance Audio", onClick: handleBrowse }}
        />
      )}

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

      <div className="flex flex-wrap items-center gap-md text-sm text-secondary-foreground">
        <label className="inline-flex cursor-pointer items-center gap-xs">
          <input
            type="checkbox"
            checked={denoise}
            onChange={(e) => setDenoise(e.target.checked)}
            disabled={isEnhancing}
            className="rounded border-info-400/40 bg-info-950/40 text-info-400 focus:ring-info-400/50"
          />
          Remove background noise
        </label>
        <span className="inline-flex items-center gap-xs">
          <label className="inline-flex cursor-pointer items-center gap-xs">
            <input
              type="checkbox"
              checked={batch}
              onChange={(e) => setBatch(e.target.checked)}
              disabled={isEnhancing}
              className="rounded border-info-400/40 bg-info-950/40 text-info-400 focus:ring-info-400/50"
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
            jobLabel="This job"
            showBalance={false}
          />
        )}

      <div className="flex flex-wrap items-center gap-sm">
        <button
          type="button"
          data-testid="speech-enhance-button"
          onClick={() => void triggerEnhance()}
          disabled={!uploadedFile || isEnhancing || !!outputUrl}
          className="inline-flex min-h-[44px] items-center justify-center gap-xs rounded-xl border border-info-300/50 bg-gradient-to-r from-info-600/90 to-sky-600/90 px-lg py-sm text-sm font-bold text-foreground shadow-[0_0_24px_rgba(34,211,238,0.2)] transition hover:from-info-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-45"
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
            className="min-h-[44px] rounded-xl border border-border px-md py-xs text-sm text-secondary-foreground hover:border-border hover:text-foreground"
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
        <ErrorState
          variant="server"
          title="Enhancement failed"
          description={error}
          onRetry={() => {
            setError(null);
            void triggerEnhance();
          }}
        />
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
