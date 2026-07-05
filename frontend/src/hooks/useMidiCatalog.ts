/**
 * useMidiCatalog — fetch and filter the MIDI template catalog with debounced search.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../api/client";
import { API_BASE } from "../config";

export type CatalogTab = "progression" | "rhythm";

export interface MidiCatalogCategory {
  type: string;
  genre: string;
  key: string;
  time_signature: string;
  complexity: string;
  tempo: string;
}

export interface MidiCatalogAnalysis {
  estimatedTempo: number;
  length: number;
  track_count: number;
  note_count: number;
}

export interface MidiCatalogEntry {
  id: string;
  title: string;
  filename: string;
  category: MidiCatalogCategory;
  analysis: MidiCatalogAnalysis;
  tags: string[];
}

export interface MidiCatalogStatistics {
  total_entries: number;
  by_genre: Record<string, number>;
}

export interface MidiCatalogFilters {
  q: string;
  genre: string;
  key: string;
  tempo: string;
  tab: CatalogTab;
}

export interface MidiCatalogResponse {
  total: number;
  offset: number;
  limit: number;
  entries: MidiCatalogEntry[];
  statistics: MidiCatalogStatistics;
}

const RHYTHM_TYPES = new Set(["groove", "loop", "rhythm", "arrangement"]);

const DEBOUNCE_MS = 300;

function buildQueryParams(filters: MidiCatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.key) params.set("key", filters.key);
  if (filters.tempo) params.set("tempo", filters.tempo);
  if (filters.tab === "progression") {
    params.set("type", "progression");
  }
  return params;
}

function filterRhythmEntries(entries: MidiCatalogEntry[]): MidiCatalogEntry[] {
  return entries.filter((e) => RHYTHM_TYPES.has(e.category?.type ?? ""));
}

async function fetchCatalog(filters: MidiCatalogFilters): Promise<MidiCatalogResponse> {
  const params = buildQueryParams(filters);
  const qs = params.toString();
  const path = `/api/catalog/midi${qs ? `?${qs}` : ""}`;
  const result = await apiGet<MidiCatalogResponse>(path);
  if (result.error || !result.data) {
    throw new Error(result.error ?? "Failed to load MIDI catalog");
  }
  const data = result.data;
  if (filters.tab === "rhythm") {
    const filtered = filterRhythmEntries(data.entries);
    return { ...data, entries: filtered, total: filtered.length };
  }
  return data;
}

export function useMidiCatalog() {
  const [filters, setFilters] = useState<MidiCatalogFilters>({
    q: "",
    genre: "",
    key: "",
    tempo: "",
    tab: "progression",
  });
  const [entries, setEntries] = useState<MidiCatalogEntry[]>([]);
  const [statistics, setStatistics] = useState<MidiCatalogStatistics | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (nextFilters: MidiCatalogFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCatalog(nextFilters);
      if (mountedRef.current) {
        setEntries(data.entries);
        setTotal(data.total);
        setStatistics(data.statistics ?? null);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load catalog");
        setEntries([]);
        setTotal(0);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load(filters);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters, load]);

  const setTab = useCallback((tab: CatalogTab) => {
    setFilters((f) => ({ ...f, tab }));
  }, []);

  const setSearch = useCallback((q: string) => {
    setFilters((f) => ({ ...f, q }));
  }, []);

  const setGenre = useCallback((genre: string) => {
    setFilters((f) => ({ ...f, genre }));
  }, []);

  const setKey = useCallback((key: string) => {
    setFilters((f) => ({ ...f, key }));
  }, []);

  const setTempo = useCallback((tempo: string) => {
    setFilters((f) => ({ ...f, tempo }));
  }, []);

  const refetch = useCallback(() => {
    void load(filters);
  }, [filters, load]);

  const genreOptions = useMemo(() => {
    if (!statistics?.by_genre) return [];
    return Object.keys(statistics.by_genre).sort();
  }, [statistics]);

  const keyOptions = useMemo(() => {
    const keys = new Set(entries.map((e) => e.category?.key).filter(Boolean));
    return Array.from(keys).sort();
  }, [entries]);

  const tempoOptions = useMemo(
    () => ["slow", "moderate", "fast"] as const,
    [],
  );

  return {
    filters,
    entries,
    total,
    statistics,
    isLoading,
    error,
    genreOptions,
    keyOptions,
    tempoOptions,
    setTab,
    setSearch,
    setGenre,
    setKey,
    setTempo,
    refetch,
  };
}

export function catalogFileUrl(id: string): string {
  return `${API_BASE}/api/catalog/midi/${id}/file`;
}
