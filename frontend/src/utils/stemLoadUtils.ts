/**
 * Pure helpers for stem buffer loading (testable without AudioContext).
 */
export interface StemLoadEntry {
  id: string;
  url: string;
}

export function entriesNeedingStemLoad(
  allStemEntries: StemLoadEntry[],
  existingBuffers: Record<string, unknown>,
  loadedUrlById: Record<string, string>,
): StemLoadEntry[] {
  return allStemEntries.filter(
    (e) => !existingBuffers[e.id] || loadedUrlById[e.id] !== e.url,
  );
}
