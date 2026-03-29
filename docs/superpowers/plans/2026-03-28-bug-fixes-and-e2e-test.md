# Bug Fixes + End-to-End Platform Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix copy-link clipboard bug and Razorpay "opening but nothing happens" bug, then validate the full platform end-to-end: sign-up → MCP app creation → deployment → payment.

**Architecture:** Two code fixes (clipboard fallback + button error state), one VPS env update (Razorpay keys), followed by a structured manual QA flow through every critical path.

**Tech Stack:** Next.js 16, better-auth, Razorpay, Docker Compose (dev override), MCP server, deploy-manager, Hono gateway.

---

## Files

| File | Change |
|---|---|
| `platform/components/share-button.tsx` | Add HTTPS-check + execCommand fallback for clipboard |
| `platform/app/(marketplace)/account/top-up-button.tsx` | Add error state display when order creation fails |
| `infra/.env` (VPS only) | Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |

---

## Task 1: Fix clipboard copy on HTTP (share-button)

`navigator.clipboard` is only available in secure contexts (HTTPS or localhost). The site is currently served over HTTP at an IP, so `navigator.clipboard` is `undefined` and the copy silently fails.

**Files:**
- Modify: `platform/components/share-button.tsx`

- [ ] **Step 1: Write the failing test**

Add to `platform/components/share-button.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ShareButton } from './share-button'

describe('ShareButton', () => {
  it('exports ShareButton as a function', () => {
    expect(typeof ShareButton).toBe('function')
  })

  it('copies link via execCommand fallback when clipboard API is unavailable', async () => {
    // Simulate HTTP context: clipboard API not available
    const origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    document.execCommand = vi.fn().mockReturnValue(true)

    render(<ShareButton url="http://example.com/test" title="Test" type="channel" />)
    fireEvent.click(screen.getByText('Share'))
    fireEvent.click(screen.getByText('📋 Copy link'))

    // Give async handler time to run
    await new Promise(r => setTimeout(r, 10))
    expect(document.execCommand).toHaveBeenCalledWith('copy')

    // Restore
    if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard)
  })

  it('shows Copied! feedback after successful copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })

    render(<ShareButton url="http://example.com" title="Test" type="app" />)
    fireEvent.click(screen.getByText('Share'))
    fireEvent.click(screen.getByText('📋 Copy link'))

    await screen.findByText('✓ Copied!')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd platform && npx vitest run components/share-button.test.tsx
```

Expected: FAIL — "copies link via execCommand fallback" fails because current code throws on `navigator.clipboard.writeText`

- [ ] **Step 3: Implement the fix**

Replace the `copyLink` function in `platform/components/share-button.tsx`:

```ts
const copyLink = async () => {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
    } else {
      // Fallback for HTTP / non-secure contexts
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch {
    // If both methods fail, still close without crashing
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd platform && npx vitest run components/share-button.test.tsx
```

Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/components/share-button.tsx platform/components/share-button.test.tsx
git commit -m "fix: add clipboard execCommand fallback for HTTP contexts in ShareButton"
```

---

## Task 2: Fix Razorpay button — show error when order creation fails

Currently `handleClick` has no `catch` block. If the API returns a non-OK response (e.g. because keys are empty), the error is swallowed and the button just quietly resets to the price label. The user has no idea what happened.

**Files:**
- Modify: `platform/app/(marketplace)/account/top-up-button.tsx`

- [ ] **Step 1: Add error state and display**

Replace the state declarations and `handleClick` in `platform/app/(marketplace)/account/top-up-button.tsx`:

```tsx
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)

async function handleClick() {
  setLoading(true)
  setError(null)
  try {
    await loadRazorpayScript()
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planCode }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? 'Failed to create order')
    }
    const { orderId, amount } = await res.json() as { orderId: string; amount: number }
    const rzpOpts: Record<string, unknown> = { key: razorpayKeyId, amount, currency: 'INR', order_id: orderId }
    rzpOpts.name = 'Terminal AI'
    rzpOpts.description = `${credits.toLocaleString()} credits`
    rzpOpts.prefill = { email: userEmail, name: userName }
    rzpOpts.theme = { color: '#7c3aed' }
    rzpOpts.handler = () => { router.refresh() }
    const rzp = new window.Razorpay(rzpOpts)
    rzp.open()
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Something went wrong')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 2: Render the error below the button**

In the JSX return, after the closing `</button>` tag, add:

```tsx
{error && (
  <p className="mt-1 text-xs text-red-500">{error}</p>
)}
```

The full return becomes:

```tsx
return (
  <div className="flex flex-col">
    <button
      onClick={handleClick}
      disabled={loading}
      className={`relative rounded-xl border p-4 text-left transition-all hover:border-violet-300 hover:shadow-sm disabled:opacity-60 ${popular ? 'border-violet-300 bg-violet-50' : 'border-gray-200 bg-white'}`}
    >
      {popular && (
        <Badge variant="violet" className="absolute -top-2 left-3">Popular</Badge>
      )}
      <p className="text-lg font-bold text-gray-900">{credits.toLocaleString()}</p>
      <p className="text-xs text-gray-500">credits</p>
      <p className="mt-2 font-semibold text-violet-600">{loading ? 'Opening…' : price}</p>
    </button>
    {error && (
      <p className="mt-1 text-xs text-red-500">{error}</p>
    )}
  </div>
)
```

- [ ] **Step 3: Commit**

```bash
git add platform/app/(marketplace)/account/top-up-button.tsx
git commit -m "fix: show error message in TopUpButton when order creation fails"
```

---

## Task 3: Set Razorpay credentials on VPS and rebuild

The Razorpay keys are empty in the VPS `.env`. Without them `createOrder()` fails with a 401 from Razorpay's API.

**Files:**
- VPS only: `/root/terminal-ai/.env`

- [ ] **Step 1: Get test/live keys from Razorpay Dashboard**

Go to Razorpay Dashboard → Settings → API Keys. Copy:
- `Key ID` → goes into `RAZORPAY_KEY_ID`
- `Key Secret` → goes into `RAZORPAY_KEY_SECRET`
- Webhook secret (Settings → Webhooks) → goes into `RAZORPAY_WEBHOOK_SECRET`

For testing, use **Test Mode** keys (prefix `rzp_test_`).

- [ ] **Step 2: Set keys on VPS**

```bash
ssh root@178.104.124.224
sed -i 's/^RAZORPAY_KEY_ID=.*/RAZORPAY_KEY_ID=rzp_test_YOURKEY/' /root/terminal-ai/.env
sed -i 's/^RAZORPAY_KEY_SECRET=.*/RAZORPAY_KEY_SECRET=YOURSECRET/' /root/terminal-ai/.env
sed -i 's/^RAZORPAY_WEBHOOK_SECRET=.*/RAZORPAY_WEBHOOK_SECRET=YOURWEBHOOKSECRET/' /root/terminal-ai/.env
grep -E "RAZORPAY" /root/terminal-ai/.env   # confirm no blank values
```

- [ ] **Step 3: Push code fixes and pull + restart on VPS**

After committing Tasks 1 and 2 and pushing:

```bash
# On VPS
cd /root/terminal-ai
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.dev.yml build platform
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d platform
docker logs terminal-ai-platform-1 2>&1 | tail -5
# Expected: "✓ Ready in 0ms"
```

- [ ] **Step 4: Verify copy link works**

1. Open `http://178.104.124.224/` in browser
2. Sign up / log in
3. Browse to a channel page → click Share → click "📋 Copy link"
4. Paste into address bar — confirm the URL was copied correctly
5. Confirm "✓ Copied!" feedback appears

- [ ] **Step 5: Verify Razorpay opens**

1. Go to `/account`
2. Click any top-up button
3. Razorpay checkout modal should open with test credentials
4. If it does NOT open, check browser console for error — it will now be visible in the `<p className="text-red-500">` below the button

---

## Task 4: End-to-End — Create and deploy an app via MCP

This tests the full creator flow: MCP server → channel creation → app creation → deployment pipeline.

**Prerequisites:** Tasks 1–3 complete. You have a signed-in account.

- [ ] **Step 1: Create a creator channel via the UI**

1. Log in at `http://178.104.124.224/`
2. Navigate to Creator Dashboard (or `/creator`)
3. Create a new channel (e.g. slug: `test-channel`, name: "Test Channel")
4. Confirm channel appears at `/c/test-channel`

- [ ] **Step 2: Register the MCP server in Claude Desktop**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "terminal-ai": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://178.104.124.224:3003/mcp"]
    }
  }
}
```

Restart Claude Desktop. Confirm "terminal-ai" appears in the tool list.

- [ ] **Step 3: Check MCP server is exposed**

```bash
# On VPS, check mcp-server port
ssh root@178.104.124.224 'ss -tlnp | grep 3003'
# Expected: 0.0.0.0:3003 listening
```

If not exposed, add port mapping to `docker-compose.dev.yml`:

```yaml
services:
  mcp-server:
    ports:
      - '3003:3003'
```

Then:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mcp-server
```

- [ ] **Step 4: Use MCP to create a simple app**

In Claude Desktop, with the MCP server connected, use a prompt like:

```
Using the terminal-ai MCP server, create a new app in the "test-channel" channel.
App name: "Hello World"
Description: "A minimal test app"
Framework: "html"
Content: a simple HTML page that says "Hello from Terminal AI"
```

Confirm the MCP tool call succeeds and the app appears in the creator dashboard.

- [ ] **Step 5: Trigger deployment**

From the creator dashboard, click "Deploy" on the Hello World app.

Check deploy-manager logs:
```bash
ssh root@178.104.124.224 'docker logs terminal-ai-deploy-manager-1 2>&1 | tail -20'
```

Expected: log lines with `deploy_queued` and `deploy_started`.

- [ ] **Step 6: Verify the deployed app is accessible**

Once deployment succeeds, the app should be accessible at the subdomain assigned by the deploy-manager. Check the deployment status in the creator dashboard and open the app URL.

---

## Task 5: End-to-End — Payment flow with small test transaction

**Prerequisites:** Razorpay test keys set (Task 3). Signed-in user account.

- [ ] **Step 1: Open the account credits page**

Navigate to `http://178.104.124.224/account` → Credits tab.

Confirm the current balance is shown (default: 200 credits).

- [ ] **Step 2: Purchase the smallest credit pack**

Click the 500 credits / ₹199 button.

Expected flow:
1. Button shows "Opening…"
2. Razorpay test checkout modal opens
3. Use test card: `4111 1111 1111 1111`, expiry `12/26`, CVV `123`, OTP `1234`
4. Payment succeeds

- [ ] **Step 3: Verify credits updated**

After modal closes:
1. Page should refresh (triggered by `router.refresh()` in the handler)
2. Credit balance should show `700` (200 default + 500 purchased)
3. Credit ledger should show a new `purchase` entry

- [ ] **Step 4: Check webhook was received**

```bash
ssh root@178.104.124.224 'docker logs terminal-ai-platform-1 2>&1 | grep "credits_granted"'
```

Expected: `{"msg":"credits_granted","userId":"...","credits":500,"planCode":"credits_500"}`

- [ ] **Step 5: Check DB ledger directly**

```bash
ssh root@178.104.124.224 \
  'docker exec terminal-ai-postgres-1 psql -U postgres terminalai \
  -c "SELECT * FROM subscriptions.credit_ledger ORDER BY created_at DESC LIMIT 3;"'
```

Expected: row with `delta=500`, `reason='purchase'`.

---

## Self-Review

**Spec coverage:**
- Copy link HTTP fix ✓ (Task 1)
- Razorpay error display ✓ (Task 2)
- Razorpay keys ✓ (Task 3)
- MCP app creation + deployment ✓ (Task 4)
- Payment flow ✓ (Task 5)

**Placeholder scan:** No TBDs. All code blocks are complete. Test card number is real Razorpay test data.

**Type consistency:** `error: string | null`, `loading: boolean` — consistent across Task 2 steps.
