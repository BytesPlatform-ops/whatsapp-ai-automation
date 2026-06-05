'use strict';

// Regression test for the template re-engagement ladder's pure logic.
//   node -r dotenv/config test/template-reengage.test.js
// No network/DB — exercises the exported helpers + the inert gate.

delete process.env.TEMPLATE_REENGAGE_ENABLED; // ensure inert path

const t = require('../src/followup/templateReengage');
let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? '✅' : '❌'} ${name}  (got=${JSON.stringify(got)}${ok ? '' : ', want=' + JSON.stringify(want)})`);
  ok ? pass++ : fail++;
}

// ── detectStage (priority: golive > halfbuilt > intent) ──
eq('stage: payment link, unpaid → golive', t.detectStage({ paymentLinkSentAt: 'x' }), 'golive');
eq('stage: paid → null (exit)',            t.detectStage({ paymentLinkSentAt: 'x', paymentConfirmed: true }), null);
eq('stage: businessName → halfbuilt',      t.detectStage({ websiteData: { businessName: 'Acme' } }), 'halfbuilt');
eq('stage: demo triggered → halfbuilt',    t.detectStage({ websiteDemoTriggered: true }), 'halfbuilt');
eq('stage: adReferral → intent',           t.detectStage({ adReferral: { ctwaClid: 'c' } }), 'intent');
eq('stage: adIndustry real → intent',      t.detectStage({ adIndustry: 'realestate' }), 'intent');
eq('stage: adIndustry generic → null',     t.detectStage({ adIndustry: 'generic' }), null);
eq('stage: empty → null',                  t.detectStage({}), null);
eq('stage: link beats businessName',       t.detectStage({ paymentLinkSentAt: 'x', websiteData: { businessName: 'A' }, adReferral: {} }), 'golive');
eq('stage: build beats intent',            t.detectStage({ websiteData: { businessName: 'A' }, adReferral: {} }), 'halfbuilt');

// ── langCode ──
eq('lang: portuguese → pt_BR', t.langCode({ metadata: { preferredLanguage: 'portuguese' } }), 'pt_BR');
eq('lang: pt → pt_BR',         t.langCode({ metadata: { preferredLanguage: 'pt' } }), 'pt_BR');
eq('lang: pt-BR → pt_BR',      t.langCode({ metadata: { preferredLanguage: 'pt-BR' } }), 'pt_BR');
eq('lang: roman-urdu → en',    t.langCode({ metadata: { preferredLanguage: 'roman-urdu' } }), 'en');
eq('lang: english → en',       t.langCode({ metadata: { preferredLanguage: 'english' } }), 'en');
eq('lang: none → en',          t.langCode({ metadata: {} }), 'en');

// ── var1 ({{1}}) i18n ──
eq('var1: realestate en', t.var1('realestate', 'en'), 'real estate website');
eq('var1: realestate pt', t.var1('realestate', 'pt_BR'), 'site de imóveis');
eq('var1: salon pt',      t.var1('salon', 'pt_BR'), 'site de salão');
eq('var1: hvac en',       t.var1('hvac', 'en'), 'home services website');
eq('var1: generic en',    t.var1('generic', 'en'), 'website');
eq('var1: generic pt',    t.var1('generic', 'pt_BR'), 'site');

// ── family / action mapping (drives template name + params) ──
eq('intent → preview family',    t.STAGES.intent.family, 'preview');
eq('intent action en',           t.STAGES.intent.action.en, 'build a free preview');
eq('halfbuilt action en',        t.STAGES.halfbuilt.action.en, 'finish your site');
eq('halfbuilt action pt',        t.STAGES.halfbuilt.action.pt_BR, 'terminar seu site');
eq('golive → golive family',     t.STAGES.golive.family, 'golive');
eq('golive has no action',       t.STAGES.golive.action, undefined);
eq('ladder days',                t.LADDER.map((r) => r.day).join(','), 'day1,day3,day7');

// name construction sanity (what the ladder builds)
eq('name: intent day3',  `reengage_${t.STAGES.intent.family}_day3`, 'reengage_preview_day3');
eq('name: golive day7',  `reengage_${t.STAGES.golive.family}_day7`, 'reengage_golive_day7');

// ── inert when disabled: must resolve without throwing / sending ──
(async () => {
  let threw = false;
  try {
    await t.processTemplateReengage({ id: 'u', phone_number: '+1', channel: 'whatsapp', via_phone_number_id: 'PN', metadata: { adReferral: {} } });
  } catch (e) { threw = true; console.log('  (threw:', e.message, ')'); }
  eq('inert when TEMPLATE_REENGAGE_ENABLED unset', threw, false);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})();
