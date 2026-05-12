# Pixie — Research Context

> Background dossier for an external researcher (e.g. Claude with web access)
> evaluating ban / suspension / compliance risk for our WhatsApp + Messenger +
> Instagram bot. Pair with `RESEARCH_PROMPT.md`.
>
> Some sections call out **fields the operator must fill in before sharing**
> with a researcher — they're marked `<<TODO>>`. Don't share placeholder values
> as if they were real data.

---

## 1. What Pixie is — one paragraph

Pixie is a WhatsApp / Messenger / Instagram bot that **sells, builds, deploys,
and supports websites for small businesses end-to-end inside a chat thread**.
A small business owner (plumber, salon, realtor, etc.) messages our number,
Pixie has a multi-turn sales conversation in their language, generates a
real multi-page website preview in under a minute, takes payment via Stripe,
deploys the site on a custom domain, and offers unlimited revisions
afterward — all inside the chat. It also covers smaller adjacent services
(logo design, ad creatives, SEO audits) but the chat currently runs the
**website flow only**; other services hand off to a human via email.

The product positions as "the agency replacing the freelancer" for SMBs that
won't use Wix and won't wait two weeks for a freelancer.

---

## 2. Channels, APIs, infrastructure

| Surface | API | Notes |
|---|---|---|
| WhatsApp | **WhatsApp Cloud API** (Graph v21.0) | Multiple business phone numbers; per-turn `phone_number_id` routing so a customer texting two of our lines stays on the line they messaged. |
| Messenger | Graph API (Page Messaging) | Standard messaging tag flow. |
| Instagram | Graph API (Instagram Messaging) | Echo + edit handling on the parser side. |

- **API tier:** `<<TODO: Cloud API direct via Meta Business Suite, or via a BSP like 360dialog / Wati / Twilio? Confirm.>>`
- **Meta Business verification status:** `<<TODO: verified business? what messaging-limit tier (1K / 10K / 100K / unlimited)?>>`
- **WhatsApp quality rating** at the moment: `<<TODO: Green / Yellow / Red?>>`
- **Number of active business phone numbers** on WhatsApp: `<<TODO: e.g. 2-3>>`
- **Click-to-WhatsApp ads** (Meta paid ads driving inbound): **YES** — we track `adReferral` per inbound on first contact.
- **Hosting:** backend on Render, Stripe checkout, generated sites on Netlify, Supabase for DB. Landing page on Vercel at `pixiebot.co`.

---

## 3. Inbound vs outbound message patterns

### 3a. Inbound (the common case)
- ~All product flows start when the **user messages us first** — from a
  Click-to-WhatsApp ad, our landing page CTA (which prefills "I want to
  build a website"), or an organic Google search that sends them to our
  number.
- We respond inside the 24-hour customer-service window with free-form
  text, interactive buttons, lists, and CTA buttons. No templates needed
  for these because we're inside the window.

### 3b. Bot-initiated outbound (the risky case)
We have a follow-up scheduler (`src/followup/scheduler.js`) that sends
**free-form, non-template** outbound messages on this cadence:
- 1h after silence (HOT leads only, otherwise 2h)
- 22h: auto-discount nudge if they viewed the preview but didn't activate
- 24h: SEO follow-up (post-audit) — channel-gated: SKIPS Messenger /
  Instagram (we know those have a hard 24h window), but currently
  **DOES send on WhatsApp** even past 24h.
- 72h: final outreach
- 7d: similar-business example

Gates we DO honor:
- `metadata.followupOptOut` set when user says "stop" / "not interested"
- `metadata.leadClosed` (paid)
- `metadata.meetingBooked` (Calendly fired)
- `metadata.humanTakeover` (admin took over)

Gates we currently DO NOT honor on WhatsApp:
- The 24-hour customer-service window (we send free-form past 24h on
  WhatsApp). This is the single biggest open compliance risk on this
  list.
- Approved Message Templates — we use **none**. Every outbound is
  type=text / interactive / image / document / cta_url, never type=template.

If the researcher wants to verify, the relevant paths are:
- Outbound surface: `src/messages/whatsappSender.js` (no `template` payload anywhere).
- Follow-up cadence: `src/followup/scheduler.js`.
- 24h channel-gate that exists for Messenger/Instagram only: `src/followup/scheduler.js:264`.

---

## 4. Bot identity / disclosure stance

The system prompts EXPLICITLY instruct the bot to **deny being AI**:

> "You are a real person. Never reveal or hint you're AI, automated, or a
> chatbot. Name is always 'Pixie'." — from `src/llm/prompts.js`

> "'Are you a bot?' accusations: Engage naturally, vary the deflection,
> never say 'I'm just fast at typing.'" — same file

There is no proactive disclosure that the user is talking to an automated
system. We do have a `/privacy` page (linked in footers of generated sites,
linked in our standard reply during onboarding for jurisdictions that
require it — `<<TODO: confirm whether the WhatsApp first-contact GDPR
notice is currently sent or commented out>>`), and we have a GDPR consent
checkbox on form submissions on the *generated* websites.

Researcher should consider:
- Meta's WhatsApp Business Messaging Policy: bot-vs-human disclosure rules.
- California SB 1001 (Bolstering Online Transparency Act) — mandates
  disclosure of automated comms in commercial contexts for CA residents.
- Pakistan PECA / general consumer-protection norms — `<<TODO: jurisdictions
  where the bulk of users sit>>`.
- Whether a "real-person" claim during a sale is legally distinct from
  the kind of casual chatbot deception that's largely unregulated.

---

## 5. What the bot actually says / does (sales-y behaviors)

Sample patterns the LLM is instructed to use (illustrative, not
exhaustive):
- Open with a 1–2 sentence intro: "Hi, I'm Pixie — what can I help with?"
- Pick up business signals across the first 2–3 messages.
- Generate a live website preview when the user agrees ("can I spin one
  up?") — preview hosted on a temp Netlify URL with an "Activate Now"
  banner that goes to a Stripe checkout.
- Anchor at $X website price (configurable in `admin_settings`); auto-fire
  a discount at 22h if not paid.
- Aggressive but not pushy sales psychology — commitment ladder, social
  proof from portfolio links, scarcity used once mid-negotiation.
- Calendly link sent when scope warrants a call.

The chat currently handles **only the website flow**. SEO / chatbot /
ad design / logo-only / app development / marketing all hand off to a
human via an admin email (`bytesuite@bytesplatform.com`) and an English
"someone from our team will reach out" reply to the user. The bot
keeps chatting for everything else (no `humanTakeover=true` is set
during these handoffs anymore — see `src/conversation/handoff.js`).

---

## 6. Privacy / consent / opt-out

- `/privacy` page served by the backend, mounted before admin routes.
  Driven by env vars (`env.privacy.*`).
- GDPR consent checkbox on generated-site form submissions and salon
  appointment bookings — required, server-side validated, persisted to
  `form_submissions.consent_given` and `appointments.consent_given`.
- Generated sites get their own `/privacy/` page auto-injected, footer
  Privacy Policy link.
- Migration `020_form_consent.sql` — schema change for the consent column.
- Opt-out detection in the bot itself: LLM classifier flags "stop /
  unsubscribe / not interested" and sets `followupOptOut=true`.
- WhatsApp first-contact privacy notice: code path exists (`env.privacy.*`)
  but the actual `sendTextMessage` notice is currently commented out in
  `src/conversation/handlers/salesBot.js` — `<<TODO: confirm whether this is
  re-enabled>>`.

---

## 7. Volume and growth

- **Approximate monthly active users on WhatsApp:** `<<TODO>>`
- **Approximate monthly bot-initiated outbound messages on WhatsApp:** `<<TODO>>`
- **Click-to-WhatsApp ad spend / month:** `<<TODO>>`
- **Conversion rate (chat → paid):** `<<TODO>>`
- **Geographic spread:** `<<TODO — Pakistan / US / UK / other?>>`
- **Languages used:** English, Roman Urdu, Hindi, occasionally Spanish,
  Arabic. Each turn auto-detects and replies in-kind via the localizer.

---

## 8. Past incidents

- **Any prior WhatsApp Business Account / phone-number suspensions:** `<<TODO>>`
- **Any quality-rating drops to Yellow or Red:** `<<TODO>>`
- **Any user-blocking surges:** `<<TODO>>`
- **Any policy violations Meta has flagged:** `<<TODO>>`
- **Messenger or Instagram ban / restriction history:** `<<TODO>>`

---

## 9. Things we've already done that mitigate ban risk

- All flows are user-initiated (no cold outreach to phone numbers we don't
  have a relationship with).
- `followupOptOut` honored across the scheduler.
- `humanTakeover` silences the bot on flagged threads (abuse-detection
  classifier already wired — `src/abuse/detector.js`).
- Privacy page + per-site `/privacy/` + GDPR consent on forms.
- Per-turn `phone_number_id` routing so we don't surface unfamiliar
  numbers to users mid-conversation (a quality-rating signal).
- Recently (`2d4d8f0`) narrowed the chat to website-only — non-website
  service requests go to human handoff via email instead of being
  pitched / demoed in chat. Reduces the surface area for "looks like
  spam" classification.

---

## 10. Things we know we haven't done yet

- **No Approved Message Templates.** Every outbound is free-form text /
  interactive / cta. WhatsApp Cloud API requires templates for
  bot-initiated messages outside the 24h customer-service window (when
  the user hasn't replied recently). On WhatsApp specifically, our
  follow-up scheduler at 22h / 24h / 72h / 7d does not gate on the
  window.
- **No proactive bot disclosure.** Prompts actively deny being AI.
- **No rate-limiting on outbound bursts.** If a paid signal like "send
  the link" hits the LLM and it fires multiple messages in quick
  succession, there's no app-level throttle (Meta has its own).

---

## 11. Code paths a researcher might want to inspect (for citations)

| Concern | File:line |
|---|---|
| WhatsApp Cloud API surface | `src/messages/whatsappSender.js` |
| Outbound message types (no template usage) | `src/messages/whatsappSender.js:106-260` |
| Follow-up scheduler cadence + opt-out gates | `src/followup/scheduler.js:285-420` |
| 24h-window gate (Messenger/Instagram only) | `src/followup/scheduler.js:264-266` |
| Bot-disclosure stance in prompt | `src/llm/prompts.js:411-416`, `src/llm/prompts.js:5` |
| Privacy / consent | `src/privacy/routes.js`, `src/webhook/bookingRoutes.js:117` |
| Abuse detection + humanTakeover | `src/abuse/detector.js`, `src/conversation/abuseHandler.js` |
| Handoff (non-website services) | `src/conversation/handoff.js` |
| Multi-phone-number routing | `src/messages/whatsappSender.js:6-50` |

---

## 12. Pre-share checklist for the operator

Before sharing this dossier with an external researcher, fill in every
`<<TODO>>` marker — most of them ask for facts an outsider can't infer
(volume, BSP relationship, prior incidents). The researcher's verdict is
only as good as those inputs.
