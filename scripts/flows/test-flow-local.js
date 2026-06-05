#!/usr/bin/env node
/**
 * Local, offline test harness for the WhatsApp Flow endpoint.
 *
 * Proves — WITHOUT Meta or a deployed server — that:
 *   1. The encryption round-trip works (we simulate Meta's client:
 *      RSA-OAEP the AES key with our PUBLIC key, AES-GCM the body; the
 *      endpoint decrypts, handles, and re-encrypts with the flipped IV;
 *      we decrypt the response the way Meta would).
 *   2. The screen state machine routes correctly: ping → INIT → COMMON →
 *      THEME (per classified theme) → FINISH → SUCCESS.
 *   3. classifyTheme picks the right Screen-2 questions per industry.
 *
 * The session store (Supabase) is stubbed so this runs with zero network.
 *
 * Run:  node scripts/flows/test-flow-local.js
 */

const crypto = require('crypto');
const Module = require('module');

// ── Stub the store + logger so endpoint.js needs no DB/network ──────────
const sessionMem = {};
const storeStub = {
  async createSession(s) { sessionMem[s.flowToken] = { ...s, answers: {} }; return sessionMem[s.flowToken]; },
  async getSession(t) { return sessionMem[t] || null; },
  async patchSession(t, { answersPatch, theme, lang } = {}) {
    const s = sessionMem[t] || (sessionMem[t] = { flow_token: t, answers: {} });
    s.answers = { ...(s.answers || {}), ...(answersPatch || {}) };
    if (theme !== undefined) s.theme = theme;
    if (lang !== undefined) s.lang = lang;
    return s;
  },
  async markSubmitted(t) { if (sessionMem[t]) sessionMem[t].status = 'submitted'; return sessionMem[t]; },
};

// Intercept require('./store') from within src/flows/endpoint.js.
const origResolve = Module._resolveFilename;
const path = require('path');
const storePath = path.join(__dirname, '..', '..', 'src', 'flows', 'store.js');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && /src[\\/]flows[\\/]endpoint\.js$/.test(parent.filename) && request === './store') {
    return storeStub;
  }
  return origLoad.apply(this, arguments);
};

const c = require('../../src/flows/crypto');
const { handleFlow } = require('../../src/flows/endpoint');
const { classifyTheme } = require('../../src/flows/questionBank');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

// Throwaway keypair standing in for the one we'd upload to Meta.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Drive one encrypted request through the endpoint and decrypt the reply,
// exactly mirroring routes.js (decrypt → handleFlow → encrypt).
async function roundtrip(reqObj) {
  const sim = c._simulateClientEncrypt(reqObj, publicKey);
  const { decrypted, aesKeyBuffer, initialVectorBuffer } = c.decryptRequest(sim, privateKey);
  const respObj = await handleFlow(decrypted, {});
  const b64 = c.encryptResponse(respObj, aesKeyBuffer, initialVectorBuffer);
  // Decrypt response as Meta would: same key, IV flipped.
  const flipped = Buffer.from(sim._iv.map((b) => b ^ 0xff));
  const buf = Buffer.from(b64, 'base64');
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(0, buf.length - 16);
  const d = crypto.createDecipheriv('aes-128-gcm', sim._aesKey, flipped);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

(async () => {
  console.log('\n=== 1. Crypto + ping ===');
  const ping = await roundtrip({ action: 'ping', version: '3.0' });
  ok('ping returns {data:{status:active}}', ping?.data?.status === 'active');

  console.log('\n=== 2. INIT → COMMON (labels + industry dropdown options) ===');
  const init = await roundtrip({ action: 'INIT', flow_token: 'ft_test1', version: '3.0' });
  ok('INIT returns COMMON screen', init.screen === 'COMMON');
  ok('COMMON has business-name label', typeof init.data.l_name === 'string' && init.data.l_name.length > 0);
  ok('COMMON has 5 industry options', Array.isArray(init.data.industry_options) && init.data.industry_options.length === 5);
  ok('industry option ids are themes', init.data.industry_options.every((o) => ['salon', 'hvac', 'realestate', 'portfolio', 'general'].includes(o.id)));

  console.log('\n=== 3. classifyTheme (dropdown id + free-text fallback) ===');
  const themeCases = [
    ['salon', 'salon'], ['hvac', 'hvac'], ['realestate', 'realestate'],
    ['hair salon', 'salon'], ['plumber', 'hvac'], ['coffee shop', 'general'],
  ];
  for (const [ind, exp] of themeCases) ok(`"${ind}" → ${exp}`, classifyTheme(ind) === exp);

  console.log('\n=== 4. Full salon journey w/ multi-service loop (COMMON→SALON→SERVICE×2→FINISH→SUCCESS) ===');
  const tok = 'ft_salon';
  await storeStub.createSession({ flowToken: tok, lang: 'en' });
  const r1 = await roundtrip({
    action: 'data_exchange', screen: 'COMMON', flow_token: tok,
    data: { business_name: 'Glow Studio', email: 'g@glow.com', industry: 'salon' },
  });
  ok('COMMON→SALON', r1.screen === 'SALON');
  ok('theme persisted salon', sessionMem[tok].theme === 'salon');
  ok('SALON has currency options', Array.isArray(r1.data.currency_options) && r1.data.currency_options.length > 0);
  ok('SALON has booking options (radio)', Array.isArray(r1.data.booking_options) && r1.data.booking_options.length === 2);

  const r2 = await roundtrip({
    action: 'data_exchange', screen: 'SALON', flow_token: tok,
    data: { currency: 'USD', booking: 'build', hours: 'Tue-Sat 9-7' },
  });
  ok('SALON→SERVICE', r2.screen === 'SERVICE');
  ok('SERVICE has name/price/duration labels', !!r2.data.l_sname && !!r2.data.l_sprice && !!r2.data.l_sdur);
  ok('SERVICE summary hidden initially', r2.data.added_visible === false);

  // Add service #1, choose "add another" → loop back to SERVICE.
  const s1 = await roundtrip({
    action: 'data_exchange', screen: 'SERVICE', flow_token: tok,
    data: { sname: 'Haircut', sprice: '25', sdur: '30 min', addmore: 'add' },
  });
  ok('SERVICE loops on "add"', s1.screen === 'SERVICE');
  ok('summary now visible w/ 1 service', s1.data.added_visible === true && /Haircut/.test(s1.data.added_summary));

  // Add service #2, "done" → FINISH.
  const s2 = await roundtrip({
    action: 'data_exchange', screen: 'SERVICE', flow_token: tok,
    data: { sname: 'Color', sprice: '85', sdur: '90 min', addmore: 'done' },
  });
  ok('SERVICE→FINISH on "done"', s2.screen === 'FINISH');
  ok('both services accumulated in session', (sessionMem[tok].answers.services_list || []).length === 2);
  ok('FINISH has 3 contact labels', !!s2.data.l_cemail && !!s2.data.l_cphone && !!s2.data.l_caddress);

  const r3 = await roundtrip({
    action: 'data_exchange', screen: 'FINISH', flow_token: tok,
    data: { c_email: 'g@glow.com', c_phone: '+1 555 111 2222', c_address: '5 Main St' },
  });
  ok('FINISH→SUCCESS', r3.screen === 'SUCCESS');
  ok('SUCCESS carries flow_token', r3.data?.extension_message_response?.params?.flow_token === tok);
  ok('session persisted all answers',
    sessionMem[tok].answers.business_name === 'Glow Studio' &&
    sessionMem[tok].answers.currency === 'USD' &&
    sessionMem[tok].answers.services_list[0].name === 'Haircut' &&
    sessionMem[tok].answers.c_phone.includes('555'));

  console.log('\n=== 5. Non-salon (hvac) → DETAILS with f2 visible ===');
  const tok2 = 'ft_hvac';
  await storeStub.createSession({ flowToken: tok2, lang: 'en' });
  const h1 = await roundtrip({
    action: 'data_exchange', screen: 'COMMON', flow_token: tok2,
    data: { business_name: 'CoolAir', email: 'c@air.com', industry: 'hvac' },
  });
  ok('hvac → DETAILS', h1.screen === 'DETAILS');
  ok('DETAILS f1 label present', typeof h1.data.f1_label === 'string' && h1.data.f1_label.length > 0);
  // Services moved to the structured HVAC_SERVICE loop — DETAILS f2 is hidden.
  ok('hvac f2 hidden (services on loop)', h1.data.f2_visible === false);

  console.log('\n=== 6. General → DETAILS with f2 hidden ===');
  const tok4 = 'ft_general';
  await storeStub.createSession({ flowToken: tok4, lang: 'en' });
  const g1 = await roundtrip({
    action: 'data_exchange', screen: 'COMMON', flow_token: tok4,
    data: { business_name: 'Acme', email: 'a@acme.com', industry: 'general' },
  });
  ok('general → DETAILS', g1.screen === 'DETAILS');
  ok('general f2 hidden', g1.data.f2_visible === false);

  console.log('\n=== 7. Portuguese labels + options ===');
  const tok3 = 'ft_pt';
  await storeStub.createSession({ flowToken: tok3, lang: 'pt' });
  const p1 = await roundtrip({ action: 'INIT', flow_token: tok3, version: '3.0' });
  ok('PT INIT label is Portuguese', /negócio|nome/i.test(p1.data.l_name));
  ok('PT industry options Portuguese', /Salão|Imóveis/i.test(JSON.stringify(p1.data.industry_options)));

  console.log('\n=== 8. Portfolio: niche-first, per-niche PORTFOLIO fields ===');
  // developer → skills/years/focus/projects visible, photos hidden.
  const tokDev = 'ft_dev';
  await storeStub.createSession({ flowToken: tokDev, lang: 'en' });
  const d0 = await roundtrip({
    action: 'data_exchange', screen: 'COMMON', flow_token: tokDev,
    data: { business_name: 'Jane Dev', industry: 'portfolio' },
  });
  ok('portfolio COMMON → PNICHE', d0.screen === 'PNICHE');
  ok('theme persisted portfolio', sessionMem[tokDev].theme === 'portfolio');
  ok('PNICHE has 4 niche options', Array.isArray(d0.data.niche_options) && d0.data.niche_options.length === 4);
  const d1 = await roundtrip({
    action: 'data_exchange', screen: 'PNICHE', flow_token: tokDev,
    data: { portfolio_niche: 'developer' },
  });
  ok('PNICHE → PORTFOLIO', d1.screen === 'PORTFOLIO');
  ok('niche persisted in session', sessionMem[tokDev].answers.portfolio_niche === 'developer');
  ok('developer: skills visible', d1.data.skills_visible === true);
  ok('developer: photos hidden', d1.data.photos_visible === false);
  ok('developer: projects visible', d1.data.projects_visible === true);
  const d2 = await roundtrip({
    action: 'data_exchange', screen: 'PORTFOLIO', flow_token: tokDev,
    data: { f1: 'I build things', p_skills: 'React, Node', p_links: 'github.com/jane', p_years: '6', p_focus: 'an AI app', f2: 'Project A\nProject B' },
  });
  ok('developer PORTFOLIO → FINISH', d2.screen === 'FINISH');
  ok('portfolio answers persisted', sessionMem[tokDev].answers.p_skills === 'React, Node' && sessionMem[tokDev].answers.f1 === 'I build things');

  // photographer → photos visible, skills hidden; an uploaded photo descriptor persists.
  const tokPh = 'ft_photo';
  await storeStub.createSession({ flowToken: tokPh, lang: 'en' });
  await roundtrip({
    action: 'data_exchange', screen: 'COMMON', flow_token: tokPh,
    data: { business_name: 'Lens Co', industry: 'portfolio' },
  });
  const ph1 = await roundtrip({
    action: 'data_exchange', screen: 'PNICHE', flow_token: tokPh,
    data: { portfolio_niche: 'photographer' },
  });
  ok('photographer: photos visible', ph1.data.photos_visible === true);
  ok('photographer: skills hidden', ph1.data.skills_visible === false);
  ok('photographer: projects hidden', ph1.data.projects_visible === false);
  const ph2 = await roundtrip({
    action: 'data_exchange', screen: 'PORTFOLIO', flow_token: tokPh,
    data: { f1: 'I shoot weddings', work_photos: [{ cdn_url: 'https://x/y.jpg', file_name: 'y.jpg', encryption_metadata: {} }], p_links: 'instagram.com/lens', p_focus: 'a wedding' },
  });
  ok('photographer PORTFOLIO → FINISH', ph2.screen === 'FINISH');
  ok('work photo media persisted', Array.isArray(sessionMem[tokPh].answers.portfolio_photos_media) && sessionMem[tokPh].answers.portfolio_photos_media.length === 1);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness crashed:', e); process.exit(1); });
