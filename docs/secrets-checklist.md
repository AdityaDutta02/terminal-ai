# Secrets Checklist

## Required Environment Variables

### Platform (Next.js)
- [ ] BETTER_AUTH_SECRET — min 32 chars, random (rotate annually)
- [ ] EMBED_TOKEN_SECRET — min 32 chars, random (rotate if compromised)
- [ ] INTERNAL_SERVICE_TOKEN — min 32 chars, random, shared with deploy-manager
- [ ] CRON_SECRET — min 32 chars, random
- [ ] RAZORPAY_KEY_ID — from Razorpay dashboard
- [ ] RAZORPAY_KEY_SECRET — from Razorpay dashboard (never expose to client)
- [ ] NEXT_PUBLIC_RAZORPAY_KEY_ID — same as RAZORPAY_KEY_ID (safe to expose)
- [ ] DATABASE_URL — postgres connection string
- [ ] REDIS_URL — redis connection string
- [ ] NEXT_PUBLIC_APP_URL — https://terminalai.app
- [ ] DEPLOY_MANAGER_URL — http://deploy-manager:3002
- [ ] LOG_LEVEL — info (production), debug (local)

### Gateway (Hono)
- [ ] OPENROUTER_API_KEY — from OpenRouter
- [ ] EMBED_TOKEN_SECRET — same as platform
- [ ] DATABASE_URL — postgres connection string
- [ ] REDIS_URL — redis connection string

### Deploy Manager (Hono + BullMQ)
- [ ] COOLIFY_URL — Coolify instance URL on VPS2
- [ ] COOLIFY_TOKEN — Coolify API token
- [ ] COOLIFY_SERVER_UUID — from Coolify server settings
- [ ] COOLIFY_PROJECT_UUID — from Coolify project settings
- [ ] GATEWAY_URL — internal URL to gateway service
- [ ] DATABASE_URL — postgres connection string
- [ ] REDIS_HOST — redis hostname
- [ ] REDIS_PASSWORD — redis password
- [ ] INTERNAL_SERVICE_TOKEN — same as platform
- [ ] CLOUDFLARE_TOKEN — optional, for DNS automation
- [ ] CLOUDFLARE_ZONE_ID — optional
- [ ] VPS2_IP — optional

## Rotation Procedure
1. Generate new secret: `openssl rand -base64 32`
2. Update in production environment manager (Docker secrets / .env.production)
3. Redeploy affected services
4. Verify service health after rotation
5. Revoke old secret

## Emergency: Credential Leak
1. Immediately rotate compromised credential
2. Check git history: `git log --all --full-history -- '**/.env*'`
3. If pushed to remote: consider the credential compromised regardless of deletion
4. Notify relevant service provider (Razorpay, Coolify, etc.)
