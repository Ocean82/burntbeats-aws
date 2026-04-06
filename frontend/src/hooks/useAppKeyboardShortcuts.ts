import { useCallback, useMemo } from "react";
import { defaultStemState, type StemEditorState } from "../stem-editor-state";
import {
  useKeyboardShortcuts,
  type ShortcutHandlers,
} from "./useKeyboardShortcuts";

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
  openModal: (modal: string) => void;
  closeModal: (modal: string) => void;
  showHelpModal: boolean;
  showExportModal: boolean;
  showPresetsModal: boolean;
  isPlayingMix: boolean;
  undoStemStates: () => void;
  redoStemStates: () => void;
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

  const setMuteFirst = useCallback(() => {
    const id = visibleStems[0]?.id;
    if (id) {
      setStemStates((current) => ({
        ...current,
        [id]: {
          ...(current[id] ?? defaultStemState()),
          muted: !current[id]?.muted,
        },
      }));
    }
  }, [visibleStems, setStemStates]);

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
      muteToggle: setMuteFirst,
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
      escape: () => {
        if (showHelpModal) closeModal("help");
        else if (showExportModal) closeModal("export");
        else if (showPresetsModal) closeModal("presets");
        else if (isPlayingMix) handleStopMix();
      },
    };
  }, [
    closeModal,
    handlePlayMix,
    handleStopMix,
    isPlayingMix,
    mixStems,
    openModal,
    redoStemStates,
    resolvedActiveStemId,
    setMuteFirst,
    setSoloAtIndex,
    setStemStates,
    showExportModal,
    showHelpModal,
    showPresetsModal,
    stemBuffers,
    stemStates,
    undoStemStates,
  ]);

  useKeyboardShortcuts(shortcutHandlers);
}
