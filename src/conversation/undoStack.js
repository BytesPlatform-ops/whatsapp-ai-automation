// Undo stack for the webdev collection flow.
//
// When the user says "wait go back" / "undo" / "previous step" mid-webdev,
// we pop the last collection state and send them back to it — showing their
// stored answer so they can change it or keep it. Router pushes the old
// state onto user.metadata.stateHistory on every transition (capped at 3),
// and calls handleUndo when an undo intent fires.

const { updateUserMetadata, updateUserState } = require('../db/users');
const { sendTextMessage } = require('../messages/sender');
const { logMessage } = require('../db/conversations');
const { logger } = require('../utils/logger');
const { generateResponse } = require('../llm/provider');
const { localize } = require('../utils/localizer');
const { STATES } = require('./states');

const MAX_HISTORY = 3;

// All webdev collection states the user can walk back into. Includes the
// salon sub-flow states (booking tool, IG, hours, service durations) so
// users deep in the salon flow can still undo. Real-estate listings detail
// loop is excluded — its per-item state is too fiddly to pop cleanly.
const UNDOABLE_STATES = new Set([
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_EMAIL,
  STATES.WEB_COLLECT_INDUSTRY,
  STATES.WEB_COLLECT_AREAS,
  STATES.WEB_COLLECT_AGENT_PROFILE,
  STATES.WEB_COLLECT_SERVICES,
  STATES.WEB_COLLECT_CONTACT,
  STATES.SALON_BOOKING_TOOL,
  STATES.SALON_HOURS,
  STATES.SALON_SERVICE_DURATIONS,
]);

/**
 * Classify a user message as an undo or keep intent using the LLM.
 * Returns 'undo' | 'keep' | 'none'. Uses a small focused prompt so the
 * call is fast and cheap, and the LLM handles natural phrasings that
 * regex can't enumerate ("actually let's revisit the industry", "nah,
 * back up a step", "the previous one is fine", etc.).
 *
 * `undoPending` = true when the user is currently sitting at a popped-to
 * state after an undo. 'keep' is only meaningful in that context.
 *
 * Returns 'none' on any LLM failure — never blocks the flow.
 */
async function classifyUndoOrKeep(text, { undoPending = false, userId } = {}) {
  const t = String(text || '').trim();
  if (!t) return 'none';
  // Long messages are almost certainly real answers (service lists,
  // descriptions, addresses), not undo/keep. Save the LLM call.
  if (t.length > 80) return 'none';

  const keepClause = undoPending
    ? `- "keep": user wants to leave the previously-stored answer as-is and move on. Match all of these patterns:
  • Direct keep: "keep", "same", "leave it", "fine", "it's fine", "nvm", "no change", "as is".
  • Implicit keep — user is referring to an answer they already gave and asking the bot to reuse it: "I already told you", "use what I gave you", "use the previous one", "use what I said before", "don't make me repeat", "you already have it", "same as before", "the previous one is fine", "leave the previous one". These mean "use the existing value" — that is exactly what "keep" does.
  • Equivalents in any language (Roman Urdu / Hindi / Spanish / Arabic) — read intent, not keywords.
This is VALID because the bot just asked "change it or keep it?".`
    : `- "keep": DO NOT return "keep". The user is NOT currently at a "change or keep it?" prompt, so "keep" isn't a valid classification right now.`;

  const undoPendingGuidance = undoPending
    ? `\n\nIMPORTANT context: the bot JUST popped back one step and asked "change it or keep it?". So the user's reply is most likely either "keep" (in any of the forms listed above) or a NEW VALUE for the field. Only return "undo" if the user explicitly asks to go back ANOTHER step (e.g., "go back further", "one more step back", "no, the one before that"). A reply that supplies a specific new value for any field — classify as "none", NOT "undo".`
    : '';

  const prompt = `The user is mid-conversation with a chatbot that's collecting info to build a website.

Classify the user's reply as ONE of:
- "undo": user wants to NAVIGATE BACK one step in the flow — return to the previous question with no specific new value supplied. Examples of pure-navigation undo: "wait go back", "let's revisit that", "one step back", "previous step please", "back up", "scratch that, take me back". The user is asking to RETURN to the previous question, not handing the bot a new value to apply.
${keepClause}
- "none": user is doing anything else — supplying a real answer, supplying a NEW VALUE for any field (even an earlier field), asking a question, going off-topic, etc.

CRITICAL — these are NOT undo, they are SKIP / DECLINE-CURRENT-QUESTION replies. ALWAYS classify as "none" — never as undo. The current handler decides what skip means in this context (most steps explicitly accept "skip" as an answer):
- "skip", "skip this", "skip it", "let's skip", "just skip", "skip krdo", "skip it for now", "i want to skip", "please skip"
- Equivalents in any language: "rehne do", "abhi nahi", "baad mein", "saltar", "passer".
A "skip" reply is the user moving FORWARD past the current question, not going back. Returning "undo" for "skip" sends the user backward into a step they already completed — the worst possible UX failure.

CRITICAL — these are NOT undo, they are EDIT-WITH-VALUE messages and must return "none" so the cross-state correction handler can apply the value:
- "actually the business name is X" / "the name is X, not Y" / "change the name to X" / "name should be X"
- "the industry is actually Y" / "change industry to Z"
- "we also do Q" / "remove R from services" / "add P to services"
- "the email is X" / "phone is Y" / "address is Z"
- "wait the contact number was X"
Even though these "correct an earlier answer", they carry a specific value — they are NOT navigate-back requests. Returning "undo" for these would HIJACK the message and the user's correction would be lost.${undoPendingGuidance}

The user said: "${t}"

Respond with ONLY one word: undo, keep, or none.`;

  try {
    const response = await generateResponse(
      prompt,
      [{ role: 'user', content: t }],
      { userId, operation: 'undo_classify' }
    );
    const clean = String(response || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (clean === 'undo') return 'undo';
    if (clean === 'keep' && undoPending) return 'keep';
    return 'none';
  } catch (err) {
    logger.warn(`[UNDO] LLM classify failed: ${err.message}`);
    return 'none';
  }
}

/**
 * Push the old state onto the user's undo history. Capped at MAX_HISTORY so
 * metadata doesn't grow unbounded. Only called for collection-state
 * transitions — we don't want to let the user undo back into SALES_CHAT
 * across a flow boundary.
 */
async function pushStateHistory(user, oldState) {
  if (!UNDOABLE_STATES.has(oldState)) return;
  const history = Array.isArray(user.metadata?.stateHistory)
    ? [...user.metadata.stateHistory]
    : [];
  // Don't push duplicates back-to-back (handler can legitimately return the
  // same state to keep re-asking; no reason to fill the stack with copies).
  if (history[history.length - 1] === oldState) return;
  history.push(oldState);
  while (history.length > MAX_HISTORY) history.shift();
  await updateUserMetadata(user.id, { stateHistory: history });
  user.metadata = { ...(user.metadata || {}), stateHistory: history };
}

// Human-readable label for each undo-able state (used in the "your X was
// Y — want to change or keep it?" prompt).
function fieldLabelForState(state) {
  switch (state) {
    case STATES.WEB_COLLECT_NAME: return 'your business name';
    case STATES.WEB_COLLECT_EMAIL: return 'your email';
    case STATES.WEB_COLLECT_INDUSTRY: return 'your industry';
    case STATES.WEB_COLLECT_AREAS: return 'your city / service areas';
    case STATES.WEB_COLLECT_AGENT_PROFILE: return 'your agent profile';
    case STATES.WEB_COLLECT_SERVICES: return 'your services';
    case STATES.WEB_COLLECT_CONTACT: return 'your contact info';
    case STATES.SALON_BOOKING_TOOL: return 'your booking setup';
    case STATES.SALON_HOURS: return 'your opening hours';
    case STATES.SALON_SERVICE_DURATIONS: return 'your service durations & prices';
    default: return null;
  }
}

// Format weekly hours for a short one-line display like
// "Mon-Fri 9-17, Sat 10-16". Days with no slots are omitted.
function formatWeeklyHoursShort(hours) {
  if (!hours || typeof hours !== 'object') return null;
  const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const lines = [];
  for (const [d, short] of Object.entries(DAY_SHORT)) {
    const slots = hours[d];
    if (!Array.isArray(slots) || slots.length === 0) continue;
    const text = slots.map((s) => `${s.open}-${s.close}`).join(', ');
    lines.push(`${short} ${text}`);
  }
  return lines.length ? lines.join(', ') : null;
}

// Extract the stored answer for a given state from metadata, formatted for
// display to the user. Returns null if nothing is stored.
function storedAnswerForState(state, metadata) {
  const wd = metadata?.websiteData || {};
  switch (state) {
    case STATES.WEB_COLLECT_NAME: return wd.businessName || null;
    case STATES.WEB_COLLECT_EMAIL: return wd.contactEmail || metadata?.email || null;
    case STATES.WEB_COLLECT_INDUSTRY: return wd.industry || null;
    case STATES.WEB_COLLECT_AREAS: {
      const city = wd.primaryCity;
      // Filter out the primary city from service-areas display so it
      // doesn't read "Austin: Austin, New York, Texas" when the
      // parser accidentally includes the city in its own areas list.
      const areas = (Array.isArray(wd.serviceAreas) ? wd.serviceAreas : [])
        .filter(Boolean)
        .filter((a) => !city || a.toLowerCase() !== city.toLowerCase());
      if (!city && areas.length === 0) return null;
      if (city && areas.length > 0) return `${city}: ${areas.join(', ')}`;
      return city || areas.join(', ');
    }
    case STATES.WEB_COLLECT_AGENT_PROFILE: {
      const parts = [];
      if (wd.brokerageName) parts.push(wd.brokerageName);
      if (wd.yearsExperience != null) parts.push(`${wd.yearsExperience} yrs`);
      if (Array.isArray(wd.designations) && wd.designations.length) parts.push(wd.designations.join(', '));
      return parts.length ? parts.join(' · ') : null;
    }
    case STATES.WEB_COLLECT_SERVICES: {
      const s = Array.isArray(wd.services) ? wd.services.filter(Boolean) : [];
      return s.length ? s.join(', ') : null;
    }
    case STATES.WEB_COLLECT_CONTACT: {
      const parts = [wd.contactEmail, wd.contactPhone, wd.contactAddress].filter(Boolean);
      return parts.length ? parts.join(' | ') : null;
    }
    case STATES.SALON_BOOKING_TOOL: {
      if (wd.bookingMode === 'embed') return `external link: ${wd.bookingUrl || '(set)'}`;
      if (wd.bookingMode === 'native') return 'built-in booking system';
      return null;
    }
    case STATES.SALON_HOURS:
      return formatWeeklyHoursShort(wd.weeklyHours);
    case STATES.SALON_SERVICE_DURATIONS: {
      const svc = Array.isArray(wd.salonServices) ? wd.salonServices : [];
      if (!svc.length) return null;
      const preview = svc.slice(0, 3).map((s) => {
        const price = s.priceText ? ` ${s.priceText}` : '';
        return `${s.name} ${s.durationMinutes}m${price}`;
      }).join(', ');
      return svc.length > 3 ? `${preview}…` : preview;
    }
    default: return null;
  }
}

/**
 * Execute an undo. Pops one state off the history, transitions the user
 * back to it, and sends a "your [field] was X — change it or keep it as
 * is?" prompt. Returns true if the undo was applied, false if there was
 * nothing to undo.
 */
async function handleUndo(user) {
  const history = Array.isArray(user.metadata?.stateHistory)
    ? [...user.metadata.stateHistory]
    : [];

  if (history.length === 0) {
    const msg = await localize(
      "Nothing to go back to — we haven't filled anything in yet.",
      user
    );
    await sendTextMessage(user.phone_number, msg);
    return false;
  }

  const prevState = history.pop();
  await updateUserMetadata(user.id, {
    stateHistory: history,
    // Mark that the user is sitting at a popped state. Router uses this to
    // recognize a "keep it" reply and advance without re-processing.
    undoPendingState: prevState,
  });
  user.metadata = {
    ...(user.metadata || {}),
    stateHistory: history,
    undoPendingState: prevState,
  };
  await updateUserState(user.id, prevState);
  user.state = prevState;

  const label = fieldLabelForState(prevState);
  const stored = storedAnswerForState(prevState, user.metadata);

  let msg;
  if (label && stored) {
    msg = `Sure, going back one step. ${label[0].toUpperCase()}${label.slice(1)} was *${stored}*. Want to change it, or reply *keep* to leave it as is.`;
  } else if (label) {
    msg = `Sure, going back to ${label}. What would you like it to be?`;
  } else {
    // Generic fallback — shouldn't happen for UNDOABLE_STATES but defensive.
    msg = `Sure, going back one step. What would you like to change?`;
  }

  const localized = await localize(msg, user);
  await sendTextMessage(user.phone_number, localized);
  await logMessage(user.id, `Undo: popped to ${prevState}`, 'assistant');
  logger.info(`[UNDO] ${user.phone_number} popped to ${prevState}`);
  return true;
}

/**
 * Clear the undoPendingState flag. Called after the user's next reply in
 * a popped state, whether they gave a new value or said "keep".
 */
async function clearUndoPending(user) {
  if (!user.metadata?.undoPendingState) return;
  await updateUserMetadata(user.id, { undoPendingState: null });
  user.metadata = { ...(user.metadata || {}), undoPendingState: null };
}

module.exports = {
  UNDOABLE_STATES,
  classifyUndoOrKeep,
  pushStateHistory,
  handleUndo,
  clearUndoPending,
  storedAnswerForState,
};
