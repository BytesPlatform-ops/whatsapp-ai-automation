// Local smoke test for the HVAC template. Produces all 6 pages into
// ./smoke-out/ so they can be opened in a browser.
//
// Usage:  node src/website-gen/templates/hvac/__smoke.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateHvacPages } = require('./index');
const { getHeroImage } = require('../../heroImage');
const { attachHvacServiceImages } = require('../../hvacServiceImages');

const dummyConfig = {
  businessName: 'CoolBreeze HVAC',
  industry: 'HVAC',
  contactPhone: '+1 (512) 555-0142',
  contactEmail: 'hello@coolbreezehvac.example',
  contactAddress: '123 Airflow Way, Austin, TX 78701',
  primaryCity: 'Austin',
  serviceAreas: ['Austin', 'Round Rock', 'Cedar Park', 'Pflugerville', 'Leander', 'Georgetown'],
  yearsExperience: '15',
  licenseNumber: 'TACLA12345',
  googleRating: '4.9',
  reviewCount: '287',
  googleProfileUrl: 'https://g.page/coolbreeze-hvac',
  primaryColor: '#1E3A5F',
  accentColor: '#F97316',
  footerTagline: 'Licensed, insured, and here when you need us most.',
  // LLM-generated fields (simulated)
  heroSub: 'Fast, honest HVAC service from the only team homeowners recommend by name. Same-day response, flat-rate pricing, and a guarantee that actually means something.',
  aboutTitle: 'Built on trust. Grown by referral.',
  aboutText: 'CoolBreeze HVAC started in a two-truck garage in 2011 with one rule: treat every home like your mother lives there. Fifteen years later, that rule still runs the business. We pass every technician through a strict hiring gauntlet — NATE certification, background check, and a month of shadowing before they ever knock on your door alone.',
  aboutText2: 'We never push a replacement when a repair will do. We never charge diagnostic fees if we take the job. And we never leave a home until the dust cloth has done its rounds. It is a slower way to grow a business — but it is the only way we know how.',
  services: [
    { title: 'AC Repair & Maintenance', icon: 'snowflake', shortDescription: 'Cool air back today. Diagnostic included with any repair.', fullDescription: 'When your AC gives out, we show up fast, diagnose accurately, and get the cool air flowing again — usually same day. Every repair quote is flat-rate and approved by you before we turn a wrench.', features: ['Same-day service', 'Flat-rate pricing', 'All major brands', '1-year labor warranty'], timeframe: 'Most repairs same-day', priceFrom: '89' },
    { title: 'AC Installation & Replacement', icon: 'zap', shortDescription: 'New system, sized right, installed clean — typically in a single day.', fullDescription: 'We load-calculate your home, recommend the right system size (not the biggest we can sell you), and install it in a single day with zero mess. Financing available.', features: ['Manual J load calc', 'In-day installation', '10-year warranty', 'Financing options'], timeframe: 'Install in 1 day', priceFrom: 'Free Quote' },
    { title: 'Furnace & Heater Repair', icon: 'flame', shortDescription: 'Heat back on fast. Gas, electric, or heat pump.', fullDescription: 'No heat in a cold snap is not just uncomfortable — it is dangerous. We prioritize heating emergencies and carry parts for every major furnace brand on every truck.', features: ['24/7 emergency available', 'Gas & electric experts', 'Flame-sensor cleaning included', 'Carbon monoxide check'], timeframe: 'Often same-day', priceFrom: '99' },
  ],
  whyChooseUs: [
    { title: '24/7 Emergency Response', description: 'No heat at 2 AM? We answer. Real technician dispatched, not a call center.', icon: 'siren' },
    { title: 'Upfront, Honest Pricing', description: 'Flat-rate quote before we start. What we say is what you pay — always.', icon: 'dollar' },
    { title: 'Licensed & NATE-Certified', description: 'Every tech background-checked, trained, and certified to North American standards.', icon: 'shieldCheck' },
    { title: '100% Satisfaction Promise', description: 'Not happy? We come back. No arguments, no "service fee", no hassle.', icon: 'checkCircle' },
  ],
  testimonials: [
    { quote: 'Our AC died at 11 PM during the heat wave last July. These guys had a tech at our door by 8 AM and cold air by noon. Flat $340 for the capacitor. No upsell, no games.', name: 'Mark Reynolds', role: 'Homeowner · Austin' },
    { quote: 'Replaced our entire 20-year-old heating and AC in one day. Crew wore shoe covers, rolled out drop cloths, and left my garage cleaner than they found it.', name: 'Jennifer Park', role: 'Homeowner · Cedar Park' },
    { quote: 'Three other companies told me I needed a $9,000 new system. CoolBreeze charged me $180 for a capacitor replacement. Three years later — still running.', name: 'David Chen', role: 'Homeowner · Round Rock' },
  ],
  areaDescriptions: {
    Austin: 'We are headquartered in Austin and keep two trucks rolling in every part of town from Zilker to Mueller. Most repair calls get a same-day window; emergencies are usually answered inside 60 minutes.',
    'Round Rock': 'Our Round Rock customers get the same sub-30-minute emergency response time as our Austin homeowners — we stage trucks on the I-35 corridor specifically to cover north Travis and Williamson counties.',
    'Cedar Park': 'Cedar Park has grown fast, and so have the HVAC systems in it. We service every major brand installed in the Cedar Park master-planned communities, with parts stocked on-truck.',
    Pflugerville: 'Pflugerville families get free second-opinion quotes from us if another contractor has already given them a number. We see more "you do not need a new system" calls here than anywhere else we serve.',
    Leander: 'Leander\'s newer subdivisions mostly run heat pumps — we have specialists certified on every major heat pump brand, and carry refrigerant for R-454B and R-410A systems.',
    Georgetown: 'Georgetown homes range from 100-year-old downtown bungalows to brand-new Sun City builds. We are one of the few HVAC teams in the area experienced with both — same-day service either way.',
  },
};

(async () => {
  // Fetch hero image
  console.log('Fetching hero image from Unsplash...');
  try {
    dummyConfig.heroImage = await getHeroImage('hvac technician service');
    console.log(`  hero: ${dummyConfig.heroImage ? 'OK (' + dummyConfig.heroImage.photographer + ')' : 'none (no UNSPLASH_ACCESS_KEY?)'}`);
  } catch (e) {
    console.log(`  hero: failed (${e.message})`);
  }

  // Fetch per-service images
  console.log('Fetching service images from Unsplash...');
  try {
    dummyConfig.services = await attachHvacServiceImages(dummyConfig.services);
    const hits = dummyConfig.services.filter((s) => s.image).length;
    console.log(`  services: ${hits}/${dummyConfig.services.length} images attached`);
  } catch (e) {
    console.log(`  services: failed (${e.message})`);
  }

  const pages = generateHvacPages(dummyConfig);
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
