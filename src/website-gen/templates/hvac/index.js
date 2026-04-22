const { DEFAULT_SERVICES, PLUMBING_DEFAULT_SERVICES } = require('./common');
const { generateHomePage } = require('./home');
const { generateServicesPage } = require('./services');
const { generateAreasPage } = require('./areas');
const { generateAboutPage } = require('./about');
const { generateContactPage, generateThankYouPage } = require('./contact');

function ensureHvacDefaults(config) {
  const c = { ...config };
  // Resolve once at the entry point so every sub-page sees the same value
  // without each re-running the regex on config.industry. Default is 'hvac'
  // so callers that don't pass industry behave like they always did.
  // Lazy-require `resolveTrade` because templates/index.js requires this
  // module at the top of its file — importing back at module scope would
  // produce a circular-dep dance where resolveTrade is still undefined.
  if (!c.trade) {
    const { resolveTrade } = require('../');
    c.trade = resolveTrade(c.industry);
  }
  const defaults = c.trade === 'plumbing' ? PLUMBING_DEFAULT_SERVICES : DEFAULT_SERVICES;
  if (!Array.isArray(c.services) || c.services.length === 0) {
    c.services = defaults.map((s) => ({
      title: s.title,
      icon: s.icon,
      shortDescription: s.shortDescription,
      priceFrom: s.priceFrom,
    }));
  } else {
    // Normalize partial services: ensure icon + priceFrom fields. Keep
    // position-based icon fallback so a user-supplied services list of
    // ["AC Repair"] still gets the right icon from the same-trade default.
    c.services = c.services.map((s, i) => ({
      ...s,
      icon: s.icon || (defaults[i] && defaults[i].icon) || 'wrench',
    }));
  }
  if (!c.googleRating) c.googleRating = '4.9';
  if (!c.reviewCount) c.reviewCount = '200+';
  if (!c.serviceAreas || !c.serviceAreas.length) {
    c.serviceAreas = c.primaryCity ? [c.primaryCity] : [];
  }
  return c;
}

function generateHvacPages(config /* , { watermark = false } = {} */) {
  const c = ensureHvacDefaults(config);
  return {
    '/index.html': generateHomePage(c),
    '/services/index.html': generateServicesPage(c),
    '/areas/index.html': generateAreasPage(c),
    '/about/index.html': generateAboutPage(c),
    '/contact/index.html': generateContactPage(c),
    '/thank-you/index.html': generateThankYouPage(c),
  };
}

module.exports = { generateHvacPages };
