import { useCallback, useMemo } from "react";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import {
  useKeyboardShortcuts,
  type ShortcutHandlers,
} from "./useKeyboardShortcuts";
import type { ModalKey } from "./useUiModals";

type VisibleStem = { id: string };
type MixStem = { id: string; url: string };

interface UseAppKeyboardShortcutsArgs {
  visibleStems: VisibleStem[];
  resolvedActiveStemId?: string;
  mixStems: MixStem[];
  stemStates: Record<string, StemEditorState>;
  stemBuffers: Record<string, AudioBuffer>;
  setStemStates: (
    updater: (
      current: Record<string, StemEditorState>,
    ) => Record<string, StemEditorState>,
  ) => void;
  handlePlayMix: (
    stems: MixStem[],
    states: Record<string, StemEditorState>,
    buffers: Record<string, AudioBuffer>,
  ) => Promise<void> | void;
  handleStopMix: () => void;
  openModal: (modal: ModalKey) => void;
  closeModal: (modal: ModalKey) => void;
  showHelpModal: boolean;
  showExportModal: boolean;
  showPresetsModal: boolean;
  isPlayingMix: boolean;
  undoStemStates: () => void;
  redoStemStates: () => void;
  loopEnabled: boolean;
  setLoopEnabled: (enabled: boolean) => void;
  onTriggerSplit?: () => void;
  setActiveView?: (
    view: "editor" | "speech" | "midi" | "beats" | "tuner" | "pricing" | "my-stems",
  ) => void;
}

export function useAppKeyboardShortcuts({
  visibleStems,
  resolvedActiveStemId,
  mixStems,
  stemStates,
  stemBuffers,
  setStemStates,
  handlePlayMix,
  handleStopMix,
  openModal,
  closeModal,
  showHelpModal,
  showExportModal,
  showPresetsModal,
  isPlayingMix,
  undoStemStates,
  redoStemStates,
  loopEnabled,
  setLoopEnabled,
  onTriggerSplit,
  setActiveView,
}: UseAppKeyboardShortcutsArgs) {
  const setSoloAtIndex = useCallback(
    (index: number) => {
      const id = visibleStems[index]?.id;
      if (id) {
        setStemStates((current) => ({
          ...current,
          [id]: {
            ...(current[id] ?? defaultStemState()),
            soloed: !current[id]?.soloed,
          },
        }));
      }
    },
    [visibleStems, setStemStates],
  );

  const toggleMuteActive = useCallback(() => {
    if (!resolvedActiveStemId) return;
    setStemStates((current) => ({
      ...current,
      [resolvedActiveStemId]: {
        ...(current[resolvedActiveStemId] ?? defaultStemState()),
        muted: !current[resolvedActiveStemId]?.muted,
      },
    }));
  }, [resolvedActiveStemId, setStemStates]);

  const toggleSoloActive = useCallback(() => {
    if (!resolvedActiveStemId) return;
    setStemStates((current) => {
      const wasSoloed = current[resolvedActiveStemId]?.soloed;
      const next = { ...current };
      for (const id of Object.keys(next)) {
        next[id] = {
          ...(next[id] ?? defaultStemState()),
          soloed: id === resolvedActiveStemId ? !wasSoloed : false,
        };
      }
      return next;
    });
  }, [resolvedActiveStemId, setStemStates]);

  const shortcutHandlers: ShortcutHandlers = useMemo(() => {
    const TRIM_STEP = 1;
    const TRIM_MIN = 0;
    const TRIM_MAX = 100;

    const nudgeTrim = (which: "start" | "end", delta: number) => {
      if (!resolvedActiveStemId) return;
      setStemStates((current) => {
        const stemState = current[resolvedActiveStemId] ?? defaultStemState();
        const { start, end } = stemState.trim;
        const updatedTrim =
          which === "start"
            ? {
                start: Math.max(TRIM_MIN, Math.min(start + delta, end - 1)),
                end,
              }
            : {
                start,
                end: Math.max(start + 1, Math.min(end + delta, TRIM_MAX)),
              };
        return {
          ...current,
          [resolvedActiveStemId]: { ...stemState, trim: updatedTrim },
        };
      });
    };

    return {
      playStop: () => {
        if (mixStems.length > 0) {
          void handlePlayMix(mixStems, stemStates, stemBuffers);
        }
      },
      solo1: () => setSoloAtIndex(0),
      solo2: () => setSoloAtIndex(1),
      solo3: () => setSoloAtIndex(2),
      solo4: () => setSoloAtIndex(3),
      muteToggle: toggleMuteActive,
      soloToggle: toggleSoloActive,
      loopToggle: () => setLoopEnabled(!loopEnabled),
      export: () => {
        if (mixStems.length > 0) {
          openModal("export");
        }
      },
      undo: () => undoStemStates(),
      redo: () => redoStemStates(),
      trimStartLeft: () => nudgeTrim("start", -TRIM_STEP),
      trimStartRight: () => nudgeTrim("start", +TRIM_STEP),
      trimEndLeft: () => nudgeTrim("end", -TRIM_STEP),
      trimEndRight: () => nudgeTrim("end", +TRIM_STEP),
      help: () => openModal("help"),
      triggerSplit: () => onTriggerSplit?.(),
      escape: () => {
        if (showHelpModal) closeModal("help");
        else if (showExportModal) closeModal("export");
        else if (showPresetsModal) closeModal("presets");
        else if (isPlayingMix) handleStopMix();
      },
      navEditor: () => setActiveView?.("editor"),
      navSpeech: () => setActiveView?.("speech"),
      navMidi: () => setActiveView?.("midi"),
      navPricing: () => setActiveView?.("pricing"),
      navMyStems: () => setActiveView?.("my-stems"),
      navBeats: () => setActiveView?.("beats"),
      navTuner: () => setActiveView?.("tuner"),
    };
  }, [
    closeModal,
    handlePlayMix,
    handleStopMix,
    isPlayingMix,
    loopEnabled,
    mixStems,
    openModal,
    redoStemStates,
    resolvedActiveStemId,
    setLoopEnabled,
    toggleMuteActive,
    toggleSoloActive,
    setSoloAtIndex,
    setStemStates,
    showExportModal,
    showHelpModal,
    showPresetsModal,
    stemBuffers,
    stemStates,
    undoStemStates,
    onTriggerSplit,
    setActiveView,
  ]);

  useKeyboardShortcuts(shortcutHandlers);
}
