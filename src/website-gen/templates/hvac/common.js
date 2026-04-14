// HVAC template — shared scaffolding (tokens, styles, emergency strip, nav,
// footer, floating FAB, JSON-LD helpers, Netlify form attrs, wrapper).
//
// See hvac_context.md at the repo root for the full plan and research that
// drives these design choices.

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

// ─── Styles ─────────────────────────────────────────────────────────────────

function getHvacStyles() {
  const t = TOKENS;
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
.avatar.av-1{background:linear-gradient(135deg,#1E3A5F,#2563EB)}
.avatar.av-2{background:linear-gradient(135deg,#0F766E,#14B8A6)}
.avatar.av-3{background:linear-gradient(135deg,#C2410C,#F97316)}
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

  // Quote form — AJAX submit with visual feedback + redirect to /thank-you/.
  // Works both locally (redirects to the static thank-you page) and on Netlify
  // (POST is captured by Netlify Forms, then we redirect the user).
  document.querySelectorAll('form[data-netlify]').forEach(function(form){
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var btn=form.querySelector('button[type="submit"]');
      var originalText=btn?btn.innerHTML:'';
      if(btn){btn.disabled=true;btn.style.opacity='0.7';btn.innerHTML='Sending...'}
      var data=new FormData(form);
      var params=new URLSearchParams();
      data.forEach(function(v,k){params.append(k,v)});
      var done=function(){
        var target=form.getAttribute('action')||'/thank-you/';
        window.location.href=target;
      };
      fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()})
        .then(done)
        .catch(function(){setTimeout(done,400)});
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
  return `<nav class="nav"><div class="ctn nav-inner">
    <a href="/" class="nav-logo"><span class="logo-mark">${initial}</span>${esc(c.businessName)}</a>
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

// ─── Netlify form attrs / hidden fields ─────────────────────────────────────

function netlifyFormAttrs(formName) {
  return `name="${formName}" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" action="/thank-you/"`;
}

function netlifyHiddenFields(formName) {
  return `<input type="hidden" name="form-name" value="${formName}"><p class="form-hidden"><label>Don&#39;t fill this out: <input name="bot-field"></label></p>`;
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
  const business = esc(c.businessName || 'HVAC Services');
  const city = esc(c.primaryCity || '');
  const phone = esc(c.contactPhone || '');
  const title = esc(opts.title || `${c.businessName} — HVAC Services${c.primaryCity ? ` in ${c.primaryCity}` : ''}`);
  const desc = esc(opts.description || `${c.businessName}: fast, reliable heating, cooling, and air quality services${c.primaryCity ? ` in ${c.primaryCity}` : ''}. ${phone ? `Call ${phone}.` : ''}`.trim());
  const schemas = (opts.schemas || [getLocalBusinessSchema(c)]).join('\n');
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${TOKENS.trust}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>${getHvacStyles()}</style>
${schemas}
</head>
<body>
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
  DEFAULT_SERVICES,
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
