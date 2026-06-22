# BurntBeats workspace helpers (Linux/macOS). On Windows use WSL or uv directly.
.PHONY: uv-lock uv-lock-check uv-sync-stem uv-sync-midi uv-sync-speech uv-sync-all
.PHONY: stem-install-ci stem-smoke stem-test midi-test speech-test
.PHONY: frontend-lint frontend-typecheck frontend-build frontend-test
.PHONY: backend-lint backend-test

# === UV / Workspace ===
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

# === Python services ===
stem-install-ci: uv-sync-stem

stem-smoke: uv-sync-stem
	uv run python scripts/smoke_torchaudio_io.py

stem-test: stem-smoke
	STEM_ALLOW_MISSING_HTDEMUCS=1 uv run pytest stem_service/tests -q

midi-test:
	uv sync --frozen --all-packages --group dev
	uv run pytest midi_service/tests -q -m "not integration"

speech-test:
	uv sync --frozen --all-packages --group dev
	uv run pytest speech_service/tests -q

# === Frontend ===
frontend-install:
	cd frontend && npm install

frontend-lint: frontend-install
	cd frontend && npm run lint

frontend-typecheck: frontend-install
	cd frontend && npx tsc --noEmit

frontend-build: frontend-install
	cd frontend && npm run build

frontend-test: frontend-install
	cd frontend && npm run test:run

# === Backend ===
backend-install:
	cd backend && npm install

backend-lint: backend-install
	cd backend && npm run lint

backend-test: backend-install
	cd backend && npm test
