'use strict';

// Offline regression for the real-estate LISTING intake mapping. The Flow
// collects listings on a structured, looped LISTING screen (address, price,
// status, beds, baths, sqft, neighborhood + optional photo); buildWebsite-
// DataFromFlow must turn answers.listings_list into the EXACT wd.listings
// shape the generator + chat web-form produce, or the site won't render them.
//
//   node scripts/flows/test-flow-listings.js
//
// No network (no photo_media → no CDN/decrypt). Exits non-zero on failure.

const assert = require('assert');
const { buildWebsiteDataFromFlow } = require('../../src/flows/intake');

(async () => {
  // Realistic endpoint output: listings_list holds only address-bearing rows
  // (the endpoint only pushes when an address is given). Here a 4th row tests
  // the 3-cap, row 2 a blank price + fractional baths, row 3 a bad status.
  const answers = {
    business_name: 'Shazam RE', industry: 'realestate', currency: 'USD',
    // structured agent profile (AGENT screen)
    brokerage: 'Keller Williams', years: '8', designations: 'crs, abr ccim, crs',
    listings_list: [
      { address: '45 Elm St', price: '525000', status: 'For Sale', beds: '3', baths: '2', sqft: '1800', neighborhood: 'Westlake' },
      { address: '12 Oak Ave', price: '', status: 'Sold', beds: '4', baths: '2.5', sqft: '2400', neighborhood: '' },
      { address: '7 Pine Rd', price: '300000', status: 'Bogus', beds: '2', baths: '1', sqft: '900' }, // bad status → 'For Sale'
      { address: '99 Late St', price: '1', status: 'Sold' },   // beyond the 3-cap → dropped
    ],
  };

  const wd = await buildWebsiteDataFromFlow(answers, 'realestate', 'test');
  const L = wd.listings || [];

  assert.strictEqual(L.length, 3, 'capped at 3 (4th dropped)');
  assert.strictEqual(L[2].address, '7 Pine Rd', 'order preserved');

  // An addressless row is never stored by the endpoint, but guard anyway.
  const empty = await buildWebsiteDataFromFlow(
    { industry: 'realestate', listings_list: [{ address: '', price: '1' }] }, 'realestate', 'test');
  assert.ok(!empty.listings, 'addressless row → no listings');

  // Exact shape + types the generator reads (generator.js:613-625).
  const a = L[0];
  assert.deepStrictEqual(Object.keys(a).sort(),
    ['address', 'baths', 'beds', 'currency', 'neighborhood', 'photoUrl', 'price', 'sqft', 'status'].sort());
  assert.strictEqual(a.price, 525000, 'price → number');
  assert.strictEqual(typeof a.price, 'number');
  assert.strictEqual(a.currency, 'USD');
  assert.strictEqual(a.beds, 3);
  assert.strictEqual(a.sqft, 1800);
  assert.strictEqual(a.status, 'For Sale');
  assert.strictEqual(a.photoUrl, null, 'no photo_media → null');

  assert.strictEqual(L[1].price, 0, 'blank price → 0');
  assert.strictEqual(L[1].baths, 2.5, 'baths keeps the fraction');
  assert.strictEqual(L[2].status, 'For Sale', 'unknown status → For Sale');

  assert.ok(!('listingsRaw' in wd), 'listings are structured now, not free-text listingsRaw');

  // Structured agent profile → generator keys (not the old free-text raw).
  assert.strictEqual(wd.brokerageName, 'Keller Williams');
  assert.strictEqual(wd.yearsExperience, 8);
  assert.deepStrictEqual(wd.designations, ['CRS', 'ABR', 'CCIM'], 'uppercased + deduped');
  assert.ok(!('agentProfileRaw' in wd), 'agent profile is structured now, not free-text');

  // HVAC structured services (looped HVAC_SERVICE screen, names only).
  const hv = await buildWebsiteDataFromFlow(
    { industry: 'hvac', f1: 'Austin: Round Rock, Cedar Park', hvac_services: ['AC repair', ' Heating ', ''] },
    'hvac', 'test');
  assert.strictEqual(hv.primaryCity, 'Austin');
  assert.deepStrictEqual(hv.serviceAreas, ['Round Rock', 'Cedar Park']);
  assert.deepStrictEqual(hv.services, ['AC repair', 'Heating'], 'trimmed, blanks dropped, no LLM');

  console.log('  ✓ 4 rows → 3 listings (over-cap dropped); addressless row → none');
  console.log('  ✓ shape/types match generator (price/beds/sqft numbers, baths 2.5, status normalized, photoUrl null)');
  console.log('  ✓ agent profile structured (brokerage/years/designations); no free-text raw fields');
  console.log('  ✓ hvac services structured (city/areas parsed; service names trimmed, no LLM)');
  console.log('\nflow intake regression passed (listings + agent + hvac).');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
