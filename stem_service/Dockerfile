FROM python:3.11-slim

WORKDIR /repo

# Build tools needed for diffq (C extension) and other compiled deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY stem_service/requirements.txt ./stem_service/requirements.txt
RUN pip install --no-cache-dir -r stem_service/requirements.txt

# Copy the stem_service package so imports like `from stem_service.config` work
COPY stem_service/ ./stem_service/

EXPOSE 5000
CMD ["python", "-m", "uvicorn", "stem_service.server:app", "--host", "0.0.0.0", "--port", "5000"]
