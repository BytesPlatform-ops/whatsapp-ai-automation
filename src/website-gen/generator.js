const { generateResponse } = require('../llm/provider');
const { WEBSITE_CONTENT_PROMPT, HVAC_CONTENT_PROMPT } = require('../llm/prompts');
const { logger } = require('../utils/logger');
const { getHeroImage } = require('./heroImage');
const { attachServiceImages } = require('./serviceImages');
const { attachHvacServiceImages } = require('./hvacServiceImages');
const { inferTimezoneFromAddress } = require('./timezone');
const { isHvac } = require('./templates');

// Luxury-biased hero queries, grouped by salon sub-type. One is picked at
// random at generation time so two similar salons get different heroes.
const SALON_HERO_QUERIES = {
  hair: [
    'luxury hair salon interior',
    'minimalist hair salon',
    'editorial hair salon',
    'upscale hair salon',
  ],
  nails: [
    'minimalist nail studio interior',
    'luxury nail salon',
    'modern nail bar interior',
  ],
  barber: [
    'luxury barber shop interior',
    'modern barber shop',
    'editorial barber shop',
  ],
  spa: [
    'luxury spa interior',
    'minimalist spa',
    'serene spa interior',
  ],
  beauty: [
    'luxury beauty salon interior',
    'minimalist beauty studio',
    'editorial beauty salon',
  ],
  default: [
    'luxury salon interior',
    'minimalist salon',
    'editorial beauty studio',
    'upscale beauty salon',
  ],
};

function pickSalonHeroQuery(industry) {
  const s = String(industry || '').toLowerCase();
  let bucket = SALON_HERO_QUERIES.default;
  if (/nail/.test(s)) bucket = SALON_HERO_QUERIES.nails;
  else if (/barber/.test(s)) bucket = SALON_HERO_QUERIES.barber;
  else if (/spa|massage|wellness/.test(s)) bucket = SALON_HERO_QUERIES.spa;
  else if (/hair/.test(s)) bucket = SALON_HERO_QUERIES.hair;
  else if (/beauty|skin|facial|lash|brow|makeup/.test(s)) bucket = SALON_HERO_QUERIES.beauty;
  return bucket[Math.floor(Math.random() * bucket.length)];
}

/**
 * Generate website content using LLM based on collected business info.
 * @param {Object} businessData - Collected business information
 * @param {Object} [extras] - Extra context (templateId, siteId) that flows through to siteConfig
 * @returns {Promise<Object>} Complete site configuration
 */
async function generateWebsiteContent(businessData, extras = {}) {
  const {
    businessName,
    industry,
    services,
    primaryColor,
    secondaryColor,
    accentColor,
    contactEmail,
    contactPhone,
    contactAddress,
    logo,
    // Salon-specific — pass-through to the salon template.
    bookingMode,
    bookingUrl,
    instagramHandle,
    weeklyHours,
    salonServices,
    timezone,
    // HVAC-specific — pass-through to the HVAC template.
    primaryCity,
    serviceAreas,
    yearsExperience,
    licenseNumber,
    googleRating,
    reviewCount,
    googleProfileUrl,
  } = businessData;

  const hasServices = Array.isArray(services) && services.length > 0;
  const hvacMode = isHvac(industry);
  // For HVAC, ensure we have a services list the LLM can write copy for —
  // if the user didn't supply any, seed from the HVAC default list so the
  // LLM generates rich descriptions that match the template's icon mapping.
  let hvacSeededServices = services;
  if (hvacMode && !hasServices) {
    const { DEFAULT_SERVICES } = require('./templates/hvac/common');
    hvacSeededServices = DEFAULT_SERVICES.map((s) => s.title);
  }
  const effectiveServicesList = hvacMode ? hvacSeededServices : services;
  const effectiveHasServices = Array.isArray(effectiveServicesList) && effectiveServicesList.length > 0;

  const prompt = hvacMode
    ? `
Business Name: ${businessName}
Industry: HVAC
Primary City: ${primaryCity || 'unspecified'}
Service Areas: ${Array.isArray(serviceAreas) && serviceAreas.length ? serviceAreas.join(', ') : (primaryCity || 'not provided')}
Services: ${effectiveHasServices ? effectiveServicesList.join(', ') : 'general HVAC services'}
Years in Business: ${yearsExperience || 'unspecified'}
License: ${licenseNumber || 'not provided'}
${contactEmail ? `Email: ${contactEmail}` : ''}
${contactPhone ? `Phone: ${contactPhone}` : ''}
${contactAddress ? `Address: ${contactAddress}` : ''}

Generate HVAC website copy. Return ONLY valid JSON matching the schema in the system prompt.`
    : `
Business Name: ${businessName}
Industry: ${industry}
Services/Products: ${hasServices ? services.join(', ') : 'None provided — skip services page'}
${contactEmail ? `Email: ${contactEmail}` : ''}
${contactPhone ? `Phone: ${contactPhone}` : ''}
${contactAddress ? `Address: ${contactAddress}` : ''}

Generate compelling website copy for this business. Return ONLY valid JSON.`;

  logger.info(`[WEBGEN] Sending ${hvacMode ? 'HVAC' : 'generic'} content prompt to LLM for "${businessName}"`);
  const response = await generateResponse(hvacMode ? HVAC_CONTENT_PROMPT : WEBSITE_CONTENT_PROMPT, [
    { role: 'user', content: prompt },
  ]);
  logger.info(`[WEBGEN] LLM response received: ${response.length} chars`);

  // Parse the LLM response as JSON
  let generatedContent;
  try {
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, response];
    generatedContent = JSON.parse(jsonMatch[1]);
  } catch (error) {
    logger.error('[WEBGEN] Failed to parse LLM JSON response, using fallback:', error.message);
    logger.debug('[WEBGEN] Raw LLM response:', response.slice(0, 500));
    // Fall back to defaults
    const servicesList = hasServices ? services : [];
    generatedContent = {
      headline: `Welcome to ${businessName}`,
      tagline: `${industry} solutions tailored for your needs`,
      heroFeatures: ['Professional', 'Reliable', 'Trusted'],
      aboutTitle: 'Our Story',
      aboutText: `${businessName} is a trusted ${industry} business committed to delivering exceptional service and results for our clients. We combine deep expertise with a client-first approach to ensure every project exceeds expectations.`,
      mission: `To deliver outstanding ${industry.toLowerCase()} solutions that help our clients succeed.`,
      vision: `To be the most trusted name in ${industry.toLowerCase()}.`,
      values: [
        { title: 'Excellence', description: 'We deliver nothing less than our best.' },
        { title: 'Integrity', description: 'Honest, transparent relationships.' },
        { title: 'Innovation', description: 'Always pushing boundaries.' },
      ],
      whyChooseUs: [
        { title: 'Expert Team', description: 'Our seasoned professionals bring years of industry experience to every project.' },
        { title: 'Proven Results', description: 'We have a track record of delivering measurable outcomes for our clients.' },
        { title: 'Client-First Approach', description: 'Your goals are our priority. We listen, adapt, and deliver.' },
      ],
      stats: [
        { number: '100+', label: 'Projects Completed' },
        { number: '50+', label: 'Happy Clients' },
        { number: '5+', label: 'Years Experience' },
      ],
      servicesTitle: servicesList.length > 0 ? 'Our Services' : '',
      services: servicesList.map((s) => ({
        title: s,
        shortDescription: `Professional ${s.toLowerCase()} services tailored to your specific needs.`,
        fullDescription: `Our ${s.toLowerCase()} services are designed to help your business grow. We work closely with you to understand your unique requirements and deliver solutions that drive real results.`,
        features: ['Custom solutions', 'Expert team', 'Fast turnaround', 'Ongoing support'],
        icon: 'star',
      })),
      servicesPageIntro: servicesList.length > 0 ? `At ${businessName}, we offer a comprehensive range of ${industry.toLowerCase()} services designed to help your business thrive.` : '',
      processSteps: servicesList.length > 0 ? [
        { title: 'Discovery', description: 'We learn about your business, goals, and challenges.' },
        { title: 'Strategy', description: 'We create a tailored plan to achieve your objectives.' },
        { title: 'Execution', description: 'Our team brings the strategy to life with precision.' },
        { title: 'Delivery', description: 'We deliver results and ensure your complete satisfaction.' },
      ] : [],
      testimonials: [
        { quote: `${businessName} exceeded our expectations. Their team is professional and incredibly responsive.`, name: 'Sarah Johnson', role: 'Business Owner' },
        { quote: 'The results speak for themselves. Highly recommend their services.', name: 'Michael Chen', role: 'Marketing Director' },
        { quote: 'A truly exceptional experience from start to finish.', name: 'Emily Rodriguez', role: 'CEO' },
      ],
      faq: [
        { question: 'How do I get started?', answer: 'Simply reach out to us via our contact page or give us a call. We will schedule a free consultation to discuss your needs.' },
        { question: 'What are your payment terms?', answer: 'We offer flexible payment options. Contact us for a custom quote tailored to your project scope.' },
        { question: 'How long does a typical project take?', answer: 'Timelines vary by project scope, but we always provide clear estimates upfront and keep you informed throughout.' },
      ],
      ctaTitle: 'Ready to Get Started?',
      ctaText: 'Contact us today for a free consultation',
      ctaButton: 'Get in Touch',
      footerTagline: `© ${new Date().getFullYear()} ${businessName}. All rights reserved.`,
      contactPageIntro: 'We would love to hear from you. Reach out and let us know how we can help.',
    };
  }

  // Build the Unsplash query from LLM-generated keywords first (it sees the full
  // business context and knows what the company actually DOES), then fall back to
  // services + industry. Industry alone is often misleading — e.g. a cleaning
  // company serving "real estate" is cleaning, not real estate.
  let imageQuery;
  if (extras.templateId === 'salon') {
    // Salon sites get a luxury-biased hero query regardless of what the LLM
    // suggested — the editorial template leans heavily on a single dramatic
    // photo, so we prefer curated aesthetic language. One query chosen at
    // random so two similar salons don't end up with identical heroes.
    imageQuery = pickSalonHeroQuery(industry);
  } else {
    imageQuery = (generatedContent.heroImageQuery || '').trim();
    if (!imageQuery) {
      if (hvacMode) {
        imageQuery = 'hvac technician service';
      } else {
        const servicesPart = hasServices ? services.slice(0, 2).join(' ') : '';
        imageQuery = [servicesPart, industry].filter(Boolean).join(' ').trim() || 'business';
      }
    }
  }

  let heroImage = null;
  try {
    heroImage = await getHeroImage(imageQuery);
    if (!heroImage) {
      logger.warn(`[WEBGEN] No hero image returned for "${imageQuery}" — check UNSPLASH_ACCESS_KEY or rate limits`);
    }
  } catch (err) {
    logger.warn(`[WEBGEN] Hero image fetch threw: ${err.message}`);
  }

  // HVAC: fetch per-service Unsplash images so the services page zigzag has
  // real visuals instead of icon-on-gradient placeholders.
  if (hvacMode && Array.isArray(generatedContent.services) && generatedContent.services.length > 0) {
    try {
      generatedContent.services = await attachHvacServiceImages(generatedContent.services);
    } catch (err) {
      logger.warn(`[WEBGEN] HVAC service image fetch failed: ${err.message}`);
    }
  }

  // For salon sites, make sure we always have a populated salonServices list
  // for the template. Two paths lead here:
  //   - The happy path: user went through the salon flow, which collected
  //     durations, so `salonServices` is already shaped.
  //   - The fallback path: user corrected the industry to "salon" at the
  //     confirmation step (so template_id=salon) but never ran the salon
  //     flow — we'd only have the plain `services` string array. Derive a
  //     default-duration salonServices list so the menu actually renders.
  let effectiveSalonServices = salonServices;
  if (
    extras.templateId === 'salon' &&
    (!Array.isArray(effectiveSalonServices) || effectiveSalonServices.length === 0) &&
    Array.isArray(services) &&
    services.length > 0
  ) {
    effectiveSalonServices = services.map((s) => ({
      name: typeof s === 'string' ? s : (s?.name || ''),
      durationMinutes: 30,
      priceText: '',
    })).filter((s) => s.name);
    logger.info(`[WEBGEN] Salon fallback: derived ${effectiveSalonServices.length} services from plain services[]`);
  }

  // Fetch per-service Unsplash images for the visual service cards. Failures
  // per-service are silent (each card falls back to a gradient tile).
  let enrichedSalonServices = effectiveSalonServices || null;
  if (extras.templateId === 'salon' && Array.isArray(effectiveSalonServices) && effectiveSalonServices.length > 0) {
    try {
      enrichedSalonServices = await attachServiceImages(effectiveSalonServices);
    } catch (err) {
      logger.warn(`[WEBGEN] Service image fetch failed: ${err.message}`);
    }
  }

  // Auto-infer timezone for salon native bookings if not already set.
  let resolvedTimezone = timezone || null;
  if (extras.templateId === 'salon' && bookingMode === 'native' && !resolvedTimezone) {
    try {
      resolvedTimezone = await inferTimezoneFromAddress(contactAddress);
      logger.info(`[WEBGEN] Inferred timezone "${resolvedTimezone}" for ${businessName}`);
    } catch (err) {
      logger.warn(`[WEBGEN] Timezone inference failed: ${err.message}`);
      resolvedTimezone = 'Europe/Dublin';
    }
  }

  // Merge generated content with business data to create full config
  const siteConfig = {
    businessName,
    industry,
    primaryColor: primaryColor || '#2563EB',
    secondaryColor: secondaryColor || '#1E40AF',
    accentColor: accentColor || '#60A5FA',
    contactEmail: contactEmail || '',
    contactPhone: contactPhone || '',
    contactAddress: contactAddress || '',
    logo: logo || null,
    heroImage,
    ...generatedContent,
    // Template selector + salon pass-through (harmless for non-salon templates).
    templateId: extras.templateId || 'business-starter',
    siteId: extras.siteId || null,
    bookingMode: bookingMode || null,
    bookingUrl: bookingUrl || null,
    instagramHandle: instagramHandle || null,
    weeklyHours: weeklyHours || null,
    salonServices: enrichedSalonServices,
    timezone: resolvedTimezone,
    // HVAC pass-through (harmless for non-HVAC templates).
    primaryCity: primaryCity || null,
    serviceAreas: Array.isArray(serviceAreas) ? serviceAreas : (primaryCity ? [primaryCity] : []),
    yearsExperience: yearsExperience || null,
    licenseNumber: licenseNumber || null,
    googleRating: googleRating || null,
    reviewCount: reviewCount || null,
    googleProfileUrl: googleProfileUrl || null,
  };

  logger.info(`Generated website content for ${businessName}${heroImage ? ' (with Unsplash hero)' : ''}`);
  return siteConfig;
}

module.exports = { generateWebsiteContent };
