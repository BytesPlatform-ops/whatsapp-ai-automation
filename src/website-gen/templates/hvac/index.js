const { DEFAULT_SERVICES } = require('./common');
const { generateHomePage } = require('./home');
const { generateServicesPage } = require('./services');
const { generateAreasPage } = require('./areas');
const { generateAboutPage } = require('./about');
const { generateContactPage, generateThankYouPage } = require('./contact');

function ensureHvacDefaults(config) {
  const c = { ...config };
  if (!Array.isArray(c.services) || c.services.length === 0) {
    c.services = DEFAULT_SERVICES.map((s) => ({
      title: s.title,
      icon: s.icon,
      shortDescription: s.shortDescription,
      priceFrom: s.priceFrom,
    }));
  } else {
    // Normalize partial HVAC services: ensure icon + priceFrom fields
    c.services = c.services.map((s, i) => ({
      ...s,
      icon: s.icon || (DEFAULT_SERVICES[i] && DEFAULT_SERVICES[i].icon) || 'wrench',
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
