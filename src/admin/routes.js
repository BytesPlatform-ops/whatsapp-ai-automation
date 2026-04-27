const express = require('express');
const crypto = require('crypto');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { DASHBOARD_PATH, getLoginHTML } = require('./template');
const queries = require('./queries');

const router = express.Router();

// ─── Auth helpers ──────────────────────────────
// ADMIN_SECRET is the HMAC key used to derive admin session tokens. If it
// isn't set in production we fail loudly at startup — a shared hardcoded
// constant lets anyone with a copy of the source forge admin sessions.
// In non-production envs we fall back to a dev default so local-only setups
// don't break, but log a loud warning so it's impossible to miss.
const ADMIN_SECRET = (() => {
  const fromEnv = env.admin.secret;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (env.nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error(
      '[ADMIN] ADMIN_SECRET is not set (or is <16 chars). Refusing to start in production — ' +
      'set a random string of 32+ chars in the ADMIN_SECRET env var. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  logger.warn(
    '[ADMIN] ADMIN_SECRET not set — using a dev-only fallback. Admin sessions in this process are ' +
    'NOT secure. Set ADMIN_SECRET (32+ chars) before deploying.'
  );
  return 'wa-bot-admin-DEV-ONLY';
})();

function makeToken(password) {
  return crypto.createHmac('sha256', ADMIN_SECRET).update(password).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_token;
  if (!token || !env.admin.password) return false;
  return token === makeToken(env.admin.password);
}

function authMiddleware(req, res, next) {
  if (req.path === '/login' || req.path === '/login/') return next();
  if (!isAuthenticated(req)) return res.redirect('/admin/login');
  next();
}

// ─── Auth routes ───────────────────────────────
router.use(authMiddleware);

// Parse URL-encoded form bodies for login
router.use(express.urlencoded({ extended: false }));

router.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect('/admin');
  res.send(getLoginHTML());
});

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== env.admin.password) {
    return res.send(getLoginHTML('Invalid password. Please try again.'));
  }
  const token = makeToken(password);
  res.setHeader('Set-Cookie', `admin_token=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=86400`);
  res.redirect('/admin');
});

router.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_token=; Path=/admin; HttpOnly; Max-Age=0');
  res.redirect('/admin/login');
});

// ─── Dashboard page ────────────────────────────
router.get('/', (req, res) => {
  res.sendFile(DASHBOARD_PATH);
});

// ─── API endpoints ─────────────────────────────
router.get('/api/overview', async (req, res) => {
  try {
    const data = await queries.getOverviewMetrics();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/leads', async (req, res) => {
  try {
    const data = await queries.getLeads();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Leads error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/domains', async (req, res) => {
  try {
    const data = await queries.getDomainRequests();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Domains error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/lead-summaries', async (req, res) => {
  try {
    const data = await queries.getLeadSummaries();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Lead summaries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/conversations/:userId', async (req, res) => {
  try {
    const data = await queries.getConversation(req.params.userId);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Conversation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/conversations/:userId/llm-usage', async (req, res) => {
  try {
    const { getUsageForUser } = require('../db/llmUsage');
    const data = await getUsageForUser(req.params.userId);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] LLM usage error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/conversations/:userId/reply', async (req, res) => {
  try {
    const { messageText } = req.body;
    if (!messageText || !messageText.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const { supabase } = require('../config/database');
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, phone_number, channel, via_phone_number_id')
      .eq('id', req.params.userId)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { logMessage } = require('../db/conversations');
    const { sendTextMessage } = require('../messages/sender');
    const { runWithContext } = require('../messages/channelContext');

    // Send on the same channel + WhatsApp number the user originally messaged
    // (via_phone_number_id keeps the reply in the customer's existing thread).
    // `instant: true` bypasses the 4-8s human-typing delay used for AI replies
    // — operator-sent messages should go out the moment Send is clicked.
    const trimmed = messageText.trim();
    try {
      await runWithContext(
        { channel: user.channel || 'whatsapp', phoneNumberId: user.via_phone_number_id || null },
        () => sendTextMessage(user.phone_number, trimmed, { instant: true })
      );
    } catch (sendErr) {
      // Surface Meta API errors clearly so the admin knows why the send
      // failed — a generic 500 with "Request failed with status 400"
      // isn't actionable.
      const metaCode = sendErr.response?.data?.error?.code;
      const metaMsg = sendErr.response?.data?.error?.message;
      const metaDetail = sendErr.response?.data?.error?.error_data?.details;

      // Lookup table of user-friendly translations for common Meta
      // WhatsApp Business error codes. Each returns a 409 so the UI
      // can show the structured detail.
      const META_ERROR_EXPLANATIONS = {
        100: {
          error: 'The original WhatsApp number for this conversation is no longer accepting messages.',
          detail: 'The phone_number_id on this user record was revoked or removed from the business account. Ask the user to send a fresh message so we can re-capture the current number.',
        },
        131005: {
          error: 'WhatsApp access denied — token or permission issue.',
          detail: 'Your WhatsApp access token either lacks the "whatsapp_business_messaging" permission, has expired, or is scoped to a different WABA than this phone number. In Meta Business Manager: (1) verify the phone number is assigned to this app, (2) regenerate the System User token with messaging permissions, and (3) update WHATSAPP_ACCESS_TOKEN in your .env.',
        },
        131026: {
          error: 'WhatsApp could not deliver the message.',
          detail: 'The recipient may have blocked your business number, unregistered from WhatsApp, or their number is invalid. Nothing you can do from here.',
        },
        131030: {
          error: "WhatsApp's 24-hour window is closed for this user.",
          detail: "The user hasn't messaged your business number in the last 24 hours, so WhatsApp won't deliver free-form replies. They need to send any message first, or we need an approved message template.",
        },
        131047: {
          error: 'Message could not be sent — user needs to re-engage.',
          detail: 'The 24h customer-service window has expired. Send an approved template to re-open the conversation.',
        },
        131051: {
          error: 'Unsupported message type for this recipient.',
          detail: "Meta refused the message format for this user. Try a plain text reply, or check whether the recipient's number supports the message type you're sending.",
        },
        190: {
          error: 'WhatsApp access token has expired.',
          detail: 'Regenerate your System User token in Meta Business Manager and update WHATSAPP_ACCESS_TOKEN in your .env, then restart the bot.',
        },
      };

      if (metaCode && META_ERROR_EXPLANATIONS[metaCode]) {
        const info = META_ERROR_EXPLANATIONS[metaCode];
        logger.warn(`[ADMIN] Reply blocked by Meta ${metaCode} (${info.error}) for ${user.phone_number}`);
        return res.status(409).json({
          ...info,
          metaCode,
          metaMessage: metaMsg,
          metaDetail,
        });
      }

      // Unknown Meta code — still surface the code and message so the
      // operator has SOMETHING to search for rather than a generic 500.
      if (metaCode) {
        logger.warn(`[ADMIN] Unknown Meta error ${metaCode} for ${user.phone_number}: ${metaMsg}`);
        return res.status(409).json({
          error: `WhatsApp rejected the send (code ${metaCode}).`,
          detail: metaDetail || metaMsg || 'No additional detail from Meta.',
          metaCode,
          metaMessage: metaMsg,
        });
      }

      throw sendErr; // truly unexpected — let the outer catch log + 500
    }

    // Log the outbound AFTER the send succeeds. Doing them in parallel (as
    // before) meant a failed send still left a phantom "sent" row in the
    // admin conversation view.
    await logMessage(user.id, trimmed, 'assistant', 'manual');

    logger.info(`[ADMIN] Manual reply sent to ${user.phone_number} (${user.channel}, via=${user.via_phone_number_id || 'default'}): "${messageText.trim().slice(0, 50)}..."`);
    res.json({ success: true });
  } catch (err) {
    logger.error('[ADMIN] Reply error:', err.response?.data?.error || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

router.post('/api/conversations/:userId/takeover', async (req, res) => {
  try {
    const { takeover } = req.body;
    const { updateUserMetadata } = require('../db/users');
    // On release, also drop any auto-flag metadata from the abuse detector
    // so the user's next clean turn doesn't immediately re-surface them
    // in the "auto-flagged" admin filter before strikes naturally reset.
    const patch = { humanTakeover: !!takeover };
    if (!takeover) patch.aiHandover = null;
    await updateUserMetadata(req.params.userId, patch);
    logger.info(`[ADMIN] ${takeover ? 'Takeover' : 'Release'} for user ${req.params.userId}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('[ADMIN] Takeover error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List users whose chats are currently paused — either because the abuse
// detector auto-flagged them (metadata.aiHandover.auto === true) OR an
// admin manually took over (metadata.humanTakeover === true). Used by the
// admin panel's "handover inbox" tile so operators can see at a glance
// who's waiting on human review.
router.get('/api/handover-users', async (_req, res) => {
  try {
    const { supabase } = require('../config/database');
    // PostgREST JSON operators on nested keys get fiddly — fetch the
    // recently-active slice and filter in JS. 300 users is plenty for
    // an inbox view; no single operator ever has more than a few
    // handfuls paused at once in practice.
    const { data, error } = await supabase
      .from('users')
      .select('id, phone_number, channel, metadata, updated_at')
      .order('updated_at', { ascending: false })
      .limit(300);
    if (error) throw error;

    const flagged = (data || []).filter((u) => {
      return !!u.metadata?.humanTakeover || u.metadata?.aiHandover?.state === 'paused';
    });

    const users = flagged.map((u) => ({
      id: u.id,
      phone: u.phone_number,
      channel: u.channel,
      auto: !!u.metadata?.aiHandover?.auto,
      reason: u.metadata?.aiHandover?.reason || null,
      flaggedAt: u.metadata?.aiHandover?.at || null,
      manualTakeover: !!u.metadata?.humanTakeover && !u.metadata?.aiHandover?.auto,
      updatedAt: u.updated_at,
    }));
    res.json({ users });
  } catch (err) {
    logger.error('[ADMIN] handover-users list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Feedback list + summary + per-row resolve action. Filters:
//   ?source=explicit|implicit|all
//   ?rating=loved|good|issues|all
//   ?flow=website|logo|ad|chatbot|seo|general|all
//   ?resolved=open|resolved|all  (default: all)
//   ?limit=N  (default 200, max 500)
router.get('/api/feedback', async (req, res) => {
  try {
    const filters = {
      source: req.query.source || 'all',
      rating: req.query.rating || 'all',
      flow: req.query.flow || 'all',
      resolved: req.query.resolved || 'all',
      limit: Math.min(parseInt(req.query.limit, 10) || 200, 500),
    };
    const data = await queries.getFeedback(filters);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Feedback list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/feedback/:id/resolve', async (req, res) => {
  try {
    const { resolved, notes } = req.body;
    const { supabase } = require('../config/database');
    const patch = {
      resolved: !!resolved,
      resolution_notes: notes || null,
      updated_at: new Date().toISOString(),
    };
    if (resolved) {
      patch.resolved_at = new Date().toISOString();
    } else {
      patch.resolved_at = null;
    }
    const { error } = await supabase.from('feedback').update(patch).eq('id', req.params.id);
    if (error) throw new Error(error.message);
    logger.info(`[ADMIN] Feedback ${req.params.id} marked ${resolved ? 'resolved' : 'reopened'}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('[ADMIN] Feedback resolve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/dropoffs', async (req, res) => {
  try {
    const data = await queries.getDropoffs();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Dropoffs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/funnel', async (req, res) => {
  try {
    const data = await queries.getFunnel();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Funnel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/sites', async (req, res) => {
  try {
    const data = await queries.getSites();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Sites error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/audits', async (req, res) => {
  try {
    const data = await queries.getAudits();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Audits error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/meetings', async (req, res) => {
  try {
    const data = await queries.getMeetings();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Meetings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send (or re-send) the Google Meet / Zoom join link to the lead's email.
// Reads the meeting row directly so the admin only has to click one button —
// no payload required beyond the meeting id.
router.post('/api/meetings/:id/send-link', async (req, res) => {
  try {
    const { supabase } = require('../config/database');
    const { sendMeetingLinkToLead } = require('../notifications/email');

    const { data: meeting, error } = await supabase
      .from('meetings')
      .select('id, name, phone_number, preferred_date, preferred_time, topic, join_url, invitee_email, reschedule_url, cancel_url')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!meeting.join_url) {
      return res.status(400).json({ error: 'This meeting has no join link on file (likely an in-person or phone meeting).' });
    }
    if (!meeting.invitee_email) {
      return res.status(400).json({ error: 'No email on file for this lead — Calendly did not capture one.' });
    }

    const sent = await sendMeetingLinkToLead({
      toEmail: meeting.invitee_email,
      leadName: meeting.name,
      joinUrl: meeting.join_url,
      topic: meeting.topic,
      dateStr: meeting.preferred_date,
      timeStr: meeting.preferred_time,
      rescheduleUrl: meeting.reschedule_url,
      cancelUrl: meeting.cancel_url,
    });

    if (!sent) {
      return res.status(502).json({ error: 'Email provider failed — check SendGrid config and logs.' });
    }
    res.json({ ok: true, sentTo: meeting.invitee_email });
  } catch (err) {
    logger.error('[ADMIN] Send meeting link error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/message-volume', async (req, res) => {
  try {
    const data = await queries.getMessageVolume();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Message volume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment & Revenue endpoints ──────────────
router.get('/api/payments', async (req, res) => {
  try {
    const data = await queries.getPayments();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Payments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/revenue', async (req, res) => {
  try {
    const data = await queries.getRevenue();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Revenue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/ad-attribution', async (req, res) => {
  try {
    const daysRaw = parseInt(req.query.days, 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : null;
    const data = await queries.getAdAttribution({ days });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Ad attribution error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/sales-prep', async (req, res) => {
  try {
    const data = await queries.getSalesPrep();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Sales prep error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/sales-prep/:userId/summary', async (req, res) => {
  try {
    const summary = await queries.generateLeadSummary(req.params.userId);
    res.json({ summary });
  } catch (err) {
    logger.error('[ADMIN] Generate summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/payments/sync', async (req, res) => {
  try {
    const { syncAllPendingPayments } = require('../payments/stripe');
    const result = await syncAllPendingPayments();
    res.json(result);
  } catch (err) {
    logger.error('[ADMIN] Payment sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Chatbot SaaS Admin ──────────────────────
const path = require('path');
const chatbotClients = require('../chatbot/db/clients');
const chatbotConversations = require('../chatbot/db/conversations');
const chatbotAnalytics = require('../chatbot/db/analytics');

router.get('/chatbot', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'chatbot', 'admin', 'dashboard.html'));
});

router.get('/api/chatbot/clients', async (req, res) => {
  try {
    const { status, tier, search } = req.query;
    const data = await chatbotClients.listClients({ status, tier, search });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot clients error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/clients/:clientId', async (req, res) => {
  try {
    const data = await chatbotClients.getClient(req.params.clientId);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot client detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/chatbot/clients/:clientId', async (req, res) => {
  try {
    const data = await chatbotClients.updateClient(req.params.clientId, req.body);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot client update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chatbot/clients/:clientId/activate', async (req, res) => {
  try {
    const data = await chatbotClients.updateClient(req.params.clientId, {
      status: 'active',
      activated_at: new Date().toISOString(),
    });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot activate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chatbot/clients/:clientId/pause', async (req, res) => {
  try {
    const data = await chatbotClients.updateClient(req.params.clientId, { status: 'paused' });
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot pause error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chatbot/clients/:clientId/cancel', async (req, res) => {
  try {
    const data = await chatbotClients.deactivateClient(req.params.clientId);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot cancel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/clients/:clientId/conversations', async (req, res) => {
  try {
    const data = await chatbotConversations.getConversationsByClient(req.params.clientId, 100);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot conversations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/clients/:clientId/analytics', async (req, res) => {
  try {
    const data = await chatbotAnalytics.getAnalyticsSummary(req.params.clientId, parseInt(req.query.days) || 30);
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chatbot/global', async (req, res) => {
  try {
    const data = await chatbotAnalytics.getGlobalAnalytics();
    res.json(data);
  } catch (err) {
    logger.error('[ADMIN] Chatbot global analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Settings (admin-managed pricing & flags) ─────────────────
// Read all rows from admin_settings + the schema describing what each
// key is for. The UI uses the schema to render labels, types, and
// help text without having to hardcode them.
const SETTINGS_SCHEMA = [
  {
    key: 'website_price',
    label: 'Website activation price (USD)',
    type: 'number',
    min: 1,
    fallback: 199,
    help: 'Base charge for activating a generated site. Stripe link, banner, and chat copy all read this.',
  },
  {
    key: 'website_discount_pct',
    label: 'Auto 22h discount (%)',
    type: 'number',
    min: 0,
    max: 90,
    fallback: 20,
    help: 'Percentage off the website portion automatically applied at 22h if still unpaid. Banner and follow-up message both use this.',
  },
  {
    key: 'revision_price',
    label: 'Custom-work / 3rd-revision floor (USD)',
    type: 'number',
    min: 1,
    fallback: 200,
    help: 'Quoted to users who exceed 2 free revisions or ask about minimum custom work. Used in chat and the cap pitch.',
  },
  {
    key: 'seo_floor_price',
    label: 'SEO / SMM floor (USD)',
    type: 'number',
    min: 1,
    fallback: 200,
    help: 'Lowest tier we sell for SEO and social-media work. Used in sales prompts, follow-up messages, and the day-30 upsell email.',
  },
];

router.get('/api/settings', async (req, res) => {
  try {
    const { listSettings } = require('../db/settings');
    const values = await listSettings();
    res.json({ schema: SETTINGS_SCHEMA, values });
  } catch (err) {
    logger.error('[ADMIN] Settings GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/settings', express.json(), async (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    const schema = SETTINGS_SCHEMA.find((s) => s.key === key);
    if (!schema) {
      // Unknown key — refuse rather than persist garbage. If a new
      // setting is added to the codebase, it goes in the schema first.
      return res.status(400).json({ error: `Unknown setting key: ${key}` });
    }
    let coerced = value;
    if (schema.type === 'number') {
      coerced = Number(value);
      if (!Number.isFinite(coerced)) {
        return res.status(400).json({ error: `${key} must be a number` });
      }
      if (schema.min != null && coerced < schema.min) {
        return res.status(400).json({ error: `${key} must be >= ${schema.min}` });
      }
      if (schema.max != null && coerced > schema.max) {
        return res.status(400).json({ error: `${key} must be <= ${schema.max}` });
      }
    }

    const { setSetting } = require('../db/settings');
    await setSetting(key, coerced, 'admin-panel');
    logger.info(`[ADMIN] Setting updated: ${key} = ${JSON.stringify(coerced)}`);
    res.json({ ok: true, key, value: coerced });
  } catch (err) {
    logger.error('[ADMIN] Settings POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
