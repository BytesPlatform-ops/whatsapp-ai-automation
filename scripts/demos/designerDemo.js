// Static (curated) demo — the designer portfolio (Eleanor Hartley, a graphic
// & poster designer).
//
// Rendered from the designer template into scratch/eleanor-preview and deployed
// + given a pixiebot.co subdomain via the shared scratch-preview script:
//
//   node -e "require('dotenv').config();const fs=require('fs'),p=require('path');\
//   const d=require('./src/website-gen/templates/portfolio/designer');\
//   const demo=require('./scripts/demos/designerDemo');\
//   const c=Object.assign({},demo.businessData,{paymentStatus:'paid',htmlLang:'en'});\
//   const pg=d.generatePages(c);const o='scratch/eleanor-preview';fs.rmSync(o,{recursive:true,force:true});\
//   for(const[r,h]of Object.entries(pg)){const f=p.join(o,r);fs.mkdirSync(p.dirname(f),{recursive:true});fs.writeFileSync(f,h);}"
//
//   node scripts/deployScratchPreview.js scratch/eleanor-preview eleanor.pixiebot.co eleanor-portfolio
//
// `static: true` → generateDemoSites.js passes the top-level fields straight
// through to landing/lib/demoSites.ts without rebuilding. businessData is kept
// only so the scratch folder can be re-rendered + redeployed when the design
// changes.

module.exports = {
  id: 'designer',
  label: 'Designer',
  static: true,
  // Working Netlify URL. To switch to the pretty eleanor.pixiebot.co subdomain,
  // add the CNAME (eleanor -> eleanor-portfolio.netlify.app) in pixiebot.co DNS
  // first, then change this + demoSites.ts to https://eleanor.pixiebot.co.
  url: 'https://eleanor-portfolio.netlify.app',
  prompt:
    "I'm a graphic & poster designer in London. I want a portfolio site for my posters, my process, and an easy way for clients to reach me.",
  businessName: 'Eleanor Hartley',
  industry: 'Graphic & Poster Designer',
  city: 'London',

  // Source data for re-rendering the scratch preview (not used by the static
  // pass-through above).
  businessData: {
    businessName: 'Eleanor Hartley',
    industry: 'Graphic & Poster Designer',
    portfolioNiche: 'designer',
    tagline: 'Bold posters, type and print for music, culture and brands that want to be impossible to scroll past.',
    portfolioAbout:
      'Eleanor is an independent graphic and poster designer based in London, working with venues, labels and ' +
      'cultural brands across Europe. She designs posters, type and print systems — loud where it counts, ' +
      'considered down to the last kern — so the work grabs attention and still feels intentional.',
    yearsExperience: 9,
    services: ['Poster Design', 'Typography', 'Print Design', 'Graphic Design', 'Illustration', 'Art Direction'],
    // Designer-relevant photos per specialization card (Pexels, poster/print subjects).
    serviceImages: [
      'https://images.pexels.com/photos/3964837/pexels-photo-3964837.jpeg?auto=compress&cs=tinysrgb&w=900&q=80&h=700&fit=crop',
      'https://images.pexels.com/photos/6935188/pexels-photo-6935188.jpeg?auto=compress&cs=tinysrgb&w=900&q=80&h=700&fit=crop',
      'https://images.pexels.com/photos/19316517/pexels-photo-19316517.png?auto=compress&cs=tinysrgb&w=900&q=80&h=700&fit=crop',
      'https://images.pexels.com/photos/18560675/pexels-photo-18560675.jpeg?auto=compress&cs=tinysrgb&w=900&q=80&h=700&fit=crop',
    ],
    availabilityStatus: 'Available — Q3 2026',
    typicalTimeline: '2–5 weeks',
    // Graphic designer headshot (Pexels portrait) for the hero portrait card.
    aboutPhotoUrl: 'https://images.pexels.com/photos/7147708/pexels-photo-7147708.jpeg?auto=compress&cs=tinysrgb&w=900&q=80&h=1100&fit=crop',
    projects: [
      { title: 'Resonance', role: 'Gig Poster Series', year: '2025', tools: ['Poster', 'Typography', 'Print'], description: 'A run of bold gig posters for a London music venue — one loud type system, twelve nights.', photoUrl: 'https://images.pexels.com/photos/3964576/pexels-photo-3964576.jpeg?auto=compress&cs=tinysrgb&w=1280&q=80&h=960&fit=crop' },
      { title: 'Typeface', role: 'Typography Poster', year: '2024', tools: ['Typography', 'Layout', 'Print'], description: 'A type-driven poster series exploring rhythm, scale and contrast — letters as the whole image.', photoUrl: 'https://images.pexels.com/photos/6475821/pexels-photo-6475821.jpeg?auto=compress&cs=tinysrgb&w=1280&q=80&h=960&fit=crop' },
      { title: 'Riso', role: 'Print Series', year: '2024', tools: ['Risograph', 'Illustration', 'Print'], description: 'A limited risograph print set — overprinted colour, texture and grain you can only get on press.', photoUrl: 'https://images.pexels.com/photos/8593815/pexels-photo-8593815.jpeg?auto=compress&cs=tinysrgb&w=1280&q=80&h=960&fit=crop' },
      { title: 'Sundance', role: 'Exhibition Posters', year: '2023', tools: ['Poster', 'Art Direction', 'Print'], description: 'A poster and signage system for a contemporary art exhibition — confident, gallery-grade graphics.', photoUrl: 'https://images.pexels.com/photos/15138844/pexels-photo-15138844.jpeg?auto=compress&cs=tinysrgb&w=1280&q=80&h=960&fit=crop' },
    ],
    contactEmail: 'hello@eleanorhartley.studio',
    contactAddress: 'London, UK',
    behanceHandle: 'eleanorhartley',
    instagramHandle: 'eleanor.studio',
    linkedinHandle: 'eleanorhartley',
  },
};
