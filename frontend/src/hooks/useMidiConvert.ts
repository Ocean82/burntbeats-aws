/**
 * useMidiConvert — manages the full MIDI conversion lifecycle.
 * Handles source selection, file upload, job submission, polling, and result state.
 * Includes batch conversion support for converting all stems at once.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { authHeaders, setJobToken as storeJobToken } from "../api/auth";
import { streamMidiJobUntilDone } from "../api/midiStatus";
import { trackEvent } from "../analytics/events";
import {
  API_BASE,
  isAllowedMidiAudioFile,
  MIDI_ALLOWED_AUDIO_FORMATS_LABEL,
  MIDI_MAX_UPLOAD_BYTES,
} from "../config";
import { useAppStore } from "../store/appStore";
import { uploadWithProgress } from "../utils/uploadWithProgress";
import { userFacingApiError } from "../userFacingError";
import {
  buildMidiDownloadName,
  classifyMidiHttpError,
  midiErrorMessage,
} from "../utils/midiErrors";

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

export interface MidiTrackInfo {
  index: number;
  name: string;
  instrument?: number | null;
  instrument_name?: string | null;
  notes: number;
  is_drum: boolean;
}

export interface MidiFileAnalysisDetail {
  has_drums: boolean;
  genre_hints?: string[];
  track_info?: MidiTrackInfo[];
  complexity_score?: number;
  tempo_bpm?: number | null;
  key_signature?: string;
}

export interface MidiNoteEvent {
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
  /** Pre-post-process model amplitude (0–1) when provided by the conversion service. */
  confidence?: number;
}

export interface MidiConvertResult {
  notesDetected: number;
  durationSeconds: number;
  tracks: number;
  inferenceTimeSeconds: number;
  pianoRollNotes: MidiNoteEvent[];
  analysis: MidiAnalysis | null;
  fileAnalysis: MidiFileAnalysisDetail | null;
  emptyTranscription?: boolean;
}

export interface BatchJob {
  stemName: string;
  jobId: string | null;
  jobToken: string | null;
  fileUrl: string | null;
  status: "pending" | "converting" | "completed" | "failed" | "cancelled";
  result: MidiConvertResult | null;
  error: string | null;
  progress?: number;
  statusMessage?: string;
}

interface PollResponse {
  status: string;
  job_id: string;
  progress: number;
  message?: string;
  error?: string;
  empty_transcription?: boolean;
  warning?: string;
  midi_file_analysis?: MidiFileAnalysisDetail;
  result?: {
    notes_detected: number;
    duration_seconds: number;
    tracks: number;
    inference_time_seconds: number;
    piano_roll_notes: MidiNoteEvent[];
    analysis?: MidiAnalysis;
    midi_file_analysis?: MidiFileAnalysisDetail;
  };
}

const DRUMS_PRESET_PARTIAL: Partial<MidiConvertSettings> = {
  minConfidence: 0.35,
  minNoteLengthMs: 20,
  includePitchBends: false,
  maxNoteLengthMs: 500,
};

const BATCH_CONCURRENCY = 2;

function resolveUserFacingError(raw: unknown, fallback: string): string {
  if (raw instanceof Error) return userFacingApiError(raw.message, fallback);
  if (typeof raw === "string") return userFacingApiError(raw, fallback);
  return fallback;
}

function parseFileAnalysis(
  raw: MidiFileAnalysisDetail | undefined,
): MidiFileAnalysisDetail | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    has_drums: raw.has_drums === true,
    genre_hints: Array.isArray(raw.genre_hints) ? raw.genre_hints : undefined,
    track_info: Array.isArray(raw.track_info) ? raw.track_info : undefined,
    complexity_score:
      typeof raw.complexity_score === "number" ? raw.complexity_score : undefined,
    tempo_bpm: raw.tempo_bpm ?? undefined,
    key_signature:
      typeof raw.key_signature === "string" ? raw.key_signature : undefined,
  };
}

function buildConvertResult(
  poll: PollResponse,
): MidiConvertResult | null {
  if (!poll.result) return null;
  const fileAnalysis =
    parseFileAnalysis(poll.midi_file_analysis) ??
    parseFileAnalysis(poll.result.midi_file_analysis);
  return {
    notesDetected: poll.result.notes_detected,
    durationSeconds: poll.result.duration_seconds,
    tracks: poll.result.tracks,
    inferenceTimeSeconds: poll.result.inference_time_seconds,
    pianoRollNotes: poll.result.piano_roll_notes || [],
    analysis: poll.result.analysis ?? null,
    fileAnalysis,
    emptyTranscription:
      poll.empty_transcription === true || poll.result.notes_detected === 0,
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
  const [isDownloadingMidi, setIsDownloadingMidi] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [result, setResult] = useState<MidiConvertResult | null>(null);
  const [midiFileUrl, setMidiFileUrl] = useState<string | null>(null);
  const [jobToken, setJobToken] = useState<string | null>(null);
  const [activeMidiJobId, setActiveMidiJobId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const drumsPresetAppliedRef = useRef(false);
  const isDownloadingMidiRef = useRef(false);

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

  const maybeApplyDrumsPreset = useCallback(
    (fileAnalysis: MidiFileAnalysisDetail | null) => {
      if (!fileAnalysis?.has_drums || drumsPresetAppliedRef.current) return;
      drumsPresetAppliedRef.current = true;
      setSettings((prev) => ({ ...prev, ...DRUMS_PRESET_PARTIAL }));
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
    drumsPresetAppliedRef.current = false;
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
    setActiveMidiJobId(null);
    drumsPresetAppliedRef.current = false;
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
      stopPolling();
      void (async () => {
        try {
          const data = await streamMidiJobUntilDone(jobId, token, (status) => {
            setProgress(status.progress || 0);
            setStatusMessage(status.message || "");
          });

          if (data.status === "completed" && data.result) {
            setIsConverting(false);
            const built = buildConvertResult(data as PollResponse);
            if (built) {
              maybeApplyDrumsPreset(built.fileAnalysis);
              setResult(built);
              if (built.emptyTranscription || built.notesDetected === 0) {
                trackEvent("midi_empty_transcription_completed", {
                  duration_seconds: data.result.duration_seconds,
                });
              }
            }
            trackEvent("midi_convert_completed", {
              notes_detected: data.result.notes_detected,
              duration_seconds: data.result.duration_seconds,
              inference_time_seconds: data.result.inference_time_seconds,
            });
          } else if (data.status === "failed") {
            setIsConverting(false);
            setError(
              userFacingApiError(data.error, "MIDI conversion failed. Please try again."),
            );
            trackEvent("midi_convert_failed", {
              error: (data.error || "unknown").slice(0, 120),
            });
          } else if (data.status === "cancelled") {
            setIsConverting(false);
            setActiveMidiJobId(null);
            setProgress(0);
            setStatusMessage("");
          }
        } catch (e) {
          setIsConverting(false);
          setError(resolveUserFacingError(e, "Could not check conversion status. Please try again."));
        }
      })();
    },
    [stopPolling, maybeApplyDrumsPreset],
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
        setActiveMidiJobId(data.job_id);
        storeJobToken(data.job_id, token);
        setMidiFileUrl(normalizeFileUrl(data.file_url));
        setStatusMessage("Queued...");
        pollStatus(data.job_id, token);
      } catch (e) {
        setIsConverting(false);
        setIsUploading(false);
        const msg = resolveUserFacingError(e, "MIDI conversion failed. Please try again.");
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

  const downloadSourceLabel = useMemo(() => {
    if (sourceMode === "split" && effectiveSelectedStem) {
      return effectiveSelectedStem;
    }
    if (sourceMode === "upload" && uploadName) return uploadName;
    if (sourceMode === "loaded" && selectedLoadedStem?.label) {
      return selectedLoadedStem.label;
    }
    return null;
  }, [sourceMode, effectiveSelectedStem, uploadName, selectedLoadedStem]);

  const downloadMidi = useCallback(async () => {
    if (!midiFileUrl || !jobToken || isDownloadingMidiRef.current) return;
    isDownloadingMidiRef.current = true;
    setIsDownloadingMidi(true);
    setDownloadError(null);
    trackEvent("midi_download_started");
    try {
      const headers = await authHeaders();
      const res = await fetch(midiFileUrl, {
        headers: { ...headers, "x-job-token": jobToken },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          midiErrorMessage(
            "download",
            classifyMidiHttpError(
              res.status,
              typeof data.error === "string" ? data.error : null,
            ),
          ),
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildMidiDownloadName({
        stemName: downloadSourceLabel,
        uploadName: downloadSourceLabel,
        jobId: activeMidiJobId,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = midiErrorMessage(
        "download",
        e instanceof Error ? e.message : null,
      );
      setDownloadError(msg);
    } finally {
      isDownloadingMidiRef.current = false;
      setIsDownloadingMidi(false);
    }
  }, [midiFileUrl, jobToken, downloadSourceLabel, activeMidiJobId]);

  const cancelConvert = useCallback(async () => {
    stopPolling();
    setIsUploading(false);

    if (activeMidiJobId && jobToken) {
      try {
        const headers = await authHeaders();
        await fetch(`${API_BASE}/api/midi/jobs/${activeMidiJobId}`, {
          method: "DELETE",
          headers: { ...headers, "x-job-token": jobToken },
        });
      } catch {
        /* best-effort cancel */
      }
    }

    setIsConverting(false);
    setActiveMidiJobId(null);
    setProgress(0);
    setStatusMessage("");
    setError(null);
  }, [activeMidiJobId, jobToken, stopPolling]);

  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const batchAbortRef = useRef(false);
  const batchActiveJobIdsRef = useRef<Map<number, { jobId: string; token: string }>>(
    new Map(),
  );

  const batchProgress = useMemo(() => {
    const completed = batchJobs.filter((j) => j.status === "completed").length;
    return { completed, total: batchJobs.length };
  }, [batchJobs]);

  const pollBatchJob = useCallback(
    async (
      jobId: string,
      token: string,
      onProgress?: (data: PollResponse) => void,
    ): Promise<PollResponse> => {
      if (batchAbortRef.current) {
        throw new Error("Batch cancelled");
      }
      const data = (await streamMidiJobUntilDone(
        jobId,
        token,
        (status) => onProgress?.(status as PollResponse),
      )) as PollResponse;
      if (batchAbortRef.current) {
        throw new Error("Batch cancelled");
      }
      if (data.status === "completed" && data.result) return data;
      if (data.status === "failed") {
        throw new Error(data.error || "Conversion failed");
      }
      if (data.status === "cancelled") {
        throw new Error("Conversion cancelled");
      }
      throw new Error("Conversion ended without result");
    },
    [],
  );

  const convertSingleStem = useCallback(
    async (
      splitJobId: string,
      stemName: string,
      batchIndex?: number,
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
      if (typeof batchIndex === "number") {
        batchActiveJobIdsRef.current.set(batchIndex, {
          jobId: data.job_id,
          token,
        });
        setBatchJobs((prev) =>
          prev.map((job, idx) =>
            idx === batchIndex
              ? { ...job, jobId: data.job_id, jobToken: token, status: "converting" }
              : job,
          ),
        );
      }

      const fileUrl = normalizeFileUrl(data.file_url);
      const pollResult = await pollBatchJob(data.job_id, token, (status) => {
        if (typeof batchIndex !== "number") return;
        setBatchJobs((prev) =>
          prev.map((job, idx) =>
            idx === batchIndex
              ? {
                  ...job,
                  progress: status.progress,
                  statusMessage: status.message,
                }
              : job,
          ),
        );
      });

      if (typeof batchIndex === "number") {
        batchActiveJobIdsRef.current.delete(batchIndex);
      }

      const built = buildConvertResult(pollResult);
      if (!built) throw new Error("Conversion completed without result");
      maybeApplyDrumsPreset(built.fileAnalysis);
      return {
        jobId: data.job_id,
        token,
        fileUrl,
        result: built,
      };
    },
    [settings, pollBatchJob, submitConvertJob, maybeApplyDrumsPreset],
  );

  const triggerBatchConvert = useCallback(
    async (splitJobId: string, stemNames: string[]) => {
      setIsBatchMode(true);
      batchAbortRef.current = false;
      batchActiveJobIdsRef.current.clear();
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

      let nextIndex = 0;
      const runOne = async (index: number) => {
        if (batchAbortRef.current) return;
        const stemName = stemNames[index];
        setBatchJobs((prev) =>
          prev.map((job, idx) =>
            idx === index ? { ...job, status: "converting", progress: 0 } : job,
          ),
        );
        try {
          const {
            jobId,
            token,
            fileUrl,
            result: stemResult,
          } = await convertSingleStem(splitJobId, stemName, index);
          setBatchJobs((prev) =>
            prev.map((job, idx) =>
              idx === index
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
          if (batchAbortRef.current) {
            setBatchJobs((prev) =>
              prev.map((job, idx) =>
                idx === index && job.status === "converting"
                  ? { ...job, status: "cancelled", error: "Cancelled" }
                  : job,
              ),
            );
            return;
          }
          const errorMsg = e instanceof Error ? e.message : "Conversion failed";
          setBatchJobs((prev) =>
            prev.map((job, idx) =>
              idx === index ? { ...job, status: "failed", error: errorMsg } : job,
            ),
          );
          trackEvent("midi_batch_stem_failed", {
            stem_name: stemName,
            error: errorMsg.slice(0, 120),
          });
        }
      };

      const workers = Array.from(
        { length: Math.min(BATCH_CONCURRENCY, stemNames.length) },
        async () => {
          while (nextIndex < stemNames.length && !batchAbortRef.current) {
            const i = nextIndex;
            nextIndex += 1;
            await runOne(i);
          }
        },
      );
      await Promise.all(workers);

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

  const cancelBatch = useCallback(async () => {
    batchAbortRef.current = true;
    const activeJobs = Array.from(batchActiveJobIdsRef.current.values());
    batchActiveJobIdsRef.current.clear();

    trackEvent("midi_batch_cancelled", {
      in_flight_jobs: activeJobs.length,
      pending_jobs: batchJobs.filter((j) => j.status === "pending").length,
    });

    await Promise.all(
      activeJobs.map(async ({ jobId, token }) => {
        try {
          const headers = await authHeaders();
          await fetch(`${API_BASE}/api/midi/jobs/${jobId}`, {
            method: "DELETE",
            headers: { ...headers, "x-job-token": token },
          });
        } catch {
          /* best-effort */
        }
      }),
    );

    setBatchJobs((prev) =>
      prev.map((job) =>
        job.status === "pending" || job.status === "converting"
          ? { ...job, status: "cancelled", error: "Cancelled" }
          : job,
      ),
    );
  }, [batchJobs]);

  const clearBatch = useCallback(() => {
    batchAbortRef.current = true;
    batchActiveJobIdsRef.current.clear();
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
    activeMidiJobId,
    jobToken,
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
    cancelBatch,
    clearBatch,
    cancelConvert,
  };
}
