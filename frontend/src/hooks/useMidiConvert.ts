/**
 * useMidiConvert — manages the full MIDI conversion lifecycle.
 * Handles source selection, file upload, job submission, polling, and result state.
 */
import { useCallback, useRef, useState } from "react";
import { authHeaders, setJobToken as storeJobToken } from "../api/auth";
import { trackEvent } from "../analytics/events";

export interface MidiConvertSettings {
  minConfidence: number;
  minNoteLengthMs: number;
  includePitchBends: boolean;
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
  };
}

const DEFAULT_SETTINGS: MidiConvertSettings = {
  minConfidence: 0.5,
  minNoteLengthMs: 58,
  includePitchBends: true,
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
  };
}
