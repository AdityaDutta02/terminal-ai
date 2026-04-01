
# Cross-Cutting Issues — All Roles

These gaps span multiple user types and represent systemic platform concerns.

---

## Platform Architecture Gaps

### 1. No Notification System (Any Role)
**Affected:** Consumer, Creator, Admin  
**Problem:** Zero notification infrastructure across the entire platform. No email notifications, no in-app alerts, no push.  
**Examples of missing notifications:**
- Consumer: session about to expire, credit balance low, new apps in followed channels
- Creator: build succeeded/failed, app suspended, new reviews
- Admin: new creator applications, flagged content, system health alerts  
**Impact:** Users must actively poll for status changes. Critical events go unnoticed.

### 2. No Help, Support, or Feedback Loop
**Affected:** Consumer, Creator, Admin  
**Problem:** No support channel, no help docs, no FAQ, no feedback mechanism in any flow.  
**Impact:** Users with issues have no recourse. No way to collect product feedback.

### 3. No User → Creator Role Transition Flow
**Affected:** Consumer ↔ Creator  
**Problem:** Consumer flow and Creator flow are completely separate. No path for a consumer to become a creator — no "Become a Creator" CTA, no application form, no approval pipeline.  
**Impact:** Creator acquisition happens entirely outside the product. Major growth bottleneck.

### 4. No Cross-Role Awareness
**Affected:** All roles  
**Problem:** The three flows are siloed. Admin can't see what creators see. Creators can't preview what consumers see. No "view as" capability.  
**Impact:** Debugging, support, and quality assurance all suffer. Each role operates in isolation.

---

## Flow Consistency Gaps

### 5. Inconsistent Error Handling
| Flow | Error Handling |
|------|---------------|
| Consumer Auth | Login has Error self-loop (minimal) |
| Consumer Viewer | Deploy Failed (dead end), Token Error → Retry loop |
| Creator Deploy | None — Building → Live with no failure state |
| Admin Actions | None — no confirmation or error states |

**Impact:** Unpredictable behavior when things go wrong. Some flows handle errors, most don't.

### 6. No Confirmation States on Destructive Actions
**Affected:** Creator (delete app?), Admin (suspend, role change, credit adjustment)  
**Problem:** No "Are you sure?" confirmations, no success/failure feedback after actions.  
**Impact:** Accidental destructive actions with no undo. Admin changes a user's role with no confirmation dialog.

### 7. No Loading or Pending States Outside Viewer
**Affected:** Creator Deploy, Admin Actions, Purchasing  
**Problem:** The Viewer Shell has robust state management (Deploying → Loading → Ready), but Creator deploy, admin actions, and Razorpay checkout have no intermediate states.  
**Impact:** Users don't know if their action is processing. "Did my click register?"

---

## Strategic Gaps

### 8. No Content Moderation Pipeline
**Problem:** Marketplace has no app review process. Creator publishes → app is immediately live. No quality gate.  
**Risk:** Low-quality, broken, or malicious apps reaching consumers. Platform reputation damage.  
**Expected:** Creator submits → Admin reviews (or automated checks) → Approved/Rejected → Live.

### 9. No Analytics at Any Level
| Role | What's missing |
|------|---------------|
| Consumer | Usage history, spending history |
| Creator | App performance, revenue, user engagement |
| Admin | Platform health, growth metrics, revenue trends |

**Impact:** No one — consumer, creator, or admin — can make data-informed decisions.

### 10. No Marketplace Economics Visibility
**Problem:** Credits are referenced (Credits Tab, Adjust Credits, sessions) but the economic model is opaque. How are credits priced? What does an app session cost? How do creators earn?  
**Impact:** Users don't understand the value exchange. Creators can't optimize for revenue. Pricing is a black box.
