import { describe, it, expect } from "vitest";
import { entriesNeedingStemLoad } from "./stemLoadUtils";

describe("entriesNeedingStemLoad", () => {
  const job1 =
    "https://app.example/api/stems/file/00000000-0000-0000-0000-000000000001/vocals.wav";
  const job2 =
    "https://app.example/api/stems/file/00000000-0000-0000-0000-000000000002/vocals.wav";

  it("includes new stem ids", () => {
    const needs = entriesNeedingStemLoad(
      [{ id: "vocals", url: job1 }],
      {},
      {},
    );
    expect(needs).toHaveLength(1);
  });

  it("includes same id when URL changed (expand / new job)", () => {
    const needs = entriesNeedingStemLoad(
      [{ id: "vocals", url: job2 }],
      { vocals: {} },
      { vocals: job1 },
    );
    expect(needs).toHaveLength(1);
    expect(needs[0].url).toBe(job2);
  });

  it("excludes unchanged id and URL", () => {
    const needs = entriesNeedingStemLoad(
      [{ id: "vocals", url: job1 }],
      { vocals: {} },
      { vocals: job1 },
    );
    expect(needs).toHaveLength(0);
  });
});
