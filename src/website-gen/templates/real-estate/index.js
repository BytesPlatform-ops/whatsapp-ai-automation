const { DEFAULT_LISTINGS, DEFAULT_DESIGNATIONS, wrapRealEstatePage } = require('./common');
const { generateHomePage } = require('./home');
const { generateListingsPage } = require('./listings');
const { generateNeighborhoodsPage } = require('./neighborhoods');
const { generateAboutPage } = require('./about');
const { generateContactPage, generateThankYouPage, generateThankYouCmaPage } = require('./contact');
const { generatePrivacyBody } = require('../_privacy');

function ensureRealEstateDefaults(config) {
  const c = { ...config };
  if (!Array.isArray(c.featuredListings) || c.featuredListings.length === 0) {
    c.featuredListings = DEFAULT_LISTINGS;
  }
  if (!Array.isArray(c.designations) || c.designations.length === 0) {
    c.designations = DEFAULT_DESIGNATIONS;
  }
  if (!c.googleRating) c.googleRating = '4.9';
  if (!c.reviewCount) c.reviewCount = '80+';
  // Service areas drive the whole "Neighborhoods" surface (the dedicated
  // page, the home-page spotlight, and the nav/footer link). When the agent
  // never supplied an explicit serviceAreas list, derive it from the
  // neighborhoods they tagged on their listings (plus the primary city).
  // If they filled NO neighborhood on ANY listing — and there's no city —
  // this stays empty, and every neighborhood surface drops out (no empty
  // "coming soon" page). See generateRealEstatePages below.
  if (!c.serviceAreas || !c.serviceAreas.length) {
    const seen = new Set();
    const derived = [];
    const add = (raw) => {
      const v = String(raw || '').trim();
      const key = v.toLowerCase();
      if (v && !seen.has(key)) { seen.add(key); derived.push(v); }
    };
    if (c.primaryCity) add(c.primaryCity);
    for (const l of c.featuredListings) add(l && l.neighborhood);
    c.serviceAreas = derived;
  }
  if (!c.firstName && c.businessName) {
    c.firstName = String(c.businessName).split(' ')[0] || c.businessName;
  }
  return c;
}

function generateRealEstatePages(config /* , { watermark = false } = {} */) {
  const c = ensureRealEstateDefaults(config);
  const pages = {
    '/index.html': generateHomePage(c),
    '/listings/index.html': generateListingsPage(c),
    '/about/index.html': generateAboutPage(c),
    '/contact/index.html': generateContactPage(c),
    '/thank-you/index.html': generateThankYouPage(c),
    '/thank-you-cma/index.html': generateThankYouCmaPage(c),
    '/privacy/index.html': wrapRealEstatePage(c, '/privacy', generatePrivacyBody(c)),
  };
  // Only build the Neighborhoods page when there's actual neighborhood data
  // (an agent who left every listing's neighborhood blank gets no empty page).
  // getRealEstatePages() in common.js keys the nav/footer link off the same
  // serviceAreas check, so the link and the page appear/disappear together.
  if (Array.isArray(c.serviceAreas) && c.serviceAreas.length > 0) {
    pages['/neighborhoods/index.html'] = generateNeighborhoodsPage(c);
  }
  return pages;
}

module.exports = { generateRealEstatePages };
