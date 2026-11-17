#!/usr/bin/env bash
# Wdrożenie i testy Test IQ PL. Wszystko działa w Dockerze (na serwerze nie
# trzeba instalować Pythona, Node ani nginx).
#
#   ./deploy.sh test        testy API (pytest) i testy JS (node --test)
#   ./deploy.sh up          testy, potem budowa i (re)start usług
#   ./deploy.sh cert        pierwsze pobranie certyfikatu (tryby https i cloudflare)
#   ./deploy.sh cf-ips      odświeżenie listy adresów Cloudflare
#   ./deploy.sh status      stan usług i odpowiedź /api/health
#   ./deploy.sh backup      kopia bazy teraz (poza codzienną)
#   ./deploy.sh delete ID   usunięcie wyników uczestnika (prośba e-mailem, RODO)
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
  [[ "$NGINX_MODE" == "https" || "$NGINX_MODE" == "cloudflare" ]] && profiles=(--profile letsencrypt)
  local files=(-f "$DEPLOY/docker-compose.yml")
  [[ "$NGINX_MODE" == "cloudflare" ]] && files+=(-f "$DEPLOY/docker-compose.cloudflare.yml")
  docker compose "${files[@]}" --project-name testiq "${profiles[@]}" "$@"
}

run_tests() {
  echo "== testy API"
  docker build -q -f "$ROOT/api/Dockerfile.test" -t testiq-api-test "$ROOT/api" >/dev/null
  docker run --rm testiq-api-test
  echo "== testy narzędzi słownictwa"
  docker run --rm -v "$ROOT/vocab:/vocab:ro" python:3.12-slim python /vocab/test_approve.py
  echo "== testy analizy"
  "$ROOT/analysis/run.sh" test
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
  # z certyfikatem: przez publiczny adres (w trybie cloudflare serwer odrzuca
  # połączenia spoza Cloudflare, także lokalne)
  if [[ "$NGINX_MODE" != "http" ]]; then echo "https://$DOMAIN/api/health"; return; fi
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
    if [[ "$NGINX_MODE" != "http" && ! -f "$DEPLOY/certbot/conf/renewal/${DOMAIN:-}.conf" ]]; then
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
    echo "Certyfikat gotowy. Ustaw NGINX_MODE=https (albo cloudflare) w deploy/.env i uruchom ./deploy.sh up"
    ;;
  cf-ips)
    v4=$(curl -fsS https://www.cloudflare.com/ips-v4) && v6=$(curl -fsS https://www.cloudflare.com/ips-v6)
    head="# Adresy Cloudflare (https://www.cloudflare.com/ips/). Odświeżanie: ./deploy.sh cf-ips"
    { echo "$head"; for r in $v4 $v6; do echo "$r 1;"; done; } > "$DEPLOY/nginx/cloudflare-ips.conf"
    { echo "$head"; for r in $v4 $v6; do echo "set_real_ip_from $r;"; done; } > "$DEPLOY/nginx/cloudflare-realip.conf"
    echo "Zapisano $(echo $v4 $v6 | wc -w) zakresów. Przeładowanie: ./deploy.sh up"
    ;;
  status)
    compose ps
    curl -fsS "$(health_url)" && echo " <- /api/health"
    ;;
  backup)
    compose exec backup python -c "from app.backup import backup_once; print(backup_once())"
    ;;
  delete)
    id="${2:-}"
    [[ "$id" =~ ^[A-Za-z0-9-]{8,64}$ ]] || { echo "Użycie: ./deploy.sh delete <identyfikator uczestnika>" >&2; exit 1; }
    compose exec -T api python -c "import sys; from app.db import Database; print('Usunięte wyniki:', Database('/data/results.db').delete_participant(sys.argv[1]))" "$id"
    echo "Statystyki odświeżą się w ciągu minuty. Z kopii zapasowych wynik zniknie po ${KEEP_DAYS:-14} dniach."
    ;;
  down)
    compose down
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 1
    ;;
esac
