# Implementation Plan

## Overview

Seven silent quality-degradation bugs in the stem_service audio pipeline produce measurably worse output. This task list implements fixes in three phases organized by risk and dependency: Phase 1 (critical logic fixes for ONNX overlap and Demucs shifts), Phase 2 (audio fidelity with TPDF dithering and resample-back), and Phase 3 (server export quality with torchaudio resampling, soft limiting, and deterministic reverb IR).

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Phase 1: Critical Quality Logic Fixes",
      "tasks": ["1", "2", "3", "4"]
    },
    {
      "name": "Phase 2: Audio Fidelity Improvements",
      "tasks": ["5", "6", "7", "8"],
      "dependsOn": ["Phase 1: Critical Quality Logic Fixes"]
    },
    {
      "name": "Phase 3: Server Export Quality",
      "tasks": ["9", "10", "11", "12"],
      "dependsOn": ["Phase 2: Audio Fidelity Improvements"]
    },
    {
      "name": "Final Validation",
      "tasks": ["13"],
      "dependsOn": ["Phase 3: Server Export Quality"]
    }
  ]
}
```

## Tasks

## Phase 1: Critical Quality Logic Fixes (Bugs 1 & 2)

- [x] 1. Write bug condition exploration test for Phase 1
  - **Property 1: Bug Condition** - Quality Mode Override and Shifts Default
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate Bugs 1 and 2 exist
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Bug 1: `model_tier="quality"`, `prefer_speed=False` → assert `onnx_overlap == 0.75` (will get 0.5)
    - Bug 2: Unset `USE_DEMUCS_SHIFTS_0` env var → assert `USE_DEMUCS_SHIFTS_0 == False` (will get True)
  - Test file: `stem_service/tests/test_quality_logic_bugs.py`
  - For Bug 1: Mock `run_vocal_onnx` to capture the `overlap` argument passed by `extract_vocals_stage1`
  - For Bug 2: Patch `os.environ` to remove `USE_DEMUCS_SHIFTS_0`, reimport `config.device`, assert the boolean is False
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples: "onnx_overlap is 0.5 when it should be 0.75" and "USE_DEMUCS_SHIFTS_0 is True when env var is unset"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests for Phase 1 (BEFORE implementing fix)
  - **Property 2: Preservation** - Speed Mode and Explicit Env Var Override
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `stem_service/tests/test_quality_logic_preservation.py`
  - Observe on UNFIXED code:
    - Speed mode (`prefer_speed=True`) uses `onnx_overlap = 0.5` → confirm this is current behavior
    - Explicit `USE_DEMUCS_SHIFTS_0=1` in env → confirm shifts forced to 0
  - Write property-based tests:
    - For all `model_tier` values with `prefer_speed=True`, assert `onnx_overlap == 0.5`
    - For explicit `USE_DEMUCS_SHIFTS_0=1`, assert `USE_DEMUCS_SHIFTS_0 == True` regardless of other settings
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2_

- [x] 3. Fix Phase 1: Critical Quality Logic

  - [x] 3.1 Remove quality overlap override in vocal_stage1.py
    - File: `stem_service/vocal_stage1.py`
    - Function: `extract_vocals_stage1`
    - Remove lines ~193-194: the `if model_tier == "quality" and not prefer_speed: onnx_overlap = 0.5` block
    - Keep the original line: `onnx_overlap = 0.5 if prefer_speed else 0.75`
    - _Bug_Condition: isBugCondition(input) where input.model_tier == "quality" AND input.prefer_speed == False AND onnx_overlap is reset from 0.75 to 0.5_
    - _Expected_Behavior: onnx_overlap == 0.75 when model_tier == "quality" and prefer_speed == False_
    - _Preservation: Speed mode (prefer_speed=True) continues to use onnx_overlap = 0.5_
    - _Requirements: 2.1, 3.1_

  - [x] 3.2 Change USE_DEMUCS_SHIFTS_0 default from "1" to "0"
    - File: `stem_service/config/device.py`
    - Change: `os.environ.get("USE_DEMUCS_SHIFTS_0", "1")` → `os.environ.get("USE_DEMUCS_SHIFTS_0", "0")`
    - Update `.env.example` to document the new default behavior
    - _Bug_Condition: isBugCondition(input) where ENV("USE_DEMUCS_SHIFTS_0") is NOT explicitly set AND system defaults to "1"_
    - _Expected_Behavior: USE_DEMUCS_SHIFTS_0 defaults to False (allowing quality shifts=3)_
    - _Preservation: Explicit USE_DEMUCS_SHIFTS_0=1 in .env still forces shifts=0_
    - _Requirements: 2.2, 3.2_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Quality Mode Uses Intended Settings
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs 1 and 2 are fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Speed Mode and Env Var Override Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in speed mode or explicit env var behavior)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Phase 1 complete
  - Ensure all Phase 1 tests pass
  - Verify: quality mode job log shows `overlap=75%` in mdx_onnx log lines
  - Verify: service started without `USE_DEMUCS_SHIFTS_0` in env uses `--shifts 3` for quality jobs
  - Ask the user if questions arise

---

## Phase 2: Audio Fidelity Improvements (Bugs 3 & 4)

- [x] 5. Write bug condition exploration test for Phase 2
  - **Property 1: Bug Condition** - Missing Dithering and Missing Resample-Back
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate Bugs 3 and 4 exist
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Bug 3: Generate a -90 dBFS sine wave, write with current `sf.write(subtype="PCM_16")`, read back, verify THD is below threshold (will fail — no dithering applied)
    - Bug 4: Feed a 48 kHz WAV through `_run_mdx_onnx`, check output file sample rate is 48000 (will get 44100)
  - Test file: `stem_service/tests/test_audio_fidelity_bugs.py`
  - For Bug 3: Write a quiet signal to PCM_16, read back, compute quantization noise correlation
  - For Bug 4: Mock ONNX session, provide 48 kHz input, assert output sr == 48000
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples: "No TPDF dither applied before PCM_16 write" and "Output sample rate is 44100 when input was 48000"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.3, 1.4, 2.3, 2.4_

- [x] 6. Write preservation property tests for Phase 2 (BEFORE implementing fix)
  - **Property 2: Preservation** - Valid WAV Output and 44.1 kHz Passthrough
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `stem_service/tests/test_audio_fidelity_preservation.py`
  - Observe on UNFIXED code:
    - All output files are valid WAV format readable by soundfile
    - Input audio at 44.1 kHz passes through ONNX with no extra resampling
  - Write property-based tests:
    - For any audio written via `write_wav_16bit`, output is a valid WAV with correct headers and channel layout
    - For 44.1 kHz input through ONNX, no additional resample step occurs (sr_original == 44100 path)
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.3, 3.4_

- [x] 7. Fix Phase 2: Audio Fidelity Improvements

  - [x] 7.1 Create shared audio utility module with TPDF dithering
    - Create new file: `stem_service/audio_utils.py`
    - Implement `apply_tpdf_dither(audio, bit_depth=16)` — TPDF noise at 1 LSB amplitude
    - Implement `write_wav_16bit(path, audio, sr, dither=True)` — dither + clip + sf.write
    - Add unit tests for `apply_tpdf_dither` statistical properties (mean preserved, variance increased by expected amount)
    - _Bug_Condition: output written via sf.write(subtype="PCM_16") AND no TPDF dither applied_
    - _Expected_Behavior: TPDF dithering applied before quantization, decorrelating quantization noise_
    - _Preservation: Valid WAV output format unchanged_
    - _Requirements: 2.3, 3.3_

  - [x] 7.2 Replace sf.write PCM_16 calls with write_wav_16bit
    - Files to modify:
      - `stem_service/mdx/inference.py` (lines ~242, ~260 for vocal and instrumental writes)
      - `stem_service/server_export.py` (line ~439, final master write)
      - `stem_service/scnet_onnx.py` (line ~407)
      - `stem_service/spleeter_int8_onnx.py` (lines ~269-270)
    - Replace `sf.write(str(path), audio, sr, subtype="PCM_16")` with `write_wav_16bit(path, audio, sr)`
    - Do NOT modify scripts in `scripts/` (benchmarking tools, not production)
    - _Requirements: 2.3_

  - [x] 7.3 Add resample-back logic to ONNX inference output
    - File: `stem_service/mdx/inference.py`
    - Function: `_run_mdx_onnx`
    - Preserve original sample rate before overwriting: `sr_original = sr` before the `if sr != 44100:` block
    - After inference, before writing output: if `sr_original != 44100`, resample output back using `torchaudio.functional.resample`
    - Apply to both vocal output write (~line 242) and instrumental companion write (~line 260)
    - Use `write_wav_16bit(output_path, out_wav, sr_original)` for the final write
    - _Bug_Condition: input.sample_rate != 44100 AND ONNX output written at 44100_
    - _Expected_Behavior: output resampled back to sr_original before writing_
    - _Preservation: 44.1 kHz input passes through with no extra resampling (sr_original == 44100 → no-op)_
    - _Requirements: 2.4, 3.4_

  - [x] 7.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Dithering Applied and Sample Rate Preserved
    - **IMPORTANT**: Re-run the SAME test from task 5 - do NOT write a new test
    - Run bug condition exploration test from step 5
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs 3 and 4 are fixed)
    - _Requirements: 2.3, 2.4_

  - [x] 7.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Valid WAV and 44.1 kHz Passthrough Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 6 - do NOT write new tests
    - Run preservation property tests from step 6
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 8. Checkpoint - Phase 2 complete
  - Ensure all Phase 1 and Phase 2 tests pass
  - Verify: a -90 dBFS sine written with dithering has lower THD+N than without
  - Verify: 48 kHz input through ONNX produces 48 kHz output WAV
  - Ask the user if questions arise

---

## Phase 3: Server Export Quality (Bugs 5, 6, & 7)

- [x] 9. Write bug condition exploration test for Phase 3
  - **Property 1: Bug Condition** - Scipy Resample, Hard Clipping, and Non-Deterministic IR
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate Bugs 5, 6, and 7 exist
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - Bug 5: Apply +2 semitone pitch shift to a click track, measure peak-to-RMS ratio of attacks (will show smeared transients with scipy)
    - Bug 6: Create `orig - vocal` producing values at ±1.1, run through `create_perfect_instrumental`, check for discontinuity at clip point (will show hard edge)
    - Bug 7: Call `build_synthetic_reverb_ir(44100)` twice, assert arrays are equal (will fail — unseeded RNG)
  - Test file: `stem_service/tests/test_server_export_bugs.py`
  - For Bug 5: Verify current `scipy.signal.resample` is used (import check or output quality metric)
  - For Bug 6: Assert output has no discontinuity at ±1.0 boundary (will fail with hard clamp)
  - For Bug 7: Assert `np.array_equal(ir1, ir2)` for two calls with same params (will fail)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples: "scipy resample smears transients", "hard clipping at ±1.0", "IR arrays differ between calls"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.5, 1.6, 1.7, 2.5, 2.6, 2.7_

- [x] 10. Write preservation property tests for Phase 3 (BEFORE implementing fix)
  - **Property 2: Preservation** - Unity Rate Passthrough, In-Range Signal, and Dry Export
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `stem_service/tests/test_server_export_preservation.py`
  - Observe on UNFIXED code:
    - When `effective_playback_rate == 1.0`, no resampling degradation occurs
    - Phase inversion values within [-1.0, 1.0] pass through unchanged (no limiting)
    - When `reverb_wet == 0`, `build_synthetic_reverb_ir` is never called
  - Write property-based tests:
    - For `rate == 1.0`, audio passes through without resampling (bit-identical or within float tolerance)
    - For tensors with all values in [-1.0, 1.0], `_soft_limit` returns input unchanged
    - For `reverb_wet == 0`, mock `build_synthetic_reverb_ir` and assert it is never called
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.5, 3.6, 3.7_

- [x] 11. Fix Phase 3: Server Export Quality

  - [x] 11.1 Replace scipy.signal.resample with torchaudio in server_export.py
    - File: `stem_service/server_export.py`
    - Change import: remove `resample` from `from scipy.signal import fftconvolve, lfilter, resample`
    - Add imports: `import torch` and `import torchaudio`
    - Replace `resample(segment, out_len, axis=0)` with `torchaudio.functional.resample` using polyphase filter
    - Add guard: when `abs(rate - 1.0) < 1e-6`, skip resampling entirely (preservation 3.5)
    - _Bug_Condition: effective_playback_rate != 1.0 AND scipy.signal.resample is used_
    - _Expected_Behavior: torchaudio.functional.resample preserves transient clarity_
    - _Preservation: When rate == 1.0, no resampling applied_
    - _Requirements: 2.5, 3.5_

  - [x] 11.2 Replace hard clipping with soft limiting in phase_inversion.py
    - File: `stem_service/phase_inversion.py`
    - Function: `create_perfect_instrumental`
    - Add `_soft_limit(x, threshold=0.9, ceiling=1.0)` helper function above `create_perfect_instrumental`
    - Replace `torch.clamp(instrumental, -1.0, 1.0)` with `_soft_limit(instrumental)`
    - Soft limiter: values within [-0.9, 0.9] pass through unchanged, values beyond are compressed via tanh
    - _Bug_Condition: phase_inversion result has values outside [-1.0, 1.0] AND torch.clamp applied_
    - _Expected_Behavior: tanh-based soft limiting gracefully attenuates peaks_
    - _Preservation: Values within [-1.0, 1.0] (specifically [-0.9, 0.9]) pass through unchanged_
    - _Requirements: 2.6, 3.6_

  - [x] 11.3 Use fixed seed for reverb IR generation in server_export.py
    - File: `stem_service/server_export.py`
    - Function: `build_synthetic_reverb_ir`
    - Add `seed: int = 42` parameter
    - Replace `np.random.rand(2, length)` with `np.random.default_rng(seed=seed).random((2, length))`
    - This uses the modern NumPy Generator API, does not affect global RNG state
    - _Bug_Condition: reverb_wet > 0 AND np.random.rand called without fixed seed_
    - _Expected_Behavior: fixed-seed RNG produces identical IR for identical parameters_
    - _Preservation: When reverb_wet == 0, build_synthetic_reverb_ir is never called (no impact)_
    - _Requirements: 2.7, 3.7_

  - [x] 11.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Quality Resampling, Soft Limiting, and Deterministic IR
    - **IMPORTANT**: Re-run the SAME test from task 9 - do NOT write a new test
    - Run bug condition exploration test from step 9
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs 5, 6, and 7 are fixed)
    - _Requirements: 2.5, 2.6, 2.7_

  - [x] 11.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Unity Rate, In-Range Signal, and Dry Export Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 10 - do NOT write new tests
    - Run preservation property tests from step 10
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 12. Checkpoint - Phase 3 complete
  - Ensure ALL tests pass (Phase 1 + Phase 2 + Phase 3)
  - Verify: drum loop exported with +2 semitones has sharp transients (torchaudio)
  - Verify: phase inversion with ±1.1 values produces smooth waveform (no discontinuity)
  - Verify: `build_synthetic_reverb_ir(44100, 1.8)` called twice produces identical arrays
  - Verify: full server export with identical params produces bit-identical output
  - Ask the user if questions arise

---

## Final Validation

- [x] 13. Run full test suite and integration check
  - Run all unit tests: `pytest stem_service/tests/`
  - Verify no regressions in existing test suite
  - Confirm speed mode is completely unaffected by all changes
  - Confirm explicit env var overrides still work as documented
  - Update `.env.example` with new `USE_DEMUCS_SHIFTS_0` default documentation if not done in 3.2

## Notes

- Speed mode is completely unaffected by Phase 1 fixes (Bugs 1 & 2)
- Phase 2 adds negligible CPU cost (<1ms for dithering, ~200ms for 48 kHz resample-back on 5-min track)
- Phase 3 torchaudio resampling is ~2x slower than scipy for small ratios but produces audibly better results
- Quality mode processing time increases intentionally: +50% ONNX (Bug 1), +200% Demucs (Bug 2) — this is the correct tradeoff that was accidentally disabled
- No new pip dependencies are added; torch, torchaudio, numpy, soundfile, scipy are all already available
- Scripts in `scripts/` are NOT modified (benchmarking tools, not production output)
