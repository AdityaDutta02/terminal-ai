#!/usr/bin/env bash
# Terminal AI — IP-based test deploy (no domain, no TLS)
# Usage: ./scripts/test-deploy.sh
set -euo pipefail

COMPOSE="docker compose -f docker-compose.test.yml"

echo "==> Checking .env..."
if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example and fill in values."
  echo "       Set BETTER_AUTH_URL=http://<your-server-ip>:3000"
  exit 1
fi

echo "==> Building images..."
$COMPOSE build platform gateway

echo "==> Starting services..."
$COMPOSE up -d

echo "==> Waiting for postgres..."
until $COMPOSE exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 2
done
echo "    postgres ready."

echo "==> Waiting for platform (port 3000)..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo "    platform ready."
    break
  fi
  sleep 3
done

echo "==> Waiting for gateway (port 3001)..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "    gateway ready."
    break
  fi
  sleep 2
done

SERVER_IP=$(curl -sf https://ipv4.icanhazip.com 2>/dev/null || echo "<server-ip>")

echo ""
echo "Terminal AI running."
echo "  Platform : http://${SERVER_IP}:3000"
echo "  Gateway  : http://${SERVER_IP}:3001/health"
echo ""
echo "Smoke test:"
echo "  1. Open http://${SERVER_IP}:3000/signup"
echo "  2. Sign up — check you get 200 credits"
echo "  3. Open http://${SERVER_IP}:3000/c/first-channel/first-app"
echo "  4. Click Launch — iframe should load, credits should drop"
echo ""
echo "Logs: docker compose -f docker-compose.test.yml logs -f"
