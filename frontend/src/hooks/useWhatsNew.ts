/**
 * useWhatsNew — tracks which changelog entries the user has seen.
 * Returns unseen entries and a function to mark them as seen.
 */
import { useState, useCallback, useMemo } from "react";
import { CHANGELOG, LATEST_CHANGELOG_ID, type ChangelogEntry } from "../data/changelog";

const STORAGE_KEY = "burntbeats_last_seen_changelog";

function getLastSeenId(): number {
  if (typeof window === "undefined") return LATEST_CHANGELOG_ID;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export function useWhatsNew() {
  const [lastSeenId, setLastSeenId] = useState(getLastSeenId);

  const unseenEntries: ChangelogEntry[] = useMemo(
    () => CHANGELOG.filter((entry) => entry.id > lastSeenId),
    [lastSeenId],
  );

  /** Tabs that have unseen features */
  const tabsWithNews: Set<string> = useMemo(
    () => new Set(unseenEntries.map((e) => e.tab)),
    [unseenEntries],
  );

  /** Mark a specific tab's entries as seen (when user visits that tab) */
  const markTabSeen = useCallback(
    (tab: string) => {
      const tabEntries = unseenEntries.filter((e) => e.tab === tab);
      if (tabEntries.length === 0) return;
      const maxId = Math.max(...tabEntries.map((e) => e.id), lastSeenId);
      setLastSeenId(maxId);
      localStorage.setItem(STORAGE_KEY, String(maxId));
    },
    [unseenEntries, lastSeenId],
  );

  /** Mark all entries as seen */
  const markAllSeen = useCallback(() => {
    setLastSeenId(LATEST_CHANGELOG_ID);
    localStorage.setItem(STORAGE_KEY, String(LATEST_CHANGELOG_ID));
  }, []);

  return {
    unseenEntries,
    tabsWithNews,
    hasNews: unseenEntries.length > 0,
    markTabSeen,
    markAllSeen,
  };
}
