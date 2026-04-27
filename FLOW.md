# FLOW.md — Implementation Map

This doc maps **what the bot actually does today**, anchored to the code. Use it when something breaks during testing and you need to find the failing piece without grep-spelunking.

> Sister doc: [pixie_flows.md](pixie_flows.md) describes the *design* — how flows should feel. This doc describes the *implementation* — file paths, line numbers, decision branches. When the two disagree, the code wins (and one of them needs an update).

**How to use this:**
- "User got stuck at X" → find X in the [State table](#all-states) → jump to its handler → look at the line.
- "Bot ignored my reply" → walk the [Router pipeline](#router-pipeline) top-to-bottom; one of those 26 checks ate it.
- "Feature broke after a code change" → check the [Failure-mode runbook](#failure-mode-runbook) for the symptom.

---

## Table of Contents

1. [The big picture](#the-big-picture)
2. [Entry points](#entry-points)
3. [Router pipeline](#router-pipeline)
4. [All states](#all-states)
5. [Per-flow detail](#per-flow-detail)
6. [Cross-cutting concerns](#cross-cutting-concerns)
7. [Payment & post-payment](#payment--post-payment)
8. [Failure-mode runbook](#failure-mode-runbook)

---

## The big picture

```
WhatsApp / Messenger / Instagram webhook
            │
            ▼
   src/webhook/parser.js  (extracts text, media, buttons, replyTo, referral)
            │
            ▼
   src/conversation/router.js  (26-check pipeline)
            │
            ▼
   STATE_HANDLERS[user.state](user, message)
            │
   ┌────────┴────────────────────────────────────┐
   ▼                                              ▼
Salesbot / Service-pick                    Specialist flow
(SALES_CHAT, SERVICE_SELECTION)            (Website, Logo, Ad, Chatbot, SEO,
   │                                        App, Marketing, Schedule)
   │ trigger tags ([TRIGGER_WEBSITE_DEMO])           │
   └──────────► routes into specialist ◄─────────────┘
                         │
                         ▼
                  Outcome delivered
            (preview URL / PDF / image / link)
                         │
                         ▼
                Stripe payment (where applicable)
                         │
                         ▼
            Post-payment redeploy + admin notify
```

---

## Entry points

| Surface | Webhook file | Channel value | Notes |
|---|---|---|---|
| WhatsApp Cloud API | [src/webhook/routes.js](src/webhook/routes.js) | `whatsapp` | Identity is per `(phone, channel, phone_number_id)` so a customer texting two of our numbers gets two sessions. |
| Messenger | [src/webhook/messengerRoutes.js](src/webhook/messengerRoutes.js) | `messenger` | |
| Instagram DM | [src/webhook/messengerRoutes.js](src/webhook/messengerRoutes.js) | `instagram` | Echo + edit handling; see parser cache. |
| Click-to-WhatsApp ad | parser sets `parsed.referral` | any | Router stores `adSource` + `adReferral` in metadata at [router.js#L867-885](src/conversation/router.js#L867-L885); attribution appears in admin Ad-Attribution tab. |

**Default state for new users:** `SALES_CHAT` (set by `findOrCreateUser` → `resumeOrInitialize` in [src/db/users.js](src/db/users.js)). The legacy `WELCOME` state exists but is rarely hit — most users land directly in salesbot's warm opener.

---

## Router pipeline

Every inbound message walks through these checks in order in [src/conversation/router.js](src/conversation/router.js). Knowing this list is the single biggest debugging unlock — when "the bot didn't respond" the answer is almost always one of these intercepting silently.

| # | Check | File:line | Stops bot reply? |
|---|---|---|---|
| 1 | Dedup (recent messageId) | [router.js:528](src/conversation/router.js#L528) | Yes (silently) |
| 2 | Message buffer (1s text debounce) | [router.js:533](src/conversation/router.js#L533) | Buffers, doesn't drop |
| 3 | Per-user lock (serial processing) | [router.js:58](src/conversation/router.js#L58) | Queues |
| 4 | Audio transcription | [router.js:582](src/conversation/router.js#L582) | No (transforms to text) |
| 5 | findOrCreateUser | [router.js:601](src/conversation/router.js#L601) | No |
| 6 | Quoted-reply resolution | [router.js:615](src/conversation/router.js#L615) | No (prepends context to text) |
| 7 | Feedback button intercepts | [router.js:640](src/conversation/router.js#L640) | Yes if matched |
| 8 | Interactive reply matcher (text → buttonId) | [router.js:670](src/conversation/router.js#L670) | No (rewrites message) |
| 9 | Abuse detection | [router.js:709](src/conversation/router.js#L709) | Yes for hard categories (sets humanTakeover) |
| 10 | Location / document intercepts | [router.js:784](src/conversation/router.js#L784) | Yes if matched |
| 11 | Session recap (30min+ silence) | [router.js:814](src/conversation/router.js#L814) | No (prepends recap) |
| 12 | Return-visitor greeting | [router.js:845](src/conversation/router.js#L845) | No (prepends greeting) |
| 13 | Ad referral capture | [router.js:867](src/conversation/router.js#L867) | No |
| 14 | logMessage (persist user message) | [router.js:888](src/conversation/router.js#L888) | No |
| 15 | Lead temperature update (HOT/WARM/COLD) | [router.js:890](src/conversation/router.js#L890) | No |
| 16 | Re-fetch user metadata | [router.js:901](src/conversation/router.js#L901) | No |
| 17 | **Human takeover gate** | [router.js:906](src/conversation/router.js#L906) | **Yes** — admin set `humanTakeover=true` |
| 18 | `/reset` command | [router.js:912](src/conversation/router.js#L912) | Stops + sends greeting |
| 19 | `/menu` command | [router.js:1055](src/conversation/router.js#L1055) | Routes to SERVICE_SELECTION |
| 20 | Salon owner commands ("bookings", "cancel N") | [router.js:1071](src/conversation/router.js#L1071) | Yes if matched |
| 21 | Multi-service queue pre-interceptor | [router.js:1083](src/conversation/router.js#L1083) | Routes to first service |
| 22 | Undo/keep classifier | [router.js:1116](src/conversation/router.js#L1116) | Goes back one state |
| 23 | Implicit friction detectors | [router.js:1204](src/conversation/router.js#L1204) | Offers handoff after 3 wrong answers |
| 24 | Intent interceptor (flow-switch) | [router.js:1276](src/conversation/router.js#L1276) | Routes to SERVICE_SELECTION |
| 25 | Sales objection check | (SALES_CHAT only) | Routes to handleObjection |
| 26 | **State handler dispatch** | `STATE_HANDLERS[user.state]` (~L1400) | Calls the flow handler |

When in doubt, add a `logger.debug` at the top of the suspected check, redeploy, and watch the logs — the silently-eating-message bugs always live in this list.

---

## All states

States are defined in [src/conversation/states.js](src/conversation/states.js). The dispatch table is in [src/conversation/router.js](src/conversation/router.js#L100-L205).

### Idle / fallback

| State | Handler | Purpose |
|---|---|---|
| `WELCOME` | handleWelcome | Initial greeting (rarely used; most users start in SALES_CHAT) |
| `SERVICE_SELECTION` | handleServiceSelection | Main menu (SEO / Website / More Services) |
| `SALES_CHAT` | handleSalesBot | Default conversation state — LLM-driven discovery |
| `GENERAL_CHAT` | handleGeneralChat | Off-flow questions |
| `INFORMATIVE_CHAT` | handleInformativeBot | FAQ / knowledge-base mode |

### Website builder (largest flow — 22 states)

| State | Purpose |
|---|---|
| `WEB_COLLECT_NAME` | business name |
| `WEB_COLLECT_EMAIL` | optional email (skippable) |
| `WEB_COLLECT_INDUSTRY` | industry — **decides which template** |
| `WEB_COLLECT_AREAS` | HVAC + Real Estate: service areas / neighborhoods |
| `WEB_COLLECT_AGENT_PROFILE` | Real Estate only — brokerage + years + designations |
| `WEB_COLLECT_LISTINGS_ASK` | Real Estate — "any active listings?" yes/no |
| `WEB_COLLECT_LISTINGS_DETAILS` | Real Estate — listing detail loop |
| `WEB_COLLECT_LISTINGS_PHOTOS` | Real Estate — listing photo uploads |
| `WEB_COLLECT_SERVICES` | non-RE — services / products list |
| `WEB_COLLECT_COLORS` | brand colors (skippable) |
| `WEB_COLLECT_LOGO` | logo upload (skippable) — runs `processLogo` (remove.bg) |
| `WEB_COLLECT_CONTACT` | phone / email / address |
| `SALON_BOOKING_TOOL` | salon — embed (Fresha) vs native vs phone-only |
| `SALON_INSTAGRAM` | salon — handle (skippable) |
| `SALON_HOURS` | salon — weekly hours |
| `SALON_SERVICE_DURATIONS` | salon — service × duration × price |
| `WEB_DOMAIN_CHOICE` | need / own / skip |
| `WEB_DOMAIN_OWN_INPUT` | "own" path — domain text |
| `WEB_DOMAIN_OWN_REGISTRAR` | "own" — GoDaddy / Namecheap / etc (for DNS instructions) |
| `WEB_DOMAIN_SEARCH` | "need" path — Namecheap availability |
| `WEB_CONFIRM` | summary + "approve" trigger |
| `WEB_GENERATING` | building (3-30s) |
| `WEB_GENERATION_FAILED` | error state |
| `WEB_PREVIEW` | site live; awaits approve or revise |
| `WEB_REVISIONS` | edit loop — 3 free, unlimited after activation |

All handled by [src/conversation/handlers/webDev.js](src/conversation/handlers/webDev.js) (`WEB_GENERATION_FAILED` routes through `handleGenerationFailed` in the same file).

### Custom domain (legacy — pre-payment domain choice replaced this)

`DOMAIN_OFFER` / `DOMAIN_SEARCH` / `DOMAIN_PURCHASE_WAIT` / `DOMAIN_DNS_GUIDE` / `DOMAIN_VERIFY` — kept for users mid-flow before the redesign. New flows skip these. → [src/conversation/handlers/customDomain.js](src/conversation/handlers/customDomain.js).

### SEO audit

`SEO_COLLECT_URL` → `SEO_ANALYZING` → `SEO_RESULTS` → `SEO_FOLLOW_UP` — [src/conversation/handlers/seoAudit.js](src/conversation/handlers/seoAudit.js). 24h follow-up via [src/followup/scheduler.js](src/followup/scheduler.js).

### Ad generator

`AD_COLLECT_BUSINESS` → `_INDUSTRY` → `_NICHE` → `_TYPE` → `_SLOGAN` → `_PRICING` → `_COLORS` → `_IMAGE` → `AD_SELECT_IDEA` → `AD_CREATING_IMAGE` → `AD_RESULTS` — [src/conversation/handlers/adGeneration.js](src/conversation/handlers/adGeneration.js). No payment gate; free deliverable.

### Logo maker

`LOGO_COLLECT_BUSINESS` → `_INDUSTRY` → `_DESCRIPTION` → `_STYLE` → `_COLORS` → `_SYMBOL` → `_BACKGROUND` → `LOGO_SELECT_IDEA` → `LOGO_CREATING_IMAGE` → `LOGO_RESULTS` — [src/conversation/handlers/logoGeneration.js](src/conversation/handlers/logoGeneration.js).

### Chatbot SaaS

`CB_COLLECT_NAME` → `_INDUSTRY` → `_FAQS` → `_SERVICES` → `_HOURS` → `_LOCATION` → `CB_GENERATING` → `CB_DEMO_SENT` → `CB_FOLLOW_UP` — [src/conversation/handlers/chatbotService.js](src/conversation/handlers/chatbotService.js).

### Smaller flows

- App dev — `APP_COLLECT_REQUIREMENTS` → `APP_PROPOSAL` → `APP_FOLLOW_UP`
- Marketing — `MARKETING_COLLECT_DETAILS` → `MARKETING_STRATEGY` → `MARKETING_FOLLOW_UP`
- Schedule — `SCHEDULE_COLLECT_DATE` → `SCHEDULE_COLLECT_TIME` → `SCHEDULE_CONFIRM`

---

## Per-flow detail

### Website builder — decision branches

The website flow is the most complex and the most common source of "wrong template / wrong field" complaints. Key forks:

**Industry → template** ([src/website-gen/templates/index.js](src/website-gen/templates/index.js#L19-L100))

```
isHvac(industry)        ─► HVAC template (also: plumbing, electrical, roofing,
                            appliance, garage-door, locksmith, pest-control,
                            water-damage, tree-service)
isRealEstate(industry)  ─► Real Estate template
isSalonIndustry(...)    ─► Salon template
otherwise               ─► Generic (falls through to deployer.js generators)
```

If a user types a niche we don't recognise (e.g. "yoga studio") it falls into generic. Add the keyword to the right `KEYWORDS` array if it should match a niche template.

**Domain choice** (`WEB_DOMAIN_CHOICE`) — three buttons:

| Button | Next state | Effect |
|---|---|---|
| Need a domain | `WEB_DOMAIN_SEARCH` | Namecheap search → user picks → domain price baked into Stripe link |
| Have one | `WEB_DOMAIN_OWN_INPUT` → `_OWN_REGISTRAR` | Records DNS-target registrar for post-payment instructions |
| Skip | `WEB_CONFIRM` | Site-only price |

**Approval path** ([webDev.js handleRevisions](src/conversation/handlers/webDev.js)) — user replies positively in `WEB_REVISIONS`:

```
classifyConfirmIntent('confirm')
   ├── selectedDomain set OR domainChoice='skip'  ─► acknowledgeApprovalAfterDomainChoice (resurface activation link)
   └── otherwise                                   ─► DOMAIN_OFFER (legacy upsell)
```

**Revisions cap** ([webDev.js gateNextRevision](src/conversation/handlers/webDev.js)):
- `FREE_REVISIONS = 3` (module constant)
- `userHasPaidForSite()` checks `site.site_data.paymentStatus === 'paid'` — paid users skip the cap entirely
- 4th attempt for free users → `pitchRevisionUpgrade` → "Activate the site for $X and you get unlimited revisions" + Calendly CTA
- Refunded users flip back to `'preview'` and the cap re-applies — intentional

### Sales chat — trigger tags

[src/conversation/handlers/salesBot.js](src/conversation/handlers/salesBot.js) drives the discovery conversation. The LLM emits **trigger tags** that the handler intercepts to route into specialist flows:

| Tag | Routes to |
|---|---|
| `[TRIGGER_WEBSITE_DEMO]` | `WEB_COLLECT_NAME` (or pre-fills if business name + industry already known) |
| `[TRIGGER_LOGO_MAKER]` | `LOGO_COLLECT_BUSINESS` |
| `[TRIGGER_AD_GENERATOR]` | `AD_COLLECT_BUSINESS` |
| `[TRIGGER_CHATBOT_DEMO]` | `CB_COLLECT_NAME` |
| `[TRIGGER_BYTESCART]` | sends ByteScart pitch + CTA (ecommerce) |
| `[SEND_PAYMENT: amount=X, service=Y, ...]` | creates Stripe link via `createPaymentLink` |

If the bot gets stuck pitching forever instead of triggering, the LLM isn't emitting the tag — check the prompt examples in [src/llm/prompts.js](src/llm/prompts.js) for the relevant service.

---

## Cross-cutting concerns

| Concern | Where | Notes |
|---|---|---|
| **Auto-log of bot messages** | [src/messages/sender.js](src/messages/sender.js) `autoLogOutbound` | Reads `userId` from AsyncLocalStorage; runs after every `sendTextMessage` / buttons / list / image / doc. Logs to `conversations` with role=`assistant` + outbound `wamid` so future replies can be matched. |
| **Reply-context resolution** | [router.js:615](src/conversation/router.js#L615) → `findMessageByPlatformId` | Looks up quoted message by `whatsapp_message_id`, prepends `[Replying to bot's earlier message: "..."]` to user text. |
| **Abuse detection** | [src/abuse/detector.js](src/abuse/detector.js) | Every-turn classifier. Hard categories (hate/threats/phishing/hacking/illegal) → `humanTakeover=true` + admin email. Soft NSFW → polite decline + re-test on pivot. |
| **Human takeover** | [router.js:906](src/conversation/router.js#L906) | If `metadata.humanTakeover` true, bot stays silent. Toggled from admin panel Conversations modal. |
| **Revision count + paid unlimited** | [webDev.js gateNextRevision](src/conversation/handlers/webDev.js) | 3 free, then activation pitch; paid users skip. |
| **Follow-up scheduler** | [src/followup/scheduler.js](src/followup/scheduler.js) | Cron every 30min. Website 22h discount. SEO 24h nudge. Skips paid + already-discounted users. |
| **22h discount** | [scheduler.js applyWebsiteDiscount](src/followup/scheduler.js) | % is `admin_settings.website_discount_pct` (default 20). Creates new Stripe link, redeploys banner, supersedes prior pending payment. |
| **Day-30 upsell email** | [src/jobs/upsellScheduler.js](src/jobs/upsellScheduler.js) → [src/notifications/email.js sendUpsellEmail](src/notifications/email.js) | SEO floor price = `admin_settings.seo_floor_price`. |
| **Site auto-cleanup** | [src/jobs/siteCleanup.js](src/jobs/siteCleanup.js) | Watermark unpaid sites at 1h; delete after 60 days. |
| **Domain DNS verifier** | [src/jobs/domainVerifier.js](src/jobs/domainVerifier.js) | Polls every 5min for paid users with selected domain — flips status to `live` once DNS resolves. |
| **Salon booking reminder** | [src/jobs/bookingReminders.js](src/jobs/bookingReminders.js) | 24h-before customer email. |
| **GDPR consent** | [src/website-gen/templates/_privacy.js](src/website-gen/templates/_privacy.js) + [src/leads/routes.js](src/leads/routes.js) + [src/webhook/bookingRoutes.js](src/webhook/bookingRoutes.js) | Required checkbox on every form; server rejects without it; persisted on `form_submissions.consent_given` and `appointments.consent_given`. |
| **Pricing settings** | [src/db/settings.js](src/db/settings.js) + admin Pricing tab | Cache + token-interpolation in [src/llm/provider.js](src/llm/provider.js). Tokens: `{{WEBSITE_PRICE}}`, `{{WEBSITE_DISCOUNT_PCT}}`, `{{REVISION_PRICE}}`, `{{SEO_FLOOR_PRICE}}`. |

---

## Payment & post-payment

```
WEB_CONFIRM (user types "approve")
   │
   ▼
createPaymentLink (src/payments/stripe.js)
   │  ── inserts pending row in `payments` table
   │  ── builds Stripe checkout URL with combined website + domain amount
   ▼
Stripe link sent in chat + embedded in activation banner on preview site
   │
   ▼ (user pays at buy.stripe.com/...)
   │
Stripe webhook  ── checkout.session.completed
   │
   ▼
src/payments/stripeWebhook.js
   │
   ▼
src/payments/postPayment.js handleConfirmedPayment()
   │
   ├── marks payments row paid
   ├── if domain selected: Namecheap purchase + Netlify custom-domain attach
   ├── redeploys site with paymentStatus='paid' (banner removed)
   ├── sends WhatsApp confirmation to user
   └── sends payment-notification email to admin
```

Refund path: `charge.refunded` webhook → flips site back to `paymentStatus='preview'` → revision cap re-applies.

---

## Failure-mode runbook

When a tester complains, start here.

| Symptom | First place to look | Why it usually fails |
|---|---|---|
| "Bot didn't reply at all" | [Router pipeline](#router-pipeline) checks 1, 9, 17 | Dedup, abuse-blocked, or admin set humanTakeover |
| "Bot replied with greeting instead of continuing" | `metadata.lastResetAt` recent? state=`SALES_CHAT`? | A `/reset` ran (or a user typed it) |
| "Wrong template generated" | [templates/index.js](src/website-gen/templates/index.js) `isHvac/isRealEstate/isSalon` arrays | Industry keyword not in the niche's array |
| "Salon flow loops on hours / services" | [webDev.js nextMissingWebDevState](src/conversation/handlers/webDev.js) salon branch | `weeklyHours` or `salonServices` shape mismatch in metadata |
| "Stripe link never appeared" | [webDev.js generateWebsite](src/conversation/handlers/webDev.js) `createPaymentLink` call | Stripe API error swallowed, or `payments` row insert failed |
| "Activation banner still shows after payment" | [src/payments/postPayment.js](src/payments/postPayment.js) → [src/website-gen/redeployer.js](src/website-gen/redeployer.js) `redeployAsPaid` | Webhook didn't fire or redeploy errored — check `payments.paid_at` and `generated_sites.site_data.paymentStatus` |
| "Domain didn't auto-purchase" | [src/integrations/namesilo.js](src/integrations/namesilo.js) / [src/integrations/namecheap.js](src/integrations/namecheap.js) | Outbound IP not whitelisted at registrar (Render IPs rotate); check `/debug/outbound-ip` |
| "Free revision counter wrong" | `user.metadata.revisionCount` + `gateNextRevision` | `/reset` should clear it (router.js:912 wipe block) |
| "User got 4th revision through" | `userHasPaidForSite` returned true unexpectedly | Check site's `site_data.paymentStatus` — refunded sites should be `'preview'` |
| "Multiple revisions in one message dropped fields" | [webDev.js _imageQuery branch](src/conversation/handlers/webDev.js) | Should pass non-special keys as `additionalUpdates` to `applyImageRevision` |
| "Quoted-reply context not picked up" | [router.js:615](src/conversation/router.js#L615) `findMessageByPlatformId` | Outbound message wasn't logged with platform id, OR replyTo.id mismatched |
| "Image upload to wrong slot" | [webDev.js inbound-image branch](src/conversation/handlers/webDev.js) caption classifier | Caption ambiguous → falls to picker; classifier returned wrong target |
| "Sales bot pitches forever, no trigger" | [src/llm/prompts.js](src/llm/prompts.js) SALES_BOT_PROMPT | Trigger tag examples weak for this scenario; tighten or add example |
| "22h discount not firing" | [scheduler.js shouldFollowupForUser](src/followup/scheduler.js) | Already-paid / already-discounted check, or `recentSendCutoff` blocked |
| "Audit stuck in ANALYZING" | [src/conversation/handlers/seoAudit.js](src/conversation/handlers/seoAudit.js) → [src/analysis/](src/analysis) | PageSpeed / scraper timeout; check job result row |
| "Form submission rejected with consent_required" | Browser sent form without checkbox checked | Verify the `consentField` HTML rendered; HTML5 `required` should block |
| "Owner email never arrived after lead" | [src/leads/routes.js](src/leads/routes.js) → [src/notifications/email.js sendLeadNotification](src/notifications/email.js) | SendGrid not configured, or owner email missing on site |
| "Admin price change not reflected" | [src/db/settings.js](src/db/settings.js) cache | `setSetting` should invalidate; if multi-instance deploy, no pub/sub yet |
| "Bot speaks wrong language" | [src/utils/localizer.js](src/utils/localizer.js) | Detects from inbound text; check transliteration heuristics |

### What to capture when reporting a bug

- Phone number (or user.id from admin panel)
- Time of the issue (so you can grep logs)
- The state the user was in (admin Conversations view shows it)
- The exact message text or screenshot
- For Stripe issues: `payments.id` and Stripe `pi_*` / `cs_*` ids if visible

---

## When to update this doc

Anytime you:
- Add a new state or rename one (update [All states](#all-states))
- Add a router pre-handler check (update [Router pipeline](#router-pipeline))
- Add a new flow handler file (add a section under [Per-flow detail](#per-flow-detail))
- Add a new admin-managed setting (update [Cross-cutting concerns](#cross-cutting-concerns))
- Find a new failure mode that wasn't in the runbook (update [Failure-mode runbook](#failure-mode-runbook))

If a section drifts more than two changes out of date, the doc loses trust fast. Keep the line refs accurate — a stale `router.js:615` is worse than no ref at all.
