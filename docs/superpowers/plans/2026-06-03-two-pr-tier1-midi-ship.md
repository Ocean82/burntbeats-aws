# Two-PR Tier 1 MIDI/Ops Ship — Implementation Plan

**Status:** Completed — merged to `main` via PR #26 (2026-06-03). Do not re-run PR branching; code and docs live on default branch. See [docs/DEPENDABOT-MIDI-ONNX.md](../../DEPENDABOT-MIDI-ONNX.md) and [docs/TEMP-INVENTORY.md](../../TEMP-INVENTORY.md).

> **For agentic workers:** Historical playbook only. All steps below were executed; checkboxes left for audit trail.

> **For agentic workers (original):** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Tier 1 TEMP assessment work and ONNX-only MIDI on `main` in PR1, then frontend/audio in PR2, without mixing unrelated files.

**Architecture:** PR1 uses uv overrides + forced ONNX `model_runtime`; speech cleanup and compose stem health gate; PR2 is frontend-only from fresh `main`. Spec: `docs/superpowers/specs/2026-06-03-two-pr-tier1-midi-ship-design.md`.

**Tech Stack:** uv workspace, basic-pitch 0.4 + onnxruntime, Express backend, Docker Compose.

---

## File map (PR1 only)

| File | Responsibility |
|------|----------------|
| `pyproject.toml` | uv override-dependencies block TF/Keras |
| `uv.lock` | Regenerated lock without TF install graph |
| `midi_service/pyproject.toml` | basic-pitch + onnxruntime |
| `midi_service/requirements.txt` | Human-readable mirror; ONNX-only note |
| `midi_service/services/model_runtime.py` | Force ONNX model path |
| `midi_service/Dockerfile` | sync + TF uninstall safety |
| `backend/routes/speech/cleanup.js` | Speech job TTL cleanup |
| `docker-compose.yml` | stem depends_on + SPEECH_MAX_AGE_HOURS |
| `docker/cleanup/entrypoint.sh` | Call speech cleanup |
| `archive/stem-splitter-mixer-ui/` | Archived orphan UI |

---

## PR1: Branch and staging

### Task 1: Create PR1 branch

**Files:** git only

- [ ] **Step 1:** Ensure working tree has Tier 1 changes present (from prior session or re-apply)
- [ ] **Step 2:** `git checkout -b tier1/onnx-midi-ops` from `main`
- [ ] **Step 3:** Stage only PR1 paths (see spec exclude list); `git status` must show no frontend audio files staged

**Staging command pattern (adjust paths as needed):**

```bash
git add pyproject.toml uv.lock midi_service/ backend/routes/speech/ backend/middleware/rateLimiter.js backend/server.test.js docker-compose.yml docker/cleanup/ archive/ frontend/src/components/MultiStemEditor.tsx .gitignore docs/
git add -u stem-splitter-mixer-ui/
```

- [ ] **Step 4:** Confirm unstaged: `AudioContext.tsx`, `tempoSync*`, `VocalCleanupQuickApply*`, `.vscode/`

---

### Task 2: Align requirements.txt

**Files:**
- Modify: `midi_service/requirements.txt`

- [ ] **Step 1:** Update to match `pyproject.toml` (basic-pitch>=0.4.0, onnxruntime>=1.17.0, other runtime deps)
- [ ] **Step 2:** Add header comment: `# Sync with midi_service/pyproject.toml; ONNX-only (no TensorFlow). Prefer: uv sync --package burntbeats-midi`

---

### Task 3: Verify lock and MIDI package

**Files:** none (commands)

- [ ] **Step 1:** `uv lock`
- [ ] **Step 2:** `uv sync --package burntbeats-midi`
- [ ] **Step 3:** `uv run --package burntbeats-midi python -c "from midi_service.services.model_runtime import get_model_path; p=get_model_path(); assert p.suffix=='.onnx'"`
- [ ] **Step 4:** `uv run --package burntbeats-midi pytest midi_service/tests -q`

---

### Task 4: Backend verification

**Files:** none (commands)

- [ ] **Step 1:** `cd backend && npm test`
- [ ] **Step 2:** Confirm speech cleanup test passes (GET 405, POST 200)

---

### Task 5: Docker build

**Files:** none (commands)

- [ ] **Step 1:** From repo root: `docker build -f midi_service/Dockerfile .`
- [ ] **Step 2:** Optional smoke: run container, hit `/health` on port 5002

---

### Task 6: Commit and push PR1

**Files:** git only

- [ ] **Step 1:** Commit message (example):

```text
Ship Tier 1 ops: ONNX-only MIDI, speech cleanup, compose stem gate

Drop TensorFlow from uv.lock via overrides; force ICASSP ONNX inference.
Add speech cleanup API and sidecar TTL. Wait for stem_service health.
Archive stem-splitter-mixer-ui; document TEMP assessment outcomes.
```

- [ ] **Step 2:** `git push -u origin tier1/onnx-midi-ops`
- [ ] **Step 3:** `gh pr create` with test plan checklist from Task 3–5

---

### Task 7: Post-merge PR1 checks

**Files:** none

- [ ] **Step 1:** After merge, `gh api` or GitHub UI: Dependabot #51–#56 → closed?
- [ ] **Step 2:** If #55 protobuf still open, note in `docs/DEPENDABOT-MIDI-ONNX.md` (no TF reintro)

---

## PR2: Frontend/audio (after PR1 merge)

### Task 8: Branch PR2 from main

- [ ] **Step 1:** `git checkout main && git pull`
- [ ] **Step 2:** `git checkout -b frontend/audio-enhancements`
- [ ] **Step 3:** Stage only remaining frontend/audio files; exclude midi_service and uv.lock

---

### Task 9: PR2 verification

- [ ] **Step 1:** `cd frontend && npm run lint` (or project standard)
- [ ] **Step 2:** `npm test` / vitest if applicable for new files (`tempoSync.test.ts`, `vocalCleanupPreset.test.ts`)
- [ ] **Step 3:** Commit, push, `gh pr create` — note dependency on PR1 merged

---

## PR1 test plan (for GitHub PR body)

- [ ] `uv lock` clean
- [ ] `uv run --package burntbeats-midi pytest midi_service/tests -q`
- [ ] `cd backend && npm test`
- [ ] `docker build -f midi_service/Dockerfile .`
- [ ] Dependabot alerts linked; expect #51–#56 to close after merge

---

## Out of scope (do not do in this plan)

- Remove `basic-pitch` package (Option A)
- Python 3.10 pin (Option 3)
- Internal basic-pitch fork
- Commit `.vscode/` or `pyproject.toml.test`
