#!/usr/bin/env bash
# Analiza w Dockerze (bez instalowania Pythona z bibliotekami na serwerze).
#   analysis/run.sh test                                   testy modułów analizy
#   analysis/run.sh report matryce-v1 16 0.125             raport testu z bazy produkcyjnej
#   analysis/run.sh simulate 16 8                          symulacja odtwarzania 2PL
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DB_DIR="$HERE/../deploy/data"
docker build -q -t testiq-analysis "$HERE" >/dev/null
case "${1:-}" in
  test) docker run --rm testiq-analysis ;;
  report)
    # baza tylko do odczytu; kopia, żeby nie przeszkadzać działającemu API
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    docker run --rm -v "$DB_DIR:/data:ro" -v "$tmp:/tmp/out" testiq-api \
      python -c "import sqlite3; s=sqlite3.connect('file:/data/results.db?mode=ro', uri=True); d=sqlite3.connect('/tmp/out/r.db'); s.backup(d)"
    docker run --rm -v "$tmp:/data:ro" testiq-analysis python report.py --db /data/r.db --test "$2" --items "$3" --guess "${4:-0}"
    ;;
  simulate) docker run --rm testiq-analysis python simulate_recovery.py "${2:-16}" "${3:-8}" ;;
  *) sed -n '2,6p' "$0"; exit 1 ;;
esac
