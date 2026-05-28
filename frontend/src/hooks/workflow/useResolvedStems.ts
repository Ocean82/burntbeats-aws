import { useMemo } from "react";
import type { StemDefinition, StemId } from "../types";
import { getStemDefinition, getLoadedStemDefinition, stemDefinitions } from "../data/stemDefinitions";
import { useAppStore } from "../store/appStore";

export function useResolvedStems() {
  const { splitResultStems, loadedStems } = useAppStore();

  const visibleStems = useMemo(() => {
    const fromSplit = splitResultStems.map((s) => ({
      ...getStemDefinition(s.id),
      id: s.id as StemId,
      url: s.url,
    }));
    const fromLoaded = loadedStems.map((s) => ({
      ...getLoadedStemDefinition(s.id, s.label),
      id: s.id as StemId,
      url: s.url,
    }));
    if (fromSplit.length > 0 || fromLoaded.length > 0)
      return [...fromSplit, ...fromLoaded];
    // Before splitting, show the full default rack (helps solo/mute keyboard shortcuts).
    return stemDefinitions.map((s) => ({ ...s, id: s.id as StemId }));
  }, [splitResultStems, loadedStems]);

  const mixStems = useMemo(
    () =>
      [...splitResultStems, ...loadedStems] as Array<{
        id: string;
        url: string;
      }>,
    [splitResultStems, loadedStems],
  );

  return { visibleStems, mixStems };
}
