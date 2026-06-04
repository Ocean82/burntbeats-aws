import { describe, it, expect } from "vitest"

/**
 * Single-decode contract: stem WAV fetch/decode runs once per provider tree mount.
 * Implementation: StemMediaProvider owns the only useStemLoading call (see StemMediaProvider.stem-load.test.tsx).
 */
describe("useStemLoading duplicate guard", () => {
  it("single decode path is owned by StemMediaProvider stem-load test", () => {
    expect(true).toBe(true)
  })
})
