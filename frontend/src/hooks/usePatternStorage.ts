/**
 * usePatternStorage — Persist and retrieve custom beat patterns from localStorage
 * with optional Premium cloud sync via /api/beat-patterns.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "../api/auth";
import { API_BASE } from "../config";
import type { BeatPreset } from "./useBeatMaker";

const STORAGE_KEY = "burntbeats-drum-patterns-v1";

export interface SavedPattern {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preset: BeatPreset;
  tags: string[];
  cloudId?: string | null;
}

interface StorageData {
  version: 1;
  patterns: SavedPattern[];
}

export type PatternSyncStatus = "local" | "syncing" | "synced" | "error";

interface CloudBeatPatternRow {
  id: string;
  name: string;
  preset: BeatPreset;
  tags: string[];
  created_at: string;
  updated_at: string;
}

function loadFromStorage(): SavedPattern[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: StorageData = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.patterns)) return [];
    return data.patterns.map((p) => ({
      ...p,
      updatedAt: p.updatedAt ?? p.createdAt,
      cloudId: p.cloudId ?? null,
    }));
  } catch {
    return [];
  }
}

function saveToStorage(patterns: SavedPattern[]): void {
  const data: StorageData = { version: 1, patterns };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function cloudRowToSaved(row: CloudBeatPatternRow): SavedPattern {
  return {
    id: row.id,
    cloudId: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preset: row.preset,
    tags: row.tags ?? [],
  };
}

function mergePatterns(
  local: SavedPattern[],
  remote: SavedPattern[],
): SavedPattern[] {
  const byCloudId = new Map<string, SavedPattern>();
  for (const pattern of local) {
    if (pattern.cloudId) byCloudId.set(pattern.cloudId, pattern);
  }

  const merged: SavedPattern[] = [];
  const seenCloud = new Set<string>();

  for (const remotePattern of remote) {
    seenCloud.add(remotePattern.cloudId!);
    const existing = remotePattern.cloudId
      ? byCloudId.get(remotePattern.cloudId)
      : undefined;
    if (!existing) {
      merged.push(remotePattern);
      continue;
    }
    const localTime = Date.parse(existing.updatedAt);
    const remoteTime = Date.parse(remotePattern.updatedAt);
    merged.push(remoteTime >= localTime ? remotePattern : existing);
  }

  for (const pattern of local) {
    if (pattern.cloudId && seenCloud.has(pattern.cloudId)) continue;
    merged.push(pattern);
  }

  return merged.sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export interface UsePatternStorageOptions {
  canCloudSync?: boolean;
}

export interface UsePatternStorageReturn {
  savedPatterns: SavedPattern[];
  savePattern: (name: string, preset: BeatPreset, tags?: string[]) => string;
  deletePattern: (id: string) => void;
  renamePattern: (id: string, newName: string) => void;
  exportAll: () => string;
  importPatterns: (json: string) => number;
  syncStatus: PatternSyncStatus;
  lastSyncError: string | null;
}

export function usePatternStorage(
  options: UsePatternStorageOptions = {},
): UsePatternStorageReturn {
  const { canCloudSync = false } = options;
  const [savedPatterns, setSavedPatterns] = useState<SavedPattern[]>(loadFromStorage);
  const [syncStatus, setSyncStatus] = useState<PatternSyncStatus>("local");
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const hydratingRef = useRef(false);

  useEffect(() => {
    saveToStorage(savedPatterns);
  }, [savedPatterns]);

  const hydrateFromCloud = useCallback(async () => {
    if (!canCloudSync || hydratingRef.current) return;
    hydratingRef.current = true;
    setSyncStatus("syncing");
    setLastSyncError(null);
    try {
      const res = await fetch(`${API_BASE}/api/beat-patterns`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Sync failed (${res.status})`);
      }
      const body = (await res.json()) as { patterns: CloudBeatPatternRow[] };
      const remote = (body.patterns ?? []).map(cloudRowToSaved);
      setSavedPatterns((prev) => mergePatterns(prev, remote));
      setSyncStatus("synced");
    } catch (e) {
      setSyncStatus("error");
      setLastSyncError(e instanceof Error ? e.message : "Cloud sync failed");
    } finally {
      hydratingRef.current = false;
    }
  }, [canCloudSync]);

  useEffect(() => {
    if (canCloudSync) void hydrateFromCloud();
    else {
      setSyncStatus("local");
      setLastSyncError(null);
    }
  }, [canCloudSync, hydrateFromCloud]);

  const pushPatternToCloud = useCallback(
    async (pattern: SavedPattern) => {
      if (!canCloudSync) return pattern;
      const res = await fetch(`${API_BASE}/api/beat-patterns`, {
        method: "POST",
        headers: {
          ...(await authHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: pattern.name,
          preset: pattern.preset,
          tags: pattern.tags,
        }),
      });
      if (!res.ok) throw new Error(`Save sync failed (${res.status})`);
      const body = (await res.json()) as { pattern: CloudBeatPatternRow };
      return cloudRowToSaved(body.pattern);
    },
    [canCloudSync],
  );

  const savePattern = useCallback(
    (name: string, preset: BeatPreset, tags: string[] = []): string => {
      const now = new Date().toISOString();
      const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const entry: SavedPattern = {
        id,
        name: name.trim() || "Untitled Pattern",
        createdAt: now,
        updatedAt: now,
        preset,
        tags,
        cloudId: null,
      };
      setSavedPatterns((prev) => [entry, ...prev]);

      if (canCloudSync) {
        setSyncStatus("syncing");
        void pushPatternToCloud(entry)
          .then((cloudPattern) => {
            setSavedPatterns((prev) =>
              prev.map((p) => (p.id === id ? cloudPattern : p)),
            );
            setSyncStatus("synced");
            setLastSyncError(null);
          })
          .catch((e) => {
            setSyncStatus("error");
            setLastSyncError(e instanceof Error ? e.message : "Cloud save failed");
          });
      }

      return id;
    },
    [canCloudSync, pushPatternToCloud],
  );

  const deletePattern = useCallback(
    (id: string) => {
      const target = savedPatterns.find((p) => p.id === id);
      setSavedPatterns((prev) => prev.filter((p) => p.id !== id));

      if (canCloudSync && target?.cloudId) {
        const cloudId = target.cloudId;
        setSyncStatus("syncing");
        void (async () => {
          try {
            const res = await fetch(`${API_BASE}/api/beat-patterns/${cloudId}`, {
              method: "DELETE",
              headers: await authHeaders(),
            });
            if (!res.ok && res.status !== 404) {
              throw new Error(`Delete sync failed (${res.status})`);
            }
            setSyncStatus("synced");
            setLastSyncError(null);
          } catch (e) {
            setSyncStatus("error");
            setLastSyncError(e instanceof Error ? e.message : "Cloud delete failed");
          }
        })();
      }
    },
    [canCloudSync, savedPatterns],
  );

  const renamePattern = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      let cloudId: string | null | undefined;
      setSavedPatterns((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          cloudId = p.cloudId;
          return { ...p, name: trimmed, updatedAt: now };
        }),
      );

      if (canCloudSync && cloudId) {
        const remoteId = cloudId;
        setSyncStatus("syncing");
        void (async () => {
          try {
            const res = await fetch(`${API_BASE}/api/beat-patterns/${remoteId}`, {
              method: "PUT",
              headers: {
                ...(await authHeaders()),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ name: trimmed }),
            });
            if (!res.ok) throw new Error(`Rename sync failed (${res.status})`);
            setSyncStatus("synced");
            setLastSyncError(null);
          } catch (e) {
            setSyncStatus("error");
            setLastSyncError(e instanceof Error ? e.message : "Cloud rename failed");
          }
        })();
      }
    },
    [canCloudSync],
  );

  const exportAll = useCallback((): string => {
    const data: StorageData = { version: 1, patterns: savedPatterns };
    return JSON.stringify(data, null, 2);
  }, [savedPatterns]);

  const importPatterns = useCallback((json: string): number => {
    try {
      const data: StorageData = JSON.parse(json);
      if (data.version !== 1 || !Array.isArray(data.patterns)) return 0;

      setSavedPatterns((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newPatterns = data.patterns
          .filter((p) => !existingIds.has(p.id))
          .map((p) => ({
            ...p,
            updatedAt: p.updatedAt ?? p.createdAt,
          }));
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
    syncStatus,
    lastSyncError,
  };
}
