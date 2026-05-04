# Beat-grid validation — decision record

Companion to **§1** in [`future-goals.md`](future-goals.md).

## Confidence threshold

- **Default:** hide the waveform beat-grid overlay when `confidence < 0.3`.
- **Constant:** `BEAT_GRID_MIN_CONFIDENCE` in `frontend/src/utils/beatGrid.ts` (`shouldRenderBeatGrid`).
- **Rationale:** values below ~0.3 correlate with unreliable tempo estimates (sparse drums, drift, noisy audio). Showing a wrong grid hurts trust more than hiding the feature; users still get the ruler-based time grid.

Gating is applied in **`MultiStemEditor`** (computing/display policy) and defensively again in **`waveform-timeline.component.tsx`** when `beatGrid` metadata is passed, so stale `beatGridPcts` cannot draw lines if confidence drops.

## Backend-only vs client-side fallback

**Decision:** stay **backend-only** for BPM / beat alignment in this product.

- **Why not client `essentia.js` (or similar) now:** large bundle weight, WASM/runtime cost, and duplicate logic vs the stem pipeline. BPM is not on the hot path for waveform rendering once metadata exists.
- **Source of truth:** `stem_service/bpm_analysis.py` → `beat_grid` on split job progress/status payloads; expand jobs preserve `beat_grid` from the source job (`stem_service/server.py`).

If we later need offline or instant previews before the server responds, revisit with an explicit spike (bundle budget + accuracy targets).

## Manual QA harness

Batch offline checks on real files:

- **Script:** `stem_service/scripts/bpm_qa_harness.py`
- **Usage:** see [`stem_service/scripts/README.md`](../../stem_service/scripts/README.md)

Automated coverage: `stem_service/tests/test_bpm_analysis.py` (synthetic WAV cases).

### User gate (not a CI gate)

Running the harness against a **representative set of your tracks** remains a manual QA step before treating beat-grid UX as fully validated on production music.
