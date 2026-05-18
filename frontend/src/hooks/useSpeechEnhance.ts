import { useCallback, useRef, useState } from "react";
import { enhanceSpeech } from "../api/speech";
import { ALLOWED_AUDIO_FORMATS_LABEL } from "../config";
import { trackEvent } from "../analytics/events";

const ALLOWED_EXT = new Set([
  "wav",
  "mp3",
  "m4a",
  "flac",
  "ogg",
  "webm",
  "aac",
]);

export function useSpeechEnhance() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [denoise, setDenoise] = useState(true);
  const [batch, setBatch] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [enhanceProgress, setEnhanceProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const handleBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const acceptFile = useCallback((file: File | null) => {
    if (!file) return;
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase() ?? ""
      : "";
    if (!ALLOWED_EXT.has(ext)) {
      setError(
        `Unsupported format (.${ext || "unknown"}). Accepted: ${ALLOWED_AUDIO_FORMATS_LABEL}.`,
      );
      trackEvent("speech_upload_rejected_format", { file_extension: ext });
      return;
    }
    setError(null);
    setOutputUrl(null);
    setJobId(null);
    setUploadedFile(file);
    setUploadName(file.name);
    trackEvent("speech_upload_selected", { file_extension: ext });
  }, []);

  const handleClear = useCallback(() => {
    setUploadedFile(null);
    setUploadName("");
    setOutputUrl(null);
    setJobId(null);
    setError(null);
    setEnhanceProgress(0);
    setUploadProgress(0);
    setStatusMessage(null);
    trackEvent("speech_upload_cleared");
  }, []);

  const triggerEnhance = useCallback(async () => {
    if (!uploadedFile) {
      setError("Upload a speech recording first.");
      return;
    }
    setIsEnhancing(true);
    setIsUploading(true);
    setUploadProgress(0);
    setEnhanceProgress(0);
    setError(null);
    setOutputUrl(null);
    setStatusMessage("Uploading…");

    try {
      trackEvent("speech_enhance_started", { denoise, batch });
      const result = await enhanceSpeech(
        uploadedFile,
        { denoise, batch },
        (status) => {
          setEnhanceProgress(status.progress ?? 0);
          if (status.status === "queued") {
            setStatusMessage("Queued…");
            setIsUploading(false);
          } else if (status.status === "processing") {
            setStatusMessage(status.message || "Cleaning speech…");
            setIsUploading(false);
          }
        },
        (evt) => {
          setUploadProgress(evt.percent);
          setIsUploading(true);
        },
      );
      setJobId(result.job_id);
      setOutputUrl(result.output_url);
      setEnhanceProgress(100);
      setStatusMessage("Done");
      trackEvent("speech_enhance_completed", { job_id: result.job_id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Speech enhancement failed";
      setError(msg);
      trackEvent("speech_enhance_failed", { message: msg.slice(0, 120) });
    } finally {
      setIsEnhancing(false);
      setIsUploading(false);
    }
  }, [uploadedFile, denoise, batch]);

  return {
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
    jobId,
    outputUrl,
    handleBrowse,
    acceptFile,
    handleClear,
    triggerEnhance,
  };
}
