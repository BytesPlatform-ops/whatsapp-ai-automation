# Integration Changes Log
## Feature: Marketing Ad Generation (Design-Automation-V2 → WhatsApp Bot)

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
