# Terminal AI — Design Documentation

> Master index for all product, architecture, and technical design documents.
> Do not start building without reading these docs in order.

## Document Index

| # | File | Contents |
|---|------|----------|
| 01 | [PRD](./01-prd.md) | Product requirements, goals, personas, feature list |
| 02 | [Architecture](./02-architecture.md) | System topology, service map, infrastructure, open-source stack |
| 03 | [Data Model](./03-data-model.md) | PostgreSQL schema, privacy isolation, GDPR design |
| 04 | [User Flows](./04-user-flows.md) | All screen transitions — user, creator, admin, checkout |
| 05 | [API Gateway](./services/05-api-gateway.md) | Proxy service, credit system, K-model, file uploads, compression |
| 06 | [Deployment Pipeline](./services/06-deployment-pipeline.md) | GitHub CI/CD, Coolify, secrets, app lifecycle |
| 07 | [Optimizer](./services/07-optimizer.md) | Langfuse, behavioral signals, analysis pipeline, prompt A/B testing |
| 08 | [MCP Server](./services/08-mcp-server.md) | MCP tools, vibe-coding scaffolding, auto-configuration |
| 09 | [Security & Privacy](./09-security-privacy.md) | GDPR, data isolation, threat model, auth hardening |
| 10 | [Sharing & OG Images](./10-sharing-og.md) | Social sharing, OG image generation, metadata |

## Key Decisions Log

| Decision | Choice | Reason |
|----------|--------|--------|
| Hosting | Hetzner VPS (Docker Compose) | Cheapest, simplest, €12/mo total |
| Creator apps | Coolify on dedicated VPS 2 | Isolated from platform, self-managed PaaS |
| Auth | Better Auth in Next.js BFF | No separate service, modern, sessions in Redis |
| Billing engine | Lago (self-hosted) | Open source, handles metered + recurring + invoices |
| Checkout UI | Razorpay checkout.js | PCI compliant, native UPI/card, zero effort |
| Observability | Langfuse (self-hosted) | LLM traces, behavioral signals, prompt A/B testing |
| Search | Meilisearch | Fast, typo-tolerant, self-hosted |
| Object storage | MinIO | S3-compatible, self-hosted, free |
| Analytics | Umami | Privacy-first, GDPR-safe, self-hosted |
| Log viewer | Dozzle | Zero-config Docker log aggregation |
| Monitoring | UptimeRobot + Instatus | Free tier, external, zero infra |
| Email | Resend | 3000/mo free, simple API |
| OG images | Satori + resvg-js | JSX→PNG, runs in Next.js BFF, no extra service |
| Malware scan | ClamAV | Open source, Docker, free |
| Compression | Sharp + FFmpeg + Ghostscript | Best-in-class per file type, all open source |
| Secret scanning | Gitleaks | Open source, runs at deploy time |

## Build Order

```
Phase 1 (Foundation):     Infrastructure + Auth + Core Marketplace
Phase 2 (Monetisation):   Billing + Checkout + Subscriptions + Credits
Phase 3 (Deployment):     GitHub CI/CD + Coolify + Deployment Pipeline
Phase 4 (API Gateway):    Proxy + Credit deduction + K-model + File uploads
Phase 5 (Optimizer):      Langfuse + Behavioral signals + Analysis jobs
Phase 6 (MCP):            MCP server + Scaffolding tools
Phase 7 (Polish):         OG images + Sharing + Notifications + Onboarding
```
