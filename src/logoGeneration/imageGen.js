/**
 * Logo Image Generation Service
 *
 * Logo generation is FUNDAMENTALLY different from ad generation:
 *   - Flat vector style — NEVER photorealistic, NEVER 3D
 *   - Single centered mark, no scenes or environments
 *   - Brand name + optional symbol — no extra text, no taglines, no CTAs
 *   - Solid background (transparent / white / black / colored)
 *   - Always 1:1 square format (1024×1024)
 *   - Generous negative space — must be readable at favicon size
 *
 * Uses Gemini Nano Banana Pro (gemini-3-pro-image-preview) — Google's best
 * model for accurate text rendering inside logos.
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
 * Map background option to specific Gemini instruction
 */
function getBackgroundInstruction(background) {
  const bg = (background || 'white').toLowerCase();
  if (bg === 'transparent') {
    return 'Pure transparent background — the logo floats on absolute transparency. No background fill, no shadows, no halo. Output as PNG with alpha channel.';
  }
  if (bg === 'black') {
    return 'Solid pure black background (#000000). The logo is rendered in colors that contrast cleanly against black.';
  }
  if (bg === 'colored') {
    return 'A single solid brand-color background (use one of the colors from the palette as the background). Logo elements rendered in contrasting colors that pop against it.';
  }
  // default = white
  return 'Solid pure white background (#FFFFFF). Clean studio whitespace surrounding the logo. No textures, no gradients, no off-white tones.';
}

/**
 * Generate a single logo image using Gemini.
 *
 * @param {object} expandedPrompt - { title: string, prompt: string }
 * @param {string} brandName - Exact brand name to enforce
 * @param {object} options - { industry, description, style, brandColors?, background?, logoType? }
 * @returns {Promise<{imageData: string, mimeType: string}>}
 */
async function generateLogoImage(expandedPrompt, brandName, options = {}) {
  const {
    industry = 'general',
    description = '',
    style = 'modern',
    brandColors,
    background = 'white',
    logoType = 'Combination Mark',
  } = options;

  const designerBrief = (expandedPrompt.prompt || '').trim();
  const conceptTitle = expandedPrompt.title || '';

  const backgroundInstruction = getBackgroundInstruction(background);

  const colorDirective = brandColors
    ? `BRAND COLORS PROVIDED: Use these as the dominant palette: ${brandColors}. Stay strictly within this palette — no extra colors.`
    : `NO BRAND COLORS PROVIDED: Use the colors specified in the designer brief above. Maximum 2-3 colors total — logos use restraint, not paintings.`;

  const textPrompt = `You are an elite logo designer at a top branding agency (think Pentagram, Landor, COLLINS). You design ICONIC brand logos that work at every scale — from favicon (16×16) to billboard.

You are NOT making an advertisement. You are NOT making a poster. You are NOT making a photo or 3D render. You are designing a LOGO — a single, flat, vector-style brand mark.

═══ BRAND ═══
Brand Name: "${brandName}"
Industry: ${industry}
What They Do: ${description}
Style Direction: ${style}
Logo Type: ${logoType}
Concept: ${conceptTitle}

═══ DESIGNER'S EXECUTION BRIEF ═══
${designerBrief}

═══ COLORS ═══
${colorDirective}

═══ BACKGROUND ═══
${backgroundInstruction}

═══ NON-NEGOTIABLE LOGO CONSTRAINTS ═══
✓ FLAT VECTOR STYLE — clean lines, solid color fills, geometric or organic shapes
✓ Single centered logo mark — composition is centered, not off-axis
✓ Generous negative space — at least 25% padding around the mark on all sides
✓ Brand name appears EXACTLY as: "${brandName}" — perfect spelling, perfect spacing
✓ Brand name appears EXACTLY ONCE in the entire image
✓ Readable and recognizable at 64×64 pixel favicon size — no tiny details that disappear
✓ Maximum 2-3 colors total (logos use restraint)

═══ DO NOT GENERATE ═══
✗ NO photorealism — this is NOT a photograph
✗ NO 3D rendering — this is NOT a CGI scene
✗ NO scenes, environments, props, or backgrounds beyond the specified solid color
✗ NO lighting effects, shadows, reflections, glows, or atmospheric elements
✗ NO multiple logo variants in one image — single centered mark only
✗ NO extra text — no taglines, no slogans, no website URLs, no descriptions
✗ NO duplicate brand name — appears ONCE only
✗ NO mockups (don't put the logo on a business card, t-shirt, or storefront — just the raw logo)
✗ NO watermarks, stock site overlays, or designer credits
✗ NO gradients unless the brief explicitly specifies them
✗ NO Latin filler text, lorem ipsum, or sample words

═══ IMAGE FORMAT ═══
Generate at EXACTLY 1024×1024 pixels — a perfect square. The logo itself occupies the center 60-75% of the canvas with breathing room on all sides.

CREATE: A single, iconic, professional brand logo for "${brandName}" — the kind of mark that would make a Fortune 500 brand identity guideline.`;

  logger.info(`[LOGO-GEN] Generating logo | brand: "${brandName}" | type: ${logoType} | industry: ${industry} | style: ${style} | bg: ${background}`);

  const model = getGenAI().getGenerativeModel({
    model: 'gemini-3-pro-image-preview',
    generationConfig: { temperature: 0.6 }, // Lower temp for logos — precision over creativity
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: textPrompt }] }],
    generationConfig: {
      responseModalities: ['image', 'text'],
    },
  });

  const responseParts = result.response.candidates?.[0]?.content?.parts;
  if (!responseParts) throw new Error('Gemini returned empty response — no logo generated');

  const imagePart = responseParts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart) {
    const partKeys = responseParts.map((p) => Object.keys(p)).join(', ');
    throw new Error(`Gemini returned no image part. Parts received: [${partKeys}]`);
  }

  logger.info(`[LOGO-GEN] Logo generated successfully for "${brandName}"`);

  return {
    imageData: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

module.exports = { generateLogoImage };
