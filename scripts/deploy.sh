#!/usr/bin/env bash
# Terminal AI — VPS deploy script
# Usage: ./scripts/deploy.sh
set -euo pipefail

COMPOSE="docker compose"

echo "==> Checking .env..."
if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example and fill in values."
  exit 1
fi

echo "==> Creating proxy network (if not exists)..."
docker network create proxy 2>/dev/null || true

echo "==> Pulling images..."
$COMPOSE pull postgres redis traefik

echo "==> Building application images..."
$COMPOSE build platform gateway

echo "==> Starting infrastructure..."
$COMPOSE up -d postgres redis traefik

echo "==> Waiting for postgres to be healthy..."
until $COMPOSE exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 2
done
echo "    postgres ready."

echo "==> Starting application services..."
$COMPOSE up -d platform gateway

echo "==> Waiting for platform health..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T platform wget -qO- http://localhost:3000/ > /dev/null 2>&1; then
    echo "    platform ready."
    break
  fi
  sleep 2
done

echo "==> Waiting for gateway health..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T gateway wget -qO- http://localhost:3001/health > /dev/null 2>&1; then
    echo "    gateway ready."
    break
  fi
  sleep 2
done

echo ""
echo "Terminal AI deployed."
echo "  Platform : https://terminalai.app"
echo "  Gateway  : https://api.terminalai.app"
echo ""
echo "Next steps:"
echo "  1. Verify DNS: terminalai.app -> this VPS IP"
echo "  2. Sign up at https://terminalai.app/signup"
echo "  3. Open https://terminalai.app/c/first-channel/first-app"
echo "  4. Click Launch -- confirm iframe loads and credits decrement"
