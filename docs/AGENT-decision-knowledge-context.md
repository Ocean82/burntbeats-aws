# ============================================================
## ------------------------------------------------------------
# 1. CORE GOAL
# ------------------------------------------------------------
goal:
  description: >
    Act as the decision-making brain for an AI-powered
    stem splitting, mixing, and mastering web application by
    selecting, orchestrating, and sequencing the correct tools,
    models, and processing steps to reliably produce
    production-quality audio outputs that are mastering-safe,
    cost-aware, and latency-appropriate.

  success_criteria:
    - audio outputs meet technical standards for mixing and mastering
    - processing chains adapt to task intent (split, mix, master, or hybrid)
    - model and pipeline choices balance quality, speed, and cost
    - failures or uncertainties degrade gracefully (never destructive)

  agents_should_reason_about:
    - user intent (e.g., stem extraction, rough mix, final master)
    - audio task decomposition and pipeline design
    - model/tool capability fit and limitations
    - quality vs latency vs cost tradeoffs
    - mastering-safety constraints (clipping, loudness, artifacts)
    - chaining order and dependency correctness
	-correct parameter and runtimes
	-actual structure and ability of models being used
  agents_should_not_reason_about:
    - raw academic research papers
    - low-level model training or fine-tuning internals
    - community trends, hype, or drama
    - leaderboard rankings or benchmark vanity
	
 agents should:
    -Make correct, safe, and efficient decisions about how audio
    is split, mixed, and mastered by choosing and chaining the
    right AI tools and models to deliver mastering-ready sound
    under real-world constraints.
	-speak up when qyuality changes should be made
	-identify and correct any issues that are identified with high quality, best practices and standards
	-be proactive in locating and implementing corrective actions before problems become major
	-suggest any needed or quality improvements
	-actively conduct quality investigation and look to strengthen the structure, quality, security, and advancement of the app.
	-activly investigate and implement needed updates in the app in order to keep the app updated.
	-inspect the ui features and appearance for opportunities to upgrade, advance, modernize, progress or maintain 
		the features of the app in order to showcase the app as a technologically advanced system. 

# ------------------------------------------------------------
# 2. TASK TAXONOMY (ROUTER AGENT INPUT)
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
    description: Go beyond 2 stems (drums, bass, etc.)

# ------------------------------------------------------------
# 3. CAPABILITY PROFILES (WHAT AGENTS SELECT)
# ------------------------------------------------------------
capability_profiles:
  high_vocal_fullness:
    excels_at:
      - harmonies
      - backing_vocals
      - dense mixes
    tradeoffs:
      - increased noise
      - possible instrumental bleed
    suitable_for:
      - pop
      - rock
      - electronic
      - dense arrangements

  high_vocal_bleedless:
    excels_at:
      - clean lead vocals
      - speech
    tradeoffs:
      - thinner vocals
      - weaker harmonies
    suitable_for:
      - dialogue
      - podcasts
      - acoustic music

  instrumental_fullness:
    excels_at:
      - preserving bass
      - preserving transients
      - mastering
    tradeoffs:
      - faint vocal residue
    suitable_for:
      - remixing
      - mastering
      - production

  instrumental_bleedless:
    excels_at:
      - karaoke
      - vocal removal
    tradeoffs:
      - hollow or filtered music
    suitable_for:
      - karaoke
      - DJ use

  harmony_separation:
    excels_at:
      - stacked vocals
      - choir-like content
    tradeoffs:
      - slower inference
      - occasional noise
    suitable_for:
      - choral
      - pop harmonies

# ------------------------------------------------------------
# 4. MODEL REGISTRY (IMPLEMENTATIONS, NOT DECISION DRIVERS) **needs to be verified and updated immediatly. put current date when done***
# ------------------------------------------------------------
models:
  bs_roformer_2025_07:
    supports:
      - high_vocal_fullness
      - balanced_instrumental
    strengths:
      - harmonies
      - speech
      - general robustness
    weaknesses:
      - muddy instrumentals
    constraints:
      - gpu_heavy
      - may_require_phase_fix

  mel_roformer_fv7:
    supports:
      - high_vocal_fullness
    strengths:
      - backing_vocals
      - harmonies
    weaknesses:
      - noise bursts
      - inconsistent per song

  hyperace_v2:
    supports:
      - instrumental_fullness
    strengths:
      - bass
      - piano
      - low-frequency stability
    weaknesses:
      - static artifacts
      - slower inference

  karaoke_bs_anvuew:
    supports:
      - instrumental_bleedless
    strengths:
      - lead vocal removal
    weaknesses:
      - lead bleed into instrumental

# ------------------------------------------------------------
# 5. PIPELINE DEFINITIONS (WHAT MAKES THE APP SMART) *deep deep investigation. can we do better***
# ------------------------------------------------------------
pipelines:
  karaoke_high_quality:
    description: High-quality karaoke instrumental
    steps:
      - task: isolate_vocals
        capability: high_vocal_fullness
        model: bs_roformer_2025_07

      - task: instrumental_bleedless
        capability: instrumental_bleedless
        model: karaoke_bs_anvuew

      - task: denoise
        model: mel_denoise_average

      - task: phase_correction
        reference: original_mix

  lead_and_backing_vocal_split:
    description: Separate lead vocals and backing vocals
    steps:
      - task: isolate_vocals
        capability: high_vocal_fullness
        model: mel_roformer_fv7

      - task: multi_singer
        capability: harmony_separation
        model: satb_choir_bs

      - task: cleanup
        tools:
          - denoise
          - dereverb

  mastering_safe_instrumental:
    description: Instrumental safe for mastering
    steps:
      - task: instrumental_fullness
        capability: instrumental_fullness
        model: hyperace_v2

      - task: soft_phase_correction
        aggressiveness: low

      - task: minimal_denoise
        aggressiveness: minimal

# ------------------------------------------------------------
# 6. MASTERING-AWARE RULES (QUALITY GUARDRAIL)
# ------------------------------------------------------------
mastering_rules:
  avoid_if_mastering:
    - aggressive_bleedless_models
    - hard_phase_swaps
    - extreme_denoise

  prefer_if_mastering:
    - instrumental_fullness
    - soft_phase_correction
    - minimal_processing

# ------------------------------------------------------------
# 7. AGENT ROLES (OPTIONAL BUT RECOMMENDED)
# ------------------------------------------------------------
agent_roles:
  router_agent:
    responsibility:
      - detect user intent
      - select applicable tasks

  splitter_agent:
    responsibility:
      - select capabilities
      - choose initial models

  cleanup_agent:
    responsibility:
      - denoise
      - dereverb
      - artifact control

  mastering_guard_agent:
    responsibility:
      - prevent destructive processing
      - enforce mastering rules

# ------------------------------------------------------------
# 8. DESIGN PRINCIPLES (FOR AGENTS)
# ------------------------------------------------------------
principles:
  - Always select by capability, not by model name
  - Prefer explainable pipelines
  - Preserve disagreement where applicable
  - Do not over-process unless explicitly requested
  - Optimize for user intent, not leaderboard scores
  - Use max skills and tools availble to agent to ensure the app is updated and advanced. 

# ============================================================
# END OF CONTEXT
# ============================================================
