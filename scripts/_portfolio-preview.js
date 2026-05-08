require('dotenv').config();
const path = require('path');
const { generateWebsiteContent } = require(path.join(__dirname, '..', 'src', 'website-gen', 'generator'));
const { deployToNetlify } = require(path.join(__dirname, '..', 'src', 'website-gen', 'deployer'));

(async () => {
  const websiteData = {
    businessName: 'Sara Khan',
    industry: 'UX Designer',
    primaryColor: '#0e0e10',
    secondaryColor: '#1a1a1d',
    accentColor: '#ff5b04',
    services: ['Figma', 'Sketch', 'Prototyping', 'User Research', 'Webflow', 'Framer'],
    aboutText: 'Designer working at the intersection of brand and product. 6+ years across startups and agencies — currently focused on early-stage product work that ships and scales.',
    yearsExperience: 6,
    contactEmail: 'sara@example.com',
    contactPhone: '+15551234567',
    contactAddress: 'Karachi',
    instagramHandle: 'sarakhan.design',
    projects: [
      { title: 'BrandX rebrand', description: 'Took the visual identity from corporate to bold — full system from logo to product surfaces, shipped in 8 weeks.', role: 'Lead Designer', year: '2024', link: 'https://example.com/brandx', tools: ['Figma', 'After Effects'], photoUrl: null },
      { title: 'DashFlow', description: 'Dashboard for finance teams — redesigned the data architecture and IA from the ground up.', role: 'UX Lead', year: '2023', link: 'https://example.com/dashflow', tools: ['Figma', 'Maze'], photoUrl: null },
      { title: 'Hello Studio', description: 'Identity for a creative studio — logotype, type system, and a small motion library.', role: 'Brand Designer', year: '2023', link: 'https://example.com/hellostudio', tools: ['Illustrator'], photoUrl: null },
      { title: 'Postcard', description: 'Editorial site for a writer — typography-first, no images.', role: 'Designer + Dev', year: '2022', link: 'https://example.com/postcard', tools: ['Figma', 'Webflow'], photoUrl: null },
    ],
  };

  console.log('[PREVIEW] generating content...');
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
  console.log(result.previewUrl);
  console.log('========================\n');
})().catch((err) => {
  console.error('FAILED:', err.message);
  if (err.response?.data) console.error('detail:', JSON.stringify(err.response.data));
  process.exit(1);
});
