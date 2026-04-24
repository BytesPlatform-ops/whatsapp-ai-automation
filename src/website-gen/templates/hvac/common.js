// HVAC template — shared scaffolding (tokens, styles, emergency strip, nav,
// footer, floating FAB, JSON-LD helpers, Netlify form attrs, wrapper).
//
// See hvac_context.md at the repo root for the full plan and research that
// drives these design choices.

const { renderActivationBanner } = require('../../activationBanner');

// ─── Utilities ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function telHref(phone) {
  return (phone || '').replace(/[^\d+]/g, '');
}

// ─── Design tokens ──────────────────────────────────────────────────────────
// TOKENS holds the default HVAC palette; buildTokens(c) merges the user's
// primaryColor / secondaryColor / accentColor on top so revisions like
// "change color to forest green" actually reach the rendered CSS. Prior
// to this, TOKENS was a static object that every page referenced
// directly, so no amount of config override would ever recolor the site.
//
// Callers: getHvacStyles(c) for the global stylesheet, and each per-page
// generator (home.js, about.js, etc.) for its inline `style="..."`
// snippets. Emergency red stays hardcoded — 24/7 convention, not brand.

const TOKENS = {
  // Brand
  trust: '#1E3A5F',
  action: '#2563EB',
  emergency: '#DC2626',
  orange: '#F97316',
  orangeHover: '#EA580C',
  // Surface
  pageBg: '#FAFAFA',
  cardBg: '#FFFFFF',
  sectionAlt: '#F0F4F8',
  border: '#E2E8F0',
  darkBg: '#0F172A',
  // Text
  heading: '#0F172A',
  body: '#475569',
  muted: '#94A3B8',
  onDark: '#F1F5F9',
};

function buildTokens(c = {}) {
  const primary = c.primaryColor || TOKENS.trust;
  const accent = c.accentColor || TOKENS.orange;
  const secondary = c.secondaryColor || TOKENS.darkBg;
  return {
    ...TOKENS,
    trust: primary,
    action: primary,
    orange: accent,
    orangeHover: accent,
    darkBg: secondary,
  };
}

// ─── HVAC icons (inline SVG path bodies) ────────────────────────────────────

const ICONS = {
  snowflake:
    '<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07M12 6l-3 3M12 6l3 3M12 18l-3-3M12 18l3-3M6 12l3-3M6 12l3 3M18 12l-3-3M18 12l-3 3" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  thermometer:
    '<path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  wind:
    '<path d="M17.7 7.7a2.5 2.5 0 111.8 4.3H2M9.6 4.6A2 2 0 1111 8H2m10.6 11.4A2 2 0 1014 16H2" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  shieldCheck:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  gauge:
    '<path d="M12 15l3.5-3.5M12 21a9 9 0 100-18 9 9 0 000 18z M3.5 12a8.5 8.5 0 0117 0" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  siren:
    '<path d="M7 18v-6a5 5 0 1110 0v6M5 21h14M21 12h1M3 12H2M4.22 10.22l-.77-.77M20.55 9.45l-.77.77M18 21V11M6 21V11" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  calendarCheck:
    '<path d="M3 10h18M8 3v4m8-4v4M5 6h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zM9 16l2 2 4-4" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  zap:
    '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  layers:
    '<path d="M12 2l10 6-10 6L2 8l10-6z M2 14l10 6 10-6 M2 18l10 6 10-6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  clock:
    '<circle cx="12" cy="12" r="10" stroke-width="1.75" fill="none"/><path d="M12 6v6l4 2" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  star:
    '<path d="M12 2l3.1 6.3 7 1-5 4.8 1.2 6.9L12 17.8 5.7 21l1.2-6.9-5-4.8 7-1L12 2z" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  award:
    '<circle cx="12" cy="9" r="6" stroke-width="1.75" fill="none"/><path d="M9 14.5L7 22l5-3 5 3-2-7.5" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  dollar:
    '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  checkCircle:
    '<circle cx="12" cy="12" r="10" stroke-width="1.75" fill="none"/><path d="M9 12l2 2 4-4" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  mapPin:
    '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="3" stroke-width="1.75" fill="none"/>',
  arrowRight:
    '<path d="M5 12h14M13 5l7 7-7 7" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  plus:
    '<path d="M12 5v14M5 12h14" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
};

function icon(name, size = 24, color = 'currentColor') {
  const body = ICONS[name] || ICONS.star;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" aria-hidden="true">${body}</svg>`;
}

// Filled-shape variant. Use for stars, pulse dots, anything that should be
// solid-fill rather than outlined.
function iconFilled(name, size = 24, color = 'currentColor') {
  const body = ICONS[name] || ICONS.star;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="none" aria-hidden="true">${body}</svg>`;
}

// Google "G" mark in the original Google brand colors. Use as the trust
// signal on testimonial cards.
function googleGlyph(size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.617z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.345 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.655 3.58 9 3.58z" fill="#EA4335"/>
  </svg>`;
}

// Default 10 HVAC services when user doesn't provide any.
const DEFAULT_SERVICES = [
  { title: 'AC Repair & Maintenance', icon: 'snowflake', shortDescription: 'Fast, reliable repair for any AC brand. Cool air back today.', priceFrom: '89' },
  { title: 'AC Installation & Replacement', icon: 'zap', shortDescription: 'Energy-efficient systems sized for your home, installed clean.', priceFrom: 'Free Quote' },
  { title: 'Furnace & Heater Repair', icon: 'flame', shortDescription: 'Heat out? We diagnose, fix, and restore warmth fast.', priceFrom: '99' },
  { title: 'Heating System Installation', icon: 'thermometer', shortDescription: 'Gas, electric, or hybrid — a new system engineered for your home.', priceFrom: 'Free Quote' },
  { title: 'Heat Pump Services', icon: 'wind', shortDescription: 'Repair, replace, or install a high-efficiency heat pump system.', priceFrom: 'Free Quote' },
  { title: 'Duct Cleaning & Sealing', icon: 'layers', shortDescription: 'Improve airflow, cut bills, and breathe cleaner air at home.', priceFrom: '199' },
  { title: 'Indoor Air Quality', icon: 'shieldCheck', shortDescription: 'Purifiers, UV lights, humidifiers — healthier indoor air.', priceFrom: 'Free Quote' },
  { title: 'Thermostat Installation & Repair', icon: 'gauge', shortDescription: 'Smart thermostats configured to cut your energy bill.', priceFrom: '129' },
  { title: '24/7 Emergency HVAC Service', icon: 'siren', shortDescription: 'No heat, no cool, middle of the night — we answer.', priceFrom: 'Call Now' },
  { title: 'Maintenance Plans & Agreements', icon: 'calendarCheck', shortDescription: 'Seasonal tune-ups that prevent breakdowns before they cost you.', priceFrom: 'From $9/mo' },
];

// Default 10 plumbing services — parallel to DEFAULT_SERVICES, used when a
// plumbing-trade user skips the services step. Icon choices map to things
// the template's icon set actually has (wrench, layers, shieldCheck, etc.);
// plumbing-specific glyphs would require adding to the icon palette, which
// isn't worth it for defaults.
const PLUMBING_DEFAULT_SERVICES = [
  { title: 'Leak Detection & Repair', icon: 'wrench', shortDescription: 'Find the leak, fix the leak, no demolition guesswork.', priceFrom: '89' },
  { title: 'Drain Cleaning & Unclogging', icon: 'layers', shortDescription: 'Slow drains, backups, roots — cleared without damage to your pipes.', priceFrom: '99' },
  { title: 'Water Heater Repair & Install', icon: 'flame', shortDescription: 'Tank or tankless, gas or electric. Hot water back today.', priceFrom: 'Free Quote' },
  { title: 'Pipe Repair & Replacement', icon: 'zap', shortDescription: 'Burst pipe, pinhole leak, or full re-pipe — clean, code-compliant work.', priceFrom: 'Free Quote' },
  { title: 'Sewer Line Services', icon: 'shieldCheck', shortDescription: 'Camera inspection, hydro-jetting, trenchless repair when possible.', priceFrom: 'Free Quote' },
  { title: 'Toilet & Fixture Install', icon: 'checkCircle', shortDescription: 'Running toilets, leaky faucets, new fixtures — installed right the first time.', priceFrom: '129' },
  { title: 'Sump Pump Services', icon: 'wind', shortDescription: 'Flood protection that actually runs when the rain comes.', priceFrom: '199' },
  { title: 'Garbage Disposal Repair', icon: 'gauge', shortDescription: 'Jammed, humming, or dead — repaired or replaced same-day.', priceFrom: '119' },
  { title: '24/7 Emergency Plumbing', icon: 'siren', shortDescription: 'Burst pipe, flooded bathroom, middle of the night — we answer.', priceFrom: 'Call Now' },
  { title: 'Maintenance Plans & Agreements', icon: 'calendarCheck', shortDescription: 'Seasonal inspections that catch leaks before they flood a floor.', priceFrom: 'From $9/mo' },
];

const ELECTRICAL_DEFAULT_SERVICES = [
  { title: 'Panel Upgrades & Replacement', icon: 'zap', shortDescription: 'From 100A to 200A+. Safe, code-compliant, inspection-ready.', priceFrom: 'Free Quote' },
  { title: 'Outlet & Switch Installation', icon: 'wrench', shortDescription: 'New outlets, USB sockets, dimmers, GFCIs — same-day where possible.', priceFrom: '129' },
  { title: 'Home Rewiring & Wiring Repair', icon: 'layers', shortDescription: 'Old knob-and-tube, aluminum, or damaged circuits — replaced cleanly.', priceFrom: 'Free Quote' },
  { title: 'Circuit Breaker Repair', icon: 'shieldCheck', shortDescription: 'Tripping breakers diagnosed and fixed the same visit.', priceFrom: '149' },
  { title: 'EV Charger Installation', icon: 'flame', shortDescription: 'Level 2 chargers installed, permitted, and inspected.', priceFrom: 'Free Quote' },
  { title: 'Lighting Installation & Repair', icon: 'gauge', shortDescription: 'Recessed, chandelier, under-cabinet, landscape — wired right.', priceFrom: '129' },
  { title: 'Ceiling Fan Installation', icon: 'wind', shortDescription: 'New mount, box, and wiring. Balanced and quiet on day one.', priceFrom: '189' },
  { title: 'Whole-Home Generator Install', icon: 'checkCircle', shortDescription: 'Never lose power again. Automatic transfer switch included.', priceFrom: 'Free Quote' },
  { title: '24/7 Emergency Electrical', icon: 'siren', shortDescription: 'Sparks, outages, burning smell — we answer, no matter the hour.', priceFrom: 'Call Now' },
  { title: 'Electrical Safety Inspections', icon: 'calendarCheck', shortDescription: 'Pre-buy, insurance, or peace-of-mind — full report in hand.', priceFrom: '149' },
];

const ROOFING_DEFAULT_SERVICES = [
  { title: 'Roof Repair & Leak Fix', icon: 'wrench', shortDescription: 'Find the leak, fix the leak, stop the ceiling stain from spreading.', priceFrom: '199' },
  { title: 'Full Roof Replacement', icon: 'shieldCheck', shortDescription: 'Tear-off, new underlayment, new shingles — usually a single day.', priceFrom: 'Free Quote' },
  { title: 'Storm Damage Repair', icon: 'siren', shortDescription: 'Emergency tarping, insurance-claim-ready photo documentation.', priceFrom: 'Call Now' },
  { title: 'Shingle Replacement', icon: 'layers', shortDescription: 'Match existing shingles or upgrade — clean, warranty-backed work.', priceFrom: '249' },
  { title: 'Gutter Repair & Install', icon: 'wind', shortDescription: 'Seamless aluminum, leaf guards, downspouts routed away from foundation.', priceFrom: 'Free Quote' },
  { title: 'Roof Inspection & Report', icon: 'gauge', shortDescription: 'Pre-purchase or insurance — full photo report, no pressure to buy work.', priceFrom: '99' },
  { title: 'Flashing & Vent Repair', icon: 'checkCircle', shortDescription: 'The hidden leak source. Sealed, replaced, or re-flashed properly.', priceFrom: '179' },
  { title: 'Flat Roof & TPO Work', icon: 'zap', shortDescription: 'Commercial and residential flat roof install, patch, or re-coat.', priceFrom: 'Free Quote' },
  { title: '24/7 Emergency Tarping', icon: 'flame', shortDescription: 'Tree through the roof, storm damage, visible hole — we tarp tonight.', priceFrom: 'Call Now' },
  { title: 'Maintenance Plans', icon: 'calendarCheck', shortDescription: 'Annual inspection + minor fixes. Catch issues before they become a claim.', priceFrom: 'From $19/mo' },
];

const APPLIANCE_DEFAULT_SERVICES = [
  { title: 'Refrigerator Repair', icon: 'snowflake', shortDescription: 'Not cooling, leaking, or noisy — diagnosed and fixed same visit.', priceFrom: '89' },
  { title: 'Washer Repair', icon: 'layers', shortDescription: "Won't drain, won't spin, leaking — parts on the truck for most models.", priceFrom: '89' },
  { title: 'Dryer Repair', icon: 'flame', shortDescription: 'No heat, no tumble, burning smell — fixed the right way.', priceFrom: '89' },
  { title: 'Dishwasher Repair', icon: 'wind', shortDescription: 'Not filling, not draining, not cleaning — back in service today.', priceFrom: '89' },
  { title: 'Oven & Range Repair', icon: 'gauge', shortDescription: 'Gas or electric, not heating or uneven — fixed without replacement upsells.', priceFrom: '99' },
  { title: 'Microwave Repair', icon: 'zap', shortDescription: 'Built-in or countertop — not heating or sparking, we take a look.', priceFrom: '79' },
  { title: 'Garbage Disposal Repair', icon: 'wrench', shortDescription: 'Humming, jammed, or leaking — cleared or replaced same visit.', priceFrom: '79' },
  { title: 'Ice Maker Repair', icon: 'shieldCheck', shortDescription: 'No ice, odd taste, leaking line — fixed without a full fridge swap.', priceFrom: '89' },
  { title: '24/7 Emergency Service', icon: 'siren', shortDescription: 'Fridge dying, freezer thawing — we answer and dispatch fast.', priceFrom: 'Call Now' },
  { title: 'Maintenance & Tune-Ups', icon: 'calendarCheck', shortDescription: 'Annual cleaning + check so your appliances last 5 years longer.', priceFrom: 'From $9/mo' },
];

const GARAGE_DOOR_DEFAULT_SERVICES = [
  { title: 'Broken Spring Replacement', icon: 'wrench', shortDescription: 'Snapped torsion or extension spring — matched and replaced same visit.', priceFrom: '189' },
  { title: 'Door Off-Track Repair', icon: 'shieldCheck', shortDescription: 'Bent track, jumped roller, leaning door — realigned and secured.', priceFrom: '149' },
  { title: 'Opener Repair & Replacement', icon: 'zap', shortDescription: 'Remote not working, motor burned, belt stretched — fixed or upgraded.', priceFrom: '189' },
  { title: 'New Garage Door Install', icon: 'layers', shortDescription: 'Insulated steel, carriage, modern glass — matched to your home.', priceFrom: 'Free Quote' },
  { title: 'Roller & Hinge Replacement', icon: 'gauge', shortDescription: 'Noisy operation usually means worn rollers. Nylon upgrade in under an hour.', priceFrom: '129' },
  { title: 'Cable Repair & Replacement', icon: 'wind', shortDescription: 'Frayed or snapped lift cable — safely replaced before it fails completely.', priceFrom: '149' },
  { title: 'Smart Opener Upgrade', icon: 'flame', shortDescription: 'WiFi, app control, camera-enabled openers installed and configured.', priceFrom: '349' },
  { title: 'Panel Replacement', icon: 'checkCircle', shortDescription: 'Dented or damaged panels replaced without buying a full new door.', priceFrom: 'Free Quote' },
  { title: '24/7 Emergency Service', icon: 'siren', shortDescription: 'Car stuck inside, door stuck open, late night — we answer.', priceFrom: 'Call Now' },
  { title: 'Annual Tune-Ups', icon: 'calendarCheck', shortDescription: 'Lubrication, alignment, spring check — catches issues before they strand you.', priceFrom: 'From $9/mo' },
];

const LOCKSMITH_DEFAULT_SERVICES = [
  { title: 'Emergency Lockouts', icon: 'siren', shortDescription: 'Home, car, office — fast, non-destructive entry by licensed techs.', priceFrom: 'Call Now' },
  { title: 'Lock Rekeying', icon: 'wrench', shortDescription: 'Keep the hardware, change the key. Post-move or roommate-out standard.', priceFrom: '89' },
  { title: 'Lock Installation & Replacement', icon: 'shieldCheck', shortDescription: 'Deadbolts, smart locks, high-security — installed to code.', priceFrom: '129' },
  { title: 'Key Duplication & Cutting', icon: 'zap', shortDescription: 'House, office, high-security, or car fob — cut or programmed on site.', priceFrom: '25' },
  { title: 'Car Key Replacement', icon: 'flame', shortDescription: 'Transponder or fob keys cut and programmed — no dealership trip.', priceFrom: '149' },
  { title: 'Safe Opening & Repair', icon: 'gauge', shortDescription: 'Home or office safes — combination reset, lock repair, drill as last resort.', priceFrom: 'Free Quote' },
  { title: 'Smart Lock Installation', icon: 'layers', shortDescription: 'WiFi-enabled, code, app, or fingerprint — installed and paired properly.', priceFrom: '199' },
  { title: 'Master Key Systems', icon: 'checkCircle', shortDescription: 'Commercial hierarchies — one key opens many doors, per employee.', priceFrom: 'Free Quote' },
  { title: 'Security Hardware Upgrades', icon: 'wind', shortDescription: 'Strike plates, longer screws, reinforced jambs — real burglar-resistance.', priceFrom: '89' },
  { title: '24/7 Mobile Service', icon: 'calendarCheck', shortDescription: 'Fully equipped vans — we come to your door, usually within 30 minutes.', priceFrom: 'Call Now' },
];

const PEST_CONTROL_DEFAULT_SERVICES = [
  { title: 'General Pest Control', icon: 'shieldCheck', shortDescription: 'Ants, roaches, spiders, silverfish — interior and exterior treatment.', priceFrom: '129' },
  { title: 'Termite Treatment', icon: 'wrench', shortDescription: 'Inspection, baiting, liquid barrier — wood damage stopped before it spreads.', priceFrom: 'Free Quote' },
  { title: 'Rodent Control', icon: 'layers', shortDescription: 'Mice and rats — trapping, exclusion, and sealing the entry points.', priceFrom: '189' },
  { title: 'Bed Bug Extermination', icon: 'flame', shortDescription: 'Heat or chemical treatment. Follow-up visit included in every plan.', priceFrom: 'Free Quote' },
  { title: 'Mosquito Control', icon: 'wind', shortDescription: 'Yard treatment, breeding-site removal — safe for kids and pets once dry.', priceFrom: '89' },
  { title: 'Bee & Wasp Removal', icon: 'siren', shortDescription: 'Nest identified and removed safely — without harm to honeybees.', priceFrom: '149' },
  { title: 'Roach Extermination', icon: 'zap', shortDescription: 'German, American, Oriental — identified and gone in 2-3 visits.', priceFrom: '179' },
  { title: 'Flea & Tick Treatment', icon: 'gauge', shortDescription: 'Indoor + outdoor treatment — safe for pets after treatment dries.', priceFrom: '149' },
  { title: '24/7 Emergency Treatment', icon: 'checkCircle', shortDescription: 'Sudden infestation, bee swarm, party next weekend — we move fast.', priceFrom: 'Call Now' },
  { title: 'Quarterly Protection Plans', icon: 'calendarCheck', shortDescription: 'Four visits per year, unlimited callbacks. Most families pick this.', priceFrom: 'From $29/mo' },
];

const WATER_DAMAGE_DEFAULT_SERVICES = [
  { title: '24/7 Water Extraction', icon: 'siren', shortDescription: 'Flooded basement or burst pipe — crew and truck-mount on site fast.', priceFrom: 'Call Now' },
  { title: 'Structural Drying', icon: 'wind', shortDescription: 'Industrial air movers + dehumidifiers, moisture metered daily.', priceFrom: 'Free Quote' },
  { title: 'Mold Remediation', icon: 'shieldCheck', shortDescription: 'Contained removal, HEPA filtration, and post-clearance testing.', priceFrom: 'Free Quote' },
  { title: 'Flood Cleanup', icon: 'layers', shortDescription: 'Standing water, contaminated flooring, belongings triaged and documented.', priceFrom: 'Free Quote' },
  { title: 'Sewage Backup Cleanup', icon: 'flame', shortDescription: 'Category 3 protocols — full PPE, antimicrobial, safe reoccupation.', priceFrom: 'Free Quote' },
  { title: 'Carpet & Flooring Dry-Out', icon: 'gauge', shortDescription: 'Save the flooring where possible; document losses where not.', priceFrom: '349' },
  { title: 'Drywall & Insulation Removal', icon: 'wrench', shortDescription: 'Wet-cut to the minimum, antimicrobial applied, ready for rebuild.', priceFrom: '249' },
  { title: 'Insurance Claim Documentation', icon: 'checkCircle', shortDescription: 'Full photo + moisture-map report formatted for your adjuster.', priceFrom: 'Included' },
  { title: 'Content Pack-Out & Storage', icon: 'zap', shortDescription: 'Belongings inventoried, cleaned, and stored while your home dries.', priceFrom: 'Free Quote' },
  { title: 'Post-Work Mold Testing', icon: 'calendarCheck', shortDescription: 'Third-party clearance testing after remediation — no conflict of interest.', priceFrom: '199' },
];

const TREE_SERVICE_DEFAULT_SERVICES = [
  { title: 'Tree Removal', icon: 'wrench', shortDescription: 'Dead, leaning, too close to the house — removed in sections, cleanly.', priceFrom: 'Free Quote' },
  { title: 'Emergency Storm Cleanup', icon: 'siren', shortDescription: 'Tree on roof, fence, or driveway — crew dispatched the same day.', priceFrom: 'Call Now' },
  { title: 'Tree Trimming & Pruning', icon: 'layers', shortDescription: 'Structural pruning, crown reduction, deadwood removal — healthy cuts.', priceFrom: '249' },
  { title: 'Stump Grinding', icon: 'gauge', shortDescription: 'Down to 6-12 inches below grade. Wood chips removed or left on request.', priceFrom: '149' },
  { title: 'Tree Health Assessment', icon: 'shieldCheck', shortDescription: 'Certified arborist evaluation — disease, pests, and risk scored.', priceFrom: '99' },
  { title: 'Cabling & Bracing', icon: 'zap', shortDescription: 'Save a split tree. Steel cables and bracing rods installed to industry standard.', priceFrom: 'Free Quote' },
  { title: 'Lot & Land Clearing', icon: 'flame', shortDescription: 'Small lots to acre+ — trees, stumps, brush hauled off.', priceFrom: 'Free Quote' },
  { title: 'Storm Damage Inspection', icon: 'checkCircle', shortDescription: 'Post-storm hazard check. Insurance-ready photo report included.', priceFrom: '99' },
  { title: 'Firewood & Mulch Sales', icon: 'wind', shortDescription: 'Seasoned hardwood by the cord, fresh mulch by the yard — delivered.', priceFrom: 'From $199' },
  { title: 'Annual Maintenance Plans', icon: 'calendarCheck', shortDescription: 'Seasonal pruning and health check — catch hazards before they fall.', priceFrom: 'From $29/mo' },
];

// Per-trade copy. Used whenever a page needs a label that would otherwise
// say "HVAC" in hardcoded English. Keep this the single source of truth
// so adding a third trade later means touching one map, not eight files.
const TRADE_COPY = {
  hvac: {
    label: 'HVAC',                                             // short noun used in eyebrows / headings
    heroAccent: 'Heating & Air Conditioning',                  // colored span in home hero h1
    heroSub: 'Fast, reliable HVAC repair, installation, and maintenance. Licensed, insured, and here when you need us most.',
    servicesEyebrow: 'Our HVAC Services',
    servicesH1: 'Our HVAC Services.',
    servicesSub: 'Everything from emergency repairs to full system installs — delivered by licensed, background-checked technicians.',
    areasHeroBody: 'we serve homeowners across the region with same-day HVAC service, free quotes, and 24/7 emergency response.',
    areaCardHeading: 'HVAC Service in',                        // per-area card h2: "HVAC Service in Austin"
    areaDescFallback: (area) => `Our technicians cover ${area} with same-day service and 24/7 emergency response. Whether it's AC repair, heating installation, or a seasonal tune-up, we're a short drive from your door — fully licensed, fully insured, and backed by a satisfaction guarantee.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} HVAC team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `HVAC in ${city}` : 'HVAC',
    contactMetaDesc: (bn, city, phone) => `Request a free HVAC quote from ${bn}${city ? ` in ${city}` : ''}. Same-day service, 1-hour callback, 24/7 emergencies.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `HVAC Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, reliable heating, cooling, and air quality services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted heating, cooling, and air quality services${city ? ` in ${city}` : ''}. 24/7 emergency. Licensed & insured.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: DEFAULT_SERVICES,
    // Used when the user provides no testimonials AND the LLM content
    // generator didn't run (fallback-only render path).
    fallbackTestimonials: (city) => [
      { quote: 'Our AC went out in the middle of a heatwave. Technician was at our door in under two hours and had us cool again by lunch.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'They replaced our entire heating system in a single day. Clean work, upfront pricing, and the new system is whisper-quiet.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'I’ve used three HVAC companies over the years. These guys are by far the most honest. They actually told me my unit did NOT need replacing.', name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    // About-page credentials block. NATE is HVAC-specific, so plumbers get
    // a different third card.
    licenseCardDesc: 'State-issued HVAC contractor license, renewed annually and publicly verifiable.',
    skillCardTitle: 'NATE Certified',
    skillCardDesc: 'North American Technician Excellence &mdash; the industry gold standard for HVAC skill.',
    skillCardTag: 'NATE-certified',
  },
  plumbing: {
    label: 'Plumbing',
    heroAccent: 'Plumbing',
    heroSub: 'Fast, reliable leak repair, drain cleaning, and water heater service. Licensed, insured, and here when you need us most.',
    servicesEyebrow: 'Our Plumbing Services',
    servicesH1: 'Our Plumbing Services.',
    servicesSub: 'Everything from emergency leak fixes to full re-pipes — delivered by licensed, background-checked plumbers.',
    areasHeroBody: 'we serve homeowners across the region with same-day plumbing service, free quotes, and 24/7 emergency response.',
    areaCardHeading: 'Plumbing Service in',
    areaDescFallback: (area) => `Our plumbers cover ${area} with same-day service and 24/7 emergency response. Whether it's a burst pipe, clogged drain, or water heater replacement, we're a short drive from your door — fully licensed, fully insured, and backed by a satisfaction guarantee.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} plumbing team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Plumbing in ${city}` : 'Plumbing',
    contactMetaDesc: (bn, city, phone) => `Request a free plumbing quote from ${bn}${city ? ` in ${city}` : ''}. Same-day service, 1-hour callback, 24/7 emergencies.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Plumbing Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, reliable plumbing services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted leak repair, drain cleaning, and water heater services${city ? ` in ${city}` : ''}. 24/7 emergency. Licensed & insured.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: PLUMBING_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Called them at 10pm about a pipe that burst under our sink. Tech was out within the hour and the leak was fixed by midnight. Saved our kitchen.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Replaced our 20-year-old water heater in a single day. Clean install, upfront pricing, and the new unit cut our gas bill noticeably.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'I’ve used three plumbers over the years. These guys are by far the most honest. They told me my drain line did NOT need replacing.', name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued plumbing contractor license, renewed annually and publicly verifiable.',
    skillCardTitle: 'Master Plumber On Staff',
    skillCardDesc: 'Master-level certification &mdash; the top rank in the plumbing trade, signed off on every complex job.',
    skillCardTag: 'Master-certified',
  },
  electrical: {
    label: 'Electrical',
    heroAccent: 'Electrical',
    heroSub: 'Fast, reliable electrical repair, panel upgrades, and wiring. Licensed, insured, and here when you need us most.',
    servicesEyebrow: 'Our Electrical Services',
    servicesH1: 'Our Electrical Services.',
    servicesSub: 'Everything from emergency outages to full panel upgrades — delivered by licensed, background-checked electricians.',
    areasHeroBody: 'we serve homeowners across the region with same-day electrical service, free quotes, and 24/7 emergency response.',
    areaCardHeading: 'Electrical Service in',
    areaDescFallback: (area) => `Our electricians cover ${area} with same-day service and 24/7 emergency response. Whether it's a dead outlet, a panel upgrade, or a full rewire, we're a short drive from your door — fully licensed, fully insured, and backed by a satisfaction guarantee.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} electrical team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Electrician in ${city}` : 'Electrical',
    contactMetaDesc: (bn, city, phone) => `Request a free electrical quote from ${bn}${city ? ` in ${city}` : ''}. Same-day service, 1-hour callback, 24/7 emergencies.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Electrical Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, reliable electrical services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted electrical repair, panel upgrades, and wiring services${city ? ` in ${city}` : ''}. 24/7 emergency. Licensed & insured.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: ELECTRICAL_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Half the house went dark on a Sunday night. Electrician was in our driveway in 45 minutes and had the panel sorted before the kids went to bed. Clean, calm, priced fair.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Upgraded our 1970s panel to a 200A and installed the EV charger in one visit. Permit pulled, inspection passed, no surprise add-ons. Exactly what they quoted.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: "I've used three electricians over the years. These guys told me my panel was FINE and just needed two breakers swapped. Saved me three grand.", name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued electrical contractor license, renewed annually and publicly verifiable.',
    skillCardTitle: 'Master Electrician On Staff',
    skillCardDesc: 'Master-level certification &mdash; the top rank in the electrical trade, signed off on every complex job.',
    skillCardTag: 'Master-certified',
  },
  roofing: {
    label: 'Roofing',
    heroAccent: 'Roofing',
    heroSub: 'Fast, reliable roof repair, replacement, and storm-damage work. Licensed, insured, and here when the weather turns.',
    servicesEyebrow: 'Our Roofing Services',
    servicesH1: 'Our Roofing Services.',
    servicesSub: 'Everything from emergency tarping to full replacement — delivered by licensed, insured roofing crews.',
    areasHeroBody: 'we serve homeowners across the region with same-day roof service, free quotes, and 24/7 storm response.',
    areaCardHeading: 'Roofing Service in',
    areaDescFallback: (area) => `Our crews cover ${area} with same-day service and 24/7 storm response. Whether it's a missing shingle, a leak, or full replacement, we're a short drive from your home — fully licensed, fully insured, and backed by a warranty that outlives the next storm.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} roofing team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Roofing in ${city}` : 'Roofing',
    contactMetaDesc: (bn, city, phone) => `Request a free roofing quote from ${bn}${city ? ` in ${city}` : ''}. Same-day inspections, 1-hour callback, 24/7 storm response.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Roofing Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, reliable roofing services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted roof repair, replacement, and storm-damage services${city ? ` in ${city}` : ''}. 24/7 storm response. Licensed & insured.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: ROOFING_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Tree came through a section of our roof during the storm. Crew was on site by sunrise with tarps, photos for the insurance adjuster, and a written estimate. Saved the interior.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Full tear-off and replacement in a single day. Crew laid down cleanly, ran the magnet for nails twice, and left the lawn cleaner than they found it.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Inspector told me I needed a full replacement to close on the house. These guys came out, showed me it was flashing around one vent. $180 instead of $15k.', name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued roofing contractor license, renewed annually and publicly verifiable.',
    skillCardTitle: 'GAF Master Elite Certified',
    skillCardDesc: 'One of the top 2% of roofers in North America &mdash; factory-trained, manufacturer-backed warranties on every install.',
    skillCardTag: 'GAF-certified',
  },
  appliance: {
    label: 'Appliance Repair',
    heroAccent: 'Appliance Repair',
    heroSub: 'Fast, honest repair for every major kitchen and laundry appliance. Parts on the truck, same-day in most cases.',
    servicesEyebrow: 'Our Appliance Services',
    servicesH1: 'Our Appliance Repair Services.',
    servicesSub: 'Fridges, washers, dryers, dishwashers, ovens — diagnosed accurately, fixed the first visit when we can.',
    areasHeroBody: 'we serve homeowners across the region with same-day appliance repair, free diagnostic with every repair, and 24/7 emergency service.',
    areaCardHeading: 'Appliance Repair in',
    areaDescFallback: (area) => `Our technicians cover ${area} with same-day service and a massive on-truck parts inventory. Whether it's a fridge not cooling, a washer not draining, or a dryer with no heat, we're a short drive from your kitchen — fully licensed, fully insured, and backed by a 90-day repair warranty.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} appliance-repair team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Appliance Repair in ${city}` : 'Appliance Repair',
    contactMetaDesc: (bn, city, phone) => `Request a free diagnostic from ${bn}${city ? ` in ${city}` : ''}. Same-day repair, 1-hour callback, 24/7 emergencies.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Appliance Repair${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, honest appliance repair${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted appliance repair services${city ? ` in ${city}` : ''}. Same-day fridge, washer, dryer, dishwasher, oven. 24/7 emergency.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: APPLIANCE_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Fridge stopped cooling on Sunday with a full load of groceries inside. Tech was here in 90 minutes with the exact compressor relay. Saved everything.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Our 8-year-old front-loader started leaking. Three shops told me to replace the whole machine. These guys fixed the door gasket for $140. Still running.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: "Dryer wouldn't start. Tech showed me the bad thermal fuse, explained what caused it (clogged vent), and cleaned the vent too. Cost less than I expected.", name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued service contractor license, renewed annually and publicly verifiable.',
    skillCardTitle: 'Factory-Authorized Techs',
    skillCardDesc: 'Trained and authorized by every major brand &mdash; Whirlpool, GE, LG, Samsung, Bosch, Maytag. Warranty work accepted.',
    skillCardTag: 'Factory-certified',
  },
  'garage-door': {
    label: 'Garage Door',
    heroAccent: 'Garage Door',
    heroSub: 'Fast, reliable garage door repair, install, and opener service. Same-day in most cases, with springs and openers on every truck.',
    servicesEyebrow: 'Our Garage Door Services',
    servicesH1: 'Our Garage Door Services.',
    servicesSub: 'Springs, openers, off-track doors, new installs — every truck carries the common parts so most visits are one-and-done.',
    areasHeroBody: 'we serve homeowners across the region with same-day garage door service, free quotes, and 24/7 emergency response.',
    areaCardHeading: 'Garage Door Service in',
    areaDescFallback: (area) => `Our technicians cover ${area} with same-day service and a fully stocked parts truck. Whether it's a snapped spring, an off-track door, or a brand-new install, we're a short drive from your garage — fully licensed, fully insured, and backed by a workmanship warranty.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} garage door team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Garage Doors in ${city}` : 'Garage Doors',
    contactMetaDesc: (bn, city, phone) => `Request a free garage door quote from ${bn}${city ? ` in ${city}` : ''}. Same-day repair, 1-hour callback, 24/7 emergencies.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Garage Door Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, reliable garage door services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted garage door repair, install, and opener services${city ? ` in ${city}` : ''}. 24/7 emergency. Licensed & insured.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: GARAGE_DOOR_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Spring snapped and the door was stuck closed with my car inside. Tech was here in 40 minutes and had the right torsion spring on the truck. Back in business in an hour.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Installed a smart opener with camera for us. Clean work, walked me through the app, and the old opener was gone when they left. Cheaper than Home Depot quoted.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Another company told me I needed a whole new door. These guys replaced two panels and the rollers for a third of the price. Door looks and sounds new.', name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued contractor license, renewed annually and publicly verifiable.',
    skillCardTitle: 'IDA Accredited',
    skillCardDesc: 'International Door Association accreditation &mdash; the industry standard for garage door expertise and safety.',
    skillCardTag: 'IDA-accredited',
  },
  locksmith: {
    label: 'Locksmith',
    heroAccent: 'Locksmith',
    heroSub: 'Fast, reliable lockouts, rekeying, and lock install. Mobile techs, usually at your door within 30 minutes.',
    servicesEyebrow: 'Our Locksmith Services',
    servicesH1: 'Our Locksmith Services.',
    servicesSub: 'Home, car, or office lockouts; rekeys; smart lock installs; safe openings — mobile, licensed, and fast.',
    areasHeroBody: 'we serve customers across the region with 24/7 mobile locksmith service, fast response times, and honest pricing.',
    areaCardHeading: 'Locksmith Service in',
    areaDescFallback: (area) => `Our mobile techs cover ${area} with 24/7 dispatch. Whether it's a lockout, a rekey after moving in, or a new deadbolt, we're usually at your door in under 30 minutes — fully licensed, bonded, and insured.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} locksmith customers actually recommend by name.`,
    contactTitleTail: (city) => city ? `Locksmith in ${city}` : 'Locksmith',
    contactMetaDesc: (bn, city, phone) => `Request locksmith service from ${bn}${city ? ` in ${city}` : ''}. 24/7 mobile dispatch, 30-minute average response.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Locksmith Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, reliable locksmith services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted lockout, rekey, and lock install services${city ? ` in ${city}` : ''}. 24/7 mobile. Licensed & bonded.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: LOCKSMITH_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Locked out at 1 AM with no neighbor to call. Dispatched a tech who was at my door in 22 minutes, popped the deadbolt without damaging it, and even rekeyed it on the spot.', name: 'Mark Reynolds', role: `Customer${city ? ` · ${city}` : ''}` },
      { quote: 'Moved into a new house and rekeyed every lock that afternoon. Clean work, fair price, and they gave me extra keys without charging per key.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: "Car key got eaten by a lake. The dealership quoted $400 and three days. These guys cut and programmed a new fob in the parking lot for $165. Done in 20 minutes.", name: 'David Chen', role: `Customer${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued locksmith license, renewed annually and publicly verifiable.',
    skillCardTitle: 'ALOA Certified Registered Locksmith',
    skillCardDesc: 'Associated Locksmiths of America credential &mdash; the nationally recognized standard for locksmith expertise and ethics.',
    skillCardTag: 'ALOA-certified',
  },
  'pest-control': {
    label: 'Pest Control',
    heroAccent: 'Pest Control',
    heroSub: 'Fast, effective pest control with safe treatments for families and pets. Same-day in most areas.',
    servicesEyebrow: 'Our Pest Control Services',
    servicesH1: 'Our Pest Control Services.',
    servicesSub: 'Ants, rodents, roaches, termites, bed bugs, mosquitoes — identified accurately, treated thoroughly.',
    areasHeroBody: 'we serve homeowners across the region with same-day pest service, free inspections, and recurring protection plans.',
    areaCardHeading: 'Pest Control in',
    areaDescFallback: (area) => `Our techs cover ${area} with same-day service and kid/pet-safe treatments. Whether it's a rodent problem, ants in the kitchen, or a surprise bee swarm, we're a short drive from your door — licensed, insured, and backed by a satisfaction guarantee.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} pest control team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Pest Control in ${city}` : 'Pest Control',
    contactMetaDesc: (bn, city, phone) => `Request a free pest inspection from ${bn}${city ? ` in ${city}` : ''}. Same-day service, 1-hour callback, 24/7 emergencies.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Pest Control Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, safe pest control services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted pest, termite, rodent, and bed bug control${city ? ` in ${city}` : ''}. Same-day. Licensed & insured.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: PEST_CONTROL_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Saw a mouse, then three. Tech came out, sealed six entry points I never would have spotted, set traps, and did a follow-up two weeks later. Zero mice since.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Bed bugs from a hotel trip. Heat treatment + follow-up chemical in the baseboards. One month later, nothing. Our pillows thank them.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: "Another company wanted to charge quarterly just to show up. These guys diagnosed carpenter ants, treated the source, and said we'd likely be fine without a recurring plan. Honest work.", name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued pesticide applicator license, renewed annually and publicly verifiable.',
    skillCardTitle: 'QualityPro Certified',
    skillCardDesc: 'National Pest Management Association credential &mdash; the top credential for pest control companies, re-audited every 3 years.',
    skillCardTag: 'NPMA-certified',
  },
  'water-damage': {
    label: 'Water Damage Restoration',
    heroAccent: 'Water Damage Restoration',
    heroSub: 'Fast, full-service water extraction, structural drying, and mold remediation. On-site fast, insurance-friendly.',
    servicesEyebrow: 'Our Restoration Services',
    servicesH1: 'Our Water Damage Services.',
    servicesSub: 'Burst pipes, flooded basements, storm damage, mold — extracted, dried, and restored with clear documentation for your insurance.',
    areasHeroBody: 'we serve homeowners across the region with 24/7 emergency dispatch, IICRC-certified techs, and direct insurance billing.',
    areaCardHeading: 'Water Damage Service in',
    areaDescFallback: (area) => `Our crews cover ${area} with 24/7 emergency dispatch. Whether it's a burst pipe, a flooded basement, or a suspected mold issue, we're usually on site within 60 minutes — IICRC certified, fully insured, and ready to work directly with your insurance adjuster.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} restoration team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Restoration in ${city}` : 'Restoration',
    contactMetaDesc: (bn, city, phone) => `Request emergency restoration from ${bn}${city ? ` in ${city}` : ''}. 24/7 dispatch, 60-minute response, direct insurance billing.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Water Damage Restoration${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: fast, full-service water damage restoration${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted water extraction, drying, and mold remediation${city ? ` in ${city}` : ''}. 24/7 emergency. IICRC-certified.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: WATER_DAMAGE_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Pipe burst in the wall while we were on vacation. Crew was on site within the hour of our neighbor calling, had water extracted and drying equipment running before we got home. Insurance approved on the first try.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Basement flooded during a storm. They did full extraction, contained the mold area properly, and handled all the adjuster communication. We barely had to do anything.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: "Another restoration company was going to tear out half the drywall. These guys used moisture meters to prove only a 4-foot section was wet. Saved us a month of rebuild.", name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-issued restoration contractor license, renewed annually and publicly verifiable.',
    skillCardTitle: 'IICRC Certified Firm',
    skillCardDesc: 'Institute of Inspection, Cleaning and Restoration Certification &mdash; the gold standard for water damage and mold remediation.',
    skillCardTag: 'IICRC-certified',
  },
  'tree-service': {
    label: 'Tree Service',
    heroAccent: 'Tree Service',
    heroSub: 'Fast, careful tree removal, trimming, and storm cleanup. Fully insured crews, clean worksites.',
    servicesEyebrow: 'Our Tree Services',
    servicesH1: 'Our Tree Services.',
    servicesSub: 'Removal, pruning, stump grinding, storm cleanup, cabling — certified arborists on site for every job that needs one.',
    areasHeroBody: 'we serve homeowners across the region with same-day estimates, 24/7 storm response, and clean worksites.',
    areaCardHeading: 'Tree Service in',
    areaDescFallback: (area) => `Our crews cover ${area} with same-day estimates and 24/7 storm response. Whether it's a dead tree over your driveway, a routine trim, or a tree down on the roof after a storm, we're a short drive away — fully insured, OSHA-trained, and backed by a certified arborist.`,
    aboutTaglineFallback: (city) => `The ${city || 'local'} tree team homeowners actually recommend by name.`,
    contactTitleTail: (city) => city ? `Tree Service in ${city}` : 'Tree Service',
    contactMetaDesc: (bn, city, phone) => `Request a free tree estimate from ${bn}${city ? ` in ${city}` : ''}. Same-day response, 24/7 storm dispatch, fully insured crews.${phone ? ` Call ${phone}.` : ''}`,
    pageMetaTitleTail: (city) => `Tree Services${city ? ` in ${city}` : ''}`,
    pageMetaDescDefault: (bn, city, phone) => `${bn}: careful, insured tree services${city ? ` in ${city}` : ''}. ${phone ? `Call ${phone}.` : ''}`,
    heroSeoDesc: (bn, city, phone) => `${bn}: trusted tree removal, trimming, and storm cleanup${city ? ` in ${city}` : ''}. 24/7 emergency. ISA-certified arborist.${phone ? ` Call ${phone}.` : ''}`,
    defaultServices: TREE_SERVICE_DEFAULT_SERVICES,
    fallbackTestimonials: (city) => [
      { quote: 'Big oak fell across the driveway during the storm. Crew was on site by 7 AM with a lift truck, cleared it all, ground the stump, and raked the yard cleaner than it was before.', name: 'Mark Reynolds', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: 'Needed a tall pine removed right next to the house. They dropped it in sections, laid down plywood on the lawn, and you could not tell they had been there.', name: 'Jennifer Park', role: `Homeowner${city ? ` · ${city}` : ''}` },
      { quote: "Arborist walked our property, pointed out two trees that could go, and said the other six were fine and just needed a trim. Honest assessment, not a sales pitch.", name: 'David Chen', role: `Homeowner${city ? ` · ${city}` : ''}` },
    ],
    licenseCardDesc: 'State-licensed and fully insured &mdash; worker\'s comp + liability coverage on every crew, every job.',
    skillCardTitle: 'ISA Certified Arborist',
    skillCardDesc: 'International Society of Arboriculture credential &mdash; on-staff for every complex removal and health assessment.',
    skillCardTag: 'ISA-certified',
  },
};

// Read the per-trade copy bundle from a template config. Defaults to HVAC
// so existing sites (no `trade` field on config) behave exactly as before.
function getTradeCopy(c) {
  const trade = (c && c.trade) || 'hvac';
  return TRADE_COPY[trade] || TRADE_COPY.hvac;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function getHvacStyles(c = {}) {
  const t = buildTokens(c);
  return `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:${t.heading};background:${t.pageBg};line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.ff-display{font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif}
img,svg{max-width:100%;display:block}
a{color:${t.action};text-decoration:none}
a:hover{color:${t.trust}}

/* Layout */
.ctn{max-width:1200px;margin:0 auto;padding:0 20px}
@media(min-width:768px){.ctn{padding:0 32px}}
.sect{padding:72px 0;position:relative}
@media(min-width:768px){.sect{padding:96px 0}}
.sect-alt{background:${t.sectionAlt}}
.sect-dark{background:${t.darkBg};color:${t.onDark}}
/* Soft gradient backdrop for "alt" rhythm sections */
.sect-soft{background:linear-gradient(180deg,${t.sectionAlt} 0%,${t.pageBg} 100%)}
.sect-soft-rev{background:linear-gradient(180deg,${t.pageBg} 0%,${t.sectionAlt} 100%)}
/* Decorative top accent line — used to demarcate sections subtly */
.sect-accent::before{content:'';position:absolute;left:50%;top:0;width:80px;height:3px;background:${t.orange};border-radius:0 0 4px 4px;transform:translateX(-50%)}
/* Heading accent bar — short orange line under H2s */
.bar-accent{display:block;width:48px;height:3px;border-radius:3px;background:${t.orange};margin:14px auto 0}
.bar-accent-l{margin-left:0;margin-right:0}

/* Typography */
.h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(32px,5.5vw,52px);font-weight:800;line-height:1.1;letter-spacing:-0.025em;color:${t.heading}}
.h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(28px,4.2vw,40px);font-weight:700;line-height:1.15;letter-spacing:-0.02em;color:${t.heading}}
.h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(19px,2.4vw,22px);font-weight:700;color:${t.heading}}
.body-lg{font-size:clamp(17px,2vw,20px);line-height:1.6;color:${t.body}}
.body{font-size:17px;color:${t.body}}
@media(max-width:640px){.body{font-size:16px}}
.muted{color:${t.muted};font-size:14px}
.eyebrow{display:inline-block;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${t.action}}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 26px;font-family:'Inter',sans-serif;font-size:16px;font-weight:600;line-height:1;border-radius:10px;cursor:pointer;transition:all .18s ease;text-decoration:none;border:none;white-space:nowrap}
.btn-lg{padding:18px 32px;font-size:17px}
.btn-sm{padding:10px 18px;font-size:14px}
.btn-orange{background:${t.orange};color:#fff;box-shadow:0 6px 16px rgba(249,115,22,.28)}
.btn-orange:hover{background:${t.orangeHover};color:#fff;transform:translateY(-1px);box-shadow:0 10px 22px rgba(249,115,22,.35)}
.btn-blue{background:${t.trust};color:#fff}
.btn-blue:hover{background:#15314F;color:#fff;transform:translateY(-1px)}
.btn-outline{background:transparent;color:${t.trust};border:2px solid ${t.trust}}
.btn-outline:hover{background:${t.trust};color:#fff}
.btn-outline-white{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.35)}
.btn-outline-white:hover{background:#fff;color:${t.trust};border-color:#fff}
.btn-white{background:#fff;color:${t.trust}}
.btn-white:hover{background:${t.sectionAlt};color:${t.trust}}

/* Emergency strip */
.e-strip{background:${t.emergency};color:#fff;padding:8px 0;font-size:14px;font-weight:600;position:relative;z-index:50}
.e-strip .ctn{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.e-strip-l{display:inline-flex;align-items:center;gap:8px}
.e-strip-l .dot{position:relative;width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.7);animation:estPulse 1.6s ease-out infinite}
@keyframes estPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.6),0 0 8px rgba(255,255,255,.6)}70%{box-shadow:0 0 0 9px rgba(255,255,255,0),0 0 4px rgba(255,255,255,.2)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}
.e-strip a{color:#fff;text-decoration:none;font-weight:700}
.e-strip a:hover{color:#fff;text-decoration:underline}
.e-strip-cta{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.14);transition:background .18s}
.e-strip-cta:hover{background:rgba(255,255,255,.24);text-decoration:none!important}
@media(max-width:640px){
  .e-strip{font-size:13px;padding:7px 0}
  .e-strip-full{display:none}
  .e-strip-short{display:inline}
}
@media(min-width:641px){
  .e-strip-full{display:inline}
  .e-strip-short{display:none}
}

/* Navigation */
.nav{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid ${t.border};transition:box-shadow .2s}
.nav.scrolled{box-shadow:0 2px 16px rgba(15,23,42,.06)}
.nav-inner{display:flex;align-items:center;justify-content:space-between;height:64px;gap:16px}
.nav-logo{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:19px;color:${t.trust};letter-spacing:-0.01em}
.nav-logo .logo-mark{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:${t.trust};color:#fff;border-radius:8px;margin-right:8px;font-size:15px}
.nav-links{display:none;gap:28px;align-items:center}
@media(min-width:900px){.nav-links{display:flex}}
.nav-links a{color:${t.heading};font-weight:500;font-size:15px;transition:color .15s}
.nav-links a:hover,.nav-links a.active{color:${t.trust}}
.nav-right{display:flex;align-items:center;gap:10px}
.nav-phone{display:none;align-items:center;gap:6px;color:${t.heading};font-weight:700;font-family:'Plus Jakarta Sans',sans-serif;font-size:16px}
.nav-phone svg{color:${t.trust}}
@media(min-width:900px){.nav-phone{display:inline-flex}}
.nav-call-m{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:${t.trust};color:#fff}
@media(min-width:900px){.nav-call-m{display:none}}
.ham{display:inline-flex;flex-direction:column;justify-content:center;gap:4px;width:40px;height:40px;border-radius:10px;background:transparent;border:1px solid ${t.border};cursor:pointer;padding:10px}
@media(min-width:900px){.ham{display:none}}
.ham span{display:block;width:100%;height:2px;background:${t.heading};border-radius:2px}
.mm{display:none;position:fixed;inset:64px 0 0 0;background:#fff;z-index:39;padding:24px 20px;flex-direction:column;gap:4px;overflow-y:auto}
.mm.open{display:flex}
.mm a.mm-link{display:block;padding:14px 16px;font-size:18px;font-weight:600;color:${t.heading};border-bottom:1px solid ${t.border}}
.mm a.mm-link:hover{color:${t.trust}}
.mm .mm-cta{margin-top:16px}

/* Floating mobile FAB */
.fab{position:fixed;bottom:20px;right:20px;z-index:45;width:58px;height:58px;border-radius:50%;background:${t.orange};color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 12px 28px rgba(249,115,22,.45);transition:transform .18s}
.fab:hover{transform:scale(1.06);color:#fff}
.fab::before{content:'';position:absolute;inset:-6px;border-radius:50%;border:2px solid ${t.orange};opacity:.5;animation:fabRing 1.8s infinite}
@keyframes fabRing{0%{transform:scale(.95);opacity:.7}100%{transform:scale(1.25);opacity:0}}
@media(min-width:900px){.fab{display:none}}

/* Cards */
.card{background:${t.cardBg};border:1px solid ${t.border};border-radius:14px;padding:28px;transition:transform .18s,box-shadow .18s}
.card-hover:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(15,23,42,.08)}
.card-icon{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:12px;background:${t.sectionAlt};color:${t.trust};margin-bottom:16px}

/* Chips / Tags */
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:${t.sectionAlt};color:${t.trust};font-size:13px;font-weight:600}
.chip-strong{background:${t.trust};color:#fff}
.chip-orange{background:rgba(249,115,22,.1);color:${t.orangeHover}}

/* Trust chips row — grouped on a soft strip with separator dots for visual weight */
.trust-row{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;padding:14px 18px;background:#fff;border:1px solid ${t.border};border-radius:14px;box-shadow:0 4px 14px rgba(15,23,42,.04)}
.trust-row .t-item{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:${t.heading}}
.trust-row .t-item svg{color:${t.orange};flex-shrink:0}
.trust-row .t-sep{width:4px;height:4px;border-radius:50%;background:${t.muted};opacity:.5}
@media(max-width:640px){.trust-row .t-sep{display:none}}

/* Grid */
.grid{display:grid;gap:20px}
.grid-3{grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))}
.grid-4{grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))}

/* Hero — depth via radial glow + diagonal navy panel behind photo */
.hero{position:relative;padding:60px 0 96px;overflow:hidden;background:linear-gradient(180deg,${t.pageBg} 0%,#fff 100%)}
@media(min-width:900px){.hero{padding:88px 0 120px}}
.hero::before{content:'';position:absolute;top:-160px;right:-200px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,.14) 0%,transparent 70%);pointer-events:none;z-index:0}
.hero::after{content:'';position:absolute;bottom:-180px;left:-160px;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.08) 0%,transparent 70%);pointer-events:none;z-index:0}
.hero > .ctn{position:relative;z-index:1}
.hero-grid{display:grid;gap:40px;align-items:center}
@media(min-width:900px){.hero-grid{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:56px}}
.hero-photo-wrap{position:relative}
.hero-photo-wrap::before{content:'';position:absolute;top:24px;right:-24px;bottom:-24px;left:24px;background:linear-gradient(135deg,${t.trust} 0%,${t.action} 100%);border-radius:24px;z-index:0;opacity:.92}
@media(max-width:899px){.hero-photo-wrap::before{display:none}}
.hero-photo{position:relative;z-index:1;aspect-ratio:4/5;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,${t.trust} 0%,${t.action} 100%);box-shadow:0 30px 70px -15px rgba(15,23,42,.35)}
.hero-photo-icon{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,.55)}
/* Floating trust proof card on hero photo (replaces the awkward "replace me" tooltip) */
.hero-badge{position:absolute;left:-16px;bottom:24px;z-index:2;background:#fff;border:1px solid ${t.border};border-radius:14px;padding:14px 18px;box-shadow:0 18px 40px -10px rgba(15,23,42,.25);display:flex;align-items:center;gap:14px;max-width:260px}
@media(max-width:899px){.hero-badge{left:50%;transform:translateX(-50%);bottom:-22px}}
.hero-badge .stars{display:inline-flex;gap:1px}
.hero-badge .badge-text strong{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:800;color:${t.heading};line-height:1}
.hero-badge .badge-text span{display:block;font-size:11.5px;color:${t.muted};margin-top:3px;letter-spacing:.02em}
/* Tiny corner camera tooltip — non-intrusive, replaces the giant gray overlay */
.hero-photo-tip{position:absolute;top:12px;right:12px;z-index:2;background:rgba(15,23,42,.6);backdrop-filter:blur(6px);color:#fff;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:500;display:inline-flex;align-items:center;gap:6px;opacity:.85;transition:opacity .2s}
.hero-photo-tip:hover{opacity:1}
.hero-photo-credit{position:absolute;bottom:8px;right:12px;z-index:2;font-size:10px;color:rgba(255,255,255,.7);letter-spacing:.02em}
.hero-photo-credit a{color:rgba(255,255,255,.85);text-decoration:underline}

/* Service card — image-top layout for home grid (real photos instead of icons) */
.svc-card{position:relative;background:#fff;border:1px solid ${t.border};border-radius:16px;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease;display:flex;flex-direction:column;height:100%;text-decoration:none;box-shadow:0 4px 18px rgba(15,23,42,.045);overflow:hidden}
.svc-card:hover{border-color:transparent;transform:translateY(-4px);box-shadow:0 22px 44px rgba(30,58,95,.14)}
.svc-card .svc-media{position:relative;aspect-ratio:5/3;overflow:hidden;background:linear-gradient(135deg,${t.trust},${t.action})}
.svc-card .svc-media::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(15,23,42,.35) 100%);pointer-events:none;opacity:.6;transition:opacity .25s}
.svc-card:hover .svc-media::after{opacity:.35}
.svc-card .svc-media img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .45s ease}
.svc-card:hover .svc-media img{transform:scale(1.06)}
.svc-card .svc-media-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55)}
.svc-card .svc-price-abs{position:absolute;top:14px;left:14px;z-index:2;display:inline-flex;align-items:center;font-family:'Plus Jakarta Sans',sans-serif;font-size:12.5px;font-weight:700;color:${t.orangeHover};background:rgba(255,255,255,.95);backdrop-filter:blur(6px);padding:5px 11px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,.15)}
.svc-card .svc-body{padding:22px 24px 24px;display:flex;flex-direction:column;gap:10px;flex-grow:1}
.svc-card h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:19px;font-weight:700;color:${t.heading};line-height:1.25}
.svc-card p{font-size:14.5px;color:${t.body};line-height:1.55;flex-grow:1}
.svc-card .svc-link{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:${t.action};margin-top:6px}
.svc-card .svc-link svg{transition:transform .2s ease}
.svc-card:hover .svc-link svg{transform:translateX(4px)}

/* Why choose us — numbered horizontal bars (no icon glyphs = less AI-template) */
.why-row{display:grid;gap:18px}
@media(min-width:640px){.why-row{grid-template-columns:repeat(2,1fr)}}
.why-item{position:relative;background:#fff;border-radius:14px;padding:28px 28px 28px 30px;border:1px solid ${t.border};display:flex;align-items:flex-start;gap:22px;transition:box-shadow .2s ease,transform .2s ease;overflow:hidden}
.why-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:${t.orange};border-radius:4px 0 0 4px}
.why-item:hover{box-shadow:0 14px 28px rgba(30,58,95,.08);transform:translateY(-2px)}
.why-item .why-num{flex-shrink:0;font-family:'Plus Jakarta Sans',sans-serif;font-size:44px;font-weight:800;line-height:.9;color:transparent;-webkit-text-stroke:1.5px ${t.action};background:linear-gradient(135deg,${t.action} 0%,${t.trust} 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-0.04em;min-width:56px}
.why-item .why-body{flex:1}
.why-item h4{font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:700;color:${t.heading};margin-bottom:6px;line-height:1.25}
.why-item p{font-size:14.5px;color:${t.body};line-height:1.55}

/* Testimonials — premium card with quote mark + filled stars + Google G */
.testi{position:relative;background:#fff;border:1px solid ${t.border};border-left:4px solid ${t.action};border-radius:14px;padding:32px 28px 26px;display:flex;flex-direction:column;gap:14px;box-shadow:0 4px 18px rgba(15,23,42,.04);transition:box-shadow .22s ease,transform .22s ease}
.testi:hover{box-shadow:0 18px 36px rgba(15,23,42,.08);transform:translateY(-3px)}
.testi::before{content:'\\201C';position:absolute;top:14px;right:24px;font-family:Georgia,serif;font-size:80px;line-height:.7;color:rgba(37,99,235,.13);font-weight:700;pointer-events:none}
.testi .stars{display:inline-flex;gap:2px;align-items:center}
.testi-q{font-size:16px;line-height:1.65;color:${t.heading};position:relative;z-index:1}
.testi-meta{display:flex;align-items:center;gap:12px;padding-top:18px;border-top:1px solid ${t.border}}
.avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${t.trust},${t.action});color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;box-shadow:0 4px 10px rgba(30,58,95,.2)}
.avatar.av-1{background:linear-gradient(135deg,${t.trust},${t.action})}
.avatar.av-2{background:linear-gradient(135deg,${t.trust},${t.darkBg})}
.avatar.av-3{background:linear-gradient(135deg,${t.orangeHover},${t.orange})}
.testi-name{font-weight:700;font-size:14.5px;color:${t.heading}}
.testi-role{font-size:12.5px;color:${t.muted}}
.g-pill{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:${t.muted};font-weight:500}
.g-pill svg{flex-shrink:0}

/* Testimonials carousel — scroll-snap track with prev/next + dots */
.testi-carousel{position:relative;margin-top:8px}
.testi-track{display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;padding:12px 4px 24px;scrollbar-width:none}
.testi-track::-webkit-scrollbar{display:none}
.testi-track > .testi{flex:0 0 calc((100% - 40px) / 3);scroll-snap-align:start;min-width:280px}
@media(max-width:900px){.testi-track > .testi{flex:0 0 calc((100% - 20px) / 2)}}
@media(max-width:640px){.testi-track > .testi{flex:0 0 88%}}
.testi-nav{display:flex;justify-content:center;align-items:center;gap:14px;margin-top:16px}
.testi-btn{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:#fff;border:1px solid ${t.border};color:${t.heading};cursor:pointer;transition:all .18s ease;box-shadow:0 4px 12px rgba(15,23,42,.06)}
.testi-btn:hover:not(:disabled){background:${t.trust};color:#fff;border-color:${t.trust};transform:translateY(-1px)}
.testi-btn:disabled{opacity:.35;cursor:not-allowed}
.testi-btn[data-testi-prev] svg{transform:rotate(180deg)}
.testi-dots{display:inline-flex;gap:8px;align-items:center}
.testi-dot{width:8px;height:8px;border-radius:50%;background:${t.border};border:none;padding:0;cursor:pointer;transition:all .18s ease}
.testi-dot.is-active{background:${t.orange};width:22px;border-radius:999px}

/* Areas — pills (used on the Areas page) + split map/cards layout (home page) */
.areas-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.area-pill{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:999px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.18);color:${t.action};font-weight:600;font-size:14px;transition:all .18s ease}
.area-pill svg{color:${t.action}}
.area-pill:hover{background:${t.orange};border-color:${t.orange};color:#fff}
.area-pill:hover svg{color:#fff}

/* Home page — split layout: map on left, enriched area cards on right */
.area-split{display:grid;gap:28px;grid-template-columns:1fr;align-items:stretch}
@media(min-width:900px){.area-split{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:40px}}
.area-map{position:relative;border-radius:18px;overflow:hidden;border:1px solid ${t.border};min-height:420px;box-shadow:0 18px 40px -12px rgba(15,23,42,.18);background:#E2E8F0}
.area-map iframe{width:100%;height:100%;min-height:420px;border:0;display:block;filter:grayscale(.25) contrast(1.02)}
.area-map-overlay{position:absolute;left:16px;bottom:16px;z-index:2;background:rgba(255,255,255,.96);backdrop-filter:blur(6px);padding:14px 18px;border-radius:12px;box-shadow:0 10px 24px rgba(15,23,42,.12);display:flex;align-items:center;gap:12px;max-width:calc(100% - 32px)}
.area-map-overlay .map-ico{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:${t.trust};color:#fff}
.area-map-overlay strong{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:15px;color:${t.heading};line-height:1.15}
.area-map-overlay span{font-size:12.5px;color:${t.muted}}

.area-cards{display:flex;flex-direction:column;gap:12px;max-height:460px;overflow-y:auto;padding-right:4px}
.area-cards::-webkit-scrollbar{width:6px}
.area-cards::-webkit-scrollbar-thumb{background:${t.border};border-radius:3px}
.area-cards::-webkit-scrollbar-thumb:hover{background:${t.muted}}
.area-card{position:relative;display:flex;align-items:center;gap:14px;background:#fff;border:1px solid ${t.border};border-radius:14px;padding:16px 18px;text-decoration:none;color:${t.heading};transition:all .2s ease;overflow:hidden}
.area-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:${t.orange};transform:scaleY(0);transform-origin:top;transition:transform .22s ease}
.area-card:hover{border-color:transparent;box-shadow:0 12px 24px rgba(30,58,95,.12);transform:translateX(2px);color:${t.heading}}
.area-card:hover::before{transform:scaleY(1)}
.area-card .ac-ico{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:11px;background:rgba(37,99,235,.1);color:${t.action};transition:background .18s ease}
.area-card:hover .ac-ico{background:${t.orange};color:#fff}
.area-card .ac-body{flex:1;min-width:0}
.area-card .ac-name{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:16px;line-height:1.2;color:${t.heading};margin-bottom:4px}
.area-card .ac-meta{display:flex;gap:12px;font-size:12px;color:${t.muted};flex-wrap:wrap}
.area-card .ac-meta span{display:inline-flex;align-items:center;gap:4px}
.area-card .ac-meta svg{color:${t.orange}}
.area-card .ac-go{flex-shrink:0;color:${t.muted};transition:all .18s ease}
.area-card:hover .ac-go{color:${t.action};transform:translateX(3px)}

.area-stat{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:${t.body};background:#fff;padding:8px 16px;border-radius:999px;border:1px solid ${t.border};margin-bottom:24px}
.area-stat strong{color:${t.heading};font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:800}

/* Final CTA banner */
.cta-banner{background:${t.darkBg};color:#fff;padding:72px 0;text-align:center}
.cta-banner h2{color:#fff;margin-bottom:12px}
.cta-banner p{color:rgba(255,255,255,.75);margin-bottom:28px}

/* Footer */
.foot{background:${t.darkBg};color:rgba(255,255,255,.75);padding:56px 0 32px;font-size:14px}
.foot-grid{display:grid;gap:32px;grid-template-columns:1fr}
@media(min-width:768px){.foot-grid{grid-template-columns:1.3fr repeat(3,1fr)}}
.foot h5{font-family:'Plus Jakarta Sans',sans-serif;color:#fff;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:14px;font-weight:700}
.foot .foot-brand{font-family:'Plus Jakarta Sans',sans-serif;color:#fff;font-size:20px;font-weight:800;margin-bottom:10px}
.foot a{color:rgba(255,255,255,.75)}
.foot a:hover{color:#fff}
.foot ul{list-style:none;display:flex;flex-direction:column;gap:8px}
.foot-bot{border-top:1px solid rgba(255,255,255,.1);padding-top:24px;margin-top:40px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;font-size:13px;color:rgba(255,255,255,.5)}
.foot-big-phone{display:inline-flex;align-items:center;gap:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;color:#fff;margin-bottom:8px}
.foot-big-phone svg{color:${t.orange}}

/* Quote form */
.form-grid{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:640px){.form-grid{grid-template-columns:1fr 1fr}}
.form-row-full{grid-column:1/-1}
.form-label{display:block;font-size:13px;font-weight:600;color:${t.heading};margin-bottom:6px;letter-spacing:0.01em}
.form-input,.form-select,.form-textarea{width:100%;padding:13px 14px;font-family:inherit;font-size:15px;color:${t.heading};background:#fff;border:1px solid ${t.border};border-radius:10px;transition:border-color .15s,box-shadow .15s}
.form-input:focus,.form-select:focus,.form-textarea:focus{outline:none;border-color:${t.action};box-shadow:0 0 0 3px rgba(37,99,235,.15)}
.form-textarea{min-height:110px;resize:vertical;font-family:inherit}
.form-hidden{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}

/* Service detail (zigzag) */
.zz-row{display:grid;gap:40px;align-items:center;margin-bottom:72px}
@media(min-width:900px){.zz-row{grid-template-columns:1fr 1fr;gap:56px}}
.zz-row:nth-child(even) .zz-text{order:2}
.zz-row:nth-child(even) .zz-visual{order:1}
.zz-visual{position:relative;aspect-ratio:4/3;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,${t.sectionAlt},#fff);border:1px solid ${t.border};display:flex;align-items:center;justify-content:center;box-shadow:0 18px 40px -12px rgba(15,23,42,.15)}
.zz-visual .zz-ico{color:${t.trust};opacity:.25}
.zz-visual-label{position:absolute;bottom:14px;left:14px;background:rgba(255,255,255,.95);backdrop-filter:blur(6px);padding:8px 14px;border-radius:999px;font-size:12px;font-weight:600;color:${t.body};display:flex;align-items:center;gap:6px}

/* Zigzag service label — text-only pill (no icon, less AI-template) */
.zz-label{display:inline-flex;align-items:center;gap:8px;font-family:'Plus Jakarta Sans',sans-serif;font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${t.action};background:rgba(37,99,235,.08);padding:6px 14px;border-radius:999px;margin-bottom:18px}
.zz-label::before{content:'';display:inline-block;width:20px;height:2px;background:${t.action};border-radius:2px}

/* Prominent pricing block — replaces the inline meta text */
.zz-price-block{display:inline-flex;align-items:stretch;gap:0;border:1px solid ${t.border};border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.05);margin-bottom:24px}
.zz-price-cell{display:flex;flex-direction:column;justify-content:center;padding:14px 22px}
.zz-price-cell + .zz-price-cell{border-left:1px solid ${t.border}}
.zz-price-cell .zz-price-label{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${t.muted};margin-bottom:4px}
.zz-price-cell .zz-price-val{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:22px;color:${t.heading};line-height:1.1;letter-spacing:-.01em}
.zz-price-cell.zz-price-accent .zz-price-val{color:${t.orange}}
.zz-price-cell.zz-price-accent{background:rgba(249,115,22,.05)}

/* Feature bullets — colored dots instead of checkmark icons */
.zz-feats{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:26px;list-style:none;padding:0}
@media(min-width:500px){.zz-feats{grid-template-columns:1fr 1fr}}
.zz-feat{display:flex;align-items:flex-start;gap:12px;font-size:15px;color:${t.body};line-height:1.45}
.zz-feat::before{content:'';flex-shrink:0;display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.orange};margin-top:7px;box-shadow:0 0 0 4px rgba(249,115,22,.15)}

/* ═══ ABOUT PAGE ═══ */
/* Story split — text + framed photo with founder badge */
.story-grid{display:grid;gap:48px;align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.story-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:64px}}
.founder-frame{position:relative}
.founder-frame::before{content:'';position:absolute;top:-18px;left:-18px;right:20px;bottom:22px;border:2px solid ${t.orange};border-radius:20px;z-index:0}
.founder-frame > .founder-photo{position:relative;z-index:1;aspect-ratio:4/5;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,${t.trust},${t.action});box-shadow:0 30px 70px -15px rgba(15,23,42,.3)}
.founder-frame > .founder-photo img{width:100%;height:100%;object-fit:cover;display:block}
.founder-frame .fp-placeholder{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,.55)}
.founder-frame .fp-badge{position:absolute;z-index:2;right:-14px;bottom:24px;background:#fff;border:1px solid ${t.border};border-radius:12px;padding:14px 18px;box-shadow:0 18px 40px -10px rgba(15,23,42,.25);max-width:240px}
.founder-frame .fp-badge strong{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:800;color:${t.heading};line-height:1.15}
.founder-frame .fp-badge span{display:block;font-size:12.5px;color:${t.muted};margin-top:3px}
@media(max-width:899px){.founder-frame .fp-badge{right:12px;bottom:-18px}.founder-frame::before{top:-10px;left:-10px;right:10px;bottom:14px}}
.signature{display:flex;align-items:center;gap:14px;margin-top:28px;padding-top:24px;border-top:1px solid ${t.border}}
.signature-name{font-family:'Plus Jakarta Sans',sans-serif;font-style:italic;font-weight:700;font-size:22px;color:${t.trust};letter-spacing:-0.01em}
.signature-role{font-size:13px;color:${t.muted};font-weight:500}

/* Dark stats section */
.stats-dark{background:${t.darkBg};color:#fff;padding:72px 0;position:relative;overflow:hidden}
.stats-dark::before{content:'';position:absolute;top:-120px;left:50%;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,.22) 0%,transparent 60%);transform:translateX(-50%);pointer-events:none}
.stats-dark::after{content:'';position:absolute;bottom:-140px;right:-80px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.15) 0%,transparent 60%);pointer-events:none}
.stats-dark .ctn{position:relative;z-index:1}
.stats-row{display:grid;gap:24px;grid-template-columns:1fr;text-align:center}
@media(min-width:640px){.stats-row{grid-template-columns:repeat(3,1fr)}}
.stat-cell{padding:20px 12px;border-right:1px solid rgba(255,255,255,.1)}
.stat-cell:last-child{border-right:none}
@media(max-width:639px){.stat-cell{border-right:none;border-bottom:1px solid rgba(255,255,255,.1);padding:24px 12px}.stat-cell:last-child{border-bottom:none}}
.stat-num{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(42px,6vw,64px);font-weight:900;line-height:1;letter-spacing:-0.03em;background:linear-gradient(135deg,#fff 0%,#93C5FD 60%,${t.orange} 120%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;display:block}
.stat-label{display:block;margin-top:10px;font-size:13.5px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.7);font-weight:600}

/* Team banner — single wide photo with overlay (replaces wrench-circle cards) */
.team-banner{position:relative;border-radius:22px;overflow:hidden;min-height:320px;box-shadow:0 24px 60px -15px rgba(15,23,42,.3)}
.team-banner img{width:100%;height:100%;min-height:320px;max-height:420px;object-fit:cover;display:block}
.team-banner-fallback{position:absolute;inset:0;background:linear-gradient(135deg,${t.trust},${t.action});display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55)}
.team-banner-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(15,23,42,.75) 0%,rgba(30,58,95,.4) 50%,rgba(15,23,42,.75) 100%);display:flex;align-items:flex-end;padding:32px 36px}
.team-banner-text{max-width:640px;color:#fff}
.team-banner-text .eyebrow{color:${t.orange};font-weight:700;letter-spacing:.08em}
.team-banner-text h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(24px,3vw,34px);font-weight:800;margin:8px 0 6px;color:#fff;line-height:1.1}
.team-banner-text p{font-size:15px;color:rgba(255,255,255,.8);max-width:480px}
.team-banner-text .replace-note{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:6px 12px;background:rgba(255,255,255,.14);backdrop-filter:blur(6px);border-radius:999px;font-size:12px;font-weight:500;color:#fff}

/* Credentials — editorial badge cards (no icon glyphs) */
.cred-grid{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:640px){.cred-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1000px){.cred-grid{grid-template-columns:repeat(4,1fr)}}
.cred-card{position:relative;background:#fff;border:1px solid ${t.border};border-radius:14px;padding:26px 24px 22px;display:flex;flex-direction:column;gap:10px;transition:box-shadow .2s ease,transform .2s ease;overflow:hidden;min-height:220px}
.cred-card::before{content:'';position:absolute;top:0;left:0;bottom:0;width:4px;background:linear-gradient(180deg,${t.orange},${t.action})}
.cred-card:hover{box-shadow:0 14px 28px rgba(30,58,95,.1);transform:translateY(-2px);border-color:transparent}
.cred-label{display:inline-block;font-family:'Plus Jakarta Sans',sans-serif;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${t.action};margin-bottom:4px}
.cred-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:19px;font-weight:800;color:${t.heading};line-height:1.2;letter-spacing:-.01em}
.cred-desc{font-size:14px;color:${t.body};line-height:1.5}
.cred-tag{margin-top:auto;display:inline-flex;align-items:center;gap:6px;font-family:'Plus Jakarta Sans',sans-serif;font-size:11.5px;font-weight:800;color:${t.orangeHover};letter-spacing:.05em;padding:6px 10px;background:rgba(249,115,22,.1);border-radius:6px;align-self:flex-start}
.cred-tag::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:${t.orange}}

/* Values — numbered editorial */
.values-grid{display:grid;gap:20px;grid-template-columns:1fr}
@media(min-width:720px){.values-grid{grid-template-columns:repeat(3,1fr)}}
.value-card{position:relative;background:#fff;border:1px solid ${t.border};border-radius:16px;padding:36px 28px 28px;overflow:hidden;transition:transform .22s ease,box-shadow .22s ease}
.value-card:hover{transform:translateY(-3px);box-shadow:0 20px 40px rgba(15,23,42,.08)}
.value-num{position:absolute;top:18px;right:24px;font-family:'Plus Jakarta Sans',sans-serif;font-size:64px;font-weight:900;line-height:1;letter-spacing:-0.04em;color:transparent;-webkit-text-stroke:1.5px rgba(37,99,235,.18);background:linear-gradient(135deg,rgba(37,99,235,.25) 0%,rgba(249,115,22,.18) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.value-card h3{position:relative;font-family:'Plus Jakarta Sans',sans-serif;font-size:24px;font-weight:800;color:${t.heading};margin-bottom:12px;letter-spacing:-.01em}
.value-card p{position:relative;font-size:15px;color:${t.body};line-height:1.6}

/* Guarantee callout — prominent promise card */
.guarantee-card{position:relative;background:linear-gradient(135deg,${t.darkBg} 0%,${t.trust} 100%);border-radius:22px;padding:40px 48px;color:#fff;overflow:hidden;box-shadow:0 24px 50px -12px rgba(15,23,42,.35)}
.guarantee-card::before{content:'';position:absolute;top:-120px;right:-80px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.25) 0%,transparent 70%)}
.guarantee-card::after{content:'100%';position:absolute;right:-30px;bottom:-60px;font-family:'Plus Jakarta Sans',sans-serif;font-size:280px;font-weight:900;line-height:1;color:rgba(255,255,255,.04);letter-spacing:-0.05em;pointer-events:none}
.guarantee-grid{position:relative;display:grid;gap:28px;grid-template-columns:1fr;align-items:center}
@media(min-width:900px){.guarantee-grid{grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:48px}}
.guarantee-grid .eyebrow{color:${t.orange}}
.guarantee-grid h2{color:#fff;margin-top:10px;margin-bottom:14px}
.guarantee-grid p{color:rgba(255,255,255,.8);font-size:16.5px;line-height:1.6}
.guarantee-seal{position:relative;z-index:1;display:flex;align-items:center;justify-content:center}
.guarantee-seal .seal-ring{width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;flex-direction:column;backdrop-filter:blur(6px)}
.guarantee-seal .seal-ring strong{font-family:'Plus Jakarta Sans',sans-serif;font-size:42px;font-weight:900;color:${t.orange};line-height:1}
.guarantee-seal .seal-ring span{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.8);margin-top:6px;font-weight:700}

/* Page hero (for sub-pages) */
.page-hero{padding:72px 0 48px;background:linear-gradient(180deg,${t.sectionAlt} 0%,${t.pageBg} 100%)}
.page-hero .crumb{font-size:14px;color:${t.muted};margin-bottom:12px}
.page-hero .crumb a{color:${t.muted}}
.page-hero .crumb a:hover{color:${t.trust}}
.page-hero h1{margin-bottom:14px}
.page-hero p{max-width:620px}

/* FAQ */
.faq{background:#fff;border:1px solid ${t.border};border-radius:12px;overflow:hidden}
.faq+.faq{margin-top:12px}
.faq summary{list-style:none;cursor:pointer;padding:20px 24px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;color:${t.heading};font-size:17px;display:flex;justify-content:space-between;align-items:center;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary .faq-plus{flex-shrink:0;transition:transform .2s;color:${t.trust}}
.faq[open] summary .faq-plus{transform:rotate(45deg)}
.faq-body{padding:0 24px 22px;color:${t.body};line-height:1.65}

/* Utility */
.center{text-align:center}
.gap-8{gap:8px}.gap-12{gap:12px}.gap-16{gap:16px}.gap-20{gap:20px}
.mt-4{margin-top:16px}.mt-6{margin-top:24px}.mt-8{margin-top:32px}.mb-4{margin-bottom:16px}.mb-6{margin-bottom:24px}.mb-8{margin-bottom:32px}
.flex{display:flex}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}
.pill-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:${t.trust};margin-inline:6px;vertical-align:middle}

/* Scroll reveal */
.rv{opacity:0;transform:translateY(20px);transition:opacity .6s ease,transform .6s ease}
.rv.is-visible{opacity:1;transform:translateY(0)}

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE RESPONSIVE OVERRIDES
   Most users find this site through a WhatsApp link, so phones are the
   primary surface. These overrides tighten padding, stack CTAs full-width,
   shrink decorative elements, and prevent text overflow.
   ═══════════════════════════════════════════════════════════════════════════ */

@media(max-width:760px){
  /* Layout */
  .ctn{padding:0 18px}
  .sect{padding:56px 0}

  /* Emergency strip — keep one line, smaller pill */
  .e-strip{font-size:12.5px;padding:7px 0}
  .e-strip .ctn{gap:10px;flex-wrap:wrap;justify-content:center}
  .e-strip-l{justify-content:center}
  .e-strip-cta{padding:3px 10px;font-size:12px}

  /* Nav — compact, drop nav-phone text, keep call icon + Book Now + hamburger */
  .nav-inner{height:58px;gap:8px}
  .nav-logo{font-size:16px}
  .nav-logo .logo-mark{width:30px;height:30px;font-size:14px;margin-right:7px}
  .nav .btn-sm{padding:9px 14px;font-size:13px}
  .nav-call-m{width:38px;height:38px}
  .ham{width:38px;height:38px;padding:9px}
  .mm{inset:58px 0 0 0}
  .mm a.mm-link{font-size:16px;padding:13px 14px}

  /* Hero */
  .hero{padding:40px 0 72px}
  .hero-grid{gap:36px}
  .hero .h1{font-size:clamp(28px,8vw,38px);line-height:1.1}
  .hero .body-lg{font-size:16px;margin-bottom:22px}
  .hero .chip{font-size:11.5px;padding:5px 10px;margin-bottom:14px}
  .hero .flex.flex-wrap.gap-12{flex-direction:column;align-items:stretch;gap:10px}
  .hero .btn{width:100%;padding:14px 20px;font-size:15px}
  .hero .btn-lg{padding:15px 22px;font-size:15px}
  .hero .trust-row{padding:12px 14px;gap:8px 14px;border-radius:12px}
  .hero .trust-row .t-item{font-size:12.5px}
  .hero-photo-wrap::before{display:none}
  .hero-photo{aspect-ratio:1/1;border-radius:18px}
  .hero-badge{padding:10px 14px;max-width:240px;border-radius:12px}
  .hero-badge .badge-text strong{font-size:16px}
  .hero-badge .badge-text span{font-size:11px}

  /* Section headings */
  .h2{font-size:clamp(24px,6.5vw,30px);line-height:1.2}
  .body-lg{font-size:16px}
  .center .body{font-size:15px}

  /* Service cards */
  .svc-card{border-radius:14px}
  .svc-card .svc-body{padding:18px 18px 20px;gap:8px}
  .svc-card h3{font-size:17px}
  .svc-card p{font-size:14px;line-height:1.5}
  .svc-card .svc-price-abs{font-size:11.5px;padding:4px 9px;top:12px;left:12px}

  /* Why Choose Us */
  .why-row{gap:14px}
  .why-item{padding:22px 22px 22px 24px;gap:16px}
  .why-item .why-num{font-size:36px;min-width:42px}
  .why-item h4{font-size:16.5px;margin-bottom:4px}
  .why-item p{font-size:14px;line-height:1.5}

  /* Testimonials */
  .testi{padding:24px 22px 22px;border-radius:12px}
  .testi::before{font-size:60px;top:10px;right:18px}
  .testi-q{font-size:15px;line-height:1.6}
  .testi-meta{padding-top:14px}
  .avatar{width:38px;height:38px;font-size:14px}
  .testi-name{font-size:13.5px}
  .testi-role{font-size:11.5px}
  .testi-btn{width:38px;height:38px}

  /* Service areas split (home) */
  .area-split{gap:24px}
  .area-stat{font-size:12.5px;padding:7px 13px}
  .area-map{min-height:240px}
  .area-map iframe{min-height:240px;height:240px!important}
  .area-map-overlay{padding:10px 14px;left:12px;bottom:12px;gap:10px;max-width:calc(100% - 24px)}
  .area-map-overlay .map-ico{width:34px;height:34px}
  .area-map-overlay strong{font-size:14px}
  .area-map-overlay span{font-size:11.5px}
  .area-cards{max-height:none;padding-right:0}
  .area-card{padding:14px 16px;gap:12px;border-radius:12px}
  .area-card .ac-ico{width:40px;height:40px}
  .area-card .ac-name{font-size:15px}
  .area-card .ac-meta{font-size:11.5px;gap:8px 12px}
  .area-card .ac-go{display:none}

  /* Areas page (sub-page) */
  .area-pill{padding:8px 14px;font-size:13px}

  /* Page hero (sub-pages) */
  .page-hero{padding:40px 0 28px}
  .page-hero h1.h1{font-size:clamp(26px,7.5vw,34px)}
  .page-hero .body-lg{font-size:16px}
  .page-hero .crumb{font-size:12.5px;margin-bottom:10px}

  /* Services page — zigzag rows */
  .zz-row{gap:28px;margin-bottom:48px}
  .zz-label{font-size:11px;padding:5px 12px;letter-spacing:.1em}
  .zz-meta{font-size:13px;gap:8px 14px;margin:14px 0 18px}
  .zz-price-block{display:flex;width:100%}
  .zz-price-cell{flex:1;padding:12px 14px}
  .zz-price-cell .zz-price-label{font-size:10.5px}
  .zz-price-cell .zz-price-val{font-size:18px}
  .zz-feats{gap:8px;grid-template-columns:1fr;margin-bottom:22px}
  .zz-feat{font-size:14px}
  .zz-visual{aspect-ratio:16/11}
  .zz-visual-label{font-size:11px;padding:6px 10px;left:10px;bottom:10px}

  /* CTA banner */
  .cta-banner{padding:52px 0}
  .cta-banner h2.h2{font-size:clamp(24px,7vw,30px)}
  .cta-banner .body-lg{font-size:15px;margin-bottom:22px}
  .cta-banner .flex.flex-wrap.gap-12{flex-direction:column;align-items:stretch;max-width:340px;margin:0 auto}
  .cta-banner .btn{width:100%}

  /* Footer */
  .foot{padding:40px 0 24px;font-size:13px}
  .foot-grid{gap:28px}
  .foot-bot{flex-direction:column;gap:8px;text-align:center;padding-top:20px;margin-top:28px}
  .foot-big-phone{font-size:18px}

  /* Floating call FAB */
  .fab{width:54px;height:54px;bottom:18px;right:18px}

  /* Contact form */
  .form-grid{gap:14px}
  .form-input,.form-select,.form-textarea{font-size:16px;padding:12px 14px} /* 16px prevents iOS zoom on focus */
  .form-label{font-size:12.5px}

  /* About — story grid */
  .story-grid{gap:36px}
  .founder-frame::before{top:-8px;left:-8px;right:8px;bottom:14px;border-radius:18px}
  .founder-frame > .founder-photo{aspect-ratio:4/4;border-radius:18px}
  .founder-frame .fp-badge{right:10px;bottom:-14px;padding:11px 14px;max-width:220px}
  .founder-frame .fp-badge strong{font-size:14.5px}
  .founder-frame .fp-badge span{font-size:11.5px}
  .signature{margin-top:22px;padding-top:18px}
  .signature-name{font-size:18px}
  .signature-role{font-size:12px}

  /* About — credentials */
  .cred-card{padding:22px 20px 18px;min-height:auto;gap:8px}
  .cred-label{font-size:10.5px}
  .cred-title{font-size:17px}
  .cred-desc{font-size:13.5px;line-height:1.45}
  .cred-tag{font-size:10.5px;padding:5px 9px}

  /* About — values */
  .value-card{padding:30px 22px 22px}
  .value-num{font-size:48px;top:14px;right:18px}
  .value-card h3{font-size:21px;margin-bottom:10px}
  .value-card p{font-size:14.5px;line-height:1.55}

  /* About — guarantee */
  .guarantee-card{padding:32px 26px;border-radius:18px}
  .guarantee-card::after{font-size:200px;right:-20px;bottom:-40px}
  .guarantee-grid{gap:24px}
  .guarantee-grid p{font-size:15px}
  .guarantee-grid .flex{flex-direction:column;align-items:stretch}
  .guarantee-grid .btn{width:100%}
  .guarantee-seal{order:-1;margin-bottom:8px}
  .guarantee-seal .seal-ring{width:140px;height:140px}
  .guarantee-seal .seal-ring strong{font-size:36px}
  .guarantee-seal .seal-ring span{font-size:10px}

  /* About — team banner */
  .team-banner{border-radius:18px;min-height:280px}
  .team-banner img{min-height:280px;max-height:380px}
  .team-banner-overlay{padding:22px 22px 22px;background:linear-gradient(180deg,rgba(15,23,42,.55) 0%,rgba(15,23,42,.85) 60%)}
  .team-banner-text h3{font-size:19px;line-height:1.2}
  .team-banner-text p{font-size:13.5px}
  .team-banner-text .replace-note{font-size:11px;padding:5px 10px}

  /* About — stats dark */
  .stats-dark{padding:48px 0}
  .stat-cell{padding:18px 8px}
  .stat-num{font-size:clamp(40px,10vw,52px)}
  .stat-label{font-size:12px;letter-spacing:.05em}

  /* Bar accent placement on left-aligned headings */
  .bar-accent{margin:12px auto 0}
  .bar-accent-l{margin-left:0}

  /* FAQ */
  .faq summary{padding:18px 20px;font-size:15.5px}
  .faq-body{padding:0 20px 20px;font-size:14.5px}
}

/* Very narrow — compact phones, e.g. iPhone SE / Galaxy S Mini */
@media(max-width:400px){
  .ctn{padding:0 14px}
  .sect{padding:48px 0}
  .e-strip-full{display:none}
  .e-strip-short{display:inline}
  .nav .btn-sm{display:none}
  .nav-inner{gap:6px}
  .hero{padding:32px 0 64px}
  .hero .h1{font-size:clamp(26px,8.5vw,32px)}
  .hero-badge{padding:10px 12px;max-width:200px}
  .hero-badge .badge-text strong{font-size:14.5px}
  .why-item{padding:20px 18px 20px 22px;gap:12px}
  .why-item .why-num{font-size:32px;min-width:36px}
  .testi{padding:22px 20px 20px}
  .area-card .ac-meta span:nth-child(3){display:none}
  .stat-num{font-size:clamp(36px,11vw,46px)}
  .guarantee-card{padding:26px 22px}
  .guarantee-card::after{display:none}
  .cred-title{font-size:16px}
}
`;
}

// ─── Interactive script ─────────────────────────────────────────────────────

function getHvacScript() {
  return `<script>
(function(){
  var nav=document.querySelector('.nav');
  if(nav){window.addEventListener('scroll',function(){nav.classList.toggle('scrolled',window.scrollY>8)},{passive:true})}
  var ham=document.querySelector('.ham'),mm=document.querySelector('.mm');
  if(ham&&mm){ham.addEventListener('click',function(){mm.classList.toggle('open');document.body.style.overflow=mm.classList.contains('open')?'hidden':''});mm.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){mm.classList.remove('open');document.body.style.overflow=''})})}
  var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}})},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.rv').forEach(function(el){io.observe(el)});

  // Quote form — AJAX submit to the Pixie lead-capture endpoint. Parses
  // the JSON response (ok/false) before redirecting so genuine failures
  // surface as an error state instead of silently bouncing the visitor
  // to the thank-you page. Falls back to native form post if JS fails
  // entirely (old browsers, blocked fetch).
  document.querySelectorAll('form[data-pixie-form]').forEach(function(form){
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var btn=form.querySelector('button[type="submit"]');
      var originalText=btn?btn.innerHTML:'';
      if(btn){btn.disabled=true;btn.style.opacity='0.7';btn.innerHTML='Sending...'}
      var data=new FormData(form);
      var params=new URLSearchParams();
      data.forEach(function(v,k){params.append(k,v)});
      var thankYouPath=form.getAttribute('data-thank-you')||'/thank-you/';
      var endpoint=form.getAttribute('action');
      var redirect=function(){window.location.href=thankYouPath};
      var showError=function(){
        if(btn){btn.disabled=false;btn.style.opacity='1';btn.innerHTML='Try again'}
      };
      fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:params.toString()})
        .then(function(r){return r.json().catch(function(){return {}})})
        .then(function(json){
          if(json && json.ok===false){showError();return}
          redirect();
        })
        .catch(function(){setTimeout(redirect,400)});
    });
  });

  // Testimonials carousel
  document.querySelectorAll('.testi-carousel').forEach(function(root){
    var track=root.querySelector('.testi-track');
    var dots=root.querySelectorAll('.testi-dot');
    var prev=root.querySelector('[data-testi-prev]');
    var next=root.querySelector('[data-testi-next]');
    if(!track)return;
    function cardWidth(){var c=track.querySelector('.testi');if(!c)return 0;var g=parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap||0)||0;return c.getBoundingClientRect().width+g}
    function activeIndex(){var w=cardWidth();if(!w)return 0;return Math.round(track.scrollLeft/w)}
    function update(){var i=activeIndex();dots.forEach(function(d,k){d.classList.toggle('is-active',k===i)});if(prev)prev.disabled=track.scrollLeft<=0;if(next)next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2}
    if(prev)prev.addEventListener('click',function(){track.scrollBy({left:-cardWidth(),behavior:'smooth'})});
    if(next)next.addEventListener('click',function(){track.scrollBy({left:cardWidth(),behavior:'smooth'})});
    dots.forEach(function(d,k){d.addEventListener('click',function(){track.scrollTo({left:k*cardWidth(),behavior:'smooth'})})});
    track.addEventListener('scroll',function(){window.clearTimeout(track._t);track._t=window.setTimeout(update,60)},{passive:true});
    window.addEventListener('resize',update);
    update();
  });
})();
</script>`;
}

// ─── Emergency strip ────────────────────────────────────────────────────────

function getEmergencyStrip(c) {
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  if (!phone) return '';
  return `<div class="e-strip"><div class="ctn">
    <span class="e-strip-l"><span class="dot"></span><span class="e-strip-full">24/7 Emergency Service Available</span><span class="e-strip-short">24/7 Emergency</span></span>
    <a class="e-strip-cta" href="tel:${esc(tel)}">Call ${esc(phone)} &rarr;</a>
  </div></div>`;
}

// ─── Navigation ─────────────────────────────────────────────────────────────

function getHvacPages(c) {
  const pages = [
    { n: 'Home', h: '/' },
    { n: 'Services', h: '/services' },
    { n: 'Areas', h: '/areas' },
    { n: 'About', h: '/about' },
    { n: 'Contact', h: '/contact' },
  ];
  return pages;
}

function getHvacNav(c, cur) {
  const pages = getHvacPages(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const initial = esc((c.businessName || 'H').trim().charAt(0).toUpperCase());
  // If the user uploaded a logo during WEB_COLLECT_LOGO, show the image
  // in place of the initial-letter badge. Inline height:32 matches
  // logo-mark sizing so the business name beside it lines up the same
  // way. object-fit:contain preserves aspect ratio for any shape logo.
  const logoMark = c.logoUrl
    ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.businessName || '')}" class="logo-mark logo-img" style="width:auto;height:32px;background:none;padding:0;object-fit:contain">`
    : `<span class="logo-mark">${initial}</span>`;
  return `<nav class="nav"><div class="ctn nav-inner">
    <a href="/" class="nav-logo">${logoMark}${esc(c.businessName)}</a>
    <div class="nav-links">
      ${pages.filter(p => p.h !== '/').map(p => `<a href="${p.h}"${p.h === cur ? ' class="active"' : ''}>${p.n}</a>`).join('')}
    </div>
    <div class="nav-right">
      ${phone ? `<a class="nav-phone" href="tel:${esc(tel)}">${icon('phone', 16)} ${esc(phone)}</a>` : ''}
      ${phone ? `<a class="nav-call-m" href="tel:${esc(tel)}" aria-label="Call ${esc(phone)}">${icon('phone', 18, '#fff')}</a>` : ''}
      <a href="/contact" class="btn btn-orange btn-sm" style="display:inline-flex">Book Now</a>
      <button class="ham" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </div></nav>
  <div class="mm">
    ${pages.map(p => `<a class="mm-link" href="${p.h}">${p.n}</a>`).join('')}
    ${phone ? `<a class="btn btn-outline mm-cta" href="tel:${esc(tel)}">${icon('phone', 16)} Call ${esc(phone)}</a>` : ''}
    <a class="btn btn-orange" href="/contact">Request a Free Quote</a>
  </div>`;
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function getHvacFooter(c) {
  const pages = getHvacPages(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const email = c.contactEmail || '';
  const address = c.contactAddress || '';
  return `<footer class="foot"><div class="ctn">
    <div class="foot-grid">
      <div>
        <p class="foot-brand">${esc(c.businessName)}</p>
        <p style="margin-bottom:18px">${esc(c.footerTagline || 'Licensed, insured, and here when you need us most.')}</p>
        ${phone ? `<a class="foot-big-phone" href="tel:${esc(tel)}">${icon('phone', 20)} ${esc(phone)}</a><br>` : ''}
        <span style="font-size:13px;color:rgba(255,255,255,.5)">24/7 Emergency Service Available</span>
      </div>
      <div>
        <h5>Pages</h5>
        <ul>${pages.map(p => `<li><a href="${p.h}">${p.n}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h5>Services</h5>
        <ul>${(c.services || []).slice(0, 6).map(s => `<li><a href="/services">${esc(s.title)}</a></li>`).join('') || '<li><a href="/services">View all</a></li>'}</ul>
      </div>
      <div>
        <h5>Contact</h5>
        <ul>
          ${phone ? `<li><a href="tel:${esc(tel)}">${esc(phone)}</a></li>` : ''}
          ${email ? `<li><a href="mailto:${esc(email)}">${esc(email)}</a></li>` : ''}
          ${address ? `<li style="color:rgba(255,255,255,.75)">${esc(address)}</li>` : ''}
          ${c.licenseNumber ? `<li style="color:rgba(255,255,255,.5);font-size:12px">License #${esc(c.licenseNumber)}</li>` : ''}
        </ul>
      </div>
    </div>
    <div class="foot-bot">
      <span>&copy; ${new Date().getFullYear()} ${esc(c.businessName)}. All rights reserved.</span>
      <span>Licensed &middot; Insured &middot; Trusted</span>
    </div>
  </div></footer>`;
}

// ─── Floating mobile FAB ────────────────────────────────────────────────────

function getFAB(c) {
  const phone = c.contactPhone || '';
  if (!phone) return '';
  return `<a class="fab" href="tel:${esc(telHref(phone))}" aria-label="Call ${esc(phone)}">${icon('phone', 22, '#fff')}</a>`;
}

// ─── Form attrs / hidden fields ─────────────────────────────────────────────
// Contact-form submissions now POST to the Pixie lead-capture endpoint
// (/public/leads/:siteId). The endpoint persists to `form_submissions`
// and fires a SendGrid email to the site owner. Function names kept as
// `netlifyFormAttrs` / `netlifyHiddenFields` to avoid touching every
// caller — they're semantic leftovers from the previous Netlify Forms
// integration.

const { env } = require('../../../config/env');
const LEAD_API_BASE = process.env.PUBLIC_API_BASE_URL || env.chatbot?.baseUrl || '';

function netlifyFormAttrs(formName, siteId) {
  const action = LEAD_API_BASE && siteId
    ? `${LEAD_API_BASE}/public/leads/${siteId}`
    : '/thank-you/';
  return `name="${formName}" method="POST" action="${action}" data-pixie-form="1"`;
}

function netlifyHiddenFields(formName, sourcePage = '') {
  return [
    `<input type="hidden" name="form_name" value="${formName}">`,
    sourcePage ? `<input type="hidden" name="source_page" value="${esc(sourcePage)}">` : '',
    `<input type="hidden" name="_honey" value="" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none" aria-hidden="true">`,
  ].filter(Boolean).join('');
}

// ─── JSON-LD Schema ─────────────────────────────────────────────────────────

function getLocalBusinessSchema(c) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'HVACBusiness',
    name: c.businessName || '',
    description: c.tagline || `HVAC services in ${c.primaryCity || ''}`.trim(),
    telephone: c.contactPhone || undefined,
    email: c.contactEmail || undefined,
    address: c.contactAddress
      ? { '@type': 'PostalAddress', streetAddress: c.contactAddress, addressLocality: c.primaryCity || undefined }
      : undefined,
    areaServed: (c.serviceAreas && c.serviceAreas.length ? c.serviceAreas : [c.primaryCity].filter(Boolean)).map((a) => ({ '@type': 'City', name: a })),
    priceRange: '$$',
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '07:00', closes: '18:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '08:00', closes: '16:00' },
    ],
    aggregateRating: c.googleRating
      ? { '@type': 'AggregateRating', ratingValue: String(c.googleRating), reviewCount: String(c.reviewCount || 200).replace(/[^\d]/g, '') || '200' }
      : undefined,
  };
  return `<script type="application/ld+json">${JSON.stringify(stripUndefined(data))}</script>`;
}

function getServiceListSchema(c) {
  const services = (c.services || []).filter(Boolean);
  if (!services.length) return '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: services.map((s, i) => ({
      '@type': 'Service',
      position: i + 1,
      name: s.title,
      description: s.shortDescription || s.fullDescription || '',
      provider: { '@type': 'HVACBusiness', name: c.businessName },
      areaServed: (c.serviceAreas && c.serviceAreas.length ? c.serviceAreas : [c.primaryCity].filter(Boolean)).join(', '),
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(stripUndefined(data))}</script>`;
}

function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndefined).filter((v) => v !== undefined);
  if (obj && typeof obj === 'object') {
    const out = {};
    Object.keys(obj).forEach((k) => {
      const v = stripUndefined(obj[k]);
      if (v !== undefined && v !== null) out[k] = v;
    });
    return out;
  }
  return obj;
}

// ─── Page wrapper ───────────────────────────────────────────────────────────

function wrapHvacPage(c, cur, body, opts = {}) {
  const tc = getTradeCopy(c);
  const business = esc(c.businessName || `${tc.label} Services`);
  const city = esc(c.primaryCity || '');
  const phone = esc(c.contactPhone || '');
  const title = esc(opts.title || `${c.businessName} — ${tc.pageMetaTitleTail(c.primaryCity || '')}`);
  const desc = esc(opts.description || tc.pageMetaDescDefault(c.businessName, c.primaryCity || '', c.contactPhone || '').trim());
  const schemas = (opts.schemas || [getLocalBusinessSchema(c)]).join('\n');
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${buildTokens(c).trust}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>${getHvacStyles(c)}</style>
${schemas}
</head>
<body>
${renderActivationBanner(c)}
${getEmergencyStrip(c)}
${getHvacNav(c, cur)}
<main>${body}</main>
${getHvacFooter(c)}
${getFAB(c)}
${getHvacScript()}
</body></html>`;
}

// Map an HVAC service title (or icon name) to the matching `.svc-ico-*` tint
// class. Falls back to a neutral tint if nothing matches.
function svcIconTint(titleOrIcon) {
  const s = String(titleOrIcon || '').toLowerCase();
  if (/snowflake|\bac\b|air condition|cool/.test(s)) return 'svc-ico-cool';
  if (/flame|furnace|heat|warm|boiler/.test(s)) return 'svc-ico-heat';
  if (/wind|duct|air quality|purifier|indoor air|shieldcheck/.test(s)) return 'svc-ico-air';
  if (/zap|electric|power|install/.test(s)) return 'svc-ico-power';
  if (/siren|emergency|24/.test(s)) return 'svc-ico-emergency';
  if (/calendar|maintenance|plan|tune/.test(s)) return 'svc-ico-time';
  if (/shield|insur|certif|guarantee/.test(s)) return 'svc-ico-shield';
  return '';
}

module.exports = {
  TOKENS,
  buildTokens,
  DEFAULT_SERVICES,
  PLUMBING_DEFAULT_SERVICES,
  ELECTRICAL_DEFAULT_SERVICES,
  ROOFING_DEFAULT_SERVICES,
  APPLIANCE_DEFAULT_SERVICES,
  GARAGE_DOOR_DEFAULT_SERVICES,
  LOCKSMITH_DEFAULT_SERVICES,
  PEST_CONTROL_DEFAULT_SERVICES,
  WATER_DAMAGE_DEFAULT_SERVICES,
  TREE_SERVICE_DEFAULT_SERVICES,
  TRADE_COPY,
  getTradeCopy,
  esc,
  telHref,
  icon,
  iconFilled,
  googleGlyph,
  svcIconTint,
  getHvacPages,
  wrapHvacPage,
  netlifyFormAttrs,
  netlifyHiddenFields,
  getLocalBusinessSchema,
  getServiceListSchema,
};
