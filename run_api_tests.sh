#!/bin/bash
cd /mnt/d/burntbeats-aws

echo "=== Starting Stem Service ==="
nohup .venv/bin/python -m uvicorn stem_service.server:app --host 127.0.0.1 --port 5000 > /tmp/stem.log 2>&1 &
STEM_PID=$!
echo "Stem service PID: $STEM_PID"

echo "Waiting for stem service to be ready..."
for i in {1..30}; do
    if curl -s --max-time 2 http://127.0.0.1:5000/health > /dev/null 2>&1; then
        echo "Stem service is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 1
done

echo ""
echo "=== Running API Tests ==="
.venv/bin/python scripts/test_api_endpoints.py

echo ""
echo "=== Stopping Stem Service ==="
kill $STEM_PID 2>/dev/null
echo "Done!"
