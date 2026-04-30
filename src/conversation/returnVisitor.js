// Return-visitor recognition (Phase 15).
//
// When a user who has completed a prior project (website, logo, ad,
// chatbot, or SEO audit) comes back after a long gap, greet them by
// name and reference the past project instead of the generic
// "Hi! I'm Pixie. What can I help you with today?" opener. The goal
// is to make the bot feel like it remembers them, not like every
// conversation starts from scratch.
//
// Completion hooks across the service handlers write two metadata
// fields when a project finishes:
//   - lastBusinessName: the brand name for the completed project
//   - lastCompletedProjectType: 'website' | 'logo' | 'ad' | 'chatbot' | 'seo'
// Both are PRESERVED across /reset (unlike the rest of the flow
// state) so a user can reset their conversation and still get the
// return-greet next time.
//
// Call site: inside router._routeMessage, alongside the session-recap
// check and gated on recapFired so the two never double-fire. Recap
// handles users with in-progress context; return-greet handles users
// whose prior work is complete.

const { generateResponse } = require('../llm/provider');
const { STATES } = require('./states');
const { logger } = require('../utils/logger');
const { lastInboundGapMs, RECAP_GAP_MS } = require('./sessionRecap');

// States where a return-greet is eligible. Mid-flow states are
// excluded so we don't interrupt a user picking up where they left off
// (that's what the session recap is for).
const GREET_STATES = new Set([
  STATES.WELCOME,
  STATES.SALES_CHAT,
  STATES.SERVICE_SELECTION,
  STATES.INFORMATIVE_CHAT,
]);

const PROJECT_LABELS = {
  website: 'website',
  logo: 'logo',
  ad: 'ad',
  chatbot: 'chatbot',
  seo: 'SEO audit',
};

/**
 * Read the latest completed project from user metadata. Priority order
 * when a user has multiple:
 *   1. lastBusinessName / lastCompletedProjectType (set by completion
 *      hooks, preserved across /reset)
 *   2. websiteData.businessName (survives as long as user hasn't reset)
 *   3. logoData.businessName, adData.businessName, chatbotData.businessName
 *
 * Returns { type, businessName } or null when no past project is found.
 */
function getLatestCompletedProject(user) {
  const md = user?.metadata || {};

  // Primary: explicit completion markers (survives /reset).
  if (md.lastBusinessName && md.lastCompletedProjectType) {
    return {
      type: md.lastCompletedProjectType,
      businessName: String(md.lastBusinessName).trim(),
    };
  }

  // Fallbacks when the explicit fields aren't populated yet (e.g.
  // users who completed before Phase 15 shipped, or mid-flow users
  // whose work hasn't hit a completion hook).
  const wd = md.websiteData || {};
  if (wd.businessName) {
    return { type: 'website', businessName: wd.businessName };
  }
  const ld = md.logoData || {};
  if (ld.businessName && Array.isArray(ld.ideas) && ld.ideas.length > 0) {
    return { type: 'logo', businessName: ld.businessName };
  }
  const ad = md.adData || {};
  if (ad.businessName && Array.isArray(ad.ideas) && ad.ideas.length > 0) {
    return { type: 'ad', businessName: ad.businessName };
  }
  const cb = md.chatbotData || {};
  if (cb.businessName && md.chatbotTrialActivated) {
    return { type: 'chatbot', businessName: cb.businessName };
  }

  return null;
}

/**
 * If the user is returning after a long gap AND has a completed
 * project on record, build a contextual greeting. Returns the
 * greeting text or null.
 *
 * Caller constraints (mirror maybeBuildRecap):
 *   - Call AFTER findOrCreateUser (needs user.id, user.state).
 *   - Call BEFORE logMessage for the current turn so the gap query
 *     sees the PREVIOUS turn as "latest user message".
 *   - Skip silently on any failure.
 */
async function maybeBuildReturnGreeting(user) {
  if (!user || !user.id) return null;
  if (!GREET_STATES.has(user.state)) return null;

  const project = getLatestCompletedProject(user);
  if (!project) return null;

  const gap = await lastInboundGapMs(user.id);
  if (gap == null) return null;       // brand-new user, no prior inbound
  if (gap < RECAP_GAP_MS) return null; // still mid-session

  const label = PROJECT_LABELS[project.type] || 'project';
  const minutes = Math.round(gap / 60_000);

  const prompt = `You are Pixie, a friendly WhatsApp bot. A returning user just messaged you after ${minutes} minutes of silence. They've previously completed a ${label} with you for "${project.businessName}".

Write a SHORT, warm "welcome back" message that greets them by the business name and gently opens the door to what's next. Examples of the vibe (do NOT copy verbatim — write fresh):
- "hey! hows the ${project.businessName} ${label} treating you? anything you want to polish up, or ready to tackle something new?"
- "welcome back — ${project.businessName} still going strong? happy to help with tweaks or start something new whenever"

Rules:
- 1-2 sentences max, casual WhatsApp tone (lowercase is fine, contractions fine)
- Reference the business name by name
- Ask about their current state with the project OR what they want next — make them feel remembered
- Do NOT reintroduce yourself as Pixie (they already know you)
- Do NOT use em dashes (—) or en dashes (–); regular hyphens only
- Do NOT use emojis

Return just the greeting text. No quotes, no preamble.`;

  try {
    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Write the welcome-back greeting now.' }],
      { userId: user.id, operation: 'return_visitor_greet', timeoutMs: 12_000, model: 'gpt-5.4-nano' }
    );
    const text = String(response || '').trim();
    return text || null;
  } catch (err) {
    logger.warn(`[RETURN-GREET] LLM call failed for ${user.phone_number}: ${err.message}`);
    return null;
  }
}

/**
 * Record a project completion so future sessions can reference it.
 * Called from completion hooks in each service handler. Does NOT
 * overwrite an existing value with a null — only updates when the
 * new values are non-empty so callers can safely no-op if they
 * don't have a business name handy.
 */
async function markProjectCompleted(user, { type, businessName }) {
  if (!user?.id || !type || !businessName) return;
  const trimmed = String(businessName).trim();
  if (!trimmed) return;
  try {
    const { updateUserMetadata } = require('../db/users');
    await updateUserMetadata(user.id, {
      lastBusinessName: trimmed,
      lastCompletedProjectType: type,
      lastCompletedProjectAt: new Date().toISOString(),
    });
    if (user.metadata) {
      user.metadata.lastBusinessName = trimmed;
      user.metadata.lastCompletedProjectType = type;
      user.metadata.lastCompletedProjectAt = new Date().toISOString();
    }
    logger.info(`[RETURN-GREET] Marked ${type} completion for ${user.phone_number} (${trimmed})`);
  } catch (err) {
    logger.warn(`[RETURN-GREET] markProjectCompleted failed: ${err.message}`);
  }
}

module.exports = {
  maybeBuildReturnGreeting,
  getLatestCompletedProject,
  markProjectCompleted,
  GREET_STATES,
};
