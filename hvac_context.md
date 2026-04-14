# HVAC Niche Website Template — Context & Plan

**Owner:** BytesPlatform bot (WhatsApp auto-generated sites)
**Created:** 2026-04-15
**Status:** Plan locked, implementation pending

This document is the single source of truth for the HVAC template work.
It captures the research, architectural decisions, variables, and build
order so implementation stays on rails across sessions.

---

## 1. Why HVAC Is Different (Research Summary)

### Two visitor psychologies
| Type | % Traffic | Mindset | Needs |
|---|---|---|---|
| **Emergency caller** | ~70% | AC/furnace dead, panic, 3-sec decision | Phone HUGE, "24/7 Emergency" red strip, one-tap call |
| **Planned buyer** | ~30% | Comparing contractors for install/maintenance | Reviews, licensed/insured badges, pricing hints, service detail |

### Non-negotiable industry conventions
1. **Emergency red strip** (top, never-hideable, click-to-call phone)
2. **Phone in 3 places min** on every page — strip, nav, footer + floating mobile FAB
3. **Trust badges** — Licensed, Insured, Google rating, NATE-certified, Years in business
4. **Service area pages** — massive local-SEO signal ("AC Repair in {City}"), unique per-area content
5. **Dual CTA pattern** — "Get Free Quote" (planners) + "Call Now" (emergency), side-by-side
6. **Mobile-first** — ~75% of HVAC searches are mobile
7. **Speed critical** — LCP <2.5s, CLS <0.1 (Google ranks local-intent HVAC heavily on speed)

### Color discipline
- **Blue dominant** (trust/reliability)
- **Orange CTA-only** (maximum contrast against blue)
- **Red reserved** exclusively for the emergency strip (do NOT use elsewhere)
- No rainbow icons, no random accent colors

---

## 2. Architecture

### Decision: parallel template, not a modification of the generic one

The existing `deployer.js` generates a generic 4-page template. For HVAC
we create a fully separate template module. Industry detection routes to
the correct template. Generic stays untouched for salons/bakeries/etc.

### File layout

```
src/website-gen/templates/
├── hvac/
│   ├── index.js        exports generateHvacPages(config, { watermark })
│   ├── common.js       shared: tokens, emergency strip, nav, footer,
│   │                   floating FAB, JSON-LD helpers, Netlify form attrs
│   ├── home.js
│   ├── services.js
│   ├── areas.js
│   ├── about.js
│   └── contact.js
└── index.js            pickTemplate(industry) → returns template module
```

### Pipeline

```
webDev.js collects data
  └─ generator.js (LLM content)
      └─ deployer.js
          └─ templates/index.js → pickTemplate(industry)
              ├─ templates/hvac/index.js (if HVAC match)
              └─ existing generic path (else)
```

### Industry matching

HVAC template triggers when user's industry string matches any of:
`hvac`, `heating`, `cooling`, `air conditioning`, `ac repair`, `furnace`,
`heat pump`, `hvacr`. Case-insensitive substring match.

---

## 3. Pages (5 total)

### 3.1 Home (`/index.html`)
- **Emergency red strip** (fixed top, sticky): "🚨 24/7 Emergency — Call {phone}" + click-to-call
- **Sticky nav** (below strip): logo · nav links · phone · orange "Book Now"
- **Hero** (left text 55% / right image 45%):
  - Eyebrow: `⭐ Rated {rating} — {reviewCount} Google Reviews`
  - H1: `{City}'s Trusted Heating & Air Conditioning Experts`
  - Sub: LLM-generated
  - Dual CTA: orange `Request Free Quote` + outlined `📞 Call Now: {phone}`
  - Trust chips: ✅ Licensed & Insured · ⏰ Same-Day Service · 💰 Upfront Pricing · 🏆 {years}+ Years
  - Right: Unsplash HVAC-query background + overlay placeholder card ("📸 Replace with your real team photo for 3× more trust")
- **Services grid** (3×2, 6 cards with icons, "Learn More →" to /services)
- **Why choose us** (4 pillars, icon + heading + 1-liner, alt bg `#F0F4F8`)
- **Testimonials** (3 cards, 5 stars, quote, name+location, Google G logo, "⭐ {rating} from {count} reviews" footer)
- **Service areas preview** (8-12 area pills + "View all areas →")
- **Dark CTA banner** (bg `#0F172A`): "Need HVAC Service? We're Ready." + dual CTA
- **Footer**

### 3.2 Services (`/services/index.html`)
- Small hero with breadcrumb
- 10 services in **zigzag layout** (alt left/right image/text) — for each:
  - H2 title, 3-4 line description, inline "what's included" list
  - Timeframe: "Most repairs completed same day"
  - Price hint: "Starting from $XX" or "Free Quote"
  - Orange CTA "Request This Service"
  - Image = Unsplash query per service OR icon-on-gradient placeholder

### 3.3 Service Areas (`/areas/index.html`) [HVAC-unique]
- Hero + Google Maps embed (iframe, no API key needed for basic embed)
- List of all areas as clickable pills
- **Per-area mini sections** — each with unique LLM-generated 3-4 sentence description mentioning local relevance, same-day availability, and parent-city connection (to avoid duplicate-content penalty)

### 3.4 About (`/about/index.html`)
- Owner/team story (LLM-generated, personal warm tone)
- Team photo section (placeholder)
- Qualifications grid: Licensed (with `{licenseNumber}` if given), Insured, NATE-certified, BBB Accredited (badges as inline SVG)
- Stats bar: `{jobsCompleted}+ Jobs · {years}+ Years · {reviewCount}+ Reviews`
- Values (3 items): "On Time. Clean Work. Fair Prices."
- CTA at bottom

### 3.5 Contact (`/contact/index.html`)
- **Quote form** (Netlify Forms — `netlify` + `name="quote"` attrs):
  - Fields: Name, Phone (required), Email, Service needed (select), Problem description, Preferred date, Address
  - Hidden bot-field honeypot (`netlify-honeypot`)
  - Orange "Request Free Quote" button
  - On submit success page: "Thanks! We'll call you back within 1 hour."
- **Large click-to-call phone number** (24-28px, bold)
- Business hours + "24/7 for emergencies"
- Response promise: "We respond within 1 hour"
- Address + mini embedded map

---

## 4. Design Tokens

### Colors
```
── Brand ──
Trust Blue      #1E3A5F   nav, headers, primary accents
Action Blue     #2563EB   links, secondary buttons
Emergency Red   #DC2626   ONLY the top strip
Orange          #F97316   CTA buttons
Orange Hover    #EA580C

── Neutrals ──
Page BG         #FAFAFA
Card BG         #FFFFFF
Section Alt     #F0F4F8
Card Border     #E2E8F0
Dark BG         #0F172A   footer + final CTA banner

── Text ──
Heading         #0F172A
Body            #475569
Muted           #94A3B8
On Dark         #F1F5F9
```

### Typography
| Element | Desktop → Mobile | Weight | Font |
|---|---|---|---|
| Emergency strip | 14px | 600 | Inter |
| Nav | 15px | 500 | Inter |
| Hero H1 | 52 → 32px | 800 | Plus Jakarta Sans |
| Hero sub | 20 → 17px | 400 | Inter |
| Section H2 | 40 → 28px | 700 | Plus Jakarta Sans |
| Card title | 22 → 19px | 700 | Plus Jakarta Sans |
| Body | 17 → 16px | 400 | Inter |
| Phone number | 24 → 20px | 700 | Plus Jakarta Sans |
| Button | 16px | 600 | Inter |

Line-height: 1.15 headings, 1.6 body. Max text width: 70ch.

---

## 5. Variables

### Bot collects (webDev.js)
| Field | Existing? | Notes |
|---|---|---|
| `businessName` | ✅ | — |
| `phone` | ✅ | **CRITICAL** — in emergency strip + nav + footer + FAB |
| `email` | ✅ | — |
| `address` | ✅ | parsed from free text |
| `services[]` | ✅ | if user skips → pre-populate HVAC defaults (§7) |
| `primaryCity` | ⚠️ new | HVAC-only state |
| `serviceAreas[]` | ⚠️ new | HVAC-only state |
| `yearsExperience` | ⚠️ new optional | defaults blank, hidden if not given |
| `licenseNumber` | ⚠️ new optional | badge if given |
| `googleRating` | 🔵 default 4.9 | placeholder until real data |
| `reviewCount` | 🔵 default "200+" | placeholder until real data |
| `googleProfileUrl` | ⚠️ new optional | if given, "See all reviews →" links there |

### Combined city + areas collection step
Prompt: *"Which city are you based in, and which areas do you serve? (e.g., 'Austin — Round Rock, Cedar Park, Pflugerville')"*

Parsing:
- Split on `—`, `-`, `:`, or `,` → `primaryCity` is first token, rest are `serviceAreas`
- If user gives messy answer → fall back to LLM extraction (`primary_city` + `service_areas[]`)
- If single value → `primaryCity = serviceAreas[0]`

### LLM generates (no user input)
- Hero headline + tagline
- Service descriptions (HVAC-tone)
- "Why choose us" copy (4 pillars)
- 3 HVAC-flavored testimonials
- About story
- 5-6 HVAC FAQ
- Per-area unique descriptions (3-4 sentences each)

---

## 6. Netlify Forms Integration

Each form tag includes:
```html
<form name="quote" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/thank-you">
  <input type="hidden" name="form-name" value="quote">
  <p class="hidden"><input name="bot-field"></p>
  <!-- fields -->
</form>
```

Netlify auto-captures submissions. Dashboard shows them, can email
business owner. Generated `/thank-you/index.html` page shows the
1-hour callback promise.

---

## 7. Default HVAC Services (if user skips services input)

| # | Service | Icon |
|---|---|---|
| 1 | AC Repair & Maintenance | snowflake |
| 2 | AC Installation & Replacement | zap |
| 3 | Furnace / Heater Repair | flame |
| 4 | Heating System Installation | thermometer |
| 5 | Heat Pump Services | wind |
| 6 | Duct Cleaning & Sealing | layers |
| 7 | Indoor Air Quality | shield-check |
| 8 | Thermostat Installation & Repair | gauge |
| 9 | 24/7 Emergency HVAC Service | siren |
| 10 | Maintenance Plans & Agreements | calendar-check |

Icons rendered as inline Lucide-style SVG (matching existing `ICON_MAP`
pattern in `deployer.js`).

---

## 8. SEO / Schema Markup (per page)

### Meta tags
- Title format: `{Service} in {City} | {Company}` (home: `{Company} — HVAC Services in {City}`)
- Description mentions phone + city
- Open Graph: og:title, og:description, og:image, og:type=website

### JSON-LD schema (inline `<script type="application/ld+json">`)
- **Home + Contact:** `LocalBusiness` schema with address, phone, hours, geo, priceRange
- **Services page:** array of `Service` schemas (one per offered service)
- **About:** `Organization` schema

---

## 9. Floating Mobile Click-to-Call FAB

- Position: fixed bottom-right, 56-60px green/orange circle
- Appears on viewport ≤ 768px only (desktop has phone in nav)
- Wraps `<a href="tel:{phone}">` with phone icon + pulse-ring animation
- z-index above body content, below modal overlays

---

## 10. Mobile Nav Pattern

**Critical:** phone + "Call Now" OUTSIDE the hamburger — emergency
callers won't open a menu.

Structure (mobile, left→right):
1. Logo (small)
2. Phone icon link (tel:) — always visible
3. Orange "Call Now" button (compact)
4. Hamburger (for Services/About/Areas/Contact menu)

---

## 11. Build Order

1. Scaffold `templates/hvac/common.js` — tokens, shared head+styles, nav, emergency strip, footer, FAB, JSON-LD helpers, Netlify form attrs helper
2. `home.js`
3. `services.js` (zigzag × 10)
4. `areas.js` (per-area LLM content)
5. `about.js`
6. `contact.js` (quote form with Netlify Forms + thank-you page)
7. `templates/hvac/index.js` — exports `generateHvacPages(config, { watermark })` returning `{ '/index.html': ..., '/services/index.html': ..., ... }`
8. `templates/index.js` — `pickTemplate(industry)` router
9. Wire `deployer.js` to the router (switch from direct `generateAllPages` call)
10. `generator.js` — branch to HVAC prompt when industry matches
11. `prompts.js` — add `HVAC_CONTENT_PROMPT` (includes per-area prompt fragment)
12. `conversation/states.js` — add `WEB_COLLECT_AREAS` state
13. `webDev.js` — detect HVAC industry, insert areas-collection step into state flow
14. Local test with dummy "CoolBreeze HVAC, Austin — Round Rock, Cedar Park, Pflugerville"

---

## 12. Edge Cases / Decisions Made

| Question | Decision |
|---|---|
| `/reviews` page? | **No** — thin content risk, homepage already has testimonials + optional Google profile link |
| Emergency phone separate from main phone? | **Same** — small HVAC shops rarely have two numbers |
| Quote form submissions? | **Netlify Forms** (zero-backend) |
| Stock photos? | **No** — Unsplash background + honest "replace me" overlay card |
| Unsplash query? | HVAC-specific: `hvac technician`, `air conditioning repair`, `heating installation` — not generic `house` |
| City-and-areas in separate states? | **Combined** — one prompt, parse with fallback LLM |
| Review-count/rating defaults when empty? | `4.9 ★` / `200+ reviews` with small footnote "Connect your Google profile to show real numbers" |

---

## 13. Open Items (fix later, not MVP blockers)

- Real Google reviews API integration (replaces placeholder rating)
- Gallery/before-after page (only if user uploads photos)
- Embedded video testimonials
- Multi-language HVAC template (Spanish-dominant areas)
- Maintenance-plan dedicated landing page
