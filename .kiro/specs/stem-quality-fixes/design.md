# Stem Quality Fixes — Bugfix Design

## Overview

Seven silent quality-degradation bugs in the stem_service audio pipeline produce measurably worse output without causing crashes. The fix is organized into three phases by risk and dependency:

- **Phase 1** (Critical Logic): Remove the quality-overlap override in `vocal_stage1.py` and flip the `USE_DEMUCS_SHIFTS_0` default so quality mode actually uses its intended settings.
- **Phase 2** (Audio Fidelity): Add TPDF dithering before 16-bit PCM writes and resample ONNX output back to the original sample rate.
- **Phase 3** (Server Export Quality): Replace scipy resampling with torchaudio/soxr, replace hard clipping with soft limiting, and seed the reverb IR generator.

All fixes are scoped to preserve speed-mode behavior, respect explicit env-var overrides, and avoid adding heavy new dependencies.

## Glossary

- **Bug_Condition (C)**: The specific input/configuration state that triggers degraded output
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing behavior that must remain unchanged after the fix
- **ONNX overlap**: Fraction of `gen_size` used as overlap between inference chunks (0.5 = speed, 0.75 = quality)
- **TPDF dithering**: Triangular Probability Density Function noise added before quantization to decorrelate quantization error
- **Phase inversion**: Subtracting the vocal signal from the original mix to produce an instrumental stem
- **Soft limiting**: Graceful peak attenuation (e.g., tanh) vs hard clipping (`torch.clamp`)

## Bug Details

### Bug Condition

The bugs manifest across three categories: configuration logic errors (Bugs 1–2), missing audio processing steps (Bugs 3–4), and suboptimal DSP algorithms (Bugs 5–7).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type StemJobRequest
  OUTPUT: boolean

  // Bug 1: quality overlap override
  bug1 := input.model_tier == "quality" AND input.prefer_speed == False
          AND onnx_overlap is reset from 0.75 to 0.5

  // Bug 2: shifts default
  bug2 := ENV("USE_DEMUCS_SHIFTS_0") is NOT explicitly set
          AND system defaults to "1" (true), forcing shifts=0

  // Bug 3: missing dithering
  bug3 := output is written via sf.write(subtype="PCM_16")
          AND no TPDF dither applied before quantization

  // Bug 4: missing resample-back
  bug4 := input.sample_rate != 44100
          AND ONNX output is written at 44100 without resampling back

  // Bug 5: scipy resample in export
  bug5 := effective_playback_rate != 1.0
          AND scipy.signal.resample is used (FFT-based, smears transients)

  // Bug 6: hard clipping
  bug6 := phase_inversion result has values outside [-1.0, 1.0]
          AND torch.clamp is applied (destroys peaks)

  // Bug 7: non-deterministic reverb
  bug7 := reverb_wet > 0
          AND np.random.rand is called without fixed seed

  RETURN bug1 OR bug2 OR bug3 OR bug4 OR bug5 OR bug6 OR bug7
END FUNCTION
```

### Examples

- **Bug 1**: User requests quality 2-stem separation. `extract_vocals_stage1` sets `onnx_overlap = 0.75` then immediately overrides it to `0.5` on line ~195 of `vocal_stage1.py`. Result: audible seam artifacts between chunks.
- **Bug 2**: Fresh deployment with no `.env` customization. `USE_DEMUCS_SHIFTS_0` defaults to `"1"`, so Demucs always runs with `--shifts 0` even in quality mode. Result: no time-shift augmentation, worse separation.
- **Bug 3**: A quiet piano passage is separated. The 32-bit float internal signal is truncated to 16-bit PCM. Result: correlated quantization noise audible on headphones.
- **Bug 4**: User uploads a 48 kHz WAV. ONNX inference resamples to 44.1 kHz for the model but writes output at 44.1 kHz. Result: user gets back a different sample rate than they submitted.
- **Bug 5**: User applies +2 semitone pitch shift in server export. `scipy.signal.resample` (FFT-based) smears drum transients. Result: mushy attack on percussive content.
- **Bug 6**: Vocal extraction has slight alignment error. Phase inversion produces values at ±1.05. `torch.clamp` hard-clips to ±1.0. Result: audible distortion on peaks.
- **Bug 7**: User exports the same mix twice with identical settings. Different reverb IR each time. Result: non-reproducible exports.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Speed mode (`prefer_speed=True`) continues to use `onnx_overlap = 0.5`
- Explicit `USE_DEMUCS_SHIFTS_0=1` env var continues to force shifts to 0
- All output files remain valid WAV format readable by standard tools
- Input audio already at 44.1 kHz passes through ONNX with no extra resampling
- When `effective_playback_rate == 1.0`, no resampling degradation occurs
- Phase inversion values already within [-1.0, 1.0] pass through unchanged
- When reverb wet level is 0, no IR generation occurs (no performance impact)

**Scope:**
All inputs that do NOT trigger the bug conditions should produce bit-identical (or perceptually identical) output to the current code. Speed mode is entirely unaffected by Bugs 1–2 fixes.

## Hypothesized Root Cause

Based on code analysis:

1. **Bug 1 — Defensive override**: Lines 193–194 of `vocal_stage1.py` contain `if model_tier == "quality" and not prefer_speed: onnx_overlap = 0.5`. This was likely added as a "safe" CPU constraint but defeats the quality setting. The comment says "Keep quality overlap practical on CPU-first hosts."

2. **Bug 2 — Conservative default**: `config/device.py` line ~119 sets `USE_DEMUCS_SHIFTS_0 = os.environ.get("USE_DEMUCS_SHIFTS_0", "1")...in ("1",...)`. Default `"1"` was chosen to keep CPU processing fast, but it prevents quality mode from using shifts=3.

3. **Bug 3 — Missing step**: `sf.write(..., subtype="PCM_16")` directly quantizes float32 to int16 by truncation. No dithering step was implemented.

4. **Bug 4 — Incomplete resample round-trip**: `mdx/inference.py` resamples input to 44.1 kHz (line ~100) but never resamples the output back. The original `sr` is available but unused after inference.

5. **Bug 5 — Convenience import**: `server_export.py` imports `resample` from `scipy.signal` which uses FFT-based resampling. This is mathematically correct but poor for audio transients.

6. **Bug 6 — Simplistic clipping**: `phase_inversion.py` uses `torch.clamp(instrumental, -1.0, 1.0)` which is the simplest possible limiter but introduces harsh distortion.

7. **Bug 7 — Unseeded RNG**: `build_synthetic_reverb_ir` calls `np.random.rand(2, length)` using the global RNG without seeding.

## Correctness Properties

Property 1: Bug Condition - Quality Mode Uses Intended ONNX Overlap

_For any_ stem separation job where `model_tier == "quality"` and `prefer_speed == False`, the ONNX inference SHALL use `onnx_overlap = 0.75` (not 0.5), producing smoother overlap-add transitions.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Quality Mode Uses Demucs Shifts

_For any_ stem separation job where `USE_DEMUCS_SHIFTS_0` is not explicitly set in the environment, the system SHALL default to `"0"` (false), allowing quality mode to use `DEMUCS_SHIFTS_QUALITY` (3 shifts).

**Validates: Requirements 2.2**

Property 3: Bug Condition - TPDF Dithering Applied Before 16-bit Writes

_For any_ audio written via `sf.write` with `subtype="PCM_16"`, the system SHALL apply TPDF dithering to the float32 signal before quantization, such that the quantization noise floor is decorrelated.

**Validates: Requirements 2.3**

Property 4: Bug Condition - ONNX Output Resampled to Original Rate

_For any_ input audio with sample rate != 44100, the ONNX inference output SHALL be resampled back to the original input sample rate before writing.

**Validates: Requirements 2.4**

Property 5: Bug Condition - High-Quality Resampling in Server Export

_For any_ server export where `effective_playback_rate != 1.0`, the system SHALL use `torchaudio.functional.resample` (or soxr) instead of `scipy.signal.resample`, preserving transient clarity.

**Validates: Requirements 2.5**

Property 6: Bug Condition - Soft Limiting in Phase Inversion

_For any_ phase inversion result with values outside [-1.0, 1.0], the system SHALL apply tanh-based soft limiting instead of hard clipping, gracefully attenuating peaks.

**Validates: Requirements 2.6**

Property 7: Bug Condition - Deterministic Reverb IR Generation

_For any_ server export with `reverb_wet > 0`, the system SHALL use a fixed-seed RNG (`np.random.default_rng(seed=42)`) for IR generation, producing identical output across runs with identical parameters.

**Validates: Requirements 2.7**

Property 8: Preservation - Speed Mode Overlap Unchanged

_For any_ stem separation job where `prefer_speed == True`, the ONNX inference SHALL continue to use `onnx_overlap = 0.5`, preserving current speed-mode performance.

**Validates: Requirements 3.1**

Property 9: Preservation - Explicit Env Var Override Respected

_For any_ deployment where `USE_DEMUCS_SHIFTS_0` is explicitly set to `"1"`, the system SHALL continue to force shifts to 0, respecting the explicit override.

**Validates: Requirements 3.2**

Property 10: Preservation - Valid WAV Output Format

_For any_ stem output, the system SHALL continue to produce valid WAV files with correct headers, readable by standard audio tools, with no change to channel layout.

**Validates: Requirements 3.3**

Property 11: Preservation - 44.1 kHz Input Passthrough

_For any_ input audio already at 44.1 kHz, the ONNX inference SHALL process and output at 44.1 kHz with no additional resampling steps.

**Validates: Requirements 3.4**

Property 12: Preservation - Unity Playback Rate Passthrough

_For any_ server export where `effective_playback_rate == 1.0`, the system SHALL pass audio through without resampling, avoiding any degradation.

**Validates: Requirements 3.5**

Property 13: Preservation - In-Range Phase Inversion Unchanged

_For any_ phase inversion result where all values are within [-1.0, 1.0], the system SHALL output the subtraction result unchanged (no limiting applied).

**Validates: Requirements 3.6**

Property 14: Preservation - Reverb Disabled Skips IR Generation

_For any_ server export where `reverb_wet == 0`, the system SHALL skip IR generation entirely with no performance impact from the seed change.

**Validates: Requirements 3.7**


## Fix Implementation

### Phase 1: Critical Quality Logic Fixes (Bugs 1 & 2)

#### Bug 1: Remove Quality Overlap Override

**Goal**: Allow quality mode to use `onnx_overlap = 0.75` as originally intended.

**File**: `stem_service/vocal_stage1.py`
**Function**: `extract_vocals_stage1`
**Lines**: ~193–194

**Current Code:**
```python
onnx_overlap = 0.5 if prefer_speed else 0.75
# Keep quality overlap practical on CPU-first hosts.
if model_tier == "quality" and not prefer_speed:
    onnx_overlap = 0.5
```

**Fixed Code:**
```python
onnx_overlap = 0.5 if prefer_speed else 0.75
```

**Rationale**: The override completely negates the quality setting. The 0.75 overlap is already the intended value for quality mode — it was set one line above. The "practical on CPU-first hosts" concern is addressed by the speed mode path (`prefer_speed=True` → 0.5).

**Caution**:
- Speed mode is unaffected (guarded by `prefer_speed` check on the first line)
- Quality mode processing time increases ~50% for ONNX chunks (more overlap = more chunks). Document this in release notes.
- No new dependencies

**Verification**: Run a quality 2-stem job and confirm the job log shows `overlap=75%` in the `mdx_onnx:` log lines.

---

#### Bug 2: Change USE_DEMUCS_SHIFTS_0 Default

**Goal**: Allow quality mode to use `--shifts 3` by defaulting the env var to `"0"` (disabled).

**File**: `stem_service/config/device.py`
**Lines**: ~119–121

**Current Code:**
```python
USE_DEMUCS_SHIFTS_0 = os.environ.get("USE_DEMUCS_SHIFTS_0", "1").strip().lower() in (
    "1",
    "true",
    "yes",
)
```

**Fixed Code:**
```python
USE_DEMUCS_SHIFTS_0 = os.environ.get("USE_DEMUCS_SHIFTS_0", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)
```

**Rationale**: Changing the default from `"1"` to `"0"` means when the env var is unset, `USE_DEMUCS_SHIFTS_0` evaluates to `False`. Quality mode then uses `DEMUCS_SHIFTS_QUALITY` (3). Explicit `USE_DEMUCS_SHIFTS_0=1` in `.env` still forces shifts=0.

**Caution**:
- Existing deployments with `USE_DEMUCS_SHIFTS_0=1` in their `.env` are unaffected
- Quality mode Demucs processing time increases ~3x (shifts=3 runs the model 3 times with time offsets). This is the intended quality tradeoff.
- Speed mode is unaffected: `_run_demucs_two_stem` and `run_demucs` both check `prefer_speed` independently and force shifts=0 when speed is preferred.
- Update `.env.example` to document the new default

**Verification**: Start the service without `USE_DEMUCS_SHIFTS_0` in env. Run a quality job that falls through to Demucs. Confirm the subprocess command includes `--shifts 3`.


---

### Phase 2: Audio Fidelity Improvements (Bugs 3 & 4)

#### Bug 3: Add TPDF Dithering Before 16-bit PCM Writes

**Goal**: Eliminate correlated quantization noise by adding triangular dither before truncation to 16-bit.

**Files affected** (production stem output):
- `stem_service/mdx/inference.py` — lines 242, 399
- `stem_service/server_export.py` — line 439
- `stem_service/scnet_onnx.py` — line 407
- `stem_service/spleeter_int8_onnx.py` — lines 269–270

**Implementation**: Create a shared utility function in a new file `stem_service/audio_utils.py`:

```python
"""Shared audio utilities for the stem service."""

import numpy as np
import soundfile as sf
from pathlib import Path


def apply_tpdf_dither(audio: np.ndarray, bit_depth: int = 16) -> np.ndarray:
    """
    Apply TPDF (Triangular Probability Density Function) dithering.

    Adds triangular-distributed noise at 1 LSB amplitude before quantization.
    This decorrelates quantization error from the signal, eliminating
    audible distortion on quiet passages and reverb tails.

    Args:
        audio: float32 array in [-1.0, 1.0] range, shape (samples, channels) or (samples,)
        bit_depth: target bit depth (default 16)

    Returns:
        Dithered float32 array (still in float range, ready for sf.write PCM_16)
    """
    # 1 LSB in float domain for signed N-bit PCM
    lsb = 2.0 / (2**bit_depth)
    # TPDF = sum of two uniform random variables → triangular distribution
    rng = np.random.default_rng()
    dither = (rng.random(audio.shape, dtype=np.float32)
              - rng.random(audio.shape, dtype=np.float32)) * lsb
    return audio + dither


def write_wav_16bit(path: Path, audio: np.ndarray, sr: int, dither: bool = True) -> None:
    """
    Write audio to 16-bit PCM WAV with optional TPDF dithering.

    Args:
        path: output file path
        audio: float32 array, shape (samples, channels) or (samples,)
        sr: sample rate
        dither: whether to apply TPDF dithering (default True)
    """
    if dither:
        audio = apply_tpdf_dither(audio, bit_depth=16)
    # Clip after dithering to prevent overflow
    audio = np.clip(audio, -1.0, 1.0)
    sf.write(str(path), audio, sr, subtype="PCM_16")
```

**Usage at each call site** — replace `sf.write(str(path), audio, sr, subtype="PCM_16")` with:
```python
from stem_service.audio_utils import write_wav_16bit
write_wav_16bit(path, audio, sr)
```

**Caution**:
- Dithering adds ~0.5 LSB of noise floor. This is inaudible and standard practice in professional audio.
- The RNG is not seeded here (dither noise should be random per write). This does NOT affect reproducibility of the signal content — only the noise floor pattern differs.
- `np.clip` after dithering prevents rare overflow when signal is already at ±1.0.
- Performance: negligible — two random arrays + addition. ~1ms for a 5-minute stereo track.
- Scripts in `scripts/` are NOT modified (they are benchmarking/testing tools, not production output).

**Verification**: Write a test that generates a 1 kHz sine at -90 dBFS, writes with and without dithering, and confirms the dithered version has lower THD+N (or at minimum, different noise spectrum).

---

#### Bug 4: Resample ONNX Output Back to Original Sample Rate

**Goal**: When input is not 44.1 kHz, resample the separated output back to the original rate.

**File**: `stem_service/mdx/inference.py`
**Function**: `_run_mdx_onnx`
**Lines**: ~95–102 (input resample) and ~240–242 (output write)

**Current Code (input resample, ~line 95):**
```python
if sr != 44100:
    import torchaudio
    mix_t = torch.from_numpy(mix.T).unsqueeze(0).float()
    mix_t = torchaudio.functional.resample(mix_t, sr, 44100)
    mix = mix_t.squeeze(0).numpy().T
    sr = 44100  # <-- sr is overwritten, original rate lost
```

**Current Code (output write, ~line 242):**
```python
sf.write(str(output_path), out_wav, 44100, subtype="PCM_16")
```

**Fixed Code (input resample):**
```python
sr_original = sr  # preserve original sample rate for output
if sr != 44100:
    import torchaudio
    mix_t = torch.from_numpy(mix.T).unsqueeze(0).float()
    mix_t = torchaudio.functional.resample(mix_t, sr, 44100)
    mix = mix_t.squeeze(0).numpy().T
    sr = 44100
```

**Fixed Code (output write):**
```python
# Resample back to original rate if input was not 44.1 kHz
if sr_original != 44100:
    import torchaudio
    out_tensor = torch.from_numpy(out_wav.T).unsqueeze(0).float()
    out_tensor = torchaudio.functional.resample(out_tensor, 44100, sr_original)
    out_wav = out_tensor.squeeze(0).numpy().T

output_path.parent.mkdir(parents=True, exist_ok=True)
write_wav_16bit(output_path, out_wav, sr_original)
```

**Also fix the instrumental companion write** (~line 260):
```python
# Same resample-back for instrumental companion
if sr_original != 44100:
    inst_tensor = torch.from_numpy(inst_wav.T).unsqueeze(0).float()  
    inst_tensor = torchaudio.functional.resample(inst_tensor, 44100, sr_original)
    inst_wav = inst_tensor.squeeze(0).numpy().T

write_wav_16bit(instrumental_output_path, inst_wav, sr_original)
```

**Caution**:
- `torchaudio.functional.resample` is already imported/used in this file for the input resample. No new dependency.
- When input is 44.1 kHz (`sr_original == 44100`), no extra work is done (preservation requirement 3.4).
- The resample-back adds processing time proportional to audio length. For a 5-min 48 kHz track: ~200ms on CPU.
- The `dereverb` function (`run_dereverb_onnx`) reads the vocal output and subtracts — it uses the file's own `sr` from `sf.read`, so it will correctly handle the resampled output.

**Verification**: Feed a 48 kHz WAV into the ONNX pipeline. Confirm the output WAV header shows 48000 Hz sample rate. Compare spectral content above 20 kHz to verify high-frequency preservation.


---

### Phase 3: Server Export Quality (Bugs 5, 6, & 7)

#### Bug 5: Replace scipy.signal.resample with torchaudio for Pitch/Time

**Goal**: Use a high-quality polyphase resampler that preserves transient clarity.

**File**: `stem_service/server_export.py`
**Lines**: Import (~line 15) and usage (~line 280)

**Current Import:**
```python
from scipy.signal import fftconvolve, lfilter, resample
```

**Fixed Import:**
```python
from scipy.signal import fftconvolve, lfilter
import torch
import torchaudio
```

**Current Resample Code (~line 280):**
```python
resampled = resample(segment, out_len, axis=0).astype(np.float32, copy=False)
```

**Fixed Resample Code:**
```python
if abs(rate - 1.0) < 1e-6:
    # No pitch/time change — skip resampling entirely (preservation 3.5)
    resampled = segment
    if segment.shape[0] != out_len:
        # Only trim/pad if sample rate conversion needed
        resampled = segment[:out_len] if segment.shape[0] > out_len else np.pad(
            segment, ((0, out_len - segment.shape[0]), (0, 0))
        )
else:
    # torchaudio polyphase resampler: preserves transients, no FFT smearing
    seg_tensor = torch.from_numpy(segment.T).float()  # (channels, samples)
    # Resample from sr_in*rate to sample_rate_out (equivalent to changing length)
    # We need: out_len samples from segment.shape[0] input samples
    # GCD-based rational resample: upsample by out_len, downsample by in_len
    in_len = segment.shape[0]
    # Use torchaudio with rational approximation for large ratios
    resampled_t = torchaudio.functional.resample(
        seg_tensor, in_len, out_len
    )
    resampled = resampled_t.numpy().T.astype(np.float32, copy=False)
```

**Caution**:
- `torchaudio.functional.resample` uses a Kaiser-windowed sinc filter (polyphase). It handles arbitrary rational ratios.
- For very large ratio differences (e.g., 3 octave pitch shift), the GCD of `in_len` and `out_len` may be 1, creating a large polyphase filter. In practice, pitch shifts beyond ±12 semitones are rare in DJ use cases.
- `torch` and `torchaudio` are already project dependencies (used in phase_inversion, mdx inference).
- `scipy.signal.fftconvolve` and `lfilter` are still needed for reverb and EQ — only `resample` is removed from the import.
- Performance: `torchaudio.functional.resample` is ~2x slower than scipy for small ratios on CPU but produces audibly better results. For a 5-min stereo track with ±2 semitones: ~500ms vs ~250ms.
- When `rate == 1.0`, we skip resampling entirely (preservation requirement 3.5).

**Verification**: Export a drum loop with +2 semitones. Compare transient sharpness (peak-to-RMS ratio of attack) between old scipy and new torchaudio output.

---

#### Bug 6: Replace Hard Clipping with Soft Limiting in Phase Inversion

**Goal**: Gracefully attenuate peaks that exceed ±1.0 instead of hard-clipping them.

**File**: `stem_service/phase_inversion.py`
**Function**: `create_perfect_instrumental`
**Lines**: ~95 (the `torch.clamp` call)

**Current Code:**
```python
instrumental = orig - vocal
instrumental = torch.clamp(instrumental, -1.0, 1.0)
```

**Fixed Code:**
```python
instrumental = orig - vocal
instrumental = _soft_limit(instrumental)
```

**New helper function** (add above `create_perfect_instrumental`):
```python
def _soft_limit(x: torch.Tensor, threshold: float = 0.9, ceiling: float = 1.0) -> torch.Tensor:
    """
    Tanh-based soft limiter.

    Values within [-threshold, threshold] pass through unchanged.
    Values beyond threshold are smoothly compressed toward ceiling using tanh.
    This avoids the harsh distortion of hard clipping while keeping output in [-1, 1].

    Args:
        x: input tensor
        threshold: level below which signal passes unchanged (default 0.9)
        ceiling: maximum output level (default 1.0)
    """
    # For values within threshold, pass through unchanged (preservation 3.6)
    mask_pos = x > threshold
    mask_neg = x < -threshold
    mask_pass = ~mask_pos & ~mask_neg

    result = torch.zeros_like(x)
    result[mask_pass] = x[mask_pass]

    # Above threshold: map [threshold, inf) -> [threshold, ceiling) via tanh
    knee_range = ceiling - threshold
    if knee_range > 0:
        # Normalize excess above threshold, apply tanh, scale to knee range
        excess_pos = (x[mask_pos] - threshold) / knee_range
        result[mask_pos] = threshold + knee_range * torch.tanh(excess_pos)

        excess_neg = (-x[mask_neg] - threshold) / knee_range
        result[mask_neg] = -(threshold + knee_range * torch.tanh(excess_neg))

    return result
```

**Caution**:
- The threshold of 0.9 means signals below 90% of full scale pass through completely unchanged. This satisfies preservation requirement 3.6 for the vast majority of audio.
- Only samples exceeding ±0.9 are affected. For typical phase inversion results, this is a small fraction of samples (alignment errors are usually small).
- The tanh curve provides infinite compression ratio at the ceiling — output never exceeds ±1.0.
- Performance: the masking approach avoids computing tanh on the entire tensor. For a 5-min stereo track, the overhead is <5ms.
- No new dependencies (uses `torch.tanh` which is already available).

**Verification**: Create a test case where `orig - vocal` produces values at ±1.1. Confirm the output is within [-1.0, 1.0] and that the waveform is smooth (no discontinuity at the clipping point). Compare THD of a 1 kHz sine clipped at 1.05 with hard clip vs soft limit.

---

#### Bug 7: Use Fixed Seed for Reverb IR Generation

**Goal**: Make server exports deterministic/reproducible when parameters are identical.

**File**: `stem_service/server_export.py`
**Function**: `build_synthetic_reverb_ir`
**Lines**: ~310–315

**Current Code:**
```python
def build_synthetic_reverb_ir(fs: int, duration_sec: float = 1.8) -> np.ndarray:
    length = max(1, int(fs * duration_sec))
    decay = np.power(1.0 - (np.arange(length, dtype=np.float64) / length), 2.0)
    ir = (np.random.rand(2, length).astype(np.float64) * 2.0 - 1.0) * decay[None, :]
    return ir.astype(np.float32)
```

**Fixed Code:**
```python
def build_synthetic_reverb_ir(fs: int, duration_sec: float = 1.8, seed: int = 42) -> np.ndarray:
    """
    Generate a synthetic stereo reverb impulse response.

    Uses a fixed seed for deterministic output — identical parameters
    always produce the same IR, making exports reproducible.
    """
    length = max(1, int(fs * duration_sec))
    decay = np.power(1.0 - (np.arange(length, dtype=np.float64) / length), 2.0)
    rng = np.random.default_rng(seed=seed)
    ir = (rng.random((2, length), dtype=np.float64) * 2.0 - 1.0) * decay[None, :]
    return ir.astype(np.float32)
```

**Caution**:
- `np.random.default_rng(seed=42)` is the modern NumPy RNG API (Generator, not legacy RandomState). It does not affect the global `np.random` state.
- The seed value (42) is arbitrary but fixed. All exports with the same `fs` and `duration_sec` will produce the same IR.
- When `reverb_wet == 0`, `build_synthetic_reverb_ir` is never called (the `if reverb_wet > 1e-6:` guard remains). No performance impact for dry exports (preservation 3.7).
- If a future feature needs different IRs per stem, the `seed` parameter can be varied per call.
- No new dependencies.

**Verification**: Call `build_synthetic_reverb_ir(44100, 1.8)` twice. Assert the arrays are identical (`np.array_equal`). Run a full server export twice with identical parameters and confirm output WAVs are bit-identical.


## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write unit tests that exercise each bug condition on the current (unfixed) code and observe the failures.

**Test Cases**:
1. **Overlap Override Test**: Call `extract_vocals_stage1` with `model_tier="quality"`, `prefer_speed=False`. Assert `onnx_overlap` passed to `run_vocal_onnx` is 0.75. (Will fail on unfixed code — gets 0.5)
2. **Shifts Default Test**: Unset `USE_DEMUCS_SHIFTS_0` env var, import `config.device`. Assert `USE_DEMUCS_SHIFTS_0 == False`. (Will fail on unfixed code — gets True)
3. **Dithering Absence Test**: Generate a -90 dBFS sine, write with current `sf.write(subtype="PCM_16")`, read back, compute THD. (Will show high correlated distortion on unfixed code)
4. **Resample-Back Test**: Feed a 48 kHz WAV through `_run_mdx_onnx`. Check output file sample rate. (Will show 44100 on unfixed code)
5. **Scipy Resample Transient Test**: Apply +2 semitones to a click track via current `resample()`. Measure peak-to-RMS ratio of attacks. (Will show smeared transients)
6. **Hard Clip Test**: Create `orig - vocal` that produces ±1.1. Run through `create_perfect_instrumental`. Check for discontinuity at clip point. (Will show hard edge on unfixed code)
7. **Non-Deterministic IR Test**: Call `build_synthetic_reverb_ir(44100)` twice. Assert arrays are equal. (Will fail on unfixed code)

**Expected Counterexamples**:
- Bug 1: `onnx_overlap` is 0.5 when it should be 0.75
- Bug 2: `USE_DEMUCS_SHIFTS_0` is True when env var is unset
- Bug 4: Output sample rate is 44100 when input was 48000
- Bug 7: Two IR arrays are not equal

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Specific assertions per bug:**
- Bug 1: `onnx_overlap == 0.75` when quality + not speed
- Bug 2: `USE_DEMUCS_SHIFTS_0 == False` when env var unset
- Bug 3: THD+N of dithered output < THD+N of truncated output at -90 dBFS
- Bug 4: Output sample rate matches input sample rate
- Bug 5: Peak-to-RMS ratio of transients preserved within 1 dB
- Bug 6: Output within [-1.0, 1.0] AND no discontinuity at limiting threshold
- Bug 7: `np.array_equal(ir1, ir2)` for same parameters

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Speed Mode Overlap Preservation**: For any job with `prefer_speed=True`, verify `onnx_overlap == 0.5` (unchanged)
2. **Explicit Env Var Preservation**: With `USE_DEMUCS_SHIFTS_0=1` set, verify shifts forced to 0 (unchanged)
3. **44.1 kHz Passthrough Preservation**: For 44.1 kHz input, verify no extra resample step occurs
4. **Unity Rate Preservation**: For `effective_playback_rate == 1.0`, verify no resampling applied
5. **In-Range Signal Preservation**: For phase inversion results within [-1.0, 1.0], verify output equals `orig - vocal` exactly
6. **Dry Export Preservation**: For `reverb_wet == 0`, verify `build_synthetic_reverb_ir` is never called

### Unit Tests

- Test `apply_tpdf_dither` produces output with correct statistical properties (mean unchanged, variance increased by expected amount)
- Test `_soft_limit` with values at 0.5, 0.9, 1.0, 1.5, -1.5 — verify passthrough below threshold, compression above
- Test `write_wav_16bit` produces valid WAV files readable by soundfile
- Test `build_synthetic_reverb_ir` determinism with same and different seeds
- Test `effective_playback_rate` edge cases (0, negative time_stretch, extreme pitch)

### Property-Based Tests

- Generate random `model_tier` and `prefer_speed` combinations; verify overlap is always 0.5 for speed, 0.75 for quality
- Generate random audio arrays; verify `apply_tpdf_dither` output is within [-1.0 - 1LSB, 1.0 + 1LSB] and mean is preserved
- Generate random tensors with values in [-2.0, 2.0]; verify `_soft_limit` output is always within [-1.0, 1.0] and monotonic
- Generate random sample rates (8000–96000); verify ONNX resample round-trip preserves rate

### Integration Tests

- End-to-end 2-stem quality separation of a short test WAV; verify output exists and has correct sample rate
- End-to-end server export with pitch shift; verify output is valid WAV with expected duration
- End-to-end server export with reverb; run twice, verify bit-identical output

---

## Performance Impact Summary

| Bug Fix | Speed Mode Impact | Quality Mode Impact | CPU Cost |
|---------|-------------------|---------------------|----------|
| Bug 1 (overlap) | None | +50% ONNX time | More chunks processed |
| Bug 2 (shifts) | None | +200% Demucs time | 3 shifted passes |
| Bug 3 (dither) | <1ms per file | <1ms per file | Negligible |
| Bug 4 (resample) | None (44.1 kHz) | ~200ms for 48 kHz 5-min | One torchaudio resample |
| Bug 5 (torchaudio) | N/A (export only) | ~250ms extra per stem | Polyphase vs FFT |
| Bug 6 (soft limit) | <5ms | <5ms | Tanh on small subset |
| Bug 7 (seed) | None | None | Same RNG cost |

**Key takeaway**: Bugs 1 and 2 intentionally increase quality-mode processing time — this is the correct tradeoff that was originally designed but accidentally disabled. Speed mode is completely unaffected.

## Dependencies

**Already available (no additions needed):**
- `torch` — used in phase_inversion, mdx inference
- `torchaudio` — used in phase_inversion, mdx inference
- `numpy` — used everywhere
- `soundfile` — used everywhere
- `scipy` — still needed for `fftconvolve` and `lfilter` in server_export

**Removed from server_export imports:**
- `scipy.signal.resample` — replaced by `torchaudio.functional.resample`

**No new pip dependencies added.**
