
# Consumer Flow — Gap Analysis

## Severity Legend
- **P0 — Broken/Blocking:** Users cannot complete core tasks
- **P1 — Major Friction:** Users can complete tasks but with significant confusion or drop-off risk
- **P2 — Missing Polish:** Expected features absent, degrades trust/retention

---

## P0 — Blocking Gaps

### 1. Deploy Failed is a Dead End
**Where:** Viewer Shell → Deploying State → Deploy Failed  
**Problem:** No recovery path. User hits "Deploy Failed" and has nowhere to go — no retry, no back-to-marketplace, no error explanation.  
**Impact:** User is stranded. 100% drop-off at this state.  
**Fix:** Add Retry → Deploying State loop + "Back to App Detail" escape hatch + clear error message explaining why deploy failed.

### 2. No Forgot Password Flow
**Where:** Authentication → Login  
**Problem:** Login has an Error self-loop but no "Forgot Password" path. Users who can't log in are stuck.  
**Impact:** Account lockout = permanent churn.  
**Fix:** Add Forgot Password → Reset Email → New Password → Login path.

---

## P1 — Major Friction

### 3. Email Verification → Login is Confusing
**Where:** Authentication → Verify Email → Click email link → Login  
**Problem:** After verifying email, user lands on Login page and must manually log in. Expected behavior: auto-login after verification.  
**Impact:** Unnecessary friction at the most critical conversion moment. Users who just signed up shouldn't have to re-enter credentials.  
**Fix:** Auto-authenticate after email verification → redirect to Homepage (logged in).

### 4. No Search or Filtering in Discovery
**Where:** Discovery (Public) + Browsing (Logged In)  
**Problem:** Only path is Homepage → Channel → App. No search, no category filtering, no "trending" or "new" sections. Linear browsing only.  
**Impact:** As the marketplace grows beyond 10-20 apps, discovery becomes impossible. Users can't find what they need.  
**Fix:** Add Search bar on Homepage with results page. Add category/tag filtering on Channel pages.

### 5. Sign-in Wall Before App Launch
**Where:** Discovery → App Detail → "Sign in to launch" → Login  
**Problem:** Public users can see the App Detail page but must sign in just to try an app. No preview, screenshots, or demo available without auth.  
**Impact:** High bounce rate. Users who haven't committed to the platform won't create an account just to "try" an app — especially without knowing what it looks like.  
**Fix:** Add app screenshots/demo video on App Detail (public). Consider a limited free trial without sign-in, or at minimum show rich previews.

### 6. No Credit Balance Visibility Before Usage
**Where:** Browsing → Viewer Shell (no credit check shown)  
**Problem:** User opens an app (which presumably costs credits) but there's no credit balance indicator in the navbar or viewer shell. They don't know if they'll be charged or how much remains.  
**Impact:** Surprise charges erode trust. Users may run out of credits mid-session with no warning.  
**Fix:** Show credit balance in navbar. Display cost-per-session or credit consumption rate before "Open App." Add low-balance warning.

### 7. Session Expiry Has No Graceful Exit
**Where:** Viewer Shell → Session Expiry Toast  
**Problem:** At 13-min mark, user sees "Extend" toast. But what if they don't extend? No "save and close" or "session ended" state. What happens to their work?  
**Impact:** Data loss anxiety. Users don't know if their progress in the iframe app is preserved.  
**Fix:** Add Session Ended state with clear messaging. Communicate what happens to in-progress work. Add "Save and exit" option before forced expiry.

---

## P2 — Missing Polish

### 8. No First-Use Onboarding
**Where:** Post-authentication  
**Problem:** After signup + verify + login, user lands on Homepage with no guidance. No welcome tour, no "how it works," no first-app recommendation.  
**Impact:** New users don't understand the Channel → App model or how credits work.

### 9. No App Ratings, Reviews, or Social Proof
**Where:** App Detail page (both public and logged-in)  
**Problem:** No way for users to see if an app is good before committing credits/time.  
**Impact:** Reduces confidence in app selection, especially as catalog grows.

### 10. No Usage History or "Recently Used"
**Where:** Browsing (Logged In)  
**Problem:** No way to quickly re-access previously used apps. Must navigate Homepage → Channel → App every time.  
**Impact:** Friction for repeat users — the most valuable segment.

### 11. Thin Account Management
**Where:** Account section only has Credits Tab + Security Tab  
**Problem:** No profile editing, no notification preferences, no usage/billing history, no connected services.  
**Impact:** Users expect standard account management. Minimal options signal an immature product.

### 12. No Free Tier or Trial Path in Purchasing
**Where:** Purchasing → Pricing → Razorpay Checkout  
**Problem:** Flow goes straight from Pricing to payment. No free tier, no trial, no "first X credits free."  
**Impact:** Conversion barrier for new users who haven't experienced value yet.
