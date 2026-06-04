import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import { useStemLoading } from "../hooks/useStemLoading";
import type { UseStemLoadingReturn } from "../hooks/useStemLoading";
import { useWorkflow } from "./WorkflowContext";
import { useAppStore } from "../store/appStore";

export interface StemMediaContextValue {
  audioContextRef: MutableRefObject<AudioContext | null>;
  stemBuffers: UseStemLoadingReturn["stemBuffers"];
  setStemBuffers: UseStemLoadingReturn["setStemBuffers"];
  isLoadingStems: boolean;
  loadingError: string | null;
  retryLoadStems: () => void;
  clearStemLoadingState: () => void;
}

const StemMediaContext = createContext<StemMediaContextValue | null>(null);

export function StemMediaProvider({ children }: { children: React.ReactNode }) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const { setStemStates } = useWorkflow();
  const splitResultStems = useAppStore((s) => s.splitResultStems);
  const loadedStems = useAppStore((s) => s.loadedStems);
  const setSplitError = useAppStore((s) => s.setSplitError);

  const allStemEntries = useMemo(
    () => [
      ...splitResultStems.map((s) => ({ id: s.id, url: s.url })),
      ...loadedStems.map((s) => ({
        id: s.id,
        url: s.url,
        file: s.file,
      })),
    ],
    [splitResultStems, loadedStems],
  );

  const stemMedia = useStemLoading({
    allStemEntries,
    audioContextRef,
    setStemStates,
    setSplitError,
  });

  const value = useMemo<StemMediaContextValue>(
    () => ({
      audioContextRef,
      stemBuffers: stemMedia.stemBuffers,
      setStemBuffers: stemMedia.setStemBuffers,
      isLoadingStems: stemMedia.isLoadingStems,
      loadingError: stemMedia.loadingError,
      retryLoadStems: stemMedia.retryLoadStems,
      clearStemLoadingState: stemMedia.clearStemLoadingState,
    }),
    [stemMedia],
  );

  return (
    <StemMediaContext.Provider value={value}>{children}</StemMediaContext.Provider>
  );
}

export function useStemMedia(): StemMediaContextValue {
  const context = useContext(StemMediaContext);
  if (!context) {
    throw new Error("useStemMedia must be used within a StemMediaProvider");
  }
  return context;
}
