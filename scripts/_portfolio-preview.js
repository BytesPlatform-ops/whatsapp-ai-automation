require('dotenv').config();
const path = require('path');
const { generateWebsiteContent } = require(path.join(__dirname, '..', 'src', 'website-gen', 'generator'));
const { deployToNetlify } = require(path.join(__dirname, '..', 'src', 'website-gen', 'deployer'));

// Variant fixtures — pass `node scripts/_portfolio-preview.js <variant>` to
// pick one. Variants exercise the four portfolio sub-templates router-side
// via industry keywords (designer / photographer / developer / general).
const FIXTURES = {
  designer: {
    businessName: 'Sara Khan',
    industry: 'Brand Designer',
    services: ['Figma', 'After Effects', 'Brand Identity', 'Web Design', 'Art Direction'],
    aboutText: 'Designer working at the intersection of brand and product. 6+ years across startups and agencies — currently focused on early-stage product work that ships and scales.',
    yearsExperience: 6,
    contactEmail: 'sara@example.com',
    contactPhone: '+15551234567',
    contactAddress: 'Karachi',
    instagramHandle: 'sarakhan.design',
    projects: [
      { title: 'BrandX rebrand', description: 'Took the visual identity from corporate to bold — full system from logo to product surfaces, shipped in 8 weeks.', role: 'Lead Designer', client: 'BrandX', outcome: '+34% trial signups in Q1', year: '2024', link: 'https://example.com/brandx', tools: ['Brand Identity', 'Web Design', 'Motion'], photoUrl: null },
      { title: 'DashFlow', description: 'Dashboard for finance teams — redesigned the data architecture and IA from the ground up.', role: 'UX Lead', client: 'DashFlow Inc.', outcome: '12 → 3 clicks to common task', year: '2023', link: 'https://example.com/dashflow', tools: ['Figma', 'Maze', 'Design System'], photoUrl: null },
      { title: 'Hello Studio', description: 'Identity for a creative studio — logotype, type system, and a small motion library.', role: 'Brand Designer', client: 'Hello Studio', year: '2023', link: 'https://example.com/hellostudio', tools: ['Illustrator', 'Glyphs'], photoUrl: null },
      { title: 'Postcard', description: 'Editorial site for a writer — typography-first, no images.', role: 'Designer + Dev', client: 'Independent', outcome: 'Featured on Typewolf', year: '2022', link: 'https://example.com/postcard', tools: ['Figma', 'Webflow'], photoUrl: null },
    ],
  },

  photographer: {
    businessName: 'Hana Lee',
    industry: 'Wedding Photographer',
    services: ['Wedding', 'Portrait', 'Engagement', 'Family'],
    aboutText: 'Quiet, story-led wedding and portrait photography. Believes the best photographs feel like remembering, not performing. Based in the Bay Area, available worldwide.',
    yearsExperience: 8,
    contactEmail: 'hana@example.com',
    contactPhone: '+14155551234',
    contactAddress: 'San Francisco',
    instagramHandle: 'hanalee.photo',
    projects: [
      { title: 'Maya & Owen',         role: 'Wedding',     year: '2024', link: '', tools: ['Wedding'],     photoUrl: null, description: 'A late-summer wedding in the Sonoma foothills.' },
      { title: 'Sara at Home',        role: 'Portrait',    year: '2024', link: '', tools: ['Portrait'],    photoUrl: null, description: 'A quiet morning portrait session.' },
      { title: 'Field Kitchen Launch', role: 'Commercial', year: '2024', link: '', tools: ['Brand'],       photoUrl: null, description: 'Lifestyle imagery for a farm-to-table launch.' },
      { title: 'The Robinsons',       role: 'Family',      year: '2023', link: '', tools: ['Family'],      photoUrl: null, description: 'Three generations on the family farm.' },
      { title: 'June + Daisy',        role: 'Engagement',  year: '2024', link: '', tools: ['Engagement'],  photoUrl: null, description: 'Sunset hour at the lake.' },
      { title: 'Cara — Personal Brand', role: 'Commercial', year: '2024', link: '', tools: ['Brand'],     photoUrl: null, description: 'Editorial brand session for a coach.' },
    ],
    testimonialQuote: 'Hana captured our day with such grace and quietude. We barely noticed the camera — and yet the photos remember everything.',
    testimonialAuthor: 'Maya & Owen · Married 2024',
  },

  developer: {
    businessName: 'Alex Rivera',
    industry: 'Software Engineer',
    services: ['TypeScript', 'React', 'Node', 'Postgres', 'AWS'],
    currentFocus: 'Building developer tools at Acme',
    timezone: 'PST (UTC-8)',
    aboutText: 'Senior software engineer building developer tools and platform infrastructure. Previously at Stripe, MIT 2018. Open to senior IC roles and consulting on hard performance / architecture problems.',
    yearsExperience: 7,
    contactEmail: 'alex@example.com',
    contactAddress: 'San Francisco',
    githubHandle: 'alexrivera',
    linkedinHandle: 'alexrivera',
    twitterHandle: 'alexrivera',
    projects: [
      { title: 'pixie-replay',  description: 'Behavioral regression test runner for an LLM-driven state machine — replays real chat fixtures against the full pipeline. Used to catch class-of-issues bugs before they hit production.', role: 'Author',     year: '2025', link: 'https://github.com/example/pixie-replay', codeUrl: 'https://github.com/example/pixie-replay', tools: ['TypeScript', 'Node', 'Supabase', 'Jest'], photoUrl: null },
      { title: 'auth-nullable', description: 'TypeScript ESLint rule + codemod to surface unsafely-cast nullable user objects across a 200k-LOC monorepo. Cut auth-related null-pointer incidents by 84% in 6 months.', role: 'Maintainer', year: '2024', link: 'https://github.com/example/auth-nullable', codeUrl: 'https://github.com/example/auth-nullable', tools: ['TypeScript', 'ESLint', 'AST'], photoUrl: null },
      { title: 'cloud-router',  description: 'Tiny request-router that picks regional egress per traffic class. Used in a production CDN serving ~2B requests/month.', role: 'Contributor', year: '2024', link: '', codeUrl: 'https://github.com/example/cloud-router', tools: ['Go', 'gRPC', 'Kubernetes'], photoUrl: null },
    ],
  },

  general: {
    businessName: 'June Carter',
    industry: 'Writer',
    services: ['Editorial', 'Long-form', 'Brand Voice', 'Strategy'],
    aboutText: 'Independent writer covering technology, climate, and the in-between. Past bylines in The Atlantic, Wired, and Rest of World. Available for editorial assignments and voice-and-tone consulting.',
    yearsExperience: 9,
    contactEmail: 'june@example.com',
    contactAddress: 'Brooklyn',
    instagramHandle: 'junecarter.writes',
    projects: [
      { title: 'After the Algorithm', description: 'A 6,000-word feature on community-led content moderation experiments in Pakistan and Brazil. Wired, March 2024.', role: 'Author', year: '2024', link: '', tools: ['Long-form'], photoUrl: null },
      { title: 'Voice Guide for Stripe Atlas', description: 'Voice-and-tone system + writing playbook for the Stripe Atlas product surface, used by 40+ writers across product and marketing.', role: 'Lead Writer', year: '2023', link: '', tools: ['Strategy', 'Voice'], photoUrl: null },
      { title: 'On Quiet Software', description: 'Personal essay on tools that disappear. Reprinted in 3 newsletters, picked up by Hacker News.', role: 'Author', year: '2023', link: '', tools: ['Editorial'], photoUrl: null },
    ],
  },
};

(async () => {
  const variant = (process.argv[2] || 'designer').toLowerCase();
  const websiteData = FIXTURES[variant];
  if (!websiteData) {
    console.error(`Unknown variant: "${variant}". Try: ${Object.keys(FIXTURES).join(', ')}`);
    process.exit(1);
  }
  console.log(`[PREVIEW] variant=${variant} (${websiteData.industry})`);

  const siteConfig = await generateWebsiteContent(websiteData, {
    templateId: 'portfolio',
    siteId: null,
    userId: 'preview-test',
    paymentStatus: 'preview',
    paymentLinkUrl: null,
    activationAmount: 39,
    originalAmount: 39,
    discountPct: 0,
  });
  console.log('[PREVIEW] content generated, deploying...');

  const result = await deployToNetlify(siteConfig, null, { watermark: false });
  console.log('\n=== LIVE PREVIEW URL ===');
  console.log(`[${variant}]`, result.previewUrl);
  console.log('========================\n');
})().catch((err) => {
  console.error('FAILED:', err.message);
  if (err.response?.data) console.error('detail:', JSON.stringify(err.response.data));
  process.exit(1);
});
