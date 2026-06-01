# Stem / Python workspace helpers (Linux/macOS). On Windows use WSL or uv directly.
.PHONY: uv-lock uv-lock-check uv-sync-stem uv-sync-midi uv-sync-speech uv-sync-all stem-install-ci stem-smoke stem-test

uv-lock:
	uv lock

uv-lock-check:
	uv lock --check

uv-sync-stem:
	uv sync --package burntbeats-stem

uv-sync-midi:
	uv sync --package burntbeats-midi

uv-sync-speech:
	uv sync --package burntbeats-speech

uv-sync-all:
	uv sync --all-packages

# CI parity (Linux/macOS)
stem-install-ci: uv-sync-stem

stem-smoke: uv-sync-stem
	uv run python scripts/smoke_torchaudio_io.py

stem-test: stem-smoke
	STEM_ALLOW_MISSING_HTDEMUCS=1 uv run pytest stem_service/tests -q
