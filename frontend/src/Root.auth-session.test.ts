import { describe, expect, it, vi } from "vitest";
import {
  reconcileWorkspaceAuthSession,
  WORKSPACE_AUTH_USER_KEY,
  WORKSPACE_SPLIT_RESULT_KEY,
} from "./Root";

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(initial));
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe("workspace auth session reconciliation", () => {
  it("clears persisted split state when the authenticated user changes", () => {
    const resetSplitSession = vi.fn();
    const storage = createMemoryStorage({
      [WORKSPACE_AUTH_USER_KEY]: "user_a",
      [WORKSPACE_SPLIT_RESULT_KEY]: JSON.stringify({ stemIds: ["vocals"] }),
    });

    const nextUserId = reconcileWorkspaceAuthSession({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_b",
      previousUserId: "user_a",
      storage,
      resetSplitSession,
    });

    expect(nextUserId).toBe("user_b");
    expect(resetSplitSession).toHaveBeenCalledTimes(1);
    expect(storage.getItem(WORKSPACE_SPLIT_RESULT_KEY)).toBeNull();
    expect(storage.getItem(WORKSPACE_AUTH_USER_KEY)).toBe("user_b");
  });

  it("preserves split state for the same authenticated user", () => {
    const resetSplitSession = vi.fn();
    const storage = createMemoryStorage({
      [WORKSPACE_AUTH_USER_KEY]: "user_a",
      [WORKSPACE_SPLIT_RESULT_KEY]: JSON.stringify({ stemIds: ["vocals"] }),
    });

    const nextUserId = reconcileWorkspaceAuthSession({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_a",
      previousUserId: "user_a",
      storage,
      resetSplitSession,
    });

    expect(nextUserId).toBe("user_a");
    expect(resetSplitSession).not.toHaveBeenCalled();
    expect(storage.getItem(WORKSPACE_SPLIT_RESULT_KEY)).not.toBeNull();
  });

  it("clears legacy split state when no persisted owner is known", () => {
    const resetSplitSession = vi.fn();
    const storage = createMemoryStorage({
      [WORKSPACE_SPLIT_RESULT_KEY]: JSON.stringify({ stemIds: ["vocals"] }),
    });

    const nextUserId = reconcileWorkspaceAuthSession({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_b",
      previousUserId: null,
      storage,
      resetSplitSession,
    });

    expect(nextUserId).toBe("user_b");
    expect(resetSplitSession).toHaveBeenCalledTimes(1);
    expect(storage.getItem(WORKSPACE_SPLIT_RESULT_KEY)).toBeNull();
    expect(storage.getItem(WORKSPACE_AUTH_USER_KEY)).toBe("user_b");
  });

  it("clears split state on sign-out", () => {
    const resetSplitSession = vi.fn();
    const storage = createMemoryStorage({
      [WORKSPACE_AUTH_USER_KEY]: "user_a",
      [WORKSPACE_SPLIT_RESULT_KEY]: JSON.stringify({ stemIds: ["vocals"] }),
    });

    const nextUserId = reconcileWorkspaceAuthSession({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      previousUserId: "user_a",
      storage,
      resetSplitSession,
    });

    expect(nextUserId).toBeNull();
    expect(resetSplitSession).toHaveBeenCalledTimes(1);
    expect(storage.getItem(WORKSPACE_SPLIT_RESULT_KEY)).toBeNull();
    expect(storage.getItem(WORKSPACE_AUTH_USER_KEY)).toBeNull();
  });
});
