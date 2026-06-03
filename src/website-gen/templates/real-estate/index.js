const { DEFAULT_LISTINGS, DEFAULT_DESIGNATIONS, wrapRealEstatePage } = require('./common');
const { generateHomePage } = require('./home');
const { generateListingsPage } = require('./listings');
const { generateNeighborhoodsPage } = require('./neighborhoods');
const { generateAboutPage } = require('./about');
const { generateContactPage, generateThankYouPage, generateThankYouCmaPage } = require('./contact');
const { generatePrivacyBody } = require('../_privacy');

// Resolve the service-area list a real-estate site will actually render.
// Service areas drive the whole "Neighborhoods" surface (the dedicated page,
// the home-page spotlight, and the nav/footer link). Precedence:
//   1. an explicit serviceAreas list, if provided;
//   2. otherwise derive from the primary city + the neighborhoods the agent
//      tagged on their listings (falling back to the showcase DEFAULT_LISTINGS
//      when no listings were supplied, so a bare demo still gets a page).
// Returns [] when the agent left every listing's neighborhood blank and gave
// no city — the signal to drop the neighborhood surface entirely.
function deriveServiceAreas(config = {}) {
  if (Array.isArray(config.serviceAreas) && config.serviceAreas.length) {
    return config.serviceAreas;
  }
  const listings = (Array.isArray(config.featuredListings) && config.featuredListings.length)
    ? config.featuredListings
    : DEFAULT_LISTINGS;
  const seen = new Set();
  const derived = [];
  const add = (raw) => {
    const v = String(raw || '').trim();
    const key = v.toLowerCase();
    if (v && !seen.has(key)) { seen.add(key); derived.push(v); }
  };
  if (config.primaryCity) add(config.primaryCity);
  for (const l of listings) add(l && l.neighborhood);
  return derived;
}

// Whether this real-estate site should expose a Neighborhoods page/link.
// Single source of truth shared by the generator, the nav, and the "your
// site is ready" preview message so the page count never lies.
function hasNeighborhoodData(config = {}) {
  return deriveServiceAreas(config).length > 0;
}

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
  if (!c.serviceAreas || !c.serviceAreas.length) {
    c.serviceAreas = deriveServiceAreas(c);
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

module.exports = { generateRealEstatePages, deriveServiceAreas, hasNeighborhoodData };
