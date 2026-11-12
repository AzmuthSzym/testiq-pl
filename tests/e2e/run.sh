#!/usr/bin/env bash
# Test w prawdziwej przeglądarce (Chromium z Playwright, w Dockerze):
# strona + API w osobnej sieci Dockera, zrzuty ekranu do tests/e2e/out/.
#   tests/e2e/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NET=testiq-e2e
OUT="$ROOT/tests/e2e/out"
mkdir -p "$OUT"

cleanup() { docker rm -f testiq-e2e-api testiq-e2e-site >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
docker network create $NET >/dev/null

docker build -q -t testiq-api "$ROOT/api" >/dev/null
docker run -d --name testiq-e2e-api --network $NET --network-alias api \
  -e ALLOWED_ORIGIN=http://site:8000 -e RATE_LIMIT=1000 -e DB_PATH=/tmp/e2e.db testiq-api >/dev/null
docker run -d --name testiq-e2e-site --network $NET --network-alias site -v "$ROOT:/site:ro" -w /site \
  python:3.12-slim python -m http.server 8000 >/dev/null

docker run --rm --network $NET -v "$ROOT/tests/e2e:/e2e" -v "$OUT:/out" -w /e2e \
  mcr.microsoft.com/playwright/python:v1.49.0-noble \
  sh -c "pip install -q --root-user-action=ignore playwright==1.49.0 && python check.py"
