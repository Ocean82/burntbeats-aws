#!/usr/bin/env bash
# POST a split and poll until completed or failed. Usage: bash scripts/test-split-and-wait.sh [path_to_wav]
set -e
cd "$(dirname "$0")/.."
WAV="${1:-tmp/test_split.wav}"
if [ ! -f "$WAV" ]; then
  echo "No WAV at $WAV. Create tmp/test_split.wav or pass path."
  exit 1
fi
echo "Posting $WAV..."
R=$(curl -s -X POST -F "file=@$WAV" -F "stems=2" -F "quality=speed" http://localhost:3001/api/stems/split)
echo "$R"
JOB=$(echo "$R" | grep -o '"job_id":"[^"]*"' | cut -d'"' -f4)
[ -z "$JOB" ] && echo "No job_id in response" && exit 1
echo "Job: $JOB"
for i in $(seq 1 24); do
  sleep 10
  S=$(curl -s "http://localhost:3001/api/stems/status/$JOB")
  echo "[$i] $S"
  echo "$S" | grep -q '"status":"completed"' && echo "DONE" && exit 0
  echo "$S" | grep -q '"status":"failed"' && echo "FAILED" && exit 1
done
echo "Timeout"
exit 1
