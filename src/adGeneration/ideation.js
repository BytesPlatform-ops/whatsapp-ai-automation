/**
 * Ad Ideation Service
 * Ported from Design-Automation-V2/src/lib/openai.ts
 *
 * Uses OpenAI GPT-4o to generate 3 unique marketing ad concepts
 * and expand a selected concept into a detailed Gemini image prompt.
 */

const OpenAI = require('openai');
const { env } = require('../config/env');

let openaiClient = null;

function getOpenAI() {
  if (!openaiClient) {
    if (!env.llm.openaiApiKey) throw new Error('OPENAI_API_KEY is not set');
    openaiClient = new OpenAI({ apiKey: env.llm.openaiApiKey });
  }
  return openaiClient;
}

/**
 * Returns current season/trend context for prompts (month-aware)
 */
function getSeasonalContext() {
  const month = new Date().getMonth(); // 0-indexed
  const trends = ['2025-2026 design trends: neo-brutalism, bold serif typography, editorial product photography, warm grain/analog revival, earth-tone minimalism, cinematic color grading'];
  let season = '';
  if (month >= 5 && month <= 7) season = 'SUMMER vibes — bright colors, outdoor energy, refreshing tones';
  else if (month >= 8 && month <= 10) season = 'AUTUMN vibes — warm amber/copper, cozy textures, harvest mood';
  else if (month >= 11 || month <= 1) season = 'WINTER vibes — cool blues/silvers, cozy warmth contrast, holiday spirit';
  else season = 'SPRING vibes — fresh greens, bloom/renewal energy, pastels, new beginnings';
  trends.push(season);

  // Ramadan / Eid approximate window
  const day = new Date().getDate();
  if ((month === 2 && day >= 10) || (month === 3 && day <= 15)) {
    trends.push('Ramadan season — iftar gatherings, spiritual warmth, crescent moon motifs, purple/gold/green palette');
  }
  if ((month === 3 && day >= 20) || (month === 4 && day <= 5)) {
    trends.push('Eid ul-Fitr season — celebration, joy, gift-giving, festive colors');
  }

  return trends.join('\n');
}

/**
 * Generate 3 unique marketing ad concepts via OpenAI GPT-4o
 *
 * @param {object} details - { businessName, industry, niche, productType, slogan?, pricing? }
 * @returns {Promise<Array>} Array of 3 idea objects: { id, title, description, visualConcept }
 */
async function generateAdIdeas(details) {
  const { businessName, industry, niche, productType, slogan, pricing } = details;
  const seasonalContext = getSeasonalContext();

  const systemPrompt = `You are an elite creative director at a world-class advertising agency. Create SCROLL-STOPPING single-image social media ad concepts.

RULES:
1. SINGLE IMAGE ADS only — not campaigns, not videos, not carousels
2. Each of the 3 ideas must be COMPLETELY DIFFERENT in mood, scene, and approach
3. Concepts must be REALISTIC for AI image generation — natural photography scenes, studio setups, real-world environments. NO surreal/fantasy/impossible scenes.
4. COMMERCIAL EFFECTIVENESS FIRST — every concept must make the viewer want to BUY/USE the product
5. Reality check: "Could a photographer recreate this scene in a real studio?" If NO, don't suggest it.

For visualConcept write a PHOTOGRAPHER'S SHOT LIST:
- Exact scene/environment (specific surfaces, materials — "brushed concrete counter", NOT "clean background")
- Lighting: direction, quality, color temperature
- Composition: camera angle, product placement, depth of field
- Color palette: 2-3 dominant tones as a mood
- Text placement: where brand name / slogan / price would sit
- Emotional tone: ONE clear emotion per concept

Always respond with valid JSON.`;

  const userPrompt = `Create 3 UNIQUE ad concepts for this ${industry} business.

BRAND: "${businessName}"
Industry: ${industry}
Product/Service: ${niche}
Product Type: ${productType} (${productType === 'physical' ? 'tangible product' : productType === 'digital' ? 'software/app/digital tool' : 'service business'})
${slogan ? `Brand Slogan: "${slogan}"` : ''}
${pricing ? `Pricing: "${pricing}"` : ''}

CURRENT CONTEXT:
${seasonalContext}

The 3 ideas should span DIFFERENT approaches naturally. Good directions for ${industry}:
• Product-as-hero (premium studio showcase, dramatic lighting, close-up detail)
• Lifestyle context (product in real life, aspirational scene, emotional payoff)
• Bold typography-led (words ARE the visual, minimal but impactful)

Each visualConcept must use COMPLETELY DIFFERENT surfaces, lighting, and color palette moods.

⚠️ DO NOT GENERATE: surreal floating objects, neon gradient meshes, fantasy cloudscapes, impossible physics, abstract 3D voids.

Respond with JSON:
{
  "ideas": [
    {
      "id": "idea_1",
      "title": "Short Evocative Title (3-5 words)",
      "description": "What this ad communicates and why it works (1-2 sentences)",
      "visualConcept": "Photographer's shot list — 4-5 sentences covering exact scene, lighting, composition, text placement, mood, and color palette."
    },
    { "id": "idea_2", ... },
    { "id": "idea_3", ... }
  ]
}`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.88,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('No response from OpenAI');
  const parsed = JSON.parse(content);
  return parsed.ideas;
}

/**
 * Expand a selected idea into a detailed 150-200 word Gemini image generation prompt
 *
 * @param {object} idea - { id, title, description, visualConcept }
 * @param {object} details - { businessName, industry, niche, productType, slogan?, pricing? }
 * @returns {Promise<string>} The expanded cinematic prompt
 */
async function expandIdeaToPrompt(idea, details) {
  const { businessName, industry, niche, productType, slogan, pricing } = details;

  const systemPrompt = `You are a master prompt engineer for AI image generators. Transform a marketing ad concept into the PERFECT prompt for Google Gemini image generation.

Write 150-200 words of pure visual direction — like a cinematographer's shot list.
Include: scene/environment, lighting direction, color palette mood, composition, emotional energy, typography feeling (describe the FEELING, NOT a font name).
The prompt should paint such a vivid picture that anyone reading it can SEE the exact image.

Always respond with valid JSON.`;

  const userPrompt = `Transform this ad concept into a production-ready Gemini image prompt.

Brand: "${businessName}" | Industry: ${industry} | Niche: ${niche} | Type: ${productType}
${slogan ? `Slogan: "${slogan}"` : ''}
${pricing ? `Pricing: "${pricing}"` : ''}

Concept: "${idea.title}"
Direction: ${idea.visualConcept}

Write a CINEMATIC prompt (150-200 words) covering:
1. Scene/environment (specific surfaces, materials, atmosphere — be CONCRETE)
2. Lighting (direction, quality, color temperature)
3. Color palette mood (warm earth tones, icy blues, vibrant contrast, etc.)
4. Composition and camera feel (angle, depth of field, focal point)
5. Emotional energy (what the viewer FEELS)
6. Typography direction for brand name${slogan ? `, slogan "${slogan}"` : ''}${pricing ? `, price "${pricing}"` : ''} (describe the STYLE and PLACEMENT — bold industrial? elegant and thin? positioned where?)

Respond:
{
  "prompt": "Your full cinematic prompt here..."
}`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.80,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('No response from OpenAI');
  const parsed = JSON.parse(content);
  return parsed.prompt;
}

module.exports = { generateAdIdeas, expandIdeaToPrompt };
