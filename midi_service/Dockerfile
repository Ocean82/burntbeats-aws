FROM python:3.11-slim

WORKDIR /repo

# Install system dependencies for soundfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY midi_service/requirements.txt midi_service/requirements.txt
RUN pip install --no-cache-dir -r midi_service/requirements.txt

COPY midi_service/ midi_service/

EXPOSE 5002

CMD ["uvicorn", "midi_service.server:app", "--host", "0.0.0.0", "--port", "5002"]
