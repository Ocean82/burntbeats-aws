# Stem service

Demucs-backed separation worker and HTTP/job API (`server.py`).

- **BPM / beat metadata:** [`bpm_analysis.py`](bpm_analysis.py) produces `beat_grid` attached to split progress and status payloads.
- **Manual BPM QA:** [`scripts/README.md`](scripts/README.md) (`bpm_qa_harness.py`).
- **Design notes:** [`docs/roadmap/beat-grid-validation.md`](../docs/roadmap/beat-grid-validation.md).
- **Tests:** `pytest tests/` from this directory.
