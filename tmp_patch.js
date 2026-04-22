const fs = require('fs');
const p = 'src/website-gen/templates/hvac/areas.js';
let src = fs.readFileSync(p, 'utf8');
const needle = [
  "    title: `HVAC Service Areas${primary ? ` \\u2014 ${primary} & Surrounding Cities` : ''} | ${c.businessName}`,",
  "    description: `${c.businessName} provides HVAC service across ${areas.length ? areas.slice(0, 5).join(', ') : primary || 'the region'}. Same-day response, 24/7 emergency, licensed & insured.`,",
].join('\n');
const replacement = [
  "    title: `${tc.label} Service Areas${primary ? ` — ${primary} & Surrounding Cities` : ''} | ${c.businessName}`,",
  "    description: `${c.businessName} provides ${tc.label.toLowerCase()} service across ${areas.length ? areas.slice(0, 5).join(', ') : primary || 'the region'}. Same-day response, 24/7 emergency, licensed & insured.`,",
].join('\n');
if (!src.includes(needle)) { console.error('areas.js needle not found'); process.exit(1); }
fs.writeFileSync(p, src.replace(needle, replacement));
console.log('patched areas.js meta');
