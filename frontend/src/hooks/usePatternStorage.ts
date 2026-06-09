/**
 * usePatternStorage — Persist and retrieve custom beat patterns from localStorage.
 */
import { useCallback, useEffect, useState } from "react";
import type { BeatPreset } from "./useBeatMaker";

const STORAGE_KEY = "burntbeats-drum-patterns-v1";

export interface SavedPattern {
  id: string;
  name: string;
  createdAt: string;
  preset: BeatPreset;
  tags: string[];
}

interface StorageData {
  version: 1;
  patterns: SavedPattern[];
}

function loadFromStorage(): SavedPattern[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: StorageData = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.patterns)) return [];
    return data.patterns;
  } catch {
    return [];
  }
}

function saveToStorage(patterns: SavedPattern[]): void {
  const data: StorageData = { version: 1, patterns };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export interface UsePatternStorageReturn {
  /** All saved patterns. */
  savedPatterns: SavedPattern[];
  /** Save a new pattern. Returns the generated ID. */
  savePattern: (name: string, preset: BeatPreset, tags?: string[]) => string;
  /** Delete a saved pattern by ID. */
  deletePattern: (id: string) => void;
  /** Rename a saved pattern. */
  renamePattern: (id: string, newName: string) => void;
  /** Export all saved patterns as a JSON string (for sharing/backup). */
  exportAll: () => string;
  /** Import patterns from a JSON string. Returns count imported. */
  importPatterns: (json: string) => number;
}

export function usePatternStorage(): UsePatternStorageReturn {
  const [savedPatterns, setSavedPatterns] = useState<SavedPattern[]>(loadFromStorage);

  // Sync to localStorage whenever patterns change
  useEffect(() => {
    saveToStorage(savedPatterns);
  }, [savedPatterns]);

  const savePattern = useCallback(
    (name: string, preset: BeatPreset, tags: string[] = []): string => {
      const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const entry: SavedPattern = {
        id,
        name: name.trim() || "Untitled Pattern",
        createdAt: new Date().toISOString(),
        preset,
        tags,
      };
      setSavedPatterns((prev) => [entry, ...prev]);
      return id;
    },
    [],
  );

  const deletePattern = useCallback((id: string) => {
    setSavedPatterns((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const renamePattern = useCallback((id: string, newName: string) => {
    setSavedPatterns((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: newName.trim() || p.name } : p)),
    );
  }, []);

  const exportAll = useCallback((): string => {
    const data: StorageData = { version: 1, patterns: savedPatterns };
    return JSON.stringify(data, null, 2);
  }, [savedPatterns]);

  const importPatterns = useCallback((json: string): number => {
    try {
      const data: StorageData = JSON.parse(json);
      if (data.version !== 1 || !Array.isArray(data.patterns)) return 0;

      // Deduplicate by ID
      setSavedPatterns((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newPatterns = data.patterns.filter((p) => !existingIds.has(p.id));
        return [...newPatterns, ...prev];
      });

      return data.patterns.length;
    } catch {
      return 0;
    }
  }, []);

  return {
    savedPatterns,
    savePattern,
    deletePattern,
    renamePattern,
    exportAll,
    importPatterns,
  };
}
