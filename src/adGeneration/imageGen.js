/**
 * Ad Image Generation Service
 * Ported from Design-Automation-V2/src/lib/gemini.ts
 *
 * Uses Google Gemini (gemini-3-pro-image-preview) to generate
 * professional marketing ad images from expanded prompts.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logger } = require('../utils/logger');

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Smart CTA text based on industry + product type
 */
function getSmartCTA(productType, industry) {
  const ind = (industry || '').toLowerCase();

  if (productType === 'service') {
    if (ind.includes('restaurant') || ind.includes('food') || ind.includes('cafe') || ind.includes('bakery')) return 'Order Now';
    if (ind.includes('salon') || ind.includes('beauty') || ind.includes('spa')) return 'Book Now';
    if (ind.includes('fitness') || ind.includes('gym')) return 'Start Training';
    if (ind.includes('education') || ind.includes('course') || ind.includes('training')) return 'Enroll Now';
    if (ind.includes('health') || ind.includes('medical') || ind.includes('dental')) return 'Book Appointment';
    if (ind.includes('real estate') || ind.includes('property')) return 'Schedule a Visit';
    if (ind.includes('travel') || ind.includes('hotel')) return 'Book Now';
    if (ind.includes('legal') || ind.includes('law')) return 'Free Consultation';
    return 'Get Started';
  }

  if (productType === 'digital') {
    if (ind.includes('saas') || ind.includes('software')) return 'Try Free';
    if (ind.includes('app')) return 'Download Now';
    if (ind.includes('game') || ind.includes('gaming')) return 'Play Now';
    if (ind.includes('course') || ind.includes('education')) return 'Start Learning';
    return 'Get Started';
  }

  // Physical products
  if (ind.includes('food') || ind.includes('restaurant') || ind.includes('beverage')) return 'Order Now';
  if (ind.includes('fashion') || ind.includes('clothing') || ind.includes('apparel')) return 'Shop Now';
  if (ind.includes('electronics') || ind.includes('tech') || ind.includes('gadget')) return 'Buy Now';
  if (ind.includes('jewelry') || ind.includes('luxury')) return 'Explore Collection';
  if (ind.includes('beauty') || ind.includes('cosmetic') || ind.includes('skincare')) return 'Shop Now';
  if (ind.includes('automotive') || ind.includes('car')) return 'Book Test Drive';
  if (ind.includes('furniture') || ind.includes('home') || ind.includes('decor')) return 'Shop Collection';
  return 'Shop Now';
}

/**
 * Industry-appropriate mood and scene guidance for Gemini
 */
function getIndustryMoodGuide(industry, productType) {
  const ind = (industry || '').toLowerCase();

  if (ind.includes('food') || ind.includes('restaurant') || ind.includes('bakery') || ind.includes('beverage') || ind.includes('cafe')) {
    return 'Think: appetite appeal — warm golden lighting, rich textures, product looking absolutely delicious and irresistible. Evoke the sensory experience of taste and aroma.';
  }
  if (ind.includes('fashion') || ind.includes('clothing') || ind.includes('apparel') || ind.includes('streetwear')) {
    return 'Think: editorial fashion photography — bold poses, dramatic lighting, runway/street style aesthetic. The clothing should look aspirational and trendsetting.';
  }
  if (ind.includes('tech') || ind.includes('software') || ind.includes('saas') || ind.includes('app') || ind.includes('electronic')) {
    return 'Think: sleek, minimal, modern — clean surfaces, subtle tech textures, ambient screen glow. Apple/Google-level product presentation. Innovation and simplicity.';
  }
  if (ind.includes('fitness') || ind.includes('gym') || ind.includes('sport') || ind.includes('athletic')) {
    return 'Think: energy, power, determination — dynamic lighting, motion blur, sweat and intensity. Nike/Under Armour campaign energy. Make viewers feel motivated.';
  }
  if (ind.includes('beauty') || ind.includes('cosmetic') || ind.includes('skincare') || ind.includes('salon') || ind.includes('spa')) {
    return 'Think: luxury beauty — soft, ethereal lighting, pristine surfaces, dewy/radiant textures. Glossier/Chanel ad quality. Elegance and self-care.';
  }
  if (ind.includes('real estate') || ind.includes('property') || ind.includes('construction')) {
    return "Think: architectural photography — dramatic angles, golden hour exterior lighting, spacious interiors. Luxury living aspiration. Sotheby's level presentation.";
  }
  if (ind.includes('jewelry') || ind.includes('luxury') || ind.includes('watch')) {
    return 'Think: ultra-luxury — macro detail, sparkle and reflection, velvet/silk textures, dramatic dark backgrounds. Cartier/Rolex ad quality.';
  }
  if (ind.includes('health') || ind.includes('medical') || ind.includes('dental') || ind.includes('wellness')) {
    return 'Think: trust and care — clean, clinical yet warm lighting, professional but comforting. Convey expertise and compassion.';
  }
  if (ind.includes('travel') || ind.includes('hotel') || ind.includes('hospitality')) {
    return 'Think: wanderlust — breathtaking destinations, golden hour, dreamy atmospherics. The viewer should want to book immediately.';
  }
  if (ind.includes('education') || ind.includes('course') || ind.includes('learning')) {
    return 'Think: empowerment and growth — bright, optimistic lighting, knowledge and achievement imagery. Aspirational but approachable.';
  }
  if (ind.includes('finance') || ind.includes('bank') || ind.includes('insurance') || ind.includes('invest')) {
    return 'Think: trust, stability, prosperity — sophisticated, corporate-premium, deep rich colors. Convey financial confidence and growth.';
  }
  if (ind.includes('automotive') || ind.includes('car')) {
    return 'Think: premium automotive — dramatic studio lighting, reflective surfaces, speed and luxury. BMW/Mercedes campaign quality. Power and precision.';
  }

  return `Think: premium ${industry} brand campaign — study what the BEST brands in ${industry} do and create something equally compelling. Dramatic lighting, professional composition, aspirational mood.`;
}

/**
 * Extract base64 data and mimeType from a data URL string
 * Returns null if invalid
 */
function extractFromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  return { mimeType: matches[1], data: matches[2] };
}

/**
 * Generate a marketing ad image using Google Gemini
 *
 * @param {object} expandedPrompt - { ideaTitle: string, prompt: string }
 * @param {string} brandName
 * @param {object} options - { slogan?, pricing?, productType, industry, niche?, imageBase64?, aspectRatio? }
 * @returns {Promise<{imageData: string, mimeType: string}>} Raw base64 image data (no data: prefix)
 */
async function generateAdImage(expandedPrompt, brandName, options = {}) {
  const {
    slogan,
    pricing,
    productType = 'physical',
    industry = 'general',
    niche,
    imageBase64,      // full data URL: "data:image/jpeg;base64,..."
    aspectRatio = '1:1',
  } = options;

  const dimMap = {
    '1:1': [1024, 1024],
    '4:5': [1024, 1280],
    '9:16': [1024, 1820],
    '16:9': [1820, 1024],
  };
  const [width, height] = dimMap[aspectRatio] || [1024, 1024];

  const smartCTA = getSmartCTA(productType, industry);
  const industryMoodGuide = getIndustryMoodGuide(industry, productType);
  const styleContext = (expandedPrompt.prompt || '').trim();
  const nicheLabel = niche || brandName;
  const colorDirective = `NO BRAND COLORS PROVIDED: You have FULL creative freedom. Choose a color palette that feels authentic, premium, and appropriate for the ${industry} industry. Study what top ${industry} brands use.`;

  // Build parts array — images FIRST, then text (Gemini requires this order)
  const parts = [];

  if (imageBase64) {
    const extracted = extractFromDataUrl(imageBase64);
    if (extracted) {
      parts.push({ inlineData: { mimeType: extracted.mimeType, data: extracted.data } });
      logger.debug(`[AD-GEN] Added user image (${extracted.mimeType}, ${Math.round(extracted.data.length / 1024)}KB)`);
    }
  }

  const hasImage = parts.length > 0;

  // ── Build the creative brief text prompt ────────────────────────────────────
  let textPrompt;

  if (hasImage) {
    textPrompt = `You are a world-class advertising creative director with 20+ years experience at top agencies. Your typography, composition, and visual storytelling are legendary.

=== YOUR CREATIVE BRIEF ===

INDUSTRY: ${industry}
PRODUCT/SERVICE: ${nicheLabel}
PRODUCT TYPE: ${productType}

UPLOADED IMAGE (use as the HERO element):
- Preserve its exact appearance, colors, and design perfectly
- Enhance with premium studio lighting and realistic shadows appropriate to ${industry}
- Position as the dominant focal point of the composition

${colorDirective}

BACKGROUND & SCENE:
- Create a scene authentic to the ${industry} industry
- ${industryMoodGuide}
- Dramatic lighting, depth, and cinematic quality

Campaign Theme: ${expandedPrompt.ideaTitle}
${styleContext ? `\n=== CREATIVE DIRECTION FROM ART DIRECTOR ===\n${styleContext}\n` : ''}
=== TYPOGRAPHY (Use Your Expert Judgment) ===

BRAND NAME: "${brandName}"
- Make it commanding and memorable
- Choose typography native to ${industry}
- Position prominently${slogan ? `\n\nHEADLINE: "${slogan}"\n- Perfect contrast with your scene\n- Bold, readable at any size` : ''}${pricing ? `\n\nPRICE: "${pricing}"\n- Design a price element native to this ad — badge, ribbon, tag, or elegant callout\n- Noticeable but elegant` : ''}

CTA: "${smartCTA}"
- Natural next step for a ${industry} customer
- Premium feel, prominent bottom placement

=== PRINCIPLES ===
- Visual hierarchy: Hero Image → Brand → Headline → Price → CTA
- Every element readable at thumbnail size
- Industry-authentic: looks like a top ${industry} brand created this

CRITICAL: Each text element appears EXACTLY ONCE. No duplicates.
⚠️ Brand name is EXACTLY: "${brandName}" — spell as shown, appears ONCE only.

CREATE: A scroll-stopping ${industry} advertisement worthy of awards.`;
  } else {
    textPrompt = `You are a world-class advertising creative director with 20+ years experience at top agencies. Create a complete advertisement from SCRATCH — your visual creativity must shine.

=== BRAND CONTEXT ===
Brand: ${brandName}
Industry: ${industry}
Product/Service: ${nicheLabel}
Product Type: ${productType}
Campaign Theme: ${expandedPrompt.ideaTitle}
${styleContext ? `\n=== CREATIVE DIRECTION FROM ART DIRECTOR ===\n${styleContext}\n` : ''}
${colorDirective}

=== VISUAL CREATION ===
Create a stunning visual representing this ${industry} brand. ${industryMoodGuide}

The visual must make ${brandName} feel like a PREMIUM ${industry} brand.
NOT generic stock photo — this must feel CUSTOM and PREMIUM.
Create a scene so visually striking people stop scrolling immediately.

=== TYPOGRAPHY (Your Expert Judgment) ===

BRAND NAME: "${brandName}"
- Make it ICONIC — typography fitting for a top ${industry} brand
- Position prominently${slogan ? `\n\nTAGLINE: "${slogan}"\n- Complements the brand name, native to ${industry}\n- Perfect contrast with your scene` : ''}${pricing ? `\n\nPRICE/OFFER: "${pricing}"\n- Design that feels PREMIUM, not cheap\n- Badge, ribbon, or elegant callout` : ''}

CTA: "${smartCTA}"
- Premium feel matching the overall ad aesthetic
- Prominent bottom placement

=== PRINCIPLES ===
- Scene → Brand Name → Tagline → Price → CTA
- Every element readable at thumbnail size
- Looks like a premium ${industry} advertising campaign

CRITICAL: Each text element appears EXACTLY ONCE.
⚠️ Brand name is EXACTLY: "${brandName}" — spell as shown, appears ONCE only.

CREATE: An advertisement so visually striking it would trend on social media.`;
  }

  // Aspect ratio enforcement
  const ratioLabels = {
    '1:1': 'a PERFECT SQUARE image — equal width and height. NOT wide, NOT tall.',
    '4:5': 'a PORTRAIT (vertical) image — taller than wide.',
    '9:16': 'a TALL VERTICAL image — much taller than wide, like a phone screen.',
    '16:9': 'a WIDE LANDSCAPE image — much wider than tall.',
  };
  textPrompt += `\n\n⚠️ IMAGE DIMENSIONS — MANDATORY:\n- Generate at EXACTLY ${width}×${height} pixels (${aspectRatio} ratio)\n- This MUST be ${ratioLabels[aspectRatio] || 'a square image'}`;

  parts.push({ text: textPrompt });

  logger.info(`[AD-GEN] Generating image | brand: "${brandName}" | industry: ${industry} | hasImage: ${hasImage} | aspectRatio: ${aspectRatio}`);

  const model = getGenAI().getGenerativeModel({
    model: 'gemini-3-pro-image-preview',
    generationConfig: { temperature: 0.7 },
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['image', 'text'],
    },
  });

  const responseParts = result.response.candidates?.[0]?.content?.parts;
  if (!responseParts) throw new Error('Gemini returned empty response — no image generated');

  const imagePart = responseParts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart) {
    const partKeys = responseParts.map((p) => Object.keys(p)).join(', ');
    throw new Error(`Gemini returned no image part. Parts received: [${partKeys}]`);
  }

  logger.info(`[AD-GEN] Image generated successfully for "${brandName}"`);

  return {
    imageData: imagePart.inlineData.data,   // raw base64, no data: prefix
    mimeType: imagePart.inlineData.mimeType, // e.g. "image/png"
  };
}

module.exports = { generateAdImage };
