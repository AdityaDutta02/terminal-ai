
# Terminal AI — UX Audit & Redesign Plan

## Executive Summary

A comprehensive audit of Terminal AI's three user flows (Consumer, Creator, Admin) identified **33 UX gaps** across the platform. Issues range from blocking dead-ends that strand users to systemic architectural gaps like zero notification infrastructure and completely siloed role flows.

This document covers: what's broken, how to fix it, and the redesigned flows that address every issue.

### Gap Overview

| Role | P0 (Blocking) | P1 (Major Friction) | P2 (Missing Polish) | Total |
|------|:---:|:---:|:---:|:---:|
| Consumer | 2 | 5 | 5 | 12 |
| Creator | 3 | 4 | 4 | 11 |
| Admin | 2 | 4 | 4 | 10 |
| **Total per-role** | **7** | **13** | **13** | **33** |
| Cross-cutting (systemic) | — | 7 | 3 | 10 |

### Top 5 Systemic Themes

1. **No error recovery** — Deploy Failed is a dead end, no forgot password, no confirmation dialogs
2. **No notification infrastructure** — zero notification paths across all three roles
3. **Siloed roles** — no user→creator transition, no cross-role visibility, no moderation pipeline
4. **No analytics anywhere** — consumers, creators, and admins all flying blind
5. **Two disconnected deploy paths** for creators with no staging or review gate

---

## 1. Consumer Flow

### Current State
`Homepage → Channel → App Detail → Sign in → Login → Homepage (logged in) → Channel → App Detail → Open App → Viewer Shell → Account (Credits, Security) → Pricing → Razorpay`

### Gaps Found

#### P0 — Blocking

| # | Gap | Where | Impact | Fix |
|---|-----|-------|--------|-----|
| C1 | Deploy Failed is a dead end | Viewer Shell | User stranded, 100% drop-off | Add Retry loop + "Back to marketplace" escape + error message |
| C2 | No Forgot Password | Auth → Login | Account lockout = permanent churn | Add Forgot Password → Reset Email → New Password → Login |

#### P1 — Major Friction

| # | Gap | Where | Impact | Fix |
|---|-----|-------|--------|-----|
| C3 | Email verify → manual login | Auth | Friction at critical conversion moment | Auto-login after email verification |
| C4 | No search or filtering | Discovery + Browsing | Unusable beyond 10-20 apps | Add search bar + category/tag filters |
| C5 | Sign-in wall before app preview | Discovery → App Detail | High bounce — no preview before auth | Add screenshots/demo on public App Detail |
| C6 | No credit balance visibility | Browsing → Viewer | Surprise charges erode trust | Credit balance in navbar + cost display before launch |
| C7 | Session expiry has no graceful exit | Viewer Shell | Data loss anxiety | Add "Save and exit" + Session Ended state |

#### P2 — Missing Polish

| # | Gap | Impact |
|---|-----|--------|
| C8 | No first-use onboarding | New users don't understand Channel→App model or credits |
| C9 | No app ratings or reviews | Reduces confidence in app selection |
| C10 | No "Recently Used" apps | Friction for repeat users — most valuable segment |
| C11 | Thin account management (2 tabs) | Signals immature product |
| C12 | No free tier or trial in purchasing | Conversion barrier for new users |

### Redesigned Consumer Flow

**Core Journey** (see flow: *Fixed Consumer Flow - Core Journey*)
- Discovery with search + filters on homepage and channel pages
- Auth with forgot password, OAuth (Google/GitHub), auto-login after email verify
- First-use onboarding tour explaining credits and the channel→app model
- Browsing with credit balance in navbar, recently used apps, search
- Credit sufficiency check before app launch with top-up CTA if low
- Viewer shell with full error recovery (retry + back to marketplace on all failure states), 2-min session warning, "Save and exit" option, session summary with rating prompt

**Account & Purchasing** (see flow: *Fixed Consumer Flow - Account and Purchasing*)
- Account expanded to 5 tabs: Profile, Credits (with history), Security, Usage History, Notifications
- Purchasing with free tier, plan selection, payment failure recovery with retry
- Help center with FAQ, docs, and support ticket submission
- "Become a Creator" application path with pending/approved/rejected states

---

## 2. Creator Flow

### Current State
`Navbar → Role Check → Creator Dashboard → New Channel → Channel Detail → New App → App Table → App Edit`  
`Separate path: Dashboard → Deploy New App → Building → Live`  
`Separate path: Developer Page → API Keys / MCP Guide → MCP Tools`

### Gaps Found

#### P0 — Blocking

| # | Gap | Where | Impact | Fix |
|---|-----|-------|--------|-----|
| CR1 | Two disconnected deploy paths | Dashboard vs Creator Studio | Confusing mental model — which to use? | Unify into single pipeline |
| CR2 | No build status in Creator Studio | App Table | Creator has no idea if app is building/failed/live | Surface deploy status + logs in App Table |
| CR3 | No staging or preview before live | Deploy pipeline | Broken apps go live immediately | Add Staging state between Build and Live |

#### P1 — Major Friction

| # | Gap | Where | Impact | Fix |
|---|-----|-------|--------|-----|
| CR4 | No versioning or rollback | App Edit | Can't safely iterate or fix live apps | Version management with rollback |
| CR5 | No delete or archive | Channels + Apps | Dead content clutters marketplace | Archive/delete with confirmation + restore |
| CR6 | No analytics or insights | Entire Creator flow | Flying blind on app performance | Analytics tab: sessions, revenue, users, ratings |
| CR7 | No creator onboarding | Creator Dashboard | High churn — deploy model is technical | First-use walkthrough for channel→app→deploy |

#### P2 — Missing Polish

| # | Gap | Impact |
|---|-----|--------|
| CR8 | No pricing/monetization controls | Creators can't set credit costs per session |
| CR9 | No deploy notifications | Creators must poll dashboard for build status |
| CR10 | No MCP/API error handling | Developers hit silent failures |
| CR11 | No channel customization | All channels look the same — no brand differentiation |

### Redesigned Creator Flow

**Studio & Channels** (see flow: *Fixed Creator Flow - Studio and Channels*)
- Creator onboarding on first visit — guided walkthrough
- Dashboard with sidebar nav: Channels, Apps, Analytics, Developer API, Settings
- Full channel management: create, edit branding/description/ordering, archive (restorable)
- Full app management: create with pricing fields, edit, push updates, archive/restore
- Analytics tab: sessions over time, credit revenue, active users, ratings

**Unified Deploy Pipeline** (see flow: *Fixed Creator Flow - Unified Deploy Pipeline*)
- Single entry point from Creator Studio OR MCP tools
- Pipeline: Config → Build → **Staging/Preview** → **Admin Review** → Live
- Build failure with visible logs + retry
- Notifications at every stage (build ready, approved, rejected, live)
- Version management: push update → build new version → stage → promote
- Rollback to previous version on critical issues

---

## 3. Admin Flow

### Current State
`Navbar → Role Check → Stats + Quick Actions → Users Table/Channel Table/Apps Table → Detail views → Actions (Change Role, Adjust Credits, Suspend App, Reindex Search)`

### Gaps Found

#### P0 — Blocking

| # | Gap | Where | Impact | Fix |
|---|-----|-------|--------|-----|
| A1 | Suspend has no reinstate | Admin Actions | Wrongly suspended apps can't be restored | Add Unsuspend with reason + history |
| A2 | No audit log | Entire Admin flow | Zero accountability for sensitive actions | Activity log with who/what/when/why |

#### P1 — Major Friction

| # | Gap | Where | Impact | Fix |
|---|-----|-------|--------|-----|
| A3 | Channel management is read-only | Channels Table | Can't act on policy violations | Full CRUD: edit, hide, feature, unpublish |
| A4 | No creator approval flow | Role transitions | No quality gate for new creators | Application → Review → Approve/Reject pipeline |
| A5 | Quick Actions = only navigation | Admin Overview | Must return to overview to switch contexts | Persistent sidebar nav |
| A6 | No search or filtering on tables | All admin tables | Unusable at scale | Search + filter + sort + pagination |

#### P2 — Missing Polish

| # | Gap | Impact |
|---|-----|--------|
| A7 | No bulk actions | Operational inefficiency for spam/abuse |
| A8 | No financial reporting | Can't understand business performance |
| A9 | No communication tools | Can't notify users/creators of actions |
| A10 | No "View As" / impersonation | Can't debug user-reported issues |

### Redesigned Admin Flow

**Management Panel** (see flow: *Fixed Admin Flow - Management*)
- Persistent sidebar: Overview, Users, Channels, Apps, Moderation, Activity Log, Financials, Communications
- All tables with search, filter, sort, pagination, bulk actions
- User management: full detail view with role change (confirmation dialog), credit adjust (with reason), suspend/unsuspend, "View As" impersonation
- Channel management: full CRUD — edit, feature on homepage, hide/unpublish
- App management: edit, suspend/unsuspend, view as consumer, bulk actions

**Operations** (see flow: *Fixed Admin Flow - Moderation Audit and Comms*)
- Moderation queue: app review queue, creator applications, user reports/flags
- App review: preview staging link → approve/reject/request changes → notify creator
- Creator applications: review → approve (role change) / reject (with reason)
- Audit log: filterable by admin, action type, date — full before/after state
- Financial reporting: revenue dashboard, credit flow, creator payouts, CSV export
- Communication tools: platform announcements, email templates, direct notifications, message history

---

## 4. Cross-Cutting Issues

These systemic gaps span all roles and require platform-level solutions.

### Platform Architecture

| # | Gap | Affected Roles | Fix |
|---|-----|---------------|-----|
| X1 | No notification system | All | Build notification engine (email + in-app) — connects all role actions |
| X2 | No help/support/feedback | All | Help center with FAQ, docs, ticket system accessible from all roles |
| X3 | No user→creator transition | Consumer ↔ Creator | "Become a Creator" CTA → application → admin review → role upgrade |
| X4 | No cross-role awareness | All | "View As" for admin, public preview for creators, role-aware nav |

### Flow Consistency

| # | Gap | Current State | Fix |
|---|-----|--------------|-----|
| X5 | Inconsistent error handling | Consumer viewer has states; creator deploy + admin actions have none | Standardize: every action has success, failure, and retry states |
| X6 | No confirmation on destructive actions | Suspend, role change, credit adjust — all fire immediately | Add confirmation dialogs with reason fields for all destructive actions |
| X7 | No loading/pending states outside viewer | Creator deploy, admin actions, purchasing — no intermediate feedback | Add processing/pending states for all async operations |

### Strategic

| # | Gap | Risk | Fix |
|---|-----|------|-----|
| X8 | No content moderation pipeline | Broken/malicious apps reach consumers | Creator submits → Admin reviews → Approved/Rejected → Live |
| X9 | No analytics at any level | No data-informed decisions possible | Consumer: usage history. Creator: app performance. Admin: platform health |
| X10 | Opaque marketplace economics | Users don't understand value exchange | Transparent pricing: show credit costs, creator earnings model, session rates |

---

## 5. Redesigned Flow Artifacts

All redesigned flows are available as interactive diagrams:

| Artifact | What it covers |
|----------|---------------|
| **Fixed Consumer Flow - Core Journey** | Discovery → Auth → Onboarding → Browsing → Viewer (with all error recovery) |
| **Fixed Consumer Flow - Account and Purchasing** | Expanded account, free tier, support, become-a-creator path |
| **Fixed Creator Flow - Studio and Channels** | Onboarding, channel CRUD, app management, analytics |
| **Fixed Creator Flow - Unified Deploy Pipeline** | Single pipeline with staging, admin review, versioning, rollback |
| **Fixed Admin Flow - Management** | Sidebar nav, full CRUD, search/filter/bulk, view-as |
| **Fixed Admin Flow - Moderation Audit and Comms** | Moderation queue, audit log, financials, communications |
| **Cross-Role Connections Map** | How all three roles connect via shared systems |

---

## 6. Recommended Phasing

### Phase 1 — Fix What's Broken (P0s)
- Consumer: Deploy Failed recovery + Forgot Password
- Creator: Unify deploy paths + add build status feedback + staging preview
- Admin: Add unsuspend flow + audit log
- Cross-cutting: Confirmation dialogs on all destructive actions

### Phase 2 — Remove Major Friction (P1s)
- Consumer: Auto-login after verify, search/filter, credit balance visibility, session graceful exit
- Creator: Versioning/rollback, archive/delete, analytics, creator onboarding
- Admin: Persistent sidebar nav, search/filter on tables, channel full CRUD, creator approval flow
- Cross-cutting: Notification engine, standardized error handling, loading states

### Phase 3 — Complete the Platform (P2s + Strategic)
- Consumer: Onboarding tour, ratings/reviews, recently used, expanded account, free tier
- Creator: Pricing controls, deploy notifications, MCP error handling, channel customization
- Admin: Bulk actions, financial reporting, communication tools, view-as
- Cross-cutting: Help center, user→creator transition, cross-role awareness, analytics dashboards, transparent economics
