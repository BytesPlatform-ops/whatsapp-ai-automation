// Location + document intercepts (Phase 14).
//
// WhatsApp users can share a location pin or upload a document (PDF,
// DOCX, etc.) at any point in the conversation. Before this phase
// those messages dropped through to state handlers that only knew
// how to read text and produced a "sorry, didn't catch that" reply.
//
// These handlers run as an early-gate in the router, BEFORE state
// dispatch. Each one:
//
//   Location:
//     1. Reverse-geocodes the coordinates via Nominatim.
//     2. If the user is mid-webdev at a state where city/address
//        would be useful, SEEDS websiteData.primaryCity +
//        contactAddress (without overwriting existing values) and
//        advances the flow naturally.
//     3. Otherwise, politely acknowledges with the detected city.
//
//   Document:
//     1. Records a reference in user.metadata.documents[] so an
//        admin can look it up later (media_id + filename + mime).
//     2. Acknowledges receipt.
//     3. Logs the full message in the conversations table so the
//        admin dashboard shows it inline.
//
// Both handlers are tolerant of geocoder / media-download failures
// so a flaky external service never leaves the user hanging with no
// acknowledgement.

const { sendTextMessage } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { logger } = require('../../utils/logger');
const { reverseGeocode } = require('../../utils/geocoder');
const { STATES } = require('../states');

// States where dropping a location pin should SEED webdev fields and
// advance the flow. Chosen because in each of these states the user
// is about to type an address or city anyway — the pin IS the answer.
const LOCATION_SEED_STATES = new Set([
  STATES.WEB_COLLECT_NAME,
  STATES.WEB_COLLECT_AREAS,
  STATES.WEB_COLLECT_CONTACT,
]);

/**
 * After a pin seeds fields, we're still in the same collection state
 * but the user needs to know what's next. This returns a short prompt
 * reflecting what's still missing, or an empty string when there's
 * nothing useful to add (caller sends just the seed ack).
 */
function buildPostPinFollowUp(state, wd) {
  if (state === STATES.WEB_COLLECT_AREAS) {
    // Without a resolved city, ask for it directly — the user will
    // typically reply with just the name ("Karachi") and
    // handleCollectAreas will parse it via its LLM fallback.
    if (!wd.primaryCity) {
      return 'Which city is that? Just type the name — include any neighborhoods you serve too, if you like.';
    }
    // Primary city is known. Ask for neighborhoods, matching the
    // phrasing used in questionForState when primaryCity is set.
    if (!Array.isArray(wd.serviceAreas) || wd.serviceAreas.length === 0) {
      return `Which areas / neighborhoods do you serve around *${wd.primaryCity}*? List them separated by commas, or just skip to use *${wd.primaryCity}* as the only area.`;
    }
    return '';
  }
  if (state === STATES.WEB_COLLECT_CONTACT) {
    const hasEmail = !!wd.contactEmail;
    const hasPhone = !!wd.contactPhone;
    // No address resolved from the pin. Acknowledge it and keep
    // moving — they can still add email/phone or skip.
    if (!wd.contactAddress) {
      if (!hasEmail && !hasPhone) {
        return "I couldn't auto-resolve a street address, but I've noted your location. Send your email or phone if you'd like those on the site, or reply *skip*.";
      }
      return "I couldn't auto-resolve a street address, but I've noted your location. Reply *skip* to move on or add anything else you want on the site.";
    }
    // Address is now set. Offer to collect the other contact fields or
    // skip straight to the summary.
    if (!hasEmail && !hasPhone) {
      return 'Anything else for the site — email or phone? Or reply *skip* to go with just the address.';
    }
    if (!hasEmail) {
      return 'Anything else — want to add an email? Or reply *skip* to move on.';
    }
    if (!hasPhone) {
      return 'Anything else — want to add a phone number? Or reply *skip* to move on.';
    }
    return '';
  }
  return '';
}

/**
 * Handle a WhatsApp location pin. Returns { handled: true, newState? }
 * when the caller (router) should return immediately.
 */
async function handleLocation(user, message) {
  const lat = Number(message?.latitude);
  const lon = Number(message?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { handled: false };
  }

  // Log the raw location inbound so the admin page shows it alongside
  // the geocoded response below.
  await logMessage(
    user.id,
    `[Location pin dropped: ${lat.toFixed(5)}, ${lon.toFixed(5)}]`,
    'user'
  ).catch(() => {});

  const geo = await reverseGeocode({ latitude: lat, longitude: lon });

  // ── Graceful fallback when geocoding is unavailable ──────────────
  if (!geo) {
    // If the user is mid-webdev at a seed state, still advance the
    // flow: record the pin on websiteData (so downstream prompts can
    // suppress redundant "tap 📎" tips) and emit a state-aware
    // follow-up asking for the city / email / phone as appropriate.
    if (LOCATION_SEED_STATES.has(user.state)) {
      const wd = { ...(user.metadata?.websiteData || {}) };
      wd.pinDropped = { latitude: lat, longitude: lon, at: new Date().toISOString() };
      await updateUserMetadata(user.id, { websiteData: wd });
      user.metadata = { ...(user.metadata || {}), websiteData: wd };
      const followUp = buildPostPinFollowUp(user.state, wd);
      const head = "Got your pin — I couldn't auto-detect the city from those coordinates.";
      const msg = followUp ? `${head}\n\n${followUp}` : head;
      // sendTextMessage auto-logs via the sender facade — calling
      // logMessage here would create a duplicate row in conversations.
      await sendTextMessage(user.phone_number, msg);
      logger.info(`[LOCATION] Geocode failed for ${user.phone_number} at state ${user.state}; recorded pin and asked for text fallback`);
      return { handled: true };
    }
    const msg = `Got your location (${lat.toFixed(4)}, ${lon.toFixed(4)}). I'll save the coordinates — let me know if there's anything specific you want done with them.`;
    await sendTextMessage(user.phone_number, msg);
    logger.info(`[LOCATION] Geocode unavailable for ${user.phone_number}; saved raw coords`);
    return { handled: true };
  }

  // ── State-aware seeding for webdev flows ─────────────────────────
  if (LOCATION_SEED_STATES.has(user.state)) {
    const wd = { ...(user.metadata?.websiteData || {}) };
    const seeded = [];

    // Only seed fields that are currently empty — never overwrite a
    // value the user already typed in.
    if (!wd.primaryCity && geo.city) {
      wd.primaryCity = geo.city;
      seeded.push('city');
    }
    const addressForWd =
      geo.streetAddress
        ? [geo.streetAddress, geo.city, geo.region].filter(Boolean).join(', ')
        : geo.displayName;
    if (!wd.contactAddress && addressForWd) {
      wd.contactAddress = addressForWd;
      seeded.push('address');
    }
    // Record the pin regardless of what got seeded so downstream
    // prompts can tell "pin already dropped" from "no pin yet".
    wd.pinDropped = { latitude: lat, longitude: lon, at: new Date().toISOString() };
    await updateUserMetadata(user.id, { websiteData: wd });
    user.metadata = { ...(user.metadata || {}), websiteData: wd };

    if (seeded.length > 0) {
      const cityPart = geo.city ? ` based in *${geo.city}*` : '';
      const seedLine = seeded.includes('address')
        ? `Got your location${cityPart}. Saved the address for your site too.`
        : `Got your location${cityPart}.`;
      logger.info(`[LOCATION] Seeded ${seeded.join('+')} for ${user.phone_number} at state ${user.state}`);

      // Build a state-aware follow-up so the user isn't left wondering
      // what to say next. Without this, the handler just returns the
      // seed ack and the conversation stalls.
      const followUp = buildPostPinFollowUp(user.state, wd);
      const combined = followUp ? `${seedLine}\n\n${followUp}` : seedLine;
      // sendTextMessage auto-logs (sender facade); a manual logMessage
      // here would emit the seed-ack twice in the admin transcript.
      await sendTextMessage(user.phone_number, combined);
      return { handled: true };
    }
  }

  // ── Default: polite acknowledgement ──────────────────────────────
  const where = geo.city
    ? (geo.region ? `${geo.city}, ${geo.region}` : geo.city)
    : geo.displayName || 'that location';
  const msg = `Got your location: *${where}*. Let me know if you'd like me to use this for anything specific.`;
  await sendTextMessage(user.phone_number, msg);
  logger.info(`[LOCATION] Acked for ${user.phone_number}: ${where}`);
  return { handled: true };
}

/**
 * Handle an incoming document upload (PDF / DOCX / image-as-file /
 * etc.). Captures a reference in user.metadata.documents[] and
 * acknowledges receipt. Does NOT attempt to parse document content
 * — that's explicitly a v2 concern.
 */
async function handleDocument(user, message) {
  if (!message?.mediaId) return { handled: false };

  const doc = {
    mediaId: message.mediaId,
    filename: message.filename || null,
    mimeType: message.mimeType || null,
    caption: message.caption || null,
    receivedAt: new Date().toISOString(),
  };

  const existing = Array.isArray(user.metadata?.documents) ? user.metadata.documents : [];
  const updated = [...existing, doc];

  try {
    await updateUserMetadata(user.id, { documents: updated });
    user.metadata = { ...(user.metadata || {}), documents: updated };
  } catch (err) {
    logger.warn(`[DOC] Failed to persist document ref: ${err.message}`);
  }

  const label = doc.filename ? `*${doc.filename}*` : 'your document';
  const msg = `Thanks — got ${label}. I'll pass this to the team for review and come back to you soon.`;
  await sendTextMessage(user.phone_number, msg);

  // Log the inbound (with the document filename in message_text so
  // the admin conversation page shows it). The outbound ack is
  // auto-logged by sendTextMessage above — don't double-log it.
  await logMessage(
    user.id,
    `[Document uploaded: ${doc.filename || doc.mediaId} (${doc.mimeType || 'unknown type'})${doc.caption ? ` — caption: "${doc.caption}"` : ''}]`,
    'user'
  ).catch(() => {});
  logger.info(`[DOC] Received ${doc.filename || doc.mediaId} (${doc.mimeType}) from ${user.phone_number}`);

  return { handled: true };
}

module.exports = {
  handleLocation,
  handleDocument,
  LOCATION_SEED_STATES,
};
