# Pixie — WhatsApp AI Automation Platform

> Complete reference of what this chatbot is, what it can do, and how every flow works end-to-end.

**Owner:** BytesPlatform (digital agency)
**Bot persona:** **Pixie**
**Primary channel:** WhatsApp Cloud API
**Secondary channels:** Facebook Messenger, Instagram DMs
**Last updated context:** 2026-04-15 (per repo docs)

---

## 1. What This Bot Actually Is

Pixie is a multi-channel AI sales-and-service agent for a digital agency. A prospect messages the agency on WhatsApp (or Messenger / Instagram). Pixie:

1. Greets them as a sales rep would.
2. Classifies what they need.
3. Runs them through one of several **productized service flows** (SEO audit, website build, ad design, logo design, chatbot SaaS trial, marketing strategy, app dev quote, etc.).
4. Generates real deliverables in the chat — actual SEO reports, working websites deployed to live URLs, AI-designed ad creatives, AI logos, embeddable demo chatbots.
5. Handles payment via Stripe, books meetings via Calendly, and runs background follow-ups for cold/warm leads.
6. Hands off to a human via the admin dashboard when needed.

It is **not** just a Q&A bot. It executes work — scrapes sites, writes HTML, deploys to Netlify, generates images with Gemini, sells trial seats, sends invoices.

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js + Express 5 (CommonJS) |
| Database | Supabase (PostgreSQL + pgvector) |
| Object storage | Supabase Storage (`ad-images`, `logo-images`, `generated-sites`) |
| Primary LLM | OpenAI GPT-4o-mini (`LLM_PROVIDER=openai`) |
| Fallback LLM | Anthropic Claude (`claude-sonnet-4`) |
| Image generation | Google Gemini (`gemini-3-pro-image-preview`) |
| Audio transcription | OpenAI Whisper |
| Embeddings | OpenAI `text-embedding-3-small` (RAG via pgvector) |
| Channels | Meta WhatsApp Cloud API, Messenger Send API, Instagram Messaging |
| Payments | Stripe Checkout + webhooks |
| Site hosting | Netlify (programmatic deploy via API) |
| Email | SendGrid |
| Browser automation | Puppeteer-core + Chromium (for screenshots / scraping) |
| PDF generation | pdfkit + @napi-rs/canvas |
| Landing site | Next.js (separately deployed, optionally served from `/`) |

---

## 3. Top-Level Architecture

```
                                                            ┌─────────────────────┐
 User on WhatsApp / Messenger / Instagram                   │  Admin Dashboard    │
        │                                                   │  (/admin)           │
        ▼                                                   └──────────▲──────────┘
 Meta Cloud APIs                                                       │ takeover, view
        │ webhook (POST)                                               │
        ▼                                                              │
 Express server (src/index.js)                                         │
        │                                                              │
        ├── /webhook              (WhatsApp routes + parser)           │
        ├── /messenger /instagram (Messenger / IG routes + parser)     │
        ├── /calendly             (Calendly meeting webhook)           │
        ├── /booking              (salon booking site → API)           │
        ├── /admin                (auth-gated dashboard)               │
        ├── /api/v1               (Chatbot SaaS REST API)              │
        ├── /widget.js            (Chatbot SaaS embed script)          │
        └── /chat /demo           (Chatbot SaaS public pages)          │
                │                                                      │
                ▼                                                      │
 conversation/router.js (state machine + intent classifier) ───────────┘
                │
   ┌────────────┼────────────┬──────────────┬────────────┬──────────────┐
   ▼            ▼            ▼              ▼            ▼              ▼
 Welcome   Service     Per-service       LLM         RAG over       Senders
           Selection   handlers          provider    knowledge/*    (channel-aware)
                       (SEO, Web,                    via pgvector
                       Ad, Logo,
                       Chatbot SaaS,
                       Sales, etc.)
                            │
                            ├── analysis/ (website scraper + SEO analyzer)
                            ├── website-gen/ (template engine + Netlify deploy)
                            ├── adGeneration/ (GPT-4o ideation → Gemini image)
                            ├── logoGeneration/ (GPT-4o concepts → Gemini logo)
                            ├── chatbot/ (white-label SaaS module)
                            ├── payments/ (Stripe checkout + polling)
                            └── db/ (users, conversations, sites, audits, etc.)

 Background workers (auto-started in src/index.js):
   followup/scheduler  · chatbot/jobs/scheduler · jobs/instagramTokenRefresh
   jobs/upsellScheduler · jobs/domainVerifier · jobs/siteCleanup
   jobs/bookingReminders
```

---

## 4. Project Layout

```
src/
├── index.js                 Express bootstrap, route mounting, scheduler kickoff
├── config/
│   ├── env.js               Env var loading + validation
│   └── database.js          Supabase client
├── webhook/
│   ├── routes.js            WhatsApp webhook (GET verify + POST receive)
│   ├── parser.js            WhatsApp payload parser (text/image/audio/button/list/CTWA referral)
│   ├── messengerRoutes.js   Messenger/Instagram webhook
│   ├── messengerParser.js   Messenger payload parser
│   ├── calendly.js          Calendly meeting webhook
│   └── bookingRoutes.js     Salon booking site → API
├── conversation/
│   ├── router.js            Main router + intent classifier + reset/menu commands
│   ├── states.js            All state constants (~60 states)
│   └── handlers/
│       ├── welcome.js
│       ├── serviceSelection.js
│       ├── seoAudit.js
│       ├── webDev.js + webDevExtractor.js
│       ├── appDev.js
│       ├── marketing.js
│       ├── adGeneration.js
│       ├── logoGeneration.js
│       ├── chatbotService.js
│       ├── customDomain.js
│       ├── scheduling.js
│       ├── salesBot.js          ← default state for new users
│       ├── informativeBot.js
│       ├── generalChat.js
│       └── salonOwnerCommands.js  (out-of-state: bookings, cancel, etc.)
├── llm/
│   ├── provider.js          Routes to Claude or OpenAI based on LLM_PROVIDER
│   ├── claude.js / openai.js
│   ├── prompts.js           All system prompts (sales, intent, content, etc.)
│   └── transcribe.js        Audio → text (Whisper)
├── knowledge/
│   ├── loader.js            Markdown → chunks → embeddings (npm run embed)
│   ├── embeddings.js
│   └── retriever.js         Vector similarity search
├── messages/
│   ├── sender.js            Channel-aware facade (sendTextMessage, sendImage, sendInteractiveButtons, etc.)
│   ├── channelContext.js    AsyncLocalStorage to remember which channel/business number replied
│   ├── whatsappSender.js    WhatsApp Cloud API client
│   ├── messengerSender.js   Messenger / IG API client
│   └── templates.js
├── adGeneration/            GPT-4o concepts → Gemini ad image → Supabase upload
├── logoGeneration/          GPT-4o logo concepts → Gemini flat-vector logo
├── analysis/                Website scraper + SEO analyzer
├── website-gen/
│   ├── generator.js         LLM content generation
│   ├── deployer.js          Builds HTML + deploys to Netlify
│   ├── templates/           Industry templates (generic, salon, hvac, business-starter)
│   ├── domainChecker.js     Domain availability + DNS verification
│   ├── heroImage.js, serviceImages.js, hvacServiceImages.js
│   └── timezone.js, hoursParser.js
├── chatbot/                 White-label AI Chatbot SaaS (full sub-module)
│   ├── api/                 REST API: clients, chat, analytics, widget config
│   ├── db/
│   ├── jobs/                Trial-expiry + demo-follow-up scheduler
│   ├── services/            Prompt builder, slug generator
│   ├── pages/               Demo + standalone /chat/[slug] pages
│   ├── widget/              Embeddable widget.js
│   └── admin/
├── booking/                 Salon-site booking backend (server-side endpoints)
├── payments/stripe.js       Payment link creation + status polling
├── followup/scheduler.js    Sales follow-up every 30 min
├── jobs/                    instagramTokenRefresh, upsellScheduler, domainVerifier, siteCleanup, bookingReminders
├── notifications/           Email + internal alerts
├── integrations/            Calendly, etc.
├── admin/                   Dashboard routes + Tailwind UI (template.js, dashboard.html, queries.js)
├── db/                      Supabase data layer (users, conversations, sites, audits, meetings, knowledge, payments, leadSummaries, llmUsage, retry, appointments)
└── utils/                   logger (winston), formatters, validators

knowledge/                   Markdown corpus for RAG (services, pricing, faq, case-studies)
templates/                   Pre-built website templates (business-starter, salon)
landing/                     Next.js public landing site (built separately)
preview/                     Sample generated salon preview site
```

---

## 5. Conversation Model

### 5.1 Identity

A user is `(phone_number, channel, inbound_business_number_id)`. Same person texting two of the agency's WhatsApp numbers → two independent sessions. Stored in Supabase `users` table. Every user has:

- `state` — current node in the conversation state machine
- `metadata` (JSONB) — flow-specific data (websiteData, chatbotData, adData, logoData, ad-source attribution, lead temperature, follow-up history…)

### 5.2 State machine

`conversation/router.js` keeps a `STATE_HANDLERS` map: state → handler function. Every incoming message:

1. Mark as read (WhatsApp typing-indicator behavior).
2. Download any attached media (images stored as base64 data URLs in DB so admin can view).
3. If audio → Whisper transcribe → treat as text.
4. Look up / create user.
5. Capture **Click-to-WhatsApp ad referral** if present (stores `adSource`, `adReferral`, used later for attribution).
6. Log message to DB.
7. Update lead temperature: ≥5 user msgs → WARM, ≥10 → HOT.
8. If `humanTakeover` flag set → log only, bot stops responding.
9. Handle special commands:
   - `/reset` → clear state + metadata + history → land in `SALES_CHAT` with deterministic Pixie greeting.
   - `/menu` (or `menu_main` button) → `SERVICE_SELECTION`.
10. Salon-owner commands intercept (`bookings`, `bookings today`, `cancel 123`).
11. **Intent classifier interceptor** — for any state in `COLLECTION_STATES` and any free-text input, calls `INTENT_CLASSIFIER_PROMPT` to decide:
    - `answer` → fall through to handler
    - `question` → answer the side question, then re-ask the current step
    - `menu` / `exit` → reset to service menu
    Short single-word replies (skip / yes / no / phone-shaped / email-shaped / <4 chars) are fast-pathed as `answer` to avoid an LLM call and a known misclassification (e.g. "skip" being read as "menu").
12. Run state's handler. Handler returns a new state if transitioning.

### 5.3 Special commands (work everywhere)

| Command | Effect |
|---|---|
| `/reset` | Clears state, metadata flags, conversation history. Lands in `SALES_CHAT` with a hardcoded greeting. |
| `/menu` | Jumps to `SERVICE_SELECTION`. |
| Salon-owner texts | `bookings`, `bookings today`, `cancel <id>` — handled by `salonOwnerCommands.js` from any state. |

### 5.4 Service selection

The "More Services" list message offers (matched by both list-IDs and free-text regex via `matchServiceFromText`):

| Service | List ID | Handler |
|---|---|---|
| 🔍 Free SEO Audit | `svc_seo` | `seoAudit.js` |
| 🌐 Website Development | `svc_webdev` | `webDev.js` |
| 📱 App Development | `svc_appdev` | `appDev.js` |
| 📈 Digital Marketing | `svc_marketing` | `marketing.js` |
| 🎨 Marketing Ads | `svc_adgen` | `adGeneration.js` |
| ✨ Logo Maker | `svc_logo` | `logoGeneration.js` |
| 🤖 AI Chatbot SaaS | `svc_chatbot` | `chatbotService.js` |
| ❓ FAQ & Support | `svc_info` | `informativeBot.js` |
| 💬 Talk to Sales | `svc_general` | `salesBot.js` |

---

## 6. Features in Detail

### 6.1 Sales Bot (default entry point)

**File:** `handlers/salesBot.js` · **State:** `SALES_CHAT`

Pixie's default identity. After `/reset` or fresh contact, every user lands here. The sales bot:

- Pitches services in conversation, using the agency knowledge base via RAG (chunks from `knowledge/services.md`, `pricing.md`, `faq.md`, `case-studies.md`).
- Detects ad-attribution intent — if the user came in via a Click-to-WhatsApp ad about chatbots, web, SEO, app, ecommerce, or smm, the relevant flow is auto-suggested (one-shot; trigger flags prevent re-prompting).
- Detects when the user is ready to commit and routes them into a productized flow.
- Tracks lead temperature (COLD → WARM → HOT) and seeds the follow-up scheduler accordingly.

### 6.2 Free SEO Audit

**Files:** `handlers/seoAudit.js`, `analysis/`
**States:** `SEO_COLLECT_URL` → `SEO_ANALYZING` → `SEO_RESULTS` → `SEO_FOLLOW_UP`

Flow:
1. Ask for URL.
2. Validate URL.
3. Scrape via Puppeteer-core + Cheerio: title, meta description, H1/H2 structure, image alt coverage, broken links, mobile responsiveness, SSL status, page speed proxy.
4. Pass extracted signals to LLM with the SEO-consultant system prompt. Get a prioritized issue list + pitch.
5. Send a short text summary ("We found N issues with yoursite.com") and a **PDF report** as a document attachment (built with pdfkit).
6. Send CTA buttons: "Want us to fix these?" / "See pricing" / "Talk to sales".
7. Stay in `SEO_FOLLOW_UP` for objection-handling / pricing Q&A.

### 6.3 Website Development & Generation

**Files:** `handlers/webDev.js`, `webDevExtractor.js`, `website-gen/*`
**States:** `WEB_COLLECT_NAME` → `_EMAIL` → `_INDUSTRY` → `_AREAS` (HVAC) → `_SERVICES` → `_COLORS` → `_LOGO` → `_CONTACT` → (salon: `SALON_BOOKING_TOOL`/`_INSTAGRAM`/`_HOURS`/`_SERVICE_DURATIONS`) → `WEB_CONFIRM` → `WEB_GENERATING` → `WEB_PREVIEW` → `WEB_REVISIONS` (or `WEB_GENERATION_FAILED`)

What it does:
1. Collects: business name, email, industry, services, brand colors, optional logo image, contact info.
2. **Industry routing** (`templates/index.js → pickTemplate(industry)`):
   - HVAC keywords (`hvac`, `heating`, `cooling`, `air conditioning`, `ac repair`, `furnace`, `heat pump`) → HVAC template (5-page: home, services, areas, about, contact with Netlify Forms; emergency red strip, dual CTAs, click-to-call FAB, JSON-LD `LocalBusiness` schema, per-area unique LLM content). See `hvac_context.md` for the full design spec.
   - Salons → salon template with integrated booking system (collects booking-tool preference, Instagram handle, hours, service durations).
   - Otherwise → generic 4-page `business-starter` template.
3. LLM (`generator.js`) writes hero copy, service descriptions, "why us" pillars, testimonials, FAQ, about-story.
4. Hero/service images sourced via `heroImage.js` / `serviceImages.js` (Unsplash queries tuned per industry).
5. `deployer.js` assembles HTML (mobile-responsive, semantic, Lucide icons, design tokens) and **deploys to Netlify** via API → public preview URL.
6. Sends a CTA button: "View Your Website".
7. **Revisions loop:** user says "change the color to blue" → LLM parses → template data updated → redeploy → new preview link. Tracks `revisionCount`, with one bonus revision (`bonusRevisionUsed`) before requiring upsell.
8. After approval → custom domain flow.

### 6.4 Custom Domain Purchase

**File:** `handlers/customDomain.js`
**States:** `DOMAIN_OFFER` → `DOMAIN_SEARCH` → `DOMAIN_PURCHASE_WAIT` → `DOMAIN_DNS_GUIDE` → `DOMAIN_VERIFY`

After website approval:
1. Offer custom domain.
2. `domainChecker.js` queries availability for suggested domains.
3. User picks one → Stripe payment link → `DOMAIN_PURCHASE_WAIT`.
4. Background `jobs/domainVerifier.js` polls DNS every 5 min once configured. When DNS propagates, marks site live and notifies the user.

### 6.5 Site Lifecycle Maintenance

**File:** `jobs/siteCleanup.js` (every 6h)
- Adds a "demo" watermark to generated sites after 24h that haven't been paid for.
- Deletes them entirely after 60 days.

### 6.6 App Development Quote

**File:** `handlers/appDev.js`
**States:** `APP_COLLECT_REQUIREMENTS` → `APP_PROPOSAL` → `APP_FOLLOW_UP`

Free-form requirements collection → LLM scopes the project and produces a tiered proposal (platform, features, timeline, indicative pricing) → CTA to book a meeting via Calendly.

### 6.7 Digital Marketing Strategy

**File:** `handlers/marketing.js`
**States:** `MARKETING_COLLECT_DETAILS` → `MARKETING_STRATEGY` → `MARKETING_FOLLOW_UP`

Collects business + goals → LLM produces a marketing strategy (channels, content cadence, ad budget recommendations) → CTA for service tiers (see `pricing.md` — Premium $4.5k/mo down to Content-Only $200/mo).

### 6.8 Marketing Ad Generator

**Files:** `handlers/adGeneration.js`, `adGeneration/{ideation,imageGen,imageUploader}.js`
**States:** `AD_COLLECT_BUSINESS` → `_INDUSTRY` → `_NICHE` → `_TYPE` → `_SLOGAN` → `_PRICING` → `_COLORS` → `_IMAGE` → `AD_SELECT_IDEA` → `AD_CREATING_IMAGE` → `AD_RESULTS`

Flow:
1. Collect business name, industry, product/service, type (Physical / Service / Digital — buttons), slogan, pricing, brand colors, optional reference image (product or logo).
2. `ideation.js` calls **OpenAI GPT-4o** → returns 3 distinct ad concepts (title, description, visual concept). Industry-aware mood guides.
3. User picks a concept (WhatsApp interactive list).
4. `ideation.js` expands the concept into a 150-200 word **Gemini brief** (CTA selection, layout direction, brand integration).
5. `imageGen.js` calls **Gemini `gemini-3-pro-image-preview`** → generates the ad image. Supports product/logo input as base reference.
6. `imageUploader.js` uploads the base64 PNG to Supabase Storage bucket `ad-images` (auto-created public bucket, 10MB limit) → returns public URL.
7. Bot sends the image via `sendImage()`.
8. `AD_RESULTS`: buttons `🔄 New Concepts` / `📣 Full Campaign` / `📋 Back to Menu`.

`user.metadata.adData` persists collected fields, ideas array, selected idea index — cleared on every new ad session.

### 6.9 AI Logo Maker

**Files:** `handlers/logoGeneration.js`, `logoGeneration/{ideation,imageGen,imageUploader}.js`
**States:** `LOGO_COLLECT_BUSINESS` → `_INDUSTRY` → `_DESCRIPTION` → `_STYLE` → `_COLORS` → `_SYMBOL` → `_BACKGROUND` → `LOGO_SELECT_IDEA` → `LOGO_CREATING_IMAGE` → `LOGO_RESULTS`

Distinct from the ad generator (prompts NOT shared):
1. Collects: business name, industry, one-sentence description, style (⚡ Modern / 🏛 Classic / 💎 Luxury — with Playful/Bold via fallback), brand colors (optional), symbol idea (optional), background (⬜ White / 🔲 Transparent / ⬛ Black).
2. **GPT-4o** generates 5 deliberately diverse concepts — one each of: combination, wordmark, symbol, lettermark/emblem/mascot, abstract. Forces type diversity, not variations.
3. User picks a concept → expanded into a 130-word focused logo brief.
4. **Gemini** generates a flat 1024×1024 vector logo. Constraints baked into the prompt: flat design only, no photorealism, no scenes, single centered mark, 2-3 colors max, lower temperature (0.6) for precision.
5. Uploaded to Supabase Storage bucket `logo-images` (auto-created).
6. `LOGO_RESULTS`: buttons `🔄 New Concepts` / `📦 Full Branding` / `📋 Back to Menu`.

### 6.10 White-Label AI Chatbot SaaS (the agency's own product)

**Files:** `chatbot/*`, `handlers/chatbotService.js`
**States:** `CB_COLLECT_NAME` → `_INDUSTRY` → `_FAQS` → `_SERVICES` → `_HOURS` → `_LOCATION` → `CB_GENERATING` → `CB_DEMO_SENT` → `CB_FOLLOW_UP`

This is a productized service the agency sells *through* this WhatsApp bot. End-state: customer gets their own embeddable AI chatbot widget for their website.

Flow:
1. Conversational data collection: business name, industry, top FAQs (multi-turn until "done"), services + prices, hours, address.
2. `services/promptBuilder.js` synthesizes a custom system prompt for the customer's bot.
3. `services/slugGenerator.js` mints a slug → standalone hosted page at `/chat/<slug>` and demo page at `/demo/<slug>`.
4. Bot sends both URLs to the customer via WhatsApp.
5. `CB_DEMO_SENT`: customer can test their bot live on its hosted page.
6. After trial signup → `widget.js` script (served from `/widget.js`) embeds the chatbot on the customer's own site.
7. **REST API at `/api/v1`** for client management, chat traffic, analytics, widget config.
8. **`chatbot/jobs/scheduler.js`** runs every 6h:
   - Trial expiry checks
   - Demo follow-ups (re-engages customers who tested the demo but didn't convert)
   - Monthly usage reports
9. Admin dashboard inside `chatbot/admin/`.

### 6.11 Salon Booking System

**Files:** `booking/`, `webhook/bookingRoutes.js`, `db/appointments.js`, salon template, `salonOwnerCommands.js`

Salon websites generated by Pixie come with a working booking system:
- Static salon site on Netlify hosts the booking UI.
- The site calls back to this server's `/booking/*` API endpoints.
- Appointments stored in Supabase.
- Salon owner manages bookings via WhatsApp commands (intercepted in any state):
  - `bookings` — list upcoming
  - `bookings today` — filter to today
  - `cancel <id>` — cancel
- `jobs/bookingReminders.js` (every 15 min) sends 24h-before customer email reminders.

### 6.12 FAQ / Informative Bot

**File:** `handlers/informativeBot.js` · **State:** `INFORMATIVE_CHAT`

Pure RAG Q&A over the agency's knowledge corpus. Used when the user just wants to learn about services without sales pressure.

### 6.13 Meeting Scheduling

**Files:** `handlers/scheduling.js`, `webhook/calendly.js`, `db/meetings.js`
**States:** `SCHEDULE_COLLECT_DATE` → `SCHEDULE_COLLECT_TIME` → `SCHEDULE_CONFIRM`

1. Collects preferred date + time.
2. Generates a Calendly URL CTA (or directly returns `CALENDLY_URL`).
3. When user books, Calendly webhook (`/calendly`) confirms → meeting persisted.
4. `humanTakeover` may auto-engage near meeting time.

### 6.14 Payments

**Files:** `payments/stripe.js`, `db/payments.js`
- Creates Stripe Checkout payment links.
- Polls payment status every 2 min (started in `index.js`).
- On success, advances the relevant flow (e.g. domain purchased → DNS guide; site approved → invoice → upsell).
- Post-sale upsell email sequence via `jobs/upsellScheduler.js` (daily).

### 6.15 Background Schedulers

All started in `src/index.js`:

| Scheduler | Interval | Purpose |
|---|---|---|
| `followup/scheduler.js` | 30 min | Sales follow-up messages by lead temperature |
| `chatbot/jobs/scheduler.js` | 6 hours | Trial expiry, demo follow-ups, monthly reports |
| `jobs/instagramTokenRefresh.js` | 50 days | Auto-refresh Instagram long-lived token |
| `jobs/upsellScheduler.js` | daily | Post-sale upsell emails |
| `jobs/domainVerifier.js` | 5 min | DNS propagation checks |
| `jobs/siteCleanup.js` | 6 h | Watermark @24h, delete @60d for unpaid sites |
| `jobs/bookingReminders.js` | 15 min | 24h-before salon booking reminders |
| Payment polling | 2 min | Stripe payment status reconciliation |
| Meeting reminder checker | 5 min | Calendly meeting reminders |

### 6.16 Admin Dashboard

**Files:** `admin/{routes,template,dashboard,queries}.js`
- Password-gated (`ADMIN_PASSWORD` env).
- Lists active conversations with state, lead temperature, last activity.
- Renders inline images sent by users (stored as base64 data URLs).
- View full conversation history per user.
- **Take over** button → flips `humanTakeover` flag → bot stops responding to that user; messages still logged so the human can read them.
- Drill into sites generated, audits performed, payments, chatbot SaaS clients.
- Tailwind-via-CDN UI (helmet is bypassed for `/admin` to allow inline scripts and CDN).

### 6.17 Multi-Channel Senders

**Files:** `messages/sender.js`, `channelContext.js`, `whatsappSender.js`, `messengerSender.js`

`AsyncLocalStorage` pins `(channel, phoneNumberId)` for a given inbound turn so all outbound `sendTextMessage` / `sendInteractiveButtons` / `sendImage` / `sendImageWithButtons` / `sendDocument` / `sendList` calls automatically reply through the **same** business number on the **same** channel — even when handlers don't know which channel they're running under. WhatsApp interactive buttons / list messages are auto-degraded to plain text when sent through Messenger or Instagram.

### 6.18 RAG Knowledge Base

**Files:** `knowledge/{loader,embeddings,retriever}.js`, `knowledge/*.md`, `db/knowledge.js`
- Source markdown lives in `knowledge/` (services, pricing, FAQ, case-studies).
- `npm run embed` chunks docs and writes embeddings to Supabase pgvector (`knowledge_chunks` table).
- Retriever does cosine similarity at query time, returns top-K chunks injected into the system prompt.
- Used by `salesBot`, `informativeBot`, and any state that benefits from grounded factual replies.

### 6.19 Click-to-WhatsApp Ad Attribution

In `router.js`, when `message.referral` is present (Meta's CTWA payload) we:
- Identify the product the ad was about (regex over headline + body): `chatbot | web | seo | smm | app | ecommerce | generic`.
- Persist `adSource` and `adReferral` (sourceId, sourceType, headline, body, ctwaClid, platform, timestamp) on the user the first time only.
- The sales bot uses this to auto-route the user into the relevant flow (one-shot guarded by `*Triggered` flags so the user isn't re-pushed into the same flow on every message).

### 6.20 Lead Temperature & Follow-Up

- Auto-tracked: `userMessageCount` updated on every inbound message; `leadTemperature` upgraded `COLD → WARM → HOT` at 5 and 10 messages.
- `followup/scheduler.js` (every 30 min) checks all open leads and sends contextual follow-ups when appropriate, cadence based on temperature and last-activity, recorded in `metadata.followupSteps[]` so we don't spam.

---

## 7. Data Model (Supabase)

| Table | Purpose |
|---|---|
| `users` | phone, channel, business_number_id, state, metadata (JSONB), created_at |
| `conversations` | per-user message log, role (user/assistant), text, type, media data URL, mime, message_id |
| `sites` | generated websites: template, payload JSON, preview_url, status, watermark_at, delete_at |
| `audits` | SEO audit runs: URL, results JSON, PDF path |
| `meetings` | Calendly bookings |
| `appointments` | Salon-site customer bookings |
| `payments` | Stripe sessions + statuses |
| `knowledge_chunks` | RAG corpus chunks + pgvector embeddings |
| `leadSummaries` | LLM-condensed summary of older history (compaction) |
| `llmUsage` | Per-call token + cost telemetry |
| `retry` | Retry queue records |

`user.metadata` JSONB carries flow-scoped sub-objects:

```jsonc
{
  "websiteData": {...}, "currentSiteId": "...", "revisionCount": 2,
  "chatbotData": {...}, "chatbotSlug": "...", "chatbotTrialEndsAt": "...",
  "adData": {...},      // ad generator session
  "logoData": {...},    // logo maker session
  "leadTemperature": "WARM", "userMessageCount": 7,
  "adSource": "chatbot", "adReferral": {...},
  "humanTakeover": false,
  "followupSteps": [...],
  "lastSeoAnalysis": {...}, "lastSeoUrl": "...",
  "websiteDemoTriggered": true, "seoAuditTriggered": false,
  "chatbotDemoTriggered": false, "adGeneratorTriggered": false, "logoMakerTriggered": false
}
```

Storage buckets:
- `ad-images` (public, auto-created, 10 MB max, png/jpeg/webp)
- `logo-images` (public, auto-created, 10 MB max, png/jpeg/webp)
- `generated-sites` (Netlify-hosted preview snapshots / assets)

---

## 8. Environment Variables

```bash
# Required
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_APP_SECRET=
WEBHOOK_VERIFY_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# LLM
LLM_PROVIDER=openai          # or 'claude'
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=              # ad + logo image generation

# Channels
META_PAGE_ACCESS_TOKEN=      # Messenger / Instagram
META_APP_SECRET=

# Integrations
NETLIFY_TOKEN=
STRIPE_SECRET_KEY=
SENDGRID_API_KEY=
CALENDLY_URL=

# App
ADMIN_PASSWORD=
CHATBOT_BASE_URL=            # public host for /chat/<slug> and /widget.js
LANDING_URL=                 # optional redirect for /
PORT=3000
NODE_ENV=development
```

---

## 9. Running Locally

```bash
npm install
npm run embed        # one-time: load knowledge/*.md into pgvector
npm start            # boots Express on PORT (default 3000) + all schedulers
ngrok http 3000      # expose for Meta webhook
# Then in Meta dashboard set webhook to https://<ngrok>/webhook
# Verify token = WEBHOOK_VERIFY_TOKEN
```

Windows: kill the old server before restart — `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force`

Build the public landing site (optional, served at `/`):
```bash
npm run build:landing
```

---

## 10. Security & Operational Hardening

- `helmet` on every route except `/`, `/admin`, `/_next/*`, `/widget.js`, `/chat/*`, `/demo/*` (these need inline scripts / CDN / cross-origin embed).
- `express-rate-limit` — 100 req/min per IP, with `trust proxy` so the real IP is read through ngrok / reverse proxies.
- Webhook signature verification on raw body — `WHATSAPP_APP_SECRET` for WhatsApp, `META_APP_SECRET` for Messenger / Instagram.
- `unhandledRejection` and `uncaughtException` caught and logged via winston so a single bad LLM call doesn't crash the process.
- Admin dashboard gated by `ADMIN_PASSWORD`.
- Stripe webhook signature verified.
- All inbound media downloaded server-side via Meta's media API (with the access token), then re-served from our own URLs.

---

## 11. Adding a New Service Flow

1. Add states to `src/conversation/states.js`.
2. Create `src/conversation/handlers/<feature>.js` exporting `async function handleX(user, message)` returning the next state.
3. Map every state → handler in `STATE_HANDLERS` in `router.js`.
4. Add free-text states to `COLLECTION_STATES` Set so they go through the intent classifier.
5. Add `STATE_QUESTION` entries so the intent classifier knows what's being asked.
6. Add the service to `serviceSelection.js` (list entry, switch case, regex in `matchServiceFromText`).
7. If the flow needs persistence, namespace its data under `user.metadata.<featureData>`. Clear it in the `/reset` block in `router.js` and at the start of each new session.

---

## 12. Known Conventions

- **One handler per flow.** Every state in a flow routes to the same handler; the handler switches on `user.state` internally.
- **Handlers return the new state** (or `undefined` to stay).
- **Never send raw text in collection states** — the intent classifier interceptor runs first and may reroute to off-topic answer + re-ask.
- **Never assume channel** — always use `messages/sender.js`, never call `whatsappSender` or `messengerSender` directly from handlers.
- **Persist anything that survives a turn** in `user.metadata`, not in memory.
- **All LLM calls** go through `llm/provider.js` so the OpenAI/Claude switch and `llm_usage` telemetry are honored.
- **Trigger flags** (`*Triggered`) prevent flows being auto-suggested twice. Reset by `/reset`.
