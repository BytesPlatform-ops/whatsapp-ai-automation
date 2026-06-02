'use strict';

// Runtime localization of the Flow's UI strings into ANY language.
//
// The Flow is endpoint-driven, so every label/option/title is a string we
// return — meaning we can serve any language the user writes in, not just
// the hand-authored en/pt. When we encounter a new language code, we
// LLM-translate the English bundle ONCE and graft the result onto the
// shared questionBank objects (L, INDUSTRY_OPTIONS, BOOKING_OPTIONS,
// ADDMORE_OPTIONS, DETAILS) under that code, so the existing screen
// builders (which read L[lang], OPTIONS[lang], pick(d.x, lang)) just work.
//
// Currency + country pickers are intentionally NOT translated — they're
// codes / symbols / proper nouns that read universally, and translating
// 100+ of them per language is costly and pointless. Those builders fall
// back to the English list for unknown languages.
//
// Cache is module-level (process-wide). send.js pre-warms it the moment we
// detect the user's language, so the /flow endpoint never pays the
// translation latency mid-screen (and the warm survives for every screen
// of that session since send + endpoint share the process).

const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');
const qb = require('./questionBank');

// Languages already materialized (hand-authored + ones we've translated).
const ready = new Set(['en', 'pt']);
// In-flight promises so concurrent screens for the same new language share
// one translation call instead of firing several.
const inflight = new Map();

function isReady(code) {
  return !code || ready.has(code) || !!qb.L[code];
}

async function ensureLanguage(code) {
  const lang = String(code || '').toLowerCase().slice(0, 5);
  if (!lang || isReady(lang)) return true;
  if (inflight.has(lang)) return inflight.get(lang);

  const p = (async () => {
    // Build the English source bundle to translate (values only).
    const detailsSrc = {};
    for (const k of Object.keys(qb.DETAILS)) {
      const d = qb.DETAILS[k];
      detailsSrc[k] = {
        title: d.title.en, f1: d.f1.en, f1_helper: d.f1_helper.en,
        f2: d.f2.en, f2_helper: d.f2_helper.en,
      };
    }
    const src = {
      L: qb.L.en,
      industry: qb.INDUSTRY_OPTIONS.en.map((o) => o.title),
      booking: qb.BOOKING_OPTIONS.en.map((o) => o.title),
      addmore: qb.ADDMORE_OPTIONS.en.map((o) => o.title),
      addmore_listing: qb.ADDMORE_LISTING_OPTIONS.en.map((o) => o.title),
      status: qb.LISTING_STATUS_OPTIONS.en.map((o) => o.title),
      details: detailsSrc,
    };

    const prompt =
      `Translate ALL the string VALUES of the following JSON into the language with ISO code "${lang}". ` +
      `Keep the JSON structure and keys EXACTLY the same; translate only the values. ` +
      `Keep it natural and concise (these are mobile form labels/options/buttons). ` +
      `Preserve any emoji, leading symbols (➕, ✓), and the "${'${'}...}"-style placeholders if present. ` +
      `Do NOT translate brand/tool names (Fresha, Booksy, Vagaro, Calendly, HVAC, CRS, ABR). ` +
      `Return ONLY the JSON object, nothing else.`;

    let parsed;
    try {
      const resp = await generateResponse(
        prompt,
        [{ role: 'user', content: JSON.stringify(src) }],
        { operation: 'flow_translate_bundle', timeoutMs: 20000 }
      );
      const m = String(resp || '').match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no JSON in translation response');
      parsed = JSON.parse(m[0]);
    } catch (err) {
      logger.warn(`[FLOW-TRANSLATE] ${lang} failed: ${err.message} — will serve English`);
      return false;
    }

    try {
      // Graft the translated values onto the shared questionBank objects.
      if (parsed.L && typeof parsed.L === 'object') {
        qb.L[lang] = { ...qb.L.en, ...parsed.L };
      }
      if (Array.isArray(parsed.industry)) {
        qb.INDUSTRY_OPTIONS[lang] = qb.INDUSTRY_OPTIONS.en.map((o, i) => ({
          id: o.id, title: parsed.industry[i] || o.title,
        }));
      }
      if (Array.isArray(parsed.booking)) {
        qb.BOOKING_OPTIONS[lang] = qb.BOOKING_OPTIONS.en.map((o, i) => ({
          id: o.id, title: parsed.booking[i] || o.title,
        }));
      }
      if (Array.isArray(parsed.addmore)) {
        qb.ADDMORE_OPTIONS[lang] = qb.ADDMORE_OPTIONS.en.map((o, i) => ({
          id: o.id, title: parsed.addmore[i] || o.title,
        }));
      }
      if (Array.isArray(parsed.addmore_listing)) {
        qb.ADDMORE_LISTING_OPTIONS[lang] = qb.ADDMORE_LISTING_OPTIONS.en.map((o, i) => ({
          id: o.id, title: parsed.addmore_listing[i] || o.title,
        }));
      }
      if (Array.isArray(parsed.status)) {
        // Titles localize; ids stay the canonical English status strings.
        qb.LISTING_STATUS_OPTIONS[lang] = qb.LISTING_STATUS_OPTIONS.en.map((o, i) => ({
          id: o.id, title: parsed.status[i] || o.title,
        }));
      }
      if (parsed.details && typeof parsed.details === 'object') {
        for (const k of Object.keys(qb.DETAILS)) {
          const t = parsed.details[k];
          if (!t) continue;
          const d = qb.DETAILS[k];
          if (t.title) d.title[lang] = t.title;
          if (t.f1) d.f1[lang] = t.f1;
          if (t.f1_helper) d.f1_helper[lang] = t.f1_helper;
          if (t.f2) d.f2[lang] = t.f2;
          if (t.f2_helper) d.f2_helper[lang] = t.f2_helper;
        }
      }
      ready.add(lang);
      logger.info(`[FLOW-TRANSLATE] materialized language "${lang}"`);
      return true;
    } catch (err) {
      logger.warn(`[FLOW-TRANSLATE] graft ${lang} failed: ${err.message}`);
      return false;
    }
  })();

  inflight.set(lang, p);
  try { return await p; }
  finally { inflight.delete(lang); }
}

module.exports = { ensureLanguage, isReady };
