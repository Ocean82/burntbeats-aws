# ============================================================
# STEM SPLITTER / MIXER / MASTERING WEB APP
# AGENT KNOWLEDGE PACK (DROP-IN CONTEXT)
# ============================================================

version: 1.0
goal:
  description: >
    Provide agent-ready knowledge for routing user intent to stem
    separation, remixing, mixing, and mastering workflows in a web app.
    Agents must select tasks → capabilities → pipelines while enforcing
    runtime constraints (web audio, compute, CORS) and mastering safety.

# ------------------------------------------------------------
# 1) WORKFLOW MODES (KEY ADDITION)
# ------------------------------------------------------------
workflow_modes:
  offline_processing:
    description: >
      Highest-quality batch processing. Suitable for long files and
      multi-pass refinement.
  real_time_processing:
    description: >
      Real-time remixing in the browser using Web Audio processing and
      time-frequency mask methods; requires careful CPU budgeting and
      artifact control. (Masking + thresholding + model gating)  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
  collaborative_session:
    description: >
      Multi-user synchronous collaboration mode. Requires governance
      (roles, permissions) to avoid destructive edits and confusion.  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)

# ------------------------------------------------------------
# 2) TASK TAXONOMY (ROUTER INPUT)
# ------------------------------------------------------------
tasks:
  - id: isolate_vocals
    description: Extract lead vocals cleanly
  - id: isolate_backing_vocals
    description: Separate backing vocals and harmonies
  - id: karaoke
    description: Remove lead vocals while preserving music
  - id: instrumental_fullness
    description: Preserve instruments with minimal thinning
  - id: instrumental_bleedless
    description: Minimize vocal residue in instrumental
  - id: multi_singer
    description: Separate multiple singers or vocal layers
  - id: harmonies
    description: Preserve or isolate harmonies accurately
  - id: speech
    description: Spoken-word/dialogue separation
  - id: dereverb
    description: Remove room or artificial reverb
  - id: denoise
    description: Remove broadband or model-induced noise
  - id: crowd_removal
    description: Remove audience or crowd noise
  - id: stem_expansion
    description: Go beyond 2 stems (drums, bass, other)

# ------------------------------------------------------------
# 3) CAPABILITY PROFILES (DECISION LAYER)
# ------------------------------------------------------------
capability_profiles:
  # Separation/remix capabilities
  high_vocal_fullness:
    excels_at: [harmonies, backing_vocals, dense_mixes]
    tradeoffs: [more_noise, possible_instrument_bleed]
  high_vocal_bleedless:
    excels_at: [clean_lead, speech]
    tradeoffs: [thinner_vocals, weaker_harmonies]
  instrumental_fullness:
    excels_at: [preserve_bass, preserve_transients, mastering]
    tradeoffs: [faint_vocal_residue]
  instrumental_bleedless:
    excels_at: [karaoke, vocal_removal]
    tradeoffs: [hollow_or_filtered_music]

  # KEY ADDITION: Generative mixing capability (one-to-many)
  generative_mixing:
    excels_at: [multiple_valid_mixes, style_diversity, human_like_choices]
    tradeoffs: [non_deterministic_output, harder_ab_testing]

# ------------------------------------------------------------
# 4) MIXING STYLE CONTROL (KEY ADDITION FOR MEGAMI-LIKE SYSTEMS)
# ------------------------------------------------------------
mixing_style:
  description: >
    Mixing can be one-to-many. Generative approaches model a distribution
    of valid mixes using effect embeddings rather than direct audio generation.  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
  control_modes:
    - deterministic: "single repeatable output"
    - random_sample: "generate multiple candidate mixes"
    - style_guided: "generate mixes guided by a target style profile"
    - reference_guided: "generate mixes guided by a reference mix/track embedding"

# ------------------------------------------------------------
# 5) RUNTIME CONSTRAINTS (KEY ADDITION FOR WEB APP)
# ------------------------------------------------------------
runtime_constraints:
  web_audio_processing:
    guidance: >
      For real-time processing, use AudioWorklet (modern) rather than
      ScriptProcessorNode (deprecated).  # [2](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode)[5](https://googlechromelabs.github.io/web-audio-samples/audio-worklet/)

  cors_policy:
    guidance: >
      Cross-origin audio processing depends on CORS permissions. Remote
      audio sources must provide appropriate CORS headers; otherwise
      in-browser processing may be blocked/limited.  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)[3](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

  cpu_budgeting:
    guidance: >
      Real-time remix pipelines should support deactivating models to
      save compute and reduce latency (mixture-of-experts gating).  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)

  inference_backends:
    options:
      - browser_wasm:
          description: "ONNX Runtime Web via WebAssembly execution provider"
          reference: "onnxruntime-web docs" # [4](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)[6](https://www.npmjs.com/package/onnxruntime-web)
      - browser_webgpu:
          description: "ONNX Runtime Web WebGPU import for accelerated inference"
          reference: "onnxruntime-web WebGPU import" # [4](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
      - server_gpu:
          description: "Server-side inference for heavy models / highest quality"
      - hybrid:
          description: "Preview in browser; final render on server"

# ------------------------------------------------------------
# 6) MASTERING SAFETY RULES (GUARDRAILS)
# ------------------------------------------------------------
mastering_rules:
  headroom_target:
    description: >
      Preserve headroom before mastering; collaborative mixing study
      used ~-6 dB headroom prior to mastering stage.  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
    recommended_peak_db: -6

  avoid_if_mastering:
    - aggressive_bleedless_models
    - hard_phase_swaps
    - extreme_denoise

  prefer_if_mastering:
    - instrumental_fullness
    - soft_phase_correction
    - minimal_processing

# ------------------------------------------------------------
# 7) AGENT ROLES (ORCHESTRATION)
# ------------------------------------------------------------
agent_roles:
  router_agent:
    responsibility:
      - detect user intent
      - select applicable tasks
      - choose workflow_mode

  splitter_agent:
    responsibility:
      - choose separation/remix capabilities
      - choose models/pipelines
      - enforce runtime constraints (real-time vs offline)

  cleanup_agent:
    responsibility:
      - denoise/dereverb/crowd cleanup
      - artifact reduction after separation

  mixing_agent:
    responsibility:
      - apply mix decisions (balance, EQ, dynamics, panorama, dimension)
      - optionally run generative_mixing in style modes # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)

  mastering_guard_agent:
    responsibility:
      - enforce mastering safety rules
      - preserve headroom and avoid destructive chains

  collaboration_guard_agent:
    responsibility:
      - manage permissions and edit conflicts in collaborative_session
      - enforce role hierarchy and prevent chaotic multi-user editing # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)

# ------------------------------------------------------------
# 8) PIPELINES (SMART BEHAVIOR)
# ------------------------------------------------------------
pipelines:
  # Real-time web remix pipeline (masking)
  realtime_remix_masking:
    workflow_mode: real_time_processing
    description: >
      Real-time remix using time-frequency mask estimates and user
      thresholds/gains. Small modifications reduce artifacts.  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
    steps:
      - task: stem_expansion
        method: time_frequency_masks
        mask_type: ratio_mask_preferred # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
      - task: remix
        controls:
          threshold_theta: user_slider
          per_source_gain: user_sliders
      - task: cpu_budgeting
        action: deactivate_unused_models

  karaoke_high_quality:
    workflow_mode: offline_processing
    description: High-quality karaoke instrumental (offline)
    steps:
      - task: isolate_vocals
        capability: high_vocal_fullness
      - task: instrumental_bleedless
        capability: instrumental_bleedless
      - task: denoise
        aggressiveness: minimal
      - task: phase_correction
        mode: soft
      - task: mastering_guard
        apply_headroom_db: -6

  mastering_safe_instrumental:
    workflow_mode: offline_processing
    description: Instrumental safe for mastering
    steps:
      - task: instrumental_fullness
        capability: instrumental_fullness
      - task: soft_phase_correction
      - task: minimal_denoise
      - task: mastering_guard
        apply_headroom_db: -6

  # KEY ADDITION: Generative mixing pipeline (MEGAMI-like)
  generative_auto_mix:
    workflow_mode: offline_processing
    capability: generative_mixing
    description: >
      Generate multiple valid mixes using effect-embedding sampling
      (one-to-many). Uses style control modes for repeatability.  # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
    steps:
      - task: mixing_style
        mode: random_sample
        samples: 3
      - task: mix_render
        method: effect_embedding_processor
      - task: mastering_guard
        apply_headroom_db: -6

# ------------------------------------------------------------
# 9) PRINCIPLES (AGENT BEHAVIOR)
# ------------------------------------------------------------
principles:
  - Choose by capability, not by model name
  - Prefer minimal processing by default; escalate only when required # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
  - Real-time remixing works best for small modifications; aggressive changes increase artifacts # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
  - In collaborative mode, enforce governance/roles to prevent confusion and rework # [1](https://onedrive.live.com?cid=A190C8D0C0881F11&id=A190C8D0C0881F11!s9345f7a94f7747269b4b263fbbe4f143)
  - Always provide an explanation of tradeoffs and pipeline choice

# ============================================================
# END OF AGENT KNOWLEDGE PACK
# ============================================================
