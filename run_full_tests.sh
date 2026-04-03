#!/bin/bash
cd /mnt/d/burntbeats-aws

echo "=== Starting Stem Service ==="
(.venv/bin/python -m uvicorn stem_service.server:app --host 127.0.0.1 --port 5000 &)
sleep 8

echo ""
echo "=== Checking Services ==="
echo -n "Backend: "
curl -s --max-time 2 http://127.0.0.1:3001/api/health | head -1

echo ""
echo -n "Stem Service: "
curl -s --max-time 2 http://127.0.0.1:5000/health | head -1

echo ""
echo ""
echo "=== Running API Tests ==="
.venv/bin/python scripts/test_api_endpoints.py

echo ""
echo "=== Done ==="
