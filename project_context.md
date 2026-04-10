# Project Context — WhatsApp AI Automation Platform

**Company:** BytesPlatform  
**Last Updated:** 2026-04-07  
**Branch:** designv1

---

## What This Project Does

A multi-channel AI-powered sales and service automation platform for a digital agency (BytesPlatform). Users interact via WhatsApp (primary), Facebook Messenger, or Instagram DMs. The bot handles lead generation, service delivery, and follow-ups automatically.

---

## Core Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js + Express 5 (CommonJS) |
| Database | Supabase (PostgreSQL + pgvector) |
| Primary LLM | OpenAI GPT-4o-mini (LLM_PROVIDER=openai) |
| Fallback LLM | Anthropic Claude (claude-sonnet-4) |
| Image Generation | Google Gemini (gemini-3-pro-image-preview) |
| Channels | Meta WhatsApp Cloud API, Messenger, Instagram |
| Payments | Stripe |
| Website Deploy | Netlify |
| Embeddings | OpenAI text-embedding-3-small (pgvector RAG) |

---

## Services the Bot Offers

| Service | Trigger | Handler |
|---|---|---|
| 🔍 Free SEO Audit | svc_seo | handlers/seoAudit.js |
| 🌐 Website Development | svc_webdev | handlers/webDev.js |
| 📱 App Development | svc_appdev | handlers/appDev.js |
| 📈 Digital Marketing | svc_marketing | handlers/marketing.js |
| 🎨 Marketing Ad Generator | svc_adgen | handlers/adGeneration.js ← NEW |
| 🤖 AI Chatbot SaaS | svc_chatbot | handlers/chatbotService.js |
| ❓ FAQ & Support | svc_info | handlers/informativeBot.js |
| 💬 Talk to Sales | svc_general | handlers/salesBot.js |

---

## Project Structure

```
src/
├── index.js                        # Express app entry point
├── config/
│   ├── env.js                      # Env vars + validation
│   └── database.js                 # Supabase client
├── webhook/
│   ├── routes.js                   # WhatsApp webhook (GET verify + POST receive)
│   ├── parser.js                   # WhatsApp payload parser
│   ├── messengerRoutes.js          # Messenger/Instagram webhook
│   ├── messengerParser.js          # Messenger payload parser
│   └── calendly.js                 # Calendly webhook
├── conversation/
│   ├── router.js                   # Main message router + intent classifier
│   ├── states.js                   # All conversation state constants
│   └── handlers/
│       ├── welcome.js
│       ├── serviceSelection.js
│       ├── seoAudit.js
│       ├── webDev.js
│       ├── appDev.js
│       ├── marketing.js
│       ├── adGeneration.js         # ← NEW: AI ad image generation
│       ├── scheduling.js
│       ├── salesBot.js
│       ├── informativeBot.js
│       ├── chatbotService.js
│       └── customDomain.js
├── adGeneration/                   # ← NEW: Ad generation pipeline
│   ├── ideation.js                 # OpenAI GPT-4o: generates 3 ad concepts
│   ├── imageGen.js                 # Gemini: generates ad image from prompt
│   └── imageUploader.js            # Supabase Storage: hosts generated images
├── llm/
│   ├── provider.js                 # Routes to Claude or OpenAI
│   ├── claude.js                   # Anthropic SDK
│   ├── openai.js                   # OpenAI SDK
│   ├── prompts.js                  # All system prompts
│   └── transcribe.js               # Audio → text (Whisper)
├── knowledge/
│   ├── loader.js                   # Markdown → chunks → embeddings (run: npm run embed)
│   ├── embeddings.js               # Batch embedding generation
│   └── retriever.js                # Vector similarity search (RAG)
├── messages/
│   ├── sender.js                   # Channel-aware facade
│   ├── channelContext.js           # AsyncLocalStorage for channel detection
│   ├── whatsappSender.js           # WhatsApp Cloud API client
│   ├── messengerSender.js          # Messenger/Instagram API client
│   └── templates.js                # Message templates
├── db/
│   ├── users.js                    # findOrCreateUser, updateUserState, updateUserMetadata
│   ├── conversations.js            # logMessage, getConversationHistory
│   ├── sites.js                    # Generated website records
│   ├── audits.js                   # SEO audit records
│   ├── meetings.js                 # Calendly meeting records
│   ├── knowledge.js                # RAG knowledge chunks
│   ├── payments.js                 # Stripe payment records
│   └── migrations/                 # SQL schema files
├── chatbot/                        # White-label AI Chatbot SaaS feature
│   ├── api/                        # REST API (clients, chat, analytics, widget)
│   ├── db/                         # Chatbot-specific DB layer
│   ├── jobs/                       # Trial expiry + demo follow-up scheduler
│   ├── services/                   # Prompt builder, slug generator
│   ├── pages/                      # Demo + standalone pages
│   ├── widget/                     # Embeddable JS widget
│   └── admin/                      # Admin dashboard
├── followup/
│   └── scheduler.js                # Sales follow-up every 30 min
├── jobs/
│   └── instagramTokenRefresh.js    # Auto-refresh Instagram token every 50 days
├── payments/
│   └── stripe.js                   # Stripe payment link creation + status polling
├── analysis/                       # Website scraper + SEO analyzer
├── website-gen/                    # Website generation + Netlify deployment
├── admin/                          # Admin dashboard routes + UI
└── utils/                          # Logger, formatters, validators

knowledge/                          # Markdown docs for RAG knowledge base
├── services.md
├── pricing.md
├── faq.md
└── case-studies.md
```

---

## Key Environment Variables

```bash
# Required
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WEBHOOK_VERIFY_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# LLM
LLM_PROVIDER=openai          # or 'claude'
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=              # ← NEW: required for ad image generation

# Integrations
NETLIFY_TOKEN=
STRIPE_SECRET_KEY=
META_PAGE_ACCESS_TOKEN=      # Messenger/Instagram
META_APP_SECRET=
CALENDLY_URL=

# App
ADMIN_PASSWORD=
CHATBOT_BASE_URL=
PORT=3000
NODE_ENV=development
```

---

## How to Run

```bash
npm install              # Install dependencies
npm start                # Start server (port 3000)
npm run embed            # Load knowledge base (markdown → Supabase pgvector)
```

**Local development with ngrok:**
```bash
ngrok http 3000
# Set webhook URL in Meta Developer Console:
# https://xxxx.ngrok-free.dev/webhook
# Verify token: value of WEBHOOK_VERIFY_TOKEN
```

**Kill old server on Windows before restarting:**
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
```

---

## Ad Generation Flow (NEW — integrated from Design-Automation-V2)

```
User → "🎨 Marketing Ads" (service menu)
  ↓
Bot collects: business name → industry → product → type → slogan → pricing → image (optional)
  ↓
OpenAI GPT-4o generates 3 ad concepts (ideation.js)
  ↓
User picks one concept (WhatsApp list message)
  ↓
OpenAI GPT-4o expands concept → 150-200 word Gemini prompt (ideation.js)
  ↓
Google Gemini generates ad image (imageGen.js)
  ↓
Image uploaded to Supabase Storage bucket "ad-images" (imageUploader.js)
  ↓
Bot sends image via WhatsApp sendImage()
```

**State flow:**
`AD_COLLECT_BUSINESS` → `AD_COLLECT_INDUSTRY` → `AD_COLLECT_NICHE` → `AD_COLLECT_TYPE` → `AD_COLLECT_SLOGAN` → `AD_COLLECT_PRICING` → `AD_COLLECT_IMAGE` → `AD_SELECT_IDEA` → `AD_CREATING_IMAGE` → `AD_RESULTS`

---

## Conversation State Machine

Every user has a `state` in the database. The router in `conversation/router.js` maps each state to a handler. State transitions happen by returning a new state from the handler.

**Special commands (work from any state):**
- `/reset` — clears state, metadata, and conversation history
- `/menu` — goes to service selection

**Intent classifier** runs on free-text input in collection states to detect if user is asking a question vs answering the current prompt.

---

## Database Schema (Supabase)

Main tables: `users`, `conversations`, `sites`, `audits`, `meetings`, `payments`, `knowledge_chunks`  
Storage buckets: `ad-images` (public, auto-created), `generated-sites` (Netlify previews)

User metadata (JSONB) stores flow-specific data:
- `websiteData` — web dev flow
- `chatbotData` — chatbot SaaS flow
- `adData` — ad generation flow ← NEW
- `adSource`, `adReferral` — Click-to-WhatsApp ad tracking

---

## Background Schedulers (auto-start on `npm start`)

| Scheduler | Interval | Purpose |
|---|---|---|
| followup/scheduler.js | 30 min | Sales follow-up messages |
| chatbot/jobs/scheduler.js | 6 hours | Trial expiry + demo follow-ups |
| jobs/instagramTokenRefresh.js | 50 days | Instagram token auto-refresh |

---

## Notes for Developers

- All handlers in `src/conversation/handlers/` follow the same pattern: `async function handleX(user, message)` → returns next state
- Add new services by: (1) adding states in `states.js`, (2) creating handler, (3) mapping in `router.js`, (4) adding option to `serviceSelection.js`
- `INTEGRATION_CHANGES.md` documents the ad generation integration specifically (for merging with colleague's work)
- The `Design-Automation-V2/` folder is a separate Next.js project — not part of this repo (gitignored)
- Webhook signature verification uses `WHATSAPP_APP_SECRET` for WhatsApp and `META_APP_SECRET` for Messenger/Instagram
