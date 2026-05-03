# Documentation index

Curated map for **maintainers** (not web users). **Runtime truth** = root [`README.md`](../README.md) + [`stem-pipeline.md`](stem-pipeline.md) + [`ARCHITECTURE-FLOW.md`](ARCHITECTURE-FLOW.md). If anything else disagrees on *current* behavior, prefer those three.

---

## 1. Start here (operational truth)

| Doc | Purpose |
|-----|---------|
| [`../README.md`](../README.md) | Repo overview, Compose, env cheat sheet, EC2 deploy loop |
| [`ARCHITECTURE-FLOW.md`](ARCHITECTURE-FLOW.md) | Upload → split → storage → client mixer → **export** (client WAV/MP3/ZIP; optional **server** WAV), tokens, cleanup |
| [`stem-pipeline.md`](stem-pipeline.md) | Implemented separation routing (2-stem, expand, SCNet, hybrid, ultra, quality modes) |
| [`MODEL-SELECTION-AUTHORITY.md`](MODEL-SELECTION-AUTHORITY.md) | Tier tables + how benchmark CSVs inform policy |
| [`MODEL-PARAMS.md`](MODEL-PARAMS.md) | Parameter mapping notes for hybrid / stage-1 returns |

---

## 2. Roadmap & personal backlog

**Aspirational / planning only** — verify against code before building.

| Doc | Purpose |
|-----|---------|
| [`roadmap/README.md`](roadmap/README.md) | Index of planning docs |
| [`roadmap/future-goals.md`](roadmap/future-goals.md) | Deferred multi-step goals (beat grid, `App.tsx` split, master bus, …) |
| [`roadmap/product-backlog.md`](roadmap/product-backlog.md) | UX audit + feature status tables (ex-`new_features.md`) |

---

## 3. Operations & readiness

| Doc | Purpose |
|-----|---------|
| [`DEPLOY-DOCKER-EC2.md`](DEPLOY-DOCKER-EC2.md) | Compose on EC2 |
| [`DEPLOY-SERVER-BUNDLE.md`](DEPLOY-SERVER-BUNDLE.md) | Tarball / rsync deploy alternative |
| [`DEPLOY-MARKETING-SITE.md`](DEPLOY-MARKETING-SITE.md) | Separate pricing/marketing Vite site |
| [`PRODUCTION-READINESS-CHECKLIST.md`](PRODUCTION-READINESS-CHECKLIST.md) | Short pre-release checklist |
| [`SANITY-CHECKS.md`](SANITY-CHECKS.md) | Manual verification after deploy |
| [`MALWARE-SCAN-OPS.md`](MALWARE-SCAN-OPS.md) | Upload scanning configuration |
| [`JOB-METRICS.md`](JOB-METRICS.md) | Job timing / logging references |
| [`TEST-RUN-PLAN.md`](TEST-RUN-PLAN.md) | Test planning notes |

---

## 4. Billing & product contract

| Doc | Purpose |
|-----|---------|
| [`BILLING-AND-TOKENS.md`](BILLING-AND-TOKENS.md) | Stripe tiers, token grants/debits (split, expand, optional server export) |

---

## 5. Models, inventory, benchmarks

**Layout:** root [`README.md`](../README.md) § *Models layout* · one page [**`MODEL-LAYOUT.md`**](MODEL-LAYOUT.md).

| Doc | Purpose |
|-----|---------|
| [`MODEL-LAYOUT.md`](MODEL-LAYOUT.md) | **`models/`** vs **`server_models/`**, scripts, Compose, `.dockerignore`, EC2 checklist |
| [`MODELS-INVENTORY.md`](MODELS-INVENTORY.md) | Required / optional weights |
| [`MODEL-INVENTORY-RUNBOOK.md`](MODEL-INVENTORY-RUNBOOK.md) | Maintainer workflow |
| [`MODEL-INVENTORY-AUTO.md`](MODEL-INVENTORY-AUTO.md) | Automated inventory outputs |
| [`MODELS-DISK-CLEANUP.md`](MODELS-DISK-CLEANUP.md) | Disk hygiene |
| [`MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md`](MODEL-PATH-AND-SELECTION-INVESTIGATION-2026-04-15.md) | Paths + 4-stem speed rank-28 lock audit |
| [`model-matrix-benchmark-workflow.md`](model-matrix-benchmark-workflow.md) | How matrices become `ranked_practical_time_score` |
| [`benchmarks/README.md`](benchmarks/README.md) | **Tracked CSV/JSON** benchmark artifacts |

---

## 6. Performance & hardware guides

| Doc | Purpose |
|-----|---------|
| [`CPU-OPTIMIZATION-TIPS.md`](CPU-OPTIMIZATION-TIPS.md) | CPU tuning |
| [`CPU-2STEM-MODEL-GUIDE-T3-LARGE.md`](CPU-2STEM-MODEL-GUIDE-T3-LARGE.md) | t3.large oriented notes |

---

## 7. Frontend-only notes

| Doc | Purpose |
|-----|---------|
| [`frontend-mixer-notes.md`](frontend-mixer-notes.md) | Mixer-centric dev notes; backlog cross-links live under [`roadmap/`](roadmap/) |

---

## 8. Research (secondary — not SOT)

| Doc | Purpose |
|-----|---------|
| [`research/README.md`](research/README.md) | Index of ONNX/OpenVINO/alternatives notes |

---

## 9. Corrections & one-off writeups

| Doc | Purpose |
|-----|---------|
| [`corrections/hybrid-fixes.md`](corrections/hybrid-fixes.md) | Historical hybrid correction log |

---

## 10. Environment, legal & repo satellites

| Kind | Purpose |
|------|---------|
| [`ENVIRONMENT-MATRIX.md`](ENVIRONMENT-MATRIX.md) | All **`VITE_*`**, Compose, **`backend/`**, **`stem_service/`** env wiring |
| [`LEGAL-LAYOUT.md`](LEGAL-LAYOUT.md) | SPA `/privacy-policy` + `/terms-of-service`, version sync, **`sitemap.xml`** |
| Root [`legal/README.md`](../legal/README.md) | Why **`legal/*.md`** exists vs **`frontend/src/pages/legal/`** |

**Standalone Vite packages** (deploy separately · not in main Compose stack):

| Path | Purpose |
|------|---------|
| [`burnt-beats-pricing-structure/`](../burnt-beats-pricing-structure/README.md) | Transparency pricing / pay‑as‑you‑go viewers (migrate users toward subscriptions). |
| [`gamer_tag/`](../gamer_tag/README.md) | Waiting-room block game (rename before marketing — see README ideas). |

---

## 11. Archived history

| Path | Purpose |
|------|---------|
| [`archive/README.md`](archive/README.md) | Manifest of superseded investigations & agent scratchpads |

Rust archive: **`stem_api/README.md`** + **`archive/IMPLEMENTATION-HYBRID.md`**.

---

## Quick conflicts rule

If **`stem-pipeline.md`** / **`ARCHITECTURE-FLOW.md`** / root **`README.md`** disagree with **research**, **archive**, or **roadmap** docs on *what production does today*, assume **roadmap/research/archive are historical** unless they explicitly say they were refreshed against main.
