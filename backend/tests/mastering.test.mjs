import test from "node:test";
import assert from "node:assert/strict";

import { buildMasteringFilterChain, getMasteringPreset } from "../lib/mastering.js";

test("getMasteringPreset returns known genre presets", async () => {
  const rock = await getMasteringPreset("rock_modern");
  const hiphop = await getMasteringPreset("hiphop");
  const edm = await getMasteringPreset("edm");
  const classical = await getMasteringPreset("classical_audiophile");

  assert.equal(rock?.genre, "rock");
  assert.equal(hiphop?.genre, "hiphop");
  assert.equal(edm?.genre, "electronic");
  assert.equal(classical?.genre, "classical");
});

test("buildMasteringFilterChain includes loudness and limiter stages", () => {
  const chain = buildMasteringFilterChain({
    eq: { enabled: false },
    compressor: { enabled: false },
    stereoEnhancer: { enabled: false },
    exciter: { enabled: false },
    loudness: { targetLUFS: -11, truePeak: -0.3, dynamicRange: 6 },
    limiter: { enabled: true, ceiling: -0.3, release: 50 },
  });

  assert.match(chain, /loudnorm=I=-11/);
  assert.match(chain, /alimiter=/);
});
