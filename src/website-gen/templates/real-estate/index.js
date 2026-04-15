const { DEFAULT_LISTINGS, DEFAULT_DESIGNATIONS } = require('./common');
const { generateHomePage } = require('./home');
const { generateListingsPage } = require('./listings');
const { generateNeighborhoodsPage } = require('./neighborhoods');
const { generateAboutPage } = require('./about');
const { generateContactPage, generateThankYouPage, generateThankYouCmaPage } = require('./contact');

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
    c.serviceAreas = c.primaryCity ? [c.primaryCity] : [];
  }
  if (!c.firstName && c.businessName) {
    c.firstName = String(c.businessName).split(' ')[0] || c.businessName;
  }
  return c;
}

function generateRealEstatePages(config /* , { watermark = false } = {} */) {
  const c = ensureRealEstateDefaults(config);
  return {
    '/index.html': generateHomePage(c),
    '/listings/index.html': generateListingsPage(c),
    '/neighborhoods/index.html': generateNeighborhoodsPage(c),
    '/about/index.html': generateAboutPage(c),
    '/contact/index.html': generateContactPage(c),
    '/thank-you/index.html': generateThankYouPage(c),
    '/thank-you-cma/index.html': generateThankYouCmaPage(c),
  };
}

module.exports = { generateRealEstatePages };
