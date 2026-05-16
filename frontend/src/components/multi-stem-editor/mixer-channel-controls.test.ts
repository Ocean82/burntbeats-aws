import { describe, expect, it } from "vitest";
import { channelMuteSoloButtonClass } from "./mixer-channel-controls";

describe("channelMuteSoloButtonClass", () => {
  it("returns active mute classes when muted", () => {
    const cls = channelMuteSoloButtonClass(true, "mute", "compact");
    expect(cls).toContain("bg-red-500/40");
    expect(cls).toContain("ring-red-400/60");
  });

  it("returns active solo classes when soloed", () => {
    const cls = channelMuteSoloButtonClass(true, "solo", "compact");
    expect(cls).toContain("bg-yellow-400/35");
    expect(cls).toContain("ring-yellow-300/50");
  });

  it("returns inactive classes when off", () => {
    const cls = channelMuteSoloButtonClass(false, "mute", "compact");
    expect(cls).toContain("bg-white/5");
    expect(cls).not.toContain("ring-red-400/60");
  });
});
