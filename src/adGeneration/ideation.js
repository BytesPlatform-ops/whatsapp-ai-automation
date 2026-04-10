/**
 * Ad Ideation Service
 *
 * Ports the proven Design-Automation-V2 prompts (openai.ts) to CommonJS.
 * Modifications from the original:
 *   - Generates 3 ideas instead of 5 (idea 3 is always a 3D commercial render)
 *   - Adds `is3D` field per concept
 *   - Removes hardcoded lunar-calendar holidays (Ramadan/Eid) — those dates shift yearly
 *   - Adapts to optional aspectRatio + brandColors from the WhatsApp flow
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
 * Current seasonal context — only safe gregorian-calendar events.
 * Lunar/cultural holidays (Ramadan, Eid) are intentionally not hardcoded
 * because their gregorian dates shift ~11 days each year.
 */
function getSeasonalContext() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  const events = [];
  const trends = [];

  // Western holidays (fixed gregorian dates only)
  if (month === 11 && day >= 20) {
    events.push('Christmas season — warm reds/greens/golds, cozy festive vibes, gift-giving, holiday sparkle, snow elements');
  }
  if (month === 10 && day >= 25) {
    events.push('Black Friday / Cyber Monday — bold deal graphics, urgency, countdown energy, red/black/yellow sale aesthetic');
  }
  if (month === 0 && day <= 7) {
    events.push('New Year — fresh starts, resolutions, "New Year New You" energy, midnight blue/gold/silver palettes');
  }
  if (month === 1 && day >= 7 && day <= 15) {
    events.push("Valentine's Day — love, romance, red/pink/rose gold, hearts, couples, self-love angle");
  }
  if (month === 2 && day >= 1 && day <= 10) {
    events.push("International Women's Day (March 8) — empowerment, bold feminine energy, purple/gold");
  }
  if (month === 4 && day >= 5 && day <= 15) {
    events.push("Mother's Day season — warmth, gratitude, soft pastels, floral elements, gift-worthy messaging");
  }
  if (month === 5 && day >= 10 && day <= 20) {
    events.push("Father's Day season — masculine warmth, bold/rugged, navy/whiskey tones, appreciation");
  }
  if (month === 9 && day >= 25) {
    events.push('Halloween — dark/playful, orange/black/purple, spooky-fun energy, limited edition vibes');
  }

  // Seasonal moods
  if (month >= 5 && month <= 7) {
    trends.push('SUMMER vibes — bright colors, outdoor energy, refreshing tones, sunshine, heat, cooling products highlighted');
  } else if (month >= 8 && month <= 10) {
    trends.push('AUTUMN/FALL vibes — warm amber/copper/burgundy, cozy textures, harvest mood, layered comfort');
  } else if (month >= 11 || month <= 1) {
    trends.push('WINTER vibes — cool blues/silvers, cozy warmth contrast, indoor comfort, holiday spirit');
  } else {
    trends.push('SPRING vibes — fresh greens, bloom/renewal energy, pastels, new beginnings, outdoor optimism');
  }

  // Current design trends
  trends.push(
    '2025-2026 REALISTIC design trends to consider: Neo-brutalism (raw, bold, unpolished typography), maximalist color clashing, organic flowing shapes, bold serif typography comeback, editorial-style product photography (most effective!), dark mode aesthetics, warm grain/analog film revival, earth-tone minimalism, textured paper/fabric overlays in design, cinematic color grading, natural material focus (stone, wood, linen, ceramic), muted luxury palettes'
  );

  let context = '';
  if (events.length > 0) {
    context += `\n\n🎯 SEASONAL CONTEXT (background info only — use sparingly, MAX 1 idea can reference this, and ONLY if it genuinely fits the brand/product):\n${events.map((e) => `- ${e}`).join('\n')}`;
  }
  context += `\n\n🎨 CURRENT SEASON & DESIGN TRENDS (subtle influence only — do NOT make entire ideas about seasons):\n${trends.map((t) => `- ${t}`).join('\n')}`;

  return context;
}

/**
 * Platform-specific context based on aspect ratio
 */
function getPlatformContext(aspectRatio) {
  switch (aspectRatio) {
    case '1:1':
      return `\n\n📱 PLATFORM: Instagram/Facebook Feed Post (Square)
- Must be thumb-stopping in a crowded feed
- Text must be readable at phone-screen size
- Visual hierarchy crucial — users scroll FAST (1.7 seconds average)
- High contrast and bold elements perform best
- Consider how it looks as a small thumbnail`;
    case '4:5':
      return `\n\n📱 PLATFORM: Instagram Feed (Portrait — takes more screen space = more attention)
- Vertical advantage — fills more of the phone screen than square
- Keep key elements in center-top (bottom may be cropped in grid preview)
- Portrait framing favors tall compositions and standing products
- This format gets 20% more engagement than square on Instagram`;
    case '9:16':
      return `\n\n📱 PLATFORM: Instagram/TikTok/Facebook Story or Reel (Full Vertical)
- FULL SCREEN experience — immersive, no distractions
- Text should be in the center 60% (top/bottom are covered by UI elements)
- Must grab attention in first 0.5 seconds
- Bold, striking, high-impact visuals work best
- Keep brand name and CTA in the safe zone (away from edges)
- Think: magazine cover layout but vertical`;
    case '16:9':
      return `\n\n📱 PLATFORM: YouTube/LinkedIn/Twitter Banner (Landscape/Widescreen)
- Cinematic widescreen format — think movie poster or billboard
- Great for panoramic scenes and wide product layouts
- Text works best at left-third or center
- LinkedIn audience expects professional polish
- YouTube thumbnails need BOLD text and expressive visuals`;
    default:
      return `\n\n📱 PLATFORM: Social media feed ad (optimize for scroll-stopping impact)`;
  }
}

/**
 * Industry-specific competitor references and best practices
 */
function getIndustryInspirations(industry) {
  const inspirations = {
    'Food & Beverage': `STUDY THESE TOP BRANDS for inspiration (adapt, don't copy):
- Coca-Cola: Emotional storytelling, happiness association, iconic red
- Starbucks: Lifestyle integration, cozy aesthetic, seasonal limited editions
- McDonald's: Bold simplicity, "I'm Lovin' It" energy, appetite-appeal close-ups
- Local chai/food brands: Authenticity, cultural connection, street-food energy
BEST PRACTICES: Close-up hero shots that trigger appetite, steam/freshness cues, warm color palettes, lifestyle context showing enjoyment`,

    'Fashion & Apparel': `STUDY THESE TOP BRANDS for inspiration:
- Nike: Aspirational athlete energy, bold minimalism, empowerment messaging
- Zara: Editorial sophistication, clean layouts, model-centric storytelling
- Khaadi/Sapphire: Cultural fusion, fabric texture focus, seasonal collections
BEST PRACTICES: Model/lifestyle shots, fabric texture close-ups, outfit context, editorial lighting, seasonal trend alignment`,

    Technology: `STUDY THESE TOP BRANDS for inspiration:
- Apple: Ultra-minimal, product-as-art, white space mastery, one hero element
- Samsung: Feature demonstrations, vibrant screens, lifestyle integration
- Spotify: Bold gradients, duotone imagery, music-meets-visual energy
BEST PRACTICES: Clean product renders, feature callouts, dark mode aesthetics, futuristic environments, screen-on-device mockups`,

    'Health & Fitness': `STUDY THESE TOP BRANDS for inspiration:
- Nike Training: Sweat and determination, dramatic lighting, athlete stories
- Gymshark: Community-driven, transformation stories, bold body-positive imagery
- Peloton: Premium lifestyle, home fitness aspiration, warm but energetic
BEST PRACTICES: Action shots with motion energy, before/after transformations, motivational text, sweat/texture realism, gym environment lighting`,

    'Beauty & Skincare': `STUDY THESE TOP BRANDS for inspiration:
- Glossier: Dewy minimalism, skin-positive, soft pink aesthetic, real skin texture
- Fenty Beauty: Inclusive diversity, bold colors, fashion-forward, high-energy
- The Ordinary: Clinical clean, ingredient-focused, honest transparency
BEST PRACTICES: Skin texture close-ups, product-on-skin application shots, dewy/glowing lighting, ingredient visualization, clean clinical layouts`,

    'Real Estate': `STUDY THESE TOP BRANDS for inspiration:
- Emaar: Luxury lifestyle aspiration, golden hour architecture, skyline drama
- DHA: Trust, security, family-centric, green spaces, community living
- Zameen.com: Clear property info, location highlights, investment angle
BEST PRACTICES: Golden hour exterior shots, interior lifestyle scenes, aerial/drone perspectives, family aspiration, investment value messaging`,

    Automotive: `STUDY THESE TOP BRANDS for inspiration:
- BMW: Performance precision, dramatic lighting on bodywork, "Ultimate Driving Machine" energy
- Tesla: Futuristic minimalism, tech-forward, sustainability angle
- Toyota: Reliability, adventure, family, "Let's Go Places" lifestyle
BEST PRACTICES: Dramatic car-as-hero lighting, road/landscape context, speed/power suggestion, interior luxury details, reflection/surface quality`,

    Education: `STUDY THESE TOP BRANDS for inspiration:
- Coursera/Udemy: Transformation promise, career growth, accessible knowledge
- Khan Academy: Friendly, approachable, diverse learners, bright optimistic colors
- University brands: Prestige, campus beauty, alumni success, tradition
BEST PRACTICES: Student success stories, bright optimistic palettes, knowledge/growth metaphors, campus or study lifestyle, career transformation`,

    'Jewelry & Luxury': `STUDY THESE TOP BRANDS for inspiration:
- Tiffany & Co: Iconic blue, elegant simplicity, gift-giving moments
- Cartier: Red + gold opulence, dramatic close-ups, royalty association
- Local jewelers: Cultural wedding context, bridal sets, gold investment
BEST PRACTICES: Macro close-ups on skin, dramatic sparkle lighting, velvet/silk surfaces, gift-box reveals, cultural occasion context`,
  };

  // Try exact match first, then partial match
  for (const [key, value] of Object.entries(inspirations)) {
    if (industry.toLowerCase().includes(key.toLowerCase().split(' ')[0])) {
      return value;
    }
  }

  return `STUDY the TOP 5 brands in the ${industry} industry. What makes their ads scroll-stopping? Adapt their visual language and production quality for this brand. Research what aesthetic, lighting, composition, and messaging patterns the BEST ${industry} brands use.`;
}

/**
 * Generate 5 marketing ad concepts via OpenAI GPT-4o.
 *
 * Concepts 1-4 = realistic photography-based (different approaches).
 * Concept 5 = high-end commercial 3D render (CGI product showcase).
 *
 * @param {object} details - { businessName, industry, niche, productType, slogan?, pricing?, brandColors?, aspectRatio? }
 * @returns {Promise<Array>} Array of 5 idea objects
 */
async function generateAdIdeas(details) {
  const { businessName, industry, niche, productType, slogan, pricing, brandColors, aspectRatio } = details;

  const seasonalContext = getSeasonalContext();
  const platformContext = getPlatformContext(aspectRatio || '1:1');
  const industryInspirations = getIndustryInspirations(industry);

  const systemPrompt = `You are an elite creative director at a world-class advertising agency. You create ad concepts that are BOTH visually stunning AND commercially effective.

Your specialty: Creating SCROLL-STOPPING single-image ads for social media that look like they cost $100,000 to produce — but are REALISTIC and achievable.

CRITICAL RULES:

1. SINGLE IMAGE ADS ONLY — not a campaign, not a video, not a carousel

2. EACH IDEA = UNIQUE — vary the mood, angle, scene, and approach across all 5

3. THE visualConcept IS EVERYTHING — it directly drives the AI image generator (Gemini). Quality here = quality of final image.

4. COMMERCIAL EFFECTIVENESS FIRST:
   - Every idea must be designed to SELL the product, not just look artistic
   - The target audience must INSTANTLY understand what's being sold
   - The product/brand must be the HERO in every concept
   - Think: "Would the actual target customer stop scrolling and want to BUY?"
   - A restaurant owner doesn't want retro-futurism. A biryani lover doesn't care about surreal cloudscapes.

5. AI GENERATION FEASIBILITY — THIS IS CRITICAL:
   - Concepts 1, 2, 3 & 4 must be REALISTIC photography scenes (studios, lifestyle environments, real-world settings)
   - Concept 5 is the ONE EXCEPTION: a high-end COMMERCIAL 3D PRODUCT RENDER (like Apple, Tesla, luxury brand launch CGI). NOT surreal art, NOT abstract — premium commercial CGI showcasing the product cleanly.
   - For concepts 1-4 NEVER suggest: surreal floating objects, neon gradient meshes, crystal bowls in clouds, retro-futurism abstractions, waterfalls of products, hyper-realistic single grain close-ups, dreamlike cloudscapes, impossible physics
   - For concepts 1-4 ALWAYS suggest: Natural photography scenes, studio setups, lifestyle environments, close-up product shots, real-world settings with tangible props
   - Reality check for concepts 1-4: "Could a photographer recreate this scene in a real studio?" If NO, don't suggest it.

6. INDUSTRY AUTHENTICITY — match the visual language that customers in THIS industry expect

7. SEASONAL AWARENESS — MAXIMUM 1 out of 5 ideas can reference the current season or holiday, and ONLY if it genuinely enhances the brand. The other 4 ideas must be SEASON-AGNOSTIC (would work any time of year). DO NOT make multiple ideas about winter/summer/holidays.

8. NO GENERIC TEMPLATES — every concept should feel custom-crafted for this exact business

For visualConcept, write a PHOTOGRAPHER'S SHOT LIST (or 3D ARTIST'S BRIEF for the 3D concept):
- EXACT scene/environment (not "clean background" but "brushed concrete counter with morning light from the left window")
- Lighting: direction, quality, color temperature (golden hour, studio softbox, natural window, dramatic side-light)
- Composition: camera angle, product placement, rule of thirds, depth of field
- Materials/surfaces: specific tangible textures (slate, wood grain, linen cloth, wet glass)
- Props: real-world items that enhance the scene (spices, fabrics, devices — things that EXIST)
- Color palette: 2-3 dominant colors as a mood (warm earth tones, cool minimalist blues, etc.)
- Emotional tone: ONE clear emotion per concept (cozy, energetic, luxurious, fresh, urgent, etc.)

Always respond with valid JSON.`;

  const userPrompt = `Create 5 UNIQUE, STUNNING ad image concepts for this ${industry} business:

=== BRAND PROFILE ===
Business Name: "${businessName}"
Industry: ${industry}
Product/Service: ${niche}
Product Type: ${productType} (${productType === 'physical' ? 'tangible product you can hold/see' : productType === 'digital' ? 'software/app/digital tool' : 'service business'})
${slogan ? `Brand Slogan: "${slogan}"` : 'No slogan provided'}
${pricing ? `Pricing: "${pricing}"` : 'No pricing provided'}
${brandColors ? `Brand Colors (incorporate or complement): ${brandColors}` : 'Brand Colors: Not provided — choose what works best for the industry'}
${platformContext}
${seasonalContext}

=== INDUSTRY INTELLIGENCE ===
${industryInspirations}

=== YOUR TASK ===
Create 5 distinctly different ad concepts. Each must:
1. Be a SINGLE IMAGE ad optimized for the platform above
2. Feature "${businessName}" brand name prominently
${pricing ? `3. Display the price "${pricing}" in an eye-catching way` : '3. Include a compelling call-to-action'}
${slogan ? `4. Incorporate the slogan "${slogan}"` : ''}

=== HOW TO CREATE THE 5 IDEAS ===

Do NOT follow a fixed formula. Instead, think like a real creative director:
- What would make someone in ${industry} STOP scrolling?
- What visual HASN'T been done a million times in this industry?
- What emotion will make the viewer ACT?
- What would the TOP brand in ${industry} post tomorrow?

CONCEPT STRUCTURE:
- IDEAS 1, 2, 3 & 4 — REALISTIC PHOTOGRAPHY (is3D: false): Each must take a COMPLETELY DIFFERENT photography approach. Choose 4 from these directions (whichever fit BEST for this brand): product-as-hero studio shot, lifestyle context in real environment, bold typography-led editorial, mood/atmosphere cinematic, ingredient/process showcase, social proof / testimonial style, problem-solution split frame, comparison/before-after.
- IDEA 5 — HIGH-END 3D COMMERCIAL RENDER (is3D: true): A premium 3D CGI product render in the style of Apple/Tesla/luxury brand product launches. Photorealistic 3D, ray-traced lighting, physically-based materials, subsurface scattering on organic materials, cinematic depth. The product is cleanly hero-rendered against a dramatic 3D environment. This is COMMERCIAL CGI — NOT surreal art, NOT abstract, NOT fantasy. Think: Apple iPhone launch keyframe, Tesla Cybertruck reveal still, luxury watch brand 3D render.

A food brand might need: appetite hero photo + recipe lifestyle photo + ingredient showcase + social proof + 3D liquid splash render
A tech brand might need: product on desk photo + feature callout photo + dark mode showcase + lifestyle setup + holographic 3D device render
A salon might need: transformation before/after + luxurious interior + bridal moment + treatment close-up + 3D typographic logo scene

THINK SPECIFICALLY for ${industry} / ${niche}.

⚠️ REALITY CHECK FOR IDEAS 1-4 — DO NOT GENERATE:
- Surreal/fantasy scenes (no floating objects in clouds, no dreamscapes, no impossible physics)
- Abstract digital art (no neon gradient meshes, no retro-futurism, no 3D voids)
- Scenes that can't exist in real life (no waterfall of products, no single grain macro in space)
- Concepts that confuse the viewer about WHAT is being sold
- Ideas that only appeal to art directors, not actual BUYERS

✦ FOR IDEA 5 (3D RENDER): It MUST be commercial-grade CGI suitable for a brand launch — not artistic abstraction. The product/brand must be clearly identifiable. Think premium, sleek, photorealistic.

=== VISUAL CONCEPT QUALITY STANDARD ===
Your visualConcept must be SPECIFIC enough to direct a photographer (or 3D artist for idea 5).

BAD (too generic): "Product on clean background with dramatic lighting and bold text"
GOOD (specific & cinematic): "Hero product placed on a weathered wooden table with natural grain, backlit by soft window light creating translucent edges. Background: warm blurred bokeh of cafe ambient light. Brand name in bold serif typography overlaid top-left with semi-transparent white backdrop. Price tag as a vintage-style leather label hanging from string. Shallow depth of field, everything feels warm, artisanal, and accessible."

CRITICAL - NO REPETITION ACROSS IDEAS:
- Each visualConcept must use COMPLETELY DIFFERENT surfaces/materials/environments
- Each must have DIFFERENT lighting (side-lit, backlit, overhead, neon, natural, dramatic)
- Each must have DIFFERENT color palette mood (warm vs cool vs vibrant vs muted vs dark)
- Each must have DIFFERENT emotional energy (calm vs urgent vs playful vs premium vs raw)
- The 5 ads should look like they came from 5 DIFFERENT shoots (4 photoshoots + 1 CGI session)

Include in every visualConcept:
- Exact scene description (surfaces, materials, environment) - UNIQUE PER IDEA
- Lighting direction and quality - VARIED
- Text placement and style feeling
- Color palette mood - CONTRASTING
- Emotional tone - ALL DIFFERENT

Respond with JSON:
{
  "ideas": [
    {
      "id": "idea_1",
      "title": "Short Evocative Title (3-6 words)",
      "description": "What this ad communicates and why it works (2-3 sentences)",
      "is3D": false,
      "hooks": ["Headline Option 1", "Headline Option 2", "Headline Option 3"],
      "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4"],
      "visualConcept": "EXTREMELY detailed shot description — 4-6 sentences covering scene, lighting, composition, materials, text placement, mood, and color palette."
    },
    { "id": "idea_2", "is3D": false, ... },
    { "id": "idea_3", "is3D": false, ... },
    { "id": "idea_4", "is3D": false, ... },
    {
      "id": "idea_5",
      "title": "...",
      "description": "...",
      "is3D": true,
      "hooks": [...],
      "hashtags": [...],
      "visualConcept": "Premium 3D commercial render brief — describe the CGI scene, ray-traced lighting setup, materials, camera angle, and how the brand/product is hero-rendered."
    }
  ]
}`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('No response from OpenAI');
  const parsed = JSON.parse(content);
  return parsed.ideas;
}

/**
 * Expand a single selected idea into a production-ready Gemini execution prompt.
 * Mirrors expandToPrompts() from Design-Automation-V2 but for a single idea.
 *
 * @param {object} idea - { id, title, description, visualConcept, is3D }
 * @param {object} details - { businessName, industry, niche, productType, slogan?, pricing?, aspectRatio? }
 * @returns {Promise<string>} The expanded execution prompt (string)
 */
async function expandIdeaToPrompt(idea, details) {
  const { businessName, industry, niche, productType, slogan, pricing, aspectRatio } = details;
  const is3D = idea.is3D || false;

  const productTypeGuidelines = {
    physical: `For physical products — think like a product photographer:
- Describe surfaces the product sits on (marble slab, dark slate, rustic wood, wet glass)
- Specify how light interacts with the product (catches the edge, creates reflections, casts soft shadows)
- Include environmental props that complement without competing (ingredient elements, texture accents, atmospheric particles)
- Make the product the undeniable hero — everything else serves it
- Describe the "tactile quality" — the viewer should almost feel they can touch the product`,

    service: `For service businesses — think like a lifestyle photographer:
- Describe the TRANSFORMATION or OUTCOME the service delivers
- Create scenes showing the emotional payoff (relief, joy, confidence, success)
- Use environmental storytelling — the space, the light, the mood tells the story
- Include human elements when appropriate (hands, silhouettes, implied presence)
- The viewer should FEEL what it's like to have this service in their life`,

    digital: `For digital products — think like a tech brand photographer:
- Describe device presentation (floating devices, minimal desk setup, isometric view)
- Specify screen content mood (abstract UI elements, data visualization, clean interfaces)
- Create a modern, forward-thinking environment (minimal workspace, futuristic elements)
- Use technology-authentic lighting (screen glow, ambient blue tones, clean white light)
- The viewer should feel "this will upgrade my life"`,
  };

  const renderTypeNote = is3D
    ? `\n\n✦ THIS IS A 3D COMMERCIAL CGI RENDER — write the brief like a 3D art director directing a Cinema 4D / Octane / Blender artist. Use CGI vocabulary: ray-traced lighting, physically-based rendering (PBR), subsurface scattering, depth of field, render quality markers. The output should look like a premium product launch CGI render — NOT a photograph, NOT surreal art.`
    : `\n\n📸 THIS IS A PHOTOGRAPHY-BASED AD — write the brief like a photographer's shot list. Real-world scene, camera angles, studio/location lighting setup, lens choice.`;

  const systemPrompt = `You are a master prompt engineer AND elite advertising creative director. You translate marketing ad concepts into the PERFECT prompts for an AI image generator (Google Gemini).

YOUR UNDERSTANDING OF AI IMAGE GENERATION:
- AI responds best to SPECIFIC, CONCRETE descriptions — not vague instructions
- Scene description quality DIRECTLY determines image quality
- You must describe the EXACT VISUAL the AI should create, like directing a photographer
- Include: materials, textures, lighting direction, color palette, composition, mood
- The more cinematic and specific your scene description, the better the output

PROMPT STRUCTURE THAT WORKS BEST:
1. Open with the primary scene/environment description
2. Describe the hero element (product/brand visualization) placement and treatment
3. Specify lighting quality and direction
4. Define the color mood and material textures
5. Describe the overall emotional tone and visual energy
6. Note composition and camera perspective

IMPORTANT PRINCIPLES:
- Do NOT specify exact font names or CSS-style properties — describe the FEELING of the typography
- Do NOT micromanage colors with hex codes — describe the color MOOD (warm earth tones, icy cool blues, etc.)
- DO describe specific materials (marble, brushed aluminum, liquid gold, matte ceramic)
- DO describe specific lighting (rim-lit from behind, diffused overhead softbox, dramatic side-light creating long shadows)
- DO describe the scene like a movie director would describe a shot to their cinematographer
- The prompt will be paired with the brand's product images/logo if they uploaded them
${renderTypeNote}

TREND & CULTURAL AWARENESS:
- If a seasonal event is relevant, weave its visual language naturally (festive lights, warm tones for holidays, fresh greens for spring launches, etc.)
- Reference current 2025-2026 design movements when they fit (neo-brutalism, glassmorphism, grain/analog revival)
- DON'T force trends — only use them when they genuinely enhance the concept

Always respond with valid JSON.`;

  const seasonalContext = getSeasonalContext();
  const platformContext = getPlatformContext(aspectRatio || '1:1');

  const userPrompt = `Transform this selected ad concept into a PRODUCTION-READY image generation prompt.

=== BRAND CONTEXT ===
Brand: "${businessName}"
Industry: ${industry}
Niche: ${niche}
Product Type: ${productType}
${slogan ? `Slogan: "${slogan}"` : 'No slogan'}
${pricing ? `Pricing: "${pricing}"` : 'No pricing'}

${productTypeGuidelines[productType] || productTypeGuidelines.physical}

=== CURRENT CONTEXT (USE IF RELEVANT) ===
${seasonalContext}
${platformContext}

=== SELECTED AD CONCEPT ===
Title: "${idea.title}"
Concept: ${idea.description}
Visual Direction: ${idea.visualConcept}
Render Type: ${is3D ? '3D Commercial CGI Render' : 'Realistic Photography'}

=== YOUR TASK ===

Write a CINEMATIC prompt that reads like a shot description from a world-class ${is3D ? '3D art director' : 'photographer'}. The prompt should paint such a vivid picture that anyone reading it can SEE the exact image.

QUALITY STANDARD — compare these:

❌ WEAK PROMPT: "Create a professional ad for a shoe brand. Product centered, dramatic lighting, bold text, premium feel."

✅ STRONG PROMPT: "A single pristine white running shoe floating at a slight angle against a deep matte black background, lit from below with a cool blue uplight that catches the mesh texture and creates an ethereal glow around the sole. Tiny particles of light drift upward like sparks. The environment feels like a void of pure performance energy. The brand name should feel carved from light itself — clean, sharp, powerful. A subtle gradient from black to midnight blue gives depth. The composition is minimal but the impact is massive — this shoe is the future of running. The mood is electric, confident, and unstoppable."

YOUR PROMPT MUST INCLUDE:
1. **Scene/Environment**: Exact surfaces, backgrounds, props, atmosphere
2. **Lighting**: Direction, quality, color temperature, shadows
3. **Product/Hero Treatment**: How the main subject is presented and enhanced
4. **Color Palette Mood**: Warm/cool, specific tones, gradients, contrasts
5. **Composition & Camera Feel**: Angle, depth of field, focal point, spacing
6. **Emotional Energy**: What the viewer FEELS when they see this image
7. **Typography Direction**: NOT specific fonts — but the FEELING of the text (bold and industrial? elegant and thin? playful and rounded?)
8. **Text Content**: Brand name "${businessName}"${slogan ? `, slogan "${slogan}"` : ''}${pricing ? `, price "${pricing}"` : ''} — describe HOW they integrate into the scene
${is3D ? '9. **3D Render Quality Markers**: Ray-tracing, PBR materials, subsurface scattering on organic surfaces, cinematic depth — make it clear this is premium commercial CGI' : ''}

The prompt should be 150-220 words of pure visual direction — dense, specific, no filler.

Respond with JSON:
{
  "prompt": "Your cinematic, detailed visual direction prompt..."
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
  return parsed.prompt;
}

module.exports = { generateAdIdeas, expandIdeaToPrompt };
