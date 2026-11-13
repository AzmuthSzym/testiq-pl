#!/usr/bin/env bash
# Jak dobrze AI rozwiązuje nasze zadania ze zrzutu ekranu.
#   ai-bench/run.sh render              zrzuty zadań (bez kosztów)
#   ai-bench/run.sh estimate            liczba tokenów i szacowany koszt (bez wysyłania)
#   ai-bench/run.sh submit              wysyła partię do Message Batches API (KOSZTUJE)
#   ai-bench/run.sh collect             pobiera wyniki i pisze wyniki.md
# Klucz: zmienna ANTHROPIC_API_KEY (nie trafia do repozytorium ani do plików).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/ai-bench/out"
mkdir -p "$OUT"

fix_owner() {
  docker run --rm -v "$OUT:/out" python:3.12-slim chown -R "$(id -u):$(id -g)" /out >/dev/null 2>&1 || true
}

case "${1:-}" in
  render)
    NET=testiq-aibench
    cleanup() { docker rm -f testiq-aibench-site >/dev/null 2>&1 || true; docker network rm $NET >/dev/null 2>&1 || true; fix_owner; }
    trap cleanup EXIT
    cleanup
    docker network create $NET >/dev/null
    docker run -d --name testiq-aibench-site --network $NET --network-alias site -v "$ROOT:/site:ro" -w /site \
      python:3.12-slim python -m http.server 8000 >/dev/null
    docker run --rm --network $NET -v "$ROOT/ai-bench:/bench:ro" -v "$OUT:/out" -w /bench \
      mcr.microsoft.com/playwright/python:v1.49.0-noble \
      sh -c "pip install -q --root-user-action=ignore playwright==1.49.0 && python render.py"
    ;;
  estimate|submit|collect)
    if [ -z "${ANTHROPIC_API_KEY:-}" ]; then echo "Brak ANTHROPIC_API_KEY"; exit 1; fi
    trap fix_owner EXIT
    docker run --rm -e ANTHROPIC_API_KEY -v "$ROOT/ai-bench:/bench" -w /bench python:3.12-slim \
      sh -c "pip install -q --root-user-action=ignore 'anthropic>=0.80' && python -I bench.py $1"
    ;;
  *) sed -n 2,7p "$0"; exit 1 ;;
esac
