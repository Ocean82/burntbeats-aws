# Speech enhancement API (LavaSR). Build from repo root:
#   docker build -f speech_service/Dockerfile .
FROM python:3.11-slim

WORKDIR /repo

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    ffmpeg \
    libsndfile1 \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
COPY stem_service/pyproject.toml ./stem_service/pyproject.toml
COPY midi_service/pyproject.toml ./midi_service/pyproject.toml
COPY speech_service/pyproject.toml ./speech_service/pyproject.toml

RUN pip install --no-cache-dir uv \
    && UV_SYSTEM_PYTHON=1 uv sync --frozen --package burntbeats-speech --no-install-project

COPY Speech/ ./Speech/
COPY speech_service/ ./speech_service/

ENV PYTHONPATH=/repo/Speech
ENV SPEECH_MODELS_DIR=/repo/speech_models
ENV SPEECH_OUTPUT_DIR=/repo/tmp/speech

RUN groupadd --system --gid 10001 appuser \
    && useradd --system --uid 10001 --gid appuser --home /repo --shell /usr/sbin/nologin appuser \
    && mkdir -p /repo/tmp/speech /repo/speech_models \
    && chown -R appuser:appuser /repo

USER appuser

EXPOSE 5001
CMD [".venv/bin/python", "-m", "uvicorn", "speech_service.server:app", "--host", "0.0.0.0", "--port", "5001"]
