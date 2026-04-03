#!/bin/bash
cd /mnt/d/burntbeats-aws
source .venv/bin/activate
echo "Starting stem service..."
python -m uvicorn stem_service.server:app --host 127.0.0.1 --port 5000
