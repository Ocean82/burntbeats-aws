import { describe, expect, it } from "vitest";
import { defaultStemState } from "../stem-editor-state";
import { filterStemsForAudibleMix } from "./stemAudibility";

const stems = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("filterStemsForAudibleMix", () => {
  it("returns non-muted stems when nothing is soloed", () => {
    const states = {
      a: { ...defaultStemState(), muted: false },
      b: { ...defaultStemState(), muted: true },
      c: { ...defaultStemState(), muted: false },
    };
    expect(filterStemsForAudibleMix(stems, states).map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("returns only soloed stems when any solo is active", () => {
    const states = {
      a: { ...defaultStemState(), soloed: true, muted: true },
      b: { ...defaultStemState(), soloed: false, muted: false },
      c: { ...defaultStemState(), soloed: false, muted: false },
    };
    expect(filterStemsForAudibleMix(stems, states).map((s) => s.id)).toEqual(["a"]);
  });
});
