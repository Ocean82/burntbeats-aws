# MIDI conversion API (Basic Pitch). Build from repo root:
#   docker build -f midi_service/Dockerfile .
FROM python:3.11-slim

WORKDIR /repo

# libsndfile for WAV/FLAC/OGG; ffmpeg for MP3/M4A/WebM (librosa / Basic Pitch)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
COPY stem_service/pyproject.toml ./stem_service/pyproject.toml
COPY midi_service/pyproject.toml ./midi_service/pyproject.toml
COPY speech_service/pyproject.toml ./speech_service/pyproject.toml

RUN pip install --no-cache-dir uv \
    && UV_SYSTEM_PYTHON=1 uv sync --frozen --package burntbeats-midi --no-install-project \
    && pip uninstall -y tensorflow tensorflow-macos tensorflow-estimator tensorflow-io-gcs-filesystem keras 2>/dev/null || true

COPY midi_service/ ./midi_service/

ENV MIDI_OUTPUT_DIR=/repo/tmp/midi

EXPOSE 5002
CMD ["uvicorn", "midi_service.server:app", "--host", "0.0.0.0", "--port", "5002"]
