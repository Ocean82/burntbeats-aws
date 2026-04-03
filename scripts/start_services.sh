#!/bin/bash
# Start both services for testing
cd /mnt/d/burntbeats-aws

echo "=== Starting Stem Service ==="
source .venv/bin/activate
python -m uvicorn stem_service.server:app --host 127.0.0.1 --port 5000 &
STEM_PID=$!
echo "Stem service PID: $STEM_PID"

# Wait for stem service to be ready
for i in {1..30}; do
    if curl -s http://127.0.0.1:5000/health > /dev/null 2>&1; then
        echo "Stem service ready!"
        break
    fi
    sleep 1
done

echo ""
echo "=== Starting Backend ==="
cd backend
npm run dev &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend
for i in {1..30}; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "Backend ready!"
        break
    fi
    sleep 1
done

echo ""
echo "=== Services Started ==="
echo "Stem Service: http://localhost:5000"
echo "Backend: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"

# Wait for interrupt
trap "kill $STEM_PID $BACKEND_PID 2>/dev/null; exit" INT TERM
wait
