'use strict';

// WhatsApp Message Template re-engagement ladder.
//
// The ONLY Meta-compliant way to reach a lead AFTER the 24h customer-service
// window: an approved Message Template. This ladder targets leads who went
// quiet past the window and stated an intent but didn't convert — sending a
// stage- + industry- + language-personalized template with quick-reply buttons.
// A tap arrives as a normal inbound (parser `case 'button'`), re-opening the
// window and handing the thread back to salesBot; "Stop these"/"Parar
// mensagens" classifies as notInterested → followupOptOut.
//
// INERT until TEMPLATE_REENGAGE_ENABLED=true (so nothing sends until the
// templates are APPROVED on both WABAs and we flip it on).
//
// Templates (provisioned by scripts/flows/provision-templates.js):
//   reengage_preview_day1/3/7  — {{1}}=industry, {{2}}=action  (intent/half-built)
//   reengage_golive_day1/3/7   — {{1}}=industry                (built, unpaid)

const https = require('https');
const { supabase } = require('../config/database');
const { logger } = require('../utils/logger');
const { updateUserMetadata } = require('../db/users');
const { logMessage } = require('../db/conversations');
const { runWithContext } = require('../messages/channelContext');
const { sendTemplateMessage } = require('../messages/whatsappSender');

const GRAPH = 'https://graph.facebook.com/v22.0';
const WA_24H_MS = 24 * 60 * 60 * 1000;

function token() {
  return process.env.META_FLOW_TOKEN || process.env.META_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
}
function enabled() {
  return process.env.TEMPLATE_REENGAGE_ENABLED === 'true' || process.env.TEMPLATE_REENGAGE_ENABLED === '1';
}

// day1=24h (just past the window), day3=72h, day7=168h — anchored on last inbound.
const LADDER = [
  { step: 'tpl_day1', afterHours: 24,  day: 'day1' },
  { step: 'tpl_day3', afterHours: 72,  day: 'day3' },
  { step: 'tpl_day7', afterHours: 168, day: 'day7' },
];

// Funnel stage → template family + the {{2}} action phrase (preview family only;
// golive has no {{2}}). Action phrasing matches the approved templates' modal
// frame ("Can I {{2}}" / "Posso {{2}}") so it stays an infinitive.
const STAGES = {
  golive:    { family: 'golive' },
  halfbuilt: { family: 'preview', action: { en: 'finish your site',     pt_BR: 'terminar seu site' } },
  intent:    { family: 'preview', action: { en: 'build a free preview', pt_BR: 'criar uma prévia grátis' } },
};

// pt industry nouns for {{1}} ("seu site de imóveis"). en uses scheduler's
// industryLabel ("real estate" → "real estate website").
const IND_PT = {
  realestate: 'imóveis', salon: 'salão', hvac: 'serviços', restaurant: 'restaurante',
  portfolio: 'portfólio', ecommerce: 'loja online',
};

// ── classify the lead's funnel stage from metadata (priority: paid-path first) ──
function detectStage(m) {
  if (m.paymentLinkSentAt && !m.paymentConfirmed) return 'golive';
  const wd = m.websiteData || {};
  if ((wd.businessName || m.websiteDemoTriggered) && !m.paymentLinkSentAt) return 'halfbuilt';
  if (m.adReferral || (m.adIndustry && m.adIndustry !== 'generic')) return 'intent';
  return null;
}

function langCode(user) {
  const pl = String(user.metadata?.preferredLanguage || '').toLowerCase();
  return (pl.startsWith('pt') || pl.includes('portug')) ? 'pt_BR' : 'en';
}

// {{1}} value, language-specific. generic → bare "website"/"site".
function var1(industryKey, lang) {
  const k = String(industryKey || '').toLowerCase();
  if (lang === 'pt_BR') { const l = IND_PT[k]; return l ? `site de ${l}` : 'site'; }
  const { industryLabel } = require('./scheduler');
  const l = industryLabel(k);
  return l === 'business' ? 'website' : `${l} website`;
}

// ── approved-template gate (cached): only send (name,lang) APPROVED on the WABA
//    the lead's number belongs to. Falls back to en, else skips. ──
function httpGet(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    }).on('error', () => resolve({}));
  });
}
const _waba = new Map();      // phoneNumberId -> wabaId | null
const _approved = new Map();  // wabaId -> Set('name:lang')
function wabaIds() {
  return (process.env.TEMPLATE_WABA_IDS || '946247001439181,1264188285893289')
    .split(',').map((s) => s.trim()).filter(Boolean);
}
async function wabaForPhone(pnid) {
  if (!pnid) return null;
  const id = String(pnid);
  if (_waba.has(id)) return _waba.get(id);
  let found = null;
  for (const w of wabaIds()) {
    const j = await httpGet(`${GRAPH}/${w}/phone_numbers?fields=id&limit=100&access_token=${token()}`);
    if ((j.data || []).some((p) => String(p.id) === id)) { found = w; break; }
  }
  _waba.set(id, found);
  return found;
}
async function approvedSet(waba) {
  if (_approved.has(waba)) return _approved.get(waba);
  const j = await httpGet(`${GRAPH}/${waba}/message_templates?fields=name,language,status&limit=200&access_token=${token()}`);
  const set = new Set((j.data || []).filter((r) => r.status === 'APPROVED').map((r) => `${r.name}:${r.language}`));
  _approved.set(waba, set);
  return set;
}

/**
 * Run the template re-engagement ladder for one user. Self-gating + idempotent:
 * inert unless enabled, WhatsApp-only, past the 24h window, stated intent, not
 * converted/opted-out. Sends at most one template per pass. No-ops otherwise.
 */
async function processTemplateReengage(user) {
  if (!enabled() || !token()) return;
  if ((user.channel || 'whatsapp') !== 'whatsapp') return;

  const m = user.metadata || {};
  if (m.leadClosed || m.meetingBooked || m.paymentConfirmed || m.followupOptOut || m.humanTakeover) return;

  const stage = detectStage(m);
  if (!stage) return;

  // Anchor: last inbound. Must be PAST the 24h window (in-window leads are
  // handled by the free-form exploratory/email ladders).
  const { data: lastIn } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('user_id', user.id).eq('role', 'user')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!lastIn) return;
  const sinceMs = Date.now() - new Date(lastIn.created_at).getTime();
  if (sinceMs < WA_24H_MS) return;

  const elapsedHours = sinceMs / (1000 * 60 * 60);
  const completed = Array.isArray(m.templateSteps) ? m.templateSteps : [];
  let rung = null;
  for (let i = LADDER.length - 1; i >= 0; i--) {
    if (elapsedHours >= LADDER[i].afterHours && !completed.includes(LADDER[i].step)) { rung = LADDER[i]; break; }
  }
  if (!rung) return;

  const family = STAGES[stage].family;
  const name = `reengage_${family}_${rung.day}`;
  let lang = langCode(user);

  // Approved-template gate. Skip WITHOUT marking if not yet approved, so it
  // sends once Meta approves (cheap — the set is cached per process).
  const waba = await wabaForPhone(user.via_phone_number_id);
  if (!waba) return;
  const approved = await approvedSet(waba);
  if (!approved.has(`${name}:${lang}`)) {
    if (approved.has(`${name}:en`)) lang = 'en';
    else { logger.info(`[TPL-REENGAGE] ${name} not approved (${user.phone_number}) — waiting`); return; }
  }

  const { resolveLeadIndustryKey } = require('./scheduler');
  const { industryKey } = await resolveLeadIndustryKey(user);
  const v1 = var1(industryKey, lang);
  const params = family === 'preview' ? [v1, STAGES[stage].action[lang]] : [v1];

  try {
    await runWithContext(
      { channel: 'whatsapp', phoneNumberId: user.via_phone_number_id || null },
      () => sendTemplateMessage(user.phone_number, name, lang, params)
    );
  } catch (err) {
    logger.warn(`[TPL-REENGAGE] send failed ${name} → ${user.phone_number}: ${err.message}`);
    return; // don't mark — retry next cycle
  }

  // Mark this + earlier steps complete (don't retro-send a skipped step).
  const idx = LADDER.findIndex((r) => r.step === rung.step);
  const newCompleted = Array.from(new Set([...completed, ...LADDER.slice(0, idx + 1).map((r) => r.step)]));
  await updateUserMetadata(user.id, { templateSteps: newCompleted, lastTemplateReengageAt: new Date().toISOString() });
  try {
    const readable = family === 'preview'
      ? `Re-engagement (${stage}): your ${v1} — offered to ${STAGES[stage].action[lang]}`
      : `Re-engagement (${stage}): your ${v1} is ready to go live`;
    await logMessage(user.id, `[📤 ${name}] ${readable}`, 'assistant');
  } catch { /* non-fatal */ }

  logger.info(`[TPL-REENGAGE] Sent ${name} [${lang}] to ${user.phone_number} (stage=${stage}, industry=${industryKey}, ${elapsedHours.toFixed(0)}h quiet)`);
}

module.exports = {
  processTemplateReengage,
  // exported for tests
  detectStage, langCode, var1, LADDER, STAGES,
};
