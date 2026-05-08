# Pixie — Complete System Snapshot

> Last updated: 2026-05-08
> Authoritative current-state doc. When this and older files (PROJECT_OVERVIEW, FLOW, WHAT_IS_PIXIE) disagree, **this file wins**. The older docs are kept around for historical context but have not tracked the post-Apr-30 work (portfolio template, admin translate toggle, real-estate side-channel, etc.).

---

## 1. What Pixie is

Pixie is a **WhatsApp + Messenger + Instagram chatbot** that sells, builds, deploys and supports websites for small businesses end-to-end inside the chat thread.

A small-business owner messages our number → Pixie has a multi-turn discovery conversation in the user's language → spins up a real, multi-page website preview in under a minute → takes payment via Stripe → deploys the site on a custom domain (Namecheap + Netlify) → offers unlimited revisions afterward — **all inside the chat**.

Adjacent services (logo, ad creatives, SEO audit, AI chatbot SaaS) exist as separate flows, but the bot's main funnel is **websites only**. Non-website service requests are handed off to a human via admin email (`bytesuite@bytesplatform.com`).

Positioning: "the agency replacing the freelancer" for SMBs that won't use Wix and won't wait two weeks.

---

## 2. Stack & infrastructure

| Layer | Tech |
|---|---|
| Server | Node.js (CommonJS), Express, single process |
| DB | Supabase (Postgres) + pgvector for the knowledge base |
| LLM | OpenAI GPT-4-class for sales / classifiers / extractors |
| Messaging | WhatsApp Cloud API (v21.0), Messenger Graph API, Instagram Graph API |
| Payments | Stripe Checkout (combined website + domain in one Session) |
| Deploy | Netlify (generated sites), Render (backend), Vercel (landing page at `pixiebot.co`) |
| Domains | Namecheap API (registration + DNS) |
| Email | SendGrid |
| Image | Pexels API for hero/service imagery |

Key constraint: Namecheap requires a whitelisted source IP. Render rotates IPs on free/Starter — `GET /debug/outbound-ip` reports what the server is currently sending from. Multi-instance deploys also create a settings-cache lag (no cross-instance pub/sub yet).

---

## 3. Channels

Per-platform identity: users keyed by `(phone, channel, phone_number_id)`. Same person texting two of our numbers = two distinct user rows. **Don't dedupe on phone alone.**

| Surface | Notes |
|---|---|
| WhatsApp | Multiple business phone numbers; per-turn `phone_number_id` routing |
| Messenger | Standard messaging tag flow |
| Instagram | Echo + edit handling on the parser side |

Click-to-WhatsApp ads drive most inbound. `adReferral` tracked per first contact.

---

## 4. Inbound pipeline (the single most important thing to know)

Every message — WhatsApp, Messenger, Instagram — flows through the same path:

```
webhook route
  → src/webhook/parser.js
    → src/conversation/router.js     ← 26 pre-handler checks here
      → STATE_HANDLERS[user.state]
```

The router runs a **26-check pipeline** before dispatching. If a message "didn't reply" or "got swallowed", it's almost always one of those 26 checks intercepting silently — dedup, per-user lock, abuse detector, human-takeover gate, `/reset`, intent interceptor, undo classifier, etc. See [FLOW.md § Router pipeline](FLOW.md) for the full table with file:line refs.

Notable pipeline behaviors:

- **Per-user serial lock** ([router.js:58](src/conversation/router.js#L58)) — two webhooks for the same user land in parallel; the lock chains them so `/reset → first message` doesn't race.
- **1-second buffer** — multiple texts within 1s are merged into a single turn so a user typing in bursts is handled as one intent.
- **Dedup window** — Meta occasionally redelivers the same `messageId`; an LRU map at the top of router.js silently drops repeats.
- **Auto-log of outbound** — handlers call `sendTextMessage(...)` etc., never log explicitly. `src/messages/sender.js` reads the current `userId` out of an AsyncLocalStorage and writes the assistant turn to `conversations` with the platform message id, so future `context.id` / `reply_to.mid` resolve against bot messages.

---

## 5. State machine

States live in [src/conversation/states.js](src/conversation/states.js). Dispatch table is `STATE_HANDLERS` near the top of [router.js:102](src/conversation/router.js#L102). Handlers in [src/conversation/handlers/](src/conversation/handlers/) are responsible for mutating `user.state` and `user.metadata` via `updateUserState` / `updateUserMetadata`, and for calling `pushStateHistory` so users can say "go back".

Default state for a new user is **`SALES_CHAT`**.

### 5.1 Flow groups

| Group | States | Handler |
|---|---|---|
| **Sales / discovery** (default) | `SALES_CHAT` | `salesBot.js` |
| **Website builder** (the main flow, ~22 states) | `WEB_COLLECT_NAME → … → WEB_PREVIEW → WEB_REVISIONS` | `webDev.js` |
| **Salon sub-flow** | `SALON_BOOKING_TOOL`, `SALON_HOURS`, `SALON_SERVICE_DURATIONS`, `WEB_AWAITING_FORM` | `webDev.js` |
| **Real-estate sub-flow** | `WEB_COLLECT_AGENT_PROFILE`, `WEB_COLLECT_LISTINGS_ASK/DETAILS/PHOTOS` | `webDev.js` |
| **Portfolio sub-flow** *(new — added May 8)* | `WEB_COLLECT_ABOUT`, `WEB_COLLECT_PROJECTS_ASK/DETAILS/PHOTOS` | `webDev.js` |
| **HVAC sub-flow** | `WEB_COLLECT_AREAS` | `webDev.js` |
| **Domain** | `WEB_DOMAIN_CHOICE/OWN_INPUT/OWN_REGISTRAR/SEARCH/LATE_SEARCH` + legacy `DOMAIN_*` aliases | `webDev.js` / `customDomain.js` |
| **AI Chatbot SaaS** | `CB_COLLECT_*`, `CB_GENERATING`, `CB_DEMO_SENT`, `CB_FOLLOW_UP` | `chatbotService.js` |
| **Logo / Ad / SEO audit** | `LOGO_*` / `AD_*` / `SEO_*` | `logoGeneration.js` / `adGeneration.js` / `seoAudit.js` |
| **Meeting** | `SCHEDULE_COLLECT_DATE/TIME`, `SCHEDULE_CONFIRM` | `scheduling.js` |

### 5.2 SalesBot — LLM trigger tags

The salesBot doesn't route flows by intent classifier. The LLM is prompted to emit **trigger tags** which `salesBot.js` parses out and turns into state transitions / Stripe links:

- `[TRIGGER_WEBSITE_DEMO: name="X"; industry="Y"; services="A, B"]` → seed `websiteData` + jump to web flow
- `[TRIGGER_LOGO_MAKER]` → logo wizard
- `[TRIGGER_AD_GENERATOR]` → ad wizard
- `[TRIGGER_CHATBOT_DEMO]` → chatbot SaaS demo
- `[TRIGGER_SEO_AUDIT: <url>]` → SEO audit
- `[TRIGGER_HUMAN_HANDOFF: <label>]` → email admin, bot stays available
- `[SEND_PAYMENT: amount=X, service=Y, tier=Z, description=...]` → Stripe Checkout link

If the bot won't trigger something, the LLM examples in [src/llm/prompts.js](src/llm/prompts.js) are usually the fix.

---

## 6. Website builder — five templates

Industry keyword decides the template via [src/website-gen/templates/index.js](src/website-gen/templates/index.js). Unrecognised industries fall to the generic template.

| Template | Detector | File |
|---|---|---|
| **HVAC** (plumbing, electrical, roofing, etc.) | `isHvac()` keyword + `nounVerbPattern` | `hvac/` |
| **Salon** (barber, spa, nail, hair, lash, brow, makeup, beauty) | `isSalonIndustry()` regex in `webDev.js:1293` | `salon.js` |
| **Real-estate** (realtor, broker, properties, listings) | `isRealEstate()` | `real-estate/` |
| **Portfolio** *(new)* — designer / developer / photographer / writer / freelancer / artist | `isPortfolio()` keyword + "I am a designer" pattern | `portfolio/index.js` |
| **Generic** (fallback) | none — caller default | base generator |

Adding a niche = appending to the keyword arrays in `templates/index.js`.

### 6.1 Template-specific collection steps

| Template | Extra steps |
|---|---|
| HVAC | `WEB_COLLECT_AREAS` — primary city + service areas (used for emergency dispatch + neighborhood pages) |
| Salon | Booking tool choice → hours → per-service duration loop. Consent-gated booking form on the live site. |
| Real-estate | `WEB_COLLECT_AGENT_PROFILE` (brokerage / years / designations) + 3-phase listings collection (ask → details loop, max 3 → optional photos). All four RE states have **cross-field side-channel** so a service add at the listings step doesn't get dropped. |
| Portfolio | About paragraph → 3-phase project collection (ask → details, max 4 → photos). LLM-only intent classifiers, no regex gating. SVG UI mockup illustrations auto-generated when user has no project photos. |
| Generic | None |

### 6.2 Cross-field side-channel

[src/conversation/sideChannel.js](src/conversation/sideChannel.js) — one LLM classifier returns one of:
- `service_add`, `name_change`, `industry_change`
- `contact_update` (email / phone / address)
- `question`
- `unclear`

Used as a **fallback**, after the state-specific extractor concludes the message isn't a clean answer. Lets the user say "we also do AC selling" mid-area-collection without losing the input. Wired at all 4 real-estate states + every WEB_COLLECT_* step + the salon/portfolio loops.

---

## 7. Payment + deployment pipeline

```
[bot finishes WEB_CONFIRM]
   ↓
generateWebsiteContent() → siteConfig (LLM-generated copy + Pexels imagery)
   ↓
deployToNetlify() → temp Netlify URL (preview banner + paymentStatus='preview')
   ↓
createPaymentLink() → Stripe Checkout (combined: website + domain)
   ↓ user pays
[Stripe webhook checkout.session.completed]
   ↓
postPayment.js
   ├── mark payment paid
   ├── (optional) Namecheap domain registration
   ├── redeploy site as paymentStatus='paid' (banner removed)
   └── email admin
```

**Stripe webhook is mounted BEFORE `express.json()`** in [src/index.js:69](src/index.js#L69) — signature verification needs the exact raw bytes. Moving it breaks signatures.

Refunds flip `paymentStatus` back to `'preview'` and the **3-revision cap re-applies**. Intentional — refunded ≠ free unlimited revisions.

---

## 8. Admin panel

[/admin](src/admin/routes.js) — single-page dashboard at `src/admin/dashboard.html`. Auth-middleware-gated. Helmet bypassed because Tailwind CDN + inline scripts.

### 8.1 Per-conversation features

| Endpoint | Purpose |
|---|---|
| `GET /admin/api/conversations/:userId` | Full conversation view |
| `GET /admin/api/conversations/:userId/llm-usage` | Cost per turn |
| `GET /admin/api/conversations/:userId/decisions` | Logged classifier decisions |
| `POST /admin/api/conversations/:userId/translate` *(new — added May 8)* | Per-conversation "Translate to English" toggle. Cached in metadata so it persists. |
| `POST /admin/api/conversations/:userId/detect-language` *(new — added May 8)* | LLM-detects user's inbound language and surfaces it in the dashboard. |
| `POST /admin/api/conversations/:userId/reply` | Send manual reply |
| `POST /admin/api/conversations/:userId/takeover` | Set `humanTakeover=true` — silences the bot |

### 8.2 Other panels

- Overview / leads / lead summaries / domains / sites / audits
- Funnel + dropoff analytics + message volume
- Payments + revenue + ad attribution
- Sales-prep summaries
- Feedback inbox + resolve flow
- Handover users list (for live takeover)
- Chatbot-SaaS client management (list / activate / pause / cancel)
- Meetings (Calendly-driven)

---

## 9. Background jobs

All started in [src/index.js:201](src/index.js#L201) inside `app.listen`'s callback — boot smoke check passes before they're allowed to run.

| Job | Cadence | File |
|---|---|---|
| Followup scheduler (1h / 22h discount / 24h SEO / 72h / 7d) | every 30 min | [src/followup/scheduler.js](src/followup/scheduler.js) |
| Chatbot SaaS scheduler (trial expiry, demo follow-ups, monthly reports) | varies | [src/chatbot/jobs/scheduler.js](src/chatbot/jobs/scheduler.js) |
| Instagram token auto-refresh | every 50 days | [src/jobs/instagramTokenRefresh.js](src/jobs/instagramTokenRefresh.js) |
| Day-30 upsell email | daily | [src/jobs/upsellScheduler.js](src/jobs/upsellScheduler.js) |
| Domain DNS verifier | every 5 min | [src/jobs/domainVerifier.js](src/jobs/domainVerifier.js) |
| Site cleanup (1h watermark, 60d delete) | every 15 min | [src/jobs/siteCleanup.js](src/jobs/siteCleanup.js) |
| Salon booking 24h reminders | every 15 min | [src/jobs/bookingReminders.js](src/jobs/bookingReminders.js) |

---

## 10. Settings + price interpolation

Admin-managed settings in `admin_settings` Supabase table, cached in-process by [src/db/settings.js](src/db/settings.js). [src/llm/provider.js](src/llm/provider.js) interpolates tokens at call time:

- `{{WEBSITE_PRICE}}`, `{{WEBSITE_DISCOUNT_PCT}}`, `{{REVISION_PRICE}}`, `{{SEO_FLOOR_PRICE}}`

Price changes from the admin panel propagate without a deploy. Cache warmed at boot. **No cross-instance pub/sub** — multi-instance deploys can briefly serve stale prices after a write.

---

## 11. Compliance posture (current state)

This is honest, not aspirational. Detail in [PIXIE_RESEARCH_CONTEXT.md](PIXIE_RESEARCH_CONTEXT.md).

### Mitigations in place
- All flows are **user-initiated** (no cold outreach)
- `followupOptOut` honored across the scheduler when user says "stop / unsubscribe / not interested" (LLM-classified)
- `humanTakeover` silences the bot on flagged threads (abuse-detection wired in [src/abuse/detector.js](src/abuse/detector.js))
- Privacy page + per-site `/privacy/` + GDPR consent on form submissions and salon bookings
- Per-turn `phone_number_id` routing (we don't surface unfamiliar numbers mid-conversation)
- Bot **identity flipped to honest AI disclosure** (commit `028f2aa` — "ban-risk: gate WhatsApp outbound on 24h window + flip bot identity to honest AI disclosure")
- 24h-window gate active for Messenger / Instagram / WhatsApp outbound

### Known gaps
- No Approved WhatsApp Message Templates yet — every outbound is `text` / `interactive` / `cta` / `image` / `document`
- No app-level outbound rate-limiting (Meta's own limits are the only throttle)
- Multi-instance settings cache has no pub/sub

---

## 12. Conventions

- **CommonJS, not ESM** (`"type": "commonjs"` in package.json)
- **No test runner / no linter configured.** Verification = `node --check <file>` (pre-allowed in `.claude/settings.json`) + the boot smoke check + `npm run test:replay`
- **Replay suite** ([test/replay.js](test/replay.js)) hits real Supabase + real OpenAI (~$0.05–0.20/sweep), creates short-lived `test_…` user rows, mocks only outbound messaging. State + metadata assertions are strict; `Reply` assertions are substring-soft (LLM is non-deterministic). 58+ fixtures.
- **Tester phones** (`TESTER_PHONES` env) are excluded from feedback / friction logging / website rate-limit
- **GDPR consent gates leads** — server rejects form/booking submissions without `consent_given`. Don't relax without a deliberate change to legal posture.
- **Helmet selectively bypassed** for `/admin`, `/widget.js`, `/chat/*`, `/demo/*`, `/privacy`, landing root, services-form (each uses inline scripts/styles)
- **Outbound IP whitelist:** Namecheap requires it — `GET /debug/outbound-ip` reports current IP

---

## 13. Recent work (since May 1)

| Date | What | Why |
|---|---|---|
| 2026-05-08 | Portfolio template — 5th audience | Designers / developers / photographers / writers / freelancers were getting the generic template, no portfolio-feel |
| 2026-05-08 | Portfolio sub-flow (4 new states + LLM-only classifiers) | About paragraph + 3-phase project collection mirroring real-estate listings |
| 2026-05-08 | Portfolio template polish — SVG UI mockups, editorial typography | User shouldn't have to upload images for project covers to look real |
| 2026-05-08 | Multi-URL projects parser fix (`pixiebot.co\nbytesplatform.com\nbytesplatform.info` → 3 cards) | Tester complaint: only first URL became a project, other two lost |
| 2026-05-08 | Meta-word services drop ("projects" / "work" / "portfolio" filtered out of services list) | "Yes my projects" was landing as `services=['projects']` and showing in the confirm summary |
| 2026-05-08 | Place+city address detection at WEB_COLLECT_LOGO | "Abc karachi" was returning `unclear` and bot replied "I didn't catch an image" |
| 2026-05-07 | Admin per-conversation "Translate to English" toggle + language detection | Operator needs Roman Urdu / Hindi conversations rendered in English in the dashboard |
| 2026-05-07 | Real-estate cross-field side-channel at all 4 RE states + intent-regex purge | Service adds / contact updates mid-listing-collection were getting dropped |
| 2026-05-06 | Salon flow hardening: durations preserve / salonServices sync / no-op feedback / hours order fix / "the rest are default" phrasing | Multiple tester convos surfaced edge cases |
| 2026-05-04 | Production-readiness pass: classifier observability + golden test suite | Pre-launch hardening |
| 2026-05-03 | Domain pipeline end-to-end fix + self-healing reconciler | Failed registrations were leaving sites in a bad state |
| 2026-05-02 | LLM-first refactor across the board: replaced regex gating with classifier calls in salesBot, serviceSelection, customDomain, chatbotService | Class-of-issues fix — "stop fixing the convo, fix the class of bug" |

---

## 14. Reference docs in the repo

| File | Purpose |
|---|---|
| **PIXIE.md** *(this file)* | Current-state snapshot |
| [CLAUDE.md](CLAUDE.md) | Instructions to AI assistants working on the codebase |
| [FLOW.md](FLOW.md) | Implementation map: 26-check router pipeline with file:lines, payment flow, failure-mode runbook keyed by tester symptom |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Product spec, pricing, voice (Apr 30 — partly stale post-portfolio) |
| [WHAT_IS_PIXIE.md](WHAT_IS_PIXIE.md) | High-level pitch (Apr 30) |
| [PIXIE_FEATURES.md](PIXIE_FEATURES.md) | Feature list (Apr 30) |
| [pixie_flows.md](pixie_flows.md) | Design-side narrative of how each conversation should *feel*. When code and this disagree, code wins. |
| [PIXIE_RESEARCH_CONTEXT.md](PIXIE_RESEARCH_CONTEXT.md) | Ban-risk dossier for external compliance review (May 1) |
| [RESEARCH_PROMPT.md](RESEARCH_PROMPT.md) | Prompt to pair with the dossier |
| [DOMAIN_FLOW_PLAN.md](DOMAIN_FLOW_PLAN.md), [DOMAIN_RENEWAL_PLAN.md](DOMAIN_RENEWAL_PLAN.md) | Domain purchase + DNS specifics |
| [test/README.md](test/README.md) | Fixture format, how to add a regression from a real tester transcript |
| [knowledge/](knowledge/) | Markdown corpus loaded into pgvector via `npm run embed`, queried by [src/knowledge/retriever.js](src/knowledge/retriever.js) |

---

## 15. Quick commands

```bash
npm start                                      # node src/index.js (production)
npm run dev                                    # node --watch (auto-reload)
npm run embed                                  # rebuild knowledge-base embeddings
npm run build:landing                          # build the Next.js landing page in landing/
npm run test:replay                            # run every fixture in test/fixtures/
npm run test:replay:list                       # list fixtures without running
node test/replay.js test/fixtures/02_*         # run a single fixture or glob
node --check src/path/to/file.js               # syntax check (the standard pre-commit verification)
node scripts/_portfolio-preview.js             # live-deploy a portfolio sample to Netlify for visual review
```
