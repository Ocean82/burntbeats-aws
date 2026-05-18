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

COPY speech_service/requirements.txt ./speech_service/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r speech_service/requirements.txt \
        --extra-index-url https://download.pytorch.org/whl/cpu

COPY Speech/ ./Speech/
COPY speech_service/ ./speech_service/

ENV PYTHONPATH=/repo/Speech
ENV SPEECH_MODELS_DIR=/repo/speech_models
ENV SPEECH_OUTPUT_DIR=/repo/tmp/speech

EXPOSE 5001
CMD ["python", "-m", "uvicorn", "speech_service.server:app", "--host", "0.0.0.0", "--port", "5001"]
