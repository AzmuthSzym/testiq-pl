#!/usr/bin/env bash
# Wdrożenie i testy Test IQ PL. Wszystko działa w Dockerze (na serwerze nie
# trzeba instalować Pythona, Node ani nginx).
#
#   ./deploy.sh test        testy API (pytest) i testy JS (node --test)
#   ./deploy.sh up          testy, potem budowa i (re)start usług
#   ./deploy.sh cert        pierwsze pobranie certyfikatu (tryb https)
#   ./deploy.sh status      stan usług i odpowiedź /api/health
#   ./deploy.sh backup      kopia bazy teraz (poza codzienną)
#   ./deploy.sh down        zatrzymanie usług (dane zostają)
#
# Konfiguracja: deploy/.env (wzór: deploy/env.example).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$ROOT/deploy"
API_UID=10001

if [[ -f "$DEPLOY/.env" ]]; then
  set -a; source "$DEPLOY/.env"; set +a
fi
NGINX_MODE="${NGINX_MODE:-http}"

compose() {
  local profiles=()
  [[ "$NGINX_MODE" == "https" ]] && profiles=(--profile letsencrypt)
  docker compose -f "$DEPLOY/docker-compose.yml" --project-name testiq "${profiles[@]}" "$@"
}

run_tests() {
  echo "== testy API"
  docker build -q -f "$ROOT/api/Dockerfile.test" -t testiq-api-test "$ROOT/api" >/dev/null
  docker run --rm testiq-api-test
  echo "== testy narzędzi słownictwa"
  docker run --rm -v "$ROOT/vocab:/vocab:ro" python:3.12-slim python /vocab/test_approve.py
  echo "== testy JS"
  docker run --rm -v "$ROOT:/w:ro" -w /w node:22-alpine sh -c 'node --test tests/*.test.js'
}

prepare_dirs() {
  mkdir -p "$DEPLOY/data" "$DEPLOY/backups" "$DEPLOY/certbot/www" "$DEPLOY/certbot/conf"
  # katalogi danych należą do użytkownika kontenera API (bez sudo: przez Dockera)
  docker run --rm -u 0 -v "$DEPLOY/data:/data" -v "$DEPLOY/backups:/backups" testiq-api \
    chown "$API_UID" /data /backups
}

health_url() {
  local bind="${HTTP_BIND:-127.0.0.1:8080}"
  bind="${bind/0.0.0.0/127.0.0.1}"
  echo "http://$bind/api/health"
}

case "${1:-}" in
  test)
    run_tests
    ;;
  up)
    run_tests
    compose build api
    prepare_dirs
    if [[ "$NGINX_MODE" == "https" && ! -d "$DEPLOY/certbot/conf/live/${DOMAIN:-}" ]]; then
      echo "Brak certyfikatu dla '${DOMAIN:-}'. Najpierw: ./deploy.sh cert" >&2
      exit 1
    fi
    compose up -d --remove-orphans
    sleep 3
    "$0" status
    ;;
  cert)
    [[ -n "${DOMAIN:-}" && "${DOMAIN}" != "localhost" ]] || { echo "Ustaw DOMAIN w deploy/.env" >&2; exit 1; }
    prepare_dirs
    # nginx w trybie http obsłuży wyzwanie ACME na porcie 80
    NGINX_MODE=http compose up -d api nginx
    # bez adresu e-mail (nie wysyłamy danych osobowych do Let's Encrypt)
    docker run --rm -v "$DEPLOY/certbot/www:/var/www/certbot" -v "$DEPLOY/certbot/conf:/etc/letsencrypt" \
      certbot/certbot:v3.0.1 certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
      --agree-tos --register-unsafely-without-email --non-interactive
    echo "Certyfikat gotowy. Ustaw NGINX_MODE=https w deploy/.env i uruchom ./deploy.sh up"
    ;;
  status)
    compose ps
    curl -fsS "$(health_url)" && echo " <- /api/health"
    ;;
  backup)
    compose exec backup python -c "from app.backup import backup_once; print(backup_once())"
    ;;
  down)
    compose down
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 1
    ;;
esac
