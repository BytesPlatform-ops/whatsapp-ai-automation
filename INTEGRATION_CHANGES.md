# Integration Changes Log

## Feature 2: AI Logo Maker (NEW)

**Date:** 2026-04-11  
**Branch:** `designv1`  
**Purpose:** Add AI-powered logo design as a new service in the WhatsApp bot.

### NEW FILES CREATED (no conflicts possible)

| File | Purpose |
|---|---|
| `src/logoGeneration/ideation.js` | GPT-4o generates 5 diverse logo concepts (forced type diversity: combination, wordmark, symbol, lettermark/emblem/mascot, abstract) + expands selected concept into Gemini brief |
| `src/logoGeneration/imageGen.js` | Gemini `gemini-3-pro-image-preview` generates flat vector logos. Logo-specific prompts (NOT copied from ad generator) — flat design only, no photorealism, no scenes |
| `src/logoGeneration/imageUploader.js` | Uploads to Supabase Storage `logo-images` bucket (auto-creates) |
| `src/conversation/handlers/logoGeneration.js` | Full WhatsApp conversation flow handler |

### MODIFIED FILES

#### `src/conversation/states.js`
Added 10 new `LOGO_*` states at the end of the `STATES` object:
```js
LOGO_COLLECT_BUSINESS, LOGO_COLLECT_INDUSTRY, LOGO_COLLECT_DESCRIPTION,
LOGO_COLLECT_STYLE, LOGO_COLLECT_COLORS, LOGO_COLLECT_SYMBOL,
LOGO_COLLECT_BACKGROUND, LOGO_SELECT_IDEA, LOGO_CREATING_IMAGE, LOGO_RESULTS
```

#### `src/conversation/router.js`
1. Added import: `const { handleLogoGeneration } = require('./handlers/logoGeneration');`
2. Added all 10 `LOGO_*` states to `STATE_HANDLERS` map
3. Added 5 text-collection states to `COLLECTION_STATES`: `LOGO_COLLECT_BUSINESS`, `LOGO_COLLECT_INDUSTRY`, `LOGO_COLLECT_DESCRIPTION`, `LOGO_COLLECT_COLORS`, `LOGO_COLLECT_SYMBOL`
4. Added 5 entries to `STATE_QUESTION` map for intent classifier

#### `src/conversation/handlers/serviceSelection.js`
1. Added `{ id: 'svc_logo', title: '✨ Logo Maker', description: 'AI-designed brand logos in 60 seconds' }` to More Services list
2. Added `case 'svc_logo':` handler returning `STATES.LOGO_COLLECT_BUSINESS`
3. Added `svc_logo` regex to `matchServiceFromText`: `/\b(logo|brand\s*mark|wordmark|brand\s*design|design\s*logo|create\s*logo|make\s*logo|logo\s*maker)\b/i`

### NEW SUPABASE BUCKET REQUIRED
A new public bucket `logo-images` is auto-created on first use by `imageUploader.js`. No manual setup needed — but if your Supabase service role lacks `storage.createBucket` permission, you'll need to create it manually in the dashboard:
- Name: `logo-images`
- Public: ✅ enabled
- Allowed MIME types: `image/png, image/jpeg, image/webp`
- File size limit: 10 MB

### NEW DEPENDENCIES
None — uses existing `@google/generative-ai`, `openai`, `@supabase/supabase-js`, `uuid`.

### CONVERSATION FLOW (10 states, 7 user inputs)
```
LOGO_COLLECT_BUSINESS    → "What is your business name?"
LOGO_COLLECT_INDUSTRY    → "What industry?"
LOGO_COLLECT_DESCRIPTION → "In one sentence, what does your business do?"
LOGO_COLLECT_STYLE       → [⚡ Modern] [🏛 Classic] [💎 Luxury]  (also Playful/Bold via fallback)
LOGO_COLLECT_COLORS      → "Brand colors? (or skip — AI designs)"
LOGO_COLLECT_SYMBOL      → "Any symbol idea? (or skip)"
LOGO_COLLECT_BACKGROUND  → [⬜ White] [🔲 Transparent] [⬛ Black]
        ↓
LOGO_SELECT_IDEA         → 5 concepts shown as interactive list
LOGO_CREATING_IMAGE      → handled inline by handleSelectIdea
LOGO_RESULTS             → [🔄 New Concepts] [📦 Full Branding] [📋 Back to Menu]
```

### KEY DESIGN DIFFERENCES FROM AD GENERATOR
Logo generation is fundamentally different from ad generation — the prompts are NOT copied:
- **Flat vector style** — never photorealistic, never 3D, never scenes
- **Single centered mark** — no environments, no props, no lighting
- **Forced type diversity** — concepts 1-5 are 5 DIFFERENT logo types, not variations
- **No CTA / no pricing / no slogan** — logos are just brand mark + name
- **Always 1024×1024** — square only, no aspect ratio choices
- **2-3 colors max** — logos use restraint
- **130-word brief** vs 150-word ad brief — Gemini works better with focused logo prompts
- **Lower temperature (0.6)** — precision over creativity for logos
- **Background as user choice** — White / Transparent / Black

---

## Feature 1: Marketing Ad Generation (Design-Automation-V2 → WhatsApp Bot)

**Date:** 2026-04-07  
**Author:** Claude (AI assistant)  
**Purpose:** Track all changes made to the shared codebase so the colleague can merge cleanly.

---

## Summary

Integrated the `Design-Automation-V2` AI marketing ad generation pipeline into the WhatsApp bot. Users can now trigger ad creation from the service menu, provide brand details conversationally, and receive AI-generated marketing images via WhatsApp.

**Tech added:**
- Google Gemini (`gemini-3-pro-image-preview`) for image generation
- OpenAI GPT-4o for creative ideation + prompt expansion
- Supabase Storage bucket `ad-images` for hosting generated images

---

## NEW FILES CREATED (no conflicts possible)

### `src/adGeneration/ideation.js`
- Generates 3 unique marketing ad concepts using OpenAI GPT-4o
- Expands a selected concept into a detailed Gemini image prompt
- Ported from `Design-Automation-V2/src/lib/openai.ts`

### `src/adGeneration/imageGen.js`
- Generates ad images using Google Gemini (`gemini-3-pro-image-preview`)
- Supports: no image / product image / logo inputs
- Industry-aware mood guides, smart CTA selection
- Ported from `Design-Automation-V2/src/lib/gemini.ts`

### `src/adGeneration/imageUploader.js`
- Uploads generated base64 images to Supabase Storage (bucket: `ad-images`)
- Auto-creates public bucket on first use
- Returns public URL for WhatsApp `sendImage()`

### `src/conversation/handlers/adGeneration.js`
- Full WhatsApp conversation handler for the ad generation flow
- Manages 10 states (see state list below)
- Handles image upload from user, idea selection, error recovery

---

## MODIFIED FILES (merge carefully)

### 1. `src/conversation/states.js`

**Added at end of STATES object** (before closing `}`):

```js
// Marketing Ad Generation flow (Design-Automation-V2 integration)
AD_COLLECT_BUSINESS: 'AD_COLLECT_BUSINESS',
AD_COLLECT_INDUSTRY: 'AD_COLLECT_INDUSTRY',
AD_COLLECT_NICHE: 'AD_COLLECT_NICHE',
AD_COLLECT_TYPE: 'AD_COLLECT_TYPE',
AD_COLLECT_SLOGAN: 'AD_COLLECT_SLOGAN',
AD_COLLECT_PRICING: 'AD_COLLECT_PRICING',
AD_COLLECT_IMAGE: 'AD_COLLECT_IMAGE',
AD_SELECT_IDEA: 'AD_SELECT_IDEA',
AD_CREATING_IMAGE: 'AD_CREATING_IMAGE',
AD_RESULTS: 'AD_RESULTS',
```

---

### 2. `src/conversation/router.js`

**a) Added import** (after `handleCustomDomain` import line):
```js
const { handleAdGeneration } = require('./handlers/adGeneration');
```

**b) Added to `STATE_HANDLERS` map** (after chatbot SaaS block):
```js
// Marketing Ad Generation flow
[STATES.AD_COLLECT_BUSINESS]: handleAdGeneration,
[STATES.AD_COLLECT_INDUSTRY]: handleAdGeneration,
[STATES.AD_COLLECT_NICHE]: handleAdGeneration,
[STATES.AD_COLLECT_TYPE]: handleAdGeneration,
[STATES.AD_COLLECT_SLOGAN]: handleAdGeneration,
[STATES.AD_COLLECT_PRICING]: handleAdGeneration,
[STATES.AD_COLLECT_IMAGE]: handleAdGeneration,
[STATES.AD_SELECT_IDEA]: handleAdGeneration,
[STATES.AD_CREATING_IMAGE]: handleAdGeneration,
[STATES.AD_RESULTS]: handleAdGeneration,
```

**c) Added to `COLLECTION_STATES` Set** (after `STATES.CB_COLLECT_LOCATION`):
```js
// Ad generation text-collection states
STATES.AD_COLLECT_BUSINESS,
STATES.AD_COLLECT_INDUSTRY,
STATES.AD_COLLECT_NICHE,
STATES.AD_COLLECT_SLOGAN,
STATES.AD_COLLECT_PRICING,
```

**d) Added to `STATE_QUESTION` map** (after `CB_COLLECT_LOCATION` entry):
```js
// Ad generation
[STATES.AD_COLLECT_BUSINESS]: 'What is your business name?',
[STATES.AD_COLLECT_INDUSTRY]: 'What industry are you in? (e.g. Food & Beverage, Fashion, Tech)',
[STATES.AD_COLLECT_NICHE]: 'What product or service is this ad for?',
[STATES.AD_COLLECT_SLOGAN]: 'Do you have a brand slogan or tagline? (or type skip)',
[STATES.AD_COLLECT_PRICING]: 'Any pricing info to display on the ad? (or type skip)',
```

---

### 3. `src/conversation/handlers/serviceSelection.js`

**a) Added `svc_adgen` to the "More Services" list** (after `svc_marketing` row):
```js
{ id: 'svc_adgen', title: '🎨 Marketing Ads', description: 'AI-generated social media ad images' },
```

**b) Added `svc_adgen` case** in the `switch` block (after `svc_marketing` case):
```js
case 'svc_adgen':
  await sendWithMenuButton(
    user.phone_number,
    '🎨 *AI Marketing Ad Generator*\n\n' +
      'Create professional social media ad images powered by AI...\n\n' +
      '✅ Instagram, Facebook & TikTok ready\n' +
      '✅ Industry-specific creative direction\n' +
      '✅ Your brand colors, logo & pricing included\n' +
      '✅ Ready to post in 60 seconds\n\n' +
      'Let\'s get started!'
  );
  await logMessage(user.id, 'Starting ad generation flow', 'assistant');
  return STATES.AD_COLLECT_BUSINESS;
```

**c) Updated `matchServiceFromText`** — changed `svc_marketing` regex and added `svc_adgen`:
```js
// Before (original):
if (/\b(market|advertis|ads|social media|ppc|brand)\b/i.test(text)) return 'svc_marketing';

// After (split to avoid "ads" matching marketing instead of ad gen):
if (/\b(market|advertis|social media|ppc|brand)\b/i.test(text)) return 'svc_marketing';
if (/\b(ad\s*gen|ads?\s*creat|ad\s*design|ad\s*image|ad\s*maker|create\s*ad|design\s*ad|marketing\s*ad)\b/i.test(text)) return 'svc_adgen';
```

---

### 4. `.env`

**Added** (after `LLM_PROVIDER` line):
```
# ──────────────────────────────────────────────
# Google Gemini (Marketing Ad Generation)
# Get key from: https://aistudio.google.com/app/apikey
# ──────────────────────────────────────────────
GEMINI_API_KEY='your_gemini_api_key'
```

---

### 5. `package.json`

**Added dependency:**
```json
"@google/generative-ai": "^0.24.1"
```
_(already installed via `npm install @google/generative-ai@^0.24.1`)_

---

## Conversation Flow (for reference)

```
Service Menu → [🎨 Marketing Ads]
    ↓
AD_COLLECT_BUSINESS   "What is your business name?"
    ↓
AD_COLLECT_INDUSTRY   "What industry are you in?"
    ↓
AD_COLLECT_NICHE      "What product/service is this ad for?"
    ↓
AD_COLLECT_TYPE       [📦 Physical] [🛎 Service] [💻 Digital]  (buttons)
    ↓
AD_COLLECT_SLOGAN     "Brand slogan? (or skip)"
    ↓
AD_COLLECT_PRICING    "Pricing to display? (or skip)"
    ↓
AD_COLLECT_IMAGE      "Send product/logo image (or skip)"
    ↓
AD_SELECT_IDEA        GPT-4o generates 3 concepts → list message
    ↓  (user picks one)
AD_CREATING_IMAGE     GPT-4o expands prompt → Gemini generates image → Supabase upload
    ↓
AD_RESULTS            WhatsApp sends generated image
                      [🔄 New Concepts] [📣 Full Campaign] [📋 Back to Menu]
```

---

## Setup Required

1. **Get a Gemini API key** from [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. **Add to `.env`**: `GEMINI_API_KEY='your_actual_key'`
3. **Supabase Storage**: The `ad-images` bucket is created automatically on first use (public bucket, max 10MB per file)
4. **Run**: `npm install` to ensure `@google/generative-ai` is installed

---

## Data Stored in `user.metadata.adData`

```json
{
  "businessName": "Milan Foods",
  "industry": "Food & Beverage",
  "niche": "Premium Basmati Rice",
  "productType": "physical",
  "slogan": "Fresh From Farm",
  "pricing": "Rs. 250/kg",
  "imageBase64": "data:image/jpeg;base64,...",
  "ideas": [{ "id": "idea_1", "title": "...", "description": "...", "visualConcept": "..." }],
  "selectedIdeaIndex": 0
}
```

This data is cleared at the start of each new ad generation session.
