# Meta App Review — Internal Preparation Checklist

**Status: NOT SUBMITTED. This is internal prep only — do not submit App Review from this document.**

Pixie's Marketing integration is built and works today in **demo mode** (seeded data) and in
**live mode for the scopes Meta already grants without review**. The scopes below that require
App Review return honest permission errors until reviewed — the product never fakes success.

This file is the checklist to have ready *before* a future submission. Owner: (assign). Last
updated when the Marketing intelligence work landed.

---

## 1. Permissions we request, and why

| Permission | Used for (product surface) | Review needed? |
|---|---|---|
| `public_profile` | Basic login identity | No (default) |
| `pages_show_list` | List the Pages the user manages (connect wizard, diagnostics, asset picker) | Standard |
| `pages_read_engagement` | Read Page posts + engagement for **Brand Brain** and organic insights | **Yes** |
| `pages_manage_posts` | Publish/prepare Page posts (approval-gated) | **Yes** |
| `pages_manage_engagement` | Read/hide/reply to comments (Comments + Inbox, approval-gated) | **Yes** |
| `instagram_basic` | Read the linked IG business account (media, profile) for Brand Brain / analytics | **Yes** |
| `instagram_content_publish` | Publish IG posts/reels (approval-gated) | **Yes** |
| `instagram_manage_comments` | IG comment moderation (approval-gated) | **Yes** |
| `instagram_manage_messages` | IG DM inbox (approval-gated) | **Yes** |
| `pages_messaging` | Page/Messenger DM inbox (approval-gated) | **Yes** |
| `ads_read` | Read ad accounts, campaigns, and insights (Meta Ads tab, Ads Assistant) | **Yes** |
| `ads_management` | Create **PAUSED-only** campaigns (never active) | **Yes** |
| `business_management` | Reach Pages + ad accounts inside the Business Portfolio | **Yes** |

Notes for reviewers / our own submission copy:
- **`ads_read`** — we only read spend/impressions/clicks/CTR/CPC and campaign metadata to show the
  client their performance and to power the read-only Ads Assistant. No writes.
- **`ads_management`** — used *solely* to create campaigns with `status=PAUSED` (enforced in
  `meta/ads.py:create_campaign`, no code path can create an ACTIVE campaign). Activation happens by
  the user inside Ads Manager. We never auto-launch or auto-spend.
- **`business_management`** — required because the client's Pages and ad accounts live inside a
  Meta Business Portfolio; without it we cannot enumerate the assets the user asked us to manage.
- **`pages_show_list` / `pages_read_engagement`** — `pages_show_list` powers the connect wizard and
  asset selection; `pages_read_engagement` powers the Brand Brain (learning voice from the client's
  own past posts) and organic analytics. Read-only.
- Every publishing / messaging / commenting scope is **approval-gated**: the agent prepares content
  and files an approval; nothing goes to Meta until the user approves it (see `approvals/`).

## 2. Safety posture to demonstrate

- Publishing/replies are **never automatic** — they require explicit user approval.
- Campaign creation is **PAUSED-only**; no active-ad path exists.
- Tokens are stored server-side only (`meta/token_service.py`), never returned to the browser,
  logged, or placed in the display asset store.
- Missing/ungranted permissions surface as honest errors (reconnect / App Review needed), never
  faked data (`meta/ads.py:_classify_graph_error`, `meta/diagnostics.py`).

## 3. Screencast + screenshots to record later (per Meta requirements)

For each reviewed permission Meta wants a screencast showing the flow end-to-end with a real test user:

- [ ] **Login / connect** — the connection wizard checklist → Facebook consent → connected diagnostics.
- [ ] **`pages_show_list` / `business_management`** — asset discovery listing Pages + ad accounts.
- [ ] **`pages_read_engagement` / `instagram_basic`** — Brand Brain building from real posts.
- [ ] **`ads_read`** — Meta Ads tab showing spend/impressions/CTR + Ads Assistant analysis.
- [ ] **`ads_management`** — creating a campaign and showing it is **PAUSED** in Ads Manager.
- [ ] **`pages_manage_posts` / `instagram_content_publish`** — preparing a post → approval → publish.
- [ ] **`pages_manage_engagement` / `instagram_manage_comments`** — comment reply via approval.
- [ ] **`instagram_manage_messages` / `pages_messaging`** — DM inbox reply via approval.
- [ ] Screenshots of the **approval gate** (nothing publishes without approval) and the **PAUSED**
      campaign state.
- [ ] A written **data-use / deletion** explanation and the privacy policy URL.

## 4. Pre-submission gates (do all before submitting)

- [ ] Business Verification complete for the Meta Business Portfolio.
- [ ] App in the correct mode with the production redirect URI registered (`META_REDIRECT_URI`).
- [ ] Valid privacy policy + data deletion callback URLs configured.
- [ ] Test user credentials prepared for Meta's reviewers.
- [ ] `META_SCOPES` widened to include the reviewed scopes **only after** approval (today it is
      intentionally restricted to the pre-review set).

## 5. Do NOT do yet

- ❌ Do not click "Submit for Review" — this checklist is preparation only.
- ❌ Do not widen `META_SCOPES` to request unreviewed publishing/messaging scopes in production.
