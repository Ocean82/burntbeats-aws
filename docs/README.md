# Documentation index

**Target platform:** **AWS `t3.large`-class Ubuntu, CPU only (no GPU)** — local dev via **WSL Ubuntu**; Python venv: **`source .venv/bin/activate`**. Full detail: root [README.md](../README.md) → *Target environment*.

**Single direction:** run and deploy from the root [README.md](../README.md); understand stem logic from [stem-pipeline.md](stem-pipeline.md); tune CPU/models from the references below. Everything in `docs/archive/` is **historical** (investigations, old plans).

---

## Repository layout (high level)

| Path | Role |
|------|------|
| `frontend/` | React + Vite UI (split, expand, mixer, export) |
| `backend/` | Express API: auth, proxies to stem service, serves stem WAVs |
| `stem_service/` | Python FastAPI: separation jobs, hybrid + ONNX + Demucs |
| `models/` | Checkpoints and ONNX (not in git; see MODELS-INVENTORY) |
| `scripts/` | Bash helpers: local run, benchmarks, model copy |
| `shared/` | Shared TypeScript types for API |
| `docker-compose.yml` | Frontend + backend + stem_service |
| `docs/` | This index and technical notes |
| `docs/agent-context/` | YAML supplements for AI workflows (non-normative) |
| `docs/archive/` | Superseded investigations and scratchpads |

---

## Operational (start here after README)

| Doc | Contents |
|-----|----------|
| [../README.md](../README.md) | Install, env vars, API summary, deploy, troubleshooting |
| [BILLING-AND-TOKENS.md](BILLING-AND-TOKENS.md) | Stripe subscriptions, token model, plan tiers (Basic vs Premium), Stripe CLI |
| [SANITY-CHECKS.md](SANITY-CHECKS.md) | Manual QA checklist |
| [MALWARE-SCAN-OPS.md](MALWARE-SCAN-OPS.md) | ClamAV scan after upload: enable on server, env, `freshclam`, verify |
| [DEPLOY-SERVER-BUNDLE.md](DEPLOY-SERVER-BUNDLE.md) | Tarball/rsync deploy without `models/`, `node_modules/`, `.venv/` — `scripts/package-server-bundle.sh` |
| [DEPLOY-DOCKER-EC2.md](DEPLOY-DOCKER-EC2.md) | **Docker Compose on EC2:** `git pull`, per-service `build` / `up -d`, **long `stem_service` builds**, **name conflicts** → `compose down` / `up`, host nginx → frontend container |
| [TEST-RUN-PLAN.md](TEST-RUN-PLAN.md) | Test run plan |
| [FOLLOW-UPS-AND-DEFERRED.md](FOLLOW-UPS-AND-DEFERRED.md) | Open items (env, S3, FFmpeg, billing) — placeholders only, no secrets |

---

## Stem engine (authoritative)

| Doc | Contents |
|-----|----------|
| **[stem-pipeline.md](stem-pipeline.md)** | **Canonical** pipeline: 2-stem → expand, quality tiers, model order |
| [MODELS-INVENTORY.md](MODELS-INVENTORY.md) | What to place under `models/` |
| [../models/model_resources/model-information.md](../models/model_resources/model-information.md) | External pretrained-model catalog (reference) |
| [AGENT-models-and-implementation.md](AGENT-models-and-implementation.md) | Path resolution, module map (implementation-focused) |
| [JOB-METRICS.md](JOB-METRICS.md) | Metrics file and mode names |
| [CPU-OPTIMIZATION-TIPS.md](CPU-OPTIMIZATION-TIPS.md) | `OMP_*`, ORT threads, Demucs settings |
| [ONNX-EFFICIENCY-INVESTIGATION.md](ONNX-EFFICIENCY-INVESTIGATION.md) | ONNX inventory and pipeline cost notes |
| [OPENVINO-INVESTIGATION.md](OPENVINO-INVESTIGATION.md) | OpenVINO experiment notes |
| [MODELS-NEW-AND-ALTERNATIVES.md](MODELS-NEW-AND-ALTERNATIVES.md) | Alternative / newer models (research) |
| [NEW-flow.md](NEW-flow.md) | SCNet vs Demucs CPU research |
| [NEW-flow-implementation.md](NEW-flow-implementation.md) | How SCNet wiring landed |

---

## Frontend / product

| Doc | Contents |
|-----|----------|
| [new_features.md](new_features.md) | UI/UX improvement backlog and status |
| [frontend-mixer-notes.md](frontend-mixer-notes.md) | Mixer / waveform architecture and follow-ups |

---

## Archive (read-only context)

| Location | Contents |
|----------|----------|
| [archive/README.md](archive/README.md) | List of archived files |
| [archive/](archive/) | VAD/Demucs investigations, old AGENT todos, quantization note, hybrid write-up, **historical** [AGENT-GUIDE-historical.md](archive/AGENT-GUIDE-historical.md), external link dump [music-tools-external-links.md](archive/music-tools-external-links.md) |

Do **not** treat archive docs as current behavior; verify against `stem_service/` and [stem-pipeline.md](stem-pipeline.md).

---

## Optional agent / strategy context (non-normative)

Markdown in `docs/`; YAML mirrors live in **[agent-context/](agent-context/README.md)** for tooling. These do **not** override [stem-pipeline.md](stem-pipeline.md) or the root README.

| Markdown |
|----------|
| [AGENT-decision-knowledge-context.md](AGENT-decision-knowledge-context.md) |
| [AGENT-compatible-frontend-strategy.md](AGENT-compatible-frontend-strategy.md) |
| [AGENT-models-and-implementation.md](AGENT-models-and-implementation.md) |
| [AGENT-Knowledge-Block.md](AGENT-Knowledge-Block.md) |

---

## Superseded index

The former `docs/DOCS-STATUS.md` and root `IMPLEMENTATION_SUMMARY.md` are removed; their role is this file plus [stem-pipeline.md](stem-pipeline.md).
