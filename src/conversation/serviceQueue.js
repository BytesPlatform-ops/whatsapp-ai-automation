// Phase 12: Multi-service queue.
//
// When a user message names 2+ queueable services in one breath
// ("I need a website AND a logo AND some ads"), we build a queue,
// start the first flow, and auto-transition to the next after each
// completes. Queue is stored as user.metadata.serviceQueue = string[]
// representing the services REMAINING after the one currently running.
//
// Only the four flows with clean entry+exit points are queueable —
// webdev, ad generation, logo, chatbot. Other services (seo audit,
// ecommerce pitch, app dev, marketing) drop the user into sales chat,
// which isn't a queue-advancing terminus.

const { updateUserMetadata } = require('../db/users');
const { sendTextMessage } = require('../messages/sender');
const { logMessage } = require('../db/conversations');
const { logger } = require('../utils/logger');
const { generateResponse } = require('../llm/provider');

const QUEUEABLE = new Set(['svc_webdev', 'svc_adgen', 'svc_logo', 'svc_chatbot']);

const SERVICE_LABELS = {
  svc_webdev: 'website',
  svc_adgen: 'ads',
  svc_logo: 'logo',
  svc_chatbot: 'chatbot',
};

/**
 * Detect whether `text` is asking for 2+ queueable services. Returns an
 * ordered array of unique svc_* ids (order matches the priority the user
 * wants them handled). Returns [] when the message isn't a plural-service
 * intent so callers can fall through to their single-service path.
 *
 * LLM-first classifier. A cheap keyword pre-filter skips the LLM when
 * the message clearly can't carry 2+ services (e.g. "hi there"). Every
 * message that passes the pre-filter is classified by the LLM so we
 * correctly handle negation ("forget the website, do a logo"), ownership
 * ("my friend already has a website"), and fuzzy phrasings ("set me up
 * with the whole package — site, brand, assistant").
 */
async function detectServiceQueue(text, userId) {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 8) return [];

  // Cheap keyword count to decide whether the LLM call is worth making.
  // Single-service messages ("i need a website") don't need the LLM —
  // they're handled by the existing single-service paths downstream.
  if (countServiceKeywordHits(raw) < 2) return [];

  const prompt = `The user is interacting with a business chatbot that offers multiple services. Their message may request ONE service, MULTIPLE services, or NONE. Classify which of these queueable services they are asking you to HANDLE right now, in the order they want them handled.

Queueable services (return only these ids):
- svc_webdev: build a new website
- svc_adgen: generate marketing ad images for social media
- svc_logo: design a brand logo
- svc_chatbot: build an AI chatbot for the business

Rules:
- Include a service ONLY if the user is asking you to DO it for them now. Exclude services they already have, already own, already built, or are describing in passing.
- Handle negation/switching. "Forget the website, do a logo and some ads" → ["svc_logo","svc_adgen"] (exclude the thing they're dropping).
- Ordering matters — preserve the order they mention or imply. If they list "website, logo, ads", return them in that order.
- If fewer than 2 queueable services are being requested, return {"services": []} — the single-service path handles the rest.
- Only return ids from the list above. Do NOT invent ids.

User message: "${raw.replace(/"/g, '\\"').slice(0, 400)}"

Return ONLY valid JSON: {"services": ["svc_...", "svc_..."]} — may be empty array.`;

  try {
    const resp = await generateResponse(
      prompt,
      [{ role: 'user', content: 'Classify the services now.' }],
      { userId, operation: 'service_queue_detect', timeoutMs: 10_000 }
    );
    const m = String(resp || '').match(/\{[\s\S]*?\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    const arr = Array.isArray(parsed?.services) ? parsed.services : [];
    const cleaned = arr
      .filter((id) => typeof id === 'string' && QUEUEABLE.has(id))
      .filter((id, i, a) => a.indexOf(id) === i); // dedupe preserving order
    return cleaned.length >= 2 ? cleaned : [];
  } catch (err) {
    logger.warn(`[QUEUE] LLM detection failed, skipping queue: ${err.message}`);
    return [];
  }
}

/**
 * Cheap pre-filter: how many distinct queueable-service keywords appear
 * in the text? Intentionally loose — a false positive here just means
 * we make an LLM call that returns []. A false NEGATIVE means we miss a
 * legitimate plural request. So prefer broader keyword coverage.
 *
 * Returns a count (0, 1, 2, 3, 4). Used only to gate the LLM call —
 * NOT to classify intent.
 */
function countServiceKeywordHits(raw) {
  const checks = [
    /\b(websites?|web ?dev|sites?|redesign|web\s*presence|online\s*presence)\b/i,
    /\b(logos?|brand\s*mark|wordmark|logo\s*maker|branding|brand\s*design|brand\s*identity|\bbrand\b)\b/i,
    /\b(ads?|ad\s*gen|ad\s*images?|marketing\s*ads?|social\s*(?:media\s*)?ads?|creatives?|ad\s*campaigns?)\b/i,
    /\b(chat\s?bots?|ai\s*assistants?|ai\s*chat|virtual\s*assistants?|ai\s*agents?|assistants?)\b/i,
  ];
  let n = 0;
  for (const rx of checks) if (rx.test(raw)) n++;
  return n;
}

/**
 * Kick off a freshly-detected service queue. Announces all services,
 * persists the tail (everything after the first) to metadata, and
 * dispatches the first flow via its startXFlow function. Returns the
 * state the first flow transitioned into — caller should updateUserState
 * if it differs from user.state.
 */
async function startServiceQueue(user, serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) return null;
  const queueable = serviceIds.filter((id) => QUEUEABLE.has(id));
  if (queueable.length === 0) return null;

  const [first, ...rest] = queueable;
  await updateUserMetadata(user.id, { serviceQueue: rest });
  user.metadata = { ...(user.metadata || {}), serviceQueue: rest };

  const labels = queueable.map((id) => SERVICE_LABELS[id] || id);
  const ack = buildQueueAck(labels);
  await sendTextMessage(user.phone_number, ack);
  await logMessage(user.id, ack, 'assistant');
  logger.info(`[QUEUE] Started service queue for ${user.phone_number}: ${queueable.join(', ')}`);

  return startServiceById(user, first);
}

function buildQueueAck(labels) {
  if (labels.length === 2) {
    return `Got it — I'll handle the *${labels[0]}* first, then the *${labels[1]}*. Starting with the ${labels[0]} now.`;
  }
  const head = labels.slice(0, -1).map((l) => `*${l}*`).join(', ');
  const tail = `*${labels[labels.length - 1]}*`;
  return `Got it — I'll handle the ${head}, and ${tail} one after the other. Starting with the ${labels[0]} now.`;
}

/**
 * Pop the next queued service and start it. Returns the new state, or
 * null when the queue is empty — caller should then fall back to its
 * normal menu / welcome behavior.
 *
 * `reason`: 'completed' (default) when the previous flow wrapped
 * naturally, 'skipped' when the user abandoned it. Controls the
 * transition message wording.
 */
async function maybeStartNextQueuedService(user, reason = 'completed') {
  const queue = Array.isArray(user.metadata?.serviceQueue) ? user.metadata.serviceQueue : [];
  if (queue.length === 0) return null;

  const [next, ...rest] = queue;
  await updateUserMetadata(user.id, { serviceQueue: rest });
  user.metadata = { ...(user.metadata || {}), serviceQueue: rest };

  const label = SERVICE_LABELS[next] || 'next service';
  const msg = reason === 'skipped'
    ? `Got it, skipping ahead. Next up: *${label}*.`
    : `Nice — that's wrapped. Next up: *${label}*.`;
  await sendTextMessage(user.phone_number, msg);
  await logMessage(user.id, msg, 'assistant');
  logger.info(`[QUEUE] Advancing to ${next} (${reason}) for ${user.phone_number}; remaining=[${rest.join(',')}]`);

  return startServiceById(user, next);
}

/**
 * Dispatch to the right startXFlow for a single service id. Mirrors the
 * service-selection switch but is callable from any handler.
 */
async function startServiceById(user, svcId) {
  switch (svcId) {
    case 'svc_adgen': {
      const { startAdFlow } = require('./handlers/adGeneration');
      return startAdFlow(user);
    }
    case 'svc_logo': {
      const { startLogoFlow } = require('./handlers/logoGeneration');
      return startLogoFlow(user);
    }
    case 'svc_chatbot': {
      const { startChatbotFlow } = require('./handlers/chatbotService');
      return startChatbotFlow(user);
    }
    case 'svc_webdev': {
      // Webdev has no startWebdevFlow helper. Replicate service-selection's
      // webdev case, but honor shared business context so a user who
      // already gave a name doesn't get asked again.
      const { getSharedBusinessContext } = require('./entityAccumulator');
      const { sendWithMenuButton } = require('../messages/sender');
      const { STATES } = require('./states');
      const webDev = require('./handlers/webDev');
      const shared = getSharedBusinessContext(user);

      if (shared.businessName) {
        const wd = user.metadata?.websiteData || {};
        const nextState = webDev.nextMissingWebDevState(wd, user.metadata || {}) || STATES.WEB_CONFIRM;
        const question = webDev.questionForState(nextState, wd);
        await sendWithMenuButton(
          user.phone_number,
          `🌐 *Website Development*\n\nPicking up with *${shared.businessName}*.\n\n${question}`
        );
        await logMessage(user.id, `Started webdev with prefilled name=${shared.businessName}`, 'assistant');
        return nextState;
      }

      await sendWithMenuButton(
        user.phone_number,
        '🌐 *Website Development*\n\n' +
          "First, what's your *business name*?"
      );
      await logMessage(user.id, 'Starting website development flow (from queue)', 'assistant');
      return STATES.WEB_COLLECT_NAME;
    }
    default:
      logger.warn(`[QUEUE] Unknown service id ${svcId} — dropping from queue`);
      return null;
  }
}

/**
 * Clear any pending queue. Called from /reset and /menu so a fresh user
 * intent doesn't inherit yesterday's queued services.
 */
async function clearServiceQueue(user) {
  if (!user?.metadata?.serviceQueue || user.metadata.serviceQueue.length === 0) return;
  await updateUserMetadata(user.id, { serviceQueue: [] });
  user.metadata.serviceQueue = [];
}

/**
 * Whether the user has at least one service waiting in their queue.
 */
function hasQueue(user) {
  const q = user?.metadata?.serviceQueue;
  return Array.isArray(q) && q.length > 0;
}

/**
 * When the user targets a specific service mid-switch and that service
 * is already queued, slice the queue past that service so it doesn't
 * run twice. (User is essentially "jumping ahead" in the queue.)
 * Items BEFORE the target are dropped — the user skipped them.
 */
async function dropQueuedService(user, svcId) {
  const queue = Array.isArray(user?.metadata?.serviceQueue) ? user.metadata.serviceQueue : [];
  const idx = queue.indexOf(svcId);
  if (idx < 0) return; // target not in queue — leave as-is
  const trimmed = queue.slice(idx + 1);
  await updateUserMetadata(user.id, { serviceQueue: trimmed });
  user.metadata = { ...(user.metadata || {}), serviceQueue: trimmed };
}

module.exports = {
  detectServiceQueue,
  startServiceQueue,
  maybeStartNextQueuedService,
  clearServiceQueue,
  hasQueue,
  dropQueuedService,
  QUEUEABLE_SERVICES: [...QUEUEABLE],
  SERVICE_LABELS,
};
