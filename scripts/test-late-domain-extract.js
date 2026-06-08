'use strict';

// Offline regression for the late-domain entry point honouring an explicitly
// typed domain. The bug: after offering "add a domain", a request like
// "can you look for pixiebtes.com?" was ignored — handleLateDomainStart always
// searched the business name ("asd"), so the bot kept saying "checking asd".
// extractRequestedDomain pulls the typed domain so we look up the right one.
//
//   node -r dotenv/config scripts/test-late-domain-extract.js
//
// Exits non-zero on failure.

const assert = require('assert');
const { extractRequestedDomain } = require('../src/conversation/handlers/webDev');

let pass = 0;
function eq(actual, expected, name) {
  assert.strictEqual(actual, expected, `${name}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  console.log('  ✓', name);
  pass++;
}

// The reported case: explicit domain must be extracted (not ignored).
eq(extractRequestedDomain('can you look for pixiebtes.com?'), 'pixiebtes.com', 'extracts the typed .com domain');
eq(extractRequestedDomain('get me COOLBIZ.IO please'), 'coolbiz.io', 'lowercases the match');
eq(extractRequestedDomain('I want mybiz.co.uk'), 'mybiz.co.uk', 'handles a two-label TLD');
eq(extractRequestedDomain('hook up my-shop.dev'), 'my-shop.dev', 'allows hyphens in the name');

// No explicit domain → null, so the handler falls back to the business name.
eq(extractRequestedDomain('yes i want it on my domain as well'), null, 'no TLD → null (business-name fallback)');
eq(extractRequestedDomain('yes please go ahead'), null, 'plain confirmation → null');
eq(extractRequestedDomain(''), null, 'empty input → null');
eq(extractRequestedDomain(null), null, 'null input → null');

console.log(`\n${pass} late-domain-extract checks passed.`);
