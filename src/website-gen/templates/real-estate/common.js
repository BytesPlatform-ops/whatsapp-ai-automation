// Real-estate template — shared scaffolding (tokens, styles, nav, footer,
// floating FAB, JSON-LD helpers, Netlify form helpers, agent-headshot
// placeholder, listing photo strip helper).
//
// See real_estate_context.md at the repo root for the full plan.

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

function initialsFor(name) {
  const t = String(name || '').trim();
  if (!t) return 'A';
  const parts = t.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || t.charAt(0).toUpperCase();
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function fmtMoney(n) {
  if (n == null) return '';
  const num = typeof n === 'number' ? n : Number(String(n).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num)) return String(n);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 2).replace(/\.0+$/, '')}M`;
  if (num >= 1_000) return `$${Math.round(num / 1_000)}K`;
  return `$${num.toLocaleString()}`;
}

// ─── Design tokens ──────────────────────────────────────────────────────────

const TOKENS = {
  navy: '#1A2B45',
  navyHover: '#0F1B30',
  gold: '#C9A96E',
  goldHover: '#B8975C',
  warmWhite: '#FAF7F2',
  cream: '#F2EDE4',
  beige: '#E8E4DD',
  charcoal: '#1A2B45',
  heading: '#1A2B45',
  body: '#4A5468',
  muted: '#8A9099',
  onDark: '#FAF7F2',
  badgeForSale: '#2D7A4F',
  badgeJustListed: '#C9A96E',
  badgePending: '#B8975C',
  badgeSold: '#1A2B45',
};

// ─── Inline icons (minimal — used sparingly per editorial style) ────────────

const ICONS = {
  arrowRight:
    '<path d="M5 12h14M13 5l7 7-7 7" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  calendar:
    '<path d="M3 10h18M8 3v4m8-4v4M5 6h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  bed:
    '<path d="M2 17v-5a4 4 0 014-4h12a4 4 0 014 4v5M2 17h20M2 21v-4M22 21v-4M6 12V8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  bath:
    '<path d="M3 12h18l-1 7a2 2 0 01-2 2H6a2 2 0 01-2-2l-1-7zM5 12V6a3 3 0 016 0M11 6h6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ruler:
    '<path d="M3 17l4-4 2 2 4-4 2 2 4-4 2 2-4 4 4 4-4 4-4-4-4 4-4-4z" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  mapPin:
    '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="3" stroke-width="1.6" fill="none"/>',
  star:
    '<path d="M12 2l3.1 6.3 7 1-5 4.8 1.2 6.9L12 17.8 5.7 21l1.2-6.9-5-4.8 7-1L12 2z" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  award:
    '<circle cx="12" cy="9" r="6" stroke-width="1.6" fill="none"/><path d="M9 14.5L7 22l5-3 5 3-2-7.5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  home:
    '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  walking:
    '<path d="M13 4a2 2 0 11-4 0 2 2 0 014 0zM7 22l3-7 1-3 4 5 5 1M11 14l3-2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  school:
    '<path d="M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c3 3 9 3 12 0v-5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

function icon(name, size = 20, color = 'currentColor') {
  const body = ICONS[name] || ICONS.arrowRight;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" aria-hidden="true">${body}</svg>`;
}

function iconFilled(name, size = 16, color = 'currentColor') {
  const body = ICONS[name] || ICONS.star;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="none" aria-hidden="true">${body}</svg>`;
}

// Google "G" mark in original Google brand colors. Used on testimonial cards
// and as the trust signal above the testimonials carousel.
function googleGlyph(size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.617z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.345 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.655 3.58 9 3.58z" fill="#EA4335"/>
  </svg>`;
}

// (Removed listingPhotoStrip — per-photo "Sample" bars cluttered the cards.
// Replaced by a single italic .sample-note line under the section heading.)

// ─── Agent headshot placeholder ────────────────────────────────────────────
// Uses a neutral lifestyle photo (coffee shop / office / desk — NEVER a
// person's face) as background so the site feels warm and intentional even
// before the agent uploads a real portrait. Falls back to gradient if
// Unsplash didn't return an image.
function agentHeadshot(agentName, opts = {}) {
  const { size = 'md', label = true, placeholderImage = null } = opts;
  const sizeClass = size === 'lg' ? 'agent-photo-lg' : size === 'sm' ? 'agent-photo-sm' : 'agent-photo-md';
  const labelHtml = label
    ? `<span class="agent-photo-label">Your portrait goes here</span>`
    : '';
  const bg = placeholderImage && placeholderImage.url
    ? `<img class="agent-photo-bg" src="${esc(placeholderImage.url)}" alt="" loading="lazy">`
    : '';
  const decor = placeholderImage && placeholderImage.url
    ? ''
    : `<div class="agent-photo-monogram">${esc(initialsFor(agentName))}</div>`;
  return `<div class="agent-photo ${sizeClass}">
    ${bg}
    <div class="agent-photo-overlay"></div>
    ${decor}
    ${labelHtml}
  </div>`;
}

// ─── Default placeholder data when LLM didn't provide ──────────────────────

const DEFAULT_DESIGNATIONS = ['REALTOR®', 'CRS', 'GRI', 'ABR'];

const DEFAULT_LISTINGS = [
  { address: '4521 Sycamore Lane', price: 875000, beds: 4, baths: 3, sqft: 2850, status: 'For Sale', neighborhood: 'Westlake' },
  { address: '218 Riverbend Drive', price: 1250000, beds: 5, baths: 4, sqft: 3600, status: 'Just Listed', neighborhood: 'Tarrytown' },
  { address: '76 Mockingbird Court', price: 695000, beds: 3, baths: 2, sqft: 1980, status: 'For Sale', neighborhood: 'Mueller' },
  { address: '1102 Willow Bend', price: 1450000, beds: 4, baths: 3.5, sqft: 3180, status: 'Just Listed', neighborhood: 'Zilker' },
  { address: '3408 Elm Crest Avenue', price: 785000, beds: 3, baths: 2, sqft: 2100, status: 'For Sale', neighborhood: 'Hyde Park' },
  { address: '909 Stonewall Drive', price: 1950000, beds: 5, baths: 4.5, sqft: 4200, status: 'For Sale', neighborhood: 'Travis Heights' },
  { address: '155 Magnolia Row', price: 565000, beds: 2, baths: 2, sqft: 1450, status: 'Pending', neighborhood: 'Mueller' },
  { address: '88 Ridge Vista Lane', price: 2850000, beds: 6, baths: 5, sqft: 5400, status: 'For Sale', neighborhood: 'Westlake' },
];

// ─── Styles ─────────────────────────────────────────────────────────────────

function getRealEstateStyles(heroPal) {
  const t = TOKENS;
  // When the hero palette resolves to dark text (bright Unsplash image), flip
  // the title/subhead colours and lighten the left-weighted overlay so the
  // photo shows through. Otherwise keep the existing white-on-navy look.
  const hp = heroPal || { isDark: false, fg: '#fff', fgSoft: 'rgba(255,255,255,.86)' };
  const heroTextColor = hp.fg;
  const heroSubColor = hp.fgSoft;
  const heroOverlayBg = hp.isDark
    ? 'linear-gradient(90deg,rgba(250,247,242,.7) 0%,rgba(250,247,242,.5) 45%,rgba(250,247,242,.25) 75%,rgba(250,247,242,.5) 100%)'
    : 'linear-gradient(90deg,rgba(10,20,40,.86) 0%,rgba(15,27,48,.7) 45%,rgba(15,27,48,.4) 75%,rgba(15,27,48,.55) 100%)';
  const heroShadow = hp.isDark ? '0 2px 14px rgba(255,255,255,.35)' : '0 2px 14px rgba(0,0,0,.2)';
  return `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:${t.heading};background:${t.warmWhite};line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.ff-display{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600}
img,svg{max-width:100%;display:block}
a{color:${t.navy};text-decoration:none;transition:color .2s ease}
a:hover{color:${t.gold}}

/* Layout */
.ctn{max-width:1240px;margin:0 auto;padding:0 24px}
@media(min-width:768px){.ctn{padding:0 40px}}
.sect{padding:88px 0;position:relative}
@media(min-width:768px){.sect{padding:120px 0}}
.sect-cream{background:${t.cream}}
.sect-dark{background:${t.charcoal};color:${t.onDark}}

/* Typography */
.h1{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(36px,6vw,64px);font-weight:600;line-height:1.1;letter-spacing:-0.01em;color:${t.heading}}
.h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(28px,4vw,46px);font-weight:500;line-height:1.15;letter-spacing:-0.005em;color:${t.heading}}
.h3{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(22px,2.6vw,28px);font-weight:600;color:${t.heading}}
.eyebrow{display:inline-block;font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${t.gold}}
.body-lg{font-size:clamp(17px,1.6vw,19px);line-height:1.7;color:${t.body}}
.body{font-size:17px;line-height:1.65;color:${t.body}}
@media(max-width:640px){.body{font-size:16px}}
.muted{color:${t.muted};font-size:14px;letter-spacing:.01em}

/* Subtle decorative accent under headings */
.bar-accent{display:block;width:48px;height:1px;background:${t.gold};margin:18px auto 0}
.bar-accent-l{margin-left:0;margin-right:auto}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:14px 28px;font-family:'Inter',sans-serif;font-size:15px;font-weight:500;letter-spacing:.04em;line-height:1;border-radius:2px;cursor:pointer;transition:all .25s ease;text-decoration:none;border:1px solid transparent;white-space:nowrap;text-transform:uppercase}
.btn-lg{padding:18px 36px;font-size:14px}
.btn-sm{padding:11px 20px;font-size:12px}
.btn-gold{background:${t.gold};color:${t.navy};border-color:${t.gold}}
.btn-gold:hover{background:${t.goldHover};border-color:${t.goldHover};color:${t.navy};transform:translateY(-1px)}
.btn-navy{background:${t.navy};color:${t.warmWhite};border-color:${t.navy}}
.btn-navy:hover{background:${t.navyHover};color:${t.warmWhite}}
.btn-outline{background:transparent;color:${t.navy};border-color:${t.navy}}
.btn-outline:hover{background:${t.navy};color:${t.warmWhite}}
.btn-outline-gold{background:transparent;color:${t.gold};border-color:${t.gold}}
.btn-outline-gold:hover{background:${t.gold};color:${t.navy}}
.btn-outline-white{background:transparent;color:#fff;border-color:rgba(255,255,255,.5)}
.btn-outline-white:hover{background:#fff;color:${t.navy};border-color:#fff}
.btn-text{background:transparent;border:none;color:${t.navy};padding:8px 0;font-size:14px;letter-spacing:.06em}
.btn-text:hover{color:${t.gold}}

/* Navigation — transparent over hero, solidifies on scroll */
.nav{position:fixed;top:0;left:0;right:0;z-index:50;padding:18px 0;transition:all .35s ease;background:transparent;color:#fff}
.nav.solid{background:${t.warmWhite};color:${t.navy};box-shadow:0 1px 30px rgba(26,43,69,.06);padding:14px 0}
.nav-inner{display:flex;align-items:center;justify-content:space-between;gap:18px}
.nav-brand{font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;letter-spacing:.005em;color:inherit}
.nav-brand .nav-brand-line{display:block;font-family:'Inter',sans-serif;font-size:10px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;opacity:.7;margin-top:2px}
.nav-links{display:none;align-items:center;gap:36px}
@media(min-width:920px){.nav-links{display:flex}}
.nav-links a{color:inherit;font-size:13px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;transition:color .2s ease;position:relative}
.nav-links a:hover,.nav-links a.active{color:${t.gold}}
.nav-right{display:flex;align-items:center;gap:14px}
.nav-cta{display:none}
@media(min-width:920px){.nav-cta{display:inline-flex}}
.nav-phone-m{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;color:inherit;border:1px solid currentColor}
@media(min-width:920px){.nav-phone-m{display:none}}
.ham{display:inline-flex;flex-direction:column;justify-content:center;gap:4px;width:38px;height:38px;background:transparent;border:1px solid currentColor;cursor:pointer;padding:10px;color:inherit;border-radius:50%}
@media(min-width:920px){.ham{display:none}}
.ham span{display:block;width:100%;height:1px;background:currentColor}
.mm{display:none;position:fixed;inset:0;z-index:60;background:${t.warmWhite};padding:80px 28px 40px;flex-direction:column;gap:8px;overflow-y:auto}
.mm.open{display:flex}
.mm a.mm-link{display:block;padding:18px 0;font-family:'Cormorant Garamond',serif;font-size:24px;color:${t.navy};border-bottom:1px solid ${t.beige}}
.mm-close{position:absolute;top:24px;right:28px;width:38px;height:38px;background:transparent;border:1px solid ${t.navy};color:${t.navy};border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:18px}

/* Floating Schedule FAB (mobile only) */
.fab{position:fixed;bottom:24px;right:24px;z-index:48;width:60px;height:60px;border-radius:50%;background:${t.gold};color:${t.navy};display:inline-flex;align-items:center;justify-content:center;box-shadow:0 14px 32px rgba(201,169,110,.4);transition:transform .25s ease}
.fab:hover{transform:scale(1.05);color:${t.navy}}
.fab::before{content:'';position:absolute;inset:-8px;border-radius:50%;border:1px solid ${t.gold};opacity:.5;animation:fabRing 2.4s ease-out infinite}
@keyframes fabRing{0%{transform:scale(.95);opacity:.6}100%{transform:scale(1.3);opacity:0}}
@media(min-width:920px){.fab{display:none}}

/* Hero — full-bleed editorial. 100vh fills the initial viewport entirely so
   the next section (stats strip) doesn't peek cream above the fold. */
.hero{position:relative;min-height:100vh;display:flex;align-items:center;color:${heroTextColor};overflow:hidden;padding:120px 0 80px}
.hero-bg{position:absolute;inset:0;z-index:0;background:linear-gradient(135deg,${t.navy},${t.charcoal})}
.hero-bg img{width:100%;height:100%;object-fit:cover}
/* Left-weighted gradient keeps copy readable on any photo. Stronger on the
   left 55% where the text lives, softer on the right so the image breathes.
   Flips to a cream-tinted wash when the hero palette resolves to dark text. */
.hero-overlay{position:absolute;inset:0;z-index:1;background:${heroOverlayBg}}
.hero-overlay::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,27,48,.25) 0%,transparent 30%,transparent 70%,rgba(15,27,48,.55) 100%);pointer-events:none}
.hero > .ctn{position:relative;z-index:2}
.hero-content{max-width:720px}
.hero h1{color:${heroTextColor};margin-top:18px;text-shadow:${heroShadow}}
.hero-sub{font-family:'Inter',sans-serif;font-size:clamp(16px,1.6vw,18px);color:${heroSubColor};margin-top:24px;max-width:560px;line-height:1.7}
.hero-cta-row{display:flex;flex-wrap:wrap;gap:14px;margin-top:36px}
.hero-credit{position:absolute;bottom:14px;right:24px;z-index:2;font-size:10.5px;color:rgba(255,255,255,.55);letter-spacing:.04em}
.hero-credit a{color:rgba(255,255,255,.7);text-decoration:underline}

/* Stats strip — cream background, gold hairline dividers between cells, a
   subtle gold ornament above each number for visual weight. */
.stats-strip{position:relative;background:${t.cream};border-top:1px solid ${t.beige};border-bottom:1px solid ${t.beige}}
.stats-strip::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:80px;height:1px;background:${t.gold}}
.stats-strip .ctn{display:grid;gap:0;grid-template-columns:1fr;padding:48px 24px}
@media(min-width:640px){.stats-strip .ctn{grid-template-columns:repeat(2,1fr)}}
@media(min-width:900px){.stats-strip .ctn{grid-template-columns:repeat(4,1fr);padding:56px 40px}}
.stat-cell{position:relative;text-align:center;padding:16px 8px}
@media(min-width:900px){
  .stat-cell+.stat-cell::before{content:'';position:absolute;left:0;top:18%;bottom:18%;width:1px;background:${t.beige}}
}
@media(min-width:640px) and (max-width:899px){
  .stat-cell:nth-child(2)::before{content:'';position:absolute;left:0;top:18%;bottom:18%;width:1px;background:${t.beige}}
  .stat-cell:nth-child(4)::before{content:'';position:absolute;left:0;top:18%;bottom:18%;width:1px;background:${t.beige}}
}
.stat-ornament{display:inline-block;width:32px;height:1px;background:${t.gold};margin-bottom:18px;position:relative}
.stat-ornament::before,.stat-ornament::after{content:'';position:absolute;top:-2px;width:4px;height:4px;border-radius:50%;background:${t.gold}}
.stat-ornament::before{left:-6px}
.stat-ornament::after{right:-6px}
.stat-num{font-family:'Cormorant Garamond',serif;font-size:clamp(38px,4.8vw,52px);font-weight:700;color:${t.navy};line-height:1;letter-spacing:-0.015em}
.stat-label{display:block;margin-top:10px;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:${t.muted};font-weight:600}

/* Agent intro split */
.agent-intro{display:grid;gap:48px;align-items:center;grid-template-columns:1fr}
@media(min-width:900px){.agent-intro{grid-template-columns:.85fr 1.15fr;gap:72px}}
.agent-photo{position:relative;border-radius:4px;overflow:hidden;background:linear-gradient(135deg,${t.navy} 0%,${t.charcoal} 100%);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.6);box-shadow:0 0 0 1px rgba(201,169,110,.25),inset 0 0 0 6px transparent,inset 0 0 0 7px rgba(201,169,110,.18)}
.agent-photo-md{aspect-ratio:4/5}
.agent-photo-lg{aspect-ratio:3/4}
.agent-photo-sm{aspect-ratio:1/1;width:120px;height:120px}
.agent-photo-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.85) brightness(.7)}
.agent-photo-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,27,48,.35) 0%,rgba(15,27,48,.55) 60%,rgba(15,27,48,.85) 100%);z-index:1}
/* Gold monogram only when we don't have a background photo */
.agent-photo-monogram{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;font-family:'Cormorant Garamond',serif;font-size:clamp(72px,12vw,128px);font-weight:600;color:${t.gold};opacity:.85;letter-spacing:-0.03em}
.agent-photo-label{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);z-index:2;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:rgba(250,247,242,.92);letter-spacing:.02em;white-space:nowrap;text-shadow:0 1px 8px rgba(0,0,0,.5)}
.agent-intro-body{max-width:580px}
.agent-intro p{margin-top:18px}
/* Designations — single horizontal line with dot separators (replaces the
   old chip grid; reads as an editorial credit line, not UI tags). */
.agent-intro .designations,.designations-line{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin-top:30px;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-weight:600;font-style:italic;color:${t.gold};letter-spacing:.04em}
.designations-line .des-item{padding:0 14px;color:${t.gold}}
.designations-line .des-item:first-child{padding-left:0}
.designations-line .des-sep{display:inline-block;width:4px;height:4px;border-radius:50%;background:${t.gold};opacity:.6}
/* Legacy pill class — preserved for backward-compat but unused in new layout */
.designation-pill{display:inline-flex;align-items:center;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;font-weight:600;color:${t.navy};border:1px solid ${t.beige};padding:7px 14px;border-radius:2px;letter-spacing:.02em;background:#fff}
.brokerage-line{display:flex;align-items:center;gap:14px;margin-top:28px;padding-top:24px;border-top:1px solid ${t.beige};color:${t.muted};font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.brokerage-line strong{font-family:'Cormorant Garamond',serif;font-style:normal;font-size:18px;color:${t.navy};text-transform:none;letter-spacing:0;font-weight:600}

/* Listing card */
.listings-grid{display:grid;gap:32px;grid-template-columns:1fr}
@media(min-width:720px){.listings-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1080px){.listings-grid{grid-template-columns:repeat(3,1fr)}}
.listing-card{position:relative;background:#fff;border:1px solid ${t.beige};overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:transform .25s ease,box-shadow .25s ease}
.listing-card:hover{transform:translateY(-4px);box-shadow:0 20px 50px -20px rgba(26,43,69,.25);color:inherit}
.listing-photo{position:relative;aspect-ratio:4/3;overflow:hidden;background:linear-gradient(135deg,${t.navy},${t.charcoal})}
.listing-photo img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}
.listing-card:hover .listing-photo img{transform:scale(1.04)}
.listing-photo-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.6)}
/* Single italic caveat line under the section heading — replaces the
   per-photo "Sample — replace" bars which cluttered every card. */
.sample-note{display:block;margin-top:16px;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:${t.muted};letter-spacing:.01em}
/* Status — corner ribbon (top-left, slanted feel via solid bar with offset shadow) */
.listing-status{position:absolute;top:0;left:0;display:inline-flex;align-items:center;background:${t.navy};color:${t.warmWhite};font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;padding:9px 18px 9px 16px;clip-path:polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%);box-shadow:2px 2px 14px rgba(15,27,48,.18);transition:transform .3s ease,box-shadow .3s ease;will-change:transform}
.listing-status.s-just-listed{background:${t.gold};color:${t.navy};animation:ribbon-pulse 2.8s ease-in-out infinite}
.listing-status.s-pending{background:${t.beige};color:${t.navy};opacity:.88}
.listing-status.s-sold{background:${t.charcoal};color:${t.gold}}
.listing-card:hover .listing-status{transform:translate(2px,-2px);box-shadow:4px 5px 20px rgba(15,27,48,.26)}
@keyframes ribbon-pulse{0%,100%{box-shadow:2px 2px 14px rgba(201,169,110,.25)}50%{box-shadow:2px 2px 22px rgba(201,169,110,.55)}}
.listing-body{padding:24px 24px 26px;display:flex;flex-direction:column;gap:6px;flex-grow:1}
.listing-price-wrap{display:flex;flex-direction:column;gap:2px;margin-bottom:6px}
.listing-price-label{font-family:'Inter',sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:${t.muted}}
.listing-price{font-family:'Cormorant Garamond',serif;font-size:38px;font-weight:700;color:${t.navy};line-height:1;letter-spacing:-0.018em}
.listing-address{font-size:14.5px;color:${t.body};line-height:1.5;margin-top:6px}
.listing-meta{margin-top:auto;padding-top:18px;border-top:1px solid ${t.beige};display:flex;align-items:center;gap:18px;color:${t.muted};font-size:13px}

/* Featured listing — full-width hero card above the grid */
.listing-featured{position:relative;grid-column:1 / -1;background:#fff;border:1px solid ${t.beige};overflow:hidden;display:grid;grid-template-columns:1fr;margin-bottom:32px;transition:transform .25s ease,box-shadow .25s ease;text-decoration:none;color:inherit}
@media(min-width:900px){.listing-featured{grid-template-columns:1.35fr 1fr}}
.listing-featured:hover{transform:translateY(-4px);box-shadow:0 24px 60px -20px rgba(15,27,48,.28);color:inherit}
.listing-featured .listing-photo{aspect-ratio:4/3}
@media(min-width:900px){.listing-featured .listing-photo{aspect-ratio:auto;height:100%;min-height:460px}}
.listing-featured-body{padding:44px 40px;display:flex;flex-direction:column;gap:0}
@media(max-width:900px){.listing-featured-body{padding:32px 28px}}
.listing-featured-eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:'Inter',sans-serif;font-size:11.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${t.gold};margin-bottom:18px}
.listing-featured-eyebrow::before{content:'';display:inline-block;width:28px;height:1px;background:${t.gold}}
.listing-featured-address{font-family:'Cormorant Garamond',serif;font-size:clamp(26px,3vw,34px);font-weight:600;color:${t.navy};line-height:1.15;letter-spacing:-0.01em}
.listing-featured-neighborhood{font-size:14px;color:${t.muted};letter-spacing:.02em;margin-top:6px}
.listing-featured-price-wrap{margin:26px 0 24px;padding:20px 0;border-top:1px solid ${t.beige};border-bottom:1px solid ${t.beige}}
.listing-featured-price-label{display:block;font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${t.muted};margin-bottom:6px}
.listing-featured-price{font-family:'Cormorant Garamond',serif;font-size:clamp(44px,5.5vw,60px);font-weight:700;color:${t.navy};line-height:1;letter-spacing:-0.022em}
.listing-featured-meta{display:flex;flex-wrap:wrap;gap:22px 32px;font-size:14px;color:${t.body}}
.listing-featured-meta span{display:inline-flex;align-items:center;gap:8px}
.listing-featured-meta strong{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:${t.navy};letter-spacing:-.01em}
.listing-featured-meta svg{color:${t.gold};flex-shrink:0}
.listing-featured-actions{margin-top:32px;display:flex;gap:12px;flex-wrap:wrap}

/* Curation process — 3-step editorial mini-row between filter/sort and grid */
.curation-process{background:${t.cream};border:1px solid ${t.beige};padding:36px 36px;margin-bottom:40px}
.curation-header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid ${t.beige}}
.curation-header h4{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;color:${t.navy};line-height:1.15;letter-spacing:-0.005em}
.curation-header .eyebrow{color:${t.gold};font-size:11px;letter-spacing:.18em}
.curation-steps{display:grid;gap:24px;grid-template-columns:1fr}
@media(min-width:780px){.curation-steps{grid-template-columns:repeat(3,1fr);gap:0}}
.curation-step{position:relative;padding:0 28px}
.curation-step:first-child{padding-left:0}
@media(min-width:780px){
  .curation-step+.curation-step::before{content:'';position:absolute;left:0;top:18%;bottom:18%;width:1px;background:${t.beige}}
}
@media(max-width:779px){.curation-step{padding:0 0 0 0;border-bottom:1px solid ${t.beige};padding-bottom:18px}.curation-step:last-child{border-bottom:none;padding-bottom:0}}
.curation-num{display:inline-block;font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:600;color:transparent;-webkit-text-stroke:1.5px ${t.gold};line-height:1;letter-spacing:-.02em;margin-bottom:10px}
.curation-step h5{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:${t.navy};margin-bottom:6px;letter-spacing:-0.005em}
.curation-step p{font-size:14px;color:${t.body};line-height:1.6}

/* See-more contextual CTA — between grid and Recently Sold/Main CTA */
.see-more-bar{display:grid;gap:20px;grid-template-columns:1fr;align-items:center;background:${t.navy};color:${t.warmWhite};padding:28px 36px;margin:48px 0 0;border-left:4px solid ${t.gold}}
@media(min-width:720px){.see-more-bar{grid-template-columns:1fr auto;gap:28px}}
.see-more-bar .sm-copy{display:flex;flex-direction:column;gap:4px}
.see-more-bar .sm-eyebrow{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${t.gold}}
.see-more-bar .sm-line{font-family:'Cormorant Garamond',serif;font-size:clamp(20px,2.4vw,26px);font-weight:600;color:${t.warmWhite};line-height:1.25;letter-spacing:-0.005em}
.see-more-bar .sm-sub{font-family:'Inter',sans-serif;font-size:13.5px;color:rgba(250,247,242,.65);margin-top:4px}

/* Recently Sold strip — compact horizontal proof cards */
.sold-section{padding:80px 0;background:${t.warmWhite}}
.sold-header{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:18px;margin-bottom:36px;padding-bottom:22px;border-bottom:1px solid ${t.beige}}
.sold-header .eyebrow{color:${t.gold}}
.sold-header h3{font-family:'Cormorant Garamond',serif;font-size:clamp(26px,3.4vw,38px);font-weight:600;color:${t.navy};letter-spacing:-0.008em;margin-top:8px;line-height:1.15}
.sold-header .sold-note{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:${t.muted};max-width:340px;text-align:right}
@media(max-width:640px){.sold-header .sold-note{text-align:left}}
.sold-grid{display:grid;gap:20px;grid-template-columns:1fr}
@media(min-width:640px){.sold-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1000px){.sold-grid{grid-template-columns:repeat(4,1fr)}}
.sold-card{position:relative;background:${t.cream};border:1px solid ${t.beige};padding:22px 22px 20px;display:flex;flex-direction:column;gap:6px;transition:transform .25s ease,box-shadow .25s ease}
.sold-card:hover{transform:translateY(-3px);box-shadow:0 14px 32px -14px rgba(15,27,48,.18)}
.sold-card .sold-ribbon{position:absolute;top:14px;right:14px;font-family:'Inter',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${t.gold};background:${t.charcoal};padding:4px 10px}
.sold-card .sold-addr{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:${t.navy};line-height:1.25;letter-spacing:-0.005em;padding-right:60px}
.sold-card .sold-neigh{font-size:12.5px;color:${t.muted};letter-spacing:.02em}
.sold-card .sold-price-wrap{margin-top:14px;padding-top:14px;border-top:1px solid ${t.beige}}
.sold-card .sold-price-label{font-family:'Inter',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${t.muted}}
.sold-card .sold-price{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;color:${t.navy};line-height:1;letter-spacing:-0.015em;margin-top:4px}
.sold-card .sold-meta{margin-top:10px;display:flex;gap:12px;font-size:11.5px;color:${t.muted};letter-spacing:.02em}

/* Sort bar above the listings grid */
.sort-bar{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid ${t.beige}}
.sort-bar-label{font-family:'Inter',sans-serif;font-size:11.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${t.muted}}
.sort-select{font-family:'Inter',sans-serif;font-size:13.5px;font-weight:500;color:${t.navy};background:#fff;border:1px solid ${t.beige};padding:9px 32px 9px 16px;border-radius:2px;letter-spacing:.02em;cursor:pointer;outline:none;transition:border-color .2s;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%23C9A96E' d='M2 4l4 4 4-4z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:11px}
.sort-select:hover,.sort-select:focus{border-color:${t.gold}}
.listing-meta span{display:inline-flex;align-items:center;gap:6px}
.listing-meta svg{flex-shrink:0;color:${t.gold}}

/* MLS coming-soon banner */
.mls-banner{background:${t.cream};border:1px solid ${t.beige};border-left:4px solid ${t.gold};padding:24px 28px;display:flex;flex-wrap:wrap;align-items:center;gap:24px;margin-bottom:48px;border-radius:2px}
.mls-banner .mls-text{flex:1;min-width:240px}
.mls-banner h3{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:${t.navy};margin-bottom:6px;line-height:1.2}
.mls-banner p{font-size:14.5px;color:${t.body}}

/* Listings filter bar (cosmetic for MVP) */
.filter-bar{display:flex;flex-wrap:wrap;gap:12px;padding:18px 0;margin-bottom:36px;border-top:1px solid ${t.beige};border-bottom:1px solid ${t.beige}}
.filter-bar select{font-family:'Inter',sans-serif;font-size:13px;color:${t.body};background:transparent;border:1px solid ${t.beige};padding:9px 14px;border-radius:2px;letter-spacing:.02em;cursor:pointer;outline:none;transition:border-color .2s}
.filter-bar select:hover,.filter-bar select:focus{border-color:${t.navy}}

/* Neighborhoods */
.neighborhoods-grid{display:grid;gap:24px;grid-template-columns:1fr}
@media(min-width:720px){.neighborhoods-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1080px){.neighborhoods-grid{grid-template-columns:repeat(3,1fr)}}
.neighborhood-card{position:relative;background:#fff;border:1px solid ${t.beige};overflow:hidden;text-decoration:none;color:inherit;transition:all .3s ease;display:flex;flex-direction:column}
.neighborhood-card:hover{transform:translateY(-3px);box-shadow:0 18px 40px -18px rgba(26,43,69,.2);color:inherit}
.neighborhood-photo{position:relative;aspect-ratio:5/3;overflow:hidden;background:linear-gradient(135deg,${t.navy},${t.charcoal})}
.neighborhood-photo img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}
.neighborhood-card:hover .neighborhood-photo img{transform:scale(1.04)}
.neighborhood-photo-overlay{position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(15,27,48,.8) 100%)}
/* Photo fallback — elegant monogram card (serif initial + subtle gold glow)
   instead of the old giant map-pin icon, which looked broken. */
.neighborhood-photo-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${t.navy} 0%,${t.charcoal} 100%);overflow:hidden}
.neighborhood-photo-placeholder::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 30% 25%,rgba(201,169,110,.22) 0%,transparent 55%);pointer-events:none}
.neighborhood-photo-placeholder::after{content:'';position:absolute;inset:-1px;border:1px solid rgba(201,169,110,.12);pointer-events:none}
.np-monogram{position:relative;z-index:2;font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(72px,11vw,132px);font-weight:600;color:${t.gold};opacity:.92;letter-spacing:-0.035em;line-height:1;text-shadow:0 4px 20px rgba(0,0,0,.2)}
.np-sublabel{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:2;font-family:'Inter',sans-serif;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(250,247,242,.45);font-weight:500}

/* Area map overlay card — floats over the Google embed with coverage stats */
.area-map-wrap{position:relative;border:1px solid ${t.beige};overflow:hidden;box-shadow:0 18px 40px -16px rgba(26,43,69,.18);background:#E2E8F0;border-radius:2px}
.area-map-wrap iframe{width:100%;height:420px;border:0;display:block;filter:grayscale(.35) contrast(1.05) saturate(.8)}
.area-map-overlay{position:absolute;top:24px;left:24px;z-index:2;background:${t.warmWhite};padding:22px 26px;box-shadow:0 10px 32px -10px rgba(15,27,48,.28);max-width:calc(100% - 48px);border-left:3px solid ${t.gold}}
.area-map-overlay .amo-eyebrow{display:block;font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${t.gold};margin-bottom:10px}
.area-map-overlay .amo-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:${t.navy};letter-spacing:-.005em;line-height:1.2}
.area-map-overlay .amo-stats{display:flex;gap:0;margin-top:16px;padding-top:14px;border-top:1px solid ${t.beige}}
.area-map-overlay .amo-stat{padding:0 18px;text-align:center}
.area-map-overlay .amo-stat:first-child{padding-left:0;text-align:left}
.area-map-overlay .amo-stat+.amo-stat{border-left:1px solid ${t.beige}}
.area-map-overlay .amo-stat strong{display:block;font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;color:${t.navy};letter-spacing:-.01em;line-height:1}
.area-map-overlay .amo-stat span{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${t.muted};margin-top:4px;font-weight:600}
@media(max-width:760px){
  .area-map-wrap iframe{height:320px}
  .area-map-overlay{top:12px;left:12px;padding:16px 18px;max-width:calc(100% - 24px)}
  .area-map-overlay .amo-title{font-size:18px}
  .area-map-overlay .amo-stat strong{font-size:18px}
}

/* YoY trend pill — gold up-arrow for rising markets, muted for dropping */
.trend-pill{display:inline-flex;align-items:center;gap:3px;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:3px;margin-left:8px;vertical-align:.18em}
.trend-pill.up{background:rgba(45,122,79,.12);color:#2D7A4F}
.trend-pill.up::before{content:'\u25B2';font-size:9px;margin-right:1px}
.trend-pill.down{background:rgba(183,42,42,.1);color:#B72A2A}
.trend-pill.down::before{content:'\u25BC';font-size:9px;margin-right:1px}
.trend-pill.flat{background:${t.beige};color:${t.muted}}
.trend-pill.flat::before{content:'\u2014';margin-right:3px}
.neighborhood-name{position:absolute;left:24px;bottom:18px;color:#fff;font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:600;letter-spacing:-0.005em}
.neighborhood-body{padding:24px 24px 26px}
/* Redesigned stats row — 3-col grid with gold dividers + small icons */
.neighborhood-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin:16px 0 18px;padding:16px 0;border-top:1px solid ${t.beige};border-bottom:1px solid ${t.beige}}
.neighborhood-stats > span{position:relative;padding:2px 10px;text-align:center;font-family:'Inter',sans-serif;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:${t.muted};font-weight:600;display:flex;flex-direction:column;align-items:center;gap:6px}
.neighborhood-stats > span:first-child{text-align:left;align-items:flex-start;padding-left:0}
.neighborhood-stats > span:last-child{text-align:right;align-items:flex-end;padding-right:0}
.neighborhood-stats > span + span::before{content:'';position:absolute;left:0;top:20%;bottom:20%;width:1px;background:${t.beige}}
.neighborhood-stats .ns-icon{display:inline-flex;align-items:center;justify-content:center;color:${t.gold};opacity:.85}
.neighborhood-stats strong{display:inline-flex;align-items:baseline;gap:6px;font-family:'Cormorant Garamond',serif;font-size:20px;color:${t.navy};font-weight:700;letter-spacing:-0.012em;text-transform:none;line-height:1.05}
.neighborhood-desc{font-size:14.5px;color:${t.body};line-height:1.65}
/* Best-for italic tagline above description */
.best-for{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:15px;color:${t.goldHover};margin-bottom:10px;letter-spacing:.005em;line-height:1.4}
.best-for::before{content:'Best for ';font-style:normal;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${t.gold};display:inline-block;margin-right:6px;vertical-align:.15em}

/* Featured neighborhood — first card full-width with 2-col layout */
.neighborhood-featured{grid-column:1 / -1;position:relative;background:#fff;border:1px solid ${t.beige};overflow:hidden;display:grid;grid-template-columns:1fr;margin-bottom:8px;transition:transform .25s ease,box-shadow .25s ease}
@media(min-width:900px){.neighborhood-featured{grid-template-columns:1.25fr 1fr}}
.neighborhood-featured:hover{transform:translateY(-3px);box-shadow:0 20px 50px -20px rgba(15,27,48,.22)}
.neighborhood-featured .neighborhood-photo{aspect-ratio:4/3}
@media(min-width:900px){.neighborhood-featured .neighborhood-photo{aspect-ratio:auto;height:100%;min-height:460px}}
.neighborhood-featured .neighborhood-photo-overlay{display:none}
.neighborhood-featured .neighborhood-name{display:none}
.neighborhood-featured .neighborhood-body{padding:48px 44px 40px;display:flex;flex-direction:column;gap:0}
@media(max-width:900px){.neighborhood-featured .neighborhood-body{padding:32px 28px}}
.featured-ribbon{position:absolute;top:24px;left:24px;z-index:2;font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${t.navy};background:${t.gold};padding:8px 16px;box-shadow:0 4px 14px rgba(201,169,110,.4)}
.featured-name{font-family:'Cormorant Garamond',serif;font-size:clamp(32px,4vw,44px);font-weight:600;color:${t.navy};line-height:1.1;letter-spacing:-0.015em;margin-bottom:10px}
.featured-sub{font-size:13px;color:${t.muted};letter-spacing:.02em;margin-bottom:20px}
.neighborhood-featured .neighborhood-stats{margin-top:20px}
.neighborhood-featured .neighborhood-stats strong{font-size:24px}
.neighborhood-featured .neighborhood-desc{font-size:16px;line-height:1.7}

/* Matchmaker — 4 data-driven decision paths between grid and CTA */
.matchmaker{padding:96px 0;background:${t.warmWhite};border-top:1px solid ${t.beige}}
.matchmaker .mm-header{text-align:center;margin-bottom:48px}
.matchmaker .mm-header .eyebrow{color:${t.gold}}
.matchmaker .mm-header h2{margin-top:14px;margin-bottom:14px}
.matchmaker .mm-header .bar-accent{margin:14px auto 0}
.matchmaker .mm-sub{max-width:560px;margin:20px auto 0;font-size:15px;color:${t.body};line-height:1.6}
.match-grid{display:grid;gap:20px;grid-template-columns:1fr}
@media(min-width:640px){.match-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1080px){.match-grid{grid-template-columns:repeat(4,1fr)}}
.match-card{position:relative;background:#fff;border:1px solid ${t.beige};padding:28px 26px 24px;display:flex;flex-direction:column;gap:8px;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease;text-decoration:none;color:inherit;min-height:220px}
.match-card:hover{transform:translateY(-3px);box-shadow:0 18px 40px -18px rgba(15,27,48,.2);border-color:${t.gold};color:inherit}
.match-card .match-num{position:absolute;top:20px;right:24px;font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:600;color:transparent;-webkit-text-stroke:1px ${t.gold};line-height:1;letter-spacing:-.02em;opacity:.7}
.match-eyebrow{font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${t.gold}}
.match-q{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:${t.navy};line-height:1.22;letter-spacing:-.008em;margin-top:4px;padding-right:40px}
.match-answer{margin-top:auto;padding-top:16px;border-top:1px solid ${t.beige}}
.match-answer strong{display:block;font-family:'Cormorant Garamond',serif;font-size:22px;color:${t.navy};font-weight:700;letter-spacing:-.008em;line-height:1.1}
.match-answer-why{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;color:${t.muted};line-height:1.5;margin-top:6px}
.match-answer-why .match-arrow{font-family:'Cormorant Garamond',serif;font-size:22px;color:${t.gold};transition:transform .2s ease;flex-shrink:0}
.match-card:hover .match-arrow{transform:translateX(5px)}

/* Recent sale mini-row inside a neighborhood card body */
.recent-sale-line{display:flex;align-items:baseline;gap:10px;margin-top:16px;padding-top:14px;border-top:1px dashed ${t.beige};flex-wrap:wrap}
.recent-sale-line .rsl-label{font-family:'Inter',sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${t.gold}}
.recent-sale-line .rsl-price{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:700;color:${t.navy};letter-spacing:-.01em;line-height:1}
.recent-sale-line .rsl-meta{color:${t.muted};font-size:12px;letter-spacing:.02em}

/* Neighborhoods page — anchor pills (serif gold, underline + chevron) */
.area-anchors{display:flex;flex-wrap:wrap;gap:6px 28px;justify-content:center;align-items:baseline;margin-bottom:48px;padding:0 16px}
.area-anchor{display:inline-flex;align-items:baseline;gap:8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:17px;font-weight:600;color:${t.gold};padding:8px 2px;background:transparent;border:none;border-bottom:1px solid rgba(201,169,110,.35);border-radius:0;transition:all .2s ease;letter-spacing:.005em}
.area-anchor:hover{color:${t.navy};border-bottom-color:${t.navy}}
.area-anchor::after{content:'\u2193';font-family:'Inter',sans-serif;font-size:11px;opacity:.55;transition:transform .2s ease;margin-left:-2px}
.area-anchor:hover::after{transform:translateY(2px);opacity:.9}
.area-anchor .aa-count{display:inline-block;font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.06em;color:${t.muted};background:rgba(201,169,110,.12);padding:2px 6px;margin-left:2px;border-radius:2px}
.area-anchor:hover .aa-count{background:${t.navy};color:${t.gold}}

/* Testimonials carousel */
.testi-carousel{position:relative}
.testi-track{display:flex;gap:24px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;padding:8px 4px 28px;scrollbar-width:none}
.testi-track::-webkit-scrollbar{display:none}
.testi-card{flex:0 0 calc((100% - 48px) / 3);scroll-snap-align:start;min-width:300px;background:#fff;border:1px solid ${t.beige};padding:36px 32px;display:flex;flex-direction:column;gap:20px;position:relative}
@media(max-width:900px){.testi-card{flex:0 0 calc((100% - 24px) / 2)}}
@media(max-width:640px){.testi-card{flex:0 0 86%}}
.testi-card::before{content:'\\201C';position:absolute;top:14px;right:24px;font-family:Georgia,serif;font-size:84px;line-height:.7;color:${t.gold};opacity:.18;font-weight:700;pointer-events:none}
.testi-stars{display:inline-flex;gap:2px;color:${t.gold}}
.testi-quote{font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.55;color:${t.navy};font-style:italic;font-weight:500}
.testi-meta{display:flex;align-items:center;gap:14px;padding-top:18px;border-top:1px solid ${t.beige};margin-top:auto}
.testi-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${t.navy},${t.charcoal});color:${t.gold};font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.testi-name{font-weight:600;font-size:14.5px;color:${t.navy};letter-spacing:.02em;font-family:'Inter',sans-serif}
.testi-role{font-size:12px;color:${t.muted};letter-spacing:.02em}
.testi-nav{display:flex;justify-content:center;align-items:center;gap:18px;margin-top:18px}
.testi-btn{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:transparent;border:1px solid ${t.beige};color:${t.navy};cursor:pointer;transition:all .25s ease}
.testi-btn:hover:not(:disabled){background:${t.navy};color:${t.warmWhite};border-color:${t.navy}}
.testi-btn:disabled{opacity:.3;cursor:not-allowed}
.testi-btn[data-prev] svg{transform:rotate(180deg)}
.testi-dots{display:inline-flex;gap:8px}
.testi-dot{width:7px;height:7px;border-radius:50%;background:${t.beige};border:none;padding:0;cursor:pointer;transition:all .25s ease}
.testi-dot.is-active{background:${t.gold};width:24px;border-radius:999px}

/* Valuation banner — gold accent, full-width */
.valuation-banner{background:${t.navy};color:${t.warmWhite};padding:80px 0;position:relative;overflow:hidden}
.valuation-banner::before{content:'';position:absolute;top:-160px;right:-80px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(201,169,110,.18) 0%,transparent 70%);pointer-events:none}
.valuation-banner .ctn{position:relative;z-index:1;display:grid;grid-template-columns:1fr;gap:40px;align-items:center}
@media(min-width:900px){.valuation-banner .ctn{grid-template-columns:1.1fr .9fr;gap:64px}}
.valuation-banner h2{color:${t.warmWhite};margin-top:14px}
.valuation-banner .body-lg{color:rgba(250,247,242,.78);margin-top:16px}
.valuation-card{background:rgba(250,247,242,.06);border:1px solid rgba(250,247,242,.12);padding:32px 32px 28px;backdrop-filter:blur(6px)}
.valuation-card h3{font-family:'Cormorant Garamond',serif;font-size:22px;color:${t.warmWhite};margin-bottom:18px;font-weight:600}

/* Forms */
.form-grid{display:grid;gap:14px;grid-template-columns:1fr}
@media(min-width:640px){.form-grid{grid-template-columns:1fr 1fr}}
.form-row-full{grid-column:1/-1}
.form-label{display:block;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${t.navy};margin-bottom:6px}
.valuation-card .form-label{color:rgba(250,247,242,.85)}
.form-input,.form-select,.form-textarea{width:100%;padding:12px 14px;font-family:'Inter',sans-serif;font-size:15px;color:${t.navy};background:#fff;border:1px solid ${t.beige};border-radius:2px;transition:border-color .2s,box-shadow .2s}
.form-input:focus,.form-select:focus,.form-textarea:focus{outline:none;border-color:${t.gold};box-shadow:0 0 0 3px rgba(201,169,110,.2)}
.form-textarea{min-height:110px;resize:vertical;font-family:inherit}
.form-hidden{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.valuation-card .form-input,.valuation-card .form-select,.valuation-card .form-textarea{background:rgba(250,247,242,.95);color:${t.navy}}

/* Page hero (sub-pages) */
.page-hero{position:relative;padding:140px 0 72px;background:${t.cream};border-bottom:1px solid ${t.beige};overflow:hidden}
/* Decorative gold corner ornament — small editorial accent, not loud */
.page-hero::before{content:'';position:absolute;top:110px;right:48px;width:120px;height:120px;border:1px solid ${t.gold};opacity:.3;pointer-events:none;transform:rotate(45deg)}
.page-hero::after{content:'';position:absolute;top:150px;right:90px;width:48px;height:48px;border:1px solid ${t.gold};opacity:.5;pointer-events:none;transform:rotate(45deg)}
@media(max-width:760px){.page-hero::before,.page-hero::after{display:none}}
.page-hero > .ctn{position:relative;z-index:1}
.page-hero .crumb{font-size:12px;color:${t.muted};letter-spacing:.1em;text-transform:uppercase;margin-bottom:18px}
.page-hero .crumb a{color:${t.muted}}
.page-hero .crumb a:hover{color:${t.navy}}
.page-hero .body-lg{margin-top:18px;max-width:680px}
/* Stat row under page-hero sub */
.page-hero-stats{display:inline-flex;flex-wrap:wrap;align-items:center;gap:0;margin-top:32px;padding:14px 22px;background:rgba(250,247,242,.7);border:1px solid ${t.beige};border-left:3px solid ${t.gold};font-family:'Inter',sans-serif}
.phs-item{font-size:13px;color:${t.heading};font-weight:500;letter-spacing:.02em;padding:0 16px}
.phs-item:first-child{padding-left:0}
.phs-item:last-child{padding-right:0}
.phs-item strong{font-family:'Cormorant Garamond',serif;font-weight:700;font-size:18px;color:${t.navy};margin-right:6px;letter-spacing:-.01em}
.phs-sep{display:inline-block;width:1px;height:20px;background:${t.beige}}

/* Filter chips — replaces the cosmetic select dropdowns */
.filter-chips-wrap{margin:44px 0 36px}
.filter-chips-label{display:block;font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${t.muted};margin-bottom:14px}
.filter-chips{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.filter-chip{display:inline-flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;font-size:13px;font-weight:500;letter-spacing:.04em;color:${t.heading};background:#fff;border:1px solid ${t.beige};padding:9px 18px;border-radius:999px;cursor:pointer;transition:all .2s ease}
.filter-chip:hover{border-color:${t.gold};color:${t.navy}}
.filter-chip.is-active{background:${t.navy};color:${t.warmWhite};border-color:${t.navy}}
.filter-chip .chip-count{display:inline-block;font-size:11px;color:${t.muted};background:${t.cream};padding:2px 8px;border-radius:999px;margin-left:-2px;font-weight:600}
.filter-chip.is-active .chip-count{background:rgba(250,247,242,.14);color:${t.gold}}
.filter-chips-divider{flex-basis:100%;height:1px;background:${t.beige};margin:10px 0}
.filter-chips-sublabel{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${t.muted};margin-right:8px;align-self:center}

/* Footer */
.foot{background:${t.charcoal};color:rgba(250,247,242,.7);padding:72px 0 28px;font-size:14px}
.foot-grid{display:grid;gap:48px;grid-template-columns:1fr}
@media(min-width:768px){.foot-grid{grid-template-columns:1.4fr repeat(3,1fr)}}
.foot h5{font-family:'Inter',sans-serif;color:${t.warmWhite};font-size:11px;text-transform:uppercase;letter-spacing:.16em;margin-bottom:18px;font-weight:600}
.foot-brand{font-family:'Cormorant Garamond',serif;color:${t.warmWhite};font-size:26px;font-weight:600;letter-spacing:-0.005em}
.foot-brand-line{display:block;font-family:'Inter',sans-serif;font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:${t.gold};margin-top:6px}
.foot a{color:rgba(250,247,242,.7)}
.foot a:hover{color:${t.gold}}
.foot ul{list-style:none;display:flex;flex-direction:column;gap:10px}
.foot-bot{border-top:1px solid rgba(250,247,242,.1);padding-top:24px;margin-top:48px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;font-size:12px;color:rgba(250,247,242,.45);letter-spacing:.04em}
.foot-license{display:block;margin-top:8px;font-size:11px;color:rgba(250,247,242,.5);letter-spacing:.06em}

/* Google rating badge above testimonials carousel */
.google-badge{display:inline-flex;align-items:center;gap:14px;background:#fff;border:1px solid ${t.beige};padding:14px 22px;border-radius:2px;margin:18px 0 8px;box-shadow:0 6px 20px -10px rgba(15,27,48,.18)}
.google-badge .gb-rating{display:inline-flex;align-items:center;gap:8px;font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:${t.navy};line-height:1}
.google-badge .gb-stars{display:inline-flex;gap:1.5px}
.google-badge .gb-meta{display:flex;flex-direction:column;text-align:left;line-height:1.25}
.google-badge .gb-meta strong{font-family:'Inter',sans-serif;font-size:12px;font-weight:700;letter-spacing:.05em;color:${t.heading}}
.google-badge .gb-meta span{font-family:'Inter',sans-serif;font-size:11.5px;color:${t.muted};letter-spacing:.04em;margin-top:2px}
.google-badge .gb-divider{width:1px;height:32px;background:${t.beige}}

/* Market Snapshot — dark editorial section between neighborhoods + testimonials */
.market-snap{position:relative;background:${t.charcoal};color:${t.warmWhite};padding:88px 0;overflow:hidden}
.market-snap::before{content:'';position:absolute;top:-180px;left:-100px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(201,169,110,.16) 0%,transparent 60%);pointer-events:none}
.market-snap::after{content:'';position:absolute;bottom:-160px;right:-100px;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,rgba(201,169,110,.1) 0%,transparent 60%);pointer-events:none}
.market-snap > .ctn{position:relative;z-index:1}
.market-snap .eyebrow{color:${t.gold}}
.market-snap h2.h2{color:${t.warmWhite};margin-top:14px}
.market-snap .body-lg{color:rgba(250,247,242,.7);max-width:620px;margin:0 auto;margin-top:18px}
.market-grid{display:grid;gap:28px;grid-template-columns:1fr;margin-top:56px}
@media(min-width:640px){.market-grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:980px){.market-grid{grid-template-columns:repeat(4,1fr);gap:0}}
.market-cell{position:relative;text-align:center;padding:24px 20px}
@media(min-width:980px){.market-cell+.market-cell::before{content:'';position:absolute;left:0;top:18%;bottom:18%;width:1px;background:rgba(250,247,242,.12)}}
.market-num{font-family:'Cormorant Garamond',serif;font-size:clamp(40px,5vw,56px);font-weight:700;color:${t.gold};line-height:1;letter-spacing:-0.018em}
.market-num .ms-suffix{font-size:.5em;font-weight:600;margin-left:4px;color:${t.warmWhite};opacity:.8;letter-spacing:0;vertical-align:0.18em}
.market-num .ms-arrow{display:inline-block;font-size:.55em;margin-right:4px;font-weight:600}
.market-num .ms-arrow.up{color:#7CC4A2}
.market-num .ms-arrow.down{color:#E8978A}
.market-label{display:block;margin-top:14px;font-family:'Inter',sans-serif;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(250,247,242,.6);font-weight:600}
.market-disclaimer{display:block;margin-top:48px;text-align:center;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:rgba(250,247,242,.45);letter-spacing:.01em}

/* Process Timeline — used on About page */
.process-timeline{display:grid;gap:0;grid-template-columns:1fr;margin-top:48px}
@media(min-width:780px){.process-timeline{grid-template-columns:repeat(4,1fr)}}
.process-step{position:relative;padding:28px 24px 24px;text-align:left}
@media(min-width:780px){
  .process-step{text-align:center;padding:36px 24px 28px}
  .process-step+.process-step::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:1px;height:60px;background:${t.beige}}
}
.process-num{display:inline-block;font-family:'Cormorant Garamond',serif;font-size:48px;font-weight:600;color:transparent;-webkit-text-stroke:1.5px ${t.gold};line-height:1;letter-spacing:-.02em}
.process-step h3{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600;color:${t.navy};margin-top:14px;line-height:1.2}
.process-step p{margin-top:10px;font-size:14.5px;color:${t.body};line-height:1.6}
@media(min-width:780px){.process-step p{max-width:240px;margin-left:auto;margin-right:auto}}

/* Reveal on scroll */
.rv{opacity:0;transform:translateY(18px);transition:opacity .8s ease,transform .8s ease}
.rv.is-visible{opacity:1;transform:translateY(0)}

/* ── Mobile responsive ────────────────────────────────────────────────── */
@media(max-width:760px){
  .ctn{padding:0 18px}
  .sect{padding:64px 0}
  .nav{padding:14px 0}
  .nav.solid{padding:12px 0}
  .nav-brand{font-size:18px}
  .hero{min-height:78vh;padding:100px 0 60px}
  .hero-cta-row{flex-direction:column;align-items:stretch;gap:10px}
  .hero-cta-row .btn{width:100%}
  .stats-strip .ctn{padding:32px 18px;gap:24px}
  .agent-intro{gap:36px}
  .agent-photo-md{aspect-ratio:1/1;max-width:280px;margin:0 auto}
  .testi-card{padding:28px 24px}
  .testi-quote{font-size:17px}
  .listing-body{padding:20px}
  .listing-price{font-size:26px}
  .neighborhood-name{font-size:22px;left:18px;bottom:14px}
  .valuation-banner{padding:60px 0}
  .valuation-card{padding:24px 22px}
  .page-hero{padding:120px 0 48px}
  .foot{padding:56px 0 24px}
  .form-input,.form-select,.form-textarea{font-size:16px}
  .mls-banner{padding:20px 22px;flex-direction:column;align-items:flex-start;gap:14px}
}
@media(max-width:420px){
  .nav-cta{display:none}
  .hero{min-height:72vh}
  .testi-card{flex:0 0 92%}
}

/* Tier 2 — mobile tweaks for new components */
@media(max-width:760px){
  .listing-price{font-size:30px}
  .listing-status{font-size:9.5px;padding:7px 14px 7px 12px}
  .designations-line{font-size:14px;justify-content:center;text-align:center}
  .designations-line .des-item{padding:0 10px}
  .google-badge{padding:12px 18px;gap:12px;flex-wrap:wrap;justify-content:center}
  .google-badge .gb-rating{font-size:20px}
  .market-snap{padding:64px 0}
  .market-cell{padding:18px 16px}
  .market-num{font-size:clamp(36px,8vw,44px)}
  .market-disclaimer{font-size:13px;margin-top:32px;padding:0 12px}
  .process-step{padding:24px 18px;border-bottom:1px solid ${t.beige}}
  .process-step:last-child{border-bottom:none}
}
`;
}

// ─── Interactive script ─────────────────────────────────────────────────────

function getRealEstateScript() {
  return `<script>
(function(){
  var nav=document.querySelector('.nav');
  if(nav){
    var forceSolid=nav.hasAttribute('data-force-solid');
    if(forceSolid){
      nav.classList.add('solid');
    }else{
      var threshold=window.innerWidth<760?40:80;
      function onScroll(){nav.classList.toggle('solid',window.scrollY>threshold)}
      window.addEventListener('scroll',onScroll,{passive:true});onScroll();
    }
  }
  var ham=document.querySelector('.ham'),mm=document.querySelector('.mm'),mc=document.querySelector('.mm-close');
  if(ham&&mm){ham.addEventListener('click',function(){mm.classList.toggle('open');document.body.style.overflow=mm.classList.contains('open')?'hidden':''});if(mc)mc.addEventListener('click',function(){mm.classList.remove('open');document.body.style.overflow=''});mm.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){mm.classList.remove('open');document.body.style.overflow=''})})}
  var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}})},{threshold:0.1,rootMargin:'0px 0px -60px 0px'});
  document.querySelectorAll('.rv').forEach(function(el){io.observe(el)});

  // Quote/CMA form — AJAX submit with redirect to thank-you
  document.querySelectorAll('form[data-netlify]').forEach(function(form){
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var btn=form.querySelector('button[type="submit"]');
      if(btn){btn.disabled=true;btn.style.opacity='0.7';var orig=btn.innerHTML;btn.innerHTML='Sending...'}
      var data=new FormData(form),params=new URLSearchParams();
      data.forEach(function(v,k){params.append(k,v)});
      var done=function(){window.location.href=form.getAttribute('action')||'/thank-you/'};
      fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()}).then(done).catch(function(){setTimeout(done,400)});
    });
  });

  // Listings sort — reorder cards by price / size / status / featured
  (function(){
    var sortSel=document.querySelector('[data-sort]');
    if(!sortSel)return;
    var grid=document.querySelector('.listings-grid');
    if(!grid)return;
    var featured=grid.querySelector('.listing-featured');
    // Original order for the "Featured" option
    var originalOrder=Array.prototype.slice.call(grid.querySelectorAll('.listing-card,.listing-featured'));
    var statusRank={'just-listed':0,'for-sale':1,'pending':2,'sold':3};
    sortSel.addEventListener('change',function(){
      var mode=sortSel.value;
      var cards=Array.prototype.slice.call(grid.querySelectorAll('.listing-card'));
      if(mode==='featured'){
        originalOrder.forEach(function(el){grid.appendChild(el)});
        return;
      }
      // For non-featured sorts, keep the featured card pinned at top
      if(featured)grid.appendChild(featured);
      var num=function(el,attr){return parseFloat(el.getAttribute(attr))||0};
      cards.sort(function(a,b){
        if(mode==='price-asc')return num(a,'data-price')-num(b,'data-price');
        if(mode==='price-desc')return num(b,'data-price')-num(a,'data-price');
        if(mode==='size-desc')return num(b,'data-sqft')-num(a,'data-sqft');
        if(mode==='status'){
          var ra=statusRank[a.getAttribute('data-status')]||9;
          var rb=statusRank[b.getAttribute('data-status')]||9;
          return ra-rb;
        }
        return 0;
      });
      cards.forEach(function(c){grid.appendChild(c)});
    });
  })();

  // Listings filter chips — show/hide cards based on status + neighborhood
  (function(){
    var chipsRoot=document.querySelector('.filter-chips');
    if(!chipsRoot)return;
    var cards=document.querySelectorAll('.listings-grid .listing-card');
    if(!cards.length)return;
    var state={status:'all',neighborhood:'all'};
    function apply(){
      cards.forEach(function(card){
        var s=card.getAttribute('data-status')||'';
        var n=card.getAttribute('data-neighborhood')||'';
        var okS=state.status==='all'||s===state.status;
        var okN=state.neighborhood==='all'||n===state.neighborhood;
        card.style.display=okS&&okN?'':'none';
      });
      var visibleCount=Array.prototype.filter.call(cards,function(c){return c.style.display!=='none'}).length;
      var counter=document.querySelector('[data-result-count]');
      if(counter)counter.textContent=visibleCount;
    }
    chipsRoot.querySelectorAll('.filter-chip').forEach(function(chip){
      chip.addEventListener('click',function(){
        var group=chip.getAttribute('data-group');
        var value=chip.getAttribute('data-value');
        if(group==='status'){state.status=value;chipsRoot.querySelectorAll('[data-group="status"]').forEach(function(c){c.classList.toggle('is-active',c===chip)})}
        else if(group==='neighborhood'){state.neighborhood=value;chipsRoot.querySelectorAll('[data-group="neighborhood"]').forEach(function(c){c.classList.toggle('is-active',c===chip)})}
        apply();
      });
    });
  })();

  // Testimonials carousel
  document.querySelectorAll('.testi-carousel').forEach(function(root){
    var track=root.querySelector('.testi-track'),dots=root.querySelectorAll('.testi-dot'),prev=root.querySelector('[data-prev]'),next=root.querySelector('[data-next]');
    if(!track)return;
    function cw(){var c=track.querySelector('.testi-card');if(!c)return 0;var g=parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap||0)||0;return c.getBoundingClientRect().width+g}
    function active(){var w=cw();if(!w)return 0;return Math.round(track.scrollLeft/w)}
    function update(){var i=active();dots.forEach(function(d,k){d.classList.toggle('is-active',k===i)});if(prev)prev.disabled=track.scrollLeft<=0;if(next)next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2}
    if(prev)prev.addEventListener('click',function(){track.scrollBy({left:-cw(),behavior:'smooth'})});
    if(next)next.addEventListener('click',function(){track.scrollBy({left:cw(),behavior:'smooth'})});
    dots.forEach(function(d,k){d.addEventListener('click',function(){track.scrollTo({left:k*cw(),behavior:'smooth'})})});
    track.addEventListener('scroll',function(){window.clearTimeout(track._t);track._t=window.setTimeout(update,60)},{passive:true});
    window.addEventListener('resize',update);update();
  });
})();
</script>`;
}

// ─── Navigation ─────────────────────────────────────────────────────────────

function getRealEstatePages() {
  return [
    { n: 'Home', h: '/' },
    { n: 'Listings', h: '/listings' },
    { n: 'Neighborhoods', h: '/neighborhoods' },
    { n: 'About', h: '/about' },
    { n: 'Contact', h: '/contact' },
  ];
}

function getNav(c, cur) {
  const pages = getRealEstatePages();
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const brokerage = c.brokerageName ? `<span class="nav-brand-line">${esc(c.brokerageName)}</span>` : '';
  // Sub-pages don't have a full-bleed hero photo to sit on — the transparent
  // nav reads as white-on-cream there, which makes the agent name invisible.
  // Force .solid from the start on anything that's not the home hero.
  const forceSolid = cur !== '/';
  const solidAttrs = forceSolid ? ' solid' : '';
  const dataAttr = forceSolid ? ' data-force-solid="true"' : '';
  return `<nav class="nav${solidAttrs}"${dataAttr}><div class="ctn nav-inner">
    <a href="/" class="nav-brand">${esc(c.businessName)}${brokerage}</a>
    <div class="nav-links">
      ${pages.filter((p) => p.h !== '/').map((p) => `<a href="${p.h}"${p.h === cur ? ' class="active"' : ''}>${p.n}</a>`).join('')}
    </div>
    <div class="nav-right">
      <a href="/contact" class="btn btn-outline-gold btn-sm nav-cta">Schedule a Call</a>
      ${phone ? `<a class="nav-phone-m" href="tel:${esc(tel)}" aria-label="Call">${icon('phone', 16)}</a>` : ''}
      <button class="ham" aria-label="Menu"><span></span><span></span><span></span></button>
    </div>
  </div></nav>
  <div class="mm">
    <button class="mm-close" aria-label="Close">&times;</button>
    ${pages.map((p) => `<a class="mm-link" href="${p.h}">${p.n}</a>`).join('')}
    ${phone ? `<a class="btn btn-outline mt-6" href="tel:${esc(tel)}" style="margin-top:24px">Call ${esc(phone)}</a>` : ''}
    <a class="btn btn-gold" href="/contact" style="margin-top:12px">Schedule a Call</a>
  </div>`;
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function getFooter(c) {
  const pages = getRealEstatePages();
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const email = c.contactEmail || '';
  const address = c.contactAddress || '';
  const brokerage = c.brokerageName ? `<span class="foot-brand-line">${esc(c.brokerageName)}</span>` : '';
  return `<footer class="foot"><div class="ctn">
    <div class="foot-grid">
      <div>
        <p class="foot-brand">${esc(c.businessName)}${brokerage}</p>
        <p style="margin-top:18px;color:rgba(250,247,242,.7);max-width:320px">${esc(c.footerTagline || 'Helping families find homes that grow with them.')}</p>
        ${c.licenseNumber ? `<span class="foot-license">License #${esc(c.licenseNumber)}</span>` : ''}
      </div>
      <div>
        <h5>Pages</h5>
        <ul>${pages.map((p) => `<li><a href="${p.h}">${p.n}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h5>Contact</h5>
        <ul>
          ${phone ? `<li><a href="tel:${esc(tel)}">${esc(phone)}</a></li>` : ''}
          ${email ? `<li><a href="mailto:${esc(email)}">${esc(email)}</a></li>` : ''}
          ${address ? `<li style="color:rgba(250,247,242,.7)">${esc(address)}</li>` : ''}
        </ul>
      </div>
      <div>
        <h5>Equal Housing</h5>
        <p style="font-size:12px;color:rgba(250,247,242,.55);line-height:1.6">All real estate advertised herein is subject to the Federal Fair Housing Act. Information deemed reliable but not guaranteed.</p>
      </div>
    </div>
    <div class="foot-bot">
      <span>&copy; ${new Date().getFullYear()} ${esc(c.businessName)}. All rights reserved.</span>
      <span>REALTOR&reg; &middot; Equal Housing Opportunity</span>
    </div>
    ${c.heroImage && c.heroImage.photographer ? `<div style="margin-top:14px;font-size:10.5px;color:rgba(250,247,242,.35);letter-spacing:.03em">Hero photo by <a href="${esc(c.heroImage.photographerUrl)}" target="_blank" rel="noopener" style="color:rgba(250,247,242,.5)">${esc(c.heroImage.photographer)}</a> on <a href="${esc(c.heroImage.unsplashUrl || 'https://unsplash.com')}" target="_blank" rel="noopener" style="color:rgba(250,247,242,.5)">Unsplash</a></div>` : ''}
  </div></footer>`;
}

function getFAB(c) {
  // Schedule FAB — calendar icon, gold, mobile only
  const url = c.calendlyUrl || '/contact';
  const isExternal = /^https?:/.test(url);
  return `<a class="fab" href="${esc(url)}"${isExternal ? ' target="_blank" rel="noopener"' : ''} aria-label="Schedule a call">${icon('calendar', 22, TOKENS.navy)}</a>`;
}

// ─── Netlify form attrs ─────────────────────────────────────────────────────

function netlifyFormAttrs(formName, action) {
  return `name="${formName}" method="POST" data-netlify="true" data-netlify-honeypot="bot-field" action="${action || '/thank-you/'}"`;
}

function netlifyHiddenFields(formName) {
  return `<input type="hidden" name="form-name" value="${formName}"><p class="form-hidden"><label>Don&#39;t fill this out: <input name="bot-field"></label></p>`;
}

// ─── JSON-LD Schema ─────────────────────────────────────────────────────────

function getRealEstateAgentSchema(c) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: c.businessName || '',
    description: c.heroSubtitle || `Real estate agent in ${c.primaryCity || ''}`,
    telephone: c.contactPhone || undefined,
    email: c.contactEmail || undefined,
    address: c.contactAddress
      ? { '@type': 'PostalAddress', streetAddress: c.contactAddress, addressLocality: c.primaryCity || undefined }
      : undefined,
    areaServed: ((c.serviceAreas && c.serviceAreas.length) ? c.serviceAreas : [c.primaryCity].filter(Boolean)).map((a) => ({ '@type': 'City', name: a })),
    parentOrganization: c.brokerageName ? { '@type': 'RealEstateAgent', name: c.brokerageName } : undefined,
    aggregateRating: c.googleRating
      ? { '@type': 'AggregateRating', ratingValue: String(c.googleRating), reviewCount: String(c.reviewCount || 80).replace(/[^\d]/g, '') || '80' }
      : undefined,
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

function wrapRealEstatePage(c, cur, body, opts = {}) {
  const city = esc(c.primaryCity || '');
  const phone = esc(c.contactPhone || '');
  const title = esc(opts.title || `${c.businessName}${city ? ` — Real Estate in ${city}` : ''}${c.brokerageName ? ` | ${c.brokerageName}` : ''}`);
  const desc = esc(opts.description || `${c.businessName}: ${city ? `your trusted real estate expert in ${city}. ` : ''}${phone ? `Call ${phone}.` : ''}`.trim());
  const schemas = (opts.schemas || [getRealEstateAgentSchema(c)]).join('\n');
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${TOKENS.navy}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${getRealEstateStyles(opts.heroPal)}</style>
${schemas}
</head>
<body>
${getNav(c, cur)}
<main>${body}</main>
${getFooter(c)}
${getFAB(c)}
${getRealEstateScript()}
</body></html>`;
}

module.exports = {
  TOKENS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_LISTINGS,
  esc,
  telHref,
  initialsFor,
  slugify,
  fmtMoney,
  icon,
  iconFilled,
  googleGlyph,
  agentHeadshot,
  getRealEstatePages,
  wrapRealEstatePage,
  netlifyFormAttrs,
  netlifyHiddenFields,
  getRealEstateAgentSchema,
};
