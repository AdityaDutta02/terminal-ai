# Terminal AI — Operational Runbook

## 1. Grant Credits Manually

**Via admin UI** (recommended):
1. Navigate to `/admin/users/{userId}`
2. Click "Grant Credits"
3. Enter amount and reason
4. Submit — creates credit_ledger entry with `type='admin_grant'`

**Via SQL** (emergency):
```sql
INSERT INTO subscriptions.credit_ledger (user_id, amount, type, description, reference_id)
VALUES ('{userId}', {amount}, 'admin_grant', 'Manual grant: {reason}', gen_random_uuid());
```

## 2. Force-Redeploy an App

**Via creator UI**: Creator Dashboard > App > Deployments > Redeploy button.

**Via API**:
```bash
curl -X POST https://terminalai.app/api/creator/apps/{appId}/redeploy \
  -H "Cookie: {session-cookie}"
```

**Via deploy-manager directly** (if platform is down):
```bash
curl -X POST http://localhost:3002/deployments/{deploymentId}/retry \
  -H "Authorization: Bearer ${INTERNAL_SERVICE_TOKEN}"
```

## 3. Rotate Secrets

1. Generate new value: `openssl rand -base64 32`
2. Update in `.env.production` (or Docker secrets)
3. Rolling restart:
   ```bash
   docker compose up -d --no-deps platform
   docker compose up -d --no-deps gateway
   docker compose up -d --no-deps deploy-manager
   ```
4. Verify `/api/status` shows all services operational

For EMBED_TOKEN_SECRET rotation: all existing embed tokens become invalid immediately. Users will get a new token on their next session.

## 4. Investigate Billing Discrepancy

1. Check credit_ledger for the user:
```sql
SELECT * FROM subscriptions.credit_ledger
WHERE user_id = '{userId}'
ORDER BY created_at DESC LIMIT 50;
```

2. Check gateway api_calls:
```sql
SELECT * FROM gateway.api_calls
WHERE user_id = '{userId}'
ORDER BY created_at DESC LIMIT 50;
```

3. Compare: sum of ledger debits should equal sum of api_calls credits_used.

4. If mismatch found, check for failed sessions (session started, gateway error before completion).

## 5. Check Coolify App Health

```bash
# List all apps
curl -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
  ${COOLIFY_URL}/api/v1/applications

# Check specific app
curl -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
  ${COOLIFY_URL}/api/v1/applications/{coolifyAppId}

# Restart app
curl -X POST -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
  ${COOLIFY_URL}/api/v1/applications/{coolifyAppId}/restart
```

## 6. Clear BullMQ Stuck Jobs

```bash
# Access Redis
redis-cli -h ${REDIS_HOST} -a ${REDIS_PASSWORD}

# List stuck jobs
> LRANGE bull:deploys:active 0 -1

# Clear all stuck/failed jobs (use with caution)
> DEL bull:deploys:active
> DEL bull:deploys:failed
```

## 7. Emergency: Disable Anonymous Usage

Set the env var in gateway:

```bash
# In gateway environment:
ALLOW_ANONYMOUS=false

# Restart gateway
docker compose up -d --no-deps gateway
```
