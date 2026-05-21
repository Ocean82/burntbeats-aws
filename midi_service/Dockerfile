# MIDI conversion API (Basic Pitch). Build from repo root:
#   docker build -f midi_service/Dockerfile .
FROM python:3.12-slim

WORKDIR /repo

# libsndfile for WAV/FLAC/OGG; ffmpeg for MP3/M4A/WebM (librosa / Basic Pitch)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY midi_service/requirements.txt ./midi_service/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r midi_service/requirements.txt

COPY midi_service/ ./midi_service/

ENV MIDI_OUTPUT_DIR=/repo/tmp/midi

EXPOSE 5002
CMD ["uvicorn", "midi_service.server:app", "--host", "0.0.0.0", "--port", "5002"]
