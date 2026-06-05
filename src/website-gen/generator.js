const { generateResponse } = require('../llm/provider');
const { WEBSITE_CONTENT_PROMPT, buildHvacContentPrompt, REAL_ESTATE_CONTENT_PROMPT } = require('../llm/prompts');
const { logger } = require('../utils/logger');
const { getHeroImage } = require('./heroImage');
const { attachServiceImages } = require('./serviceImages');
const { attachHvacServiceImages } = require('./hvacServiceImages');
const { attachRealEstateListingImages } = require('./realEstateListingImages');
const { attachPortfolioImages, seedPlaceholderProjects } = require('./portfolioImages');
const { selectTemplate: selectPortfolioTemplate } = require('./templates/portfolio');
const { fetchNeighborhoodImages, fetchAgentPlaceholderImage } = require('./neighborhoodImages');
const { inferTimezoneFromAddress } = require('./timezone');
const { isHvac, isRealEstate, resolveTrade } = require('./templates');
const { bcp47From } = require('../utils/localizer');

// English-default values for every static chrome label a template might render
// (nav items, button text, section eyebrows, trust badges, process steps).
// When the user's chat language is non-English, we ask the LLM to translate
// each value into that language as part of the existing single content-gen
// call (no extra round-trip). The LLM's output replaces these defaults; any
// missing key falls back to the English value here so a malformed response
// can never blank out a label.
const DEFAULT_CHROME_LABELS = {
  // Nav
  navHome: 'Home',
  navAbout: 'About',
  navServices: 'Services',
  navContact: 'Contact',
  navBooking: 'Booking',
  navProjects: 'Projects',
  navAreas: 'Service Areas',
  navListings: 'Listings',
  navNeighborhoods: 'Neighborhoods',
  // Buttons / CTAs
  btnBookNow: 'Book Now',
  btnViewServices: 'View All Services',
  btnViewAll: 'View All',
  btnLearnMore: 'Learn More',
  btnLearnMoreAboutUs: 'Learn More About Us',
  btnGetQuote: 'Get a Quote',
  btnContactUs: 'Contact Us',
  btnCallNow: 'Call Now',
  btnBrowseServices: 'Browse Services',
  btnGetStarted: 'Get Started',
  btnSendMessage: 'Send Message',
  btnBackToHome: 'Back to Home',
  btnReserve: 'Reserve',
  btnReserveVisit: 'Reserve a Visit',
  btnConfirmReservation: 'Confirm Reservation',
  btnViewMenu: 'The Menu',
  btnFullMenu: 'The Full Menu',
  btnOpenNewTab: 'Open in a new tab',
  btnScheduleCall: 'Schedule a Call',
  btnBookSession: 'Book a session',
  btnRequestQuote: 'Request a Free Quote',
  // Form labels
  formFirstName: 'First Name',
  formLastName: 'Last Name',
  formEmail: 'Email',
  formMessage: 'Message',
  formFullName: 'Full name',
  formPhone: 'Phone number',
  formNote: 'Anything we should know? (optional)',
  formTreatment: 'Treatment',
  formDate: 'Date',
  formTimes: 'Available Times',
  formLoadingTimes: 'Loading times…',
  formYourDetails: 'Your Details',
  formSending: 'Sending…',
  formErrorRetry: 'Error — try again',
  // Form placeholders — translated but should still read as obviously
  // example values (the LLM is told these are placeholder samples).
  phFirstName: 'John',
  phLastName: 'Doe',
  phEmail: 'john@example.com',
  phMessage: 'Tell us about your project…',
  // Section eyebrows / headings
  secWhatWeDo: 'What We Do',
  secAboutUs: 'About Us',
  secContactUs: 'Contact Us',
  secServices: 'Services',
  secHours: 'Hours',
  secTestimonials: 'What Our Customers Say',
  secServiceAreas: 'Service Areas',
  secSignatureServices: 'Signature Services',
  secOurServices: 'Our Services',
  secHowItWorks: 'How It Works',
  secOurProcess: 'Our Process',
  secClientsSay: 'What Our Clients Say',
  secFAQ: 'FAQ',
  secFAQHeading: 'Frequently Asked Questions',
  secInTheChair: 'In the chair',
  secOurStory: 'Our Story',
  secAppointmentsOpen: 'Appointments now open',
  secReserved: 'Reserved',
  secMethod: 'Method',
  secHowIWork: 'How I work',
  // Contact / thank-you page copy
  introGetInTouch: 'Get In Touch',
  introContactBody: 'We would love to hear from you.',
  introSendUs: 'Send Us a Message',
  introSendUsBody: "Fill out the form below and we'll get back to you soon.",
  thankYouHeading: 'Message received',
  thankYouBody: "Thanks for reaching out. We'll review what you've sent and get back to you within",
  thankYouHours: '24 hours',
  thankYouEmailNote: 'A confirmation is on its way to',
  thankYouCheckSpam: 'Check your inbox (and spam, just in case).',
  thankYouTitle: 'Thank you.',
  confirmEmailNote: 'A confirmation email with a cancellation link will arrive shortly after.',
  confirmationOnItsWay: 'Your confirmation email is on its way.',
  bookingFailed: 'Booking failed',
  couldNotLoadTimes: 'Could not load times',
  // Footer
  footPages: 'Pages',
  footVisit: 'Visit',
  footFollow: 'Follow',
  footAllRights: 'All rights reserved',
  footPrivacy: 'Privacy Policy',
  footHandcrafted: 'Handcrafted in',
  footBookAVisit: 'Book a visit',
  // HVAC trust badges + extras
  badgeLicensed: 'Licensed & Insured',
  badgeSameDay: 'Same-Day Service',
  badgeUpfront: 'Upfront Pricing',
  badgeSatisfaction: '100% Satisfaction Guarantee',
  badgeEmergency24x7: '24/7 Emergency Service Available',
  badgeTagline: 'Licensed, insured, and here when you need us most.',
  // Misc labels
  lblClosed: 'Closed',
  lblLocation: 'Location',
  lblScroll: 'Scroll',
  // Salon template chrome (previously hardcoded English in salon.js — moved
  // here so non-English sites translate them in the same content-gen call).
  heroEyebrow: 'Atelier & Salon',
  heroReservations: 'Reservations',
  heroReservationsNote: 'Online in under a minute',
  heroCancellation: 'Cancellation',
  heroCancellationNote: 'Free up to 24h before',
  lblAddress: 'Address',
  lblCallUs: 'Call us',
  sigSubtitle: 'A curated list of the treatments our regulars return for. Every appointment is handled by a senior stylist — no shortcuts.',
  igFollowAlong: 'Follow along for our latest work.',
  igBody: 'Fresh transformations, styling notes, and the occasional behind-the-chair moment. No filters required.',
  secReservations: 'Reservations',
  aboutComeSee: 'Come and see for yourself.',
  aboutComeSeeBody: 'Book a treatment online, or call us if you would rather chat it through first.',
  servicesIntro: 'Every treatment below is handled by a trained stylist. Reserve one online, or give us a call — we are happy to help you pick the right one.',
  menuComingSoon: 'Menu coming soon — give us a call to book.',
  bookingReserveVisitTitle: 'Reserve a visit',
  bookingManaged: 'Managed by our booking partner.',
  bookingTimesShownIn: 'Times shown in',
  bookingNativeNote: 'Free cancellation up to 24 hours before your visit.',
  bookingPhoneNote: 'Give us a call to reserve your spot.',
  bookByPhone: 'Book by phone',
  bookByPhoneBody: 'Give us a call and we will get you in.',
  lblCallPrefix: 'Call',
  // Salon contact page
  contactFindUs: 'Find us',
  contactInPerson: 'In person',
  contactOpeningHours: 'Opening hours',
  contactLastBooking: 'Last booking 30 min before close.',
  contactWriteToUs: 'Write to us',
  contactSendNote: 'Send a note',
  contactSendNoteBody: "For questions, private events, or a service you can't find — we'll write back shortly.",
  contactInTouch: "We'll be in touch soon.",
  contactSendError: 'Something went wrong — please try again or email us directly.',
  contactSeeYouSoon: 'See you soon',
  contactWarmWelcome: 'A warm welcome awaits.',
  lblOptional: 'optional',
  phPhone: '+1 (555) 123-4567',
  phLookingFor: "Tell us what you're looking for…",
  // Salon thank-you page. __NAME__ is a placeholder token the booking JS
  // substitutes with the guest's first name — kept verbatim through
  // translation (the localizer preserves placeholder values).
  tyConfirmed: 'Your reservation is confirmed. We look forward to seeing you.',
  tyGreetingName: 'Hi __NAME__, your reservation is confirmed. We look forward to seeing you.',
  tyWhen: 'When',
  tyTimezone: 'Timezone',
  // Salon manifesto / about pull-quote fallbacks (only used when LLM aboutText
  // has no sentence of pull-quote length — kept translated for completeness).
  salonQuoteFallback: 'Every appointment is a chance to make someone feel a little more themselves.',
  salonPullQuoteFallback: 'We believe a salon should feel like a retreat, not a rush.',
  // Salon booking inline-JS validation copy (injected as JSON into the page
  // script — same mechanism as couldNotLoadTimes / bookingFailed below).
  noTimesAvailable: 'No times available this day.',
  pickTime: 'Please pick a time.',
  enterName: 'Please enter your name.',
  shareContact: 'Please share an email or phone so we can confirm.',
  agreePrivacy: 'Please agree to the Privacy Policy to continue.',
  bookingInProgress: 'Booking…',
  networkErrorPrefix: 'Network error',
  // Portfolio process-step defaults (used when no LLM-generated processSteps)
  procDiscovery: 'Discovery',
  procDirection: 'Direction',
  procRefinement: 'Refinement',
  procDelivery: 'Delivery',
  procStrategy: 'Strategy',
  procExecution: 'Execution',
  // Portfolio side panel labels
  pfExpertise: 'Expertise',
  pfAvailability: 'Availability',
  pfToolkit: 'Toolkit',
  pfReachOut: 'Reach out',
  pfBased: 'Based',
  // Activation banner shown on un-paid previews (visible to the business
  // owner and to early visitors before payment).
  bnrPreviewMode: 'PREVIEW MODE',
  bnrActivateNow: 'Activate Now',
  bnrActivateText: 'Activate this site to make it live',
  bnrFormLock: 'Contact forms activate once the site is published — click Activate above.',
  bnrWatermark: 'Preview — Built by Pixie',
};

// Build the "translate these labels too" tail of the content-gen prompt. When
// userLanguage is English we ask for no extra field — the fallbacks already
// match. Otherwise we hand the LLM the English values and ask for the same
// keys in the user's language, embedded in the SAME JSON it's already
// returning.
function buildLabelsDirective(userLanguage) {
  if (userLanguage === 'english') return '';
  const entries = Object.entries(DEFAULT_CHROME_LABELS)
    .map(([k, v]) => `  "${k}": "${v.replace(/"/g, '\\"')}"`)
    .join(',\n');
  return `

ALSO include a "labels" object in your JSON response. Translate each value below into ${userLanguage} (the user's language). Use natural phrasing for the locale — don't word-for-word translate. Keep keys exactly as listed. Preserve any ALL-CAPS placeholder token wrapped in double underscores (e.g. __NAME__) EXACTLY as-is — it is substituted at runtime, do not translate or remove it. If the language label starts with "roman-" (e.g. roman-urdu), use Latin/Roman script, NOT the native alphabet.

Format:
"labels": {
${entries}
}`;
}

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
    logoUrl,
    // Salon-specific — pass-through to the salon template.
    bookingMode,
    bookingUrl,
    instagramHandle,
    // Portfolio profile handles + work history — forwarded so the portfolio
    // templates (which read c.githubHandle / c.linkedinHandle / c.experience…)
    // actually render the user's links and real experience instead of defaults.
    githubHandle,
    linkedinHandle,
    twitterHandle,
    behanceHandle,
    experience,
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
    // Real-estate-specific — pass-through to the real-estate template.
    brokerageName,
    homesSold,
    volumeClosed,
    designations,
    specialty,
    calendlyUrl,
    // Site-wide currency (ISO code) collected at WEB_COLLECT_LISTINGS_CURRENCY
    // or the Flow form. Used as the default for every listing's currency so
    // real and placeholder prices render in the right symbol.
    currency: siteCurrency,
    // User-provided listings (from the WhatsApp collection flow). When
    // present, these override the LLM-generated featuredListings so the
    // site shows real properties instead of hallucinated ones.
    listings: userListings,
    // Portfolio-specific pass-through. aboutText is collected at
    // WEB_COLLECT_ABOUT (or auto-generated when the user skips); projects
    // come from the iterative WEB_COLLECT_PROJECTS_DETAILS flow.
    aboutText: userAboutText,
    projects: userProjects,
    // Optional headshot for the About section (Flow "A photo of you" picker).
    // Photographer/general templates render c.aboutPhotoUrl; absent → no circle.
    aboutPhotoUrl,
    // Creative niche chosen explicitly (Flow dropdown / chat). Drives the
    // sub-template (photographer/designer/developer/general) and the
    // niche-appropriate hero + project image queries.
    portfolioNiche,
    industryKey,
    // Caller-supplied hero image override. Skips the Unsplash API call
    // entirely — useful for demo fixtures and rate-limit recovery.
    heroImage: heroImageOverride,
  } = businessData;

  const hasServices = Array.isArray(services) && services.length > 0;
  const hvacMode = isHvac(industry, industryKey);
  const realEstateMode = isRealEstate(industry, industryKey);
  const portfolioMode = extras.templateId === 'portfolio';
  // Resolve the exact sub-template the router will render (honors the explicit
  // niche, else keyword heuristic) so hero query, seed projects, and per-card
  // image queries all match what actually renders. Stamped onto siteConfig
  // below so the template router reuses this decision verbatim.
  const portfolioTpl = portfolioMode
    ? selectPortfolioTemplate({ industry, services, portfolioNiche })
    : null;
  // Plumbing shares the HVAC template; resolveTrade tells us which variant
  // the user lands on so LLM copy and seeded defaults match the trade.
  const trade = hvacMode ? resolveTrade(industry) : null;
  // If the user didn't supply services, seed from the trade-appropriate
  // default list so the LLM writes rich descriptions that match the
  // template's icon mapping (HVAC defaults for HVAC, plumbing for plumbing).
  let hvacSeededServices = services;
  if (hvacMode && !hasServices) {
    const { DEFAULT_SERVICES, PLUMBING_DEFAULT_SERVICES } = require('./templates/hvac/common');
    const defaults = trade === 'plumbing' ? PLUMBING_DEFAULT_SERVICES : DEFAULT_SERVICES;
    hvacSeededServices = defaults.map((s) => s.title);
  }
  const effectiveServicesList = hvacMode ? hvacSeededServices : services;
  const effectiveHasServices = Array.isArray(effectiveServicesList) && effectiveServicesList.length > 0;

  // Language directive for the LLM. Without an explicit anchor here,
  // the WEBSITE_CONTENT_PROMPT's "same language as user" instruction
  // has nothing to detect from — the LLM only sees a structured
  // business-data block and has been observed free-associating to
  // French / Spanish based on industry keywords (e.g. "salon"). The
  // caller (generateWebsite in webDev.js) resolves the user's actual
  // chat language via the localizer and passes it via extras.
  // Defaults to English when not provided so older callers don't
  // regress to the buggy "guess the language" behavior.
  const userLanguage = String(extras.userLanguage || 'english').trim().toLowerCase();
  const languageDirective = userLanguage === 'english'
    ? '\n\nLANGUAGE: Write ALL website copy in English. Even if the business name or industry contains words from another language (e.g. "Salon" is a French word but commonly used in English business names), the user has been chatting in ENGLISH — write the entire site in ENGLISH.'
    : `\n\nLANGUAGE: Write ALL website copy in ${userLanguage}. The user has been chatting in ${userLanguage} so all hero copy, headings, body paragraphs, service descriptions, FAQs, testimonials, CTAs, and labels MUST be written in ${userLanguage}. Proper nouns (business name, city names) stay as given. If the language label starts with "roman-" (e.g. roman-urdu), write in Latin/Roman script — do NOT use the native script.`;
  const labelsDirective = buildLabelsDirective(userLanguage);

  let prompt;
  let systemPrompt;
  let promptLabel;
  if (hvacMode) {
    const tradeLabelUpper = trade === 'plumbing' ? 'Plumbing' : 'HVAC';
    promptLabel = tradeLabelUpper;
    systemPrompt = buildHvacContentPrompt(trade);
    prompt = `
Business Name: ${businessName}
Industry: ${tradeLabelUpper}
Primary City: ${primaryCity || 'unspecified'}
Service Areas: ${Array.isArray(serviceAreas) && serviceAreas.length ? serviceAreas.join(', ') : (primaryCity || 'not provided')}
Services: ${effectiveHasServices ? effectiveServicesList.join(', ') : `general ${tradeLabelUpper.toLowerCase()} services`}
${userAboutText ? `What the business does (owner's words): ${userAboutText}` : ''}
Years in Business: ${yearsExperience || 'unspecified'}
License: ${licenseNumber || 'not provided'}
${contactEmail ? `Email: ${contactEmail}` : ''}
${contactPhone ? `Phone: ${contactPhone}` : ''}
${contactAddress ? `Address: ${contactAddress}` : ''}

Generate ${tradeLabelUpper} website copy. Return ONLY valid JSON matching the schema in the system prompt.${languageDirective}${labelsDirective}`;
  } else if (realEstateMode) {
    promptLabel = 'real-estate';
    systemPrompt = REAL_ESTATE_CONTENT_PROMPT;
    prompt = `
Agent Name: ${businessName}
Brokerage: ${brokerageName || 'not specified'}
Primary City: ${primaryCity || 'unspecified'}
Neighborhoods Served: ${Array.isArray(serviceAreas) && serviceAreas.length ? serviceAreas.join(', ') : (primaryCity || 'not provided')}
Years in Business: ${yearsExperience || 'unspecified'}
Homes Sold: ${homesSold || 'not specified'}
Volume Closed: ${volumeClosed || 'not specified'}
Designations: ${Array.isArray(designations) && designations.length ? designations.join(', ') : 'not specified'}
Specialty: ${specialty || 'not specified'}
${userAboutText ? `About the agent (their words): ${userAboutText}` : ''}
License: ${licenseNumber || 'not provided'}
${contactEmail ? `Email: ${contactEmail}` : ''}
${contactPhone ? `Phone: ${contactPhone}` : ''}
${contactAddress ? `Address: ${contactAddress}` : ''}
${hasServices ? `How I help: ${services.join(', ')}` : ''}

Generate real-estate-agent website copy. Return ONLY valid JSON matching the schema in the system prompt.${languageDirective}${labelsDirective}`;
  } else {
    promptLabel = 'generic';
    systemPrompt = WEBSITE_CONTENT_PROMPT;
    prompt = `
Business Name: ${businessName}
Industry: ${industry}
Services/Products: ${hasServices ? services.join(', ') : 'None provided — skip services page'}
${userAboutText ? `What the business does (owner's words): ${userAboutText}` : ''}
${contactEmail ? `Email: ${contactEmail}` : ''}
${contactPhone ? `Phone: ${contactPhone}` : ''}
${contactAddress ? `Address: ${contactAddress}` : ''}

Generate compelling website copy for this business. Return ONLY valid JSON.${languageDirective}${labelsDirective}`;
  }

  logger.info(`[WEBGEN] Sending ${promptLabel} content prompt to LLM for "${businessName}"`);
  const response = await generateResponse(
    systemPrompt,
    [{ role: 'user', content: prompt }],
    { userId: extras.userId, operation: 'website_content_gen' }
  );
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
        // Hero query tuned per trade — each produces meaningfully different
        // Unsplash results. Keep these in sync with TRADE_COPY / HVAC_TRADE_PHRASES.
        const HERO_QUERY = {
          hvac: 'hvac technician service',
          plumbing: 'plumber service work',
          electrical: 'electrician working panel',
          roofing: 'residential roofing crew',
          appliance: 'appliance repair technician',
          'garage-door': 'garage door installation',
          locksmith: 'locksmith changing lock',
          'pest-control': 'pest control technician',
          'water-damage': 'water damage restoration',
          'tree-service': 'tree removal crew',
        };
        imageQuery = HERO_QUERY[trade] || HERO_QUERY.hvac;
      } else if (realEstateMode) {
        imageQuery = primaryCity ? `${primaryCity} skyline` : 'luxury home interior';
      } else if (portfolioMode) {
        // Hero query tuned to the resolved creative sub-template.
        const PORTFOLIO_HERO = {
          photographer: 'editorial photography portrait',
          designer: 'design studio workspace',
          developer: 'developer workspace code',
          general: 'creative studio workspace',
        };
        imageQuery = PORTFOLIO_HERO[portfolioTpl] || PORTFOLIO_HERO.general;
      } else {
        // Build a tighter query from the first service + industry. Strip the
        // same noise words heroImage.js would strip so we don't waste tokens
        // on "services/solutions/business" filler that Unsplash misranks.
        const noise = /\b(services?|solutions?|company|business|professional|corporate|industry|consulting|consultation|agency)\b/gi;
        const servicePart = hasServices
          ? String(services[0] || '').replace(noise, '').trim()
          : '';
        const industryPart = String(industry || '').replace(noise, '').trim();
        imageQuery = [servicePart, industryPart].filter(Boolean).join(' ').trim() || 'modern workplace';
      }
    }
    logger.info(`[WEBGEN] Hero image query: "${imageQuery}" (template=${extras.templateId || 'business-starter'})`);
  }

  let heroImage = null;
  if (heroImageOverride && heroImageOverride.url) {
    heroImage = heroImageOverride;
    logger.info(`[WEBGEN] Using caller-supplied hero image (skipping Unsplash)`);
  } else {
    try {
      heroImage = await getHeroImage(imageQuery);
      if (!heroImage) {
        logger.warn(`[WEBGEN] No hero image returned for "${imageQuery}" — check PEXELS_API_KEY or rate limits`);
      }
    } catch (err) {
      logger.warn(`[WEBGEN] Hero image fetch threw: ${err.message}`);
    }
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

  // Generic / business-starter: fetch per-service Unsplash images. Passes
  // `mode: 'generic'` + industry so sharpenGenericQuery anchors queries on
  // the business context (e.g. "pipe cleaning plumbing") instead of the
  // salon-biased default. Skipped for HVAC (uses attachHvacServiceImages
  // above), salon (uses attachServiceImages below on salonServices), and
  // real estate (uses its own listing/neighborhood fetchers below).
  if (
    !hvacMode &&
    !realEstateMode &&
    !portfolioMode &&
    extras.templateId !== 'salon' &&
    Array.isArray(generatedContent.services) &&
    generatedContent.services.length > 0
  ) {
    try {
      const probes = generatedContent.services.map((s) => ({
        name: s.title || s.name || '',
        industry,
      }));
      const enriched = await attachServiceImages(probes, { mode: 'generic', industry });
      generatedContent.services = generatedContent.services.map((s, i) => ({
        ...s,
        image: enriched[i]?.image || null,
      }));
      const withImgs = generatedContent.services.filter((s) => s.image).length;
      logger.info(`[WEBGEN] Generic: attached Unsplash images to ${withImgs}/${generatedContent.services.length} services (industry="${industry}")`);
    } catch (err) {
      logger.warn(`[WEBGEN] Generic service image fetch failed: ${err.message}`);
    }
  }

  // Real estate: fetch per-listing, per-neighborhood, and agent-placeholder
  // Unsplash images in parallel so the template has real visuals instead of
  // solid-navy blocks.
  let neighborhoodImages = {};
  let agentPlaceholderImage = null;
  if (realEstateMode) {
    // Prefer user-provided listings (from the WhatsApp collection flow) over
    // LLM-hallucinated ones. If the user gave a photoUrl, attach it as
    // `image` so attachRealEstateListingImages skips Unsplash for that row.
    if (Array.isArray(userListings) && userListings.length > 0) {
      generatedContent.featuredListings = userListings.map((l) => ({
        address: l.address || 'Address on request',
        price: Number(l.price) || 0,
        currency: l.currency || siteCurrency || null,
        beds: Number(l.beds) || 3,
        baths: Number(l.baths) || 2,
        sqft: Number(l.sqft) || 1800,
        status: l.status || 'For Sale',
        neighborhood: l.neighborhood || (Array.isArray(serviceAreas) && serviceAreas[0]) || '',
        image: l.photoUrl
          ? { url: l.photoUrl, photographer: '', photographerUrl: '', unsplashUrl: '' }
          : undefined,
      }));
      logger.info(`[WEBGEN] Using ${userListings.length} user-provided listings (${userListings.filter((l) => l.photoUrl).length} with photos)`);
    }
    // Stamp the site currency onto any listing that lacks one — covers the
    // LLM-generated placeholder listings used when the agent skipped the
    // listings step, so a non-USD agent doesn't get "$" placeholder prices.
    if (siteCurrency && Array.isArray(generatedContent.featuredListings)) {
      generatedContent.featuredListings = generatedContent.featuredListings.map((l) => (
        l && !l.currency ? { ...l, currency: siteCurrency } : l
      ));
    }
    const [listingRes, neighRes, agentRes] = await Promise.allSettled([
      Array.isArray(generatedContent.featuredListings) && generatedContent.featuredListings.length > 0
        ? attachRealEstateListingImages(generatedContent.featuredListings)
        : Promise.resolve(generatedContent.featuredListings || []),
      fetchNeighborhoodImages(primaryCity, Array.isArray(serviceAreas) ? serviceAreas.slice(0, 8) : []),
      fetchAgentPlaceholderImage(),
    ]);
    if (listingRes.status === 'fulfilled') {
      generatedContent.featuredListings = listingRes.value;
    } else {
      logger.warn(`[WEBGEN] Real estate listing image fetch failed: ${listingRes.reason?.message}`);
    }
    if (neighRes.status === 'fulfilled') {
      neighborhoodImages = neighRes.value || {};
    } else {
      logger.warn(`[WEBGEN] Neighborhood image fetch failed: ${neighRes.reason?.message}`);
    }
    if (agentRes.status === 'fulfilled') {
      agentPlaceholderImage = agentRes.value;
    } else {
      logger.warn(`[WEBGEN] Agent placeholder image fetch failed: ${agentRes.reason?.message}`);
    }
  }

  // Portfolio: fill the work grid with niche-appropriate photos. Use the
  // user's projects when present, else seed real-looking placeholders so the
  // grid isn't empty — either way attachPortfolioImages adds a Pexels photo to
  // any card the user didn't supply one for. Runs against the FINAL projects
  // array so the template renders images instead of typographic placeholders.
  let portfolioProjects = null;
  if (portfolioMode) {
    portfolioProjects = Array.isArray(userProjects) && userProjects.length
      ? userProjects
      : seedPlaceholderProjects(portfolioTpl);
    try {
      portfolioProjects = await attachPortfolioImages(portfolioProjects, { template: portfolioTpl, industry });
    } catch (err) {
      logger.warn(`[WEBGEN] Portfolio image fetch failed: ${err.message}`);
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
    // logoUrl — public URL of the user's uploaded logo (after background
    // removal via src/website-gen/logoProcessor.js). Templates render this
    // in the nav; c.logo is kept as a legacy field for any pre-existing
    // paths that may still write to it.
    logoUrl: logoUrl || null,
    heroImage,
    ...generatedContent,
    // Portfolio templates read `services` as the user's flat skills/tools list
    // (→ skills grid, marquee tech ribbon, terminal stack). The LLM content
    // pass does NOT reliably echo the user's skills into generatedContent.services
    // (it returns business-services copy or omits them), so the user's real
    // skills were getting dropped and the template fell back to its default
    // placeholder stack. Forward the raw user-provided skills here instead; an
    // empty list still lets the template seed a sensible default. Non-portfolio
    // templates keep the LLM's services objects (used by the services page).
    services: portfolioMode
      ? (Array.isArray(services) ? services : [])
      : generatedContent.services,
    // Template selector + salon pass-through (harmless for non-salon templates).
    templateId: extras.templateId || 'business-starter',
    siteId: extras.siteId || null,
    // Activation banner state — 'preview' by default; flips to 'paid' via
    // redeployAsPaid() after the payment poller confirms a successful
    // Stripe charge. paymentLinkUrl is the Stripe URL the banner points to.
    paymentStatus: extras.paymentStatus || 'preview',
    paymentLinkUrl: extras.paymentLinkUrl || null,
    // Combined website+domain price shown on the activation banner. When a
    // 22h discount has been applied, originalAmount stays at the pre-discount
    // total and discountPct > 0 so the banner renders strikethrough + badge.
    activationAmount: extras.activationAmount || null,
    originalAmount: extras.originalAmount || null,
    discountPct: extras.discountPct || 0,
    bookingMode: bookingMode || null,
    bookingUrl: bookingUrl || null,
    instagramHandle: instagramHandle || null,
    // Portfolio profile handles → social CTAs / GitHub section / contact links.
    githubHandle: githubHandle || null,
    linkedinHandle: linkedinHandle || null,
    twitterHandle: twitterHandle || null,
    behanceHandle: behanceHandle || null,
    // Real work history (resume intake) → experience timeline; null falls back
    // to the template's placeholder entries.
    experience: Array.isArray(experience) && experience.length ? experience : null,
    weeklyHours: weeklyHours || null,
    salonServices: enrichedSalonServices,
    timezone: resolvedTimezone,
    // HVAC pass-through (harmless for non-HVAC templates). trade is
    // 'hvac' | 'plumbing' | null — threaded down so ensureHvacDefaults
    // inside the template skips re-running the regex.
    trade: trade || null,
    primaryCity: primaryCity || null,
    serviceAreas: Array.isArray(serviceAreas) ? serviceAreas : (primaryCity ? [primaryCity] : []),
    yearsExperience: yearsExperience || null,
    licenseNumber: licenseNumber || null,
    googleRating: googleRating || null,
    reviewCount: reviewCount || null,
    googleProfileUrl: googleProfileUrl || null,
    // Real-estate pass-through (harmless for non-real-estate templates).
    brokerageName: brokerageName || null,
    homesSold: homesSold || null,
    volumeClosed: volumeClosed || null,
    designations: Array.isArray(designations) ? designations : null,
    specialty: specialty || null,
    calendlyUrl: calendlyUrl || null,
    neighborhoodImages,
    agentPlaceholderImage,
    // Portfolio pass-through (harmless for non-portfolio templates). For
    // portfolio sites this is the image-enriched array (user projects or
    // seeded placeholders, each with a Pexels photo); otherwise null so the
    // template uses its own defaults.
    projects: portfolioMode
      ? portfolioProjects
      : (Array.isArray(userProjects) && userProjects.length ? userProjects : null),
    portfolioAbout: userAboutText || null,
    aboutPhotoUrl: aboutPhotoUrl || null,
    // Niche + resolved sub-template. portfolioTemplate is stamped so the
    // template router (selectTemplate) reuses this exact decision.
    portfolioNiche: portfolioNiche || null,
    portfolioTemplate: portfolioTpl || null,
    // Language metadata. htmlLang feeds <html lang="..."> in every template;
    // bcp47Locale powers Intl.DateTimeFormat for weekday names (salon hours).
    // labels is the static chrome dictionary — LLM-translated when the user
    // is non-English, English defaults otherwise. The merge below guarantees
    // every key exists even if the LLM omitted some, so templates can read
    // `siteConfig.labels.navHome` without short-circuit fallbacks every time.
    userLanguage,
    htmlLang: bcp47From(userLanguage),
    bcp47Locale: bcp47From(userLanguage),
    labels: { ...DEFAULT_CHROME_LABELS, ...(generatedContent.labels || {}) },
  };

  logger.info(`Generated website content for ${businessName}${heroImage ? ' (with Unsplash hero)' : ''}`);
  // Single chokepoint for HTML/URL safety. Even with the per-template
  // esc() calls in place, this catches anything a future template author
  // forgets to escape and nulls out URL fields that don't pass strict
  // validation (e.g. javascript: in logoUrl).
  const { sanitizeSiteConfig } = require('./sanitizeConfig');
  return sanitizeSiteConfig(siteConfig);
}

module.exports = { generateWebsiteContent };
