# Stem service

Demucs-backed separation worker and HTTP/job API (`server.py`).

## Dependencies

Declared in [`pyproject.toml`](pyproject.toml) (`burntbeats-stem`). From repo root:

```bash
uv sync --package burntbeats-stem
uv run pytest stem_service/tests -q
```

Docker and CI use `uv.lock` at the repo root. `requirements.txt` is kept for reference; prefer `uv sync`.

- **BPM / beat metadata:** [`bpm_analysis.py`](bpm_analysis.py) produces `beat_grid` attached to split progress and status payloads.
- **Manual BPM QA:** [`scripts/README.md`](scripts/README.md) (`bpm_qa_harness.py`).
- **Design notes:** [`docs/roadmap/beat-grid-validation.md`](../docs/roadmap/beat-grid-validation.md).
- **Tests:** `uv run pytest stem_service/tests -q` from repo root.
