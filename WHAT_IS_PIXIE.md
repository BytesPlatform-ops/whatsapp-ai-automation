# What is Pixie?

**Pixie is a WhatsApp/Messenger/Instagram bot that sells, builds, and delivers small-business marketing assets — entirely inside a chat thread.**

A small-business owner (a plumber, a salon owner, a real-estate agent) messages our number on WhatsApp. Pixie greets them, has a normal sales conversation in their language, figures out what they need, builds it, takes the payment, and delivers the finished asset. No website to log into. No forms to fill out. No "we'll get back to you in 2-3 business days." End-to-end on one chat.

If you've sold services on a freelance marketplace, Pixie is the agency replacing the freelancer — without the hand-offs, project managers, or the 2-week wait.

---

## The problem we solve

A neighbourhood plumber, salon, or realtor who needs a website today has three bad choices:

1. **Hire a freelancer** — $400–$1,500, 2–3 weeks, lots of back-and-forth, the result is hit-or-miss.
2. **Use a DIY tool** (Wix/Squarespace) — they have to learn the tool, design it themselves, end up with something that looks templated, then never update it.
3. **Skip it** — a Facebook page is "good enough." Until a customer Googles them and finds nothing.

Pixie collapses all three to a single chat: tell us what your business is, get a real multi-page website preview in under a minute, pay $X to activate it. No tool to learn, no agency to chase, no two-week wait.

The same logic extends to the rest of the stack — logo design, ad creatives, SEO audits, AI chatbots — each of which is a multi-day project for a freelancer and a 5-minute chat with Pixie.

---

## How it works (in 3 steps)

**1. Chat in.** Customer messages our WhatsApp / Messenger / Instagram number. From an ad, our landing page, a friend's referral, or just a Google search. They speak any language they want — English, Roman Urdu, Spanish, Arabic.

**2. Pixie has the conversation.** A real, branded sales chat — not a stiff form. It picks up cues ("I run a salon" → switches to the salon flow), suggests the right product, handles objections, and shows the customer a working preview before asking for money. The whole flow adapts to what they say.

**3. Pixie delivers.** Once the customer pays via Stripe, Pixie automatically deploys the website to a real URL, attaches their custom domain, removes the activation banner, sends a confirmation, and emails the team. The customer's site is live in minutes.

If the customer wants tweaks — colour, headline, hero photo, even uploading their own image — they ask in chat ("change the hero to coffee beans" or just send a photo) and Pixie applies it. 3 free revisions before activation, **unlimited** after.

---

## What you can buy from Pixie

| Product | What you get | Price |
|---|---|---|
| **Website** | Real 5-page site (home, services, areas, about, contact, privacy) generated for your industry, deployed on a custom domain | from $199 |
| **Logo Maker** | AI-designed logos in 5 styles, your brand colours, transparent PNG | included with website / standalone |
| **Ad Creator** | Marketing-ready social ad images for your business | standalone |
| **SEO Audit** | Free PDF report: technical issues, on-page fixes, opportunities | free lead magnet |
| **AI Chatbot** | A 24/7 assistant trained on your business, embeddable on your site | trial → monthly |
| **Custom App / Internal Tool** | CRM, booking system, dashboard, lead tracker — scoped on a call | custom quote |
| **SEO / SMM Retainer** | 3-month campaign — keyword strategy, content, on-page work | $700–$4,500 |

The website is the wedge product. Most customers come in for that and discover the rest.

---

## Where Pixie lives

- **WhatsApp Cloud API** — primary channel
- **Messenger** — same bot, same flows
- **Instagram DM** — same bot
- **Click-to-WhatsApp ads** — Meta sends users straight into a Pixie chat with their ad context preserved
- **Landing page** ([pixiebot.co](https://pixiebot.co)) — every CTA opens WhatsApp with a pre-filled "I want a website" message

A customer never picks "which channel" — they message wherever they already are, and Pixie meets them there with the same memory of who they are.

---

## What makes Pixie different

**1. End-to-end inside a chat.** Most bots qualify a lead and then hand it to a human. Pixie qualifies, sells, builds, charges, deploys, and supports — all inside the same thread. The customer never leaves WhatsApp.

**2. Industry-aware templates.** Pixie isn't a generic "website builder." It detects the customer's industry from their first sentence and switches to a niche-specific flow. A plumber gets a 24/7 emergency-dispatch site with service areas. A salon gets a booking widget and Instagram-style gallery. A realtor gets agent profile, listings, and neighborhood pages. Each looks like it was built for that exact business.

**3. Real preview before payment.** The customer sees their actual website live before paying — not a mockup, not a screenshot. The same URL that goes live after payment is the URL they preview.

**4. Multi-language fluent.** The bot doesn't translate; it natively chats in the customer's language. Roman Urdu, Hindi, Arabic, Spanish, French — quality is the same as English. A small-town shopkeeper texts in their dialect and gets a reply in their dialect.

**5. Smart revisions.** "Change the hero to coffee beans" → done. "Make it darker" → done. "Use this photo" + image upload → done. The bot understands which image/text/colour to change without templates or buttons. After activation, revisions are unlimited.

**6. Always-on automation.** While the customer's chat is asleep:
   - Unpaid previews get a 22-hour discount nudge automatically
   - SEO audits get a 24-hour follow-up with their biggest opportunity
   - 30-day post-launch upsell email goes out
   - Domain DNS gets verified every 5 minutes once paid
   - Sites are watermarked at 1 hour and deleted at 60 days if never activated
   - Salon bookings get a 24-hour reminder email

The customer gets a level of attentiveness no human team could afford to give a $199 buyer.

---

## Quick stats / what's under the hood

- **4 niche templates** — HVAC/trades, salon/spa, real estate, generic
- **9 trade variants** under the HVAC template (plumbing, electrical, roofing, locksmith, pest control, water damage, tree service, garage doors, appliance repair)
- **79 conversation states** — the bot knows where it is in every flow at all times
- **50+ LLM operations** — different model calls for sales chat, intent detection, abuse classification, etc.
- **20+ background jobs** — schedulers, verifiers, cleanup workers
- **Built on** Node.js + Express + Supabase (Postgres) + Stripe + Netlify + WhatsApp Cloud API
- **Default LLM**: gpt-5 family (configurable per-operation for cost vs quality)

---

## For developers

- **[FLOW.md](FLOW.md)** — implementation map: every state, every router check, every failure mode with file:line refs.
- **[PIXIE_FEATURES.md](PIXIE_FEATURES.md)** — exhaustive feature list grouped by category.
- **[PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)** — architecture, data model, deployment.
- **[pixie_flows.md](pixie_flows.md)** — design doc for how each flow should *feel*.

---

## In one sentence

> Pixie is what happens when an entire small-business marketing agency — sales rep, designer, developer, copywriter, SEO consultant, account manager — fits inside a WhatsApp chat that never sleeps and never gets tired.
