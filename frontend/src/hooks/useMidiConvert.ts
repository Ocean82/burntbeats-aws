/**
 * useMidiConvert — manages the full MIDI conversion lifecycle.
 * Handles source selection, file upload, job submission, polling, and result state.
 * Includes batch conversion support for converting all stems at once.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { authHeaders, setJobToken as storeJobToken } from "../api/auth";
import { trackEvent } from "../analytics/events";

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
};

const API_BASE = import.meta.env.VITE_API_URL || "";

export function useMidiConvert() {
  // Source state
  const [sourceMode, setSourceMode] = useState<"split" | "upload">("split");
  const [selectedStem, setSelectedStem] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState<string>("");

  // Settings
  const [settings, setSettings] = useState<MidiConvertSettings>(DEFAULT_SETTINGS);

  // Conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Result
  const [result, setResult] = useState<MidiConvertResult | null>(null);
  const [midiFileUrl, setMidiFileUrl] = useState<string | null>(null);
  const [jobToken, setJobToken] = useState<string | null>(null);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const updateSettings = useCallback(
    (partial: Partial<MidiConvertSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  const acceptFile = useCallback((file: File | null) => {
    setUploadedFile(file);
    setUploadName(file?.name || "");
    setError(null);
    setResult(null);
    setMidiFileUrl(null);
    if (file) {
      const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "unknown" : "none";
      trackEvent("midi_upload_selected", { file_extension: ext, file_size_mb: Number((file.size / (1024 * 1024)).toFixed(2)) });
    }
  }, []);

  const handleBrowse = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleClear = useCallback(() => {
    setUploadedFile(null);
    setUploadName("");
    setSelectedStem(null);
    setError(null);
    setResult(null);
    setMidiFileUrl(null);
    setProgress(0);
    setStatusMessage("");
    setIsConverting(false);
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
          const res = await fetch(
            `${API_BASE}/api/midi/status/${jobId}`,
            {
              headers: {
                ...headers,
                "x-job-token": token,
              },
            },
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Status check failed (${res.status})`);
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
            trackEvent("midi_convert_failed", { error: (data.error || "unknown").slice(0, 120) });
          }
        } catch (e) {
          stopPolling();
          setIsConverting(false);
          setError(e instanceof Error ? e.message : "Polling failed");
        }
      };

      pollRef.current = setInterval(poll, 1500);
      // Run immediately too
      void poll();
    },
    [stopPolling],
  );

  const triggerConvert = useCallback(
    async (splitJobId?: string | null) => {
      setError(null);
      setResult(null);
      setMidiFileUrl(null);
      setProgress(0);
      setStatusMessage("Submitting...");
      setIsConverting(true);

      trackEvent("midi_convert_started", {
        source_mode: sourceMode,
        stem_name: selectedStem || "none",
        min_confidence: settings.minConfidence,
        include_pitch_bends: settings.includePitchBends,
      });

      try {
        const headers = await authHeaders();
        const formData = new FormData();

        if (sourceMode === "split" && selectedStem && splitJobId) {
          // Convert from a previously split stem
          formData.append("stem_job_id", splitJobId);
          formData.append("stem_name", selectedStem);
        } else if (sourceMode === "upload" && uploadedFile) {
          formData.append("file", uploadedFile);
        } else {
          setError("Select a stem or upload a file first.");
          setIsConverting(false);
          return;
        }

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

        const res = await fetch(`${API_BASE}/api/midi/convert`, {
          method: "POST",
          headers: headers,
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Conversion request failed (${res.status})`);
        }

        const data = await res.json();
        const token = data.job_token;
        setJobToken(token);
        storeJobToken(data.job_id, token);
        // file_url may be absolute or relative — normalize to relative path for same-origin fetch
        const fileUrl = data.file_url?.startsWith("http")
          ? new URL(data.file_url).pathname
          : data.file_url || null;
        setMidiFileUrl(fileUrl);
        setStatusMessage("Queued...");

        // Start polling
        pollStatus(data.job_id, token);
      } catch (e) {
        setIsConverting(false);
        const msg = e instanceof Error ? e.message : "Conversion failed";
        setError(msg);
        trackEvent("midi_convert_failed", { error: msg.slice(0, 120) });
      }
    },
    [sourceMode, selectedStem, uploadedFile, settings, pollStatus],
  );

  const downloadMidi = useCallback(async () => {
    if (!midiFileUrl || !jobToken) return;
    trackEvent("midi_download_started");
    try {
      const headers = await authHeaders();
      const res = await fetch(midiFileUrl, {
        headers: {
          ...headers,
          "x-job-token": jobToken,
        },
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
      // Fallback: open in new tab
      window.open(midiFileUrl, "_blank");
    }
  }, [midiFileUrl, jobToken]);

  // --- Batch conversion state ---
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const batchAbortRef = useRef(false);

  const batchProgress = useMemo(() => {
    const completed = batchJobs.filter((j) => j.status === "completed").length;
    return { completed, total: batchJobs.length };
  }, [batchJobs]);

  /**
   * Poll a single batch job until it completes or fails.
   * Returns the final PollResponse or throws on error.
   */
  const pollBatchJob = useCallback(
    async (jobId: string, token: string): Promise<PollResponse> => {
      const POLL_INTERVAL = 1500;
      const MAX_POLLS = 200; // ~5 min max per stem
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

        if (data.status === "completed" && data.result) {
          return data;
        } else if (data.status === "failed") {
          throw new Error(data.error || "Conversion failed");
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        polls++;
      }
      throw new Error("Conversion timed out");
    },
    [],
  );

  /**
   * Submit and poll a single stem conversion for batch mode.
   * Returns the job result or throws on failure.
   */
  const convertSingleStem = useCallback(
    async (splitJobId: string, stemName: string): Promise<{ jobId: string; token: string; fileUrl: string | null; result: MidiConvertResult }> => {
      const headers = await authHeaders();
      const formData = new FormData();
      formData.append("stem_job_id", splitJobId);
      formData.append("stem_name", stemName);
      formData.append("min_confidence", settings.minConfidence.toString());
      formData.append("min_note_length_ms", settings.minNoteLengthMs.toString());
      formData.append("include_pitch_bends", settings.includePitchBends ? "true" : "false");

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

      const res = await fetch(`${API_BASE}/api/midi/convert`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Conversion request failed (${res.status})`);
      }

      const data = await res.json();
      const token = data.job_token;
      storeJobToken(data.job_id, token);

      const fileUrl = data.file_url?.startsWith("http")
        ? new URL(data.file_url).pathname
        : data.file_url || null;

      // Poll until done
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
    [settings, pollBatchJob],
  );

  /**
   * Trigger batch conversion for all provided stems sequentially.
   */
  const triggerBatchConvert = useCallback(
    async (splitJobId: string, stemNames: string[]) => {
      setIsBatchMode(true);
      batchAbortRef.current = false;
      setError(null);

      // Initialize batch jobs
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

      // Process sequentially
      for (let i = 0; i < stemNames.length; i++) {
        if (batchAbortRef.current) break;

        const stemName = stemNames[i];

        // Set current stem to "converting"
        setBatchJobs((prev) =>
          prev.map((job, idx) =>
            idx === i ? { ...job, status: "converting" } : job,
          ),
        );

        try {
          const { jobId, token, fileUrl, result: stemResult } = await convertSingleStem(splitJobId, stemName);

          setBatchJobs((prev) =>
            prev.map((job, idx) =>
              idx === i
                ? { ...job, status: "completed", jobId, jobToken: token, fileUrl, result: stemResult }
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
          // Continue with remaining stems (partial failure handling)
        }
      }

      trackEvent("midi_batch_convert_finished", {
        stem_count: stemNames.length,
      });
    },
    [convertSingleStem],
  );

  /**
   * Retry a single failed batch job by index.
   */
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
        const { jobId, token, fileUrl, result: stemResult } = await convertSingleStem(splitJobId, job.stemName);

        setBatchJobs((prev) =>
          prev.map((j, idx) =>
            idx === index
              ? { ...j, status: "completed", jobId, jobToken: token, fileUrl, result: stemResult }
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

  /**
   * Clear batch state and return to single-conversion mode.
   */
  const clearBatch = useCallback(() => {
    batchAbortRef.current = true;
    setBatchJobs([]);
    setIsBatchMode(false);
  }, []);

  return {
    // Source
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

    // Settings
    settings,
    updateSettings,

    // Conversion state
    isConverting,
    progress,
    statusMessage,
    error,
    setError,

    // Result
    result,
    midiFileUrl,
    downloadMidi,

    // Actions
    triggerConvert,

    // Batch conversion
    batchJobs,
    isBatchMode,
    batchProgress,
    triggerBatchConvert,
    retryBatchJob,
    clearBatch,
  };
}
