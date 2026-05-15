# Bugfix Requirements Document

## Introduction

The stem_service audio separation pipeline contains seven logic and configuration errors that silently degrade the quality of output audio stems. None of these bugs cause crashes — they all produce output, but the output is measurably worse than it should be. The bugs affect ONNX overlap settings, Demucs shift augmentation, bit-depth quantization, sample rate handling, resampling quality, phase inversion clipping, and reverb reproducibility.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `model_tier == "quality"` and `prefer_speed == False` THEN the system overrides `onnx_overlap` from 0.75 back to 0.5 in `vocal_stage1.py`, defeating the quality setting and producing audible seam artifacts between inference chunks

1.2 WHEN `USE_DEMUCS_SHIFTS_0` environment variable is not explicitly set THEN the system defaults it to `"1"` (true), forcing Demucs `--shifts 0` regardless of quality mode, eliminating the time-shift augmentation that reduces separation artifacts

1.3 WHEN the pipeline writes stem output via `sf.write()` with `subtype="PCM_16"` THEN the system truncates 32-bit float internal processing to 16-bit PCM without applying dithering, introducing quantization noise audible on quiet passages and reverb tails

1.4 WHEN input audio has a sample rate of 48 kHz THEN the ONNX inference in `mdx/inference.py` resamples it down to 44.1 kHz for model processing but does not resample the output back to the original rate, losing the user's expected format and high-frequency fidelity

1.5 WHEN `server_export.py` applies pitch/time changes via `effective_playback_rate` THEN the system uses `scipy.signal.resample` (FFT-based) which smears transients and degrades audio quality for non-trivial pitch/time adjustments

1.6 WHEN phase inversion in `phase_inversion.py` produces values outside [-1.0, 1.0] THEN the system applies hard clipping via `torch.clamp` without soft limiting, destroying peaks when there is any alignment error between original and vocal

1.7 WHEN `server_export.py` generates a synthetic reverb impulse response THEN the system uses `np.random.rand` without a fixed seed, making exports non-reproducible across runs with identical parameters

### Expected Behavior (Correct)

2.1 WHEN `model_tier == "quality"` and `prefer_speed == False` THEN the system SHALL use `onnx_overlap = 0.75` for smoother overlap-add transitions and reduced seam artifacts between inference chunks

2.2 WHEN `USE_DEMUCS_SHIFTS_0` environment variable is not explicitly set THEN the system SHALL default it to `"0"` (false), allowing quality mode to use `DEMUCS_SHIFTS_QUALITY` (3 shifts) for improved separation quality via time-shift augmentation

2.3 WHEN the pipeline writes stem output via `sf.write()` THEN the system SHALL apply TPDF dithering before 16-bit quantization to eliminate correlated quantization noise, preserving detail in quiet passages and reverb tails

2.4 WHEN input audio has a sample rate higher than 44.1 kHz THEN the ONNX inference SHALL resample the output back to the original input sample rate after model processing, preserving the user's expected format

2.5 WHEN `server_export.py` applies pitch/time changes THEN the system SHALL use a high-quality resampling method (e.g., `torchaudio.functional.resample` or `soxr`) that preserves transient clarity instead of FFT-based `scipy.signal.resample`

2.6 WHEN phase inversion produces values outside [-1.0, 1.0] THEN the system SHALL apply soft limiting (e.g., tanh-based or lookahead limiter) to gracefully attenuate peaks instead of hard clipping

2.7 WHEN `server_export.py` generates a synthetic reverb impulse response THEN the system SHALL use a fixed seed (e.g., `np.random.default_rng(seed=42)`) to ensure deterministic, reproducible exports

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `prefer_speed == True` THEN the system SHALL CONTINUE TO use `onnx_overlap = 0.5` for faster processing in speed mode

3.2 WHEN `USE_DEMUCS_SHIFTS_0` is explicitly set to `"1"` via environment variable THEN the system SHALL CONTINUE TO force shifts to 0, respecting the explicit override

3.3 WHEN stems are written as WAV files THEN the system SHALL CONTINUE TO produce valid WAV files readable by standard audio tools, with no change to file format or channel layout

3.4 WHEN input audio is already at 44.1 kHz THEN the ONNX inference SHALL CONTINUE TO process and output at 44.1 kHz with no additional resampling steps

3.5 WHEN `effective_playback_rate` is 1.0 (no pitch/time change) THEN the system SHALL CONTINUE TO pass audio through without resampling degradation

3.6 WHEN phase inversion produces values within [-1.0, 1.0] THEN the system SHALL CONTINUE TO output the subtraction result unchanged (no limiting applied to signals already in range)

3.7 WHEN reverb wet level is 0 (reverb disabled) THEN the system SHALL CONTINUE TO skip reverb IR generation entirely, with no performance impact from the deterministic seed change
