/**
 * Ad Image Generation Service
 *
 * Ports the proven Design-Automation-V2 Gemini prompts (gemini.ts) to CommonJS.
 * Modifications from the original:
 *   - Adds a 3D-render path when expandedPrompt.is3D is true (commercial CGI mode)
 *   - Single-image generation (the WhatsApp flow generates one ad at a time)
 *   - Uses Supabase Storage upload via imageUploader (not in this file)
 *
 * Uses Nano Banana Pro (gemini-3-pro-image-preview) — Google's best model for
 * accurate text rendering, high-fidelity visuals, and following intricate instructions.
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
 * Get image dimensions for an aspect ratio
 */
function getImageDimensions(aspectRatio) {
  switch (aspectRatio) {
    case '1:1':  return { width: 1024, height: 1024 };
    case '4:5':  return { width: 1024, height: 1280 };
    case '9:16': return { width: 1024, height: 1820 };
    case '16:9': return { width: 1820, height: 1024 };
    default:     return { width: 1024, height: 1024 };
  }
}

/**
 * Extract base64 + mimeType from a data URL string
 */
function extractBase64FromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  return { mimeType: matches[1], data: matches[2] };
}

/**
 * Get a smart CTA text based on industry and product type.
 * Tailored to the business context — never the literal word "CTA".
 */
function getSmartCTA(productType, industry) {
  const ind = (industry || '').toLowerCase();

  if (productType === 'service') {
    if (ind.includes('restaurant') || ind.includes('food')) return 'Order Now';
    if (ind.includes('fitness') || ind.includes('gym')) return 'Start Training';
    if (ind.includes('salon') || ind.includes('beauty') || ind.includes('spa')) return 'Book Now';
    if (ind.includes('education') || ind.includes('course') || ind.includes('training')) return 'Enroll Now';
    if (ind.includes('consult') || ind.includes('agency')) return 'Get Started';
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
  if (ind.includes('automotive') || ind.includes('car')) return 'Book Test Drive';
  if (ind.includes('furniture') || ind.includes('home') || ind.includes('decor')) return 'Shop Collection';
  if (ind.includes('jewelry') || ind.includes('luxury')) return 'Explore Collection';
  if (ind.includes('sport') || ind.includes('fitness')) return 'Shop Now';
  if (ind.includes('pet')) return 'Shop Now';
  if (ind.includes('beauty') || ind.includes('cosmetic') || ind.includes('skincare')) return 'Shop Now';

  return 'Shop Now';
}

/**
 * Get industry-appropriate mood and scene guidance.
 * Gives Gemini direction without being overly prescriptive.
 */
function getIndustryMoodGuide(industry, productType) {
  const ind = (industry || '').toLowerCase();

  if (ind.includes('food') || ind.includes('restaurant') || ind.includes('bakery') || ind.includes('beverage') || ind.includes('cafe')) {
    return 'Think: appetite appeal — warm golden lighting, rich textures, the product looking absolutely delicious and irresistible. Evoke the sensory experience of taste and aroma.';
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
  if (ind.includes('automotive') || ind.includes('car') || ind.includes('vehicle')) {
    return 'Think: premium automotive — dramatic studio lighting, reflective surfaces, speed and luxury. BMW/Mercedes campaign quality. Power and precision.';
  }
  if (ind.includes('jewelry') || ind.includes('luxury') || ind.includes('watch')) {
    return 'Think: ultra-luxury — macro detail, sparkle and reflection, velvet/silk textures, dramatic dark backgrounds. Cartier/Rolex ad quality.';
  }
  if (ind.includes('education') || ind.includes('course') || ind.includes('learning') || ind.includes('school')) {
    return 'Think: empowerment and growth — bright, optimistic lighting, knowledge and achievement imagery. Aspirational but approachable.';
  }
  if (ind.includes('health') || ind.includes('medical') || ind.includes('pharma') || ind.includes('dental') || ind.includes('wellness')) {
    return 'Think: trust and care — clean, clinical yet warm lighting, professional but comforting. Convey expertise and compassion.';
  }
  if (ind.includes('travel') || ind.includes('hotel') || ind.includes('tourism') || ind.includes('hospitality')) {
    return 'Think: wanderlust — breathtaking destinations, golden hour, dreamy atmospherics. The viewer should want to book immediately.';
  }
  if (ind.includes('finance') || ind.includes('bank') || ind.includes('insurance') || ind.includes('invest')) {
    return 'Think: trust, stability, prosperity — sophisticated, corporate-premium, deep rich colors. Convey financial confidence and growth.';
  }
  if (ind.includes('pet') || ind.includes('animal')) {
    return 'Think: warmth and joy — adorable, heartwarming, the bond between pets and owners. Bright, happy, lifestyle photography feel.';
  }
  if (ind.includes('gaming') || ind.includes('esport')) {
    return 'Think: epic and immersive — neon accents, dramatic dark environments, high-energy. The excitement of gaming culture.';
  }
  if (ind.includes('music') || ind.includes('entertainment') || ind.includes('event')) {
    return 'Think: vibrant energy — stage lighting, dynamic colors, the thrill of live experiences. Electric atmosphere.';
  }
  if (ind.includes('furniture') || ind.includes('home') || ind.includes('interior') || ind.includes('decor')) {
    return 'Think: lifestyle aspiration — beautifully styled rooms, natural lighting, warm and inviting spaces. Pottery Barn/West Elm aesthetic.';
  }

  return `Think: premium ${industry} brand campaign — study what the BEST brands in ${industry} do for their advertising and create something at that level. Dramatic lighting, professional composition, aspirational mood.`;
}

/**
 * Generate a single marketing ad image using Gemini.
 *
 * @param {object} expandedPrompt - { ideaTitle: string, prompt: string, is3D?: boolean }
 * @param {string} brandName - Exact brand name to enforce
 * @param {object} options - { slogan?, pricing?, productType, industry, niche?, brandColors?, imageBase64?, aspectRatio? }
 * @returns {Promise<{imageData: string, mimeType: string}>}
 */
async function generateAdImage(expandedPrompt, brandName, options = {}) {
  const {
    slogan,
    pricing,
    productType = 'physical',
    industry = 'general',
    niche,
    brandColors,
    imageBase64,
    aspectRatio = '1:1',
  } = options;

  const { width, height } = getImageDimensions(aspectRatio);

  const is3D = expandedPrompt.is3D || false;
  const styleContext = (expandedPrompt.prompt || '').trim();
  const ideaTitle = expandedPrompt.ideaTitle || '';

  // Industry context for smart prompting
  const industryLabel = industry || 'general';
  const nicheLabel = niche || brandName;

  // Smart CTA text based on industry + product type (NEVER the literal word "CTA")
  const smartCTA = getSmartCTA(productType, industryLabel);

  // Industry-aware mood guide
  const industryMoodGuide = getIndustryMoodGuide(industryLabel, productType);

  // Color directive — only use custom colors if provided
  const colorDirective = brandColors
    ? `BRAND COLORS PROVIDED: Use these as the dominant palette: ${brandColors}. Ensure contrast and readability while incorporating them into backgrounds, typography, and accents.`
    : `NO BRAND COLORS PROVIDED: You have FULL creative freedom. Analyze the ${industryLabel} industry aesthetic and choose a color palette that feels authentic, premium, and appropriate. Study what top brands in ${industryLabel} use and create something equally compelling.`;

  // 3D-specific override section that gets injected into all branches when is3D is true
  const threeDOverride = is3D
    ? `

✦ === 3D COMMERCIAL RENDER MODE === ✦
This ad must be rendered as a PHOTOREALISTIC 3D CGI scene — NOT photography.
- Use ray-traced lighting, physically-based rendering (PBR materials), subsurface scattering on organic surfaces
- Cinematic depth of field, premium render quality (8K detail, sharp materials)
- Think: Apple iPhone launch keyframe, Tesla product reveal, luxury watch brand commercial CGI
- The product/brand must be cleanly hero-rendered as the dominant focal point
- This is COMMERCIAL CGI for a brand launch — NOT surreal art, NOT abstract, NOT fantasy
- Materials must look real (glass refraction, metal reflection, organic translucency) — not flat/cartoon`
    : '';

  // Build parts array — uploaded images FIRST (Gemini requirement)
  const parts = [];
  let hasProductImage = false;

  if (imageBase64) {
    const extracted = extractBase64FromDataUrl(imageBase64);
    if (extracted) {
      parts.push({ inlineData: { mimeType: extracted.mimeType, data: extracted.data } });
      hasProductImage = true;
      logger.debug(`[AD-GEN] Added product image (${extracted.mimeType}, ${Math.round(extracted.data.length / 1024)}KB)`);
    }
  }

  // Build the prompt — branches based on whether a product image was uploaded
  let textPrompt;

  if (hasProductImage) {
    // Branch 1: User uploaded a product image
    textPrompt = `You are a world-class advertising creative director with 20+ years experience at top agencies. You've created iconic campaigns across every industry. Your typography, composition, and visual storytelling are legendary.

=== YOUR CREATIVE BRIEF ===

INDUSTRY: ${industryLabel}
PRODUCT/SERVICE: ${nicheLabel}
PRODUCT TYPE: ${productType}

PRODUCT (uploaded image):
- This is the HERO product — preserve its exact appearance, colors, packaging, and design perfectly
- Enhance with premium ${is3D ? '3D studio lighting (ray-traced reflections, soft shadows)' : 'studio lighting and realistic shadows'} appropriate to this product category
- Position as the dominant focal point

${colorDirective}

BACKGROUND & SCENE:
- Study the product and create a scene that feels AUTHENTIC to the ${industryLabel} industry
- ${industryMoodGuide}
- The scene should feel like a premium ${industryLabel} brand campaign
- Dramatic lighting, depth, and cinematic quality
- The background MUST fill the entire frame — never plain white unless brief explicitly requests it

BRAND NAME: "${brandName}"
- Include the brand name prominently in the ad
- Choose a placement and style that feels natural for ${industryLabel} advertising

Campaign Theme: ${ideaTitle}
${styleContext ? `\n=== CREATIVE DIRECTION FROM ART DIRECTOR ===\n${styleContext}` : ''}
${threeDOverride}

=== TYPOGRAPHY DIRECTION (Use Your Expert Judgment) ===

You have FULL CREATIVE FREEDOM for typography:

${slogan ? `HEADLINE: "${slogan}"
- Typography that feels NATIVE to ${industryLabel}
- Analyze scene colors → pick PERFECT CONTRAST
- Bold, commanding, readable at any size` : ''}

${pricing ? `PRICE ELEMENT: "${pricing}"
- Design a price presentation NATIVE to this ad's aesthetic and ${industryLabel} norms
- Shape, colors, position — all your creative call
- Must be noticeable but elegant` : ''}

CTA BUTTON: The button text MUST be exactly the words "${smartCTA}" — write these exact words inside the button. Do NOT write "CTA", do NOT write a placeholder, do NOT write any other phrase.
- Design the button with a premium feel that matches the ad aesthetic
- Natural next step for a ${industryLabel} customer
- Prominent placement, sized for impact

=== YOUR EXPERTISE PRINCIPLES ===
- Visual hierarchy: Product → Brand → Headline → Price → CTA
- Color theory for readability, breathing room for text
- Every element readable at thumbnail size
- This should look like an ad FROM a top ${industryLabel} brand

AVOID: Duplicating elements, clutter, text lost in busy areas, plain white backgrounds.

⚠️ TEXT ACCURACY — READ CAREFULLY:
- The brand name is EXACTLY: "${brandName}" — spell each word exactly as shown, do NOT repeat, skip, rearrange, or add any words
- The CTA button text is EXACTLY: "${smartCTA}" — these exact words inside the button, never "CTA"
- Each text string (brand name${slogan ? ', slogan' : ''}${pricing ? ', price' : ''}, CTA) must appear EXACTLY ONCE in the image
- Do NOT add product specifications (weight, volume, dimensions, calories) unless they were in the uploaded product image OR explicitly stated in the brief above

CREATE: A scroll-stopping ${industryLabel} advertisement worthy of industry awards.`;
  } else {
    // Branch 2: No product image — pure text-to-image
    textPrompt = `You are a world-class advertising creative director with 20+ years experience at top agencies. You've created iconic campaigns across every industry — fashion, food, tech, fitness, real estate, automotive, beauty, finance, and more.

THIS IS YOUR MOST CHALLENGING BRIEF: Create a complete advertisement from SCRATCH — no product photos provided. Your visual creativity must shine.

=== BRAND CONTEXT ===
Brand: ${brandName}
Industry: ${industryLabel}
Product/Service: ${nicheLabel}
Product Type: ${productType}
Campaign Theme: ${ideaTitle}
${styleContext ? `\n=== CREATIVE DIRECTION FROM ART DIRECTOR ===\n${styleContext}` : ''}
${threeDOverride}

${colorDirective}

=== VISUAL CREATION ===

You must CREATE a stunning visual that represents this ${industryLabel} brand. Study what the TOP brands in ${industryLabel} do and create something equally compelling.

YOUR CREATIVE APPROACH (choose the best for this ${industryLabel} ${productType}):

OPTION A — PRODUCT/BRAND VISUALIZATION:
- Imagine and CREATE what this ${nicheLabel} product/service looks like
- Place it in a premium, industry-authentic environment
- ${industryMoodGuide}
- Make the viewer DESIRE this product/service

OPTION B — LIFESTYLE & ASPIRATION:
- Show the LIFESTYLE or OUTCOME this ${nicheLabel} enables
- Create a scene showing what life looks like WITH this brand
- Aspirational but believable — the viewer should say "I want that"
- Use environments authentic to ${industryLabel}

OPTION C — ABSTRACT PREMIUM:
- Create a visually stunning abstract/artistic representation
- Rich textures, dramatic lighting, premium materials relevant to ${industryLabel}
- The environment itself should FEEL like the brand's values
- Sophisticated, high-end, scroll-stopping

Choose whichever approach creates the most STUNNING, SCROLL-STOPPING visual for a ${industryLabel} brand.

=== CRITICAL VISUAL REQUIREMENTS ===
- This ad must be SCROLL-STOPPING on social media
- Create a scene so visually striking people pause immediately
- The visual should feel AUTHENTIC to the ${industryLabel} industry — NOT generic
- NOT a stock photo look — this must feel CUSTOM and PREMIUM
- The visual should make ${brandName} feel like a billion-dollar ${industryLabel} company
- Background MUST fill the entire frame with the described scene — NEVER plain white unless intentional

=== TYPOGRAPHY (Your Expert Judgment) ===

BRAND NAME: "${brandName}"
- This is the STAR — make it ICONIC and memorable
- Choose typography that would work as a premium ${industryLabel} brand identity
- Position prominently
- Must feel like a brand people would TRUST

${slogan ? `TAGLINE: "${slogan}"
- Supporting text that reinforces the brand promise
- Style that COMPLEMENTS the brand name and feels native to ${industryLabel}
- Perfect contrast with your scene` : ''}

${pricing ? `PRICE/OFFER: "${pricing}"
- Design a price presentation that feels PREMIUM, not cheap
- Badge, ribbon, or elegant callout based on what fits YOUR scene and ${industryLabel} norms
- Noticeable but not overwhelming` : ''}

CTA BUTTON: The button text MUST be exactly the words "${smartCTA}" — write these exact words inside the button. Do NOT write "CTA", do NOT write a placeholder, do NOT write any other phrase.
- Design the button with a premium feel matching the overall ad aesthetic
- Prominent but not garish

=== YOUR CREATIVE PRINCIPLES ===
- Visual hierarchy: Scene → Brand Name → Tagline → Price → CTA
- The SCENE is as important as the text — make it STUNNING
- Color harmony between visual and typography
- Every element readable at thumbnail size
- This should look like a premium ${industryLabel} advertising campaign, not a template

CRITICAL: Each text element appears EXACTLY ONCE. No duplicates.

⚠️ TEXT ACCURACY — READ CAREFULLY:
- The brand name is EXACTLY: "${brandName}" — spell each word exactly as shown, do NOT repeat, skip, rearrange, or add any words
- The CTA button text is EXACTLY: "${smartCTA}" — these exact words inside the button, never "CTA"
- Each text string (brand name${slogan ? ', slogan' : ''}${pricing ? ', price' : ''}, CTA) must appear EXACTLY ONCE in the image
- Do NOT add product specifications (weight, volume, dimensions, calories, ingredients) unless explicitly stated in the brief above

CREATE: An advertisement so visually striking it would trend on social media and make ${brandName} look like the #1 brand in ${industryLabel}.`;
  }

  // Aspect ratio enforcement
  const ratioLabel =
    aspectRatio === '1:1' ? 'This MUST be a PERFECT SQUARE image — equal width and height. NOT wide, NOT tall.' :
    aspectRatio === '4:5' ? 'This MUST be a PORTRAIT (vertical) image — taller than wide.' :
    aspectRatio === '9:16' ? 'This MUST be a TALL VERTICAL image — much taller than wide, like a phone screen.' :
    'This MUST be a WIDE LANDSCAPE image — much wider than tall.';

  textPrompt += `\n\n⚠️ IMAGE DIMENSIONS — MANDATORY:
- Generate this image at EXACTLY ${width}x${height} pixels (${aspectRatio} aspect ratio)
- ${ratioLabel}
- DO NOT generate a wide/landscape image if the ratio is 1:1 or vertical`;

  parts.push({ text: textPrompt });

  logger.info(`[AD-GEN] Generating image | brand: "${brandName}" | industry: ${industryLabel} | type: ${productType} | is3D: ${is3D} | hasImage: ${hasProductImage} | ratio: ${aspectRatio} | CTA: "${smartCTA}"`);

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
    imageData: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

module.exports = { generateAdImage };
