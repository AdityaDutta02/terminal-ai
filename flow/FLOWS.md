# Terminal AI — User Flows

> **Purpose**: This document maps every user-facing flow in the Terminal AI platform, organized by role. Each step references a screenshot by filename (in `screenshots/`) so a UX analysis agent can review the visual state at every point.
>
> **Screenshot naming convention**: `{role}-{flow}-{step}.png`
> Example: `user-auth-01-signup.png`

---

## Table of Contents

- [1. Consumer User Flow](#1-consumer-user-flow)
  - [1.1 Discovery (Unauthenticated)](#11-discovery-unauthenticated)
  - [1.2 Authentication](#12-authentication)
  - [1.3 Browsing & Launching Apps](#13-browsing--launching-apps)
  - [1.4 Using an App (Viewer Shell)](#14-using-an-app-viewer-shell)
  - [1.5 Account Management](#15-account-management)
  - [1.6 Purchasing Credits / Subscriptions](#16-purchasing-credits--subscriptions)
- [2. Creator Flow](#2-creator-flow)
  - [2.1 Accessing Creator Studio](#21-accessing-creator-studio)
  - [2.2 Creating a Channel](#22-creating-a-channel)
  - [2.3 Adding an App to a Channel](#23-adding-an-app-to-a-channel)
  - [2.4 Deploying via Dashboard](#24-deploying-via-dashboard)
  - [2.5 Managing Apps](#25-managing-apps)
  - [2.6 Developer API (MCP)](#26-developer-api-mcp)
- [3. Super Admin Flow](#3-super-admin-flow)
  - [3.1 Admin Overview](#31-admin-overview)
  - [3.2 User Management](#32-user-management)
  - [3.3 Channel Management](#33-channel-management)
  - [3.4 App Management](#34-app-management)

---

## 1. Consumer User Flow

These are the flows for regular end-users who discover, browse, and use AI apps.

### 1.1 Discovery (Unauthenticated)

The user lands on the public marketplace. No login required.

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/` | **Marketplace homepage**: Hero section with "Discover AI-powered apps" heading, search bar, pricing summary (3 plan cards: Starter ₹149, Creator ₹299, Pro ₹599), and a grid of channel cards with avatar, name, slug, description, app count. Filter pills (All / Popular / New) appear above the grid. | `user-discovery-01-homepage.png` |
| 2 | `/` | **Navbar (logged out)**: Terminal AI logo (violet zap icon + "Terminal AI" text), "Sign in" ghost button, "Get started" primary button. | `user-discovery-02-navbar-loggedout.png` |
| 3 | `/c/{channelSlug}` | **Channel page**: Back arrow to "All channels", channel banner image (if set), avatar, name, slug, description, app count badge, share button. Below: grid of app cards showing thumbnail (or gradient placeholder), app name, description, credits per session. | `user-discovery-03-channel-page.png` |
| 4 | `/c/{channelSlug}/{appSlug}` | **App detail page**: Back arrow to channel, large thumbnail, "AI App" badge, share button, app name, channel name, description, credits-per-session callout, and a "Sign in to launch" button (since not logged in). Below that: "New users get 20 free credits after email verification." | `user-discovery-04-app-detail-loggedout.png` |

**Flow diagram:**
```
Homepage (/) --> Channel Page (/c/slug) --> App Detail (/c/slug/app)
                                                  |
                                          [Sign in to launch]
                                                  |
                                          Login (/login?next=/viewer/...)
```

---

### 1.2 Authentication

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/signup` | **Signup page**: Violet zap logo, "Create your account" heading, 3 green-check perks ("20 free credits after email verification", "Access to all AI apps", "No credit card required"). Form: Full name, Email, Password (min 10 chars). CTA: "Create account". Link to sign in. | `user-auth-01-signup.png` |
| 2 | `/verify-email?email=...` | **Verify email page**: Envelope icon in violet circle, "Check your inbox" heading, shows the email address, "Verify your email to receive 20 free credits and start using Terminal AI apps." Link to try signing up again. | `user-auth-02-verify-email.png` |
| 3 | `/login` | **Login page**: Violet zap logo, "Welcome back" heading, "Sign in to your Terminal AI account". Form: Email, Password. CTA: "Sign in". Link to signup. Supports `?next=` redirect param. | `user-auth-03-login.png` |
| 4 | `/login` | **Login error state**: Red error banner below form fields showing the error message. | `user-auth-04-login-error.png` |

**Flow diagram:**
```
Signup (/signup)
    |
    v
Verify Email (/verify-email?email=...)
    |
    [User clicks email link]
    |
    v
Login (/login) --> Redirect to ?next or /
```

---

### 1.3 Browsing & Launching Apps

After logging in, the navbar changes and the user can launch apps.

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/` | **Navbar (logged in)**: Credits pill (shows balance, turns amber when low), user dropdown trigger (violet avatar circle + name + chevron). | `user-browse-01-navbar-loggedin.png` |
| 2 | — | **User dropdown menu**: Name + email header, "Account & Credits", "Developer API", "Creator Dashboard" (if creator/admin role), "Admin Panel" (if admin role), "Sign out" in red. | `user-browse-02-navbar-dropdown.png` |
| 3 | `/c/{channelSlug}/{appSlug}` | **App detail (logged in)**: Same as discovery step 4, but instead of "Sign in to launch" it shows a primary "Open app" button linking to `/viewer/{channelSlug}/{appSlug}`. | `user-browse-03-app-detail-loggedin.png` |

**Flow diagram:**
```
Homepage (/) --> Channel (/c/slug) --> App Detail (/c/slug/app)
                                              |
                                        [Open app]
                                              |
                                       Viewer (/viewer/slug/app)
```

---

### 1.4 Using an App (Viewer Shell)

The viewer shell is a full-screen experience with a dark theme. It embeds the deployed app in an iframe.

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/viewer/{channelSlug}/{appSlug}` | **Deploying state**: Full-screen dark bg, top bar with X (close, links to `/c/{channelSlug}`), app name, "Deploying..." spinner + text. Center: large violet spinner, "Your app is deploying", "This usually takes 2-5 minutes. This page will update automatically." | `user-viewer-01-deploying.png` |
| 2 | `/viewer/{channelSlug}/{appSlug}` | **Loading state**: Top bar shows "Connecting..." spinner. Content area shows a skeleton pulse (gray bars). The iframe is being loaded in the background. | `user-viewer-02-loading.png` |
| 3 | `/viewer/{channelSlug}/{appSlug}` | **Ready state**: Top bar: X close button, app name, credits pill (dark variant, shows balance), violet user avatar initial. The iframe fills the entire content area below the bar. | `user-viewer-03-ready.png` |
| 4 | `/viewer/{channelSlug}/{appSlug}` | **Deploy failed state**: Red alert circle icon, "Deployment failed", error message text. | `user-viewer-04-deploy-failed.png` |
| 5 | `/viewer/{channelSlug}/{appSlug}` | **Error state**: Red alert circle, "Unable to load app", error message, "Try again" button, and "Retry" button in top bar. | `user-viewer-05-error.png` |
| 6 | — | **Session expiry toast**: Toast notification: "Session expiring soon — Your session will expire in 2 minutes." with an "Extend" action button. Appears at the 13-minute mark of a 15-minute token. | `user-viewer-06-session-toast.png` |

**State machine:**
```
                    [iframe_url exists]
                          |
            deploying --> loading --> ready
               |             |          |
               v             v          |
          deploy_failed    error   [auto token refresh every 12 min]
                             |
                         [Retry] --> loading
```

**Token flow (invisible to user):**
```
Viewer Shell fetches embed token from /api/embed-token
    |
    v
Delivers token to iframe via postMessage({ type: 'TERMINAL_AI_TOKEN', token })
    |
    v
App receives token via window.addEventListener('message')
    |
    v
App uses token as Bearer auth when calling Terminal AI Gateway
    |
    v
Token auto-refreshes every 12 minutes via viewer shell
    |
    v
If app loads late, it sends TERMINAL_AI_READY and viewer re-delivers token
```

---

### 1.5 Account Management

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/account` | **Account page — Credits tab** (default): Header with "Account" title, email, credits pill. Tabs: "Credits" / "Security". Credits tab shows: large balance number, separator, transaction ledger (last 50 entries) with green up-arrow for additions and gray down-arrow for deductions, each with reason label, timestamp, delta, and balance-after. Below: "Get More Credits" section with 3 top-up package buttons. | `user-account-01-credits.png` |
| 2 | `/account` | **Account page — Security tab**: "Change Password" card with password form. | `user-account-02-security.png` |

---

### 1.6 Purchasing Credits / Subscriptions

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/pricing` | **Pricing page**: Back arrow to marketplace, "Simple, transparent pricing" heading, "Subscribe for a monthly credit allowance, or buy credits as you go." Free credits callout banner (violet): "New users receive 20 free credits after email verification." 3 subscription cards (Starter ₹149/250 credits, Creator ₹299/650 credits with "Popular" badge, Pro ₹599/1400 credits). 3 credit pack cards for one-time purchases. Auth-aware CTAs (login redirect if not signed in). | `user-pricing-01-page.png` |
| 2 | — | **Razorpay checkout modal**: Overlay from Razorpay SDK with payment form (UPI, cards, net banking). Prefilled with user email and name. | `user-pricing-02-razorpay-modal.png` |
| 3 | `/account` | **After purchase**: Redirected to account page, ledger shows new credit addition. | `user-pricing-03-post-purchase.png` |

---

## 2. Creator Flow

Creators are users with `role = 'creator'` or `role = 'admin'`. They can create channels, add apps, and manage deployments. The Creator Studio has its own layout with a dedicated header.

### 2.1 Accessing Creator Studio

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | — | **Navbar dropdown**: "Creator Dashboard" menu item is visible (only for creator/admin roles). | `creator-access-01-dropdown.png` |
| 2 | `/creator` | **Creator layout header**: "Terminal AI" logo in violet, pipe separator, "Creator Studio" label. Nav links: "Dashboard", "New channel" button (violet). | `creator-access-02-layout.png` |

**Access control**: The `/creator` layout checks `session.user.role`. If not `creator` or `admin`, redirects to `/?error=not_creator`.

---

### 2.2 Creating a Channel

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/creator` | **Creator dashboard (empty)**: "Your channels" heading, dashed-border empty state with Layers icon, "No channels yet — Create your first channel to start publishing AI apps", "Create channel" button. | `creator-channel-01-empty.png` |
| 2 | `/creator/channels/new` | **New channel form**: Back link to dashboard, "Create a channel" heading, "A channel groups your AI apps under one brand". Card form: Channel name, URL slug (with `terminalai.app/c/` prefix), Description. Cancel + "Create channel" buttons. | `creator-channel-02-new-form.png` |
| 3 | `/creator` | **Creator dashboard (with channels)**: Grid of channel cards showing name, slug, description (line-clamped), app count, session count. Each card links to its channel detail page. | `creator-channel-03-dashboard.png` |

**Flow diagram:**
```
Creator Dashboard (/creator)
    |
    [New channel]
    |
    v
New Channel Form (/creator/channels/new)
    |
    [Create channel]
    |
    v
Channel Detail (/creator/channels/{slug})
```

---

### 2.3 Adding an App to a Channel

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/creator/channels/{slug}` | **Channel detail page**: Back link to dashboard, channel name + slug, "New app" button. Empty state: "No apps yet — Add your first AI app to this channel". | `creator-app-01-channel-empty.png` |
| 2 | `/creator/channels/{slug}/apps/new` | **New app form**: Back link to channel, "Add an app" heading, "Connect your AI app via an embed URL". Card form: App name, URL slug, Embed URL (with hint "Your app will be embedded in an iframe inside the viewer"), Description, Credits per session (number, min 1, max 10000, default 50). Cancel + "Create app" buttons. | `creator-app-02-new-form.png` |
| 3 | `/creator/channels/{slug}` | **Channel detail (with apps)**: Table with columns: App (name + description), Status (colored badge: live/pending/suspended), Credits, Sessions count, Edit link. | `creator-app-03-channel-with-apps.png` |

**Flow diagram:**
```
Channel Detail (/creator/channels/{slug})
    |
    [New app]
    |
    v
New App Form (/creator/channels/{slug}/apps/new)
    |
    [Create app]
    |
    v
Channel Detail (app now in table)
```

---

### 2.4 Deploying via Dashboard

There is a separate deploy flow accessible from the user dashboard (not the creator studio).

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/dashboard` | **User dashboard**: Dark theme. Header: "Dashboard" + "Deploy New App" violet button. Credits card (balance + "Buy Credits" link), Subscription card (plan name + renewal date, or "Subscribe" link). Recent Activity section (last 5 embed token sessions with app name, relative timestamp, credits deducted). Your Apps section (app cards with name, subdomain, deploy status badge: live/building/pending/failed). | `creator-deploy-01-dashboard.png` |
| 2 | `/dashboard/apps/new` | **Deploy new app form**: Dark theme. "Deploy New App" heading. Form: App Name, Description, GitHub Repo (owner/repo format), Branch (default: main), Channel (dropdown of user's channels). "Deploy App" button. | `creator-deploy-02-new-form.png` |

**Flow diagram:**
```
Dashboard (/dashboard)
    |
    [Deploy New App]
    |
    v
Deploy Form (/dashboard/apps/new)
    |
    [Deploy App]  --> POST /api/creator/apps
    |
    v
Dashboard (app appears with "building" status)
    |
    [Deploy manager builds + deploys on VPS2 via Coolify]
    |
    v
Dashboard (app status changes to "live" with subdomain)
```

---

### 2.5 Managing Apps

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/creator/channels/{slug}` | **App table**: Click "Edit" link on any app row to manage it. | `creator-manage-01-app-table.png` |

---

### 2.6 Developer API (MCP)

Creators can also deploy apps programmatically using the MCP server or REST API.

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/developers` | **Developer API page**: "Developer API" badge, "Build apps with your AI editor" heading. MCP Server info card (Transport: Streamable HTTP, Endpoint, Auth: Bearer key, Available Tools). | `creator-api-01-mcp-info.png` |
| 2 | `/developers` | **API Keys section**: "Generate keys to authenticate your MCP client." Key management UI (create/delete keys). | `creator-api-02-keys.png` |
| 3 | `/developers` | **Getting Started guide**: Step-by-step MCP connection instructions for Claude, Cursor, and other editors. | `creator-api-03-guide.png` |
| 4 | `/developers` | **API Reference section**: REST endpoint documentation. | `creator-api-04-reference.png` |

**Flow diagram:**
```
Navbar dropdown --> Developer API (/developers)
    |
    [Create API key]
    |
    v
Configure MCP client with key + endpoint
    |
    v
Use MCP tools: scaffold_app, create_channel, deploy_app, etc.
```

---

## 3. Super Admin Flow

Admin users (role = `admin`) have access to a dedicated admin panel with a dark theme. The admin layout has its own header with red "Admin" badge.

### 3.1 Admin Overview

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/admin` | **Admin overview**: Dark theme (gray-950 bg). "Overview" heading. 5 stat cards in a row: Users, Channels, Apps, Sessions, Credits granted — each showing a large number. Quick actions section: "Manage channels", "Manage apps", "Manage users" link buttons + "Reindex search" violet button (form POST to /api/search/reindex). | `admin-overview-01-dashboard.png` |

**Access control**: Admin layout checks `session.user.role === 'admin'`. Non-admins are redirected to `/?error=forbidden`.

---

### 3.2 User Management

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/admin/users` | **Users table**: Dark theme. "Users" heading. Table with columns: User (name + email), Role (colored badge: admin=red, creator=violet, user=gray), Credits, Joined date, "Manage" link. Shows up to 200 users, sorted by newest first. | `admin-users-01-list.png` |
| 2 | `/admin/users/{userId}` | **User detail/edit page**: (reached via "Manage" link). Allows role changes, credit adjustments. | `admin-users-02-detail.png` |

---

### 3.3 Channel Management

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/admin/channels` | **Channels table**: Dark theme. "Channels" heading. Table: Channel (name + slug), Creator (email), Status (active=green, other=red badge), Apps count, "View" link (opens public channel page in new tab). Up to 200 channels. | `admin-channels-01-list.png` |

---

### 3.4 App Management

| Step | URL | What the user sees | Screenshot |
|------|-----|--------------------|------------|
| 1 | `/admin/apps` | **Apps table**: Dark theme. "Apps" heading. Table: App (name + slug), Channel name, Status (live=green, pending=yellow, suspended=red badge), Credits per session, "Edit" link. Up to 200 apps. | `admin-apps-01-list.png` |
| 2 | `/admin/apps/{appId}` | **App edit page**: (reached via "Edit" link). Allows status changes, credit adjustments, suspension. | `admin-apps-02-detail.png` |

---

## Appendix: Complete Route Map

### Public Routes (no auth required)
| Route | Page | Theme |
|-------|------|-------|
| `/` | Marketplace homepage | Light |
| `/c/{channelSlug}` | Channel page | Light |
| `/c/{channelSlug}/{appSlug}` | App detail page | Light |
| `/pricing` | Pricing & subscriptions | Light |
| `/signup` | Create account | Light |
| `/verify-email` | Email verification prompt | Light |
| `/login` | Sign in | Light |

### Authenticated Routes (login required)
| Route | Page | Theme | Min Role |
|-------|------|-------|----------|
| `/account` | Account & credits | Light | user |
| `/dashboard` | User dashboard (apps, credits, activity) | Dark | user |
| `/dashboard/apps/new` | Deploy new app form | Dark | user |
| `/developers` | Developer API & MCP guide | Light | user |
| `/viewer/{channelSlug}/{appSlug}` | App viewer shell (iframe) | Dark | user |

### Creator Routes (creator or admin role required)
| Route | Page | Theme | Min Role |
|-------|------|-------|----------|
| `/creator` | Creator dashboard (channels) | Light | creator |
| `/creator/channels/new` | New channel form | Light | creator |
| `/creator/channels/{slug}` | Channel detail (apps table) | Light | creator |
| `/creator/channels/{slug}/apps/new` | New app form | Light | creator |

### Admin Routes (admin role required)
| Route | Page | Theme | Min Role |
|-------|------|-------|----------|
| `/admin` | Admin overview (stats + quick actions) | Dark | admin |
| `/admin/users` | Users table | Dark | admin |
| `/admin/users/{userId}` | User detail/edit | Dark | admin |
| `/admin/channels` | Channels table | Dark | admin |
| `/admin/apps` | Apps table | Dark | admin |
| `/admin/apps/{appId}` | App edit | Dark | admin |

---

## Appendix: Screenshot Checklist

Use this checklist to capture all required screenshots. Each should be a full-page or viewport capture at 1280px width.

### Consumer Flow (16 screenshots)
- [ ] `user-discovery-01-homepage.png`
- [ ] `user-discovery-02-navbar-loggedout.png`
- [ ] `user-discovery-03-channel-page.png`
- [ ] `user-discovery-04-app-detail-loggedout.png`
- [ ] `user-auth-01-signup.png`
- [ ] `user-auth-02-verify-email.png`
- [ ] `user-auth-03-login.png`
- [ ] `user-auth-04-login-error.png`
- [ ] `user-browse-01-navbar-loggedin.png`
- [ ] `user-browse-02-navbar-dropdown.png`
- [ ] `user-browse-03-app-detail-loggedin.png`
- [ ] `user-viewer-01-deploying.png`
- [ ] `user-viewer-02-loading.png`
- [ ] `user-viewer-03-ready.png`
- [ ] `user-viewer-04-deploy-failed.png`
- [ ] `user-viewer-05-error.png`
- [ ] `user-viewer-06-session-toast.png`
- [ ] `user-account-01-credits.png`
- [ ] `user-account-02-security.png`
- [ ] `user-pricing-01-page.png`
- [ ] `user-pricing-02-razorpay-modal.png`
- [ ] `user-pricing-03-post-purchase.png`

### Creator Flow (12 screenshots)
- [ ] `creator-access-01-dropdown.png`
- [ ] `creator-access-02-layout.png`
- [ ] `creator-channel-01-empty.png`
- [ ] `creator-channel-02-new-form.png`
- [ ] `creator-channel-03-dashboard.png`
- [ ] `creator-app-01-channel-empty.png`
- [ ] `creator-app-02-new-form.png`
- [ ] `creator-app-03-channel-with-apps.png`
- [ ] `creator-deploy-01-dashboard.png`
- [ ] `creator-deploy-02-new-form.png`
- [ ] `creator-manage-01-app-table.png`
- [ ] `creator-api-01-mcp-info.png`
- [ ] `creator-api-02-keys.png`
- [ ] `creator-api-03-guide.png`
- [ ] `creator-api-04-reference.png`

### Admin Flow (5 screenshots)
- [ ] `admin-overview-01-dashboard.png`
- [ ] `admin-users-01-list.png`
- [ ] `admin-users-02-detail.png`
- [ ] `admin-channels-01-list.png`
- [ ] `admin-apps-01-list.png`
- [ ] `admin-apps-02-detail.png`
