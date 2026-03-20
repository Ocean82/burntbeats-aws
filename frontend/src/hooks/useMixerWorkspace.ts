import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultMixer, defaultTrim } from "../types";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";

interface UseMixerWorkspaceParams {
  playingStem: string | null;
  mixStems: Array<{ id: string; url: string }>;
  stemStates: Record<string, StemEditorState>;
  stemBuffers: Record<string, AudioBuffer>;
  setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>;
  setStemStates: React.Dispatch<React.SetStateAction<Record<string, StemEditorState>>>;
  handlePreviewStem: (
    stemId: string,
    stemUrl: string | undefined,
    stemBuffers: Record<string, AudioBuffer>,
    setStemBuffers: React.Dispatch<React.SetStateAction<Record<string, AudioBuffer>>>,
    stemStates?: Record<string, StemEditorState>
  ) => Promise<void>;
}

interface UseMixerWorkspaceReturn {
  activeStemId: string;
  setActiveStemId: React.Dispatch<React.SetStateAction<string>>;
  handleStemStateChange: (stemId: string, patch: Partial<StemEditorState>) => void;
  handlePreviewStemFromMixer: (stemId: string) => void;
  resetTrackAdjustments: () => void;
}

export function useMixerWorkspace({
  playingStem,
  mixStems,
  stemStates,
  stemBuffers,
  setStemBuffers,
  setStemStates,
  handlePreviewStem,
}: UseMixerWorkspaceParams): UseMixerWorkspaceReturn {
  const [activeStemId, setActiveStemId] = useState<string>("");
  const lastPreviewParamsKeyRef = useRef<string>("");

  const previewParamsKey = useMemo(() => {
    if (!playingStem) return "";
    const state = stemStates[playingStem] ?? defaultStemState();
    return [
      state.trim.start,
      state.trim.end,
      state.mixer.gain,
      state.mixer.pan,
      state.pitchSemitones,
      state.timeStretch,
    ].join("|");
  }, [playingStem, stemStates]);

  useEffect(() => {
    if (!playingStem) return;
    if (lastPreviewParamsKeyRef.current === previewParamsKey) return;

    lastPreviewParamsKeyRef.current = previewParamsKey;
    const stemUrl = mixStems.find((stem) => stem.id === playingStem)?.url;
    void handlePreviewStem(playingStem, stemUrl, stemBuffers, setStemBuffers, stemStates);
  }, [playingStem, previewParamsKey, mixStems, handlePreviewStem, stemBuffers, setStemBuffers, stemStates]);

  const handleStemStateChange = useCallback((stemId: string, patch: Partial<StemEditorState>) => {
    setStemStates((current) => ({
      ...current,
      [stemId]: { ...(current[stemId] ?? defaultStemState()), ...patch },
    }));
  }, [setStemStates]);

  const handlePreviewStemFromMixer = useCallback((stemId: string) => {
    const stemUrl = mixStems.find((stem) => stem.id === stemId)?.url;
    const state = stemStates[stemId] ?? defaultStemState();
    lastPreviewParamsKeyRef.current = [
      state.trim.start,
      state.trim.end,
      state.mixer.gain,
      state.mixer.pan,
      state.pitchSemitones,
      state.timeStretch,
    ].join("|");
    void handlePreviewStem(stemId, stemUrl, stemBuffers, setStemBuffers, stemStates);
  }, [mixStems, stemStates, handlePreviewStem, stemBuffers, setStemBuffers]);

  const resetTrackAdjustments = useCallback(() => {
    setStemStates((current) => {
      const next = { ...current };
      for (const stemId of Object.keys(next)) {
        next[stemId] = {
          ...next[stemId],
          trim: { ...defaultTrim },
          mixer: { ...defaultMixer },
          rate: 1.0,
          pitchSemitones: 0,
          timeStretch: 1.0,
        };
      }
      return next;
    });
  }, [setStemStates]);

  return {
    activeStemId,
    setActiveStemId,
    handleStemStateChange,
    handlePreviewStemFromMixer,
    resetTrackAdjustments,
  };
}
