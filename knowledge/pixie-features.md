# Pixie — Feature Knowledge Base (RAG-optimized)

> This file is the retrieval source for Pixie's voice/call feature. Each section below is a self-contained chunk (~150–300 words). Do not collapse sections — they are split on headings so that top-k retrieval always returns a complete answer. Every chunk ends with a **Phrasings** block listing common ways a caller might refer to the topic; these help embedding search match loose spoken language.

---

## What Pixie Is

Pixie is a WhatsApp-native AI agent built by Bytes Platform. You message Pixie on WhatsApp (or Facebook Messenger, or Instagram DM) and Pixie delivers real digital services during the chat — websites, social media ads, logos, SEO audits, AI chatbots, custom business software, ecommerce stores, domain setup, and booking systems. There is no signup, no app to download, no form to fill, and no discovery call. Pixie asks a few questions in plain language, builds the thing live while you keep chatting, sends you a preview link, takes your revisions, and sends a payment link when you approve. The brand is Bytes Platform; the product persona is Pixie; the tagline is *"Your website, built by a WhatsApp chat."* Primary URLs: pixiebot.co, bytesplatform.com, bytescart.ai. Everything Pixie builds is previewed before payment — the caller never pays blind. Revisions during the build are unlimited. Pixie is multilingual from the first message (English, Urdu, Roman Urdu, Arabic, Spanish, French, Hindi, more on request).

**Phrasings:** What is Pixie · Who are you · What does this bot do · What does Bytes Platform do · Pixie bot · PixieBot · the WhatsApp bot · Bytes Platform product · your service · what do you guys do · what can you help with

---

## How To Start A Project With Pixie

There is no onboarding process. The caller saves the WhatsApp number and sends any message — "hi", "I need a website", "can you check my site", "do you make logos" — and Pixie replies immediately and walks them through a short, conversational intake. Pixie does not require an email up front, does not require account creation, does not book a call unless the project is custom software. Everything happens inside one chat thread that Pixie remembers forever, so the caller can stop mid-conversation and pick up days later without repeating themselves. If the caller reached Pixie by clicking a Meta ad (Facebook or Instagram), Pixie already knows which ad was clicked and tailors the opening question to that intent — website ads skip to "what's your business", SEO ads ask for the URL right away, ecommerce ads hand over the free ByteScart link. For custom software and app builds Pixie does schedule a 15-minute scoping call with the project manager; everything else is delivered inside the chat itself.

**Phrasings:** How do I start · How does this work · What do I do first · Do I need to sign up · Do I need an account · Is there a form · Where do I begin · Getting started · onboarding · first step

---

## Instant Website Builder — What You Get

Pixie builds a real, published website live during the WhatsApp conversation — not a mockup, not a wireframe, an actual clickable site at a preview URL within about 60 seconds of finishing the intake. Every site is mobile-responsive across phone, tablet, and desktop, uses the caller's brand colors, includes AI-picked hero imagery that matches the business, has industry-appropriate professional copywriting, working contact forms, built-in SEO basics (meta tags, fast load, clean structure), and the caller's logo placed cleanly. Higher-tier packages include more pages. The website comes with a real custom domain registered in the caller's name — domain cost is included in the base website deal (first year), so a caller paying $200–$800 does not pay separately for the domain. Pixie handles all DNS, A records, and propagation checks silently. The site hosts on Netlify infrastructure behind the custom domain. The caller sees the full live site before paying a single dollar and can request unlimited revisions during the build conversation.

**Phrasings:** website · web site · site · webpage · web page · landing page · online presence · build me a site · make me a website · I need a page · business website · company site

---

## Website Pricing Packages

Pixie offers five website tiers, all one-time costs with no recurring monthly fee. **Landing Page $200** — 1-page site, mobile responsive, basic design. **Starter $300** — 1 to 2 pages, mobile responsive, working contact form. **Mid $400** — 2 to 3 pages, core pages (home, services, contact), basic SEO setup. **Pro $650** — 3 to 4 pages, on-page SEO, Google Maps embed. **Premium $800** — 5 pages, full SEO setup, speed optimized. All tiers include mobile-responsive design and a revision period after delivery. Domain registration for the first year is included in every tier. There are no hidden fees for splitting payments — the total stays the same. A caller can pay in full or use a split payment plan depending on package size. Websites outside this range (custom large builds, heavy ecommerce, portal-style sites) are quoted separately after a short scoping conversation. The cheapest meaningful site is $200; the most expensive standard website package is $800. Anything above that becomes custom software.

**Phrasings:** How much for a website · website cost · website price · how much is a site · what do you charge · website packages · pricing · how much to build · website tiers · cheapest option · most expensive option

---

## Website Revisions During The Build

While the website preview is being reviewed, the caller can request unlimited revisions by simply describing what they want in plain English. Common revisions: "change the hero to pink", "swap the hero image to coffee beans", "rewrite the about section to sound more casual", "add a service called teeth whitening with price $400", "remove the pricing section", "make it green", "use my logo as the favicon". Pixie applies each change, redeploys the site, and sends a new preview link. Color changes use smart color intelligence — saying "make it green" picks a green that keeps text contrast readable, not a random hex. Photo swaps work by description; the caller does not need to upload an image unless they want a specific one. Revisions stop being unlimited only after payment and go-live — after that, revisions fall under the post-sale revision period included in every package, or a maintenance plan if the caller wants ongoing changes. Revisions during the build are included in the base price and there is no per-revision charge.

**Phrasings:** Can I make changes · revisions · edits · edit the site · change the colors · fix the site · make changes · modify · update the site · how many edits · change something · can you tweak

---

## Industry-Specific Website Templates — Salon / Barbershop / Spa

Pixie has a dedicated salon template for salons, barbershops, spas, nail studios, and similar appointment-based beauty businesses. It is built around the booking. The template includes luxury editorial-style imagery, a service menu showing price and duration per service, an integrated native booking calendar (see the Salon Booking System chunk), an Instagram feed embed, weekly hours displayed with timezone awareness, and mobile-first layout because most salon traffic comes from phones. During intake Pixie asks for the Instagram handle, whether to use the native booking tool or embed an existing one (Booksy, Fresha, etc.), weekly hours, and a service list with durations and prices. The booking system is built in and free — no separate Fresha or Booksy subscription required. The salon template is not a reskin of a generic site; it is wired up to the booking database and the owner's WhatsApp commands (see Salon Owner Commands chunk). If the caller already uses Booksy or Fresha, Pixie can embed that external booking widget inside the site instead of the native one.

**Phrasings:** Salon website · barbershop site · spa site · nail studio · beauty business · hair salon · booking site · appointment site · stylist website · booking calendar on site

---

## Industry-Specific Website Templates — HVAC

Pixie has a dedicated HVAC template built for the emergency-call reality of heating, cooling, and air conditioning contractors. Every page shows a bright red "24/7 Emergency — Call Now" strip at the top. The phone number appears in five separate places on every page: top nav, hero section, emergency strip, footer, and a floating click-to-call button on mobile. The layout gives equal weight to two calls to action: "Request Free Quote" for planners and "Call Now" for emergencies. Trust badges shown: Licensed, Insured, Google rating, NATE certification, years in business. The template generates separate service-area pages (for example, "AC Repair in Round Rock" and "AC Repair in Pflugerville") which is a huge local SEO win. Upfront pricing hints like "Starting from $89" and same-day timing cues ("Most repairs completed same day") are baked in. During intake Pixie asks for the primary city, full service area list, years of experience, license number, and the contractor's Google rating. The result is a conversion-focused site for a trade where the customer is either panicking or comparison-shopping.

**Phrasings:** HVAC website · heating and cooling site · AC repair website · furnace repair site · plumber style emergency site · contractor website · trade website

---

## Industry-Specific Website Templates — Real Estate

Pixie has a dedicated real estate template built for solo agents, not brokerages or Zillow clones. The design is elegant and editorial — calm, premium, not shouty. The hero features the agent, not a house, because buyers and sellers hire a person. The template includes a "Featured Listings" section with three listing cards showing photo, price, beds, baths, and square footage; neighborhood guide pages with unique descriptions, walkability scores, school ratings, and median prices; a "What's my home worth?" lead capture form; proper display of designations and credentials (CRS, GRI, ABR, REALTOR®); testimonials split by angle (buyers, sellers, investors); and brokerage logo placement, which is legally required in most US states. During intake Pixie asks for brokerage name, years of experience, homes sold, designations, specialty, and per-listing details (address, price, beds, baths, square footage, photo). It is not a template for listing portals — it is a client-winning site for one agent.

**Phrasings:** Real estate website · realtor site · agent website · realtor page · property listings site · real estate agent page · broker website · homes website

---

## Industry-Specific Website Templates — General Business

For any business that isn't salon, HVAC, or real estate, Pixie uses the general template. It is clean, modern, and conversion-focused — not generic in the bad way. The structure includes hero with a clear value proposition, business story, services (or products), process section, testimonials, FAQ, and a prominent call to action. Copy is written by an LLM specifically for the caller's industry, so a bakery gets bakery copy and a law firm gets law-firm copy, not a templated "Welcome to our business" filler. Brand colors, contact info, and logo are applied automatically. This template supports bakeries, restaurants, cafes, dentists, doctors, clinics, law firms, accountants, gyms, yoga studios, coaches, photographers, freelancers, trades (plumbers, electricians, handymen), boutiques, tutors, consultants, and almost any service business. It scales with the tier the caller picks — Landing Page gives a one-pager, Premium gives five dedicated pages. If the caller describes a niche Pixie doesn't have a bespoke template for, the general template adapts and still feels tailored rather than cookie-cutter.

**Phrasings:** My business doesn't fit · generic business · small business site · clinic website · gym website · restaurant website · cafe website · coach site · professional services website · dentist website

---

## AI Marketing Ad Generator

Pixie generates studio-quality social media ads — single square image, 1:1 format, optimized for Instagram and Facebook feed — inside the WhatsApp chat in under a minute. Pixie collects business name, industry, product or service niche, product type (physical, service, or digital), optional slogan, optional price to feature, optional brand colors, and optional product or logo image. Pixie then presents **five distinct concepts** to choose from — four realistic photography concepts and one high-end 3D commercial CGI render. Each concept comes with a title, description, headline options, hashtags, and a detailed visual shot list. The caller picks a number from 1 to 5 and Pixie renders the final ad with brand name, slogan, and pricing overlaid, then sends it back on WhatsApp ready to post. Industry awareness is baked in — food and beverage gets warm appetizing looks, tech gets clean and futuristic, fashion gets editorial. If the caller uploads a product photo, it is used in the ad instead of a stock image. Pixie remembers the caller's colors and slogan across every future ad they generate.

**Phrasings:** Ad · advert · advertisement · social media ad · Instagram ad · Facebook ad · promo graphic · post design · campaign image · Black Friday ad · sale ad · marketing graphic

---

## AI Logo Maker

Pixie generates real logos — flat, professional, 2 to 3 colors maximum, the way real logos are actually designed. Output resolution is 1024×1024 pixels, suitable for web and print. Background options: transparent, white, black, or brand color. Pixie collects business name with exact spelling, industry, a one-sentence description of what the business does, style preference (Modern, Classic, Luxury, Playful, or Bold), optional brand colors, and an optional symbol idea. Pixie then presents **five different concepts with forced type diversity** — meaning the caller gets a combination mark, a wordmark, a pictorial symbol mark, a lettermark (or emblem or mascot depending on context), and an abstract mark. Not five variations of the same idea — five different kinds of logo, so the caller sees options they would never have thought to ask for. No 3D, no photorealism, no cheesy AI slop unless specifically requested. The caller picks a concept and Pixie renders the high-resolution final and sends it on WhatsApp. Logos pair seamlessly with the website builder — the caller can generate a logo and have Pixie drop it into their new site in the same conversation.

**Phrasings:** Logo · brand mark · business logo · company logo · icon design · brand identity · design a logo · make a logo · I need a logo · logo maker · branding

---

## Free SEO Audit

Pixie audits any website for free. No email required, no signup, no account, no upsell gate. The caller sends their URL on WhatsApp; Pixie scrapes the site, reads the structure, measures performance, checks headings and images, and delivers a real audit in roughly 30 seconds. The audit measures: page title, meta description, Open Graph tags, H1 H2 H3 heading counts, image count and alt tag coverage, link count, body text length, viewport meta, SSL status, and page load time. An LLM layer then generates specific recommendations across SEO, design, performance, content, and mobile experience. Output is an overall score out of 100, specific findings with real numbers ("LCP is 4.8 seconds", "47 images missing alt tags", "homepage H1 is duplicated"), and the top 3 recommendations ranked by impact. The caller gets both an in-chat summary and a downloadable PDF report. The report is theirs to keep whether or not they hire Bytes Platform to implement fixes. If they do want fixes, paid SEO packages start at $700 (see SEO Packages chunk).

**Phrasings:** SEO audit · website audit · site audit · check my SEO · review my site · scan my site · is my site SEO friendly · SEO report · site health check · rank on Google

---

## SEO Packages — Paid Implementation

Pixie offers five SEO campaign tiers. Each paid SEO engagement runs three months. **Audit Only $200** — SEO audit report, no implementation (this is distinct from the free audit — the $200 version is a deeper written report for callers who want documentation without hiring for fixes). **Starter $700** — technical audit plus three keyword targets plus on-page fixes. **Mid $1,500** — local SEO, five keywords, on-page fixes, monthly report. **Pro $3,500** — 15 keywords, on-page and off-page work, bi-weekly reports. **Premium $4,500** — 30 keywords, backlinks, competitor tracking. Results typically begin showing within 4 to 8 weeks depending on package and competition level. SEO follow-ups from Pixie are handled differently from website follow-ups — SEO buyers comparison-shop, so Pixie sends a single nudge 24 hours after quoting, mentioning the biggest issue found in their audit, then goes silent. No cascade. All SEO packages include monthly or bi-weekly reporting depending on tier.

**Phrasings:** SEO packages · SEO pricing · SEO cost · SEO service · ranking service · Google ranking · organic traffic · keyword targeting · link building · SEO campaign

---

## AI Chatbot Service — Setup and Demo

Pixie builds a fully branded AI chatbot for the caller's business — their logo, their colors, their tone, trained on their specific services, prices, hours, location, and FAQs. During intake Pixie asks for business name, industry, the top customer questions the business gets, services with prices (Pixie auto-parses prices from free text), business hours, and address. Pixie builds the working chatbot live during the chat and sends back a demo link — the caller talks to their own new chatbot and tests it inside 60 seconds. If the caller likes it, they activate a 7-day free trial with no credit card up front. They get two delivery options: a standalone hosted chat page at their own URL (`yourdomain.com/chat/your-brand`) and an embeddable widget they can paste into an existing website with a single line of code. Monthly performance reports come included — total conversations, leads captured, and top customer questions. The chatbot captures leads automatically — when a customer says "I want to book" or shares their contact info, the bot pushes the lead to the business owner.

**Phrasings:** Chatbot · AI chatbot · bot for my site · website chatbot · customer service bot · AI assistant · live chat · 24/7 chat · customer bot · chat widget · chat on my website

---

## AI Chatbot — Pricing and Trial

The AI chatbot runs on monthly billing with three tiers and a 7-day free trial that does not require a credit card up front. **Starter $97/month** includes 500 conversations per month. **Growth $249/month** includes unlimited conversations. **Premium $599/month** includes unlimited conversations plus custom integrations (connect the chatbot to the caller's existing CRM, booking tool, email system, or any custom API). The free trial lasts 7 days and starts the moment the caller activates it from the demo. There is no charge during trial and no automatic conversion to paid — the caller has to explicitly choose a tier. A conversation counts as one customer session, not one message, so the Starter tier's 500 conversations translates to 500 distinct customers per month, each of whom can send many messages. Overages on Starter are handled by upgrade, not by throttling or surprise charges. The chatbot is a recurring-revenue product for the caller's business — it sits on their site 24/7 answering the same questions a receptionist would.

**Phrasings:** Chatbot price · chatbot cost · how much is the bot · AI bot pricing · chat tier · bot subscription · monthly chatbot · chatbot trial · free trial · how much conversations · chatbot limit

---

## Salon Booking System — Customer Experience

Salons that use Pixie's native booking system get a full appointment engine built into their website with no third-party tool and no monthly fee. Customers land on the site, pick a service from a menu showing duration and price, pick a time slot from a calendar that respects the salon's weekly hours and timezone, enter name email phone and optional notes, and confirm. The customer gets an instant confirmation email. Approximately 24 hours before the appointment, the customer gets an automatic reminder email (the reminder job checks every 15 minutes for appointments starting within the next 24 hours). Every reminder email includes a one-click cancellation link — the customer does not need to log in or phone the salon. Double-booking is structurally impossible — two customers cannot ever hold the same slot. If the salon prefers an existing tool like Booksy or Fresha, Pixie can embed that instead of using the native system. Email styling uses Cormorant Garamond serif with the salon's brand primary color for accents.

**Phrasings:** Booking · appointments · customer booking · reservation · book a haircut · book a service · schedule · appointment tool · online booking · booking calendar

---

## Salon Booking System — Owner Commands From WhatsApp

The salon owner manages their booking system entirely from WhatsApp — no dashboard, no login, no separate app. Pixie understands three commands, matched by flexible regex so natural phrasing also works. **"bookings today"** or **"today's bookings"** shows every appointment for the current calendar day in the salon's local timezone. **"bookings"** alone shows the next 7 days of appointments, up to 20 listed at a time. **"cancel 42"** or **"cancel #42"** cancels booking number 42 — the cancellation automatically triggers a notification email to the customer and removes the slot from the calendar. Each booking line in the WhatsApp reply shows the booking ID, day and date, time, service name, duration in minutes, and the customer's name, email, and phone number. Commands only work for users who own a site built from the salon template with native booking mode enabled. The owner also gets an email alert every time a new booking comes in and every time a customer cancels. Default timezone for new salons is Europe/Dublin; this is set per-salon.

**Phrasings:** Manage bookings · see my appointments · cancel a booking · owner commands · admin commands · check my schedule · who booked today · today's appointments · cancel client · booking admin

---

## Free Ecommerce — ByteScart

ByteScart at bytescart.ai is Bytes Platform's free ecommerce storefront — small businesses that want to sell online can list products there with zero monthly fee, no credit card, no Shopify-style subscription trap. A caller who asks about selling online gets the ByteScart link directly from Pixie. ByteScart handles storefront hosting, product listing, mobile-ready layout, and built-in card checkout. It is meant for small sellers — single makers, side hustles, local product businesses, handmade goods, food sellers, small clothing lines. For businesses that outgrow what ByteScart can handle — marketplaces, thousands of SKUs, custom logic, complex inventory, POS sync — Pixie can scope a custom ecommerce build. Custom ecommerce pricing starts at $200 for a Mini Store (up to 5 products), $700 for Starter (up to 15 products), $1,200 for Mid (up to 30 products, semi-custom design), $1,700 for Pro (up to 50 products, custom design with filters and search), and $2,000 for Premium (unlimited products, full integrations). Most small callers never need more than ByteScart.

**Phrasings:** Ecommerce · online store · sell online · shop · Shopify alternative · product store · online shop · ByteScart · free store · store builder · selling products · ecommerce website

---

## Custom Business Software

Pixie takes on custom software builds — CRMs, admin dashboards, booking systems beyond the salon template, client portals, inventory managers, lead trackers, invoice and quoting tools, appointment managers, and internal tools. Web-based only, not native desktop. Each build is fully custom to the caller's workflow, not a template. Data belongs to the caller — not locked into a SaaS they can't leave. Most builds are one-time cost with no recurring fee, though maintenance plans are optional. The flow: Pixie has a short intake on WhatsApp covering what's broken about the current tool, team size, and what actually needs to be tracked, then schedules a 15-minute scoping call with the Bytes Platform project manager. After the call the caller gets a written proposal with scope, timeline, and price. Custom software is the one category where Pixie does not quote a price in-chat — pricing is project-specific because builds range from a $1,500 simple CRM to a $50,000+ multi-module platform. If the caller knows exactly what they want, Pixie can often ballpark before the call.

**Phrasings:** Custom software · custom build · CRM · dashboard · internal tool · client portal · admin panel · inventory system · invoicing tool · lead tracker · business app · custom platform

---

## App Development

Pixie handles mobile and web app builds — iOS native, Android native, cross-platform React Native and Flutter builds, and Progressive Web Apps (PWA). Scope includes API development and integration, UI/UX design, App Store and Play Store submission, and ongoing maintenance. Like custom software, app development is quoted per project after a short scoping call with the project team. There is no public tier list because app scope varies enormously — a simple wrapper app around an existing website is a different cost than a two-sided marketplace with real-time features. Typical flow: the caller describes the app idea on WhatsApp, Pixie asks clarifying questions (platforms, user types, key features, integrations), and then routes the caller to the project team for a scoping call and proposal. Past app builds range from MVP SaaS apps delivered in 8 weeks to multi-month native app builds. If the caller has a pitch deck or existing design mockups, they can send those on WhatsApp and Pixie will forward them to the team before the call.

**Phrasings:** App · mobile app · iOS app · Android app · React Native app · Flutter app · PWA · build an app · make an app · phone app · App Store · app cost · how much for an app

---

## Social Media Management — Packages

Pixie offers five social media management tiers, priced monthly. **Content Only $200** — content calendar plus four post designs, the caller does the posting. **Starter $700/month** — one platform, 8 posts per month, no reels. **Mid $1,500/month** — one platform, 8 posts plus 2 reels, full content production. **Pro $3,500/month** — two platforms, 20 posts plus 4 reels, custom reels, hashtag strategy. **Premium $4,500/month** — three platforms, 30 posts plus 8 reels, full strategy, analytics reporting. All managed packages include content scheduling, community engagement (responding to DMs and comments), and monthly performance reports. Platforms supported: Instagram, Facebook, TikTok, LinkedIn. Custom quotes can be built with the formula: `posts × $10 + reels × $25 + platforms × $100 + extra posts × $20`. Pixie also offers content calendar planning, professional food and product photography, Google Ads and Meta Ads campaign management, and Google Business Profile optimization as part of broader digital marketing engagements. All social media packages are month-to-month with no long-term contract.

**Phrasings:** Social media management · SMM · Instagram management · Facebook management · TikTok management · content creation · post design · reels · social media cost · content calendar · social media price

---

## Domain Purchase And DNS Setup

Every website Pixie builds comes with a real custom domain registered and configured by Pixie — the caller does not need to know what DNS is, does not need a GoDaddy account, and does not need to read a tutorial on A records or CNAMEs. After the website preview is approved, Pixie offers to put the site on a custom domain. Pixie searches availability across five common TLDs — .com, .co, .io, .net, and .org — and shows the caller the available options. The caller picks one. Once payment is confirmed, Pixie registers the domain via Namecheap, configures DNS automatically (A record pointing to the hosting IP, CNAME for www pointing to the site's subdomain), verifies the propagation, and notifies the caller when the site is live at their new domain — usually within 5 to 60 minutes as DNS propagates. Registration is done by Bytes Platform on the caller's behalf. Domain cost for the first year is included in the website package price. If auto-purchase fails for any reason, the Bytes Platform team completes the setup manually within 2 business days.

**Phrasings:** Domain · custom domain · buy a domain · register a domain · get a URL · my own website address · dot com · .com · DNS · domain setup · domain cost · GoDaddy · Namecheap

---

## Multi-Channel — WhatsApp, Messenger, Instagram

Pixie is not WhatsApp-only. The same Pixie persona is wired up on WhatsApp Business (primary), Facebook Messenger, and Instagram Direct Messages. Callers message whichever channel they prefer and get the same intake, the same building flow, and the same Pixie voice. All three channels use the same underlying conversation state, so if a caller starts on Instagram and later messages on WhatsApp with the same phone number, context carries over. Meta webhooks verify signatures using HMAC-SHA256 on the x-hub-signature-256 header. For voice and audio, Pixie accepts WhatsApp voice notes — it runs OpenAI Whisper to transcribe the audio and respond in text. Supported audio MIME types include ogg, mpeg, mp4, wav, webm, and amr. There are no hard audio length limits enforced in code. Image uploads are also supported across all three channels — useful when a caller is sending a product photo for an ad or a logo file to add to a website.

**Phrasings:** WhatsApp · Messenger · Facebook Messenger · Instagram DM · DMs · which channels · where can I message · Instagram chat · voice note · send audio · audio message · voice message

---

## Ad Click Attribution — Knowing Where The Caller Came From

When a caller reaches Pixie by clicking a Meta ad on Facebook or Instagram, Pixie receives the ad referral data with the first message and tailors the greeting accordingly — no generic "How can I help you?" that wastes the lead's attention. If the caller clicked a website-building ad, Pixie opens with website-focused questions ("what's your business name, what industry?"). If they clicked an SEO ad, Pixie asks for the URL immediately so it can run the free audit. If they clicked an ecommerce or selling-online ad, Pixie hands over the free ByteScart link up front. Ad attribution works on both Facebook and Instagram click-to-WhatsApp ads and on click-to-Messenger and click-to-Instagram-DM ads. The referral source is stored in the caller's conversation record so follow-ups also reflect the original intent. This is why Pixie's opening message sometimes seems to know why the caller is there — the ad they clicked told it.

**Phrasings:** Ad click · clicked the ad · came from Facebook · came from Instagram · Meta ad · why did you know · how did you know · referral · click-to-WhatsApp · CTWA

---

## Multilingual Support

Pixie detects the language of the caller's first message and replies entirely in that language for the rest of the conversation — no mixed sentences, no code-switching, no "Hi! [switches to Spanish]" disasters. Supported languages: English, Urdu, Roman Urdu (Urdu written in Latin script), Arabic, Spanish, French, Hindi, and more on request. If the caller switches language mid-conversation, Pixie switches with them. This matters for businesses in Pakistan, India, UAE, Saudi Arabia, Morocco, Mexico, Spain, France, and Quebec; for diaspora businesses serving customers who prefer their native language; and for agencies with international clients. Pricing stays in USD regardless of language — what changes is only the conversation itself, not what the caller pays. The language applies to every built asset too — website copy, ad taglines, chatbot responses, and email reminders are all rendered in the caller's detected language. A caller who messages in Arabic gets a website with Arabic copy; a caller who messages in Spanish gets Spanish ad headlines.

**Phrasings:** Language · languages · multilingual · Spanish · Arabic · Urdu · Hindi · French · in my language · native language · habla español · bilingual · international

---

## Payment Plans And Splits

Callers don't have to pay in full up front — Pixie offers split payment plans that do not add surcharges. The total price stays the same whether paid in one chunk or several. Plans scale with project size. For packages **under $500** (including $200 Landing Page, $300 Starter, $400 Mid): 60% upfront, 40% on delivery — two payments. For packages between **$500 and $1,500** (including $650 Pro, $800 Premium, mid-range SEO, mid-range social): 50/50 across two payments, or 40/30/30 across three milestones. For packages between **$1,500 and $4,500** (including Pro and Premium SEO and social): 40/30/30 across three milestones, or monthly installments. The first payment is always required before work starts. After that the caller pays as Pixie delivers — they see progress before each next payment. Payment is via Stripe Payment Links — Pixie sends a link on WhatsApp, the caller taps and pays with card, receipt auto-delivered. No Stripe account required on the caller's side. Pending payment links auto-expire after 48 hours so the caller never sees a stale link.

**Phrasings:** Payment plan · installments · split payment · can I pay monthly · can I pay in parts · deposit · upfront · pay in full · Stripe · how do I pay · invoice · credit card

---

## Follow-Ups — When Leads Go Quiet

Pixie sends automatic follow-ups to leads who go silent after seeing a preview or getting a quote, but only in a measured, non-spammy cadence. For standard website and service leads, Pixie sends three messages spaced 2 hours, 12 hours, and 23 hours after the last reply — a gentle check-in first, then an offer to split payment, then a final note with a small discount (commonly $80 off $100 tier) if it genuinely makes sense. For SEO audit leads, Pixie sends only one follow-up at 24 hours, quoting the biggest issue found in their audit, then goes silent — SEO buyers are comparison shoppers and a cascade reads as desperate. Lead temperature modifies timing: hot leads get follow-ups at half the interval, cold leads get follow-ups at double the interval. Pixie's voice adapts to the caller's detected personality (casual, professional, unsure, negotiator) so the messages never feel copy-pasted. Pixie stops following up the moment the lead is marked closed, payment is confirmed, a meeting is booked, the caller explicitly opts out, or a human has taken over the conversation. No cascades of 5+ messages; no fake urgency; no guilt-tripping.

**Phrasings:** Follow-up · chase up · remind me · check back · are you still there · I went quiet · stop messaging · unsubscribe · opt out · too many messages

---

## Post-Sale Check-Ins And Maintenance

Pixie does not disappear after the caller pays and the project goes live. The system sends automatic check-ins on a slow, useful cadence. **Day 7 after go-live** — a note suggesting the caller set up their free Google Business Profile, which takes 10 minutes and delivers a big local SEO boost. **Day 30** — a note about how SEO fits with what was built and what the caller can do to start ranking. **Day 60** — a note suggesting adding a WhatsApp chat widget to the site (converts well across Bytes Platform clients). **Day 90** — a three-month check-in offering to refresh the hero and add any new services or products. These messages are genuinely helpful — they are not sales pitches, and the caller can ignore or opt out of them. Separately, Pixie offers optional monthly maintenance plans that cover updates, fixes, content tweaks, and small changes without per-task invoices. The caller keeps the same WhatsApp thread forever, so six months later they can say "can we refresh the hero and add two services" and Pixie picks up with full history.

**Phrasings:** After the site is live · maintenance · updates · ongoing support · after-sale · after I pay · check in · refresh the site · keep it updated · keep my site current · ongoing help

---

## Scheduling A 15-Minute Call With The Team

For custom software, apps, and larger engagements, Pixie books a 15-minute scoping call with the Bytes Platform project manager rather than quoting in-chat. The caller picks a date, time, and timezone on WhatsApp; Pixie confirms the meeting, stores the topic, and sends a reminder 25 to 35 minutes before the call. Meetings are tracked in the system so the same call is never reminded twice. The call itself is a short discovery: what the caller is trying to build, what's broken about their current setup, team size, rough budget range, and timeline. The project manager writes up a proposal within a few business days covering scope, milestones, pricing, and delivery date. Most standard Pixie services — websites, ads, logos, SEO audits, chatbots, salon booking, ByteScart — do NOT require a call; those happen entirely in the WhatsApp chat. The 15-minute call is only triggered for work that genuinely needs scoping.

**Phrasings:** Call with the team · scoping call · book a meeting · book a call · talk to someone · project manager · 15 minute call · discovery call · consultation · schedule a call

---

## Memory, Context, And Going Back

Every caller's WhatsApp thread is a permanent account — Pixie remembers the caller's business profile (name, industry, services, colors, logo, contact info), every project (websites, ads, logos, chatbots built), every payment and invoice, and the full conversation history. A caller who stops replying for a week and comes back doesn't have to repeat themselves; Pixie picks up exactly where they left off. When the caller starts a new project (an ad after a website, a chatbot after a logo), Pixie reuses the business name, colors, and industry automatically instead of asking again. During an active build, callers who want to go back one step can say things like "wait go back", "let's revisit that", "change the last one", or "actually previous step" — Pixie understands natural phrasing (not just exact keywords) and pops one step off the conversation stack, showing the stored answer and offering the caller a chance to edit it or confirm by saying "keep". Undo works on most website intake fields but not on some fiddly loops like real estate listing entry.

**Phrasings:** Go back · undo · previous · change my answer · I made a mistake · let me redo · actually · memory · remember me · do you remember · context · pick up where I left off

---

## What's Free Forever

Several things from Pixie are genuinely free with no upsell gate. **The SEO audit** — send a URL, get a real audit with a downloadable PDF, no email required, no signup. **The website preview** — Pixie builds the full working site before the caller pays; there is no mockup-wall or deposit to see the real thing. **The chatbot demo** — the caller talks to their own fully-built AI chatbot in 60 seconds, before activating the trial. **ByteScart ecommerce** — the free storefront at bytescart.ai has no subscription, no monthly fee, no per-product fee. **The 7-day chatbot trial** — no credit card upfront. **Follow-up check-ins** — post-sale nudges at day 7, 30, 60, 90 cost nothing. The philosophy is that the caller should be able to see, touch, and experience the work before any money changes hands — so every core service has a free proof layer before the paid tier. The paid services (website, ad, logo, SEO implementation, chatbot subscription, custom software, apps, social media, domain) start at $97/month (chatbot) or $200 (everything else one-time).

**Phrasings:** Free · what's free · no cost · trial · demo · preview · see it first · try before buy · no upfront · free stuff · free services · zero cost

---

## What Pixie Will Not Do

A few clear limits, so the caller knows what to expect. Pixie will not pretend to be human — if asked, Pixie is clear about being an AI agent from Bytes Platform. Pixie will not send 5 follow-up messages in a row or pressure the caller with fake urgency ("last day of the offer!" when it isn't). Pixie will not continue following up after the caller explicitly asks to stop. Pixie will not take payment for work that hasn't been previewed — every paid service has a free preview, demo, or audit step first. Pixie will not register a domain in someone else's name without consent. Pixie will not promise specific search rankings or specific ad performance numbers — SEO and ads have ranges, not guarantees. Pixie cannot build native desktop software (only web, mobile, and PWA). Pixie cannot handle work that requires US broker-dealer, medical, or legal licensing. Pixie does not handle content moderation or community management for platforms it isn't managing. For anything outside scope, Pixie says so honestly and, where possible, points the caller to someone who can help.

**Phrasings:** What can't you do · limits · what you won't do · are you human · can you guarantee · promise rankings · can you do X · out of scope · not your thing

---

## Common Comparison — Pixie vs Hiring An Agency

Traditional digital agencies make the caller fill out a form, wait 48 hours for a reply, book a discovery call, wait a week for a proposal, sign a contract, and then wait 2 to 6 weeks for delivery. Pixie replaces all of that with a single WhatsApp conversation — intake, build, preview, revision, payment, and go-live happen inside one chat, usually in the same session. Pricing is a second axis: agency websites routinely quote $3,000 to $10,000 for what Pixie delivers for $200 to $800, because Pixie's automation removes the designer hours, developer hours, project manager hours, and revision-meeting overhead that agencies bill for. That said, Pixie is not always the right choice — for very complex enterprise builds, regulated industries with deep compliance requirements, or projects that genuinely need a dedicated full-time team for months, a traditional agency or in-house build still makes sense. For everything small-to-mid business — which is the 90% case — Pixie is faster, cheaper, and delivers a better preview experience. The caller gets to see the actual thing before signing anything.

**Phrasings:** vs agency · compared to an agency · why not use an agency · better than Fiverr · Upwork · freelancer · cheaper than · faster than · agency quote · compared to Wix · Squarespace
