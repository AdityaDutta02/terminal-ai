# VPS Migration Checklist

## Prerequisites
- VPS1: runs platform, mcp-server, deploy-manager, postgres, redis via Docker Compose
- VPS2: new server, will run Coolify to host deployed apps

---

## 1. Apply DB migrations on VPS1

SSH into VPS1:

```bash
# Copy migration files to postgres container
docker cp platform/lib/db/migrations/002_credit_ledger.sql postgres:/tmp/
docker cp platform/lib/db/migrations/003_creator_ownership.sql postgres:/tmp/
docker cp platform/lib/db/migrations/004_audit_log.sql postgres:/tmp/
docker cp platform/lib/db/migrations/005_deployments.sql postgres:/tmp/
docker cp platform/lib/db/migrations/006_optimizer_mcp.sql postgres:/tmp/

# Run migrations in order
docker exec -it postgres psql -U terminalai -d terminalai -f /tmp/002_credit_ledger.sql
docker exec -it postgres psql -U terminalai -d terminalai -f /tmp/003_creator_ownership.sql
docker exec -it postgres psql -U terminalai -d terminalai -f /tmp/004_audit_log.sql
docker exec -it postgres psql -U terminalai -d terminalai -f /tmp/005_deployments.sql
docker exec -it postgres psql -U terminalai -d terminalai -f /tmp/006_optimizer_mcp.sql
```

---

## 2. Set VPS1 environment variables

Add to platform `.env` (restart platform service after):
```
INTERNAL_SERVICE_TOKEN=<generate: openssl rand -hex 32>
DEPLOY_MANAGER_URL=http://deploy-manager:4000
```

Add to mcp-server `.env` (restart mcp-server after):
```
PLATFORM_URL=http://platform:3000
INTERNAL_SERVICE_TOKEN=<same value as platform>
```

Add to deploy-manager `.env` (restart deploy-manager after):
```
COOLIFY_URL=http://<VPS2_IP>:8000
COOLIFY_TOKEN=<from Coolify → API → Tokens — set up in step 4>
VPS2_IP=<your VPS2 public IP>
CLOUDFLARE_ZONE_ID=<Cloudflare Dashboard → terminalai.app → Overview → Zone ID>
CLOUDFLARE_API_TOKEN=<Cloudflare API token with DNS:Edit scope>
INTERNAL_SERVICE_TOKEN=<same value as platform>
APP_DOMAIN=apps.terminalai.app
```

---

## 3. Install Coolify on VPS2

SSH into VPS2:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Install Coolify
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

After install:
- Open `http://<VPS2_IP>:8000` in a browser
- Complete the Coolify setup wizard (create admin account)
- Go to: Settings → API → Tokens → Create token
- Copy the token → paste into VPS1 deploy-manager `.env` as `COOLIFY_TOKEN`

---

## 4. Configure wildcard DNS in Cloudflare

Add a DNS record in Cloudflare for terminalai.app:
- **Type:** A
- **Name:** `*.apps`  (this creates *.apps.terminalai.app)
- **Content:** `<VPS2_IP>`
- **Proxy status:** DNS only (gray cloud)
- **TTL:** Auto

In Coolify: Settings → Instance → set the wildcard domain to `apps.terminalai.app`

---

## 5. Restart all services on VPS1

```bash
cd /opt/terminal-ai
docker compose restart platform mcp-server deploy-manager
```

Verify services are healthy:
```bash
docker compose ps
curl -s http://localhost:3000/api/health  # platform
curl -s http://localhost:3003/health      # mcp-server (if health route exists)
```
