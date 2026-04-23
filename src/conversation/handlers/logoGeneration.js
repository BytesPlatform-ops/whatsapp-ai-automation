/**
 * Logo Generation Handler
 *
 * Conversation flow for logo design.
 *
 * STATES:
 *   LOGO_COLLECT_BUSINESS    → "What is your business name?"
 *   LOGO_COLLECT_INDUSTRY    → "What industry?"
 *   LOGO_COLLECT_DESCRIPTION → "In one sentence, what does your business do?"
 *   LOGO_COLLECT_STYLE       → [Modern] [Classic] [Playful] [Luxury] [Bold]
 *   LOGO_COLLECT_COLORS      → "Brand colors? (or skip — we design)"
 *   LOGO_COLLECT_SYMBOL      → "Any symbol idea? (or skip)"
 *   LOGO_COLLECT_BACKGROUND  → [Transparent] [White] [Black] [Brand Color]
 *   LOGO_SELECT_IDEA         → 5 concepts shown as interactive list
 *   LOGO_CREATING_IMAGE      → handled inline
 *   LOGO_RESULTS             → [🔄 New Concepts] [📋 Back to Menu]
 */

const {
  sendTextMessage,
  sendInteractiveButtons,
  sendWithMenuButton,
  sendImage,
} = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { STATES } = require('../states');
const { logger } = require('../../utils/logger');
const { generateLogoIdeas, expandLogoToPrompt } = require('../../logoGeneration/ideation');
const { generateLogoImage } = require('../../logoGeneration/imageGen');
const { uploadLogoImage } = require('../../logoGeneration/imageUploader');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLogoData(user) {
  return user.metadata?.logoData || {};
}

async function saveLogoData(user, fields) {
  const existing = getLogoData(user);
  const updated = { ...existing, ...fields };
  await updateUserMetadata(user.id, { logoData: updated });
  user.metadata = { ...(user.metadata || {}), logoData: updated };
}

function truncate(text, max = 70) {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// Confirmation words that look like answers but aren't real business names
const CONFIRMATION_WORDS = new Set(['ok', 'okay', 'yes', 'no', 'sure', 'go', 'next', 'start', 'fine', 'done', 'ready', 'yep', 'yeah', 'hi', 'hello', 'hey']);

// Words that mean "use the previously suggested brand name"
const SAME_BRAND_WORDS = new Set(['same', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'continue', 'use it', 'that one', 'use that']);

// ── Main router ───────────────────────────────────────────────────────────────

async function handleLogoGeneration(user, message) {
  switch (user.state) {
    case STATES.LOGO_COLLECT_BUSINESS:
      return handleCollectBusiness(user, message);
    case STATES.LOGO_COLLECT_INDUSTRY:
      return handleCollectIndustry(user, message);
    case STATES.LOGO_COLLECT_DESCRIPTION:
      return handleCollectDescription(user, message);
    case STATES.LOGO_COLLECT_STYLE:
      return handleCollectStyle(user, message);
    case STATES.LOGO_COLLECT_COLORS:
      return handleCollectColors(user, message);
    case STATES.LOGO_COLLECT_SYMBOL:
      return handleCollectSymbol(user, message);
    case STATES.LOGO_COLLECT_BACKGROUND:
      return handleCollectBackground(user, message);
    case STATES.LOGO_SELECT_IDEA:
      return handleSelectIdea(user, message);
    case STATES.LOGO_CREATING_IMAGE:
      return handleStart(user, message);
    case STATES.LOGO_RESULTS:
      return handleResults(user, message);
    default:
      return handleStart(user, message);
  }
}

// ── Step handlers ─────────────────────────────────────────────────────────────

async function handleStart(user, message) {
  // Phase 11: pre-fill shared fields from whatever webdev flow already
  // accumulated, then skip past the collection states whose fields are
  // filled. Logo-specific fields (description, style, symbol,
  // background, brandColors) always start fresh.
  const { getSharedBusinessContext } = require('../entityAccumulator');
  const shared = getSharedBusinessContext(user);

  await saveLogoData(user, {
    businessName: shared.businessName || null,
    industry: shared.industry || null,
    description: null, style: null,
    brandColors: null, symbolIdea: null, background: null,
    ideas: null, selectedIdeaIndex: null,
    suggestedBusinessName: null,
  });

  const hasName = !!shared.businessName;
  const hasIndustry = !!shared.industry;

  const ctxLines = [];
  if (hasName) ctxLines.push(`*${shared.businessName}*`);
  if (hasIndustry) ctxLines.push(`_${shared.industry}_`);
  const carriedNote = ctxLines.length ? `\n\nUsing what I have from earlier: ${ctxLines.join(' · ')}.\n` : '';

  if (!hasName) {
    await sendWithMenuButton(
      user.phone_number,
      '✨ *Logo Maker*\n\n' +
        'I\'ll design 5 unique logo concepts for your brand — like having a top branding agency on call!\n\n' +
        'Let\'s start with the basics.\n\n' +
        'What is your *business name*?\n\n' +
        '_(This will be the actual text on your logo, so spell it exactly as you want it to appear)_'
    );
    await logMessage(user.id, 'Started logo generation flow', 'assistant');
    return STATES.LOGO_COLLECT_BUSINESS;
  }

  if (!hasIndustry) {
    await sendWithMenuButton(
      user.phone_number,
      `✨ *Logo Maker*${carriedNote}\n` +
        `What *industry* are you in?\n\n` +
        'Examples:\n' +
        '• Food & Beverage\n• Fashion & Apparel\n• Beauty & Skincare\n' +
        '• Tech / Software\n• Real Estate\n• Fitness & Gym\n• Education\n• Retail / E-commerce\n\n' +
        'Type your industry:'
    );
    await logMessage(user.id, `Started logo flow with prefilled name=${shared.businessName}`, 'assistant');
    return STATES.LOGO_COLLECT_INDUSTRY;
  }

  // Name + industry both carried → jump to first logo-specific step.
  await sendWithMenuButton(
    user.phone_number,
    `✨ *Logo Maker*${carriedNote}\n` +
      `In one sentence, *what does your business do*?\n\n` +
      'This helps me design a logo that visually fits your brand.\n\n' +
      'Example: _"We deliver fresh organic meals to busy professionals"_'
  );
  await logMessage(user.id, `Started logo flow with prefilled name=${shared.businessName}, industry=${shared.industry}`, 'assistant');
  return STATES.LOGO_COLLECT_DESCRIPTION;
}

async function handleCollectBusiness(user, message) {
  const name = (message.text || '').trim();
  const logoData = getLogoData(user);
  const suggested = logoData.suggestedBusinessName;

  // Case 1: We have a suggested business name from a previous flow
  if (suggested) {
    const lower = name.toLowerCase();

    // 1a. User confirmed with "same/yes/sure/etc" → use the suggested name
    if (lower && (SAME_BRAND_WORDS.has(lower) || /\b(same|yes|continue|that\s*one|use\s*(it|that))\b/i.test(lower))) {
      await saveLogoData(user, { businessName: suggested, suggestedBusinessName: null });
      await sendWithMenuButton(
        user.phone_number,
        `Great! Designing new logos for *${suggested}* 👍\n\nWhat *industry* are you in?\n\n` +
          'Examples:\n' +
          '• Food & Beverage\n• Fashion & Apparel\n• Beauty & Skincare\n' +
          '• Tech / Software\n• Real Estate\n• Fitness & Gym\n• Education\n\n' +
          'Type your industry:'
      );
      await logMessage(user.id, `Business name confirmed (suggested): ${suggested}`, 'assistant');
      return STATES.LOGO_COLLECT_INDUSTRY;
    }

    // 1b. User typed a different business name → use that, clear suggestion
    if (name && name.length >= 2) {
      await saveLogoData(user, { businessName: name, suggestedBusinessName: null });
      await sendWithMenuButton(
        user.phone_number,
        `Got it — designing new logos for *${name}* 👍\n\nWhat *industry* are you in?\n\n` +
          'Examples:\n' +
          '• Food & Beverage\n• Fashion & Apparel\n• Beauty & Skincare\n' +
          '• Tech / Software\n• Real Estate\n• Fitness & Gym\n• Education\n\n' +
          'Type your industry:'
      );
      await logMessage(user.id, `Business name (overridden suggestion): ${name}`, 'assistant');
      return STATES.LOGO_COLLECT_INDUSTRY;
    }

    // 1c. Empty/too short → re-prompt
    await sendWithMenuButton(
      user.phone_number,
      `Reply *same* to design for *${suggested}* again, or type a different business name:`
    );
    return STATES.LOGO_COLLECT_BUSINESS;
  }

  // Case 2: No suggestion — normal validation
  if (!name || name.length < 2 || CONFIRMATION_WORDS.has(name.toLowerCase())) {
    await sendWithMenuButton(
      user.phone_number,
      'Please enter your *actual business name* (this will be the text on your logo):\n\n' +
        'Examples: _NutreoPak_, _Milan Foods_, _BytesPlatform_'
    );
    return STATES.LOGO_COLLECT_BUSINESS;
  }

  await saveLogoData(user, { businessName: name });

  await sendWithMenuButton(
    user.phone_number,
    `Great! *${name}* 👍\n\nWhat *industry* are you in?\n\n` +
      'Examples:\n' +
      '• Food & Beverage\n• Fashion & Apparel\n• Beauty & Skincare\n' +
      '• Tech / Software\n• Real Estate\n• Fitness & Gym\n• Education\n\n' +
      'Type your industry:'
  );
  await logMessage(user.id, `Business name: ${name}`, 'assistant');
  return STATES.LOGO_COLLECT_INDUSTRY;
}

async function handleCollectIndustry(user, message) {
  const industry = (message.text || '').trim();
  if (!industry || industry.length < 2) {
    await sendWithMenuButton(user.phone_number, 'Please type your *industry* (e.g. Food & Beverage, Fashion, Tech):');
    return STATES.LOGO_COLLECT_INDUSTRY;
  }

  await saveLogoData(user, { industry });

  await sendWithMenuButton(
    user.phone_number,
    `*${industry}* ✓\n\n` +
      'In *one sentence*, what does your business do?\n\n' +
      'Examples:\n' +
      '• "We sell premium organic acacia honey from Pakistani farms"\n' +
      '• "We design custom websites for small businesses"\n' +
      '• "We run a women\'s fitness studio in Karachi"\n\n' +
      'This helps me design a relevant symbol for your logo:'
  );
  await logMessage(user.id, `Industry: ${industry}`, 'assistant');
  return STATES.LOGO_COLLECT_DESCRIPTION;
}

async function handleCollectDescription(user, message) {
  const description = (message.text || '').trim();
  if (!description || description.length < 5) {
    await sendWithMenuButton(
      user.phone_number,
      'Please describe what your business does in one sentence (minimum 5 characters):'
    );
    return STATES.LOGO_COLLECT_DESCRIPTION;
  }

  await saveLogoData(user, { description });

  await sendInteractiveButtons(
    user.phone_number,
    'What *style* do you want for your logo?\n\n' +
      '_Pick the vibe that fits your brand best:_',
    [
      { id: 'logo_style_modern', title: '⚡ Modern' },
      { id: 'logo_style_classic', title: '🏛 Classic' },
      { id: 'logo_style_luxury', title: '💎 Luxury' },
    ]
  );
  await logMessage(user.id, `Description: ${description}`, 'assistant');
  return STATES.LOGO_COLLECT_STYLE;
}

async function handleCollectStyle(user, message) {
  const btnId = message.buttonId || '';
  const styleMap = {
    logo_style_modern: 'modern',
    logo_style_classic: 'classic',
    logo_style_luxury: 'luxury',
    logo_style_playful: 'playful',
    logo_style_bold: 'bold',
  };

  let style = styleMap[btnId];

  // Allow text fallback
  if (!style) {
    const t = (message.text || '').toLowerCase();
    if (t.includes('modern') || t.includes('minimal')) style = 'modern';
    else if (t.includes('classic') || t.includes('traditional')) style = 'classic';
    else if (t.includes('luxury') || t.includes('premium')) style = 'luxury';
    else if (t.includes('playful') || t.includes('fun')) style = 'playful';
    else if (t.includes('bold') || t.includes('strong')) style = 'bold';
  }

  // Show second row if first didn't match
  if (!style && !message.buttonId) {
    await sendInteractiveButtons(
      user.phone_number,
      'Or choose another style:',
      [
        { id: 'logo_style_playful', title: '🎉 Playful' },
        { id: 'logo_style_bold', title: '💪 Bold' },
        { id: 'logo_style_modern', title: '⚡ Modern' },
      ]
    );
    return STATES.LOGO_COLLECT_STYLE;
  }

  if (!style) {
    await sendInteractiveButtons(
      user.phone_number,
      'Please pick a logo style:',
      [
        { id: 'logo_style_modern', title: '⚡ Modern' },
        { id: 'logo_style_classic', title: '🏛 Classic' },
        { id: 'logo_style_luxury', title: '💎 Luxury' },
      ]
    );
    return STATES.LOGO_COLLECT_STYLE;
  }

  await saveLogoData(user, { style });

  await sendWithMenuButton(
    user.phone_number,
    '🎨 *Brand Colors*\n\n' +
      'Do you have specific brand colors?\n\n' +
      'Examples: _Blue & Gold_, _#1a3a2a & #d4a843_, _Black White Red_\n\n' +
      'Type your colors — or type *skip* and we\'ll design the perfect palette for your industry:'
  );
  await logMessage(user.id, `Style: ${style}`, 'assistant');
  return STATES.LOGO_COLLECT_COLORS;
}

async function handleCollectColors(user, message) {
  const text = (message.text || '').trim();
  const brandColors = text.toLowerCase() === 'skip' ? null : text || null;

  await saveLogoData(user, { brandColors });

  await sendWithMenuButton(
    user.phone_number,
    '💡 *Symbol Idea* (optional)\n\n' +
      'Do you have a specific symbol or icon idea for your logo?\n\n' +
      'Examples:\n' +
      '• "A bee for my honey brand"\n' +
      '• "A leaf or tree for my organic store"\n' +
      '• "A lightning bolt for my tech brand"\n\n' +
      'Type your idea — or type *skip* and we\'ll design symbols from scratch:'
  );
  await logMessage(user.id, `Brand colors: ${brandColors || 'skipped'}`, 'assistant');
  return STATES.LOGO_COLLECT_SYMBOL;
}

async function handleCollectSymbol(user, message) {
  const text = (message.text || '').trim();
  const symbolIdea = text.toLowerCase() === 'skip' ? null : text || null;

  await saveLogoData(user, { symbolIdea });

  await sendInteractiveButtons(
    user.phone_number,
    '🖼 *Logo Background*\n\nWhat background do you want for your logo?',
    [
      { id: 'logo_bg_white', title: '⬜ White' },
      { id: 'logo_bg_transparent', title: '🔲 Transparent' },
      { id: 'logo_bg_black', title: '⬛ Black' },
    ]
  );
  await logMessage(user.id, `Symbol idea: ${symbolIdea || 'skipped'}`, 'assistant');
  return STATES.LOGO_COLLECT_BACKGROUND;
}

async function handleCollectBackground(user, message) {
  const btnId = message.buttonId || '';
  const bgMap = {
    logo_bg_white: 'white',
    logo_bg_transparent: 'transparent',
    logo_bg_black: 'black',
    logo_bg_colored: 'colored',
  };

  let background = bgMap[btnId];

  if (!background) {
    const t = (message.text || '').toLowerCase();
    if (t.includes('transparent')) background = 'transparent';
    else if (t.includes('white')) background = 'white';
    else if (t.includes('black')) background = 'black';
    else if (t.includes('color') || t.includes('brand')) background = 'colored';
  }

  if (!background) {
    await sendInteractiveButtons(
      user.phone_number,
      'Please pick a background:',
      [
        { id: 'logo_bg_white', title: '⬜ White' },
        { id: 'logo_bg_transparent', title: '🔲 Transparent' },
        { id: 'logo_bg_black', title: '⬛ Black' },
      ]
    );
    return STATES.LOGO_COLLECT_BACKGROUND;
  }

  await saveLogoData(user, { background });
  await logMessage(user.id, `Background: ${background}`, 'assistant');

  // Transition to idea generation
  return await generateAndShowIdeas(user, message);
}

/**
 * Generate 5 logo ideas and present as a friendly text message.
 * User picks by typing "1" through "5" — no buttons, conversational.
 */
async function generateAndShowIdeas(user, message) {
  const logoData = getLogoData(user);

  await sendTextMessage(
    user.phone_number,
    '✨ Sketching 5 unique logo concepts for your brand...\n\nGive me about 30-45 seconds — each one will be a completely different style ☕'
  );

  let ideas;
  try {
    ideas = await generateLogoIdeas({
      businessName: logoData.businessName,
      industry: logoData.industry,
      description: logoData.description,
      style: logoData.style,
      brandColors: logoData.brandColors,
      symbolIdea: logoData.symbolIdea,
    });
  } catch (err) {
    logger.error('[LOGO-GEN] Idea generation failed:', err);
    await sendTextMessage(
      user.phone_number,
      '⚠️ Something went wrong while generating concepts.\n\nReply *retry* to try again, or *menu* to go back.'
    );
    return STATES.LOGO_SELECT_IDEA;
  }

  await saveLogoData(user, { ideas });

  // Build a rich, conversational text message with full concept details
  const conceptText = ideas.map((idea, i) =>
    `*${i + 1}. ${idea.title}* — _${idea.logoType}_\n${idea.description}`
  ).join('\n\n────────\n\n');

  await sendTextMessage(
    user.phone_number,
    `🎨 *Here are 5 logo concepts for ${logoData.businessName}:*\n\n${conceptText}\n\n────────\n\n` +
      `Reply with the *number* (1-5) of the concept you want me to design ✨`
  );

  await logMessage(user.id, '5 logo concepts generated and presented', 'assistant');
  return STATES.LOGO_SELECT_IDEA;
}

async function handleSelectIdea(user, message) {
  const listId = message.listId || message.buttonId || '';
  const text = (message.text || '').trim().toLowerCase();
  const logoData = getLogoData(user);

  // Handle retry triggers
  if (listId === 'logo_retry_ideas' || text === 'retry') {
    return await generateAndShowIdeas(user, message);
  }

  if (listId === 'back_menu' || text === 'menu') {
    const { handleWelcome } = require('./welcome');
    return handleWelcome(user, message);
  }

  // Parse idea selection from either:
  //   1. Legacy button/list ID: "logo_idea_2"
  //   2. Plain number text: "1", "2", "3", "4", "5"
  //   3. Text with number: "concept 3", "i pick 2", etc.
  let ideaIndex = null;

  const idMatch = listId.match(/^logo_idea_(\d+)$/);
  if (idMatch) {
    ideaIndex = parseInt(idMatch[1], 10);
  } else if (text) {
    const numMatch = text.match(/\b([1-9])\b/);
    if (numMatch) {
      ideaIndex = parseInt(numMatch[1], 10) - 1; // user types 1-based, internal is 0-based
    }
  }

  if (ideaIndex === null || ideaIndex < 0) {
    if (logoData.ideas && logoData.ideas.length > 0) {
      await sendTextMessage(
        user.phone_number,
        `Just reply with the *number* (1-${logoData.ideas.length}) of the concept you'd like me to design ✨\n\nOr type *retry* for new concepts, or *menu* to go back.`
      );
    }
    return STATES.LOGO_SELECT_IDEA;
  }

  const selectedIdea = logoData.ideas?.[ideaIndex];

  if (!selectedIdea) {
    await sendTextMessage(
      user.phone_number,
      `That number doesn't match any concept. Please pick between 1 and ${logoData.ideas?.length || 5}.`
    );
    return STATES.LOGO_SELECT_IDEA;
  }

  await saveLogoData(user, { selectedIdeaIndex: ideaIndex });

  await sendTextMessage(
    user.phone_number,
    `✨ *Designing: "${selectedIdea.title}"*\n` +
      `_${selectedIdea.logoType}_\n\n` +
      'Generating your logo — this takes 30-60 seconds.\n' +
      'I\'ll send it the moment it\'s ready! ☕'
  );
  await logMessage(user.id, `Selected logo concept: ${selectedIdea.title} (${selectedIdea.logoType})`, 'user');

  // ── Generate the logo ────────────────────────────────────────────────────
  let publicUrl;
  try {
    // Step 1: Expand the concept into a Gemini-ready brief
    const expandedPromptText = await expandLogoToPrompt(selectedIdea, {
      businessName: logoData.businessName,
      industry: logoData.industry,
      description: logoData.description,
      style: logoData.style,
      brandColors: logoData.brandColors,
      symbolIdea: logoData.symbolIdea,
    });

    const promptObj = { title: selectedIdea.title, prompt: expandedPromptText };

    // Step 2: Generate logo image with Gemini
    const { imageData, mimeType } = await generateLogoImage(promptObj, logoData.businessName, {
      industry: logoData.industry,
      description: logoData.description,
      style: logoData.style,
      brandColors: logoData.brandColors,
      background: logoData.background,
      logoType: selectedIdea.logoType,
    });

    // Step 3: Upload to Supabase Storage → public URL
    publicUrl = await uploadLogoImage(imageData, mimeType);
  } catch (err) {
    logger.error('[LOGO-GEN] Logo generation failed:', err.message);

    await sendInteractiveButtons(
      user.phone_number,
      '⚠️ Logo generation failed. This happens occasionally — let\'s try again.\n\nWhat would you like to do?',
      [
        { id: 'logo_retry_same', title: '🔄 Try Again' },
        { id: 'logo_back_ideas', title: '◀ Pick Different' },
        { id: 'back_menu', title: '📋 Back to Menu' },
      ]
    );
    return STATES.LOGO_RESULTS;
  }

  // ── Send the generated logo ──────────────────────────────────────────────
  const caption =
    `✅ *Your Logo is Ready!*\n\n` +
    `🏷 *Brand:* ${logoData.businessName}\n` +
    `✨ *Concept:* ${selectedIdea.title}\n` +
    `🎨 *Type:* ${selectedIdea.logoType}\n` +
    `\n_Powered by BytesPlatform_`;

  await sendImage(user.phone_number, publicUrl, caption);
  await logMessage(user.id, `Logo generated and sent: ${publicUrl}`, 'assistant');

  // Follow-up options
  await sendInteractiveButtons(
    user.phone_number,
    'What would you like to do next?',
    [
      { id: 'logo_generate_another', title: '🔄 New Concepts' },
      { id: 'logo_order_branding', title: '📦 Full Branding' },
      { id: 'back_menu', title: '📋 Back to Menu' },
    ]
  );

  return STATES.LOGO_RESULTS;
}

async function handleResults(user, message) {
  const btnId = message.buttonId || message.listId || '';
  const logoData = getLogoData(user);

  if (btnId === 'logo_retry_same') {
    const ideaIndex = logoData.selectedIdeaIndex ?? 0;
    const fakeMessage = { buttonId: `logo_idea_${ideaIndex}`, listId: `logo_idea_${ideaIndex}` };
    return handleSelectIdea(user, fakeMessage);
  }

  if (btnId === 'logo_back_ideas') {
    if (logoData.ideas && logoData.ideas.length > 0) {
      const conceptText = logoData.ideas.map((idea, i) =>
        `*${i + 1}. ${idea.title}* — _${idea.logoType}_\n${idea.description}`
      ).join('\n\n────────\n\n');

      await sendTextMessage(
        user.phone_number,
        `🎨 *Pick a different concept:*\n\n${conceptText}\n\n────────\n\n` +
          `Reply with the *number* (1-${logoData.ideas.length}) you'd like me to design ✨`
      );
      return STATES.LOGO_SELECT_IDEA;
    }
    return await generateAndShowIdeas(user, message);
  }

  if (btnId === 'logo_generate_another') {
    return handleStart(user, message);
  }

  if (btnId === 'logo_order_branding') {
    await sendTextMessage(
      user.phone_number,
      '📦 *Full Branding Package*\n\n' +
        'We can create a complete brand identity for you including:\n\n' +
        '• Master logo + variations (horizontal, stacked, mark only)\n' +
        '• Color palette + typography system\n' +
        '• Business card, letterhead, social media templates\n' +
        '• Brand guidelines PDF\n' +
        '• Source files (AI, SVG, PNG)\n\n' +
        'Let our team prepare a custom package for your brand!\n' +
        'Type anything to connect with our team.'
    );
    await logMessage(user.id, 'Interested in full branding package', 'user');
    return STATES.SALES_CHAT;
  }

  if (btnId === 'back_menu') {
    const { handleWelcome } = require('./welcome');
    return handleWelcome(user, message);
  }

  await sendInteractiveButtons(
    user.phone_number,
    'What would you like to do?',
    [
      { id: 'logo_generate_another', title: '🔄 New Concepts' },
      { id: 'logo_order_branding', title: '📦 Full Branding' },
      { id: 'back_menu', title: '📋 Back to Menu' },
    ]
  );
  return STATES.LOGO_RESULTS;
}

// Exported so serviceSelection.js can invoke it directly when the user
// picks the "Logo Maker" menu option. Skips collection states whose
// fields are already in the shared websiteData pool (Phase 11).
async function startLogoFlow(user) {
  return handleStart(user, null);
}

module.exports = { handleLogoGeneration, startLogoFlow };
