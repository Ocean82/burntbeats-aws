# speech_service CI and Test Design

**Date:** 2026-06-04  
**Status:** Approved for implementation (assessment remediation)

## Goal

Bring `speech_service` to the same minimum quality bar as `midi_service`: unit tests without model weights, pytest in CI, Docker image build verification.

## In scope

| Area | Coverage |
|------|----------|
| Config | `SPEECH_MAX_QUEUE_DEPTH`, paths, `SPEECH_DEVICE` defaults via env |
| `internal_auth` | Token length, startup validation, `require_configured_api_token` (mirror `stem_service/tests/test_internal_auth.py`) |
| `job_queue` | Depth limit, enqueue when full, worker-not-started error |
| CI | `speech-python` job: `uv sync` + `pytest speech_service/tests -q` |
| CI | `speech-docker` job: `docker build -f speech_service/Dockerfile .` |

## Out of scope

- Full LavaSR inference quality or latency benchmarks
- Loading real weights in CI (`verify_models_at_startup` not exercised in unit tests)
- FastAPI route integration tests that require multipart uploads (follow-up)
- `SPEECH_ALLOW_MISSING_MODEL` production flag (not required if tests avoid importing `server.py` at collection time)

## Test environment

- `INTERNAL_SERVICE_AUTH_REQUIRED=0` in CI pytest env
- `NODE_ENV=test` for auth module reload tests
- No `SPEECH_MODELS_DIR` weights on disk for unit tests
- Global `job_queue` state reset via autouse fixture in `conftest.py`

## CI commands

```bash
uv sync --frozen --package burntbeats-speech --no-install-project
uv sync --frozen --group dev
INTERNAL_SERVICE_AUTH_REQUIRED=0 uv run pytest speech_service/tests -q
```

## Success criteria

- All tests pass locally and in GitHub Actions without `speech_models/` populated
- Docker build completes in `speech-docker` job (same pattern as `stem-docker`)
