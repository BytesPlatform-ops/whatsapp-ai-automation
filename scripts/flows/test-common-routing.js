'use strict';

// Offline regression for the COMMON screen of the dynamic Flow: industry is
// now a RadioButtonsGroup at the TOP, and portfolio renders a "Your name"
// (your_name) field instead of "Business name" (business_name). This locks:
//   • INIT renders both name labels (l_name + l_your_name) so the If/else
//     branches in flow.json always have their labels.
//   • COMMON routes by industry id (portfolio → PNICHE, salon → SALON, etc.).
//   • The portfolio your_name field is accepted (no business_name) without the
//     handler throwing — the merge to business_name happens at persist time.
//
//   node -r dotenv/config scripts/flows/test-common-routing.js
//
// No outbound network; passing no flow_token skips all DB writes in handleFlow.
// Exits non-zero on failure.

const assert = require('assert');
const { handleFlow } = require('../../src/flows/endpoint');

let pass = 0;
function eq(actual, expected, name) {
  assert.strictEqual(actual, expected, `${name}: ${actual} !== ${expected}`);
  console.log('  ✓', name);
  pass++;
}

(async () => {
  // INIT → COMMON carries both name labels (for the If/else branches).
  const init = await handleFlow({ action: 'INIT' }, { lang: 'en' });
  eq(init.screen, 'COMMON', 'INIT renders COMMON');
  eq(init.data.l_name, 'Business name', 'COMMON has business-name label');
  eq(init.data.l_your_name, 'Your name', 'COMMON has your-name label');

  // Portfolio: only your_name is filled (no business_name) → PNICHE.
  const portfolio = await handleFlow(
    { action: 'data_exchange', screen: 'COMMON', data: { industry: 'portfolio', your_name: 'Umair Ahsan' } },
    { lang: 'en' },
  );
  eq(portfolio.screen, 'PNICHE', 'portfolio (your_name only) → PNICHE');

  // Non-portfolio still routes off industry with business_name.
  const salon = await handleFlow(
    { action: 'data_exchange', screen: 'COMMON', data: { industry: 'salon', business_name: 'Glow Bar' } },
    { lang: 'en' },
  );
  eq(salon.screen, 'SALON', 'salon (business_name) → SALON');

  const realestate = await handleFlow(
    { action: 'data_exchange', screen: 'COMMON', data: { industry: 'realestate', business_name: 'Acme Realty' } },
    { lang: 'en' },
  );
  eq(realestate.screen, 'AGENT', 'realestate → AGENT');

  const general = await handleFlow(
    { action: 'data_exchange', screen: 'COMMON', data: { industry: 'general', business_name: 'Acme Co' } },
    { lang: 'en' },
  );
  eq(general.screen, 'DETAILS', 'general → DETAILS');

  console.log(`\n${pass} common-routing checks passed.`);
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
