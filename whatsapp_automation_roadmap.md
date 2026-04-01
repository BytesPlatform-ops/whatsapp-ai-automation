# WhatsApp AI Automation — Complete Step-by-Step Roadmap

---

## Phase 0: Prerequisites & Accounts Setup

### Step 1: Create a Meta Business Account
- Go to **business.facebook.com** and create a Meta Business Account (or use an existing one).
- Complete business verification (requires business documents — this can take 1–7 days).
- This is mandatory. Without verification, you're stuck in sandbox mode with limited functionality.

### Step 2: Create a Meta App
- Go to **developers.facebook.com** → My Apps → Create App.
- Choose app type: **Business**.
- On the app dashboard, find **WhatsApp** in the product list and click **Set Up**.
- This gives you access to the WhatsApp Business Platform (Cloud API).

### Step 3: Set Up a WhatsApp Business Phone Number
- You can use Meta's **test phone number** (free, for development only — can only message numbers you manually add).
- For production, register your own phone number:
  - Must be a number that can receive SMS or voice calls for verification.
  - Once registered with WhatsApp Business API, it **cannot** be used on regular WhatsApp or WhatsApp Business app simultaneously.
- Go to **WhatsApp > Getting Started** in your app dashboard to register the number.

### Step 4: Generate a Permanent Access Token
- In the app dashboard, go to **WhatsApp > API Setup**.
- You'll see a temporary token (expires in 24 hours — only for testing).
- For production, create a **System User** in Business Settings:
  1. Business Settings → Users → System Users → Add.
  2. Give it Admin role.
  3. Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
  4. This token does **not** expire.

### Step 5: Get Your Phone Number ID and Business Account ID
- Found in WhatsApp > API Setup on the dashboard.
- You'll need these for every API call.
- Save them as environment variables: `PHONE_NUMBER_ID`, `WABA_ID`, `ACCESS_TOKEN`.

---

## Phase 1: Backend Server Setup

### Step 6: Choose Your Tech Stack
Recommended stack for this project:

| Component | Technology | Why |
|---|---|---|
| Runtime | Node.js (Express) or Python (FastAPI) | Both have excellent Meta SDK support |
| Database | PostgreSQL | Conversation history, user data, session state |
| Cache | Redis | Fast session lookups, rate limiting, temp data |
| LLM | Claude API (Anthropic) | Website analysis, intelligent responses |
| Vector DB | Pinecone or Qdrant | RAG knowledge base for services info |
| Hosting | VPS (DigitalOcean/AWS/Railway) | Needs to be always-on for webhooks |
| Website Gen | Vercel or Netlify (API deploys) | For deploying generated preview sites |

### Step 7: Set Up Your Server with Webhook Endpoint
Your server needs two things:
1. **GET endpoint** — for Meta's webhook verification (one-time handshake).
2. **POST endpoint** — for receiving incoming messages in real-time.

The verification flow:
- You provide Meta a webhook URL (e.g., `https://yourdomain.com/webhook`).
- Meta sends a GET request with a `hub.verify_token` you define.
- Your server responds with the `hub.challenge` value.
- Meta confirms the webhook is yours.

After that, every time someone messages your WhatsApp number, Meta sends a POST request to your webhook with the message payload.

### Step 8: Configure the Webhook in Meta Dashboard
- Go to **WhatsApp > Configuration** in the app dashboard.
- Set your webhook URL (must be HTTPS — use ngrok for local development).
- Set your verify token (any string you choose, must match your server code).
- Subscribe to the **messages** webhook field.

### Step 9: Set Up ngrok for Local Development
- Install ngrok and run `ngrok http 3000` (or your server port).
- Copy the HTTPS URL and use it as your webhook URL in Meta dashboard.
- Every time ngrok restarts, the URL changes — update it in Meta dashboard.
- For production, use your actual domain with SSL.

---

## Phase 2: Core Message Handling

### Step 10: Build the Message Router
When a message arrives at your webhook, the payload contains:
- The sender's phone number.
- The message type (text, image, document, interactive reply, etc.).
- The message content.

Build a router that:
1. Extracts the sender's phone number.
2. Looks up their conversation state in the database (new user? mid-flow? waiting for input?).
3. Routes to the appropriate handler based on state + message content.

### Step 11: Build the Conversation State Machine
Design your conversation as a state machine. Example states:

```
WELCOME → SERVICE_SELECTION → [branch based on service]
  ├─ SEO_AUDIT → COLLECT_URL → ANALYZING → RESULTS → FOLLOW_UP
  ├─ WEB_DEV → COLLECT_REQUIREMENTS → GENERATE_PREVIEW → REVIEW
  ├─ APP_DEV → COLLECT_REQUIREMENTS → PROPOSAL → FOLLOW_UP
  └─ MARKETING → COLLECT_DETAILS → STRATEGY → FOLLOW_UP
```

Store the current state per phone number in your database. Every incoming message checks the state and decides what to do next.

### Step 12: Create WhatsApp Message Templates
You need Meta-approved templates for:
- **Welcome/greeting** — first message when someone reaches out.
- **Follow-up** — if the 24-hour window expires and you need to re-engage.
- **Audit report ready** — notification that their website analysis is complete.
- **Proposal ready** — to send back after generating a site or strategy.

Go to **WhatsApp > Message Templates** in the dashboard, create each one, and wait for approval (usually 1–24 hours).

### Step 13: Implement Interactive Messages
Use WhatsApp's built-in interactive message types:
- **Reply Buttons** (max 3 buttons) — perfect for "SEO | Web Dev | Marketing" service selection.
- **List Messages** (max 10 items in sections) — for more detailed service menus.
- **CTA Buttons** — for "View Your Website" with a URL button.

These are sent via the Messages API as structured JSON — not plain text.

---

## Phase 3: Feature 1 — Website Analysis & Smart Pitching

### Step 14: Build the Website Scraper/Analyzer
When a user sends their URL, your backend should:
1. **Validate** the URL.
2. **Scrape** the website — use Puppeteer/Playwright (for JS-rendered sites) or Cheerio/BeautifulSoup (for static sites).
3. **Extract**: page titles, meta descriptions, heading structure, image alt tags, page speed data (via Google PageSpeed API), mobile responsiveness, SSL status, broken links.
4. **Feed everything to Claude** with a system prompt like: "You are a digital agency consultant. Analyze this website data and identify issues in SEO, design, performance, and content. Provide a concise pitch for our services."

### Step 15: Format and Send the Analysis
Claude's response will be long. Break it into:
1. **Quick summary** (1 text message, under 4096 chars) — "We found 5 critical issues with yoursite.com."
2. **Detailed report** — generate as a PDF and send as a document attachment.
3. **CTA** — interactive button: "Want us to fix these?" / "Get a free quote" / "See our portfolio."

### Step 16: Handle the Follow-Up Conversation
After sending the analysis, the bot should be ready for:
- Questions about specific findings ("What's wrong with my SEO?").
- Pricing inquiries ("How much would this cost?").
- Objection handling ("I already have an SEO guy").

This is where the LLM + conversation history shines. Pass the full conversation context to Claude for each reply.

---

## Phase 4: Feature 2 — Knowledge-Based Intelligent Replies

### Step 17: Build Your Knowledge Base
Prepare documents covering:
- Your agency's services, pricing tiers, packages.
- Case studies and portfolio descriptions.
- FAQs (turnaround times, revision policies, tech stack, process).
- SEO best practices, web dev trends, marketing strategies.
- Competitor comparisons (why you're better).

### Step 18: Set Up RAG (Retrieval-Augmented Generation)
1. **Chunk** your documents into meaningful sections (500–1000 tokens each).
2. **Generate embeddings** for each chunk (use Anthropic's or OpenAI's embedding API, or an open-source model).
3. **Store** in a vector database (Pinecone, Qdrant, Weaviate, or even pgvector in PostgreSQL).
4. **At query time**: embed the user's question → find top 3–5 relevant chunks → pass them to Claude as context → get a grounded, accurate response.

### Step 19: Implement Context-Aware Responses
For each incoming message:
1. Retrieve conversation history (last 10–20 messages) from the database.
2. Retrieve relevant knowledge chunks from the vector DB.
3. Construct a prompt for Claude with: system instructions + knowledge context + conversation history + current message.
4. Send to Claude API, get response, send back via WhatsApp.

---

## Phase 5: Feature 3 — Website Generation & Live Preview

### Step 20: Define Website Templates
Create 3–5 base templates for common business types:
- Local business / service provider.
- E-commerce / product showcase.
- Professional / portfolio.
- Restaurant / food service.
- SaaS / tech startup.

These can be Next.js, HTML/Tailwind, or any static site template. The key is they should be data-driven — inject business name, colors, content, images into template variables.

### Step 21: Build the Info Collection Flow
Through the WhatsApp conversation, collect:
1. Business name.
2. Industry/niche (use list message for selection).
3. Services offered (free text or structured).
4. Preferred colors/style (show options with image messages — send sample palettes).
5. Logo (user sends as image attachment — download via Media API).
6. Contact details.

Store all collected data in the database tied to the user's phone number.

### Step 22: Generate the Website
1. Take collected info + chosen template.
2. Use Claude to generate page copy (headline, about section, service descriptions, CTA text) based on the business info.
3. Inject everything into the template.
4. Deploy to a preview URL.

### Step 23: Deploy Preview Sites
Options:
- **Vercel API**: Use their deployment API to programmatically deploy a site. Each preview gets a unique URL like `preview-abc123.vercel.app`.
- **Netlify API**: Similar — deploy via API, get a unique URL.
- **Your own server**: Use a wildcard subdomain (`abc123.preview.yourdomain.com`) and serve generated sites from a directory.

### Step 24: Send the Preview Link
Once deployed:
1. Send a text message: "Your website preview is ready!"
2. Send a CTA button message with the preview URL.
3. WhatsApp will show a link preview with the site's title and thumbnail.
4. Ask for feedback: "What would you like to change?" — loop back into the conversation.

### Step 25: Handle Revisions
The user says "Change the color to blue" or "Add a testimonials section":
1. Parse the request with Claude.
2. Update the template data.
3. Redeploy.
4. Send the updated preview link.
5. Repeat until approved.

---

## Phase 6: Production Deployment

### Step 26: Deploy Your Backend
- Use a cloud VPS (DigitalOcean Droplet, AWS EC2, Railway, Render).
- Set up with Docker for easy deployment and scaling.
- Ensure HTTPS (use Let's Encrypt / Caddy / Cloudflare).
- Point your domain to the server.
- Update the webhook URL in Meta dashboard to your production domain.

### Step 27: Set Up Monitoring & Logging
- Log every incoming message and outgoing response.
- Monitor webhook delivery failures (Meta retries for up to 7 days).
- Set up alerts for: server downtime, high error rates, API quota limits.
- Tools: PM2 (Node.js), Sentry (errors), Grafana (metrics).

### Step 28: Handle Rate Limits & Scaling
- Meta's messaging tiers: start at 1K conversations/day, scale to 10K → 100K → unlimited.
- Quality rating matters — if users block/report you, your rating drops and limits decrease.
- Queue outgoing messages if you approach limits (use Redis + Bull/BullMQ for job queues).

### Step 29: Implement Message Queuing
Don't process messages synchronously in the webhook handler:
1. Webhook receives message → immediately respond with 200 OK to Meta.
2. Push message to a job queue (Redis/Bull, RabbitMQ, SQS).
3. Worker picks up the job, processes it (LLM call, scraping, etc.), sends the response.

This prevents webhook timeouts and allows you to handle bursts.

### Step 30: Set Up the Database Schema
Key tables:
- **users**: phone_number, name, business_name, state, created_at.
- **conversations**: user_id, message, role (user/bot), timestamp.
- **website_audits**: user_id, url, results_json, report_pdf_path, created_at.
- **generated_sites**: user_id, template_id, site_data_json, preview_url, status.
- **knowledge_base**: chunk_id, content, embedding_vector, source_doc, category.

---

## Phase 7: Polish & Optimization

### Step 31: Add Human Handoff
Not every conversation can be handled by AI. Build a handoff mechanism:
- If the bot detects confusion, frustration, or complex requirements → notify a human agent.
- Use a dashboard (or forward to a WhatsApp group) where your team can take over.
- When a human takes over, pause the bot for that user.

### Step 32: Add Payment Integration
When a user approves a website or wants to proceed with a service:
- Send a payment link (Stripe Checkout, PayPal) via CTA button.
- Or integrate with WhatsApp Payments (limited country availability).
- On payment confirmation (webhook from payment provider), update the user's status and trigger the next step.

### Step 33: Build an Admin Dashboard
A simple web dashboard showing:
- Active conversations and their states.
- Website audits performed.
- Sites generated and their status.
- Revenue / conversion tracking.
- Ability to manually intervene in conversations.

### Step 34: Test Thoroughly
- Test the full flow end-to-end with the Meta test number.
- Test edge cases: user sends an image instead of text, user goes silent mid-flow, user sends gibberish, user sends multiple messages quickly.
- Test the 24-hour window expiry and template fallback.
- Load test your webhook endpoint.

---

## Architecture Overview

```
User (WhatsApp)
    │
    ▼
Meta Cloud API ──webhook──▶ Your Server (Express/FastAPI)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              Message       Job Queue     Database
              Router       (Redis/Bull)  (PostgreSQL)
                │               │
                ▼               ▼
          State Machine    Workers:
          (per user)       ├─ LLM Handler (Claude API)
                           ├─ Website Scraper (Puppeteer)
                           ├─ RAG Engine (Vector DB)
                           ├─ Site Generator (Templates)
                           └─ Site Deployer (Vercel API)
                                │
                                ▼
                          Response ──▶ WhatsApp Messages API ──▶ User
```

---

## Implementation Order (Recommended)

| Priority | What to Build | Estimated Time |
|---|---|---|
| 1 | Meta account + app + webhook setup | 1–2 days |
| 2 | Basic message receiving + responding | 1 day |
| 3 | Conversation state machine + service menu | 2–3 days |
| 4 | Claude integration for intelligent replies | 1–2 days |
| 5 | Website scraper + analysis pipeline | 3–4 days |
| 6 | Knowledge base + RAG system | 3–4 days |
| 7 | Website generation + preview deployment | 5–7 days |
| 8 | Message queuing + production deployment | 2–3 days |
| 9 | Admin dashboard + human handoff | 3–5 days |
| 10 | Payment integration + polish | 2–3 days |

**Total estimated time: 4–6 weeks** for a working production system.

---

## Cost Estimates

| Service | Cost |
|---|---|
| WhatsApp conversations | ~$0.005–0.08 per conversation (varies by country/category) |
| Claude API | ~$3–15 per 1M tokens (depends on model) |
| Hosting (VPS) | $10–50/month |
| Database (managed PostgreSQL) | $15–30/month |
| Redis | $10–15/month (or free tier) |
| Vector DB (Pinecone) | Free tier available, then $70+/month |
| Vercel (preview deploys) | Free tier covers hobby use, Pro at $20/month |
| Domain + SSL | $10–15/year |

**Estimated monthly cost for moderate usage (100–500 conversations): $50–150/month.**