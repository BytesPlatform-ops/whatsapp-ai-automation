# Pixie — Complete Feature List

Every single thing Pixie can do. Grouped by category. No fluff.

---

## TABLE OF CONTENTS

1. Core Products (what the customer buys)
2. Website Builder — Deep Features
3. Industry Templates (niches)
4. AI Design Tools
5. SEO Audit — Deep Features
6. AI Chatbot SaaS
7. Payments & Checkout
8. Domain Management
9. Conversation Intelligence (how Pixie talks)
10. Multi-Channel Delivery
11. Languages Supported
12. Follow-Up & Retention
13. Lead Capture & CRM
14. Background Jobs (always-on automation)
15. Admin Dashboard
16. Integrations
17. Media Handling
18. Knowledge Base & RAG
19. Security & Reliability
20. Observability & Analytics

---

## 1. CORE PRODUCTS (What the Customer Buys)

| # | Product | Starting Price | Delivery Time |
|---|---|---|---|
| 1 | Instant Website | $199 | ~60 seconds |
| 2 | AI Marketing Ad | Bundled / standalone | ~90 seconds |
| 3 | AI Logo | Bundled / standalone | ~60 seconds |
| 4 | SEO Audit Report | Free | ~30 seconds |
| 5 | SEO Fix Package | $200–$4,500 | 3 months |
| 6 | AI Chatbot SaaS | $97–$599/mo | ~60 seconds demo, 7-day trial |
| 7 | Custom Business Software | Quote | Weeks (scoping call) |
| 8 | Mobile/Web Apps | Quote | Weeks (scoping call) |
| 9 | Social Media Management | $200–$4,500/mo | Ongoing |
| 10 | Custom Domain | $12+/yr (free for 1yr w/ website) | 10–30 min DNS |
| 11 | ByteScart Ecommerce Store | Free | Sign-up link |
| 12 | Meeting Scheduling | Free | Instant |

---

## 2. WEBSITE BUILDER — DEEP FEATURES

### Generation
- Multi-page sites (home, services, about, contact, thank-you + niche-specific)
- Mobile-responsive out of the box
- Automatic brand color extraction from hero image
- Auto-generated professional copy per industry
- Hero image matched to business (Pexels API)
- Service icons from 16 predefined styles
- Palette intelligence — picks readable text colors for any background

### Customization During Chat
- Unlimited revisions while building
- Natural-language color changes ("make it green", "more premium vibe")
- Photo swaps by description ("change hero to coffee beans")
- Text edits ("rewrite the about section", "remove this service")
- Add/remove services, sections, testimonials
- Logo upload and auto-placement
- Colors parsed from any format (hex, named, descriptive)

### Deployment
- Instant deploy to Netlify
- Unique preview URL per user (`business-xxxx.netlify.app`)
- Live link shareable immediately
- Activation banner on preview (synced to chat payment link)
- Auto-watermark after 1 hour unpaid
- Auto-delete from Netlify after 22 hours unpaid
- Per-site paid-status check (refund-safe cleanup)

### Post-Launch
- Redeployer — push revisions without regenerating content
- Contact form lead capture (emails owner via SendGrid)
- `/thank-you` page after form submission
- Form submissions stored in DB (table: `form_submissions`)

---

## 3. INDUSTRY TEMPLATES (Niches)

### HVAC Contractors
- 24/7 Emergency strip (red banner, every page)
- Phone number in 5 places per page
- Dual CTAs: "Free Quote" + "Call Now"
- Trust badges: Licensed, Insured, NATE-certified
- Service area pages (huge for local SEO)
- Upfront pricing hints ("From $89")
- Same-day repair messaging
- Auto-generated neighborhood images

### Real Estate (Solo Agents)
- Editorial design (premium, not spammy)
- Agent-first hero (not house-first)
- Featured listings (up to 3, with photo upload OR AI-generated)
- Neighborhood guides with walkability/schools/prices
- "What's my home worth?" CMA lead form
- Designations display (GRI, CRS, ABR, REALTOR®)
- Multi-angle testimonials (buyers + sellers + investors)
- Brokerage logo (legal requirement in most states)
- Dedicated `/thank-you-cma` page for CMA leads

### Salon / Beauty / Spa
- Luxury editorial imagery
- Service menu with price + duration
- Built-in booking system (see §6)
- Instagram feed embed
- Weekly hours with timezone
- Staff gallery (optional)
- Mobile-first layout
- Split first/last name field handling on contact form
- Standalone `/thank-you` page after booking

### Restaurant / Food (Generic template + food-tuned hero)
- Menu section (item + price)
- Hours + location prominent
- Reservation phone number
- Optional delivery links (DoorDash, UberEats)

### E-commerce (Generic + ByteScart pitch)
- Inline shop for ≤20 products
- Redirect to free ByteScart if >20 products
- Stripe checkout integration (optional)

### Generic (everything else)
- Clean modern design
- Industry-specific copy (consulting, fitness, law, coaching, photography, trades)
- Full process section, FAQ, testimonials, CTA

---

## 4. AI DESIGN TOOLS

### Ad Generator
- 3 distinct concepts (bold/minimal/illustrated — not variations)
- Industry-aware mood (food = warm, tech = clean, fashion = editorial)
- User supplies: business, slogan, price, colors, optional product image
- Gemini 3 Pro image generation
- Regenerate with different style on demand
- Download-ready for Instagram/Facebook/TikTok

### Logo Maker
- 5 concepts of different TYPES (combination mark, wordmark, symbol, lettermark, abstract)
- 1024×1024 resolution
- 3 background options: white, transparent, black
- 5 style options: Modern, Classic, Playful, Luxury, Bold
- User supplies: name, industry, description, colors, optional symbol idea
- Flat professional look (no 3D slop)
- Can auto-drop into website builder

---

## 5. SEO AUDIT — DEEP FEATURES

### Input
- Just a URL. No signup. No email required.

### Analysis Engine
- Page scrape (cheerio HTML parser)
- Google PageSpeed Insights integration
- Rule-based checks (dedicated `ruleChecks.js` module)
- Custom scorer (0–100 with weighted categories)
- LLM-powered qualitative analysis

### Report Contents
- Overall score (0–100)
- SEO category score
- Design category score
- Performance category score (LCP, CLS, mobile)
- Content category score
- Accessibility notes
- Top 3 fixes ranked by impact
- Specific numbers (not "might be slow")

### Output
- WhatsApp summary (<1000 chars)
- Branded PDF report (navy header, page numbers, color-coded scores)
- 4 example audits on landing page (`/examples`) — Buttondown, Cal, Plausible, Sivers

### Upsell
- SEO fix package at $200
- Full SEO campaign tiers: $700 / $1,500 / $3,500 / $4,500

---

## 6. AI CHATBOT SAAS

### Build Flow
- 60-second demo generation
- Collect: business, industry, FAQs, services+prices, hours, location
- Custom instructions support (tone, escalation rules)
- Demo URL: `pixiebot.co/chat/{client-slug}`

### Deployment
- Embeddable widget (one-line script tag)
- Standalone hosted chat page
- Custom widget color per client
- Business-branded (name, tone)

### Capabilities
- 24/7 customer Q&A from knowledge base
- Lead capture (name, email, phone)
- Lead forwarded to owner via email
- Visitor language auto-detection + response
- Semantic search via pgvector embeddings
- Falls back to "I'll have the owner reach you" when unsure

### Analytics (per client, daily)
- Total conversations
- Total messages
- Leads captured
- Unique visitors
- Top questions asked
- Monthly report email

### Subscription Management
- 7-day free trial (no credit card)
- Trial expiry auto-detection
- Tier upgrade/downgrade flow
- Status tracking: demo → trial → active → paused → cancelled
- Instagram token auto-refresh (every 50 days)

---

## 7. PAYMENTS & CHECKOUT

### Stripe Integration
- Payment Links (no account needed by customer)
- Stripe Webhook for instant confirmation
- Backup poller for webhook failures
- Auto-deactivate link after successful payment
- Payment metadata links to user + site
- Superseded-link protection (transient errors don't wrongly mark expired)

### Price Tiers (Websites)
- Landing Page — $200
- Starter — $300
- Mid — $400
- Pro — $650
- Premium — $800
- **Current activation default: $199**

### Payment Plans
- Full upfront (default)
- Split payment (50/50 or 60/40 or 40/30/30)
- Size-based plan rules (under $500 → 60/40, $500–$1500 → 50/50, etc.)
- Split offered only as negotiation (follow-up +12h), not default

### Post-Payment Flow
- Instant banner removal on site
- Confirmation email (branded HTML)
- Receipt via Stripe
- Redirect route `/pay/:id` → Stripe checkout
- `/thank-you` page with confetti on landing site
- Refund handler (preserves site if refund issued)

### Customer-Friendly Details
- No account creation required
- Stripe receipt auto-sent
- Mobile-optimized checkout
- Link expiry protection

---

## 8. DOMAIN MANAGEMENT

### Features
- Namecheap integration
- Availability search (returns 3–5 options)
- Price disclosure upfront
- One-tap purchase via Stripe
- Auto DNS configuration (points to Netlify)
- DNS propagation verifier (checks every 5 min)
- WhatsApp notification when live
- WHOIS privacy included
- First-year free if bundled with website

### What the Customer Doesn't Do
- No GoDaddy signup
- No DNS record configuration
- No A/CNAME/MX confusion
- No support tickets

---

## 9. CONVERSATION INTELLIGENCE (How Pixie Talks)

### Guided Dynamic Flow
- No menus, no buttons
- One question at a time, fixed checklist per flow
- Every reply ends with next question OR delivered outcome
- Skips questions when user volunteers info early

### Smart Extraction
- Regex fast-path for emails/phones/simple answers
- LLM-first multi-field extraction for rich messages
- Single message can fill 5+ fields simultaneously
- Zero data corruption (dedicated fix in `1f667de`)

### Intent Classifier
- Distinguishes answer vs. question vs. menu vs. exit
- Short-circuits on obvious cases to save LLM cost
- Protects against premature menu reset mid-flow

### Entity Accumulator
- Remembers data across conversation turns
- Merges rapid corrections ("wait it's actually Glow, not Glam")
- Persists across sessions (come back next week, Pixie remembers)

### Message Buffering
- Merges rapid user bursts into single turn
- Avoids responding to each fragment separately
- Natural for real human typing patterns

### Undo Stack
- "Wait go back" pops the flow one step
- Reverses last Pixie question
- Never loses earlier collected data

### Rolling Conversation Summary
- Long chats get summarized to stay in LLM context
- Summary updated per N messages
- Enables multi-day conversations without context loss

### Sales Personas (automatic selection)
- COOL — casual, emoji-friendly
- PROFESSIONAL — formal, reserved
- UNSURE — gentle, reassuring
- NEGOTIATOR — price-conscious, split-payment offers
- DEFAULT — balanced

### Smart Defaults
- Missing services? Pixie fills industry-standard defaults
- Missing hours? Pixie uses industry-typical hours
- Never blocks on optional fields

### Revision Parser
- Classifies revisions: APPROVAL / IMAGE_SWAP / REVISION / UNCLEAR
- Handles natural language edits
- Only touches fields the user mentioned
- Re-deploys incrementally

### Objection Handler
- Dedicated module (`objectionHandler.js`)
- Detects: "not interested", "too expensive", "maybe later", "stop"
- Hard-no → permanent opt-out, cancel all follow-ups
- Price objection → offer split/discount (once)
- Soft-no → one gentle nudge at +48h
- Never argues, never guilt-trips

### Scope Guardrail
- Off-topic input never rejected
- Warmly redirected back to active flow
- Universal rule: every reply moves toward delivery

---

## 10. MULTI-CHANNEL DELIVERY

### Supported Channels
- **WhatsApp Business Cloud API** (primary)
- **Facebook Messenger**
- **Instagram Direct Messages**

### Channel-Specific Features
- WhatsApp: interactive buttons, documents (PDF), images with captions, voice messages
- Messenger: text buttons, images, quick replies
- Instagram: text + image (no document support)

### Per-Line Support
- Multiple WhatsApp business numbers on same bot
- Each number gets independent session context
- AsyncLocalStorage pins replies to correct number
- Migration `012_per_line_sessions`

### Ad Attribution
- Detects Meta ad click → captures ad ID, campaign, UTM
- Greeting adapts to ad clicked:
  - Website ad → opens with website talk
  - SEO ad → asks for URL immediately
  - Ecommerce ad → pushes ByteScart
  - Chatbot ad → starts chatbot flow

---

## 11. LANGUAGES SUPPORTED

- English
- Hindi
- Urdu / Roman Urdu
- Arabic
- Spanish
- French
- (More on request)

### Language Handling
- Auto-detected from first message
- Session locked to that language
- No mid-sentence switching
- Pixie switches if user switches
- Localizer utility for responses
- Multilingual humanize pass (`b1675dc`)
- Prices stay USD, conversation stays local

---

## 12. FOLLOW-UP & RETENTION

### Ladder (after payment link sent)
- **+2 hours** (1h HOT, 4h COLD) — gentle reminder
- **+12 hours** — offer payment split
- **+23 hours** — final discount ($80 flat from $100)
- **Post-23h silence** — archive, stop contacting

### Personality-Matched Messages
- Each step has 5 variants (COOL, PROFESSIONAL, UNSURE, NEGOTIATOR, DEFAULT)
- Selected based on detected persona
- No copy-paste templates

### SEO Follow-Up
- Single nudge at +24h
- Quotes the biggest issue found
- Then permanent silence

### Post-Sale Check-Ins (Upsell Scheduler)
- **Day 7** — Google Business Profile setup
- **Day 30** — SEO campaign pitch
- **Day 60** — WhatsApp chat widget add-on
- **Day 90** — Site refresh + new services

### Opt-Out System
- Hard-no detection → permanent follow-up block
- Respected across all future campaigns
- Stored in `metadata.followupOptOut`

### Lead Temperature Tracking
- Auto-updated: COLD → WARM → HOT
- Based on message count + engagement
- Affects follow-up timing and persona selection

---

## 13. LEAD CAPTURE & CRM

### Lead Brief Extraction
- LLM-generated summary from conversation
- Tagged between `[LEAD_BRIEF]...[/LEAD_BRIEF]` in responses
- Captures: temperature, closing technique used, decision blockers
- Stored in `lead_summaries` table

### Contact Form Leads (from deployed sites)
- Form submission captures name, email, phone, message
- Cross-origin route (`src/leads/routes.js`)
- Stored in DB (`form_submissions`)
- Email sent to site owner via SendGrid

### Meeting Brief (for Calendly bookings)
- Triggered on `invitee.created` webhook
- LLM reads full conversation history
- Generates sales brief: client context, needs, objections, pitch angle
- Emailed to internal project specialist
- Calendly webhook auto-matches user by phone → email → name

### Customer Memory
- Every interaction logged
- Business profile persists (name, industry, colors, logo, contact)
- Past projects visible for reference
- Pick-up-where-left-off — come back in a week, Pixie remembers

---

## 14. BACKGROUND JOBS (Always-On Automation)

| Job | Cadence | Purpose |
|---|---|---|
| Follow-up scheduler | Every 30 min | Send reminder ladder |
| Domain verifier | Every 5 min | Confirm DNS propagation |
| Site cleanup | Every 15 min | Watermark @ 1h, delete @ 22h |
| Booking reminders | Every 15 min | 24h-before salon reminders |
| Upsell scheduler | Daily | Day 7/30/60/90 post-sale emails |
| Instagram token refresh | Every 50 days | Refresh tokens before 60-day expiry |
| Chatbot scheduler | Daily | Trial expiry + monthly reports |
| Payment poller | Fallback | Catches missed Stripe webhooks |

---

## 15. ADMIN DASHBOARD

### Auth
- HMAC-SHA256 token auth
- HttpOnly cookie session
- No public registration

### Views
- Recent users (sortable by state, temperature)
- Full conversation transcripts (with media previews)
- Generated site previews (click to view)
- Payment records (pending, paid, refunded)
- SEO audit PDFs downloadable
- Calendly meetings with summaries
- Chatbot client management (tiers, trials, analytics)
- Contact form submissions

### Actions
- Flag user for human takeover
- Send manual messages (via WhatsApp as Pixie)
- Download SEO audit PDFs
- Preview generated sites
- View ad referral sources
- Resume bot control

### Analytics
- Lead temperature distribution
- Conversion funnel (WELCOME → SALES → PAID)
- Revenue by service/tier
- Top-performing ad campaigns
- Chatbot engagement metrics
- LLM usage + cost per operation

---

## 16. INTEGRATIONS

| Service | What For |
|---|---|
| **OpenAI (GPT-4o-mini / GPT-5)** | Primary LLM |
| **Anthropic Claude Sonnet 4** | Fallback LLM |
| **Google Gemini 3 Pro** | Image generation (ads, logos, listings, neighborhoods) |
| **OpenAI Whisper** | Voice message transcription |
| **OpenAI Embeddings** | pgvector semantic search |
| **Meta WhatsApp Cloud API** | Primary channel |
| **Meta Graph API** | Messenger + Instagram DMs |
| **Stripe** | Payments (links + webhooks) |
| **Netlify** | Website deployment |
| **Namecheap** | Domain registration + DNS |
| **SendGrid** | Transactional emails |
| **Calendly** | Meeting scheduling + webhooks |
| **Pexels** | Stock photography (hero images) |
| **Google PageSpeed Insights** | SEO performance scoring |
| **Supabase** | PostgreSQL + auth |
| **pgvector** | Semantic search embeddings |

---

## 17. MEDIA HANDLING

### Incoming
- Image messages (logos, product photos, property photos) — stored as base64 data URIs
- Audio messages — transcribed via Whisper, stored as text
- Documents — parsed (menu PDFs extracted to structured data)
- Contact cards — phone + name extracted

### Outgoing
- Text messages (auto-split at 1024-char WhatsApp limit)
- Images with captions
- PDF documents (SEO reports)
- Interactive buttons
- CTA buttons (pay link, Calendly, preview URL)
- Typing indicator before every response
- Mark-as-read on receipt

### Image Processing
- Hero image: Pexels API search → download → optimize
- Service icons: 16-option selection + Gemini fallback
- Neighborhood images: Gemini generation
- Real estate listings: upload OR Gemini generation
- Palette extraction: dominant-color analysis from hero
- Color utilities: HSL manipulation for primary/secondary derivation

---

## 18. KNOWLEDGE BASE & RAG

- Markdown files → chunked → OpenAI embeddings → pgvector
- IVFFlat index for fast retrieval
- Used by: Informative chatbot (answers from client's FAQ docs)
- Similarity search with confidence threshold
- Falls back to "I'll have the owner reach you" below threshold
- Client-specific KB per chatbot instance

---

## 19. SECURITY & RELIABILITY

### Security
- Helmet.js security headers
- Rate limiting (100 req/min per IP)
- HMAC admin auth
- Calendly webhook signature verification
- Stripe webhook signature verification
- Raw body capture for signatures
- Environment variable validation at startup
- No secrets in logs

### Reliability
- Graceful LLM provider fallback (OpenAI → Claude)
- Stripe webhook + poller redundancy
- DNS verifier retries for 7 days
- Winston logger (console + file)
- Unhandled promise rejection capture
- Migration tracking (idempotent on restart)
- Transient Stripe error protection (don't wrongly expire)

---

## 20. OBSERVABILITY & ANALYTICS

### LLM Tracking
- Per-call logging: tokens, cost, operation type, user ID
- Cached token tracking (prompt caching stats)
- Cost attribution by flow
- Model-specific pricing table (`llm/pricing.js`)

### Conversation Tracking
- Every message stored with sequence number
- Media attachments preserved
- Role + message type per row
- Rolling summary for long chats

### Business Metrics
- Payments by service type + tier
- Conversion rate per flow
- Ad campaign attribution
- Chatbot analytics (daily per-client)
- Lead capture counts

---

## APPENDIX — UNDER-THE-HOOD FEATURES THE CUSTOMER NEVER SEES

- Smart message batching (merge rapid bursts)
- AsyncLocalStorage channel context
- LLM provider abstraction
- Per-line session routing
- Entity accumulator across turns
- Rolling conversation summary
- Undo stack for flow navigation
- Revision parser with field-level diffing
- Template auto-router (industry → template)
- Palette extraction from hero
- Hours parser (handles "mon-fri 10-6", "weekdays 9-5", etc.)
- Color parser (hex, named, descriptive like "dusty rose")
- Watermark injection system
- Activation banner gating
- Redeployer for incremental updates
- Payment link deactivation on success
- Superseded-link protection
- Refund-safe site cleanup
- Lead temperature auto-scoring
- Opt-out respect layer
- Rate limiting per IP + per user
- Multi-language humanize pass
- Ad referral tracking + greeting personalization
- Form submissions cross-origin capture
- Booking conflict prevention
- Calendly invitee matching (phone → email → name → fallback)
- Meeting brief LLM generation
- PageSpeed + rule checks + scorer for SEO
- Embedded vs. hosted chatbot modes

---

## SUMMARY

Pixie is **10 products + 20 intelligence systems + 8 automated jobs + 16 integrations**, all packaged into a single WhatsApp chat.

Customer sees: **"send message → get thing."**
Under the hood: **a full-stack agency platform running in the background.**