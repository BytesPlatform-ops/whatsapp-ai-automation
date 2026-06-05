'use strict';

// Provision the re-engagement WhatsApp Message Templates on every WABA.
//
//   node -r dotenv/config scripts/flows/provision-templates.js submit
//   node -r dotenv/config scripts/flows/provision-templates.js status
//
// Two families, MARKETING category, quick-reply buttons:
//   reengage_preview_day1/3/7  — {{1}}=industry website, {{2}}=infinitive action
//                                (intent + half-built; "free preview" framing)
//   reengage_golive_day1/3/7   — {{1}}=industry website (built-but-unpaid)
//
// {{2}} is ALWAYS an infinitive after a modal ("Can I {{2}}" / "Posso {{2}}")
// so a single phrase slots grammatically into every day's sentence in any
// language — keeps future-language auto-translation clean.
//
// Templates are WABA-scoped, so each must exist on BOTH numbers' WABAs. Token
// needs whatsapp_business_management (same one provision-flow.js uses).

const https = require('https');
const fs = require('fs');
const path = require('path');

const API = 'https://graph.facebook.com/v22.0';
// Template management needs whatsapp_business_management — WHATSAPP_ACCESS_TOKEN
// has it. META_CAPI_ACCESS_TOKEN is an ads/CAPI token (no WA rights), so it's
// LAST, never preferred.
const TOKEN =
  process.env.META_FLOW_TOKEN || process.env.META_TOKEN ||
  process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN;

// +31 (PixieBytes) and +1 (Bytes Platform) WABAs. Override via env if needed.
const WABAS = (process.env.TEMPLATE_WABA_IDS || '946247001439181,1264188285893289')
  .split(',').map((s) => s.trim()).filter(Boolean);

// ─── canonical copy ───────────────────────────────────────────────────────
// example = positional sample for each {{n}} (Meta requires it).
const TEMPLATES = [
  // ── Family A: preview (intent + half-built) ──
  {
    name: 'reengage_preview_day1',
    versions: {
      en:    { body: "Hey 👋 it's Pixie. Your {{1}} is about 60 seconds away — free to look, no payment. Can I {{2}} for you right now?",
               example: ['real estate website', 'build a free preview'], buttons: ['Show me', 'Maybe later'] },
      pt_BR: { body: "Oi 👋 é a Pixie. Seu {{1}} está a uns 60 segundos — grátis pra ver, sem pagar nada. Posso {{2}} pra você agora?",
               example: ['site de imóveis', 'criar uma prévia grátis'], buttons: ['Quero ver', 'Agora não'] },
    },
  },
  {
    name: 'reengage_preview_day3',
    versions: {
      en:    { body: "Still want your {{1}}? Nothing to pay until you love it — tap below and I can {{2}} in about a minute.",
               example: ['real estate website', 'build a free preview'], buttons: ['Show me', 'Maybe later'] },
      pt_BR: { body: "Ainda quer seu {{1}}? Nada a pagar até você amar — toque abaixo e eu posso {{2}} em cerca de um minuto.",
               example: ['site de imóveis', 'criar uma prévia grátis'], buttons: ['Quero ver', 'Agora não'] },
    },
  },
  {
    name: 'reengage_preview_day7',
    versions: {
      en:    { body: "Last nudge 🙂 if you're just browsing, all good — I'll stop. But if you still want your {{1}}, just say the word and I'll {{2}} right away.",
               example: ['real estate website', 'build a free preview'], buttons: ['Yes, build it', 'Stop these'] },
      pt_BR: { body: "Último lembrete 🙂 se você só está olhando, tudo bem — eu paro. Mas se ainda quer seu {{1}}, é só falar e eu vou {{2}} agora mesmo.",
               example: ['site de imóveis', 'criar uma prévia grátis'], buttons: ['Sim, pode criar', 'Parar mensagens'] },
    },
  },
  // ── Family B: go-live (built, unpaid) ──
  {
    name: 'reengage_golive_day1',
    versions: {
      en:    { body: "Hey 👋 your {{1}} is built and ready — I'm holding it for you. Want to put it live?",
               example: ['real estate website'], buttons: ['Take it live', 'Not yet'] },
      pt_BR: { body: "Oi 👋 seu {{1}} está pronto e te esperando — estou guardando pra você. Quer publicar?",
               example: ['site de imóveis'], buttons: ['Publicar', 'Agora não'] },
    },
  },
  {
    name: 'reengage_golive_day3',
    versions: {
      en:    { body: "Quick one — your {{1}} is still saved and ready to publish. Want me to get it live today?",
               example: ['real estate website'], buttons: ['Publish it', 'Not yet'] },
      pt_BR: { body: "Rapidinho — seu {{1}} ainda está salvo e pronto pra publicar. Quer que eu coloque no ar hoje?",
               example: ['site de imóveis'], buttons: ['Publicar', 'Agora não'] },
    },
  },
  {
    name: 'reengage_golive_day7',
    versions: {
      en:    { body: "Last check-in 🙂 your {{1}} is ready whenever you are. One tap and it's live — otherwise, all good!",
               example: ['real estate website'], buttons: ['Make it live', 'Stop these'] },
      pt_BR: { body: "Último contato 🙂 seu {{1}} está pronto quando quiser. Um toque e ele vai ao ar — caso contrário, tudo certo!",
               example: ['site de imóveis'], buttons: ['Colocar no ar', 'Parar mensagens'] },
    },
  },
];

const NAMES = new Set(TEMPLATES.map((t) => t.name));

// ─── http ─────────────────────────────────────────────────────────────────
function req(method, pathOrUrl, body) {
  return new Promise((resolve) => {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
    const sep = url.includes('?') ? '&' : '?';
    const full = url + sep + 'access_token=' + TOKEN;
    const data = body ? JSON.stringify(body) : null;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const r = https.request(full, opts, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, json: d }); } });
    });
    r.on('error', (e) => resolve({ status: 0, json: { error: { message: e.message } } }));
    if (data) r.write(data);
    r.end();
  });
}

function components(v) {
  return [
    { type: 'BODY', text: v.body, example: { body_text: [v.example] } },
    { type: 'BUTTONS', buttons: v.buttons.map((text) => ({ type: 'QUICK_REPLY', text })) },
  ];
}

// ─── commands ───────────────────────────────────────────────────────────────
async function submit() {
  if (!TOKEN) { console.error('No token (META_FLOW_TOKEN / WHATSAPP_ACCESS_TOKEN)'); process.exit(1); }
  let ok = 0, exists = 0, failed = 0;
  for (const waba of WABAS) {
    console.log(`\n=== WABA ${waba} ===`);
    for (const tpl of TEMPLATES) {
      for (const [lang, v] of Object.entries(tpl.versions)) {
        const res = await req('POST', `/${waba}/message_templates`, {
          name: tpl.name, language: lang, category: 'MARKETING', components: components(v),
        });
        const j = res.json || {};
        if (j.id) { ok++; console.log(`  ✅ ${tpl.name} [${lang}] → ${j.status || 'submitted'} (${j.id})`); }
        else {
          const msg = j.error?.error_user_msg || j.error?.message || JSON.stringify(j);
          if (/already exists|already .*content/i.test(msg)) { exists++; console.log(`  ⚠️  ${tpl.name} [${lang}] already exists — skipping`); }
          else { failed++; console.log(`  ❌ ${tpl.name} [${lang}] → ${msg}`); }
        }
      }
    }
  }
  console.log(`\n=== submit: ${ok} created, ${exists} already existed, ${failed} failed ===`);
}

async function status() {
  for (const waba of WABAS) {
    const res = await req('GET', `/${waba}/message_templates?fields=name,language,status,category&limit=200`);
    const rows = (res.json?.data || []).filter((r) => NAMES.has(r.name));
    console.log(`\n=== WABA ${waba} (${rows.length} of ours) ===`);
    const order = { APPROVED: 0, PENDING: 1, REJECTED: 2 };
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
    for (const r of rows) {
      const mark = r.status === 'APPROVED' ? '✅' : r.status === 'REJECTED' ? '❌' : '⏳';
      console.log(`  ${mark} ${r.name.padEnd(24)} [${r.language}]  ${r.status}`);
    }
    const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
    console.log('  →', JSON.stringify(counts));
  }
}

// ─── auto-provisioner: translate the canonical en copy to a new language,
//     submit it on both WABAs, and write the send-time language pack ──────────
const META_LANG_NAME = {
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch',
  ar: 'Arabic', hi: 'Hindi', id: 'Indonesian', tr: 'Turkish', ru: 'Russian',
  pt_BR: 'Brazilian Portuguese',
};
const TRANSLATE_ALIASES = {
  spanish: 'es', espanol: 'es', es: 'es', french: 'fr', francais: 'fr', fr: 'fr',
  german: 'de', deutsch: 'de', de: 'de', italian: 'it', it: 'it', dutch: 'nl', nl: 'nl',
  arabic: 'ar', ar: 'ar', hindi: 'hi', hi: 'hi', indonesian: 'id', id: 'id', bahasa: 'id',
  turkish: 'tr', tr: 'tr', russian: 'ru', ru: 'ru',
};
// en source the LLM translates: template bodies/buttons + the {{2}} actions +
// the {{1}} industry phrases (full phrases, so a translation needs no word-order
// knowledge of "website").
const EN_ACTION = { intent: 'build a free preview', halfbuilt: 'finish your site' };
const EN_VAR1 = {
  realestate: 'real estate website', salon: 'salon website', hvac: 'home services website',
  restaurant: 'restaurant website', portfolio: 'portfolio website', ecommerce: 'online store', generic: 'website',
};
const stripEmoji = (s) => String(s)
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu, '')
  .replace(/\s+/g, ' ').trim();
const phCount = (s, n) => (String(s).match(new RegExp(`\\{\\{${n}\\}\\}`, 'g')) || []).length;

async function translate(input, dry) {
  if (!TOKEN) { console.error('No WhatsApp token'); process.exit(1); }
  const key = String(input || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const meta = TRANSLATE_ALIASES[key] || (META_LANG_NAME[input] ? input : null);
  if (!meta || meta === 'pt_BR' || meta === 'en') {
    console.error(`Unsupported / already-built language "${input}". Supported: ${Object.keys(META_LANG_NAME).filter((c) => c !== 'pt_BR').join(', ')}`);
    process.exit(1);
  }
  const langName = META_LANG_NAME[meta];

  const enTemplates = {};
  for (const t of TEMPLATES) enTemplates[t.name] = { body: t.versions.en.body, buttons: t.versions.en.buttons.slice() };
  const src = { templates: enTemplates, action: EN_ACTION, var1: EN_VAR1 };

  const shape = {
    templates: Object.fromEntries(Object.keys(enTemplates).map((n) => [n, { body: '…', buttons: ['…', '…'] }])),
    action: { intent: '…', halfbuilt: '…' },
    var1: { realestate: '…', salon: '…', hvac: '…', restaurant: '…', portfolio: '…', ecommerce: '…', generic: '…' },
  };
  const sys = `You are a professional localizer for WhatsApp Message Templates. Translate the English copy into ${langName} (Meta code ${meta}). Return STRICT JSON only — no markdown.

HARD RULES:
- Keep placeholders {{1}} and {{2}} EXACTLY, same count per body. {{1}} = the user's website (noun phrase). {{2}} = an action as an INFINITIVE that reads naturally right after the verb in the sentence.
- A placeholder must NEVER be first or last in a body — keep words on both sides (the English already does; preserve that).
- Buttons: translate each, keep SHORT (max 20 chars), NO emojis, NO numbers/variables, NO trailing punctuation.
- Warm, human, concise texting tone. Keep any emoji already in the body text.
- "action" = infinitive phrases. "var1" = the localized phrase for each kind of website.
Output JSON with EXACTLY this shape, translating every value:
${JSON.stringify(shape)}`;

  console.log(`Translating 6 templates + variables → ${langName} (${meta})…`);
  const { generateResponse } = require('../../src/llm/provider');
  const raw = await generateResponse(sys, [{ role: 'user', content: `English source:\n${JSON.stringify(src, null, 2)}` }], { operation: 'template_translate', timeoutMs: 120000 });
  let p;
  try { p = JSON.parse((String(raw).match(/\{[\s\S]*\}/) || ['{}'])[0]); }
  catch (e) { console.error('LLM did not return valid JSON:', e.message, '\n', String(raw).slice(0, 400)); process.exit(1); }

  // validate
  const issues = [];
  for (const t of TEMPLATES) {
    const tr = p.templates && p.templates[t.name];
    if (!tr || !tr.body) { issues.push(`${t.name}: missing body`); continue; }
    for (const n of [1, 2]) if (phCount(tr.body, n) !== phCount(t.versions.en.body, n)) issues.push(`${t.name}: {{${n}}} count off`);
    const b = String(tr.body).trim();
    if (b.startsWith('{{') || /\}\}[\s!?.,]*$/.test(b)) issues.push(`${t.name}: variable at start/end`);
    tr.buttons = (tr.buttons || t.versions.en.buttons).map((x) => stripEmoji(x).slice(0, 25)).filter(Boolean);
    if (tr.buttons.length !== t.versions.en.buttons.length) issues.push(`${t.name}: button count`);
  }
  for (const k of ['intent', 'halfbuilt']) if (!p.action || !p.action[k]) issues.push(`action.${k} missing`);
  for (const k of Object.keys(EN_VAR1)) if (!p.var1 || !p.var1[k]) issues.push(`var1.${k} missing`);
  if (issues.length) { console.error('❌ validation failed:\n  ' + issues.join('\n  ') + '\n\nNothing submitted — re-run to retry.'); process.exit(1); }

  console.log('\n--- translated (review) ---');
  for (const t of TEMPLATES) console.log(`\n${t.name}\n  ${p.templates[t.name].body}\n  [ ${p.templates[t.name].buttons.join(' | ')} ]`);
  console.log('\naction:', JSON.stringify(p.action), '\nvar1:', JSON.stringify(p.var1), '\n');

  if (dry) { console.log(`=== [dry] ${meta}: validated OK, nothing submitted, pack not written ===`); return; }

  let ok = 0, exists = 0, failed = 0;
  for (const waba of WABAS) {
    for (const t of TEMPLATES) {
      const tr = p.templates[t.name];
      const has2 = phCount(t.versions.en.body, 2) > 0;
      const example = has2 ? [p.var1.realestate, p.action.intent] : [p.var1.realestate];
      const res = await req('POST', `/${waba}/message_templates`, {
        name: t.name, language: meta, category: 'MARKETING', components: components({ body: tr.body, example, buttons: tr.buttons }),
      });
      const j = res.json || {};
      if (j.id) { ok++; console.log(`  ✅ ${t.name} [${meta}] @${waba} → ${j.status || 'submitted'}`); }
      else {
        const msg = j.error?.error_user_msg || j.error?.message || JSON.stringify(j);
        if (/already exists|already .*content/i.test(msg)) { exists++; console.log(`  ⚠️  ${t.name} [${meta}] @${waba} exists`); }
        else { failed++; console.log(`  ❌ ${t.name} [${meta}] @${waba} → ${msg}`); }
      }
    }
  }

  const packPath = path.join(__dirname, '../../src/followup/templateLangPacks.json');
  let packs = {};
  try { packs = JSON.parse(fs.readFileSync(packPath, 'utf8')); } catch { /* fresh */ }
  packs[meta] = { action: { intent: p.action.intent, halfbuilt: p.action.halfbuilt }, var1: p.var1 };
  fs.writeFileSync(packPath, JSON.stringify(packs, null, 2) + '\n');

  console.log(`\n=== translate ${meta}: ${ok} created, ${exists} existed, ${failed} failed. Pack written. ===`);
  console.log('Next: review the copy above + the pack diff, commit + deploy, then `status` for approval.');
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'submit') await submit();
  else if (cmd === 'status') await status();
  else if (cmd === 'translate') await translate(process.argv[3], process.argv[4] === 'dry');
  else { console.log('usage: provision-templates.js [submit | status | translate <lang> [dry]]'); process.exit(1); }
})();
