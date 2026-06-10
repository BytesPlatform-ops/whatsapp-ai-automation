// Static (curated) demo — the photographer portfolio.
//
// Like developerDemo.js, this is NOT generator output. It's the hand-built
// preview in scratch/photographer-preview (Hana Lee, Wedding & Portrait
// Photographer, San Francisco) deployed once via scripts/deployScratchPreview.js
// to hana.pixiebot.co. `static: true` tells generateDemoSites.js to pass
// these fields straight through to landing/lib/demoSites.ts WITHOUT
// regenerating/redeploying.
//
// Keep the URL in sync with the portfolioDemos.js registry (same site is the
// `photographer` sub-type preview).

module.exports = {
  id: 'photographer',
  label: 'Photographer',
  static: true,
  url: 'https://hana.pixiebot.co',
  prompt:
    "I'm a wedding & portrait photographer in San Francisco. I want a portfolio site for my galleries, my story, and a way for couples to enquire about dates.",
  businessName: 'Hana Lee',
  industry: 'Photography portfolio',
  city: 'San Francisco',
};
