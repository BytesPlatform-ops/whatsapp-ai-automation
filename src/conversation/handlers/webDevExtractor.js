const { generateResponse } = require('../../llm/provider');
const { getConversationHistory } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { createSite } = require('../../db/sites');
const { sendTextMessage } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { logger } = require('../../utils/logger');
const { STATES } = require('../states');

const EXTRACT_PROMPT = `You are extracting structured business details from a WhatsApp conversation where a user is setting up a website.

Return ONLY a JSON object with any of these fields that the user has EXPLICITLY mentioned (not inferred, not guessed):
{
  "businessName": string,           // Only if user named their business
  "industry": string,               // Only if user stated their industry/niche (e.g. "salon", "restaurant", "tech")
  "services": string[],             // Services/products the user explicitly listed
  "email": string,                  // Valid email address
  "phone": string,                  // Phone number
  "address": string,                // Physical address
  "instagramHandle": string,        // Instagram handle, without the @
  "bookingUrl": string,             // Existing booking-tool URL (Fresha/Booksy/Vagaro/Calendly/etc.)
  "wantsNativeBooking": boolean     // true if user said they don't have a booking tool and want one built
}

CRITICAL RULES:
- OMIT any field the user has NOT clearly stated. Do NOT guess or invent.
- If the user says "salon business" or "it's a salon", industry is "Salon".
- Business name from something like "Nomi salon" → "Nomi Salon" (proper case).
- For services, split comma-separated lists and normalise ("hair cut" → "Hair Cut").
- If the user literally said "skip" / "no" / "none" for a field, OMIT it (don't set an empty string).
- Return ONLY the JSON. No commentary, no markdown fences.`;

const SALON_INDUSTRY_RE = /\b(salon|beauty|barber|spa|nail|hair|lash|brow|makeup)\b/i;

function isSalonIndustry(industry) {
  return !!industry && SALON_INDUSTRY_RE.test(industry);
}

function safeJsonParse(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/^```json\s*|^```\s*|```$/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  return null;
}

/**
 * Run the LLM extractor over recent conversation history (+ optional current
 * message) and merge any explicitly-mentioned fields into user.metadata.
 * Returns the updated websiteData object (also mutates on user.metadata in memory).
 */
async function extractAndFill(user, currentMessageText = '') {
  const existing = user.metadata?.websiteData || {};
  try {
    const history = await getConversationHistory(user.id, 20);
    const transcript = history
      .map((m) => `${m.role}: ${m.message_text}`)
      .join('\n');
    const currentLine = currentMessageText ? `\nuser (just now): ${currentMessageText}` : '';
    const userContent = `Conversation so far:\n${transcript}${currentLine}\n\nAlready collected: ${JSON.stringify(existing)}\n\nExtract any NEW explicitly-mentioned fields as JSON.`;

    const raw = await generateResponse(EXTRACT_PROMPT, [{ role: 'user', content: userContent }], {
      userId: user.id,
      operation: 'webdev_extract',
    });
    const parsed = safeJsonParse(raw) || {};

    const merged = { ...existing };
    if (typeof parsed.businessName === 'string' && parsed.businessName.trim().length >= 2 && !merged.businessName) {
      merged.businessName = parsed.businessName.trim();
    }
    if (typeof parsed.industry === 'string' && parsed.industry.trim().length >= 2 && !merged.industry) {
      merged.industry = parsed.industry.trim();
    }
    if (Array.isArray(parsed.services) && parsed.services.length > 0 && (!merged.services || merged.services.length === 0)) {
      merged.services = parsed.services.map((s) => String(s).trim()).filter(Boolean);
    }
    if (typeof parsed.phone === 'string' && /\d{6,}/.test(parsed.phone) && !merged.contactPhone) {
      merged.contactPhone = parsed.phone.trim();
    }
    if (typeof parsed.address === 'string' && parsed.address.trim().length >= 3 && !merged.contactAddress) {
      merged.contactAddress = parsed.address.trim();
    }
    if (typeof parsed.email === 'string' && /[\w.-]+@[\w.-]+\.\w+/.test(parsed.email)) {
      if (!merged.contactEmail) merged.contactEmail = parsed.email.trim();
    }
    if (typeof parsed.instagramHandle === 'string' && /^[\w.]{1,30}$/.test(parsed.instagramHandle.replace(/^@/, ''))) {
      if (!merged.instagramHandle) merged.instagramHandle = parsed.instagramHandle.replace(/^@/, '');
    }
    if (typeof parsed.bookingUrl === 'string' && /^https?:\/\/\S+/i.test(parsed.bookingUrl) && !merged.bookingMode) {
      merged.bookingMode = 'embed';
      merged.bookingUrl = parsed.bookingUrl.trim();
    } else if (parsed.wantsNativeBooking === true && !merged.bookingMode) {
      merged.bookingMode = 'native';
    }

    const metaPatch = { websiteData: merged };
    if (parsed.email && /[\w.-]+@[\w.-]+\.\w+/.test(parsed.email) && !user.metadata?.email) {
      metaPatch.email = parsed.email.trim();
    }

    await updateUserMetadata(user.id, metaPatch);
    user.metadata = { ...(user.metadata || {}), ...metaPatch };
    return merged;
  } catch (err) {
    logger.warn(`[webDevExtractor] extraction failed: ${err.message}`);
    return existing;
  }
}

/**
 * Ensure a site record exists once we have a business name — mirrors the
 * first-message behaviour of the old handleCollectName.
 */
async function ensureSiteRecord(user) {
  if (user.metadata?.currentSiteId) return;
  if (!user.metadata?.websiteData?.businessName) return;
  try {
    const site = await createSite(user.id, 'business-starter');
    await updateUserMetadata(user.id, { currentSiteId: site.id });
    user.metadata = { ...(user.metadata || {}), currentSiteId: site.id };
  } catch (err) {
    logger.warn(`[webDevExtractor] createSite failed: ${err.message}`);
  }
}

/**
 * Given the current websiteData + user.metadata.email, figure out which field
 * is still missing and send a short, conversational prompt for it. Returns
 * the next state the router should sit in.
 *
 * Copy tone rules:
 * - Mirror the user's style (brief, casual, no corporate filler).
 * - Acknowledge what we already know ("Got it, Nomi Salon — ...").
 * - Group related asks when natural ("drop your email, phone, and address").
 */
async function advanceWebDevFlow(user) {
  const wd = user.metadata?.websiteData || {};
  const phone = user.phone_number;
  const name = wd.businessName;
  const email = user.metadata?.email;

  if (!name) {
    await sendTextMessage(phone, "Let's build your site! What's the business called?");
    return STATES.WEB_COLLECT_NAME;
  }

  await ensureSiteRecord(user);

  if (!email) {
    await sendTextMessage(phone, `Nice, *${name}*! What's a good email for updates? (No worries if you'd rather skip it.)`);
    return STATES.WEB_COLLECT_EMAIL;
  }

  if (!wd.industry) {
    await sendTextMessage(phone, `Cool. And what line of work — salon, restaurant, tech, something else?`);
    return STATES.WEB_COLLECT_INDUSTRY;
  }

  if (!wd.services || wd.services.length === 0) {
    const hint = isSalonIndustry(wd.industry) ? ' e.g. hair cut, hair color, nails' : '';
    await sendTextMessage(phone, `Got it — ${wd.industry}. What do you offer?${hint} Just list them out.`);
    return STATES.WEB_COLLECT_SERVICES;
  }

  // Salon sub-flow
  if (isSalonIndustry(wd.industry)) {
    if (!wd.bookingMode) {
      await sendTextMessage(
        phone,
        "Quick one — do you already use a booking tool (Fresha, Booksy, Vagaro, Calendly)? Paste the link if you do, or let me know you don't and I'll build one in."
      );
      return STATES.SALON_BOOKING_TOOL;
    }
    if (!wd.instagramHandle && wd.instagramHandle !== null) {
      await sendTextMessage(phone, "What's your Insta handle? No worries if you don't have one.");
      return STATES.SALON_INSTAGRAM;
    }
    if (wd.bookingMode === 'native' && !wd.weeklyHours) {
      await sendTextMessage(
        phone,
        "What hours are you open? Something like *\"Tue-Sat 9-7, Sun-Mon closed\"* works. If you want me to use standard salon hours, type *default*."
      );
      return STATES.SALON_HOURS;
    }
    if (wd.bookingMode === 'native' && (wd.services || []).length > 0 && (!Array.isArray(wd.salonServices) || wd.salonServices.length === 0)) {
      await sendTextMessage(
        phone,
        `How long and how much for each? e.g. *"Haircut 30min €25, Colour 90min €85"*. Your services: ${wd.services.join(', ')}.\n\nIf you want me to use 30min with no price, type *default*.`
      );
      return STATES.SALON_SERVICE_DURATIONS;
    }
  }

  // Contact (phone/address — email already captured)
  const needsContact = !wd.contactPhone && !wd.contactAddress && !wd.contactEmail;
  if (needsContact) {
    await sendTextMessage(phone, "Last thing — drop your phone and address so I can put them on the site. No worries if you'd rather leave that for later.");
    return STATES.WEB_COLLECT_CONTACT;
  }

  // Everything filled — go to confirm
  return showConfirmSummary(user);
}

async function showConfirmSummary(user) {
  const { findOrCreateUser } = require('../../db/users');
  const fresh = await findOrCreateUser(user.phone_number, user.channel, user.via_phone_number_id);
  const wd = fresh.metadata?.websiteData || {};
  const servicesList = (wd.services || []).length > 0 ? wd.services.join(', ') : 'None';
  const contactBits = [wd.contactEmail || fresh.metadata?.email, wd.contactPhone, wd.contactAddress].filter(Boolean);
  const contactInfo = contactBits.length > 0 ? contactBits.join(' · ') : 'None';
  const bookingLine = wd.bookingMode === 'embed'
    ? `\n*Booking:* ${wd.bookingUrl || 'external link'}`
    : wd.bookingMode === 'native'
      ? `\n*Booking:* built-in${wd.weeklyHours ? ' · hours set' : ''}${Array.isArray(wd.salonServices) && wd.salonServices.length ? ` · ${wd.salonServices.length} priced services` : ''}`
      : '';
  const igLine = wd.instagramHandle ? `\n*Instagram:* @${wd.instagramHandle}` : '';

  const summary =
    `Here's what I've got:\n\n` +
    `*Name:* ${wd.businessName || '-'}\n` +
    `*Industry:* ${wd.industry || '-'}\n` +
    `*Services:* ${servicesList}` +
    bookingLine +
    igLine +
    `\n*Contact:* ${contactInfo}\n\n` +
    `Look right? Let me know if you want to change anything, or we can start building!`;
  await sendTextMessage(user.phone_number, summary);
  await logMessage(user.id, 'Showing confirmation summary', 'assistant');
  return STATES.WEB_CONFIRM;
}

module.exports = {
  extractAndFill,
  advanceWebDevFlow,
  showConfirmSummary,
  isSalonIndustry,
  ensureSiteRecord,
};
