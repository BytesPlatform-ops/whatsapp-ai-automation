const { generateResponse } = require('../llm/provider');
const { WEBSITE_CONTENT_PROMPT } = require('../llm/prompts');
const { logger } = require('../utils/logger');
const { getHeroImage } = require('./heroImage');

/**
 * Generate website content using LLM based on collected business info.
 * @param {Object} businessData - Collected business information
 * @returns {Promise<Object>} Complete site configuration
 */
async function generateWebsiteContent(businessData) {
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
  } = businessData;

  const hasServices = Array.isArray(services) && services.length > 0;
  const prompt = `
Business Name: ${businessName}
Industry: ${industry}
Services/Products: ${hasServices ? services.join(', ') : 'None provided — skip services page'}
${contactEmail ? `Email: ${contactEmail}` : ''}
${contactPhone ? `Phone: ${contactPhone}` : ''}
${contactAddress ? `Address: ${contactAddress}` : ''}

Generate compelling website copy for this business. Return ONLY valid JSON.`;

  logger.info(`[WEBGEN] Sending content prompt to LLM for "${businessName}"`);
  const response = await generateResponse(WEBSITE_CONTENT_PROMPT, [
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
  let imageQuery = (generatedContent.heroImageQuery || '').trim();
  if (!imageQuery) {
    const servicesPart = hasServices ? services.slice(0, 2).join(' ') : '';
    imageQuery = [servicesPart, industry].filter(Boolean).join(' ').trim() || 'business';
  }

  let heroImage = null;
  try {
    heroImage = await getHeroImage(imageQuery);
  } catch (err) {
    logger.warn(`[WEBGEN] Hero image fetch threw: ${err.message}`);
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
  };

  logger.info(`Generated website content for ${businessName}${heroImage ? ' (with Unsplash hero)' : ''}`);
  return siteConfig;
}

module.exports = { generateWebsiteContent };
