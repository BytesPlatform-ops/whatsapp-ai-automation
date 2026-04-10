/**
 * Logo Ideation Service
 *
 * Logo design has fundamentally different requirements than marketing ads:
 *   - Single centered mark, no scenes or environments
 *   - Brand name is THE design (not text overlay on a photo)
 *   - Forced diversity across the 7 logo types (wordmark, lettermark, symbol,
 *     combination, emblem, mascot, abstract) — NOT 5 of the same kind
 *   - Must follow the 5 logo principles: Simple, Memorable, Timeless,
 *     Versatile, Appropriate
 *   - Flat vector style — never photorealistic
 *
 * Pipeline:
 *   1. generateLogoIdeas() → 5 diverse logo concepts
 *   2. expandLogoToPrompt() → 1 detailed Gemini execution brief for the chosen concept
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
 * Industry-aware logo aesthetic guidance
 */
function getIndustryLogoGuide(industry) {
  const ind = (industry || '').toLowerCase();

  if (ind.includes('food') || ind.includes('restaurant') || ind.includes('cafe') || ind.includes('beverage') || ind.includes('bakery')) {
    return 'Food/Beverage logos: Often use organic, hand-crafted, or playful elements. Color palettes lean warm (red, orange, brown, gold). Typography can be friendly script (artisan), bold sans (modern fast-casual), or elegant serif (fine dining). Symbols often relate to ingredients, flames, leaves, wheat, animals, kitchen tools.';
  }
  if (ind.includes('tech') || ind.includes('software') || ind.includes('saas') || ind.includes('app') || ind.includes('ai')) {
    return 'Tech logos: Geometric, minimal, abstract symbols. Typography is almost always a clean modern sans (Inter/Helvetica/Geist style). Color palettes lean cool (blue, purple, electric green) or monochrome (black/white). Symbols are often abstract shapes, geometric forms, or letterforms used as marks.';
  }
  if (ind.includes('fashion') || ind.includes('clothing') || ind.includes('apparel') || ind.includes('luxury')) {
    return 'Fashion/Luxury logos: Often elegant wordmarks in serif or refined sans. Monogram or lettermark designs are common. Color is usually monochromatic — black, white, gold, or single brand color. Minimalism wins. Think Chanel, YSL, Hermès — type IS the design.';
  }
  if (ind.includes('beauty') || ind.includes('cosmetic') || ind.includes('skincare') || ind.includes('salon') || ind.includes('spa')) {
    return 'Beauty/Skincare logos: Soft, elegant, often serif typography. Pastel or muted color palettes (rose gold, blush, sage). Symbols when used are botanical (leaves, flowers) or abstract organic curves. Glossier/Aesop level minimalism is the gold standard.';
  }
  if (ind.includes('fitness') || ind.includes('gym') || ind.includes('sport') || ind.includes('athletic')) {
    return 'Fitness/Sports logos: Bold, dynamic, aggressive. Heavy sans-serif or italicized typography. Strong color contrast (black/red, black/yellow). Symbols often suggest motion, strength, or athletic forms (lightning, peaks, animals). Nike/Under Armour style.';
  }
  if (ind.includes('real estate') || ind.includes('property') || ind.includes('construction')) {
    return 'Real Estate/Construction logos: Trustworthy, structured, premium. Typography is often serif (luxury) or strong sans (modern developer). Architectural symbols (rooftops, columns, keys, geometric blocks). Navy/gold/charcoal palettes convey trust.';
  }
  if (ind.includes('jewelry') || ind.includes('watch')) {
    return 'Jewelry/Watch logos: Elegant serifs or refined script. Gold, silver, or rose gold accents. Monograms common. Symbols when used are intricate but small. Cartier/Tiffany/Rolex aesthetic — restrained luxury.';
  }
  if (ind.includes('education') || ind.includes('school') || ind.includes('course') || ind.includes('learning')) {
    return 'Education logos: Friendly but authoritative. Mix of serif (tradition) and rounded sans (approachable). Symbols include books, graduation caps, lightbulbs, geometric shapes representing growth/knowledge. Blue/green palettes common.';
  }
  if (ind.includes('health') || ind.includes('medical') || ind.includes('pharma') || ind.includes('dental') || ind.includes('wellness')) {
    return 'Healthcare logos: Clean, professional, trustworthy. Sans-serif typography. Symbols include cross, heart, leaf, abstract care shapes. Blue/green/white palettes (trust + calm). Avoid anything clinical-cold — warmth matters.';
  }
  if (ind.includes('finance') || ind.includes('bank') || ind.includes('insurance') || ind.includes('invest')) {
    return 'Finance/Banking logos: Strong, stable, premium. Bold serif or geometric sans. Symbols suggest growth (arrows, peaks, shields, coins). Navy, deep blue, gold, charcoal — trustworthy color palette.';
  }
  if (ind.includes('travel') || ind.includes('hotel') || ind.includes('tourism') || ind.includes('hospitality')) {
    return 'Travel/Hospitality logos: Aspirational, elegant. Mix of serif (luxury hotel) and modern sans (travel tech). Symbols include landscapes, sun, mountains, wings, compasses. Warm, inviting color palettes.';
  }
  if (ind.includes('automotive') || ind.includes('car')) {
    return 'Automotive logos: Bold, metallic feel, often emblem-style with circular or shield shapes. Strong typography. Chrome/silver/black palettes. Suggests speed, precision, power.';
  }

  return `Study top brands in the ${industry} industry. Identify the visual language they use — typography style, color palettes, symbol vocabulary. Create logos that feel native to ${industry} customers.`;
}

/**
 * Style-specific direction (matches the user's selected style button)
 */
function getStyleDirection(style) {
  const s = (style || 'modern').toLowerCase();
  if (s === 'classic')  return 'Classic / Traditional — refined serif typography, balanced symmetry, timeless feel. Think established institutions and heritage brands.';
  if (s === 'playful')  return 'Playful / Fun — rounded forms, cheerful colors, friendly typography, approachable mascots or organic shapes. Think modern D2C and consumer brands.';
  if (s === 'luxury')   return 'Luxury / Premium — restrained elegance, monochromatic or gold accents, refined serif or thin sans, generous negative space. Think high-end fashion/jewelry.';
  if (s === 'bold')     return 'Bold / Strong — heavy typography, high contrast, geometric forms, confident presence. Think sports, energy, and challenger brands.';
  return 'Modern / Minimal — clean geometric sans-serif, simple symbols, restrained color palette, lots of negative space. Think tech, SaaS, and contemporary brands.';
}

/**
 * Generate 5 unique logo concepts via OpenAI GPT-4o.
 *
 * Forces diversity across the 7 logo types — concepts 1-5 are intentionally
 * different TYPES, not 5 variations of the same approach.
 *
 * @param {object} details - { businessName, industry, description, style, brandColors?, symbolIdea? }
 * @returns {Promise<Array>} Array of 5 logo concept objects
 */
async function generateLogoIdeas(details) {
  const { businessName, industry, description, style, brandColors, symbolIdea } = details;

  const industryLogoGuide = getIndustryLogoGuide(industry);
  const styleDirection = getStyleDirection(style);

  const systemPrompt = `You are the Founder & Creative Director of an elite branding agency — think Pentagram, Landor, COLLINS, or Chermayeff & Geismar. You've designed iconic logos for brands like FedEx, Mastercard, NBC, and the Smithsonian.

YOUR PHILOSOPHY:
A great logo is not "art" — it is a precision instrument of brand identity. It must obey the FIVE FUNDAMENTAL PRINCIPLES OF LOGO DESIGN:
1. SIMPLE — Recognizable in one glance. No visual noise.
2. MEMORABLE — Distinctive enough to recall after seeing once.
3. TIMELESS — Will look great in 5 years, 10 years, 20 years. No trends that will date.
4. VERSATILE — Works at favicon size (16×16) AND on a billboard. Works in black, white, color, reversed.
5. APPROPRIATE — Matches the industry tone and target audience. A children's bookstore needs a different logo than a law firm.

THE 7 LOGO TYPES (you must use 5 different types across the 5 concepts — NEVER produce 5 of the same kind):
- WORDMARK: text-only logo treating the brand name as the design (Google, Coca-Cola, eBay, Visa)
- LETTERMARK: monogram of initials (HBO, IBM, NASA, CNN)
- PICTORIAL/SYMBOL: a literal recognizable icon (Apple, Twitter, Target)
- ABSTRACT: a unique non-literal shape representing brand essence (Nike swoosh, Pepsi, BP)
- COMBINATION: text + symbol that work together (Adidas, Lacoste, Doritos)
- EMBLEM: text contained inside a shape, classic seal style (Starbucks, Harley Davidson, BMW)
- MASCOT: an illustrated character representing the brand (KFC, Pringles, Mr. Peanut)

YOUR AUTHORITY:
You decide every visual element — typography style, color palette, symbol concept, layout, and proportions. Each concept's visualConcept is the BRIEF that drives the AI image generator.

Always respond with valid JSON only.`;

  const userPrompt = `Design 5 logo concepts for this brand. Each concept must be a COMPLETELY DIFFERENT logo type and approach.

━━━ BRAND BRIEF ━━━
Business Name: "${businessName}"
Industry: ${industry}
What They Do: ${description}
Style Preference: ${styleDirection}
${brandColors ? `Brand Colors (must incorporate): ${brandColors}` : 'Brand Colors: None provided — YOU design the palette appropriately for the industry. Specify exact hex codes.'}
${symbolIdea ? `User's Symbol Idea: "${symbolIdea}" — MUST incorporate this in at least 2 concepts (the symbol-based ones)` : 'No symbol idea provided — design symbols from scratch based on the brand and industry.'}

━━━ INDUSTRY GUIDANCE ━━━
${industryLogoGuide}

━━━ FORCED CONCEPT DIVERSITY ━━━
You MUST use 5 different logo types across the concepts. Choose appropriate types for this brand, but they MUST be different from each other:

CONCEPT 1 — COMBINATION MARK (text + matching symbol)
The most versatile and safest choice for a new brand. Symbol next to or above the wordmark, both designed to harmonize.

CONCEPT 2 — PURE WORDMARK (text only, no symbol)
Pure typography play. The brand name itself IS the design. Custom letterforms, distinctive style, type-driven personality.

CONCEPT 3 — PICTORIAL SYMBOL (icon + brand name beside)
A clear, recognizable symbol that could stand alone OR be paired with the brand name. The icon should be memorable enough to become the brand's signature mark.

CONCEPT 4 — Choose ONE that fits this brand best:
   • LETTERMARK (if business name has good initials and is long)
   • EMBLEM (if industry feels traditional/heritage — coffee, brewery, automotive, university)
   • MASCOT (if industry is friendly/playful — kids, food, sports, pets)

CONCEPT 5 — ABSTRACT/MODERN MARK
A unique geometric or organic abstract shape — not a literal symbol. Represents the brand's essence through form. Think Nike swoosh, Pepsi globe, BP sunburst.

━━━ FOR EACH CONCEPT, SPECIFY ━━━

1. logoType — exact type from the list above (e.g. "Combination Mark", "Pictorial Symbol")
2. typographyStyle — be specific: weight, classification, mood. E.g. "Geometric sans-serif, all-caps, tight letterspacing, modern minimalist feel" or "Hand-drawn serif, varied line weight, artisanal warmth"
3. colorPalette — 2-3 colors max with hex codes and roles. E.g. "#1a3a2a (primary), #d4a843 (accent)". Logos use FEWER colors than ads — minimalism is key.
4. symbolConcept — describe the symbol in detail. What is it? What shapes? What does it represent? (For pure wordmarks, say "No symbol — pure typography is the design")
5. styleTone — 2-3 words capturing the mood. E.g. "Refined elegance", "Bold confidence", "Organic warmth"
6. visualConcept — a 4-5 sentence brief describing: layout (centered, symbol-above-text, symbol-beside-text), proportions, negative space usage, line weight, finishing details, and how it embodies the brand.

━━━ ABSOLUTE RULES ━━━
- Brand name spelling is EXACTLY: "${businessName}" — never alter, abbreviate, or rearrange
- 5 concepts = 5 different logo types (no duplicates)
- Each concept must obey the 5 logo principles
- NO photorealism, NO 3D renders, NO scenes — these are flat vector logo designs
- Symbols must be SIMPLE — could be drawn in under 30 seconds by a designer
- Color palettes must use 2-3 colors maximum (logos are not paintings)

Respond with JSON:
{
  "ideas": [
    {
      "id": "logo_1",
      "title": "Short Evocative Name (2-4 words)",
      "description": "What this logo communicates and why it works for this brand (1-2 sentences)",
      "logoType": "Combination Mark",
      "typographyStyle": "...",
      "colorPalette": "#hex (role), #hex (role)",
      "symbolConcept": "...",
      "styleTone": "...",
      "visualConcept": "4-5 sentence layout and design brief"
    },
    { "id": "logo_2", "logoType": "Wordmark", ... },
    { "id": "logo_3", "logoType": "Pictorial Symbol", ... },
    { "id": "logo_4", "logoType": "Lettermark | Emblem | Mascot", ... },
    { "id": "logo_5", "logoType": "Abstract Mark", ... }
  ]
}`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.85,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('No response from OpenAI');
  const parsed = JSON.parse(content);
  return parsed.ideas;
}

/**
 * Expand a selected logo concept into a complete Gemini execution brief.
 * Logo briefs are SHORTER and MORE PRECISE than ad briefs — Gemini works
 * better with focused logo prompts.
 *
 * @param {object} idea - { id, title, description, logoType, typographyStyle, colorPalette, symbolConcept, styleTone, visualConcept }
 * @param {object} details - { businessName, industry, description, style, brandColors?, symbolIdea? }
 * @returns {Promise<string>} The expanded execution brief (string)
 */
async function expandLogoToPrompt(idea, details) {
  const { businessName, industry, description } = details;

  const systemPrompt = `You are a master prompt engineer specializing in AI logo generation. You translate a brand designer's concept into the PERFECT execution brief for Google Gemini.

YOUR UNDERSTANDING:
- Logo prompts must be CONCISE and FOCUSED — overly long prompts confuse Gemini
- Describe the logo as if instructing a vector designer working in Adobe Illustrator
- Specify: layout, proportions, line weight, typography weight/style, exact colors, negative space, symbol details
- NEVER ask for: photography, 3D, photorealism, scenes, environments, lighting (these are LOGO instructions, not photo instructions)
- The logo must be simple enough to recognize at 64×64 pixels

OUTPUT TARGET:
A flat vector-style logo, centered on a clean background, with generous whitespace. Single brand mark only — no variants, no taglines unless requested.

Always respond with valid JSON.`;

  const userPrompt = `Transform this logo concept into a production-ready Gemini execution brief.

━━━ BRAND ━━━
Brand Name: "${businessName}"
Industry: ${industry}
What They Do: ${description}

━━━ APPROVED LOGO CONCEPT ━━━
Title: "${idea.title}"
Logo Type: ${idea.logoType}
Symbol: ${idea.symbolConcept}
Typography: ${idea.typographyStyle}
Color Palette: ${idea.colorPalette}
Style Tone: ${idea.styleTone}
Visual Concept: ${idea.visualConcept}

━━━ YOUR TASK ━━━
Write a CONCISE execution brief in MAX 130 WORDS — be dense and specific, no filler.

The brief MUST cover in this order:
1. **Logo type**: state clearly (e.g. "A combination mark logo")
2. **Layout**: where the symbol is relative to the text (above, beside, integrated, none)
3. **Symbol details**: exact shape, line weight, finishing (only if the logo has a symbol)
4. **Typography**: brand name "${businessName}" — exact font weight, classification (sans/serif/script), case (all-caps/title), letterspacing
5. **Color application**: which color goes on the symbol vs the text vs the background
6. **Negative space**: generous padding around the mark, centered composition
7. **Style markers**: flat vector design, clean lines, no gradients (unless specified), no photorealism, no 3D, scalable to favicon size

━━━ ABSOLUTE RULES ━━━
- Brand name spelled EXACTLY as: "${businessName}"
- The brand name appears EXACTLY ONCE in the logo
- NO photorealism, NO 3D rendering, NO photography elements
- NO scenes, environments, lighting setups, or props
- NO additional text (no taglines, no descriptions, no website URLs)
- The logo must be a SINGLE centered design, not multiple variants in one image

Respond:
{
  "prompt": "Your concise 130-word max execution brief..."
}`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('No response from OpenAI');
  const parsed = JSON.parse(content);
  return parsed.prompt;
}

module.exports = { generateLogoIdeas, expandLogoToPrompt };
