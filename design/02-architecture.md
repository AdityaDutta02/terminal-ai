# Terminal AI — System Architecture

**Version:** 1.0
**Date:** 2026-03-27

---

## 1. Infrastructure Layout

```
INTERNET
    │
    ▼
Cloudflare (DNS + DDoS + asset CDN — free tier)
    │
    ├──▶ terminalai.app              → VPS 1: Platform Server
    ├──▶ api.terminalai.app          → VPS 1: API Gateway
    ├──▶ mcp.terminalai.app          → VPS 1: MCP Server
    ├──▶ admin.terminalai.app        → VPS 1: Platform (IP-allowlisted route)
    ├──▶ status.terminalai.app       → Instatus (external, free)
    └──▶ *.apps.terminalai.app       → VPS 2: Coolify (creator apps)
```

---

## 2. VPS 1 — Platform Server

**Spec:** Hetzner CX22 — 4 vCPU, 8GB RAM, 80GB SSD — ~€6/mo
**Location:** Nuremberg, Germany (EU, GDPR compliant)
**Orchestration:** Docker Compose + Traefik v3

### Services

```
┌────────────────────────────────────────────────────────────┐
│  Traefik v3                                                │
│    - Reverse proxy + automatic SSL (Let's Encrypt)         │
│    - Per-IP rate limiting (200 req/min)                    │
│    - Admin panel on separate subdomain (IP allowlist)      │
├──────────────────── Core Services ─────────────────────────┤
│  platform        Next.js 16 (BFF + Frontend)      :3000   │
│  api-gateway     Hono on Bun (proxy + credits)    :3001   │
│  deploy-manager  Fastify (GitHub + Coolify)       :3002   │
│  webhook-proc    Hono (Razorpay + Lago sync)      :3003   │
│  mcp-server      Node.js MCP SDK                  :3004   │
│  compression     Sharp + FFmpeg + Ghostscript     :3005   │
├──────────────────── Data Layer ─────────────────────────────┤
│  postgres        PostgreSQL 16                    :5432   │
│  pgbouncer       Connection pooler                :5433   │
│  redis           Redis 7 (cache + BullMQ)         :6379   │
│  minio           MinIO (object storage)           :9000   │
├──────────────────── Platform Services ──────────────────────┤
│  lago            Lago (billing engine)            :3010   │
│  langfuse        Langfuse + worker                :3011   │
│  meilisearch     Search                           :7700   │
│  clamav          ClamAV (malware scanner)         :3310   │
│  umami           Umami (analytics)                :3012   │
│  dozzle          Docker log viewer (admin-only)   :8080   │
│  backup-cron     pg_dump + mc mirror              (cron)  │
└────────────────────────────────────────────────────────────┘
```

### Internal Network
All services communicate on a private Docker bridge network (`terminal-ai-net`).
No service is directly reachable from the internet except through Traefik.
PostgreSQL and Redis are never exposed externally.

---

## 3. VPS 2 — Compute Server

**Spec:** Hetzner CX21 — 2 vCPU, 4GB RAM, 40GB SSD — ~€4/mo
**Location:** Nuremberg, Germany (same region as VPS 1)
**Network:** Hetzner private network connects VPS 1 ↔ VPS 2 (no public traffic between them)

```
┌────────────────────────────────────────────────────────────┐
│  Coolify (self-hosted PaaS)                                │
│    - Manages Docker containers for each creator app        │
│    - Traefik instance for per-app SSL + subdomains         │
│    - GitHub webhook receiver for auto-deployments          │
│    - Health checks + restart policies                      │
│                                                            │
│  creator-app-slug-1  → app1.apps.terminalai.app           │
│  creator-app-slug-2  → app2.apps.terminalai.app           │
│  creator-app-slug-N  → appN.apps.terminalai.app           │
│                                                            │
│  Isolated Docker network per app (no inter-app traffic)    │
│  No route to VPS 1 internal network from app containers    │
└────────────────────────────────────────────────────────────┘
```

---

## 4. External Services (Free Tier)

| Service | Purpose | Cost |
|---------|---------|------|
| Cloudflare | DNS, DDoS protection, asset CDN | Free |
| UptimeRobot | Health monitoring (50 monitors, 5min checks) | Free |
| Instatus | Public status page | Free |
| Telegram Bot | Admin alerts (instant push) | Free |
| Resend | Transactional email (3000/mo) | Free |
| Hetzner Object Storage | PostgreSQL + MinIO backups | ~€2/mo |

**Total infrastructure cost: ~€12/mo**

---

## 5. Service Communication Map

```
Browser
  │
  ├──▶ terminalai.app (Traefik → platform:3000)
  │      Next.js BFF handles: auth, page rendering, aggregation
  │      Calls internally: api-gateway, deploy-manager, lago, meilisearch
  │
  ├──▶ api.terminalai.app (Traefik → api-gateway:3001)
  │      Receives: API proxy calls from creator app iframes (via embed token)
  │      Calls externally: OpenRouter, Groq, RapidAPI, Tavily, Apify
  │      Calls internally: postgres (via pgbouncer), redis, minio, langfuse, clamav
  │
  └──▶ mcp.terminalai.app (Traefik → mcp-server:3004)
         Receives: MCP tool calls from vibe-coding agents
         Calls internally: platform BFF, deploy-manager

platform:3000
  ├──▶ pgbouncer:5433 → postgres:5432
  ├──▶ redis:6379
  ├──▶ lago:3010 (subscription queries)
  ├──▶ meilisearch:7700 (search)
  └──▶ deploy-manager:3002 (deployment triggers)

webhook-proc:3003
  ├──▶ pgbouncer:5433 (idempotency checks + subscription updates)
  ├──▶ lago:3010 (activate/update subscriptions)
  └──▶ redis:6379 (BullMQ job queue)

deploy-manager:3002
  ├──▶ VPS 2 Coolify API (via Hetzner private network)
  ├──▶ pgbouncer:5433
  ├──▶ minio:9000 (build artifacts)
  └──▶ redis:6379 (BullMQ — deploy jobs)
```

---

## 6. Open-Source Stack Reference

| Layer | Tool | Version | Repo |
|-------|------|---------|------|
| Framework | Next.js | 16 | nextjs.org |
| API services | Hono / Fastify | latest | hono.dev |
| Auth | Better Auth | latest | better-auth.com |
| Billing | Lago | latest | github.com/getlago/lago |
| Reverse proxy | Traefik | v3 | traefik.io |
| Object storage | MinIO | latest | min.io |
| Search | Meilisearch | latest | meilisearch.com |
| LLM observability | Langfuse | latest | langfuse.com |
| Analytics | Umami | latest | umami.is |
| App hosting | Coolify | latest | coolify.io |
| Job queue | BullMQ on Redis | latest | bullmq.io |
| Log viewer | Dozzle | latest | dozzle.dev |
| Malware scan | ClamAV | stable | clamav.net |
| Image compress | Sharp | latest | sharp.pixelplumbing.com |
| Video compress | FFmpeg | latest | ffmpeg.org |
| PDF compress | Ghostscript | latest | ghostscript.com |
| Secret scan | Gitleaks | latest | github.com/gitleaks/gitleaks |
| OG images | Satori + resvg-js | latest | github.com/vercel/satori |
| Connection pool | PgBouncer | latest | pgbouncer.org |

---

## 7. Deployment & Backup Strategy

### Deployment
- All VPS 1 services: single `docker compose up -d` from the monorepo root
- Environment variables: `.env` file on VPS (never in git), managed via SSH
- Updates: `git pull → docker compose pull → docker compose up -d --no-deps <service>`
- Zero-downtime for stateless services (Traefik handles graceful drain)

### Backups
- **PostgreSQL:** `pg_dump` daily → gzip → upload to Hetzner Object Storage
  - Retention: 7 daily, 4 weekly, 3 monthly
- **MinIO:** `mc mirror` hourly → Hetzner Object Storage (incremental)
- **Redis:** RDB snapshot daily (non-critical, sessions are ephemeral)
- **Restore drill:** documented runbook, tested monthly

### Monitoring & Alerting
- UptimeRobot monitors all public endpoints every 5 minutes
- Telegram bot receives immediate alerts on any downtime
- Instatus auto-updates from UptimeRobot webhooks
- Dozzle provides live log tailing for all containers (admin-only)
