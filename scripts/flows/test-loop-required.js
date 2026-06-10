'use strict';

// Offline regression for the looped Flow screens (SERVICE / LISTING / PEXP /
// PROJECT / HVAC_SERVICE / PACKAGE). Two behaviours are locked here:
//   1. The first field is required ONLY on the first render (empty list) so the
//      user enters at least one entry; on loop renders it's optional so picking
//      "That's all" can finish without re-entering the field. Driven by the
//      *_required boolean each builder emits.
//   2. The "Add another?" radio resets to '' on every render (init-values) so a
//      previous "add" selection doesn't stay stuck on the looped screen.
//
//   node scripts/flows/test-loop-required.js
//
// The screen builders are pure (no network / DB). Exits non-zero on failure.

const assert = require('assert');
const {
  serviceScreen, listingScreen, pexpScreen, projectScreen, hvacServiceScreen, packageScreen,
} = require('../../src/flows/endpoint');

let pass = 0;
function eq(actual, expected, name) {
  assert.strictEqual(actual, expected, `${name}: ${actual} !== ${expected}`);
  console.log('  ✓', name);
  pass++;
}

// Each loop screen: required true when the list is empty, false once it has an
// entry; the init object resets addmore to ''.
const CASES = [
  ['SERVICE', serviceScreen, 'service_required', 'service_init', [{ name: 'Haircut' }]],
  ['LISTING', listingScreen, 'listing_required', 'listing_init', [{ address: '45 Elm St' }]],
  ['PEXP', pexpScreen, 'pexp_required', 'exp_init', [{ role: 'Engineer' }]],
  ['PROJECT', projectScreen, 'proj_required', 'proj_init', [{ title: 'Pixie' }]],
  ['HVAC_SERVICE', hvacServiceScreen, 'hsvc_required', 'hsvc_init', ['AC repair']],
  ['PACKAGE', packageScreen, 'package_required', 'package_init', [{ name: 'Wedding Day' }]],
];

for (const [label, build, reqKey, initKey, oneItem] of CASES) {
  const first = build('en', []).data;
  const loop = build('en', oneItem).data;
  eq(first[reqKey], true, `${label}: required on first render (empty list)`);
  eq(loop[reqKey], false, `${label}: optional on loop render (has entries)`);
  eq(first[initKey].addmore, '', `${label}: addmore reset to '' on first render`);
  eq(loop[initKey].addmore, '', `${label}: addmore reset to '' on loop render`);
}

console.log(`\n${pass} loop-required checks passed.`);
