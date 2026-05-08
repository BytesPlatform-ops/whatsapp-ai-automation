// CRM-style services form: web-based bulk entry for salon services or
// real-estate listings, replacing the painful chat loops. Bot generates a
// per-user token, sends the link, and we render either the salon or
// real-estate form based on the token's industry. On submit we write to
// user.metadata.websiteData (matching the shapes the website templates
// already consume), advance the state machine past the loop, and ping
// the user back on their channel.

const express = require('express');
const multer = require('multer');
const { logger } = require('../utils/logger');
const { supabase } = require('../config/database');
const { getActiveToken, markSubmitted } = require('../db/serviceFormTokens');
const { updateUserMetadata, updateUserState } = require('../db/users');
const { logMessage } = require('../db/conversations');
const { uploadListingPhoto } = require('../website-gen/listingPhotoUploader');
const { uploadSalonServicePhoto } = require('./photoUploader');
const { renderSalonForm } = require('./templates/salon');
const { renderRealEstateForm } = require('./templates/realEstate');
const { infoPage } = require('./templates/common');
const { STATES } = require('../conversation/states');

const router = express.Router();

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES, files: 30, fields: 200 },
});

async function fetchUser(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch user ${userId}: ${error.message}`);
  return data;
}

function htmlResponse(res, status, html) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
}

router.get('/services-form/:token', async (req, res) => {
  try {
    const row = await getActiveToken(req.params.token);
    if (!row) {
      return htmlResponse(res, 404, infoPage({
        title: 'Link not found',
        message: 'This link is invalid. Message us back on WhatsApp and we\'ll send a fresh one.',
      }));
    }
    if (row.submitted_at) {
      return htmlResponse(res, 200, infoPage({
        title: 'Already submitted',
        message: 'You\'ve already submitted this form. Head back to chat to keep going.',
      }));
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return htmlResponse(res, 410, infoPage({
        title: 'Link expired',
        message: 'This link has expired. Message us back on WhatsApp and we\'ll send a new one.',
      }));
    }
    const user = await fetchUser(row.user_id);
    const businessName = user?.metadata?.websiteData?.businessName || '';
    const html = row.industry === 'real_estate'
      ? renderRealEstateForm({ token: row.token, businessName })
      : renderSalonForm({ token: row.token, businessName });
    return htmlResponse(res, 200, html);
  } catch (err) {
    logger.error(`[SERVICES-FORM] GET failed: ${err.message}`);
    return htmlResponse(res, 500, infoPage({
      title: 'Something went wrong',
      message: 'Please refresh in a moment.',
    }));
  }
});

// Stitch text fields + uploaded photos into a flat array of row objects.
// Multer 2.x auto-parses bracket-notation TEXT fields (`services[0][name]`)
// into nested arrays — `body.services` arrives as `[{name,priceText,…},…]`.
// FILE fields keep their literal fieldname, so `req.files[N].fieldname` is
// still `services[0][photo]` and we attach by regex.
function collectRows(body, files, prefix) {
  const rowsByIdx = new Map();
  const nested = body && body[prefix];

  // Text fields: pull each row object out of the multer-parsed nested
  // structure. It can be an Array (most common) or a plain object keyed
  // by numeric strings (sparse rows after a remove).
  if (Array.isArray(nested)) {
    nested.forEach((row, idx) => {
      if (row && typeof row === 'object') rowsByIdx.set(idx, { ...row });
    });
  } else if (nested && typeof nested === 'object') {
    for (const [k, row] of Object.entries(nested)) {
      const idx = parseInt(k, 10);
      if (Number.isInteger(idx) && row && typeof row === 'object') {
        rowsByIdx.set(idx, { ...row });
      }
    }
  }

  // Trim string values inside each row.
  for (const row of rowsByIdx.values()) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string') row[k] = v.trim();
    }
  }

  // File fields: still flat-keyed by fieldname. Attach to the matching row.
  const fileRx = new RegExp(`^${prefix}\\[(\\d+)\\]\\[([a-zA-Z]+)\\]$`);
  for (const file of files || []) {
    const m = (file.fieldname || '').match(fileRx);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (!rowsByIdx.has(idx)) rowsByIdx.set(idx, {});
    rowsByIdx.get(idx).__photo = file;
  }

  return Array.from(rowsByIdx.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

function consentGranted(body) {
  const raw = (body?.consent_given || '').toString().trim();
  return /^(yes|true|on|1)$/i.test(raw);
}

async function uploadPhoto(file, kind) {
  if (!file || !file.buffer || !file.size) return null;
  try {
    const fn = kind === 'real_estate' ? uploadListingPhoto : uploadSalonServicePhoto;
    return await fn(file.buffer, file.mimetype || 'image/jpeg');
  } catch (err) {
    logger.warn(`[SERVICES-FORM] photo upload skipped (${kind}): ${err.message}`);
    return null;
  }
}

function parseSalonRows(rows) {
  const out = [];
  for (const row of rows) {
    const name = (row.name || '').toString().trim();
    if (!name) continue;
    const dur = parseInt(row.durationMinutes, 10);
    const priceText = (row.priceText || '').toString().trim();
    out.push({
      name: name.slice(0, 80),
      durationMinutes: Number.isFinite(dur) && dur > 0 ? Math.min(dur, 480) : 30,
      priceText: priceText.slice(0, 20) || '',
      __photo: row.__photo || null,
    });
  }
  return out;
}

function parseRealEstateRows(rows) {
  const out = [];
  for (const row of rows.slice(0, 3)) {
    const address = (row.address || '').toString().trim();
    if (!address) continue;
    const price = parseInt(row.price, 10);
    const beds = parseInt(row.beds, 10);
    const baths = parseFloat(row.baths);
    const sqft = parseInt(row.sqft, 10);
    const status = ['For Sale', 'Just Listed', 'Pending', 'Sold'].includes(row.status)
      ? row.status
      : 'For Sale';
    out.push({
      address: address.slice(0, 120),
      price: Number.isFinite(price) && price > 0 ? price : 0,
      currency: 'USD',
      beds: Number.isFinite(beds) ? beds : 3,
      baths: Number.isFinite(baths) ? baths : 2,
      sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : 1800,
      status,
      neighborhood: (row.neighborhood || '').toString().trim().slice(0, 60),
      __photo: row.__photo || null,
    });
  }
  return out;
}

async function handleSalonSubmit(user, parsed) {
  const services = [];
  for (const row of parsed) {
    const photoUrl = await uploadPhoto(row.__photo, 'salon');
    const entry = {
      name: row.name,
      durationMinutes: row.durationMinutes,
      priceText: row.priceText,
    };
    if (photoUrl) {
      entry.image = {
        url: photoUrl,
        photographer: '',
        photographerUrl: '',
        sourceUrl: '',
        unsplashUrl: '',
        dominantColor: null,
      };
    }
    services.push(entry);
  }
  const wd = { ...(user.metadata?.websiteData || {}) };
  const merged = {
    ...wd,
    services: services.map((s) => s.name),
    salonServices: services,
  };
  await updateUserMetadata(user.id, { websiteData: merged });
  // Form covers WEB_COLLECT_SERVICES + SALON_SERVICE_DURATIONS in one go.
  // The next chat-collection state in the salon ladder is SALON_BOOKING_TOOL
  // (booking tool + hours stay in chat by design — they're single-field, not
  // loopy). Land the user there so the bot picks up exactly there.
  await updateUserState(user.id, STATES.SALON_BOOKING_TOOL);
  await logMessage(user.id, `Form submitted: ${services.length} salon service(s)`, 'assistant');
  return services.length;
}

async function handleRealEstateSubmit(user, parsed) {
  const listings = [];
  for (const row of parsed) {
    const photoUrl = await uploadPhoto(row.__photo, 'real_estate');
    listings.push({
      address: row.address,
      price: row.price,
      currency: row.currency,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
      status: row.status,
      photoUrl: photoUrl || null,
      neighborhood: row.neighborhood,
    });
  }
  const wd = { ...(user.metadata?.websiteData || {}) };
  const merged = {
    ...wd,
    listings,
    listingsAskAnswered: true,
    listingsDetailsDone: true,
    listingsFlowDone: true,
    listingsFormOffered: false,
    formAwaitingKind: null,
    formAwaitingToken: null,
  };
  await updateUserMetadata(user.id, { websiteData: merged });
  await logMessage(user.id, `Form submitted: ${listings.length} listing(s)`, 'assistant');
  return listings.length;
}

async function postSubmitNotify(user, kind, count) {
  const ack = kind === 'salon'
    ? `Got your ${count} service${count === 1 ? '' : 's'} — let's keep going.`
    : `Got your ${count} listing${count === 1 ? '' : 's'} — let's keep going.`;

  try {
    const refreshed = await fetchUser(user.id);
    if (!refreshed) return;
    const { runWithContext, setUserId } = require('../messages/channelContext');
    const { sendTextMessage: sendTxt } = require('../messages/sender');
    await runWithContext(
      { channel: refreshed.channel || 'whatsapp', phoneNumberId: refreshed.via_phone_number_id || null },
      async () => {
        setUserId(refreshed.id);
        await sendTxt(refreshed.phone_number, ack);
        if (kind === 'salon') {
          // Salon: state was set to SALON_BOOKING_TOOL by handleSalonSubmit.
          // Send the booking-tool question — the user's next reply lands in
          // handleSalonBookingTool.
          await sendTxt(
            refreshed.phone_number,
            'Do you already use a booking tool (Fresha, Booksy, Vagaro, Calendly, etc.)?\n\n' +
              '• If yes, just paste the link and we\'ll embed it on your site.\n' +
              '• If not, type *no* and we\'ll build a built-in booking system for you.'
          );
        } else {
          // Real-estate: smartAdvance computes nextMissingWebDevState (which
          // skips listings now that listingsFlowDone is true), sends its
          // question, and returns the new state for us to persist.
          const { smartAdvance } = require('../conversation/handlers/webDev');
          const newState = await smartAdvance(refreshed, { text: '', type: 'text' });
          if (newState) await updateUserState(refreshed.id, newState);
        }
      }
    );
  } catch (err) {
    logger.warn(`[SERVICES-FORM] post-submit continuation failed: ${err.message}`);
  }
}

router.post('/services-form/:token', upload.any(), async (req, res) => {
  try {
    const row = await getActiveToken(req.params.token);
    if (!row) {
      return htmlResponse(res, 404, infoPage({
        title: 'Link not found',
        message: 'This link is invalid.',
      }));
    }
    if (row.submitted_at) {
      return htmlResponse(res, 200, infoPage({
        title: 'Already submitted',
        message: 'This form has already been submitted.',
      }));
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return htmlResponse(res, 410, infoPage({
        title: 'Link expired',
        message: 'Message us back on WhatsApp for a fresh link.',
      }));
    }
    if (!consentGranted(req.body)) {
      return htmlResponse(res, 400, infoPage({
        title: 'Consent required',
        message: 'Please tick the privacy checkbox before submitting.',
      }));
    }
    const user = await fetchUser(row.user_id);
    if (!user) {
      return htmlResponse(res, 404, infoPage({
        title: 'Account not found',
        message: 'We couldn\'t find your account. Message us back on WhatsApp.',
      }));
    }

    const isSalon = row.industry !== 'real_estate';
    const rawRows = collectRows(req.body, req.files, isSalon ? 'services' : 'listings');
    const parsed = isSalon ? parseSalonRows(rawRows) : parseRealEstateRows(rawRows);
    if (parsed.length === 0) {
      return htmlResponse(res, 400, infoPage({
        title: 'Nothing submitted',
        message: 'Add at least one row before submitting.',
      }));
    }

    const count = isSalon
      ? await handleSalonSubmit(user, parsed)
      : await handleRealEstateSubmit(user, parsed);
    await markSubmitted(row.token);

    // Fire-and-forget the proactive notification so the user gets a
    // success response immediately even if WhatsApp is slow.
    postSubmitNotify(user, isSalon ? 'salon' : 'real_estate', count).catch((err) => {
      logger.warn(`[SERVICES-FORM] post-submit notify failed: ${err.message}`);
    });

    return htmlResponse(res, 200, infoPage({
      title: 'Saved',
      message: `Saved ${count} ${isSalon ? 'service' : 'listing'}${count === 1 ? '' : 's'}. Head back to WhatsApp — we'll continue from there.`,
      accent: '#16A34A',
    }));
  } catch (err) {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return htmlResponse(res, 413, infoPage({
        title: 'Photo too large',
        message: 'Each photo must be under 10MB. Try a smaller one and submit again.',
      }));
    }
    logger.error(`[SERVICES-FORM] POST failed: ${err.message}`);
    return htmlResponse(res, 500, infoPage({
      title: 'Something went wrong',
      message: 'Please try again in a moment.',
    }));
  }
});

module.exports = router;
