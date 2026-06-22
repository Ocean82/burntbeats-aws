# Stem split API — reproducible CPU image. Pin digest in deploy configs for production parity.
# Build from repo root: docker build -f stem_service/Dockerfile .
FROM python:3.11-slim

WORKDIR /repo

# Build tools (diffq), ffmpeg (clip/matrix), libsndfile (soundfile)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
COPY stem_service/pyproject.toml ./stem_service/pyproject.toml
COPY midi_service/pyproject.toml ./midi_service/pyproject.toml
COPY speech_service/pyproject.toml ./speech_service/pyproject.toml
COPY shared/python/pyproject.toml ./shared/python/pyproject.toml

RUN pip install --no-cache-dir uv \
    && UV_SYSTEM_PYTHON=1 uv sync --frozen --package burntbeats-stem --no-install-project

COPY stem_service/ ./stem_service/
COPY shared/python/ ./shared/python/

RUN groupadd --system --gid 10001 appuser \
    && useradd --system --uid 10001 --gid appuser --home /repo --shell /usr/sbin/nologin appuser \
    && mkdir -p /repo/tmp/stems \
    && chown -R appuser:appuser /repo

USER appuser

EXPOSE 5000
CMD [".venv/bin/python", "-m", "uvicorn", "stem_service.server:app", "--host", "0.0.0.0", "--port", "5000"]
