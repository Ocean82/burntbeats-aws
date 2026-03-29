import { useState, useCallback, useEffect, useRef } from "react";

export type ModalKey = "help" | "export" | "presets" | "game";

export interface UseUiModalsReturn {
  showHelp: boolean;
  showExport: boolean;
  showPresets: boolean;
  showGame: boolean;
  openModal: (key: ModalKey) => void;
  closeModal: (key: ModalKey) => void;
  toggleGame: () => void;
}

/**
 * Manages modal visibility state with UI latency performance marks.
 */
export function useUiModals(): UseUiModalsReturn {
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showGame, setShowGame] = useState(false);

  const startMark = useCallback((key: string) => {
    if (typeof performance === "undefined") return;
    performance.mark(`${key}:start`);
  }, []);

  const finishMark = useCallback((key: string) => {
    if (typeof performance === "undefined") return;
    const start = `${key}:start`;
    const end = `${key}:end`;
    const measure = `${key}:measure`;
    performance.mark(end);
    try {
      performance.measure(measure, start, end);
    } catch {
      // No-op if mark pair is incomplete.
    } finally {
      performance.clearMarks(start);
      performance.clearMarks(end);
      performance.clearMeasures(measure);
    }
  }, []);

  // Finish latency marks on next frame after modal opens
  const helpRafRef = useRef<number>(0);
  const exportRafRef = useRef<number>(0);
  const presetsRafRef = useRef<number>(0);

  useEffect(() => {
    if (!showHelp) return;
    helpRafRef.current = requestAnimationFrame(() => finishMark("help-modal-open"));
    return () => cancelAnimationFrame(helpRafRef.current);
  }, [showHelp, finishMark]);

  useEffect(() => {
    if (!showExport) return;
    exportRafRef.current = requestAnimationFrame(() => finishMark("export-modal-open"));
    return () => cancelAnimationFrame(exportRafRef.current);
  }, [showExport, finishMark]);

  useEffect(() => {
    if (!showPresets) return;
    presetsRafRef.current = requestAnimationFrame(() => finishMark("presets-modal-open"));
    return () => cancelAnimationFrame(presetsRafRef.current);
  }, [showPresets, finishMark]);

  const openModal = useCallback((key: ModalKey) => {
    switch (key) {
      case "help":
        startMark("help-modal-open");
        setShowHelp(true);
        break;
      case "export":
        startMark("export-modal-open");
        setShowExport(true);
        break;
      case "presets":
        startMark("presets-modal-open");
        setShowPresets(true);
        break;
      case "game":
        setShowGame(true);
        break;
    }
  }, [startMark]);

  const closeModal = useCallback((key: ModalKey) => {
    switch (key) {
      case "help": setShowHelp(false); break;
      case "export": setShowExport(false); break;
      case "presets": setShowPresets(false); break;
      case "game": setShowGame(false); break;
    }
  }, []);

  const toggleGame = useCallback(() => setShowGame((v) => !v), []);

  return { showHelp, showExport, showPresets, showGame, openModal, closeModal, toggleGame };
}
