import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchRhythmStylesResilient,
  generateRhythmGroove,
} from "./midiRhythm";
import { OFFLINE_RHYTHM_STYLES } from "../data/offlineRhythmStyles";

vi.mock("./auth", () => ({
  authHeaders: vi.fn().mockResolvedValue({}),
}));

describe("midiRhythm resilient API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("falls back to offline styles when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("service down")),
    );

    const result = await fetchRhythmStylesResilient();
    expect(result.source).toBe("offline");
    expect(result.styles).toEqual(OFFLINE_RHYTHM_STYLES);
  });

  it("uses cached styles when fetch fails after a successful load", async () => {
    const onlineStyles = [{ id: "rock", label: "Rock" }];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ styles: onlineStyles }),
        })
        .mockRejectedValueOnce(new Error("service down")),
    );

    const first = await fetchRhythmStylesResilient();
    expect(first.source).toBe("online");

    const second = await fetchRhythmStylesResilient();
    expect(second.source).toBe("cached");
    expect(second.styles).toEqual(onlineStyles);
  });

  it("generates offline groove when API generate fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );

    const result = await generateRhythmGroove({
      style: "rock",
      bars: 2,
      tempo: 120,
      energy: 0.7,
    });

    expect(result.source).toBe("offline");
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.filename).toContain("offline_rock");
  });
});
