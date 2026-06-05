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

const cmd = process.argv[2];
(async () => {
  if (cmd === 'submit') await submit();
  else if (cmd === 'status') await status();
  else { console.log('usage: provision-templates.js [submit|status]'); process.exit(1); }
})();
