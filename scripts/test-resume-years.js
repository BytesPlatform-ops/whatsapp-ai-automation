'use strict';

// Offline regression for the resume → portfolio "years building" stat.
// buildWebsiteDataFromResume is pure (no network / DB), so we feed it the
// structured profiles the LLM extractor would produce and assert the derived
// yearsExperience. The bug fixed here: the resume path showed "1 years building"
// because it trusted the LLM's (lowballed) yearsExperience instead of computing
// the span from the factual job periods.
//
//   node scripts/test-resume-years.js
//
// Exits non-zero on failure.

const assert = require('assert');
const { buildWebsiteDataFromResume } = require('../src/website-gen/resumeIntake');

const Y = new Date().getFullYear();
let pass = 0;
function eq(actual, expected, name) {
  assert.strictEqual(actual, expected, `${name}: ${actual} !== ${expected}`);
  console.log('  ✓', name);
  pass++;
}

// 1) LLM lowballed yearsExperience=1, but periods span 2018 → Present. Span wins.
eq(
  buildWebsiteDataFromResume({
    name: 'Dev One', niche: 'developer', yearsExperience: 1,
    experience: [
      { period: 'Jan 2022 – Present', role: 'Senior Engineer', company: 'Acme' },
      { period: '2018 – 2021', role: 'Engineer', company: 'Globex' },
    ],
  }).yearsExperience,
  Y - 2018,
  'span from earliest start to Present beats lowballed LLM',
);

// 2) Closed range (no "Present") → latest end minus earliest start.
eq(
  buildWebsiteDataFromResume({
    name: 'Dev Two', niche: 'developer', yearsExperience: null,
    experience: [
      { period: '2015 - 2019', role: 'Engineer', company: 'A' },
      { period: '2019 - 2023', role: 'Lead', company: 'B' },
    ],
  }).yearsExperience,
  2023 - 2015,
  'closed range uses latest end year',
);

// 3) Resume states a higher total ("12 years") than the listed periods cover
//    (older jobs omitted) → keep the larger LLM number.
eq(
  buildWebsiteDataFromResume({
    name: 'Dev Three', niche: 'developer', yearsExperience: 12,
    experience: [{ period: '2023 – Present', role: 'Principal', company: 'C' }],
  }).yearsExperience,
  12,
  'stated total kept when it exceeds the derived span',
);

// 4) No dates anywhere → fall back to the LLM number.
eq(
  buildWebsiteDataFromResume({
    name: 'Dev Four', niche: 'developer', yearsExperience: 5,
    experience: [{ period: '', role: 'Engineer', company: 'D' }],
  }).yearsExperience,
  5,
  'undated periods fall back to LLM number',
);

// 5) No experience + no LLM number → yearsExperience left unset (template falls
//    back to its own placeholder; never a bogus value).
eq(
  buildWebsiteDataFromResume({ name: 'Dev Five', niche: 'developer' }).yearsExperience,
  undefined,
  'no signal → yearsExperience unset',
);

console.log(`\n${pass} resume-years checks passed.`);
