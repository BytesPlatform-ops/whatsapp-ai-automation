// Static (curated) demo — the developer portfolio.
//
// Unlike the other demos, this one is NOT generator output. It's the
// hand-built preview in scratch/dev-portfolio-preview (Alex Rivera,
// Full-Stack Engineer) deployed once via scripts/deployScratchPreview.js to
// alexrivera.pixiebot.co. `static: true` tells generateDemoSites.js to pass
// these fields straight through to landing/lib/demoSites.ts WITHOUT
// regenerating/redeploying — rebuilding would replace the bespoke portfolio
// with a generic template render.
//
// Keep the URL in sync with the portfolioDemos.js registry (the same site is
// the live `developer` sub-type Pixie shares in sales chat).

module.exports = {
  id: 'developer',
  label: 'Developer',
  static: true,
  url: 'https://alexrivera.pixiebot.co',
  prompt:
    "I'm a full-stack engineer in Berlin. I want a portfolio site to show my projects, my stack, and an easy way for companies to reach me.",
  businessName: 'Alex Rivera',
  industry: 'Developer portfolio',
  city: 'Berlin',
};
