# Model Loading System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate model-loading and routing defects, reduce complexity in high-risk code paths, and align runtime behavior with documented quality-tier semantics without reducing separation quality.

**Architecture:** Introduce a small, explicit routing policy layer for model selection, fix return/signature mismatches, and tighten validation around model artifacts and quality options. Keep existing separation algorithms intact; changes focus on orchestration correctness, maintainability, and observability.

**Tech Stack:** Python 3.12, FastAPI, ONNX Runtime, Demucs subprocess path, existing `stem_service` test suite (pytest).

---

## Scope and Findings (Investigation Summary)

- Confirmed defect: `hybrid.py` CLI `full` command incorrectly treats tuple returns from `run_hybrid_2stem`/`run_hybrid_4stem` as stem list directly, then indexes `p[1]` again.
- Confirmed defect: `ultra.py` function annotations/docstrings claim list return, but functions return tuple `(stems, models_used)`.
- Confirmed behavior mismatch risk: docs mention Ultra disabled on CPU unless `USE_ULTRA_ON_CPU=1`; current runtime code path attempts Ultra and does not gate on that flag.
- Confirmed naming-quality mismatch smell: ranking script accepts typo `sound-qulaity.md`; indicates artifact naming inconsistency instead of enforcing canonical naming.
- Confirmed complexity hotspots: `server._run_separation_sync` and `hybrid.run_4stem_single_pass_or_hybrid` contain multi-branch routing logic that mixes policy, execution, and logging concerns.
- Confirmed structure fragility: SCNet path is intentionally nested (`models/scnet.onnx/scnet.onnx`) and easy to misconfigure; add explicit checks and guidance to prevent silent confusion.
- Confirmed system-level gap: benchmark/ranking outputs are generated offline but not integrated into live runtime routing.

---

### Task 1: Fix Return Contract Mismatches (Critical Correctness)

**Files:**
- Modify: `stem_service/ultra.py`
- Modify: `stem_service/hybrid.py`
- Test: `stem_service/tests/test_ultra.py` (create if missing)
- Test: `stem_service/tests/test_hybrid_cli.py` (create if missing)

- [ ] **Step 1: Add failing tests for return shapes and CLI JSON payload generation**
  - `run_ultra_2stem` and `run_ultra_4stem` should be asserted as returning `(stem_list, models_used)`.
  - CLI `hybrid.py full` should generate valid JSON with relative stem paths.

- [ ] **Step 2: Fix `ultra.py` signatures/docstrings**
  - Change annotations to `-> tuple[list[tuple[str, Path]], list[str]]`.
  - Update docstrings to match actual return shape.

- [ ] **Step 3: Fix `hybrid.py` CLI full-command unpacking**
  - Unpack return values (`stem_list, models_used = ...`) and build payload from `stem_list`.
  - Optionally include `models_used` in output payload for consistency with API status.

- [ ] **Step 4: Run targeted tests**
  - Run: `pytest stem_service/tests/test_ultra.py -q`
  - Run: `pytest stem_service/tests/test_hybrid_cli.py -q`
  - Expected: all pass.

- [ ] **Step 5: Commit**
  - `git add stem_service/ultra.py stem_service/hybrid.py stem_service/tests/test_ultra.py stem_service/tests/test_hybrid_cli.py`
  - `git commit -m "fix: align ultra return contracts and hybrid CLI routing output"`

---

### Task 2: Align Quality Routing Semantics With Documentation (High Priority)

**Files:**
- Modify: `stem_service/server.py`
- Modify: `stem_service/config.py` (if env helper added)
- Modify: `README.md`
- Modify: `docs/stem-pipeline.md`
- Test: `stem_service/tests/test_server_quality_routing.py` (create/extend)

- [ ] **Step 1: Add failing tests for Ultra-on-CPU policy**
  - Define expected behavior:
    - If `USE_ULTRA_ON_CPU=1`, Ultra may run on CPU.
    - If unset/false and CPU-only, explicit fallback to `quality` (or explicit 400 if preferred policy).

- [ ] **Step 2: Implement explicit gate**
  - Add helper for `USE_ULTRA_ON_CPU` flag.
  - In `/split` quality parsing, enforce policy deterministically and log chosen fallback path.

- [ ] **Step 3: Ensure response/status metadata reflects effective mode**
  - Persist effective `quality_mode` and `model_tier` in progress/status artifacts.

- [ ] **Step 4: Update docs to exactly match runtime behavior**
  - Remove ambiguous wording.
  - Include one canonical truth table for quality routing by device and env flag.

- [ ] **Step 5: Run tests**
  - Run: `pytest stem_service/tests/test_server_quality_routing.py -q`
  - Run: `pytest stem_service/tests/test_server_job_runtime.py -q`

- [ ] **Step 6: Commit**
  - `git add stem_service/server.py stem_service/config.py README.md docs/stem-pipeline.md stem_service/tests/test_server_quality_routing.py`
  - `git commit -m "fix: make ultra quality routing policy explicit and documented"`

---

### Task 3: Reduce Routing Complexity in Core Orchestration (Maintainability + Regression Risk)

**Files:**
- Modify: `stem_service/server.py`
- Modify: `stem_service/hybrid.py`
- Create: `stem_service/routing_policy.py`
- Test: `stem_service/tests/test_routing_policy.py`
- Test: `stem_service/tests/test_server_job_runtime.py` (update)

- [ ] **Step 1: Add failing tests for route decisions**
  - Inputs: stem count, quality, backend mode, speed flag, model availability toggles.
  - Outputs: explicit selected pipeline stage path and expected fallback chain.

- [ ] **Step 2: Extract pure policy functions**
  - Move branch-heavy decision logic into `routing_policy.py`:
    - quality->tier normalization
    - 2-stem route selection
    - 4-stem route selection (SCNet -> Demucs ONNX -> hybrid fallback)

- [ ] **Step 3: Simplify orchestration functions**
  - Keep `_run_separation_sync` and `run_4stem_single_pass_or_hybrid` focused on execution and progress updates.
  - Replace nested conditionals with route objects/enums from policy layer.

- [ ] **Step 4: Verify behavior parity**
  - Run full relevant unit tests plus selected integration tests.
  - Compare pre/post `models_used` outputs for representative cases.

- [ ] **Step 5: Commit**
  - `git add stem_service/server.py stem_service/hybrid.py stem_service/routing_policy.py stem_service/tests/test_routing_policy.py stem_service/tests/test_server_job_runtime.py`
  - `git commit -m "refactor: extract model routing policy from orchestration code"`

---

### Task 4: Harden Model Artifact Naming and Discovery (Quality + Tooling Reliability)

**Files:**
- Modify: `scripts/rank_model_matrix.py`
- Modify: `scripts/benchmark_model_matrix.py` (if writer side is inconsistent)
- Modify: `docs/MODEL-INVENTORY-RUNBOOK.md`
- Test: `scripts/tests/test_rank_model_matrix.py` (create)

- [ ] **Step 1: Add failing tests for canonical quality file discovery**
  - Enforce canonical filename `sound-quality.md`.
  - Optionally support typo via one-time migration warning, not silent permanent fallback.

- [ ] **Step 2: Implement strict + observable handling**
  - Prefer canonical file.
  - If typo file exists, log warning with migration hint and optionally auto-rename in tooling step.

- [ ] **Step 3: Standardize emitters**
  - Ensure all benchmark/report writers generate canonical file names.

- [ ] **Step 4: Run tests**
  - Run: `pytest scripts/tests/test_rank_model_matrix.py -q`

- [ ] **Step 5: Commit**
  - `git add scripts/rank_model_matrix.py scripts/benchmark_model_matrix.py docs/MODEL-INVENTORY-RUNBOOK.md scripts/tests/test_rank_model_matrix.py`
  - `git commit -m "chore: standardize benchmark quality artifact naming"`

---

### Task 5: Add Config Validation for Fragile Paths (SCNet and Similar Models)

**Files:**
- Modify: `stem_service/config.py`
- Modify: `stem_service/scnet_onnx.py`
- Modify: `stem_service/server.py` (startup validation hook)
- Test: `stem_service/tests/test_config_validation.py` (create)

- [ ] **Step 1: Add failing tests for SCNet path validation and diagnostics**
  - Detect missing nested file, wrong location, and ambiguous model layout.

- [ ] **Step 2: Implement startup/config validation helper**
  - Validate `SCNET_ONNX` target exists and is file.
  - Emit clear remediation hint when `models/scnet.onnx` exists but nested file missing.

- [ ] **Step 3: Surface diagnostics early**
  - Include path and reason in startup logs and optional health endpoint metadata.

- [ ] **Step 4: Run tests**
  - Run: `pytest stem_service/tests/test_config_validation.py -q`

- [ ] **Step 5: Commit**
  - `git add stem_service/config.py stem_service/scnet_onnx.py stem_service/server.py stem_service/tests/test_config_validation.py`
  - `git commit -m "fix: validate scnet model path and improve startup diagnostics"`

---

### Task 6: Introduce Optional Runtime Ranking Integration (Performance/Quality Improvement)

**Files:**
- Create: `stem_service/model_registry.py`
- Modify: `stem_service/mdx_onnx.py`
- Modify: `stem_service/vocal_stage1.py`
- Modify: `docs/MODEL-INVENTORY-RUNBOOK.md`
- Test: `stem_service/tests/test_model_registry.py`

- [ ] **Step 1: Add failing tests for ranking-driven selection**
  - Given ranking CSV present, selector picks top eligible model per role and tier.
  - If ranking missing/stale, falls back to current static tier order.

- [ ] **Step 2: Implement read-only model registry layer**
  - Parse ranking artifacts into normalized in-memory candidates.
  - Validate file existence + compatibility before exposing candidates.

- [ ] **Step 3: Integrate behind feature flag**
  - Add env flag (e.g., `USE_RUNTIME_MODEL_RANKING=1`) default off.
  - Keep current static routing as safe fallback.

- [ ] **Step 4: Run tests**
  - Run: `pytest stem_service/tests/test_model_registry.py -q`
  - Run: `pytest stem_service/tests/test_server_job_runtime.py -q`

- [ ] **Step 5: Commit**
  - `git add stem_service/model_registry.py stem_service/mdx_onnx.py stem_service/vocal_stage1.py docs/MODEL-INVENTORY-RUNBOOK.md stem_service/tests/test_model_registry.py`
  - `git commit -m "feat: add optional runtime model registry from benchmark rankings"`

---

## Root Cause Analysis (Cross-Cutting)

- Contract drift between annotations/docstrings and actual return values indicates weak interface tests around orchestration boundaries.
- Routing logic grew organically inside executor functions, coupling policy decisions to side effects and making branch behavior hard to reason about.
- Documentation and runtime policy diverged over time (Ultra CPU behavior), likely due to iterative tuning without centralized policy ownership.
- Tooling tolerates naming errors (e.g., typo fallback) rather than enforcing conventions, which masks quality issues and creates silent ambiguity.
- Offline benchmarking and online routing are disconnected systems; lack of integration means performance/quality learnings are not consistently operationalized.

---

## Verification Matrix (Before Declaring Done)

- Functional:
  - 2-stem `speed|balanced|quality|ultra` routes behave as specified.
  - 4-stem route fallback chain works and reports deterministic `models_used`.
  - CLI `hybrid.py full` outputs valid JSON in both 2-stem and 4-stem modes.
- Contract:
  - Public function signatures/docstrings match real return values.
  - Type checks (if enabled) pass for updated modules.
- Quality:
  - No new lints in touched files.
  - Unit tests for routing policy and config validation pass.
- Observability:
  - Logs clearly state selected route and fallback reason.
  - Status payload includes effective quality mode and models used.

---

## Execution Recommendation

Implement Tasks 1-3 first (correctness + maintainability), then Tasks 4-5 (tooling/config hardening), then Task 6 as an optional feature rollout behind a flag.
