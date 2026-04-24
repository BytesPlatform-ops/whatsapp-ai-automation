/**
 * Marketing Ad Generation Handler
 *
 * Integrates Design-Automation-V2 ad generation pipeline into the WhatsApp bot.
 *
 * CONVERSATION FLOW:
 *   AD_COLLECT_BUSINESS   → "What is your business name?"
 *   AD_COLLECT_INDUSTRY   → "What industry are you in?"
 *   AD_COLLECT_NICHE      → "What product/service is this ad for?"
 *   AD_COLLECT_TYPE       → [Physical Product] [Service] [Digital Product]  (buttons)
 *   AD_COLLECT_SLOGAN     → "Brand slogan? (or skip)"
 *   AD_COLLECT_PRICING    → "Pricing to display? (or skip)"
 *   AD_COLLECT_IMAGE      → "Send product/logo image (or skip)"
 *   AD_SELECT_IDEA        → generates 3 ideas → user picks via list message
 *   AD_CREATING_IMAGE     → expands prompt → generates image → uploads → sends
 *   AD_RESULTS            → shows image, [Generate Another] [Different Idea] [Back to Menu]
 */

const {
  sendTextMessage,
  sendInteractiveButtons,
  sendWithMenuButton,
  sendImage,
  downloadMedia,
} = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { STATES } = require('../states');
const { logger } = require('../../utils/logger');
const { generateAdIdeas, expandIdeaToPrompt } = require('../../adGeneration/ideation');
const { generateAdImage } = require('../../adGeneration/imageGen');
const { uploadAdImage } = require('../../adGeneration/imageUploader');
const { generateResponse } = require('../../llm/provider');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get adData from user metadata (safe defaults)
 */
function getAdData(user) {
  return user.metadata?.adData || {};
}

/**
 * Persist adData fields and update local user object in-place
 */
async function saveAdData(user, fields) {
  const existing = getAdData(user);
  const updated = { ...existing, ...fields };
  await updateUserMetadata(user.id, { adData: updated });
  user.metadata = { ...(user.metadata || {}), adData: updated };
}

/**
 * Truncate text to fit WhatsApp list row description (max 72 chars)
 */
function truncate(text, max = 70) {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// ── Main router ───────────────────────────────────────────────────────────────

async function handleAdGeneration(user, message) {
  switch (user.state) {
    case STATES.AD_COLLECT_BUSINESS:
      return handleCollectBusiness(user, message);
    case STATES.AD_COLLECT_INDUSTRY:
      return handleCollectIndustry(user, message);
    case STATES.AD_COLLECT_NICHE:
      return handleCollectNiche(user, message);
    case STATES.AD_COLLECT_TYPE:
      return handleCollectType(user, message);
    case STATES.AD_COLLECT_SLOGAN:
      return handleCollectSlogan(user, message);
    case STATES.AD_COLLECT_PRICING:
      return handleCollectPricing(user, message);
    case STATES.AD_COLLECT_COLORS:
      return handleCollectColors(user, message);
    case STATES.AD_COLLECT_IMAGE:
      return handleCollectImage(user, message);
    case STATES.AD_SELECT_IDEA:
      return handleSelectIdea(user, message);
    case STATES.AD_CREATING_IMAGE:
      // This state is handled inline by handleSelectIdea — if somehow re-entered, restart
      return handleRestartFlow(user, message);
    case STATES.AD_RESULTS:
      return handleResults(user, message);
    default:
      return handleStart(user, message);
  }
}

// ── Step handlers ─────────────────────────────────────────────────────────────

/**
 * Entry point — clear any previous adData, pre-fill from the shared
 * cross-flow pool (set by the webdev flow), and route to the first
 * state that still needs input. When businessName + industry are
 * carried from websiteData, we skip both questions and jump straight
 * to AD_COLLECT_NICHE.
 */
async function handleStart(user, message) {
  const { getSharedBusinessContext } = require('../entityAccumulator');
  const shared = getSharedBusinessContext(user);

  // Reset ad-specific fields; pre-fill the shared ones.
  await saveAdData(user, {
    businessName: shared.businessName || null,
    industry: shared.industry || null,
    // Ad-specific — always start fresh.
    niche: null, productType: null, slogan: null, pricing: null,
    brandColors: null, imageBase64: null, ideas: null, selectedIdeaIndex: null,
    suggestedBusinessName: null,
  });

  const hasName = !!shared.businessName;
  const hasIndustry = !!shared.industry;

  // Craft an intro that acknowledges what carried over from webdev so
  // the user isn't confused by the skipped questions.
  const ctxLines = [];
  if (hasName) ctxLines.push(`*${shared.businessName}*`);
  if (hasIndustry) ctxLines.push(`_${shared.industry}_`);
  const carriedNote = ctxLines.length ? `\n\nUsing what I have from earlier: ${ctxLines.join(' · ')}.\n` : '';

  // Decide the first state that still needs input.
  if (!hasName) {
    await sendWithMenuButton(
      user.phone_number,
      '🎨 *Marketing Ad Generator*\n\n' +
        'I\'ll create a professional marketing ad image for your brand — the same quality used by top digital agencies!\n\n' +
        'Let\'s start with the basics.\n\n' +
        'What is your *business name*?'
    );
    await logMessage(user.id, 'Started ad generation flow', 'assistant');
    return STATES.AD_COLLECT_BUSINESS;
  }

  if (!hasIndustry) {
    await sendWithMenuButton(
      user.phone_number,
      `🎨 *Marketing Ad Generator*${carriedNote}\n` +
        `What *industry* are you in?\n\n` +
        'Examples:\n' +
        '• Food & Beverage\n• Fashion & Apparel\n• Beauty & Skincare\n' +
        '• Tech / Software\n• Real Estate\n• Fitness & Gym\n• Education\n• Retail / E-commerce\n\n' +
        'Type your industry:'
    );
    await logMessage(user.id, `Started ad generation with prefilled name=${shared.businessName}`, 'assistant');
    return STATES.AD_COLLECT_INDUSTRY;
  }

  // Name + industry both carried. Skip to the first ad-specific ask.
  await sendWithMenuButton(
    user.phone_number,
    `🎨 *Marketing Ad Generator*${carriedNote}\n` +
      `What *product or service* is this ad promoting?\n\n` +
      'Be specific — the more detail, the better the ad!\n\n' +
      'Examples:\n' +
      '• Premium Basmati Rice\n• Wedding Photography Package\n• Online Excel Course\n• Handmade Leather Bags'
  );
  await logMessage(user.id, `Started ad generation with prefilled name=${shared.businessName}, industry=${shared.industry}`, 'assistant');
  return STATES.AD_COLLECT_NICHE;
}

// Words that look like user confirmations, not real brand names
const CONFIRMATION_WORDS = new Set(['ok', 'okay', 'yes', 'no', 'sure', 'go', 'next', 'start', 'fine', 'done', 'ready', 'yep', 'yeah', 'hi', 'hello', 'hey']);

// Words that mean "use the previously suggested brand name"
const SAME_BRAND_WORDS = new Set(['same', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'continue', 'use it', 'that one', 'use that']);

// Whole-message skip detector — covers "skip", "skip it", "nope", "no
// thanks", etc. Anchored to full trimmed text so a user who actually
// typed "skip this fee" (hypothetical brand line) isn't misread as a
// skip intent.
const SKIP_RX = /^(?:skip|skip\s+(?:it|this|that|for\s*now)|no|nope|nah|n\/?a|na|none|nothing|pass|no\s+thanks?|dont|don'?t|leave\s+(?:it|blank)|i'?m\s+(?:gonna\s+)?skip(?:ping)?)$/i;
const isSkip = (text) => SKIP_RX.test(String(text || '').trim());

// Shared follow-up after business name is saved. Either skip to the
// niche question when we could infer industry from the name, or ask
// for industry normally.
async function ackAdNameAndAdvance(user, nameUsed, inferredIndustry) {
  if (inferredIndustry) {
    await sendWithMenuButton(
      user.phone_number,
      `Great! *${nameUsed}* · _${inferredIndustry}_ 👍\n\n` +
        `What *product or service* is this ad promoting?\n\n` +
        'Be specific — the more detail, the better the ad!\n\n' +
        'Examples:\n' +
        '• Premium Basmati Rice\n• Wedding Photography Package\n• Online Excel Course\n• Handmade Leather Bags'
    );
    await logMessage(user.id, `Ad flow: name="${nameUsed}", inferred industry="${inferredIndustry}"`, 'assistant');
    return STATES.AD_COLLECT_NICHE;
  }

  await sendWithMenuButton(
    user.phone_number,
    `Great! *${nameUsed}* 👍\n\nWhat *industry* are you in?\n\n` +
      'Examples:\n' +
      '• Food & Beverage\n• Fashion & Apparel\n• Beauty & Skincare\n' +
      '• Tech / Software\n• Real Estate\n• Fitness & Gym\n• Education\n• Retail / E-commerce\n\n' +
      'Type your industry:'
  );
  await logMessage(user.id, `Business name: ${nameUsed}`, 'assistant');
  return STATES.AD_COLLECT_INDUSTRY;
}

async function handleCollectBusiness(user, message) {
  const name = (message.text || '').trim();
  const adData = getAdData(user);
  const suggested = adData.suggestedBusinessName;
  const { inferIndustryFromBusinessName } = require('../entityAccumulator');

  // Case 1: We have a suggested business name from a previous flow
  if (suggested) {
    const lower = name.toLowerCase();

    // 1a. User confirmed with "same/yes/sure/etc" → use the suggested name
    if (lower && (SAME_BRAND_WORDS.has(lower) || /\b(same|yes|continue|that\s*one|use\s*(it|that))\b/i.test(lower))) {
      const inferred = await inferIndustryFromBusinessName(suggested, user.id);
      await saveAdData(user, {
        businessName: suggested,
        suggestedBusinessName: null,
        ...(inferred ? { industry: inferred } : {}),
      });
      return ackAdNameAndAdvance(user, suggested, inferred);
    }

    // 1b. User typed a different business name → use that, clear suggestion
    if (name && name.length >= 2) {
      const inferred = await inferIndustryFromBusinessName(name, user.id);
      await saveAdData(user, {
        businessName: name,
        suggestedBusinessName: null,
        ...(inferred ? { industry: inferred } : {}),
      });
      return ackAdNameAndAdvance(user, name, inferred);
    }

    // 1c. Empty/too short → re-prompt
    await sendWithMenuButton(
      user.phone_number,
      `Reply *same* to design for *${suggested}* again, or type a different business name:`
    );
    return STATES.AD_COLLECT_BUSINESS;
  }

  // Case 2: No suggestion — normal validation
  if (!name || name.length < 2 || CONFIRMATION_WORDS.has(name.toLowerCase())) {
    await sendWithMenuButton(
      user.phone_number,
      'Please enter your *actual business name*:\n\n' +
        'Examples: _NutreoPak_, _Milan Foods_, _BytesPlatform_\n\n' +
        '(This will appear on your ad)'
    );
    return STATES.AD_COLLECT_BUSINESS;
  }

  const inferred = await inferIndustryFromBusinessName(name, user.id);
  await saveAdData(user, {
    businessName: name,
    ...(inferred ? { industry: inferred } : {}),
  });
  return ackAdNameAndAdvance(user, name, inferred);
}

async function handleCollectIndustry(user, message) {
  const industry = (message.text || '').trim();
  if (!industry || industry.length < 2) {
    await sendWithMenuButton(user.phone_number, 'Please type your *industry* (e.g. Food & Beverage, Fashion, Tech):');
    return STATES.AD_COLLECT_INDUSTRY;
  }

  await saveAdData(user, { industry });

  const adData = getAdData(user);
  await sendWithMenuButton(
    user.phone_number,
    `*${industry}* ✓\n\nWhat *product or service* is this ad promoting?\n\n` +
      'Be specific — the more detail, the better the ad!\n\n' +
      'Examples:\n' +
      '• Premium Basmati Rice\n• Wedding Photography Package\n• Online Excel Course\n• Handmade Leather Bags'
  );
  await logMessage(user.id, `Industry: ${industry}`, 'assistant');
  return STATES.AD_COLLECT_NICHE;
}

// Trade words where the industry alone tells us it's a service — no point
// asking "physical / service / digital" when the user already said plumbing.
const SERVICE_INDUSTRY_RX = /\b(plumb(?:ing|er)?|electric(?:al|ian)?|hvac|roof(?:ing|er)?|pest\s*control|cleaning|cleaner|janitorial|locksmith|landscap\w*|lawn\s*care|tree\s*service|water\s*damage|restoration|handyman|carpent\w*|paint(?:er|ing)|appliance\s*repair|garage\s*door|contractor|construction|photograph\w*|videograph\w*|salon|barber\w*|spa|dental|dentist|medical|clinic|legal|lawyer|attorney|law\s*firm|accountant|accounting|bookkeep\w*|consult\w*|agency|marketing|realt\w*|real\s*estate|tutor\w*|coach\w*|therap\w*|fitness|gym|personal\s*trainer|auto\s*repair|mechanic|car\s*wash|detailing|moving|movers|delivery|catering|event\s*planning|wedding\s*planner|staffing|recruit\w*|pet\s*(?:care|grooming)|veterinary|childcare|daycare|driving\s*school|cleaning\s*services?|hair\s*salon)\b/i;

const DIGITAL_INDUSTRY_RX = /\b(saas|software\s*(?:company|startup)?|mobile\s*app|web\s*app|online\s*course|e-?learning|digital\s*product)\b/i;

const NICHE_SERVICE_RX = /\b(services?|consultation|repair|installation?|package\s*deal|packages?\s*(?:deal|offer)|subscription\s*service|booking|appointment|treatment|session|lesson|class|coaching|consulting|maintenance|inspection|audit|cleaning)\b/i;
const NICHE_DIGITAL_RX = /\b(course|e-?book|mobile\s*app|web\s*app|template|plugin|extension|saas)\b/i;

/**
 * Try to infer the product type (physical / service / digital) from the
 * industry and niche text, so we can skip the 3-button question when the
 * answer is already obvious. Returns null when truly ambiguous — caller
 * falls back to asking the user.
 */
async function inferProductType(niche, industry, userId) {
  const n = String(niche || '').toLowerCase();
  const i = String(industry || '').toLowerCase();

  // Fast path: industry alone is enough for service trades / digital industries.
  if (SERVICE_INDUSTRY_RX.test(i)) return 'service';
  if (DIGITAL_INDUSTRY_RX.test(i)) return 'digital';
  // Fast path: niche clearly signals digital or service.
  if (NICHE_DIGITAL_RX.test(n)) return 'digital';
  if (NICHE_SERVICE_RX.test(n)) return 'service';

  // LLM fallback for the genuinely ambiguous cases.
  try {
    const prompt = `An advertiser gave us their industry and what they're advertising. Classify the offering as "physical", "service", or "digital".

Industry: "${industry || 'unknown'}"
Advertising: "${niche}"

Rules:
- "physical" = tangible goods (clothing, food items, jewelry, bags, furniture, produce).
- "service" = work performed for the customer (repairs, consultations, cleaning, legal work, salon treatments, packages/deals bundling services, coaching, events).
- "digital" = downloadable or online-only products (courses, ebooks, software, apps, SaaS subscriptions).
- If truly unclear, return "unknown".

Return ONLY one word: physical, service, digital, or unknown.`;
    const resp = await generateResponse(prompt, [{ role: 'user', content: niche }], {
      userId,
      operation: 'ad_type_infer',
    });
    const cleaned = (resp || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned === 'physical' || cleaned === 'service' || cleaned === 'digital') return cleaned;
    return null;
  } catch (err) {
    logger.warn(`[AD-GEN] inferProductType failed: ${err.message}`);
    return null;
  }
}

async function handleCollectNiche(user, message) {
  const niche = (message.text || '').trim();
  if (!niche || niche.length < 3) {
    await sendWithMenuButton(user.phone_number, 'Please describe your *product or service* (e.g. Premium Basmati Rice):');
    return STATES.AD_COLLECT_NICHE;
  }

  await saveAdData(user, { niche });

  const adData = getAdData(user);
  const inferred = await inferProductType(niche, adData.industry, user.id);

  if (inferred) {
    await saveAdData(user, { productType: inferred });
    await sendWithMenuButton(
      user.phone_number,
      `"${niche}" — got it!\n\n` +
        '✍️ *Brand Slogan / Tagline*\n\n' +
        'Type your slogan to display on the ad:\n\n' +
        'Examples: _"Fresh From Farm"_ or _"Style Redefined"_\n\n' +
        'Or type *skip* to continue without one:'
    );
    await logMessage(user.id, `Niche: ${niche} · Inferred type: ${inferred}`, 'assistant');
    return STATES.AD_COLLECT_SLOGAN;
  }

  await sendInteractiveButtons(
    user.phone_number,
    `"${niche}" — got it!\n\nWhat type is your offering?`,
    [
      { id: 'ad_type_physical', title: '📦 Physical Product' },
      { id: 'ad_type_service', title: '🛎 Service' },
      { id: 'ad_type_digital', title: '💻 Digital Product' },
    ]
  );
  await logMessage(user.id, `Niche: ${niche}`, 'assistant');
  return STATES.AD_COLLECT_TYPE;
}

async function handleCollectType(user, message) {
  const btnId = message.buttonId || '';
  const typeMap = {
    ad_type_physical: 'physical',
    ad_type_service: 'service',
    ad_type_digital: 'digital',
  };

  let productType = typeMap[btnId];

  // Allow text fallback
  if (!productType) {
    const t = (message.text || '').toLowerCase();
    if (t.includes('physical') || t.includes('product')) productType = 'physical';
    else if (t.includes('service')) productType = 'service';
    else if (t.includes('digital') || t.includes('software') || t.includes('app')) productType = 'digital';
  }

  if (!productType) {
    await sendInteractiveButtons(
      user.phone_number,
      'Please select the type of your offering:',
      [
        { id: 'ad_type_physical', title: '📦 Physical Product' },
        { id: 'ad_type_service', title: '🛎 Service' },
        { id: 'ad_type_digital', title: '💻 Digital Product' },
      ]
    );
    return STATES.AD_COLLECT_TYPE;
  }

  await saveAdData(user, { productType });

  await sendWithMenuButton(
    user.phone_number,
    '✍️ *Brand Slogan / Tagline*\n\n' +
      'Type your slogan to display on the ad:\n\n' +
      'Examples: _"Fresh From Farm"_ or _"Style Redefined"_\n\n' +
      'Or type *skip* to continue without one:'
  );
  await logMessage(user.id, `Product type: ${productType}`, 'assistant');
  return STATES.AD_COLLECT_SLOGAN;
}

async function handleCollectSlogan(user, message) {
  const text = (message.text || '').trim();
  let slogan = isSkip(text) ? null : text || null;

  // Strip leading confirmation words: "yes fresh from farm" → "fresh from farm"
  if (slogan) {
    slogan = slogan.replace(/^(yes[,!\s]+|yeah[,!\s]+|yep[,!\s]+|sure[,!\s]+|ok[,!\s]+)/i, '').trim() || slogan;
  }

  await saveAdData(user, { slogan });

  await sendWithMenuButton(
    user.phone_number,
    'Any *pricing info* to display on the ad?\n\n' +
      'Examples: _Rs. 250/kg_, _Starting from Rs. 999_, _20% OFF Today_\n\n' +
      'Type it or type *skip*:'
  );
  await logMessage(user.id, `Slogan: ${slogan || 'skipped'}`, 'assistant');
  return STATES.AD_COLLECT_PRICING;
}

async function handleCollectPricing(user, message) {
  const text = (message.text || '').trim();
  const pricing = isSkip(text) ? null : text || null;

  await saveAdData(user, { pricing });

  await sendWithMenuButton(
    user.phone_number,
    '🎨 *Brand Colors*\n\n' +
      'Do you have specific brand colors?\n\n' +
      'Examples: _Blue & Gold_, _#1a3a2a & #d4a843_, _Red White Black_\n\n' +
      'Type your colors — or type *skip* and we\'ll design the perfect palette for your brand automatically:'
  );
  await logMessage(user.id, `Pricing: ${pricing || 'skipped'}`, 'assistant');
  return STATES.AD_COLLECT_COLORS;
}

async function handleCollectColors(user, message) {
  const text = (message.text || '').trim();
  const brandColors = isSkip(text) ? null : text || null;

  await saveAdData(user, { brandColors });

  await sendWithMenuButton(
    user.phone_number,
    '📸 *Optional: Product or Logo Image*\n\n' +
      'Send a photo of your product or logo for a much more personalized ad.\n\n' +
      '_Tip: Good lighting + clear background = better results!_\n\n' +
      'Send an image *or* type *skip* to generate without one:'
  );
  await logMessage(user.id, `Brand colors: ${brandColors || 'skipped'}`, 'assistant');
  return STATES.AD_COLLECT_IMAGE;
}

async function handleCollectImage(user, message) {
  let imageBase64 = null;

  // Check if user sent an image
  if (message.type === 'image' && message.mediaId) {
    try {
      await sendTextMessage(user.phone_number, '⏳ Processing your image...');
      const { buffer, mimeType } = await downloadMedia(message.mediaId);
      imageBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
      logger.info(`[AD-GEN] User image downloaded (${Math.round(buffer.length / 1024)}KB)`);
    } catch (err) {
      logger.error('[AD-GEN] Failed to download user image:', err);
      await sendTextMessage(
        user.phone_number,
        '⚠️ Couldn\'t process your image. Continuing without it.\n\nGenerating your ad concepts now...'
      );
    }
  } else if ((message.text || '').toLowerCase().trim() === 'skip' || message.type === 'text') {
    // User skipped or typed something — treat as skip
  } else {
    // Unknown message type — ask again
    await sendWithMenuButton(
      user.phone_number,
      'Please *send an image* (photo from your gallery) or type *skip* to continue without one:'
    );
    return STATES.AD_COLLECT_IMAGE;
  }

  await saveAdData(user, { imageBase64 });

  // Transition to idea generation
  return await generateAndShowIdeas(user, message);
}

/**
 * Generate 5 ad ideas and present them as a friendly text message.
 * User picks by typing "1" through "5" — no buttons, conversational.
 */
async function generateAndShowIdeas(user, message) {
  const adData = getAdData(user);

  await sendTextMessage(
    user.phone_number,
    '✨ Working on 5 unique ad concepts for your brand...\n\nGive me about 30-45 seconds — sketching them out now ☕'
  );

  let ideas;
  try {
    ideas = await generateAdIdeas({
      businessName: adData.businessName,
      industry: adData.industry,
      niche: adData.niche,
      productType: adData.productType,
      slogan: adData.slogan,
      pricing: adData.pricing,
      brandColors: adData.brandColors,
    });
  } catch (err) {
    logger.error('[AD-GEN] Idea generation failed:', err);
    await sendTextMessage(
      user.phone_number,
      '⚠️ Something went wrong while generating concepts.\n\nReply *retry* to try again, or *menu* to go back.'
    );
    return STATES.AD_SELECT_IDEA;
  }

  // Store ideas in metadata
  await saveAdData(user, { ideas });

  // Build a rich, conversational text message with full concept details
  const conceptText = ideas.map((idea, i) => {
    const badge = idea.is3D ? '✦ *3D Render*' : '📸 *Photo*';
    return `*${i + 1}. ${idea.title}* — ${badge}\n${idea.description}`;
  }).join('\n\n────────\n\n');

  await sendTextMessage(
    user.phone_number,
    `🎨 *Here are 5 ad concepts for ${adData.businessName}:*\n\n${conceptText}\n\n────────\n\n` +
      `Reply with the *number* (1-5) of the concept you want me to generate ✨`
  );

  await logMessage(user.id, '5 ad concepts generated and presented', 'assistant');
  return STATES.AD_SELECT_IDEA;
}

async function handleSelectIdea(user, message) {
  const listId = message.listId || message.buttonId || '';
  const text = (message.text || '').trim().toLowerCase();
  const adData = getAdData(user);

  // Handle retry triggers
  if (listId === 'ad_retry_ideas' || text === 'retry') {
    return await generateAndShowIdeas(user, message);
  }

  if (listId === 'back_menu' || text === 'menu') {
    const { handleWelcome } = require('./welcome');
    return handleWelcome(user, message);
  }

  // Parse idea selection from either:
  //   1. Legacy button/list ID: "ad_idea_2"
  //   2. Plain number text: "1", "2", "3", "4", "5"
  //   3. Text with number: "concept 3", "i pick 2", etc.
  let ideaIndex = null;

  const idMatch = listId.match(/^ad_idea_(\d+)$/);
  if (idMatch) {
    ideaIndex = parseInt(idMatch[1], 10);
  } else if (text) {
    const numMatch = text.match(/\b([1-9])\b/);
    if (numMatch) {
      ideaIndex = parseInt(numMatch[1], 10) - 1; // user types 1-based, internal is 0-based
    }
  }

  if (ideaIndex === null || ideaIndex < 0) {
    // No valid selection — gently re-prompt
    if (adData.ideas && adData.ideas.length > 0) {
      await sendTextMessage(
        user.phone_number,
        `Just reply with the *number* (1-${adData.ideas.length}) of the concept you'd like me to generate ✨\n\nOr type *retry* for new concepts, or *menu* to go back.`
      );
    }
    return STATES.AD_SELECT_IDEA;
  }

  const selectedIdea = adData.ideas?.[ideaIndex];

  if (!selectedIdea) {
    await sendTextMessage(
      user.phone_number,
      `That number doesn't match any concept. Please pick between 1 and ${adData.ideas?.length || 5}.`
    );
    return STATES.AD_SELECT_IDEA;
  }

  await saveAdData(user, { selectedIdeaIndex: ideaIndex });

  // Let user know we're working on it — mention 3D if applicable
  const is3D = selectedIdea.is3D || false;
  await sendTextMessage(
    user.phone_number,
    `${is3D ? '✦ *3D Render' : '🎨 *Creating'}: "${selectedIdea.title}"*\n\n` +
      `${is3D ? 'Generating a photorealistic 3D ad — this takes 45-75 seconds.' : 'Generating your ad image — this takes 30-60 seconds.'}\n` +
      'I\'ll send it the moment it\'s ready! ☕'
  );
  await logMessage(user.id, `Selected idea: ${selectedIdea.title}${is3D ? ' (3D)' : ''}`, 'user');

  // ── Generate the image ───────────────────────────────────────────────────
  let publicUrl;
  try {
    // Step 1: Expand the concept into a complete Gemini execution brief
    const expandedPromptText = await expandIdeaToPrompt(selectedIdea, {
      businessName: adData.businessName,
      industry: adData.industry,
      niche: adData.niche,
      productType: adData.productType,
      slogan: adData.slogan,
      pricing: adData.pricing,
    });

    const promptObj = { ideaTitle: selectedIdea.title, prompt: expandedPromptText, is3D };

    // Step 2: Generate image with Gemini
    const { imageData, mimeType } = await generateAdImage(promptObj, adData.businessName, {
      slogan: adData.slogan,
      pricing: adData.pricing,
      productType: adData.productType,
      industry: adData.industry,
      niche: adData.niche,
      brandColors: adData.brandColors,
      imageBase64: adData.imageBase64,
      aspectRatio: '1:1',
    });

    // Step 3: Upload to Supabase Storage → get public URL
    publicUrl = await uploadAdImage(imageData, mimeType);
  } catch (err) {
    const errMsg = err?.message || JSON.stringify(err) || 'Unknown error';
    logger.error(`[AD-GEN] Image generation failed: ${errMsg}`);

    await sendInteractiveButtons(
      user.phone_number,
      '⚠️ Ad generation failed. This happens occasionally — let\'s try again.\n\nWhat would you like to do?',
      [
        { id: 'ad_retry_same', title: '🔄 Try Again' },
        { id: 'ad_back_ideas', title: '◀ Pick Different' },
        { id: 'back_menu', title: '📋 Back to Menu' },
      ]
    );
    return STATES.AD_RESULTS; // Retry handled in handleResults
  }

  // ── Send the generated ad image ─────────────────────────────────────────
  const caption =
    `✅ *Your Marketing Ad is Ready!*\n\n` +
    `🏷 *Brand:* ${adData.businessName}\n` +
    `🎨 *Concept:* ${selectedIdea.title}\n` +
    (adData.industry ? `🏭 *Industry:* ${adData.industry}\n` : '') +
    `\n_Powered by BytesPlatform_`;

  await sendImage(user.phone_number, publicUrl, caption);
  await logMessage(user.id, `Ad image generated and sent: ${publicUrl}`, 'assistant');

  // Phase 15: record completion so future sessions recognize the user.
  try {
    const { markProjectCompleted } = require('../returnVisitor');
    await markProjectCompleted(user, { type: 'ad', businessName: adData.businessName });
  } catch (err) {
    logger.warn(`[AD-GEN] markProjectCompleted failed: ${err.message}`);
  }

  // Feedback: schedule the post-delivery prompt.
  try {
    const { scheduleDeliveryPrompt } = require('../../feedback/feedback');
    await scheduleDeliveryPrompt(user, 'ad');
  } catch (err) {
    logger.warn(`[AD-GEN] scheduleDeliveryPrompt failed: ${err.message}`);
  }

  // Follow-up options
  await sendInteractiveButtons(
    user.phone_number,
    'What would you like to do next?',
    [
      { id: 'ad_generate_another', title: '🔄 New Concepts' },
      { id: 'ad_order_campaign', title: '📣 Full Campaign' },
      { id: 'back_menu', title: '📋 Back to Menu' },
    ]
  );

  return STATES.AD_RESULTS;
}

async function handleResults(user, message) {
  const btnId = message.buttonId || message.listId || '';
  const adData = getAdData(user);

  if (btnId === 'ad_retry_same') {
    // Retry image gen with the same idea
    const ideaIndex = adData.selectedIdeaIndex ?? 0;
    const fakeMessage = { buttonId: `ad_idea_${ideaIndex}`, listId: `ad_idea_${ideaIndex}` };
    return handleSelectIdea(user, fakeMessage);
  }

  if (btnId === 'ad_back_ideas') {
    // Re-show the concepts in the same conversational text format
    if (adData.ideas && adData.ideas.length > 0) {
      const conceptText = adData.ideas.map((idea, i) => {
        const badge = idea.is3D ? '✦ *3D Render*' : '📸 *Photo*';
        return `*${i + 1}. ${idea.title}* — ${badge}\n${idea.description}`;
      }).join('\n\n────────\n\n');

      await sendTextMessage(
        user.phone_number,
        `🎨 *Pick a different concept:*\n\n${conceptText}\n\n────────\n\n` +
          `Reply with the *number* (1-${adData.ideas.length}) you'd like me to generate ✨`
      );
      return STATES.AD_SELECT_IDEA;
    }
    return await generateAndShowIdeas(user, message);
  }

  if (btnId === 'ad_generate_another') {
    // Restart the whole flow with cleared data (same user, fresh input).
    // Note: intentionally does NOT advance the service queue — user is
    // explicitly asking for another ad, not done with ads.
    return handleStart(user, message);
  }

  if (btnId === 'ad_order_campaign') {
    await sendTextMessage(
      user.phone_number,
      '📣 *Full Marketing Campaign Package*\n\n' +
        'We can create a complete multi-platform ad campaign for you including:\n\n' +
        '• 5-10 professional ad creatives\n' +
        '• Multiple formats (Square, Story, Banner)\n' +
        '• Caption & hashtag copy for each ad\n' +
        '• Branded color palette & typography guide\n' +
        '• Meta Ads & Google Ads ready files\n\n' +
        'Let our team prepare a custom package for your brand!\n' +
        'Type anything to connect with our team.'
    );
    await logMessage(user.id, 'Interested in full campaign package', 'user');
    return STATES.SALES_CHAT;
  }

  if (btnId === 'back_menu') {
    // Phase 12: if there's a queued service waiting, advance to it
    // before falling back to the generic welcome.
    const { maybeStartNextQueuedService } = require('../serviceQueue');
    const nextState = await maybeStartNextQueuedService(user);
    if (nextState) return nextState;

    const { handleWelcome } = require('./welcome');
    return handleWelcome(user, message);
  }

  // Default: show options again
  await sendInteractiveButtons(
    user.phone_number,
    'What would you like to do?',
    [
      { id: 'ad_generate_another', title: '🔄 New Concepts' },
      { id: 'ad_order_campaign', title: '📣 Full Campaign' },
      { id: 'back_menu', title: '📋 Back to Menu' },
    ]
  );
  return STATES.AD_RESULTS;
}

async function handleRestartFlow(user, message) {
  return handleStart(user, message);
}

// Exported so serviceSelection.js can invoke it directly when the user
// picks the "Marketing Ads" menu option. Skips collection states whose
// fields are already in the shared websiteData pool (Phase 11).
async function startAdFlow(user) {
  return handleStart(user, null);
}

module.exports = { handleAdGeneration, startAdFlow };
