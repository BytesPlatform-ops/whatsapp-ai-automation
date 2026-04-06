const {
  sendTextMessage,
  sendInteractiveButtons,
  sendCTAButton,
  downloadMedia,
} = require('../../messages/sender');
const { logMessage, getConversationHistory } = require('../../db/conversations');
const { updateUserMetadata, updateUserState } = require('../../db/users');
const { createSite, updateSite, getLatestSite } = require('../../db/sites');
const { logger } = require('../../utils/logger');
const { generateResponse } = require('../../llm/provider');
const { STATES } = require('../states');

async function handleWebDev(user, message) {
  switch (user.state) {
    case STATES.WEB_COLLECT_NAME:
      return handleCollectName(user, message);
    case STATES.WEB_COLLECT_INDUSTRY:
      return handleCollectIndustry(user, message);
    case STATES.WEB_COLLECT_SERVICES:
      return handleCollectServices(user, message);
    case STATES.WEB_COLLECT_COLORS:
      // Legacy: if a user is stuck in this state, skip to logo
      return STATES.WEB_COLLECT_LOGO;
    case STATES.WEB_COLLECT_LOGO:
      return handleCollectLogo(user, message);
    case STATES.WEB_COLLECT_CONTACT:
      return handleCollectContact(user, message);
    case STATES.WEB_CONFIRM:
      return handleConfirm(user, message);
    case STATES.WEB_GENERATING:
      return handleGenerating(user, message);
    case STATES.WEB_PREVIEW:
    case STATES.WEB_REVISIONS:
      return handleRevisions(user, message);
    default:
      return STATES.WEB_COLLECT_NAME;
  }
}

async function handleCollectName(user, message) {
  const businessName = (message.text || '').trim();
  if (!businessName || businessName.length < 2) {
    await sendTextMessage(user.phone_number, 'Please enter your business name:');
    return STATES.WEB_COLLECT_NAME;
  }

  // Create site record and save business name
  const site = await createSite(user.id, 'business-starter');
  await updateUserMetadata(user.id, {
    currentSiteId: site.id,
    websiteData: { businessName },
  });

  await sendTextMessage(
    user.phone_number,
    `Got it, *${businessName}*! What industry are you in? For example - tech, healthcare, ecommerce, real estate, creative, etc.`
  );
  await logMessage(user.id, `Business name: ${businessName}`, 'assistant');

  return STATES.WEB_COLLECT_INDUSTRY;
}

async function handleCollectIndustry(user, message) {
  let industry = message.listId
    ? message.text // Use the title from the list selection
    : (message.text || '').trim();

  if (!industry) {
    await sendTextMessage(user.phone_number, 'Please select or type your industry:');
    return STATES.WEB_COLLECT_INDUSTRY;
  }

  // If the user asks the bot to figure it out, infer from conversation context
  const inferPhrases = /figure.?it.?out|you.?tell.?me|i.?don.?t.?know|idk|from.?(the|my).?(idea|description|above|prev)|you.?already.?know|can.?t.?figure|same.?as/i;
  if (inferPhrases.test(industry)) {
    try {
      const history = await getConversationHistory(user.id, 10);
      const websiteData = user.metadata?.websiteData || {};
      const context = history.map(m => `${m.role}: ${m.message_text}`).join('\n');
      const inferred = await generateResponse(
        `Based on the conversation below and the business name "${websiteData.businessName || ''}", determine the most appropriate industry/niche for this business. Return ONLY the industry name (1-3 words, e.g. "Education", "Poetry & Literature", "Food & Beverage"). No explanation.\n\nConversation:\n${context}`,
        [{ role: 'user', content: industry }]
      );
      if (inferred && inferred.trim().length > 1) {
        industry = inferred.trim().replace(/^["']|["']$/g, '');
        await sendTextMessage(user.phone_number, `Got it - I'll go with *${industry}*!`);
      } else {
        await sendTextMessage(user.phone_number, "I couldn't figure that out from our conversation. Could you just type the industry? For example: tech, education, food, creative, etc.");
        return STATES.WEB_COLLECT_INDUSTRY;
      }
    } catch (error) {
      logger.error('Industry inference error:', error);
      await sendTextMessage(user.phone_number, "Could you just type the industry? For example: tech, education, food, creative, etc.");
      return STATES.WEB_COLLECT_INDUSTRY;
    }
  }

  await updateUserMetadata(user.id, {
    websiteData: { ...(user.metadata?.websiteData || {}), industry },
  });

  await sendTextMessage(
    user.phone_number,
    'What services or products do you offer? Just list them separated by commas.'
  );
  await logMessage(user.id, `Industry: ${industry}`, 'assistant');

  return STATES.WEB_COLLECT_SERVICES;
}

// Auto-assign professional color schemes based on industry
const INDUSTRY_COLORS = {
  tech:        { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' },
  technology:  { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' },
  software:    { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' },
  healthcare:  { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' },
  medical:     { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' },
  health:      { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#38BDF8' },
  finance:     { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#4A90D9' },
  banking:     { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#4A90D9' },
  real_estate: { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' },
  realestate:  { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' },
  property:    { primaryColor: '#2D3436', secondaryColor: '#1A1D1E', accentColor: '#B8860B' },
  ecommerce:   { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#A78BFA' },
  retail:      { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#A78BFA' },
  food:        { primaryColor: '#1C1917', secondaryColor: '#0C0A09', accentColor: '#D97706' },
  restaurant:  { primaryColor: '#1C1917', secondaryColor: '#0C0A09', accentColor: '#D97706' },
  education:   { primaryColor: '#1E3A5F', secondaryColor: '#0F2440', accentColor: '#60A5FA' },
  creative:    { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#8B5CF6' },
  design:      { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#8B5CF6' },
  legal:       { primaryColor: '#1C2833', secondaryColor: '#0D1B2A', accentColor: '#7F8C8D' },
  law:         { primaryColor: '#1C2833', secondaryColor: '#0D1B2A', accentColor: '#7F8C8D' },
  construction:{ primaryColor: '#2C3E50', secondaryColor: '#1A252F', accentColor: '#E67E22' },
  fitness:     { primaryColor: '#18181B', secondaryColor: '#09090B', accentColor: '#EF4444' },
  beauty:      { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#EC4899' },
  salon:       { primaryColor: '#1F2937', secondaryColor: '#111827', accentColor: '#EC4899' },
  automotive:  { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#DC2626' },
  travel:      { primaryColor: '#0F4C75', secondaryColor: '#0A2E4D', accentColor: '#06B6D4' },
};
const DEFAULT_COLORS = { primaryColor: '#1E293B', secondaryColor: '#0F172A', accentColor: '#6366F1' };

function getColorsForIndustry(industry) {
  const key = (industry || '').toLowerCase().replace(/[\s\-_\/]+/g, '_').trim();
  // Try exact match first, then partial match
  if (INDUSTRY_COLORS[key]) return INDUSTRY_COLORS[key];
  const match = Object.keys(INDUSTRY_COLORS).find(k => key.includes(k) || k.includes(key));
  return match ? INDUSTRY_COLORS[match] : DEFAULT_COLORS;
}

async function handleCollectServices(user, message) {
  const servicesText = (message.text || '').trim();
  if (!servicesText || servicesText.length < 2) {
    await sendTextMessage(
      user.phone_number,
      'Please list your services/products separated by commas, or say "skip" if you don\'t have specific services:'
    );
    return STATES.WEB_COLLECT_SERVICES;
  }

  const skipWords = /^(idk|i don'?t know|skip|none|no|n\/a|na|nah|nothing|not sure|no idea)$/i;
  const industry = user.metadata?.websiteData?.industry || '';
  const colors = getColorsForIndustry(industry);

  if (skipWords.test(servicesText)) {
    // User has no services — skip services page entirely
    await updateUserMetadata(user.id, {
      websiteData: { ...(user.metadata?.websiteData || {}), services: [], ...colors },
    });
    await sendTextMessage(
      user.phone_number,
      'No worries, we\'ll skip the services page! Do you have a logo? Send it as an image, or just say "skip" and we\'ll use a clean text logo.'
    );
    await logMessage(user.id, `Services: skipped | Colors auto-assigned for ${industry}`, 'assistant');
    return STATES.WEB_COLLECT_LOGO;
  }

  const services = servicesText.split(',').map((s) => s.trim()).filter(Boolean);

  await updateUserMetadata(user.id, {
    websiteData: { ...(user.metadata?.websiteData || {}), services, ...colors },
  });

  await sendTextMessage(
    user.phone_number,
    'Do you have a logo? Send it as an image, or just say "skip" and we\'ll use a clean text logo.'
  );
  await logMessage(user.id, `Services: ${services.join(', ')} | Colors auto-assigned for ${industry}`, 'assistant');

  // Skip color collection - go straight to logo
  return STATES.WEB_COLLECT_LOGO;
}

async function handleCollectLogo(user, message) {
  let logoData = null;

  if (message.type === 'image' && message.mediaId) {
    try {
      const media = await downloadMedia(message.mediaId);
      // Store as base64 in metadata (for small logos)
      logoData = `data:${media.mimeType};base64,${media.buffer.toString('base64')}`;
      await updateUserMetadata(user.id, {
        websiteData: { ...(user.metadata?.websiteData || {}), logo: logoData },
      });
    } catch (error) {
      logger.error('Logo download failed:', error);
    }
  }

  // Whether they sent a logo or skipped
  await sendTextMessage(
    user.phone_number,
    'Last thing - what contact info do you want on the site? Just send your email, phone, and/or address.'
  );
  await logMessage(user.id, logoData ? 'Logo uploaded' : 'Logo skipped', 'assistant');

  return STATES.WEB_COLLECT_CONTACT;
}

async function handleCollectContact(user, message) {
  const contactText = (message.text || '').trim();
  const skipWords = /^(nothing|none|no|skip|n\/a|na|nah|nope|don'?t|dont|no thanks)$/i;

  let contactData;
  if (!contactText || contactText.length < 3 || skipWords.test(contactText)) {
    contactData = { contactEmail: '', contactPhone: '', contactAddress: '' };
  } else {
    const emailMatch = contactText.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = contactText.match(/[\+]?[\d\s\-()]{7,}/);
    const addressMatch = contactText.replace(emailMatch?.[0] || '', '').replace(phoneMatch?.[0] || '', '').trim();

    contactData = {
      contactEmail: emailMatch?.[0] || '',
      contactPhone: phoneMatch?.[0]?.trim() || '',
      contactAddress: addressMatch || '',
    };
  }

  await updateUserMetadata(user.id, {
    websiteData: { ...(user.metadata?.websiteData || {}), ...contactData },
  });

  // Show confirmation summary before generating
  const wd = { ...(user.metadata?.websiteData || {}), ...contactData };
  const servicesList = (wd.services || []).length > 0 ? wd.services.join(', ') : 'None (skipped)';
  const contactInfo = [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean).join(' | ') || 'None';

  const summary =
    `Here's a summary of your website details:\n\n` +
    `*Business Name:* ${wd.businessName || '-'}\n` +
    `*Industry:* ${wd.industry || '-'}\n` +
    `*Services:* ${servicesList}\n` +
    `*Logo:* ${wd.logo ? 'Uploaded' : 'None (text logo)'}\n` +
    `*Contact:* ${contactInfo}\n\n` +
    `Does everything look good? You can say *"yes"* to proceed, or tell me what you'd like to change.`;

  await sendTextMessage(user.phone_number, summary);
  await logMessage(user.id, 'Contact info collected, showing confirmation', 'assistant');

  return STATES.WEB_CONFIRM;
}

async function handleConfirm(user, message) {
  const text = (message.text || '').trim().toLowerCase();
  const confirmWords = /^(yes|yeah|yep|yup|y|ok|okay|sure|go|looks good|lgtm|correct|perfect|proceed|generate|build|do it|let'?s go|go ahead)$/i;

  if (confirmWords.test(text)) {
    await sendTextMessage(
      user.phone_number,
      'Alright, give me about 30-60 seconds to build your site...'
    );
    await logMessage(user.id, 'Confirmed, generating website', 'assistant');
    return generateWebsite(user);
  }

  // User wants to change something — parse what they want to update
  const wd = user.metadata?.websiteData || {};

  // Check for specific field changes
  const nameChange = text.match(/(?:business\s*)?name\s*(?:to|:|should be|is)\s*(.+)/i);
  const industryChange = text.match(/industry\s*(?:to|:|should be|is)\s*(.+)/i);
  const servicesChange = text.match(/services?\s*(?:to|:|should be|are|change)\s*(.+)/i);
  const contactChange = text.match(/(?:contact|email|phone)\s*(?:to|:|should be|is)\s*(.+)/i);

  if (nameChange) {
    wd.businessName = nameChange[1].trim();
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated business name to *${wd.businessName}*. Anything else to change, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (industryChange) {
    wd.industry = industryChange[1].trim();
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated industry to *${wd.industry}*. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (servicesChange) {
    wd.services = servicesChange[1].split(',').map(s => s.trim()).filter(Boolean);
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated services to *${wd.services.join(', ')}*. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }
  if (contactChange) {
    const val = contactChange[1].trim();
    const emailMatch = val.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = val.match(/[\+]?[\d\s\-()]{7,}/);
    if (emailMatch) wd.contactEmail = emailMatch[0];
    if (phoneMatch) wd.contactPhone = phoneMatch[0].trim();
    const rest = val.replace(emailMatch?.[0] || '', '').replace(phoneMatch?.[0] || '', '').trim();
    if (rest) wd.contactAddress = rest;
    await updateUserMetadata(user.id, { websiteData: wd });
    await sendTextMessage(user.phone_number, `Updated contact info. Anything else, or say *"yes"* to proceed.`);
    return STATES.WEB_CONFIRM;
  }

  // Couldn't parse the change — ask them to be more specific
  await sendTextMessage(
    user.phone_number,
    'What would you like to change? You can say things like:\n\n' +
      '• "Name to MyBusiness"\n' +
      '• "Industry to Tech"\n' +
      '• "Services to Web Design, SEO, Branding"\n' +
      '• "Email to hello@example.com"\n\n' +
      'Or say *"yes"* to proceed with the current details.'
  );
  return STATES.WEB_CONFIRM;
}

async function generateWebsite(user) {
  try {
    const { generateWebsiteContent } = require('../../website-gen/generator');
    const { deployToNetlify } = require('../../website-gen/deployer');

    // Refresh user data to get full metadata
    logger.info(`[WEBGEN] Step 1/5: Fetching user data for ${user.phone_number}`);
    const { findOrCreateUser } = require('../../db/users');
    const freshUser = await findOrCreateUser(user.phone_number);
    const websiteData = freshUser.metadata?.websiteData || {};
    logger.info(`[WEBGEN] User data loaded:`, {
      businessName: websiteData.businessName,
      industry: websiteData.industry,
      hasLogo: !!websiteData.logo,
      hasContact: !!(websiteData.contactEmail || websiteData.contactPhone),
    });

    // 1. Generate content with LLM
    logger.info(`[WEBGEN] Step 2/5: Generating website content via LLM for "${websiteData.businessName}"`);
    const siteConfig = await generateWebsiteContent(websiteData);
    logger.info(`[WEBGEN] Content generated:`, {
      headline: siteConfig.headline,
      servicesCount: siteConfig.services?.length,
    });

    // 2. Deploy to Netlify
    logger.info(`[WEBGEN] Step 3/5: Deploying to Netlify...`);
    const { previewUrl, netlifySiteId, netlifySubdomain } = await deployToNetlify(siteConfig);
    logger.info(`[WEBGEN] Deployed successfully: ${previewUrl}`);

    // 3. Update site record
    logger.info(`[WEBGEN] Step 4/5: Updating site record in DB`);
    const siteId = freshUser.metadata?.currentSiteId;
    if (siteId) {
      await updateSite(siteId, {
        site_data: siteConfig,
        preview_url: previewUrl,
        netlify_site_id: netlifySiteId,
        netlify_subdomain: netlifySubdomain,
        status: 'preview',
      });
      logger.info(`[WEBGEN] Site record ${siteId} updated`);
    } else {
      logger.warn(`[WEBGEN] No currentSiteId found in user metadata - skipping DB update`);
    }

    // 4. Send preview link
    logger.info(`[WEBGEN] Step 5/5: Sending preview URL to user`);
    await sendTextMessage(
      user.phone_number,
      `Your website is ready! Here's the preview:\n\n${previewUrl}\n\nHave a look - it's a ${(websiteData.services||[]).length>0?'4-page site with Home, Services, About, and Contact pages':'3-page site with Home, About, and Contact pages'}.`
    );

    await logMessage(user.id, `Website deployed: ${previewUrl}`, 'assistant');
    logger.info(`[WEBGEN] ✅ Complete! Preview sent to ${user.phone_number}: ${previewUrl}`);

    // If coming from sales flow, return to sales to close the deal
    const returnToSales = user.metadata?.returnToSales;
    if (returnToSales) {
      await sendTextMessage(
        user.phone_number,
        "There you go! Have a look and let me know what you think — do you like it?"
      );
      await logMessage(user.id, 'Website preview sent, asking for feedback', 'assistant');
      return STATES.SALES_CHAT;
    }

    return STATES.WEB_REVISIONS;
  } catch (error) {
    logger.error('[WEBGEN] ❌ Website generation failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack,
    });

    await sendTextMessage(
      user.phone_number,
      '😔 Sorry, there was an issue generating your website. Our team has been notified.\n\n' +
        'Would you like to try again or chat with our team?'
    );
    await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
      { id: 'web_retry', title: '🔄 Try Again' },
      { id: 'svc_general', title: '💬 Chat with Us' },
    ]);
    await logMessage(user.id, 'Website generation failed', 'assistant');
    return STATES.WEB_GENERATION_FAILED;
  }
}

async function handleGenerating(user, message) {
  await sendTextMessage(
    user.phone_number,
    '⏳ Still generating your website... Please hold on a moment.'
  );
  return STATES.WEB_GENERATING;
}

async function handleGenerationFailed(user, message) {
  const buttonId = message.buttonId || '';

  // Route to general chat
  if (buttonId === 'svc_general') {
    await updateUserState(user.id, STATES.GENERAL_CHAT);
    const { handleGeneralChat } = require('./generalChat');
    return handleGeneralChat(user, message);
  }

  // Retry generation
  if (buttonId === 'web_retry') {
    await sendTextMessage(user.phone_number, '🔄 Let me try generating your website again...');
    return generateWebsite(user);
  }

  // Any other text - re-show the options
  await sendTextMessage(
    user.phone_number,
    '😔 Your website generation didn\'t complete. Would you like to try again?'
  );
  await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
    { id: 'web_retry', title: '🔄 Try Again' },
    { id: 'svc_general', title: '💬 Chat with Us' },
  ]);
  return STATES.WEB_GENERATION_FAILED;
}

async function handleRevisions(user, message) {
  const buttonId = message.buttonId || '';

  // Route svc_general to general chat (from error retry menu)
  if (buttonId === 'svc_general') {
    await updateUserState(user.id, STATES.GENERAL_CHAT);
    const { handleGeneralChat } = require('./generalChat');
    return handleGeneralChat(user, message);
  }

  if (buttonId === 'web_approve') {
    const siteId = user.metadata?.currentSiteId;
    if (siteId) await updateSite(siteId, { status: 'approved' });

    await sendTextMessage(
      user.phone_number,
      '🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., yourbusiness.com)'
    );
    await sendInteractiveButtons(user.phone_number, 'Custom domain?', [
      { id: 'domain_yes', title: 'Yes, set up domain' },
      { id: 'domain_no', title: 'No, maybe later' },
    ]);
    await logMessage(user.id, 'Website approved, offering custom domain', 'assistant');
    return STATES.DOMAIN_OFFER;
  }

  if (buttonId === 'web_restart') {
    await sendTextMessage(user.phone_number, 'No problem! Let\'s start fresh.\n\nWhat\'s your business name?');
    await logMessage(user.id, 'Restarting website creation', 'assistant');
    return STATES.WEB_COLLECT_NAME;
  }

  if (buttonId === 'web_retry') {
    await sendTextMessage(user.phone_number, '🔄 Let me try generating your website again...');
    return generateWebsite(user);
  }

  // Handle revision requests via LLM
  if (buttonId === 'web_revise' || message.text) {
    const revisionText = message.text || 'I want to make changes';

    // Only process free text if a website was actually generated
    if (!buttonId) {
      const site = await getLatestSite(user.id);
      if (!site?.preview_url) {
        // No website generated yet - don't treat free text as revision/approval
        await sendTextMessage(
          user.phone_number,
          '🤔 I don\'t have a generated website for you yet. Would you like to start over?'
        );
        await sendInteractiveButtons(user.phone_number, 'What would you like to do?', [
          { id: 'web_restart', title: '🔄 Start Over' },
          { id: 'svc_general', title: '💬 Chat with Us' },
        ]);
        return STATES.WEB_REVISIONS;
      }
    }

    if (buttonId === 'web_revise') {
      await sendTextMessage(
        user.phone_number,
        '✏️ Sure! Tell me what you\'d like to change. For example:\n\n' +
          '• "Change the headline to..."\n' +
          '• "Make the color scheme warmer"\n' +
          '• "Add a testimonials section"\n' +
          '• "Update the about text"'
      );
      await logMessage(user.id, 'User wants revisions', 'assistant');
      return STATES.WEB_REVISIONS;
    }

    // Process the revision request
    try {
      const { generateResponse } = require('../../llm/provider');
      const { REVISION_PARSER_PROMPT } = require('../../llm/prompts');
      const { deployToNetlify } = require('../../website-gen/deployer');
      const { findOrCreateUser } = require('../../db/users');

      const freshUser = await findOrCreateUser(user.phone_number);
      const site = await getLatestSite(user.id);
      const currentConfig = site?.site_data || freshUser.metadata?.websiteData || {};

      const response = await generateResponse(REVISION_PARSER_PROMPT, [
        { role: 'user', content: `Current config: ${JSON.stringify(currentConfig)}\n\nUser request: ${revisionText}` },
      ]);

      let updates;
      try {
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, response];
        updates = JSON.parse(jsonMatch[1]);
      } catch {
        await sendTextMessage(
          user.phone_number,
          'I\'m not sure what to change. Could you be more specific? For example:\n' +
            '"Change the color to blue" or "Update headline to: Your New Headline"'
        );
        return STATES.WEB_REVISIONS;
      }

      // User is happy with the website - treat as approval → offer custom domain
      if (updates._approved) {
        const siteId = user.metadata?.currentSiteId;
        if (siteId) await updateSite(siteId, { status: 'approved' });

        await sendTextMessage(
          user.phone_number,
          '🎉 *Awesome!* Your website is approved.\n\nWould you like to put it on your own custom domain? (e.g., yourbusiness.com)'
        );
        await sendInteractiveButtons(user.phone_number, 'Custom domain?', [
          { id: 'domain_yes', title: 'Yes, set up domain' },
          { id: 'domain_no', title: 'No, maybe later' },
        ]);
        await logMessage(user.id, 'Website approved, offering custom domain', 'assistant');
        return STATES.DOMAIN_OFFER;
      }

      if (updates._unclear) {
        await sendTextMessage(user.phone_number, updates._message);
        return STATES.WEB_REVISIONS;
      }

      // Merge updates and redeploy
      const updatedConfig = { ...currentConfig, ...updates };

      await sendTextMessage(user.phone_number, '🔄 Applying your changes and redeploying...');

      const { previewUrl, netlifySiteId, netlifySubdomain } = await deployToNetlify(updatedConfig);

      if (site) {
        await updateSite(site.id, { site_data: updatedConfig, preview_url: previewUrl, netlify_site_id: netlifySiteId, netlify_subdomain: netlifySubdomain });
      }

      await sendTextMessage(
        user.phone_number,
        `✅ Changes applied! Check out the updated preview:\n${previewUrl}`
      );

      await logMessage(user.id, `Revision applied, redeployed: ${previewUrl}`, 'assistant');
      return STATES.WEB_REVISIONS;
    } catch (error) {
      logger.error('Revision failed:', error);
      await sendTextMessage(
        user.phone_number,
        '😔 Sorry, I had trouble applying that change. Could you try rephrasing your request?'
      );
      return STATES.WEB_REVISIONS;
    }
  }

  return STATES.WEB_REVISIONS;
}

module.exports = { handleWebDev, handleGenerationFailed };
