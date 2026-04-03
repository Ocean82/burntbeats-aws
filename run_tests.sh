#!/bin/bash
cd /mnt/d/burntbeats-aws

echo "=== Starting Stem Service ==="
.venv/bin/python -m uvicorn stem_service.server:app --host 127.0.0.1 --port 5000 &
sleep 5

echo "=== Checking Health ==="
curl -s http://127.0.0.1:5000/health

echo ""
echo "=== Running API Tests ==="
.venv/bin/python scripts/test_api_endpoints.py

echo ""
echo "=== Done ==="
