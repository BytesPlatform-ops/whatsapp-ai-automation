# WhatsApp Flow — Session Handoff Context

Status as of commit **`4fefaaa`** (main). Read this first next session.

## What this is
A native **WhatsApp Flow** (in-app multi-screen form) that replaces the chat
intake for **CTWA (ad) users** — they tap "Get Started", fill a guided form,
and Pixie builds + sends the site preview. Endpoint-driven, multi-niche,
**multi-language (any language the user writes in)**.

Full setup runbook: [FLOWS_SETUP.md](FLOWS_SETUP.md). Original spec:
`pixie_whatsapp_flows.docx`.

## ✅ DONE & LIVE (published on Meta, deployed on Render)

- **Encrypted endpoint** `POST /flow` (RSA-OAEP + AES-GCM, flipped-IV response).
  Verified live end-to-end.
- **Provisioned & PUBLISHED** on Meta. `PIXIE_FLOW_ID=997471406004267`,
  endpoint `https://whatsapp-ai-automation-h3y0.onrender.com/flow`.
- **Screens:** COMMON (name/email + **industry Dropdown**) → SALON
  (currency Dropdown + booking Radio + hours) → **SERVICE** (structured
  name/price/duration with an "add another" loop) → FINISH (email +
  **country-code Dropdown** + phone + address). Non-salon niches →
  DETAILS (2 dynamic fields). Industry dropdown id **IS** the theme
  (salon/hvac/realestate/portfolio/general) → no classification guessing.
- **Multi-language:** detected from first message (any ISO code), form
  strings LLM-translated at runtime + cached. EN/PT hand-authored; any
  other language materialized on demand (`src/flows/translate.js`).
  Currency/country pickers stay universal.
- **Post-build flow works:** flow submit → "Building…" ack → preview →
  Stripe payment link → revision prompt → (on approval) domain offer.
  Site DB record created in `handleFlowCompletion` so revisions/domain
  can find it. Router persists the returned `WEB_REVISIONS` state.
- **Domain intent fast-path** so "i need a domain" / "domain name?" work.

## 🔑 Key files (all under `src/flows/` unless noted)
| File | Role |
|---|---|
| `crypto.js` | endpoint encryption; `loadPrivateKey` (reads `WHATSAPP_FLOW_PRIVATE_KEY_B64`) |
| `questionBank.js` | canonical EN+PT strings, option lists, `classifyTheme`, `THEME_TO_INDUSTRY` |
| `translate.js` | `ensureLanguage(code)` — runtime LLM translation + cache |
| `lang.js` | `detectLanguage` (any ISO code) + phone fallback |
| `endpoint.js` | screen state machine (ping/INIT/data_exchange) |
| `routes.js` | `POST /flow` (decrypt→handle→encrypt) + secret-gated `GET /flow/keycheck` |
| `flow.json` | the 4-screen Flow definition (uploaded to Meta) |
| `send.js` | `sendWebsiteFlowOffer` — CTWA/tester gate, sends Flow (secondary "or, if it's easier" option after chat greeting) |
| `intake.js` | `handleFlowCompletion` — maps answers→websiteData, creates site, builds |
| `store.js` | `flow_sessions` persistence (migration `024_flow_sessions.sql`, applied) |
| `countryCodes.js` | 108 country dial codes |
| `scripts/flows/provision-flow.js` | genkeys/upload-key/create/upload/publish/status |
| `scripts/flows/seed-test-ctwa.js` | seed fake ctwa_clid on testers |
| `scripts/flows/test-flow-local.js` | offline harness (33 tests) |

## Env vars (on Render)
`PIXIE_FLOW_ID`, `WHATSAPP_FLOW_PRIVATE_KEY_B64` (base64 PEM — NOT the
`\n` form, that gets mangled), `WHATSAPP_ACCESS_TOKEN` (System User token,
has `whatsapp_business_management`+`messaging`, never-expires),
`WHATSAPP_APP_SECRET`, `NAMESILO_API_KEY`.
Local provisioning keys live in `scripts/flows/.keys/` (gitignored).

## How to test
1. `node -r dotenv/config scripts/flows/seed-test-ctwa.js` (seeds testers
   923333246545 / 923323448468 / 923353279709) — or `/reset` from a tester
   (testers bypass the CTWA gate now).
2. Message Pixie (in any language) → tap Get Started → fill → submit.
3. Re-provision after flow.json edits:
   `node -r dotenv/config scripts/flows/provision-flow.js upload` then
   `... publish`. **Wait for Render to deploy the matching endpoint code
   BEFORE publishing** (poll the endpoint), else new flow.json hits old code.

## 🟡 OPEN ITEMS for next session

1. **NameSilo domain flow is broken — verify the account first.**
   "Provider is down / can't fetch prices" = NameSilo API issue, NOT IP
   whitelist (NameSilo needs none — see memory `registrar-is-namesilo`).
   The key WORKS (returns real errors). Logs show the DNS-reconcile job
   (`domainVerifier.js`, every 5min) failing for `nomanplumbing.com` /
   `nomanllc.info` with "Domain is not active, or does not belong to this
   user" → those domains aren't in this NameSilo account (half-completed
   registrations / wrong account). **Likely root cause: NameSilo account
   balance is $0** (registrations need prepaid funds). Action: check
   NameSilo dashboard balance + which domains the key's account owns;
   clean up orphaned DB rows to stop the 5-min error spam. Then trace
   `getTldPricing`/`checkRegisterAvailability` for the buy-time failure.

2. **"check now" retry** after a provider-down didn't re-check — it fell
   back to the approval ack. Domain-search state handling in
   `WEB_DOMAIN_LATE_SEARCH` needs tracing (only worth doing once #1 is
   resolved so the registrar actually responds).

3. **Render outbound IP is not static** (free/Starter) — `74.220.48.244`
   rotates on redeploy. Not an issue for NameSilo (no whitelist), but note
   it. The `/debug/outbound-ip` note text wrongly says "Namecheap" — stale.

## Gotchas learned this session
- Flow send must use `flow_action: 'data_exchange'` (NOT navigate) or the
  first screen's dynamic labels render "undefined" (INIT never fires).
- Don't put "(optional)" in labels — WhatsApp auto-appends "(Optional)".
- TextInput has no `init-value`; use the **Form's `init-values`** object to
  clear fields on a screen refresh (the SERVICE "add another" loop).
- `routing_model` can't self-reference, but a data_exchange CAN return the
  current screen as a "refresh" (that's how the SERVICE loop works).
- Always `git pull --rebase origin main` before pushing — collaborators
  (Umair) push to main frequently (see memory `git-pull-before-push`).
