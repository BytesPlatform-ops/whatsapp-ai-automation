# Real Estate Niche Website Template — Context & Plan

**Owner:** BytesPlatform bot (WhatsApp auto-generated sites)
**Created:** 2026-04-15
**Status:** Plan locked (decisions confirmed), implementation pending

Single source of truth for the real-estate (solo-agent) template work.
Mirrors the structure of `hvac_context.md`.

---

## 1. Why Real Estate Is Different (Research Summary)

### Visitor mix (very unlike HVAC's emergency-driven traffic)
| Mode | % | Mindset | Needs |
|---|---|---|---|
| **Browser** | ~50% | Curious, scrolling photos, dreaming. 6-12 months from buying. | Beautiful imagery, smooth nav, neighborhood vibes |
| **Active buyer** | ~25% | Ready in 1-3 months. Comparing 3-5 agents. | Agent credibility, recent sales, area expertise |
| **Active seller** | ~15% | Wants home valuation. | "What's my home worth?" tool, sold prices nearby |
| **Investor** | ~10% | Numbers-driven. | Cap rates, ROI talk, neighborhood data |

**The site sells the AGENT, not the houses.** Listings are commodity (everyone has Zillow). Trust + local expertise are what differentiate.

### Industry conventions (audited from Compass, RE/MAX, Coldwell agent pages)
1. Photography is everything — high-res hero, beautiful interiors
2. Agent personal brand visible in first 2 sec
3. Featured listings (3-6 cards): photo + price + beds/baths/sqft
4. Neighborhood pages = local SEO gold (parallel to HVAC service areas, but richer)
5. **"What's my home worth?"** lead magnet — single biggest seller-side conversion tool
6. Track-record numbers: "$50M closed in 2025", "200+ homes sold", "15 years"
7. Designations badges (CRS, GRI, ABR, REALTOR®)
8. Brokerage logo (legally required in most US states)
9. Schedule-a-consultation secondary CTA throughout
10. **Quiet, premium tone** — no flashing buttons, no urgency strips

---

## 2. Architecture

### Decision: parallel template, not a modification of generic
Same pattern as HVAC. New folder `templates/real-estate/`. Industry detection routes there.

```
src/website-gen/templates/
├── real-estate/
│   ├── index.js        exports generateRealEstatePages(config)
│   ├── common.js       tokens, styles, nav, footer, lead-form helpers, schemas
│   ├── home.js
│   ├── listings.js
│   ├── neighborhoods.js
│   ├── about.js
│   └── contact.js
└── index.js            pickTemplate(industry) — extended
```

### Industry matching — keywords for `isRealEstate(industry)`
`real estate`, `realty`, `realtor`, `real-estate`, `realestate`, `broker`, `property`, `properties`, `homes`, `mls`. Case-insensitive substring match.

### Pipeline (same as HVAC)
```
webDev.js collects data
  └─ generator.js (LLM content via REAL_ESTATE_CONTENT_PROMPT)
      └─ deployer.js
          └─ templates/index.js → pickTemplate(industry)
              ├─ templates/real-estate/index.js (if real estate match)
              ├─ templates/hvac/index.js (if HVAC match)
              └─ existing generic path (else)
```

---

## 3. Pages (5 total)

### 3.1 Home (`/`)
- **Hero**: full-bleed Unsplash neighborhood/property photo (60-70vh) with soft dark overlay; agent name overlay + tagline + dual CTA: `Browse Listings` (primary gold) + `Schedule a Call` (outline)
- **Stats strip**: `$50M Closed 2025 · 200+ Homes Sold · 4.9★ from 80+ Reviews · 15 Years Local`
- **Agent intro split**: large agent photo (gradient placeholder with initials — NEVER stock person) + 2-paragraph story + designations chips + brokerage logo
- **Featured listings (3-card grid)**: photo + price tag + address + beds/baths/sqft + "View Details"
- **Neighborhood spotlight** (3-6 area cards with cover image + name + median price)
- **Testimonials carousel** (luxury-card style, serif quotes)
- **"What's my home worth?" lead capture banner** (gold accent, full-width section)
- **Footer**

### 3.2 Listings (`/listings/`)
- Header: "Browse Listings"
- **Prominent banner at top:** *"🏠 Live MLS listings coming soon. Contact me directly to see what's available today."* (per Decision 1 refinement)
- Filter bar (cosmetic for MVP — type, price range, beds/baths)
- Property cards grid (2-3 cols)
- Each card: Unsplash interior photo + price tag + address + beds/baths/sqft + status badge ("FOR SALE" / "JUST LISTED" / "PENDING")
- Subtle 12px 60%-opacity bottom strip on each photo: `📸 Sample photo — Replace with your listing`
- Bottom CTA: "Request a private tour"

### 3.3 Neighborhoods (`/neighborhoods/`)
- Hero with embedded map (or city skyline image)
- Per-neighborhood cards: cover photo, name, median home price, walkability score (LLM estimates), schools rating, 60-90 word unique description
- Anchor pills at top to jump to specific neighborhoods

### 3.4 About (`/about/`)
- Hero: large editorial-style agent photo (gradient placeholder with prominent "Your Professional Headshot" label per Decision 4)
- Personal story (1st-person, magazine voice)
- Credentials grid: designations as elegant pills (CRS · GRI · ABR · REALTOR®)
- Track record stats — big serif numbers (`$50M`, `200+`, `15`)
- Brokerage affiliation card
- "Why work with me" 3-pillar editorial layout
- Contact CTA at bottom

### 3.5 Contact (`/contact/`)
- Three-path intro: "Buying" · "Selling" · "Just curious"
- **Lead form (Netlify Forms)** with intent dropdown
- Direct phone, email, brokerage address
- Optional Calendly embed (if user provides URL)
- Hours
- "Our promise" callout: *"I'll personally review your property details and send you a comparative market analysis within 24 hours."* (per Decision 3)

---

## 4. Design Tokens (locked)

### Colors
```
── Brand ──
Deep Navy        #1A2B45    primary; trust, established, premium
Navy Hover       #0F1B30
Champagne Gold   #C9A96E    accent — luxury feel; CTAs, badges, accents
Gold Hover       #B8975C

── Surface ──
Warm White       #FAF7F2    page bg (NOT pure white — too cold)
Cream            #F2EDE4    alt section bg
Warm Beige       #E8E4DD    borders, subtle dividers
Charcoal         #1A2B45    footer / dark sections (same as Navy for unity)

── Text ──
Heading          #1A2B45    matches primary navy
Body             #4A5468    slate slightly warm
Muted            #8A9099
On Dark          #FAF7F2

── Status badges (listings) ──
For Sale         #2D7A4F    forest green
Just Listed      #C9A96E    gold (same as accent)
Pending          #B8975C    darker gold
Sold             #1A2B45    navy

── Reserved ──
Red              SOLD or "JUST SOLD" badges only — never CTA, never decoration
```

### Typography
| Element | Desktop → Mobile | Weight | Font |
|---|---|---|---|
| Hero H1 | 56→32px | 600 | **Cormorant Garamond** (serif) |
| Section H2 | 40→28px | 500 | Cormorant Garamond |
| Subhead | 22→18px | 600 | Inter |
| Body | 17→16px | 400 | Inter |
| Stats / numbers | 64→48px | 700 | Cormorant Garamond bold |
| Eyebrow | 12px | 600 uppercase 0.12em letter-spacing | Inter |
| Button | 16px | 500 | Inter |

Line-height: 1.2 for serif headings (tighter), 1.65 for body.

---

## 5. Variables (collected by bot)

| Field | Existing? | Notes |
|---|---|---|
| `agentName` | reuses `businessName` | personal brand |
| `phone` | ✅ | — |
| `email` | ✅ | — |
| `address` | ✅ | (brokerage office) |
| `services[]` | ✅ | becomes "What I help with" — buyer rep, seller rep, etc. |
| `primaryCity` | ✅ (HVAC pattern) | — |
| `serviceAreas[]` | ✅ (HVAC pattern) | rendered as "neighborhoods I serve" |
| `brokerageName` | ⚠️ new optional | shown in footer + about |
| `licenseNumber` | ⚠️ new optional | small footer text |
| `yearsExperience` | ⚠️ new optional | "15 years" stat |
| `homesSold` | ⚠️ new optional | "200+ homes sold" stat |
| `volumeClosed` | ⚠️ new optional | "$50M closed 2025" stat |
| `designations[]` | ⚠️ new optional | CRS, GRI, ABR — comma-separated |
| `specialty` | ⚠️ new optional | "Luxury", "First-time buyers", "Investment" |
| `calendlyUrl` | ⚠️ new optional | embeds in contact page |
| `googleRating` / `reviewCount` | reuses HVAC fields | placeholder defaults |

For MVP we don't add new conversation states. The HVAC `WEB_COLLECT_AREAS` state already collects city + areas (re-purposed for neighborhoods). Optional fields fall back to sensible defaults if not supplied.

---

## 6. Photography Strategy (per Decision 4)

| Surface | Source | Overlay |
|---|---|---|
| **Hero photo** | Unsplash query (city/neighborhood) | None — hero photos are obviously generic |
| **Property listing cards** | Unsplash interior/exterior queries (4 calls in parallel) | Subtle 12px 60% opacity bottom strip: `📸 Sample photo — Replace with your listing` |
| **Neighborhood card photos** | Unsplash (city skyline / suburb / lifestyle) | None |
| **Agent headshot** | **NEVER Unsplash** (reverse-image-search risk) | Elegant gradient placeholder with initials + "Your Professional Headshot" prominent label |
| **About page agent photo (large)** | Same as headshot — gradient + initials | "Replace with your real photo" prominent note |
| **Brokerage logo** | Empty / typographic placeholder | "Logo placeholder" small note |

---

## 7. Netlify Forms (Decision 3 refinement)

Same pattern as HVAC. Two forms:
1. **Home valuation** (banner CTA on home + contact pages):
   - Fields: name, email, phone, property address, beds, baths, condition (dropdown), timeframe
   - Form name: `valuation`
   - Action: `/thank-you-cma/`
   - Thank-you copy: *"Thanks! I'll personally review your property details and send you a comparative market analysis within 24 hours."*
2. **General consultation** (contact page):
   - Fields: name, email, phone, intent (Buying / Selling / Just curious dropdown), neighborhood interest, message
   - Form name: `consultation`
   - Action: `/thank-you/`
   - Thank-you copy: *"Thanks! I'll be in touch personally within 24 hours."*

---

## 8. SEO / Schema Markup

### Meta tags
- Title: `{Agent Name} — Real Estate in {City} | {Brokerage}`
- Description mentions city + brokerage + designations
- OG tags

### JSON-LD
- **Home + Contact**: `RealEstateAgent` schema with name, brokerage (parentOrganization), areaServed, telephone, email
- **Listings**: array of `Residence` / `RealEstateListing` schemas (placeholder)
- **About**: `Person` schema with `jobTitle: Real Estate Agent`

---

## 9. Floating Schedule FAB (replaces HVAC call FAB)

- Mobile only (≤900px)
- Bottom-right, gold circle, calendar icon
- Links to Calendly (if URL provided) or `/contact/`
- Subtle pulse ring (slower than HVAC's — sophisticated, not urgent)

---

## 10. Differences From HVAC Architecture

| | HVAC | Real Estate |
|---|---|---|
| Emergency strip | ✅ Required, red top bar | ❌ None (no panic mode) |
| Floating FAB | Call icon (orange) | Calendar icon (gold) |
| Hero CTA | "Call Now" + "Get Quote" | "Browse Listings" + "Schedule" |
| Visual density | High — many cards | Low — large photos, white space |
| Color tone | Bold blue + bright orange | Subtle navy + understated gold |
| Display font | Plus Jakarta Sans (sans) | Cormorant Garamond (serif) |
| Animation | Hover lifts, pulse rings | Subtle fades only |
| Trust signals | License/Insured/Years | Designations + sales volume + years |
| Form complexity | Simple quote form | Buyer/Seller/Browser intent split + valuation form |
| Photography | Service action shots | Beautiful interior/exterior, neighborhood shots |
| Featured-content section | Service grid | Property listings grid + neighborhood cards |

---

## 11. LLM Content Prompt Strategy

New `REAL_ESTATE_CONTENT_PROMPT` returns:
- `heroSubtitle` (sophisticated, not punchy)
- `heroImageQuery` (city/luxury/architectural — never "real estate logo")
- `aboutText`, `aboutText2` (1st-person agent voice — sounds like THE agent talking)
- `featuredListings[]` (3 placeholder properties: realistic addresses appropriate to the city, prices in regional range, beds/baths/sqft)
- `neighborhoods{}` map of `{name → 60-90 word unique description with walkability/schools/lifestyle hooks}` — same per-area unique-content rule as HVAC to avoid duplicate-content penalty
- `testimonials[]` (3, mixing buyer + seller + investor angles, named, specific details)
- `whyChooseUs[]` (3-4 pillars in agent's voice — "Why work with me")
- `marketStats` object: `{medianPrice, daysOnMarket, yearOverYearChange}` (LLM estimates based on city)
- `valuationCallout` (lead-magnet copy for the home-valuation banner)
- `services[]` translated to "How I help" if generic services[] given

---

## 12. Build Order

1. Scaffold `templates/real-estate/common.js` — tokens, base styles, nav (transparent over hero, solidifies on scroll), footer, FAB, JSON-LD helpers, Netlify form attrs, agent-headshot placeholder helper, listing photo strip helper
2. `home.js` — hero with full-bleed photo + agent overlay + dual CTA, stats strip, agent intro split, featured listings grid, neighborhood spotlight, testimonials carousel, valuation banner, footer
3. `listings.js` — banner + filter bar (cosmetic) + property card grid + bottom CTA
4. `neighborhoods.js` — map hero + per-neighborhood cards with unique LLM content
5. `about.js` — large agent photo, story, designations grid, stats strip, why-choose pillars, brokerage card
6. `contact.js` — intent split + consultation form + 24-hr promise callout (+ optional Calendly embed)
7. `templates/real-estate/index.js` — exports `generateRealEstatePages`
8. Extend `templates/index.js` router with `isRealEstate()` + dispatch
9. Generator: add `REAL_ESTATE_CONTENT_PROMPT`, branch when `isRealEstate(industry)`, fetch hero + N listing photos via Unsplash
10. Add real-estate INDUSTRY_COLORS entry (navy + gold)
11. Smart extractor: extend to also detect brokerageName / designations / specialty when conversational
12. webDev: ensure HVAC's `WEB_COLLECT_AREAS` step also fires for real-estate industry (rename concept "areas" → "neighborhoods" in the prompt wording when isRealEstate)
13. Local smoke test with `Sterling Realty Group, Sarah Mitchell, Austin — Westlake, Tarrytown, Mueller`

---

## 13. Decisions Made (summary)

| Question | Decision |
|---|---|
| MLS feed integration? | **Placeholder + "live listings coming soon" banner** (legal, honest, lead-capturing) |
| Solo agent vs brokerage? | **Solo agent template first**; brokerage variant later |
| Form submission flow? | **Netlify Forms** with 24-hour response promise |
| Property photos? | **Unsplash with subtle 12px 60% opacity strip** ("sample — replace with your listing") |
| Agent headshot? | **NEVER Unsplash** (reverse-search risk). Gradient placeholder + initials + prominent "Replace" label |
| Hero photo? | Unsplash neighborhood/city photo, no overlay |

---

## 14. Open Items (post-MVP)

- Brokerage variant template (multi-agent team page)
- Real MLS feed integration (requires authorized broker license + IDX agreement)
- Neighborhood-specific landing pages for SEO (one URL per neighborhood)
- Past sales / portfolio page
- Blog / market reports section
- IDX-style property search (filter by price/beds/baths and pull MLS results)
