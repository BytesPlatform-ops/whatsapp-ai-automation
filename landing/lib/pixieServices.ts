/**
 * Pixie service-page content — the single source of truth for the six
 * dedicated product pages (/ai-receptionist, /website-builder, …). Each entry
 * is PURE DATA (no React/icons) so a server page can hand it straight to the
 * client <ServicePage> without serialization issues.
 *
 * Accent/soft colours mirror the homepage hero ROLE_THEMES
 * (components/pixie/mascot-role-hero/roleThemes.ts) so a role looks identical
 * whether the user meets it in the flying-robot hero or on its product page.
 */

export interface ServiceAddOnFollowUp {
  /** Question shown when this add-on is selected. */
  question: string;
  /** 2 mutually-exclusive choices. */
  options: string[];
}

export interface ServiceAddOn {
  id: string;
  title: string;
  blurb: string;
  /** Small chip — "Recommended" | "Popular" | "Best next step". */
  badge: string;
  /** Optional upsell follow-up that slides open when the add-on is selected. */
  followUp?: ServiceAddOnFollowUp;
}

export interface ServiceRelated {
  label: string;
  href: string;
}

export interface ServiceConfig {
  /** URL slug, also the route segment. */
  slug: string;
  /** Maps to ROLE_THEMES id (greeter/architect/…) for parity. */
  themeId: 'greeter' | 'architect' | 'creator' | 'star' | 'analyst' | 'core';
  accent: string;
  soft: string;
  /** Human label used in the form payload + page chrome. */
  serviceLabel: string;

  eyebrow: string;
  headline: string;
  sub: string;
  primaryCta: string;
  secondaryCta: string;

  /** Full-body Pixie (morph start) + role "form" cutout (morph end). */
  avatarFull: string;
  avatarForm: string;

  /** Stacked big-text lines that reveal on scroll. */
  bigTextLines: string[];
  /** The accented pay-off line revealed after the stack. */
  bigTextReveal: string;

  /** Page-specific marquee items. */
  ticker: string[];

  /** "What Pixie does for you" story cards. */
  storyCards: string[];
  /** "What we need from you" requirement cards. */
  requirements: string[];

  packageName: string;
  packageDesc: string;

  addOns: ServiceAddOn[];

  /** Final submit button label. */
  submitLabel: string;
  /** Subject line for the request email. */
  emailSubject: string;

  related: ServiceRelated[];
}

export const PIXIE_SERVICES: Record<string, ServiceConfig> = {
  'ai-receptionist': {
    slug: 'ai-receptionist',
    themeId: 'greeter',
    accent: '#E6B45A',
    soft: '#F2CE86',
    serviceLabel: 'AI Receptionist',
    eyebrow: 'AI RECEPTIONIST',
    headline: 'Your next customer called. Did anyone answer?',
    sub: 'Pixie answers questions, captures leads, and keeps conversations moving even when your team is busy.',
    primaryCta: 'Start Receptionist Setup',
    secondaryCta: 'See How It Works',
    avatarFull: '/images/pixie/forms/normal.png',
    avatarForm: '/images/pixie/forms/receptionist.webp',
    bigTextLines: ['Missed call.', 'Missed lead.', 'Missed money.'],
    bigTextReveal: 'Pixie answers before they leave.',
    ticker: ['CALL ANSWERED', 'LEAD CAPTURED', 'FOLLOW-UP READY', 'CUSTOMER ROUTED', 'BOOKING REQUEST SAVED'],
    storyCards: [
      'Answers common questions',
      'Captures customer details',
      'Routes urgent leads',
      'Collects booking requests',
      'Sends follow-up summaries',
      'Works across chat channels',
    ],
    requirements: [
      'Business name',
      'Main service or offer',
      'Preferred contact method',
      'Common customer questions',
      'Business hours',
      'Where leads should go',
    ],
    packageName: 'Receptionist Starter',
    packageDesc:
      'A simple AI receptionist setup that answers common questions and captures lead details for your business.',
    addOns: [
      {
        id: 'website-audit',
        title: 'Website Audit',
        blurb: 'Check if your website is losing leads before they contact you.',
        badge: 'Recommended',
        followUp: {
          question: 'Would you like Pixie to include quick fixes or a full growth audit?',
          options: ['Quick fixes', 'Full growth audit'],
        },
      },
      {
        id: 'chat-widget',
        title: 'Website Chat Widget',
        blurb: 'Add Pixie directly to your site so visitors can ask questions instantly.',
        badge: 'Popular',
      },
      {
        id: 'channel-connection',
        title: 'Channel Connection',
        blurb: 'Connect WhatsApp, Instagram, or Messenger into the same flow.',
        badge: 'Best next step',
      },
    ],
    submitLabel: 'Send My Receptionist Request',
    emailSubject: 'New Pixie Receptionist Request',
    related: [
      { label: 'Omnichannel AI', href: '/omnichannel-ai' },
      { label: 'SEO Growth Audit', href: '/seo-audit' },
      { label: 'Website Builder', href: '/website-builder' },
    ],
  },

  'website-builder': {
    slug: 'website-builder',
    themeId: 'architect',
    accent: '#3B82F6',
    soft: '#60A5FA',
    serviceLabel: 'Website Builder',
    eyebrow: 'WEBSITE BUILDER',
    headline: 'Still waiting on your website?',
    sub: 'Tell Pixie what your business does and get a branded website direction without waiting weeks for the first draft.',
    primaryCta: 'Start Website Build',
    secondaryCta: 'See Website Ideas',
    avatarFull: '/images/pixie/forms/normal.png',
    avatarForm: '/images/pixie/forms/website.webp',
    bigTextLines: ['No blank page.', 'No endless brief.', 'No waiting weeks.'],
    bigTextReveal: 'Pixie turns your business idea into a website direction.',
    ticker: ['HOMEPAGE IDEA', 'MOBILE LAYOUT', 'BRAND DIRECTION', 'CTA COPY', 'SERVICE SECTIONS', 'DOMAIN READY'],
    storyCards: [
      'Creates homepage direction',
      'Writes section copy',
      'Suggests visual style',
      'Plans mobile layout',
      'Creates CTA flow',
      'Prepares launch checklist',
    ],
    requirements: [
      'Business name',
      'Industry',
      'Main services',
      'Brand style preference',
      'Pages needed',
      'Logo / assets if available',
      'Domain status',
    ],
    packageName: 'Website Launch Starter',
    packageDesc:
      'A guided website setup that turns your business details into a clear branded website direction.',
    addOns: [
      {
        id: 'seo-growth-audit',
        title: 'SEO Growth Audit',
        blurb: 'Check what your website needs to rank and convert better.',
        badge: 'Recommended',
        followUp: {
          question: 'Do you want a basic site check or a full SEO action plan?',
          options: ['Basic site check', 'Full SEO action plan'],
        },
      },
      {
        id: 'ai-receptionist',
        title: 'AI Receptionist',
        blurb: 'Capture leads from your website once traffic starts coming in.',
        badge: 'Popular',
      },
      {
        id: 'content-starter',
        title: 'Content Starter Pack',
        blurb: 'Get launch captions and post ideas for the new website.',
        badge: 'Best next step',
      },
    ],
    submitLabel: 'Send My Website Request',
    emailSubject: 'New Pixie Website Request',
    related: [
      { label: 'SEO Growth Audit', href: '/seo-audit' },
      { label: 'AI Receptionist', href: '/ai-receptionist' },
      { label: 'Social Content', href: '/social-media-marketing' },
    ],
  },

  'social-media-marketing': {
    slug: 'social-media-marketing',
    themeId: 'creator',
    accent: '#EC4899',
    soft: '#F472B6',
    serviceLabel: 'Social Media Marketing',
    eyebrow: 'CONTENT',
    headline: 'Is your brand posting… or disappearing?',
    sub: 'Pixie helps turn offers, ideas, and business updates into content directions your audience can actually notice.',
    primaryCta: 'Start Content Setup',
    secondaryCta: 'See Content Ideas',
    avatarFull: '/images/pixie/forms/normal.png',
    avatarForm: '/images/pixie/forms/social.webp',
    bigTextLines: ['The scroll does not wait.', 'Your brand should not disappear.'],
    bigTextReveal: 'Pixie keeps your content moving.',
    ticker: ['HOOKS', 'CAPTIONS', 'POST IDEAS', 'CAMPAIGN ANGLES', 'REELS', 'CAROUSELS', 'CONTENT CALENDAR'],
    storyCards: [
      'Creates post ideas',
      'Writes captions and hooks',
      'Suggests campaign angles',
      'Plans content calendars',
      'Turns offers into posts',
      'Creates story / reel directions',
    ],
    requirements: [
      'Business type',
      'Audience',
      'Offer / product',
      'Preferred platforms',
      'Brand tone',
      'Content goal',
      'Existing social links',
    ],
    packageName: 'Content Starter Sprint',
    packageDesc:
      'A fast Pixie setup for turning your business goals into content ideas, captions, and campaign direction.',
    addOns: [
      {
        id: 'ai-video-concept',
        title: 'AI Video Concept',
        blurb: 'Turn your content idea into an AI avatar / video campaign direction.',
        badge: 'Recommended',
        followUp: {
          question: 'Would you like simple video hooks or full AI avatar campaign ideas?',
          options: ['Video hooks', 'AI avatar campaign ideas'],
        },
      },
      {
        id: 'website-audit',
        title: 'Website Audit',
        blurb: 'Check if your social traffic is landing on a page that converts.',
        badge: 'Popular',
      },
      {
        id: 'monthly-plan',
        title: 'Monthly Content Plan',
        blurb: 'Expand your starter setup into a structured posting calendar.',
        badge: 'Best next step',
      },
    ],
    submitLabel: 'Send My Content Request',
    emailSubject: 'New Pixie Content Request',
    related: [
      { label: 'AI Influencer', href: '/ai-influencer' },
      { label: 'Website Builder', href: '/website-builder' },
      { label: 'SEO Growth Audit', href: '/seo-audit' },
    ],
  },

  'ai-influencer': {
    slug: 'ai-influencer',
    themeId: 'star',
    accent: '#D4AF37',
    soft: '#E9C46A',
    serviceLabel: 'AI Influencer',
    eyebrow: 'AI VIDEO',
    headline: 'Is your brand missing the spotlight?',
    sub: 'Pixie helps shape AI avatar-style campaigns so your brand can show up with video ideas without a full production shoot.',
    primaryCta: 'Start Video Setup',
    secondaryCta: 'See Campaign Ideas',
    avatarFull: '/images/pixie/forms/normal.png',
    avatarForm: '/images/pixie/forms/influencer.webp',
    bigTextLines: ['No camera crew.', 'No blank script.', 'No silent brand.'],
    bigTextReveal: 'Pixie gives your brand a face and a story.',
    ticker: ['AI AVATAR', 'VIDEO HOOKS', 'REEL IDEAS', 'SCRIPT DIRECTION', 'BRAND FACE', 'CAMPAIGN STORY'],
    storyCards: [
      'Creates AI avatar content direction',
      'Writes hooks and scripts',
      'Suggests reel concepts',
      'Builds campaign angles',
      'Plans visual scenes',
      'Repurposes offers into videos',
    ],
    requirements: [
      'Brand name',
      'Product / service',
      'Target audience',
      'Campaign goal',
      'Tone / style',
      'Reference examples',
      'Where video will be posted',
    ],
    packageName: 'AI Video Starter',
    packageDesc: 'A Pixie setup for shaping your first AI avatar-style video campaign direction.',
    addOns: [
      {
        id: 'social-content-pack',
        title: 'Social Content Pack',
        blurb: 'Turn the same idea into captions, reels, and carousel directions.',
        badge: 'Recommended',
      },
      {
        id: 'landing-page-direction',
        title: 'Landing Page Direction',
        blurb: 'Create a page that supports the campaign.',
        badge: 'Popular',
        followUp: {
          question: 'Do you want a campaign landing page idea or a full website direction?',
          options: ['Campaign landing page', 'Full website direction'],
        },
      },
      {
        id: 'seo-growth-check',
        title: 'SEO Growth Check',
        blurb: 'See if people can find your brand after the campaign.',
        badge: 'Best next step',
      },
    ],
    submitLabel: 'Send My Video Request',
    emailSubject: 'New Pixie AI Video Request',
    related: [
      { label: 'Social Content', href: '/social-media-marketing' },
      { label: 'Website Builder', href: '/website-builder' },
      { label: 'SEO Growth Audit', href: '/seo-audit' },
    ],
  },

  'seo-audit': {
    slug: 'seo-audit',
    themeId: 'analyst',
    accent: '#14B8A6',
    soft: '#2DD4BF',
    serviceLabel: 'SEO Audit',
    eyebrow: 'GROWTH',
    headline: 'Can people even find you?',
    sub: 'Pixie helps turn website, speed, SEO, and visibility issues into simple next steps your business can act on.',
    primaryCta: 'Start Growth Audit',
    secondaryCta: 'See Sample Insights',
    avatarFull: '/images/pixie/forms/normal.png',
    avatarForm: '/images/pixie/forms/seo.webp',
    bigTextLines: ['Your website exists.', 'But is it being discovered?'],
    bigTextReveal: 'Pixie shows what is holding growth back.',
    ticker: ['SPEED', 'SEO', 'META TAGS', 'MOBILE UX', 'CONTENT GAPS', 'INTERNAL LINKS', 'TOP FIXES'],
    storyCards: [
      'Checks technical health',
      'Reviews page speed',
      'Finds SEO gaps',
      'Highlights content issues',
      'Ranks top fixes',
      'Turns jargon into plain English',
    ],
    requirements: [
      'Website URL',
      'Target location',
      'Main services',
      'Top competitors if known',
      'Current goal',
      'Preferred report email',
    ],
    packageName: 'Growth Audit Starter',
    packageDesc:
      'A simple visibility audit that shows what is blocking your website from ranking, loading, and converting better.',
    addOns: [
      {
        id: 'website-fix-plan',
        title: 'Website Fix Plan',
        blurb: 'Turn audit issues into a prioritized implementation plan.',
        badge: 'Recommended',
        followUp: {
          question: 'Would you like a simple action list or a full implementation roadmap?',
          options: ['Simple action list', 'Full implementation roadmap'],
        },
      },
      {
        id: 'content-starter-pack',
        title: 'Content Starter Pack',
        blurb: 'Get content ideas based on your SEO gaps.',
        badge: 'Popular',
      },
      {
        id: 'ai-receptionist',
        title: 'AI Receptionist',
        blurb: 'Capture more leads after the website starts performing better.',
        badge: 'Best next step',
      },
    ],
    submitLabel: 'Send My Growth Request',
    emailSubject: 'New Pixie Growth Audit Request',
    related: [
      { label: 'Website Builder', href: '/website-builder' },
      { label: 'Social Content', href: '/social-media-marketing' },
      { label: 'AI Receptionist', href: '/ai-receptionist' },
    ],
  },

  'omnichannel-ai': {
    slug: 'omnichannel-ai',
    themeId: 'core',
    accent: '#8B7CF6',
    soft: '#C4B5FD',
    serviceLabel: 'Omnichannel AI',
    eyebrow: 'CHANNELS',
    headline: 'Are your conversations scattered everywhere?',
    sub: 'Pixie helps bring WhatsApp, web chat, Instagram, Messenger, and customer conversations into one smarter flow.',
    primaryCta: 'Start Channel Setup',
    secondaryCta: 'See Channel Flow',
    avatarFull: '/images/pixie/forms/normal.png',
    avatarForm: '/images/pixie/forms/omni.webp',
    bigTextLines: ['One message here.', 'Another one there.', 'No one knows what happened.'],
    bigTextReveal: 'Pixie brings the conversation back together.',
    ticker: ['WHATSAPP', 'WEB CHAT', 'INSTAGRAM', 'MESSENGER', 'CUSTOMER HISTORY', 'LEAD ROUTING', 'ONE FLOW'],
    storyCards: [
      'Connects customer channels',
      'Keeps conversation context',
      'Routes leads',
      'Supports web chat',
      'Helps organize inquiries',
      'Creates one response flow',
    ],
    requirements: [
      'Current channels',
      'Website URL if available',
      'Instagram / Facebook links',
      'Preferred customer handoff',
      'Main inquiry types',
      'Team contact email',
    ],
    packageName: 'Channel Connect Starter',
    packageDesc: 'A Pixie setup for connecting customer conversations into one cleaner business flow.',
    addOns: [
      {
        id: 'ai-receptionist',
        title: 'AI Receptionist',
        blurb: 'Add a front-line assistant to answer and capture leads.',
        badge: 'Recommended',
        followUp: {
          question: 'Should Pixie only collect leads or also answer common questions?',
          options: ['Collect leads only', 'Answer common questions too'],
        },
      },
      {
        id: 'chat-widget',
        title: 'Website Chat Widget',
        blurb: 'Add Pixie directly to your website.',
        badge: 'Popular',
      },
      {
        id: 'growth-audit',
        title: 'Growth Audit',
        blurb: 'Find where customers are dropping before they contact you.',
        badge: 'Best next step',
      },
    ],
    submitLabel: 'Send My Channel Request',
    emailSubject: 'New Pixie Channel Setup Request',
    related: [
      { label: 'AI Receptionist', href: '/ai-receptionist' },
      { label: 'SEO Growth Audit', href: '/seo-audit' },
      { label: 'Website Builder', href: '/website-builder' },
    ],
  },
};

export const SERVICE_SLUGS = Object.keys(PIXIE_SERVICES);

export function getService(slug: string): ServiceConfig | undefined {
  return PIXIE_SERVICES[slug];
}
