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

COPY stem_service/requirements.lock.txt ./stem_service/requirements.lock.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r stem_service/requirements.lock.txt \
        --extra-index-url https://download.pytorch.org/whl/cpu

# Application package (imports like `from stem_service.config` require this layout)
COPY stem_service/ ./stem_service/

EXPOSE 5000
CMD ["python", "-m", "uvicorn", "stem_service.server:app", "--host", "0.0.0.0", "--port", "5000"]
