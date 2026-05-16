/**
 * useDjToolbarConfig — Manages which mixer tools are visible in the DJ mode
 * bottom console and their display order. Persisted to localStorage.
 */
import { useCallback, useMemo, useState } from "react";

export type DjToolId = "faders" | "eq" | "fx" | "pan" | "meters" | "master";

export interface DjToolSlot {
  id: DjToolId;
  label: string;
  visible: boolean;
}

const STORAGE_KEY = "burntbeats_dj_toolbar_config";

const DEFAULT_SLOTS: DjToolSlot[] = [
  { id: "faders", label: "Faders", visible: true },
  { id: "eq", label: "EQ", visible: true },
  { id: "pan", label: "Pan", visible: true },
  { id: "fx", label: "FX", visible: false },
  { id: "meters", label: "Meters", visible: true },
  { id: "master", label: "Master", visible: true },
];

function loadSlots(): DjToolSlot[] {
  if (typeof window === "undefined") return DEFAULT_SLOTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SLOTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SLOTS;
    // Validate structure — each entry must have a known id and boolean visible
    const knownIds = new Set<string>(DEFAULT_SLOTS.map((s) => s.id));
    const validSlots: DjToolSlot[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        knownIds.has(item.id) &&
        typeof item.visible === "boolean"
      ) {
        const def = DEFAULT_SLOTS.find((d) => d.id === item.id)!;
        validSlots.push({ id: item.id as DjToolId, label: def.label, visible: item.visible });
      }
    }
    // Add any missing slots (new features added after user saved config)
    for (const def of DEFAULT_SLOTS) {
      if (!validSlots.some((s) => s.id === def.id)) {
        validSlots.push(def);
      }
    }
    return validSlots.length > 0 ? validSlots : DEFAULT_SLOTS;
  } catch {
    return DEFAULT_SLOTS;
  }
}

function saveSlots(slots: DjToolSlot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
}

export function useDjToolbarConfig() {
  const [slots, setSlots] = useState<DjToolSlot[]>(loadSlots);

  const toggleSlot = useCallback((id: DjToolId) => {
    setSlots((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s));
      saveSlots(next);
      return next;
    });
  }, []);

  const reorderSlots = useCallback((fromIndex: number, toIndex: number) => {
    setSlots((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      saveSlots(next);
      return next;
    });
  }, []);

  const resetSlots = useCallback(() => {
    setSlots(DEFAULT_SLOTS);
    saveSlots(DEFAULT_SLOTS);
  }, []);

  const visibleSlots = useMemo(() => slots.filter((s) => s.visible), [slots]);

  return { slots, visibleSlots, toggleSlot, reorderSlots, resetSlots };
}
