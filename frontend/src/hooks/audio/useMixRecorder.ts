/**
 * useMixRecorder — live mix recording via MediaRecorder + MediaStreamDestination.
 *
 * Captures the master bus output in real-time, records to webm, then decodes
 * and converts to a downloadable WAV blob. Complements the existing offline
 * export (renderClientMasterWavBlob) by allowing users to record while making
 * live DSP adjustments.
 *
 * Signal flow:
 *   masterGain → MediaStreamDestination → MediaRecorder (webm chunks)
 *                                    → speakers (analyser → destination)
 *
 * On stop:
 *   webm blob → AudioContext.decodeAudioData → AudioBuffer → audioBufferToWav → WAV Blob
 */
import { useCallback, useRef, useState } from "react";
import { audioBufferToWav } from "../../utils/audio";

export interface RecordingState {
  /** Whether the recorder is currently capturing. */
  isRecording: boolean;
  /** Wall-clock recording duration in seconds (0 when not recording). */
  duration: number;
  /** Set when recording completes — the WAV blob ready for download. */
  wavBlob: Blob | null;
  /** Set when recording completes — a suggested filename. */
  wavFilename: string | null;
  /** Set when recording fails. */
  error: string | null;
}

export interface UseMixRecorderReturn extends RecordingState {
  /** Start recording the master mix output. */
  startRecording: (stream: MediaStream) => void;
  /** Stop recording and begin WAV conversion. */
  stopRecording: () => void;
  /** Reset recording state (clears wavBlob and error). */
  reset: () => void;
}

/** Default filename for downloaded recordings. */
function buildRecordingFilename(uploadName: string | undefined): string {
  const base = uploadName?.replace(/\.[^.]+$/, "") || "recording";
  return `${base}_live_recording.wav`;
}

/**
 * Resolve the best supported MIME type for MediaRecorder.
 * Browsers differ: Chrome prefers webm+opus, Safari may support mp4.
 */
function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "",
  ];
  for (const type of candidates) {
    if (!type) continue;
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

export function useMixRecorder(
  options: {
    /** Callback invoked when recording completes with the WAV blob. */
    onRecordingComplete?: (blob: Blob, filename: string) => void;
    /** Callback invoked when recording fails. */
    onError?: (message: string) => void;
  } = {},
): UseMixRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [wavBlob, setWavBlob] = useState<Blob | null>(null);
  const [wavFilename, setWavFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingUploadNameRef = useRef<string | undefined>(undefined);

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setWavBlob(null);
    setWavFilename(null);
    setError(null);
    setDuration(0);
  }, []);

  const startRecording = useCallback(
    (stream: MediaStream) => {
      if (!stream) {
        const msg = "No recording stream available — play the mix first.";
        setError(msg);
        options.onError?.(msg);
        return;
      }

      if (mediaRecorderRef.current?.state === "recording") {
        return;
      }

      // Reset previous recording state
      setWavBlob(null);
      setWavFilename(null);
      setError(null);
      setDuration(0);

      chunksRef.current = [];

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        clearDurationTimer();
        setIsRecording(false);

        const webmBlob = new Blob(chunksRef.current, { type: mimeType });
        if (webmBlob.size === 0) {
          const msg = "Recording was empty — no audio was captured.";
          setError(msg);
          options.onError?.(msg);
          return;
        }

        try {
          // Decode webm to AudioBuffer using a temporary AudioContext
          const decodeCtx = new AudioContext();
          const arrayBuf = await webmBlob.arrayBuffer();
          const audioBuf = await decodeCtx.decodeAudioData(arrayBuf);
          const wav = audioBufferToWav(audioBuf);
          await decodeCtx.close();

          const filename = buildRecordingFilename(pendingUploadNameRef.current);
          setWavBlob(wav);
          setWavFilename(filename);
          options.onRecordingComplete?.(wav, filename);
        } catch (decodeErr) {
          const msg = `Failed to convert recording to WAV: ${decodeErr instanceof Error ? decodeErr.message : "unknown error"}`;
          setError(msg);
          options.onError?.(msg);
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setIsRecording(true);

      // Update duration every 100ms while recording
      durationTimerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 100) / 10);
      }, 100);
    },
    [clearDurationTimer, options],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      mediaRecorderRef.current = null;
    }
    clearDurationTimer();
  }, [clearDurationTimer]);

  return {
    isRecording,
    duration,
    wavBlob,
    wavFilename,
    error,
    startRecording,
    stopRecording,
    reset,
  };
}
