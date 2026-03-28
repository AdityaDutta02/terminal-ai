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

# Verify required vars are set
required_vars=(
  POSTGRES_PASSWORD REDIS_PASSWORD BETTER_AUTH_SECRET BETTER_AUTH_URL
  EMBED_TOKEN_SECRET OPENROUTER_API_KEY MEILI_MASTER_KEY
  MINIO_ROOT_USER MINIO_ROOT_PASSWORD
)
for var in "${required_vars[@]}"; do
  if ! grep -q "^${var}=" .env; then
    echo "ERROR: ${var} not set in .env"
    exit 1
  fi
done

echo "==> Creating proxy network (if not exists)..."
docker network create proxy 2>/dev/null || true

echo "==> Pulling images..."
$COMPOSE pull postgres redis traefik meilisearch minio

echo "==> Building application images..."
$COMPOSE build platform gateway deploy-manager mcp-server

echo "==> Starting infrastructure..."
$COMPOSE up -d postgres redis traefik meilisearch minio

echo "==> Waiting for postgres..."
until $COMPOSE exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 2
done
echo "    postgres ready."

echo "==> Running database migrations..."
for migration in platform/lib/db/migrations/*.sql; do
  echo "    applying $migration"
  $COMPOSE exec -T postgres psql -U postgres -d terminalai < "$migration" 2>/dev/null || true
done

echo "==> Waiting for Meilisearch..."
for i in $(seq 1 15); do
  if $COMPOSE exec -T meilisearch curl -sf http://localhost:7700/health > /dev/null 2>&1; then
    echo "    meilisearch ready."
    break
  fi
  sleep 3
done

echo "==> Waiting for MinIO..."
for i in $(seq 1 15); do
  if $COMPOSE exec -T minio curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "    minio ready."
    break
  fi
  sleep 3
done

echo "==> Creating MinIO bucket..."
source .env
$COMPOSE exec -T minio mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null || true
$COMPOSE exec -T minio mc mb local/terminalai --ignore-existing 2>/dev/null || true
$COMPOSE exec -T minio mc anonymous set download local/terminalai 2>/dev/null || true

echo "==> Starting application services..."
$COMPOSE up -d platform gateway deploy-manager mcp-server

echo "==> Waiting for platform..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T platform wget -qO- http://localhost:3000/ > /dev/null 2>&1; then
    echo "    platform ready."
    break
  fi
  sleep 3
done

echo "==> Waiting for gateway..."
for i in $(seq 1 30); do
  if $COMPOSE exec -T gateway wget -qO- http://localhost:3001/health > /dev/null 2>&1; then
    echo "    gateway ready."
    break
  fi
  sleep 3
done

echo "==> Triggering search reindex..."
PLATFORM_URL="http://localhost:3000"
curl -sf -X POST "${PLATFORM_URL}/api/search/reindex" \
  -H "Cookie: $(grep BETTER_AUTH_SECRET .env | cut -d= -f2)" \
  2>/dev/null && echo "    reindex triggered." || echo "    reindex skipped (no admin session)."

echo ""
echo "Terminal AI deployed successfully."
echo "  Platform  : https://terminalai.app"
echo "  Gateway   : https://api.terminalai.app"
echo "  MinIO     : http://localhost:9001 (admin console, internal only)"
echo ""
echo "Post-deploy checklist:"
echo "  1. Verify DNS: terminalai.app -> this VPS IP"
echo "  2. Sign up at https://terminalai.app/signup"
echo "  3. In psql: UPDATE \"user\" SET role = 'admin' WHERE email = 'your@email.com';"
echo "  4. Trigger reindex: POST https://terminalai.app/api/search/reindex (admin session)"
echo "  5. Open an app in the viewer and confirm credits decrement"
