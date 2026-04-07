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
  sendInteractiveList,
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
 * Entry point — clear any previous adData and ask for business name
 */
async function handleStart(user, message) {
  await saveAdData(user, {
    businessName: null, industry: null, niche: null, productType: null,
    slogan: null, pricing: null, imageBase64: null, ideas: null, selectedIdeaIndex: null,
  });

  await sendWithMenuButton(
    user.phone_number,
    '🎨 *Marketing Ad Generator*\n\n' +
      'I\'ll create a professional marketing ad image powered by AI — the same technology used by top digital agencies!\n\n' +
      'Let\'s start with the basics.\n\n' +
      'What is your *business name*?'
  );
  await logMessage(user.id, 'Started ad generation flow', 'assistant');
  return STATES.AD_COLLECT_BUSINESS;
}

async function handleCollectBusiness(user, message) {
  const name = (message.text || '').trim();
  if (!name || name.length < 2) {
    await sendWithMenuButton(user.phone_number, 'Please enter your *business name* to continue:');
    return STATES.AD_COLLECT_BUSINESS;
  }

  await saveAdData(user, { businessName: name });

  await sendWithMenuButton(
    user.phone_number,
    `Great! *${name}* 👍\n\nWhat *industry* are you in?\n\n` +
      'Examples:\n' +
      '• Food & Beverage\n• Fashion & Apparel\n• Beauty & Skincare\n' +
      '• Tech / Software\n• Real Estate\n• Fitness & Gym\n• Education\n• Retail / E-commerce\n\n' +
      'Type your industry:'
  );
  await logMessage(user.id, `Business name: ${name}`, 'assistant');
  return STATES.AD_COLLECT_INDUSTRY;
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

async function handleCollectNiche(user, message) {
  const niche = (message.text || '').trim();
  if (!niche || niche.length < 3) {
    await sendWithMenuButton(user.phone_number, 'Please describe your *product or service* (e.g. Premium Basmati Rice):');
    return STATES.AD_COLLECT_NICHE;
  }

  await saveAdData(user, { niche });

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
    'Do you have a *brand slogan* or tagline to display on the ad?\n\n' +
      'Example: _"Fresh From Farm"_ or _"Style Redefined"_\n\n' +
      'Type your slogan or type *skip* to continue:'
  );
  await logMessage(user.id, `Product type: ${productType}`, 'assistant');
  return STATES.AD_COLLECT_SLOGAN;
}

async function handleCollectSlogan(user, message) {
  const text = (message.text || '').trim();
  const slogan = text.toLowerCase() === 'skip' ? null : text || null;

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
  const pricing = text.toLowerCase() === 'skip' ? null : text || null;

  await saveAdData(user, { pricing });

  await sendWithMenuButton(
    user.phone_number,
    '📸 *Optional: Product or Logo Image*\n\n' +
      'Send a photo of your product or logo for a much more personalized ad.\n\n' +
      '_Tip: Good lighting + clear background = better results!_\n\n' +
      'Send an image *or* type *skip* to generate without one:'
  );
  await logMessage(user.id, `Pricing: ${pricing || 'skipped'}`, 'assistant');
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
 * Generate 3 ad ideas using OpenAI and present them as a WhatsApp list
 */
async function generateAndShowIdeas(user, message) {
  const adData = getAdData(user);

  await sendTextMessage(
    user.phone_number,
    '✨ *Generating your ad concepts...*\n\nOur AI creative director is crafting 3 unique concepts for your brand. This takes about 20-30 seconds...'
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
    });
  } catch (err) {
    logger.error('[AD-GEN] Idea generation failed:', err);
    await sendInteractiveButtons(
      user.phone_number,
      '⚠️ Idea generation failed. What would you like to do?',
      [
        { id: 'ad_retry_ideas', title: '🔄 Try Again' },
        { id: 'back_menu', title: '📋 Back to Menu' },
      ]
    );
    return STATES.AD_SELECT_IDEA; // stay — retry handled in handleSelectIdea
  }

  // Store ideas in metadata
  await saveAdData(user, { ideas });

  // Present as an interactive list
  const rows = ideas.map((idea, i) => ({
    id: `ad_idea_${i}`,
    title: `${i + 1}. ${idea.title}`.slice(0, 24),
    description: truncate(idea.description, 72),
  }));

  await sendInteractiveList(
    user.phone_number,
    '🎨 *3 Ad Concepts Ready!*\n\nOur AI creative director designed these specifically for your brand. Pick the concept you\'d like to generate:',
    'Pick a Concept',
    [{ title: 'Ad Concepts', rows }]
  );

  await logMessage(user.id, '3 ad concepts generated and presented', 'assistant');
  return STATES.AD_SELECT_IDEA;
}

async function handleSelectIdea(user, message) {
  const listId = message.listId || message.buttonId || '';
  const adData = getAdData(user);

  // Handle retry
  if (listId === 'ad_retry_ideas') {
    return await generateAndShowIdeas(user, message);
  }

  if (listId === 'back_menu') {
    const { handleWelcome } = require('./welcome');
    return handleWelcome(user, message);
  }

  // Parse idea selection
  const match = listId.match(/^ad_idea_(\d+)$/);
  if (!match) {
    // Fallback: re-show if ideas exist
    if (adData.ideas && adData.ideas.length > 0) {
      const rows = adData.ideas.map((idea, i) => ({
        id: `ad_idea_${i}`,
        title: `${i + 1}. ${idea.title}`.slice(0, 24),
        description: truncate(idea.description, 72),
      }));
      await sendInteractiveList(
        user.phone_number,
        'Please select one of the concepts:',
        'Pick a Concept',
        [{ title: 'Ad Concepts', rows }]
      );
    }
    return STATES.AD_SELECT_IDEA;
  }

  const ideaIndex = parseInt(match[1], 10);
  const selectedIdea = adData.ideas?.[ideaIndex];

  if (!selectedIdea) {
    await sendTextMessage(user.phone_number, '⚠️ Could not find that concept. Please try again.');
    return STATES.AD_SELECT_IDEA;
  }

  await saveAdData(user, { selectedIdeaIndex: ideaIndex });

  // Let user know we're working on it
  await sendTextMessage(
    user.phone_number,
    `🎨 *Creating: "${selectedIdea.title}"*\n\n` +
      'Generating your ad image — this takes 30-60 seconds.\n' +
      'I\'ll send it the moment it\'s ready! ☕'
  );
  await logMessage(user.id, `Selected idea: ${selectedIdea.title}`, 'user');

  // ── Generate the image ───────────────────────────────────────────────────
  let publicUrl;
  try {
    // Step 1: Expand the concept into a Gemini prompt
    const expandedPrompt = await expandIdeaToPrompt(selectedIdea, {
      businessName: adData.businessName,
      industry: adData.industry,
      niche: adData.niche,
      productType: adData.productType,
      slogan: adData.slogan,
      pricing: adData.pricing,
    });

    const promptObj = { ideaTitle: selectedIdea.title, prompt: expandedPrompt };

    // Step 2: Generate image with Gemini
    const { imageData, mimeType } = await generateAdImage(promptObj, adData.businessName, {
      slogan: adData.slogan,
      pricing: adData.pricing,
      productType: adData.productType,
      industry: adData.industry,
      niche: adData.niche,
      imageBase64: adData.imageBase64,
      aspectRatio: '1:1',
    });

    // Step 3: Upload to Supabase Storage → get public URL
    publicUrl = await uploadAdImage(imageData, mimeType);
  } catch (err) {
    logger.error('[AD-GEN] Image generation failed:', err.message);

    await sendInteractiveButtons(
      user.phone_number,
      '⚠️ Ad generation failed. This can happen occasionally with AI image models.\n\nWhat would you like to do?',
      [
        { id: 'ad_retry_same', title: '🔄 Try Again' },
        { id: 'ad_back_ideas', title: '◀ Pick Different Idea' },
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
    `\n_Powered by BytesPlatform AI_`;

  await sendImage(user.phone_number, publicUrl, caption);
  await logMessage(user.id, `Ad image generated and sent: ${publicUrl}`, 'assistant');

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
    // Re-show the idea list
    if (adData.ideas && adData.ideas.length > 0) {
      const rows = adData.ideas.map((idea, i) => ({
        id: `ad_idea_${i}`,
        title: `${i + 1}. ${idea.title}`.slice(0, 24),
        description: truncate(idea.description, 72),
      }));
      await sendInteractiveList(
        user.phone_number,
        'Pick a different concept to generate:',
        'Pick a Concept',
        [{ title: 'Ad Concepts', rows }]
      );
      return STATES.AD_SELECT_IDEA;
    }
    return await generateAndShowIdeas(user, message);
  }

  if (btnId === 'ad_generate_another') {
    // Restart the whole flow with cleared data (same user, fresh input)
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

module.exports = { handleAdGeneration };
