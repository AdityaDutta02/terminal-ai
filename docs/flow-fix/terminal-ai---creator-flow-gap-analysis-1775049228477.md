
# Creator Flow — Gap Analysis

## Severity Legend
- **P0 — Broken/Blocking:** Creators cannot complete core tasks
- **P1 — Major Friction:** Workflow possible but confusing or risky
- **P2 — Missing Polish:** Expected creator tools absent

---

## P0 — Blocking Gaps

### 1. Two Disconnected Deploy Paths
**Where:** "Deploy via Dashboard" section vs "App Management" section  
**Problem:** Creators have two separate ways to deploy: Dashboard (/dashboard/apps/new) and Creator Studio (/creator/channels/slug/apps/new). These paths don't connect — the Dashboard deploy pipeline (GitHub → Building → Live) is separate from the Creator Studio app form.  
**Impact:** Confusing mental model. Which path should a creator use? Do they produce the same result? Can an app deployed via Dashboard appear in Creator Studio?  
**Fix:** Unify into one deploy flow, or clearly differentiate when to use each (e.g., Dashboard = quick deploy for devs, Creator Studio = full marketplace listing).

### 2. No Build Status Feedback in Creator Studio
**Where:** App Management → App Table  
**Problem:** The Deploy via Dashboard shows Building → Live states, but Creator Studio's App Table only shows "status, credits, sessions" — no build progress, no deploy logs, no real-time status.  
**Impact:** Creator submits an app and has no idea if it's building, failed, or live. They're left guessing.  
**Fix:** Surface deploy status (Building/Failed/Live) in the App Table. Add deploy logs or a status timeline.

### 3. No App Preview or Testing Before Live
**Where:** Deploy pipeline: Building → Live (no staging step)  
**Problem:** Apps go straight from Building to Live (subdomain assigned). No staging environment, no preview, no "test before publish."  
**Impact:** Broken apps go live immediately. Creators can't QA their work. Bad apps reach consumers.  
**Fix:** Add a Staging/Preview state between Building and Live. Allow creators to test in a sandboxed environment before publishing.

---

## P1 — Major Friction

### 4. No App Update or Versioning Flow
**Where:** App Management → App Edit  
**Problem:** "App Edit" exists but there's no versioning, no "push update," no rollback. How does a creator update a live app?  
**Impact:** Creators can't iterate on their apps safely. No way to push fixes or roll back a broken update.  
**Fix:** Add version management: Create New Version → Build → Test → Promote to Live. Keep rollback to previous version.

### 5. No Delete or Archive Flow
**Where:** Channel Management + App Management  
**Problem:** Creators can create channels and apps but there's no path to delete, archive, or unpublish them.  
**Impact:** Dead channels/apps clutter the marketplace. Creators can't clean up experiments or sunset products.  
**Fix:** Add Archive/Delete actions with confirmation states. Archived apps should be hidden from marketplace but restorable.

### 6. No Analytics or Performance Insights
**Where:** Entire Creator flow  
**Problem:** Zero analytics anywhere. No usage stats, no session counts, no credit revenue, no user feedback visibility.  
**Impact:** Creators are flying blind. They can't tell which apps are popular, where users drop off, or how much revenue they're generating.  
**Fix:** Add Analytics tab in Creator Dashboard: sessions over time, credit consumption, active users, ratings.

### 7. No Creator Onboarding or Documentation
**Where:** Access Creator Studio → Creator Dashboard  
**Problem:** New creator lands on Dashboard with no guidance on how to create a channel, add an app, or set up deployment.  
**Impact:** High creator churn. The GitHub repo + branch deploy model is technical — without docs, non-technical creators are lost.  
**Fix:** First-use onboarding flow: "Create your first channel" → "Add your first app" → "Deploy" walkthrough.

---

## P2 — Missing Polish

### 8. No App Pricing or Monetization Controls
**Where:** App Management  
**Problem:** No way for creators to set pricing, credit costs per session, or monetization model for their apps.  
**Impact:** If the marketplace supports paid apps, creators need pricing controls. Currently unclear how app economics work.

### 9. No Notification System for Deploy Events
**Where:** Deploy via Dashboard  
**Problem:** Building → Live has no notification. Creator must manually check.  
**Impact:** Creators polling the dashboard waiting for builds. Email/push notification on build success/failure is expected.

### 10. MCP/Developer API Error Handling Missing
**Where:** Developer API → MCP Connection Guide → Connect Claude/Cursor  
**Problem:** No error state if API key is invalid, MCP connection fails, or tools return errors.  
**Impact:** Developers hitting silent failures with no diagnostic information.

### 11. No Channel Customization
**Where:** Channel Management → Channel Detail  
**Problem:** Channel Detail exists but no indication of what's editable — branding, description, featured apps, ordering.  
**Impact:** Channels all look the same on the consumer side. Creators can't differentiate their brand.
