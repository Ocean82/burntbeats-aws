/**
 * useMidiConvert — manages the full MIDI conversion lifecycle.
 * Handles source selection, file upload, job submission, polling, and result state.
 * Includes batch conversion support for converting all stems at once.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { authHeaders, setJobToken as storeJobToken } from "../api/auth";
import { trackEvent } from "../analytics/events";
import {
  API_BASE,
  isAllowedMidiAudioFile,
  MIDI_ALLOWED_AUDIO_FORMATS_LABEL,
  MIDI_MAX_UPLOAD_BYTES,
} from "../config";
import { useAppStore } from "../store/appStore";
import { uploadWithProgress } from "../utils/uploadWithProgress";

export type MidiSourceMode = "split" | "upload" | "loaded";

export interface MidiConvertSettings {
  minConfidence: number;
  minNoteLengthMs: number;
  includePitchBends: boolean;
  quantize: boolean;
  quantizeGrid: string;
  quantizeBpm: number;
  /** 0–1 blend toward grid when quantize is enabled (1 = full snap). */
  quantizeStrength: number;
  /** Scale peak velocity to target while preserving dynamics. */
  normalizeVelocity: boolean;
  targetVelocity: number;
  /** Cap note length in ms (0 = no cap beyond min note length). */
  maxNoteLengthMs: number;
  /** Transpose output by N semitones (-48 to +48). */
  transpose: number;
}

export interface MidiAnalysis {
  estimated_key: string;
  scale: string;
  pitch_range: {
    min: number;
    max: number;
    min_name: string;
    max_name: string;
  };
  note_density: number;
  suggested_bpm: number | null;
  complexity_score: number;
  total_notes: number;
}

export interface MidiNoteEvent {
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export interface MidiConvertResult {
  notesDetected: number;
  durationSeconds: number;
  tracks: number;
  inferenceTimeSeconds: number;
  pianoRollNotes: MidiNoteEvent[];
  analysis: MidiAnalysis | null;
}

export interface BatchJob {
  stemName: string;
  jobId: string | null;
  jobToken: string | null;
  fileUrl: string | null;
  status: "pending" | "converting" | "completed" | "failed";
  result: MidiConvertResult | null;
  error: string | null;
}

interface PollResponse {
  status: string;
  job_id: string;
  progress: number;
  message?: string;
  error?: string;
  result?: {
    notes_detected: number;
    duration_seconds: number;
    tracks: number;
    inference_time_seconds: number;
    piano_roll_notes: MidiNoteEvent[];
    analysis?: MidiAnalysis;
  };
}

interface ConvertJobResponse {
  job_id: string;
  job_token: string;
  file_url?: string;
}

const DEFAULT_SETTINGS: MidiConvertSettings = {
  minConfidence: 0.5,
  minNoteLengthMs: 58,
  includePitchBends: true,
  quantize: false,
  quantizeGrid: "1/16",
  quantizeBpm: 120,
  quantizeStrength: 1,
  normalizeVelocity: true,
  targetVelocity: 90,
  maxNoteLengthMs: 0,
  transpose: 0,
};

const MIDI_ACCEPT_TIMEOUT_MS =
  Number(import.meta.env.VITE_MIDI_ACCEPT_TIMEOUT_MS) || 120_000;

function appendSettingsToForm(
  formData: FormData,
  settings: MidiConvertSettings,
) {
  formData.append("min_confidence", settings.minConfidence.toString());
  formData.append("min_note_length_ms", settings.minNoteLengthMs.toString());
  formData.append(
    "include_pitch_bends",
    settings.includePitchBends ? "true" : "false",
  );
  if (settings.quantize) {
    formData.append("quantize", "true");
    formData.append("quantize_grid", settings.quantizeGrid);
    formData.append("quantize_bpm", settings.quantizeBpm.toString());
    formData.append("quantize_strength", settings.quantizeStrength.toString());
  }
  formData.append(
    "normalize_velocity",
    settings.normalizeVelocity ? "true" : "false",
  );
  formData.append("target_velocity", settings.targetVelocity.toString());
  formData.append("max_note_length_ms", settings.maxNoteLengthMs.toString());
  formData.append("transpose", settings.transpose.toString());
}

function normalizeFileUrl(fileUrl: string | undefined): string | null {
  if (!fileUrl) return null;
  return fileUrl.startsWith("http") ? new URL(fileUrl).pathname : fileUrl;
}

export function useMidiConvert() {
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const loadedStems = useAppStore((s) => s.loadedStems);

  const [userSourceMode, setUserSourceMode] = useState<MidiSourceMode | null>(
    null,
  );
  const [selectedStem, setSelectedStem] = useState<string | null>(null);
  const [selectedLoadedStemId, setSelectedLoadedStemId] = useState<
    string | null
  >(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const [settings, setSettings] =
    useState<MidiConvertSettings>(DEFAULT_SETTINGS);

  const [isConverting, setIsConverting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<MidiConvertResult | null>(null);
  const [midiFileUrl, setMidiFileUrl] = useState<string | null>(null);
  const [jobToken, setJobToken] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sourceMode: MidiSourceMode = useMemo(() => {
    const hasSplit = splitResultStems.length > 0;
    const hasLoaded = loadedStems.length > 0;
    if (userSourceMode === "split" && hasSplit) return "split";
    if (userSourceMode === "loaded" && hasLoaded) return "loaded";
    if (userSourceMode === "upload") return "upload";
    if (hasSplit) return "split";
    if (hasLoaded) return "loaded";
    return "upload";
  }, [userSourceMode, splitResultStems.length, loadedStems.length]);

  const setSourceMode = useCallback((mode: MidiSourceMode) => {
    setUserSourceMode(mode);
  }, []);

  const effectiveSelectedStem = useMemo(() => {
    if (sourceMode !== "split") return null;
    if (selectedStem && splitResultStems.some((s) => s.id === selectedStem)) {
      return selectedStem;
    }
    return splitResultStems[0]?.id ?? null;
  }, [sourceMode, selectedStem, splitResultStems]);

  const effectiveSelectedLoadedStemId = useMemo(() => {
    if (sourceMode !== "loaded") return null;
    if (
      selectedLoadedStemId &&
      loadedStems.some((s) => s.id === selectedLoadedStemId)
    ) {
      return selectedLoadedStemId;
    }
    return loadedStems[0]?.id ?? null;
  }, [sourceMode, selectedLoadedStemId, loadedStems]);

  const selectedSplitStemUrl = useMemo(() => {
    if (!effectiveSelectedStem) return null;
    return (
      splitResultStems.find((s) => s.id === effectiveSelectedStem)?.url ?? null
    );
  }, [effectiveSelectedStem, splitResultStems]);

  const selectedLoadedStem = useMemo(() => {
    if (!effectiveSelectedLoadedStemId) return null;
    return (
      loadedStems.find((s) => s.id === effectiveSelectedLoadedStemId) ?? null
    );
  }, [effectiveSelectedLoadedStemId, loadedStems]);

  const updateSettings = useCallback(
    (partial: Partial<MidiConvertSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  const acceptFile = useCallback((file: File | null) => {
    if (!file) {
      setUploadedFile(null);
      setUploadName("");
      setError(null);
      setResult(null);
      setMidiFileUrl(null);
      return;
    }
    if (!isAllowedMidiAudioFile(file.name)) {
      const ext = file.name.includes(".")
        ? (file.name.split(".").pop()?.toLowerCase() ?? "unknown")
        : "none";
      setError(
        `Unsupported format (.${ext}). Accepted for MIDI: ${MIDI_ALLOWED_AUDIO_FORMATS_LABEL}.`,
      );
      trackEvent("midi_upload_rejected_format", { file_extension: ext });
      return;
    }
    if (file.size > MIDI_MAX_UPLOAD_BYTES) {
      const mb = Math.round(MIDI_MAX_UPLOAD_BYTES / (1024 * 1024));
      setError(`File too large for MIDI conversion. Maximum size is ${mb}MB.`);
      return;
    }
    setUploadedFile(file);
    setUploadName(file.name);
    setError(null);
    setResult(null);
    setMidiFileUrl(null);
    const ext = file.name.includes(".")
      ? (file.name.split(".").pop()?.toLowerCase() ?? "unknown")
      : "none";
    trackEvent("midi_upload_selected", {
      file_extension: ext,
      file_size_mb: Number((file.size / (1024 * 1024)).toFixed(2)),
    });
  }, []);

  const handleBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleClear = useCallback(() => {
    setUploadedFile(null);
    setUploadName("");
    setSelectedStem(null);
    setSelectedLoadedStemId(null);
    setError(null);
    setResult(null);
    setMidiFileUrl(null);
    setProgress(0);
    setUploadProgress(0);
    setStatusMessage("");
    setIsConverting(false);
    setIsUploading(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    (jobId: string, token: string) => {
      const poll = async () => {
        try {
          const headers = await authHeaders();
          const res = await fetch(`${API_BASE}/api/midi/status/${jobId}`, {
            headers: { ...headers, "x-job-token": token },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
              data.error || `Status check failed (${res.status})`,
            );
          }
          const data: PollResponse = await res.json();

          setProgress(data.progress || 0);
          setStatusMessage(data.message || "");

          if (data.status === "completed" && data.result) {
            stopPolling();
            setIsConverting(false);
            setResult({
              notesDetected: data.result.notes_detected,
              durationSeconds: data.result.duration_seconds,
              tracks: data.result.tracks,
              inferenceTimeSeconds: data.result.inference_time_seconds,
              pianoRollNotes: data.result.piano_roll_notes || [],
              analysis: data.result.analysis ?? null,
            });
            trackEvent("midi_convert_completed", {
              notes_detected: data.result.notes_detected,
              duration_seconds: data.result.duration_seconds,
              inference_time_seconds: data.result.inference_time_seconds,
            });
          } else if (data.status === "failed") {
            stopPolling();
            setIsConverting(false);
            setError(data.error || "Conversion failed");
            trackEvent("midi_convert_failed", {
              error: (data.error || "unknown").slice(0, 120),
            });
          }
        } catch (e) {
          stopPolling();
          setIsConverting(false);
          setError(e instanceof Error ? e.message : "Polling failed");
        }
      };

      pollRef.current = setInterval(poll, 1500);
      void poll();
    },
    [stopPolling],
  );

  const submitConvertJob = useCallback(
    async (
      formData: FormData,
      usesFileUpload: boolean,
    ): Promise<ConvertJobResponse> => {
      const headers = await authHeaders();

      if (usesFileUpload) {
        setIsUploading(true);
        setUploadProgress(0);
        setStatusMessage("Uploading...");
        try {
          const uploadResult = await uploadWithProgress({
            url: `${API_BASE}/api/midi/convert`,
            formData,
            headers,
            timeoutMs: MIDI_ACCEPT_TIMEOUT_MS,
            onProgress: (evt) => {
              setUploadProgress(evt.percent);
              setStatusMessage(`Uploading… ${evt.percent}%`);
            },
          });
          setIsUploading(false);
          if (uploadResult.status < 200 || uploadResult.status >= 300) {
            let errMsg = `Conversion request failed (${uploadResult.status})`;
            try {
              const parsed = JSON.parse(uploadResult.body) as {
                error?: string;
              };
              if (parsed.error) errMsg = parsed.error;
            } catch {
              /* use default */
            }
            throw new Error(errMsg);
          }
          return JSON.parse(uploadResult.body) as ConvertJobResponse;
        } catch (e) {
          setIsUploading(false);
          throw e;
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        MIDI_ACCEPT_TIMEOUT_MS,
      );
      try {
        const res = await fetch(`${API_BASE}/api/midi/convert`, {
          method: "POST",
          headers,
          body: formData,
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.error || `Conversion request failed (${res.status})`,
          );
        }
        return res.json() as Promise<ConvertJobResponse>;
      } finally {
        clearTimeout(timer);
      }
    },
    [],
  );

  const resolveFileForConvert = useCallback((): File | null => {
    if (sourceMode === "upload") return uploadedFile;
    if (sourceMode === "loaded" && selectedLoadedStem?.file) {
      return selectedLoadedStem.file;
    }
    return null;
  }, [sourceMode, uploadedFile, selectedLoadedStem]);

  const triggerConvert = useCallback(
    async (splitJobId?: string | null) => {
      setError(null);
      setResult(null);
      setMidiFileUrl(null);
      setProgress(0);
      setUploadProgress(0);
      setStatusMessage("Submitting...");
      setIsConverting(true);

      trackEvent("midi_convert_started", {
        source_mode: sourceMode,
        stem_name:
          effectiveSelectedStem || effectiveSelectedLoadedStemId || "none",
        min_confidence: settings.minConfidence,
        include_pitch_bends: settings.includePitchBends,
      });

      try {
        const formData = new FormData();
        let usesFileUpload = false;

        if (sourceMode === "split" && effectiveSelectedStem && splitJobId) {
          formData.append("stem_job_id", splitJobId);
          formData.append("stem_name", effectiveSelectedStem);
        } else if (sourceMode === "upload" && uploadedFile) {
          formData.append("file", uploadedFile);
          usesFileUpload = true;
        } else if (sourceMode === "loaded") {
          const file = resolveFileForConvert();
          if (!file) {
            setError("Select a loaded stem first.");
            setIsConverting(false);
            return;
          }
          formData.append("file", file);
          usesFileUpload = true;
        } else {
          setError("Select a stem or upload a file first.");
          setIsConverting(false);
          return;
        }

        appendSettingsToForm(formData, settings);

        const data = await submitConvertJob(formData, usesFileUpload);
        const token = data.job_token;
        setJobToken(token);
        storeJobToken(data.job_id, token);
        setMidiFileUrl(normalizeFileUrl(data.file_url));
        setStatusMessage("Queued...");
        pollStatus(data.job_id, token);
      } catch (e) {
        setIsConverting(false);
        setIsUploading(false);
        const msg = e instanceof Error ? e.message : "Conversion failed";
        setError(msg);
        trackEvent("midi_convert_failed", { error: msg.slice(0, 120) });
      }
    },
    [
      sourceMode,
      effectiveSelectedStem,
      effectiveSelectedLoadedStemId,
      uploadedFile,
      settings,
      pollStatus,
      submitConvertJob,
      resolveFileForConvert,
    ],
  );

  const downloadMidi = useCallback(async () => {
    if (!midiFileUrl || !jobToken) return;
    trackEvent("midi_download_started");
    try {
      const headers = await authHeaders();
      const res = await fetch(midiFileUrl, {
        headers: { ...headers, "x-job-token": jobToken },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "output.mid";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(midiFileUrl, "_blank");
    }
  }, [midiFileUrl, jobToken]);

  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const batchAbortRef = useRef(false);

  const batchProgress = useMemo(() => {
    const completed = batchJobs.filter((j) => j.status === "completed").length;
    return { completed, total: batchJobs.length };
  }, [batchJobs]);

  const pollBatchJob = useCallback(
    async (jobId: string, token: string): Promise<PollResponse> => {
      const POLL_INTERVAL = 1500;
      const MAX_POLLS = 400;
      let polls = 0;

      while (polls < MAX_POLLS) {
        const headers = await authHeaders();
        const res = await fetch(`${API_BASE}/api/midi/status/${jobId}`, {
          headers: { ...headers, "x-job-token": token },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Status check failed (${res.status})`);
        }
        const data: PollResponse = await res.json();

        if (data.status === "completed" && data.result) return data;
        if (data.status === "failed") {
          throw new Error(data.error || "Conversion failed");
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        polls++;
      }
      throw new Error("Conversion timed out");
    },
    [],
  );

  const convertSingleStem = useCallback(
    async (
      splitJobId: string,
      stemName: string,
    ): Promise<{
      jobId: string;
      token: string;
      fileUrl: string | null;
      result: MidiConvertResult;
    }> => {
      const formData = new FormData();
      formData.append("stem_job_id", splitJobId);
      formData.append("stem_name", stemName);
      appendSettingsToForm(formData, settings);

      const data = await submitConvertJob(formData, false);
      const token = data.job_token;
      storeJobToken(data.job_id, token);

      const fileUrl = normalizeFileUrl(data.file_url);
      const pollResult = await pollBatchJob(data.job_id, token);

      return {
        jobId: data.job_id,
        token,
        fileUrl,
        result: {
          notesDetected: pollResult.result!.notes_detected,
          durationSeconds: pollResult.result!.duration_seconds,
          tracks: pollResult.result!.tracks,
          inferenceTimeSeconds: pollResult.result!.inference_time_seconds,
          pianoRollNotes: pollResult.result!.piano_roll_notes || [],
          analysis: pollResult.result!.analysis ?? null,
        },
      };
    },
    [settings, pollBatchJob, submitConvertJob],
  );

  const triggerBatchConvert = useCallback(
    async (splitJobId: string, stemNames: string[]) => {
      setIsBatchMode(true);
      batchAbortRef.current = false;
      setError(null);

      const initialJobs: BatchJob[] = stemNames.map((name) => ({
        stemName: name,
        jobId: null,
        jobToken: null,
        fileUrl: null,
        status: "pending",
        result: null,
        error: null,
      }));
      setBatchJobs(initialJobs);

      trackEvent("midi_batch_convert_started", {
        stem_count: stemNames.length,
      });

      for (let i = 0; i < stemNames.length; i++) {
        if (batchAbortRef.current) break;

        const stemName = stemNames[i];
        setBatchJobs((prev) =>
          prev.map((job, idx) =>
            idx === i ? { ...job, status: "converting" } : job,
          ),
        );

        try {
          const {
            jobId,
            token,
            fileUrl,
            result: stemResult,
          } = await convertSingleStem(splitJobId, stemName);

          setBatchJobs((prev) =>
            prev.map((job, idx) =>
              idx === i
                ? {
                    ...job,
                    status: "completed",
                    jobId,
                    jobToken: token,
                    fileUrl,
                    result: stemResult,
                  }
                : job,
            ),
          );
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Conversion failed";
          setBatchJobs((prev) =>
            prev.map((job, idx) =>
              idx === i ? { ...job, status: "failed", error: errorMsg } : job,
            ),
          );
          trackEvent("midi_batch_stem_failed", {
            stem_name: stemName,
            error: errorMsg.slice(0, 120),
          });
        }
      }

      trackEvent("midi_batch_convert_finished", {
        stem_count: stemNames.length,
      });
    },
    [convertSingleStem],
  );

  const retryBatchJob = useCallback(
    async (splitJobId: string, index: number) => {
      const job = batchJobs[index];
      if (!job || job.status !== "failed") return;

      setBatchJobs((prev) =>
        prev.map((j, idx) =>
          idx === index ? { ...j, status: "converting", error: null } : j,
        ),
      );

      try {
        const {
          jobId,
          token,
          fileUrl,
          result: stemResult,
        } = await convertSingleStem(splitJobId, job.stemName);

        setBatchJobs((prev) =>
          prev.map((j, idx) =>
            idx === index
              ? {
                  ...j,
                  status: "completed",
                  jobId,
                  jobToken: token,
                  fileUrl,
                  result: stemResult,
                }
              : j,
          ),
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Conversion failed";
        setBatchJobs((prev) =>
          prev.map((j, idx) =>
            idx === index ? { ...j, status: "failed", error: errorMsg } : j,
          ),
        );
      }
    },
    [batchJobs, convertSingleStem],
  );

  const clearBatch = useCallback(() => {
    batchAbortRef.current = true;
    setBatchJobs([]);
    setIsBatchMode(false);
  }, []);

  const hasSourceSelected =
    (sourceMode === "split" && !!effectiveSelectedStem) ||
    (sourceMode === "upload" && !!uploadedFile) ||
    (sourceMode === "loaded" &&
      !!effectiveSelectedLoadedStemId &&
      !!selectedLoadedStem?.file);

  return {
    sourceMode,
    setSourceMode,
    selectedStem: effectiveSelectedStem,
    setSelectedStem,
    selectedLoadedStemId: effectiveSelectedLoadedStemId,
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
    midiFileUrl,
    downloadMidi,
    triggerConvert,
    batchJobs,
    isBatchMode,
    batchProgress,
    triggerBatchConvert,
    retryBatchJob,
    clearBatch,
  };
}
