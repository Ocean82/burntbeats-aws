# VAD pre-trim (Stage 0) – time vs quality vs need

**Last updated:** 2026-03-12

## What runs (Stage 0)

- **Code:** `stem_service/vad.py` using `models/silero_vad.jit` and the `silero-vad` pip package.
- **Not vadslice-main:** The `vadslice-main/` folder is a separate chunking library (for long-file, chunk-at-silence separation). The **current pipeline does not use vadslice-main**. Stage 0 is only our Silero VAD trim in `vad.py`.

**Stage 0 does:** Load full file → resample to 16 kHz → run Silero VAD → merge speech segments (gaps ≤300 ms) → take first-to-last speech span ± padding (0.3 s) → write `vad_trimmed.wav`. That trimmed file is then the only input to Stage 1 and Stage 2.

---

## Does it slow down or speed up total split time?

- **Cost of Stage 0:** A few seconds (load model once, load file, resample, VAD, write trimmed WAV). Typically on the order of 2–10 s for a 3‑minute track depending on CPU.
- **Savings:** Only when there is **leading/trailing or long silence**. Stage 1 (ONNX/Demucs) and Stage 2 (Demucs) then run on a **shorter** file, so wall time drops roughly in proportion to how much was trimmed (e.g. 30% silence → ~30% less time in Stage 1+2).

**Net:**

- **Tracks with little silence** (e.g. wall‑to‑wall vocals): VAD adds a few seconds and trims little → **small net slowdown** (a few seconds).
- **Tracks with lots of silence** (long intros, outros, or gaps): **Net speedup**; total time can be 20–40% lower.

So Stage 0 can either slightly increase or noticeably decrease total split time, depending on the track.

---

## Does it improve quality?

- **Separation quality** on the **kept** portion is unchanged. Same models, same audio content; we just run them on a shorter segment.
- **Output length:** Stems are **only as long as the trimmed audio** (first speech to last speech + padding). We do **not** pad stems back to the original file length. So:
  - You get **shorter stems** (intro/outro and long silent gaps are **missing** from the output).
  - If you need stems for the **full** track (e.g. full 3 minutes including intro/outro), VAD pre-trim is **wrong** for that goal.

So: no improvement in separation quality; possible **reduction in completeness** if you need full-length stems.

---

## Is it actually needed?

**No.** It’s optional.

- **USE_VAD_PRETRIM=0** (or `false`): No VAD trim. Full file is sent to Stage 1 and Stage 2. You get **full-length stems**. Slightly longer run on silence-heavy tracks; no extra cost on “all vocal” tracks.
- **USE_VAD_PRETRIM=1** (default): VAD trim is used when the model is available. Faster on silence-heavy material; stems are **shorter** (first-to-last speech span only).

**When to enable (default):** You care mainly about the “vocal part” and are okay with shorter stems; tracks often have long intros/outros/silence.

**When to disable:** You need stems for the **entire** file (e.g. full song length for mixing), or your material has little silence so VAD only adds a few seconds with no benefit.

---

## Summary

| Question | Answer |
|----------|--------|
| How much does Stage 0 slow down total split time? | Adds a few seconds (2–10 s typical). On tracks with little silence, that’s a **small net slowdown**. |
| How much does it improve quality? | It does **not** improve separation quality. It **shortens** output (stems = first-to-last speech only). |
| Is it needed? | **No.** Use `USE_VAD_PRETRIM=0` for full-length stems; use `1` for faster runs on silence-heavy material when short stems are acceptable. |
| Is vadslice-main involved? | **No.** Current pipeline uses only `stem_service/vad.py` (Silero .jit). vadslice-main is not used in the split flow. |
