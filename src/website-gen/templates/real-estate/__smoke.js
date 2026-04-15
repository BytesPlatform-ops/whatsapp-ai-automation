// Local smoke test for the real-estate template. Produces all 7 pages into
// ./smoke-out/ so they can be opened in a browser via a local static server.
//
// Usage:  node src/website-gen/templates/real-estate/__smoke.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateRealEstatePages } = require('./index');
const { getHeroImage } = require('../../heroImage');
const { attachRealEstateListingImages } = require('../../realEstateListingImages');
const { fetchNeighborhoodImages, fetchAgentPlaceholderImage } = require('../../neighborhoodImages');

const dummyConfig = {
  businessName: 'Sarah Mitchell',
  firstName: 'Sarah',
  industry: 'Real Estate',
  contactPhone: '+1 (512) 555-0142',
  contactEmail: 'sarah@sterlingrealtygroup.example',
  contactAddress: '500 W 5th St, Suite 800, Austin, TX 78701',
  brokerageName: 'Sterling Realty Group',
  licenseNumber: 'TREC-712983',
  primaryCity: 'Austin',
  serviceAreas: ['Westlake', 'Tarrytown', 'Mueller', 'Zilker', 'Hyde Park', 'Travis Heights'],
  yearsExperience: '15',
  homesSold: '237',
  volumeClosed: '$84M',
  designations: ['REALTOR®', 'CRS', 'GRI', 'ABR', 'SRES'],
  specialty: 'Luxury homes & first-time buyers',
  googleRating: '4.9',
  reviewCount: '142',
  calendlyUrl: 'https://calendly.com/sarah-mitchell',
  primaryColor: '#1A2B45',
  accentColor: '#C9A96E',
  // Simulated LLM output:
  heroHeadline: 'Finding the Austin Home, One Family at a Time.',
  heroSubtitle: 'Fifteen years helping Austin-area families buy and sell with clarity, candor, and care. Let me help you find your next chapter.',
  aboutTitle: 'Built on trust. Grown by referral.',
  aboutText: "I started in real estate in 2010 for one reason: my own first home purchase was unnecessarily painful. Since then I've closed 237 homes for Austin families, and not one of them has felt the way I did at my own closing. I work the way I'd want my own family worked with: zero pressure, complete transparency, and the kind of preparation that turns surprise inspections into non-events.",
  aboutText2: "When I'm not at a closing table or open house, you'll find me on the Mount Bonnell trails my clients now call home, or at Cosmic Coffee with a buyer plotting their first offer.",
  valuationCallout: 'Curious what your home would sell for in today\u2019s Austin market?',
  featuredListings: [
    { address: '4521 Sycamore Lane', price: 1275000, beds: 4, baths: 3.5, sqft: 3200, status: 'Just Listed', neighborhood: 'Westlake' },
    { address: '218 Riverbend Drive', price: 2150000, beds: 5, baths: 4, sqft: 4100, status: 'For Sale', neighborhood: 'Tarrytown' },
    { address: '76 Mockingbird Court', price: 695000, beds: 3, baths: 2, sqft: 1980, status: 'For Sale', neighborhood: 'Mueller' },
    { address: '1102 Willow Bend', price: 1450000, beds: 4, baths: 3.5, sqft: 3180, status: 'Just Listed', neighborhood: 'Zilker' },
    { address: '3408 Elm Crest Avenue', price: 785000, beds: 3, baths: 2, sqft: 2100, status: 'For Sale', neighborhood: 'Hyde Park' },
    { address: '909 Stonewall Drive', price: 1950000, beds: 5, baths: 4.5, sqft: 4200, status: 'For Sale', neighborhood: 'Travis Heights' },
    { address: '155 Magnolia Row', price: 565000, beds: 2, baths: 2, sqft: 1450, status: 'Pending', neighborhood: 'Mueller' },
    { address: '88 Ridge Vista Lane', price: 2850000, beds: 6, baths: 5, sqft: 5400, status: 'For Sale', neighborhood: 'Westlake' },
  ],
  areaDescriptions: {
    Westlake: 'Rolling hills, top-tier Eanes ISD schools, and quiet gated streets just 15 minutes from downtown. Most homes here trade between $1.2M and $4M; expect a competitive market for anything updated.',
    Tarrytown: 'Old Austin charm with new Austin prices. Tree-canopied streets, walkable to Lake Austin Boulevard, and a strong sense of neighborhood. Ranches from the 1950s sit beside ground-up modern builds.',
    Mueller: 'A master-planned community where you can actually walk to coffee. Top-rated parks, the Sunday farmers market, and a tight inventory of New Urbanist homes that move fast.',
    Zilker: 'Steps from Barton Springs and the Greenbelt. Bungalows from the 30s, modern infill, and the highest concentration of food trucks per capita in the city. Mid-century buyers love it here.',
    'Hyde Park': "Austin's first planned suburb (1891), now a leafy walking neighborhood beloved by UT faculty and small-family buyers. Tight-knit community feel with Quack's Bakery as the unofficial town square.",
    'Travis Heights': "South Congress on the doorstep, downtown across the bridge, and Stacy Park around the corner. Eclectic 1920s bungalows and the kind of front-porch culture you'd think Austin lost a decade ago.",
  },
  areaMedianPrices: {
    Westlake: 1850000,
    Tarrytown: 1450000,
    Mueller: 875000,
    Zilker: 1180000,
    'Hyde Park': 920000,
    'Travis Heights': 985000,
  },
  areaWalkability: {
    Westlake: 32,
    Tarrytown: 78,
    Mueller: 84,
    Zilker: 88,
    'Hyde Park': 81,
    'Travis Heights': 86,
  },
  areaSchoolRating: {
    Westlake: 9.6,
    Tarrytown: 8.4,
    Mueller: 7.9,
    Zilker: 8.7,
    'Hyde Park': 9.1,
    'Travis Heights': 8.0,
  },
  areaYoY: {
    Westlake: 4.2,
    Tarrytown: 2.8,
    Mueller: 5.1,
    Zilker: 3.6,
    'Hyde Park': 1.4,
    'Travis Heights': -0.8,
  },
  areaBestFor: {
    Westlake: 'families who want top schools + big lots.',
    Tarrytown: 'Old Austin buyers who value character + walkability.',
    Mueller: 'professionals who want to walk to coffee and the farmers market.',
    Zilker: 'active buyers who want the Greenbelt at their door.',
    'Hyde Park': 'small-family buyers who love tree-lined streets.',
    'Travis Heights': 'creative buyers who want downtown energy + bungalow charm.',
  },
  testimonials: [
    { quote: "We had three failed offers before working with Sarah. By the fourth weekend our keys were in hand. The negotiation alone was worth every cent of her commission.", name: 'Lauren & Mark Whitfield', role: 'Buyers · Westlake' },
    { quote: 'Sold over asking in the first weekend. The CMA was spot on, and her staging suggestions made the photos sing. Three offers above list, accepted in 48 hours.', name: 'Patricia Donnelly', role: 'Seller · Hyde Park' },
    { quote: "I bought my first investment property with Sarah. The numbers were honest, the inspection was thorough, and the cash flow has tracked exactly to plan for two years now.", name: 'Daniel Rivera', role: 'Investor · Mueller' },
    { quote: "Sarah talked me OUT of a house I thought I loved. Six months later we found the one I actually love. That's an agent worth keeping.", name: 'Jennifer Park', role: 'Buyer · Travis Heights' },
  ],
  whyChooseUs: [
    { title: 'Local intelligence.', description: "I've walked nearly every block in Austin. I know which streets flood, which schools are about to redistrict, and which builders cut corners." },
    { title: 'Honest counsel.', description: "I'll tell you when a home is overpriced. I'll tell you when to wait. I'll tell you when to walk. My commission is downstream of your right decision." },
    { title: 'Calm closings.', description: 'Inspections, appraisals, lenders, attorneys — I keep the timeline tight and the surprises minimal. Closing should feel like a celebration, not a survival exercise.' },
  ],
  marketStats: {
    medianPrice: 612000,
    daysOnMarket: 28,
    yearOverYearPct: 3.4,
    newListingsThisWeek: 24,
  },
  recentSales: [
    { address: '2401 Pecan Grove Road', price: 1650000, beds: 4, baths: 3, sqft: 2900, neighborhood: 'Westlake', soldOn: 'Dec 2025' },
    { address: '118 Willow Creek Drive', price: 925000, beds: 3, baths: 2.5, sqft: 2200, neighborhood: 'Mueller', soldOn: 'Nov 2025' },
    { address: '705 Cactus Flat Drive', price: 2400000, beds: 5, baths: 4, sqft: 4500, neighborhood: 'Tarrytown', soldOn: 'Oct 2025' },
    { address: '42 Sunset Ridge', price: 780000, beds: 3, baths: 2, sqft: 2050, neighborhood: 'Hyde Park', soldOn: 'Sep 2025' },
  ],
};

(async () => {
  console.log('Fetching hero image from Unsplash...');
  try {
    dummyConfig.heroImage = await getHeroImage('austin texas skyline');
    console.log(`  hero: ${dummyConfig.heroImage ? 'OK (' + dummyConfig.heroImage.photographer + ')' : 'none (no UNSPLASH_ACCESS_KEY?)'}`);
  } catch (e) {
    console.log(`  hero: failed (${e.message})`);
  }

  console.log('Fetching listing images from Unsplash...');
  try {
    dummyConfig.featuredListings = await attachRealEstateListingImages(dummyConfig.featuredListings);
    const hits = dummyConfig.featuredListings.filter((l) => l.image).length;
    console.log(`  listings: ${hits}/${dummyConfig.featuredListings.length} images attached`);
  } catch (e) {
    console.log(`  listings: failed (${e.message})`);
  }

  console.log('Fetching neighborhood images from Unsplash...');
  try {
    dummyConfig.neighborhoodImages = await fetchNeighborhoodImages(dummyConfig.primaryCity, dummyConfig.serviceAreas);
    const hits = Object.keys(dummyConfig.neighborhoodImages || {}).length;
    console.log(`  neighborhoods: ${hits}/${dummyConfig.serviceAreas.length} images attached`);
  } catch (e) {
    console.log(`  neighborhoods: failed (${e.message})`);
  }

  console.log('Fetching agent placeholder lifestyle image from Unsplash...');
  try {
    dummyConfig.agentPlaceholderImage = await fetchAgentPlaceholderImage();
    console.log(`  agent placeholder: ${dummyConfig.agentPlaceholderImage ? 'OK (' + dummyConfig.agentPlaceholderImage.photographer + ')' : 'none'}`);
  } catch (e) {
    console.log(`  agent placeholder: failed (${e.message})`);
  }

  const pages = generateRealEstatePages(dummyConfig);
  const outDir = path.join(__dirname, 'smoke-out');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [p, html] of Object.entries(pages)) {
    const full = path.join(outDir, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, html);
  }
  console.log(`\nWrote ${Object.keys(pages).length} pages to ${outDir}`);
  console.log(Object.keys(pages).map((p) => `  ${p}  (${(pages[p].length / 1024).toFixed(1)}KB)`).join('\n'));
})();
