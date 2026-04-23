// Abuse response handler (Phase 13).
//
// Given a classified abuse category, decide what to say back, whether
// to silence the bot going forward (humanTakeover), whether to notify
// admin, and whether to route the user into the meeting-booking flow
// for gray-area intents.
//
// Called from the router's early-gate immediately after classifyAbuse.
// Returns { handled: boolean, newState?: string } — when handled is
// true the router should return without further processing.

const { sendTextMessage } = require('../messages/sender');
const { logMessage } = require('../db/conversations');
const { updateUserMetadata, updateUserState } = require('../db/users');
const { logger } = require('../utils/logger');
const { HARD_CATEGORIES } = require('./abuseDetector');

// Canned responses per category. Using templates (not LLM) for the
// serious categories is intentional — we don't want the model
// improvising when the topic is hate / threats / illegal.
const DECLINE_MESSAGES = {
  hate: "I'm not able to help with that. If there's a legitimate business or project I can help with, let me know.",
  threats: "I'm not able to help with that. If you need to reach a human, you can email bytesuite@bytesplatform.com.",
  phishing: "I can't help with building anything that impersonates another brand or collects credentials under false pretenses. If you have a legitimate business project, happy to help with that.",
  hacking: "I can't help with unauthorized access or security bypasses. If you want to build something for your OWN business, send a fresh message and I'll pick it up from there.",
  illegal: "I'm not able to help with that. Reach out to bytesuite@bytesplatform.com if you'd like to talk to someone on our team.",
  nsfw_declined: "That's outside what we build for — we focus on mainstream small-business websites, logos, ads, and chatbots. If you have a different project in mind, happy to help with that instead.",
};

const GRAY_AREA_PIVOT =
  "Sounds like this needs a quick conversation with the team rather than the standard flow. Let's set up a call so we can scope it properly.";

/**
 * Act on a classified category. Caller passes the classified category
 * from classifyAbuse. Returns { handled, newState }.
 *
 *   handled=true  → router returns immediately after this call.
 *                   A decline / pivot message has been sent.
 *   handled=false → category was 'clean'; caller continues normal flow.
 */
async function handleAbuseCategory(user, message, category) {
  if (!category || category === 'clean') {
    return { handled: false };
  }

  const isHard = HARD_CATEGORIES.has(category);

  // Log the classification for audit trail regardless of category.
  logger.info(`[ABUSE] Classified ${category} for ${user.phone_number} (user=${user.id})`);
  await logMessage(
    user.id,
    `[ABUSE DETECTOR] flagged as "${category}"`,
    'system'
  ).catch(() => {});

  // ── Gray area: pivot to meeting booking ────────────────────────────
  if (category === 'gray_area') {
    try {
      await sendTextMessage(user.phone_number, GRAY_AREA_PIVOT);
      await logMessage(user.id, GRAY_AREA_PIVOT, 'assistant');
      const { startScheduling } = require('./handlers/scheduling');
      const newState = await startScheduling(user, 'Custom service consultation');
      if (newState) {
        await updateUserState(user.id, newState);
      }
      return { handled: true, newState };
    } catch (err) {
      logger.error(`[ABUSE] Gray-area pivot failed: ${err.message}`);
      return { handled: true }; // don't fall through — user already got the pivot line
    }
  }

  // ── NSFW-legal: decline only, no takeover, no notify ───────────────
  if (category === 'nsfw_declined') {
    const reply = DECLINE_MESSAGES.nsfw_declined;
    await sendTextMessage(user.phone_number, reply);
    await logMessage(user.id, reply, 'assistant');
    return { handled: true };
  }

  // ── Hard categories: decline + silence bot + notify admin ──────────
  if (isHard) {
    const reply = DECLINE_MESSAGES[category] || DECLINE_MESSAGES.illegal;

    // 1. Send the decline BEFORE enabling takeover so the user isn't
    //    left in silence wondering what happened.
    try {
      await sendTextMessage(user.phone_number, reply);
      await logMessage(user.id, reply, 'assistant');
    } catch (err) {
      logger.warn(`[ABUSE] Sending decline failed for ${user.phone_number}: ${err.message}`);
    }

    // 2. Silence the bot. Future messages from this user will hit the
    //    humanTakeover gate in router and be logged only.
    try {
      await updateUserMetadata(user.id, {
        humanTakeover: true,
        abuseCategory: category,
        abuseAt: new Date().toISOString(),
      });
      if (user.metadata) {
        user.metadata.humanTakeover = true;
        user.metadata.abuseCategory = category;
        user.metadata.abuseAt = new Date().toISOString();
      }
      logger.info(`[ABUSE] Enabled humanTakeover for ${user.phone_number} (category=${category})`);
    } catch (err) {
      logger.error(`[ABUSE] Failed to enable takeover for ${user.phone_number}: ${err.message}`);
    }

    // 3. Notify admin (fire-and-forget — never block the reply).
    try {
      const { sendAbuseNotification } = require('../notifications/email');
      await sendAbuseNotification({
        userPhone: user.phone_number,
        userName: user.name || null,
        channel: user.channel || 'whatsapp',
        userId: user.id,
        category,
        messageText: message?.text || '',
      });
    } catch (err) {
      logger.warn(`[ABUSE] Admin notification failed: ${err.message}`);
    }

    return { handled: true };
  }

  // Unknown category — don't block, pass through.
  logger.warn(`[ABUSE] Unknown category "${category}" — passing through`);
  return { handled: false };
}

module.exports = { handleAbuseCategory };
