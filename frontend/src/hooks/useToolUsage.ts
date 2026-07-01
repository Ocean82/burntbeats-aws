import { useMemo, useState } from "react";

export type ToolId = "editor" | "beats" | "midi" | "speech" | "tuner" | "my-stems";

interface ToolUsage {
  [toolId: string]: {
    count: number;
    lastUsed: string;
  };
}

const STORAGE_KEY = "burntbeats_tool_usage";

function loadUsage(): ToolUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ToolUsage;
    if (typeof parsed !== "object" || Array.isArray(parsed)) return {};
    for (const [_key, value] of Object.entries(parsed)) {
      if (typeof value !== "object" || value === null || typeof value.count !== "number" || typeof value.lastUsed !== "string") {
        return {};
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveUsage(usage: ToolUsage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // quota exceeded or unavailable
  }
}

export function useToolUsage() {
  const [usage, setUsage] = useState<ToolUsage>(loadUsage);

  const touch = (toolId: ToolId) => {
    setUsage((prev) => {
      const next = {
        ...prev,
        [toolId]: {
          count: (prev[toolId]?.count || 0) + 1,
          lastUsed: new Date().toISOString(),
        },
      };
      saveUsage(next);
      return next;
    });
  };

  const getCount = (toolId: ToolId) => usage[toolId]?.count || 0;
  const getLastUsed = (toolId: ToolId) => usage[toolId]?.lastUsed || null;
  const hasUsed = (toolId: ToolId) => (usage[toolId]?.count || 0) > 0;

  const sortedTools = useMemo(() => {
    return Object.keys(usage)
      .sort((a, b) => (usage[b]?.count || 0) - (usage[a]?.count || 0))
      .filter((id): id is ToolId => ["editor", "beats", "midi", "speech", "tuner", "my-stems"].includes(id));
  }, [usage]);

  return { touch, getCount, getLastUsed, hasUsed, sortedTools };
}
