# Stem service scripts

## `bpm_qa_harness.py`

Batch-runs `estimate_bpm` over a folder of audio files and writes a CSV for manual QA against real tracks.

```bash
cd stem_service
python scripts/bpm_qa_harness.py --input-dir /path/to/wavs --out-csv bpm_report.csv
```

Optional: `--show-progress` prints each file as it is processed.

See also [docs/roadmap/beat-grid-validation.md](../../docs/roadmap/beat-grid-validation.md) for the confidence threshold and architecture notes.
