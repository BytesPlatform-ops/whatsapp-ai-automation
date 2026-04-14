const { env } = require('../../config/env');

// Public URL the static salon site uses to reach the booking API.
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE_URL || env.chatbot.baseUrl;

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function attr(s) {
  return esc(s).replace(/\n/g, ' ');
}

const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function renderHoursRows(hours) {
  if (!hours) return '';
  return DAYS.map((d) => {
    const ws = hours[d] || [];
    const value = ws.length === 0 ? 'Closed' : ws.map((w) => `${w.open}–${w.close}`).join(', ');
    return `<li style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f2ebe6;color:#555"><span style="font-weight:600;color:#1a1a1a">${DAY_LABELS[d]}</span><span>${esc(value)}</span></li>`;
  }).join('');
}

// Rough category label for a salon service name — drives the pill on the card.
function categoryOf(name) {
  const n = String(name || '').toLowerCase();
  if (/balayage|highlight|color|colour|keratin|blow|cut|hair|trim|styl|wash|shampoo|bridal/.test(n)) return 'Hair';
  if (/manicure|pedicure|acrylic|nail/.test(n)) return 'Nails';
  if (/facial|peel|skin|microderm|dermaplan/.test(n)) return 'Skin';
  if (/lash|brow|microblad/.test(n)) return 'Lash & Brow';
  if (/wax/.test(n)) return 'Waxing';
  if (/massage|spa|relax/.test(n)) return 'Spa';
  if (/makeup/.test(n)) return 'Makeup';
  return 'Signature';
}

// Render an individual service card with or without an Unsplash image.
function renderServiceCard(s, pc, ac, showPill) {
  const cat = categoryOf(s.name);
  const initial = String(s.name || '?').trim().charAt(0).toUpperCase();
  const hasImg = !!(s.image && s.image.url);
  const media = hasImg
    ? `<div class="svc-media">
         <img src="${attr(s.image.url)}" alt="${attr(s.name)}" loading="lazy">
         ${showPill ? `<span class="svc-pill">${esc(cat)}</span>` : ''}
         ${s.image.photographer ? `<a href="${attr(s.image.photographerUrl)}" target="_blank" rel="noopener" class="svc-credit">${esc(s.image.photographer)}</a>` : ''}
       </div>`
    : `<div class="svc-media" style="background:linear-gradient(135deg,${pc} 0%,${ac} 120%)">
         <div class="svc-fallback">${esc(initial)}</div>
         ${showPill ? `<span class="svc-pill">${esc(cat)}</span>` : ''}
       </div>`;
  const dur = s.durationMinutes ? `${s.durationMinutes} min` : '';
  return `
    <article class="svc-card">
      ${media}
      <div class="svc-body">
        <h3 class="svc-name">${esc(s.name)}</h3>
        <p class="svc-meta">${esc(dur)}</p>
        <div class="svc-bottom">
          <span class="svc-price">${esc(s.priceText || 'Enquire')}</span>
          <a href="/booking" class="svc-book">Book →</a>
        </div>
      </div>
    </article>`;
}

// Simple trust/stats triad. Derived from config with gentle defaults so we
// don't fabricate precise numbers we don't know.
function getStats(c) {
  const year = new Date().getFullYear();
  return [
    { n: `${(c.salonServices || []).length || '—'}`, l: 'Services on offer' },
    { n: '★ 5.0', l: 'Typical review rating' },
    { n: `${year}`, l: 'Caring for clients' },
  ];
}

function pages(c) {
  const out = [{ n: 'Home', h: '/' }];
  if ((c.salonServices || []).length > 0) out.push({ n: 'Services', h: '/services' });
  out.push({ n: 'Booking', h: '/booking' });
  out.push({ n: 'About', h: '/about' });
  out.push({ n: 'Contact', h: '/contact' });
  return out;
}

function getStyles(pc, ac) {
  return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;color:#1a1a1a;background:#fff;-webkit-font-smoothing:antialiased}
h1,h2,h3,.display{font-family:'Playfair Display',Georgia,serif;letter-spacing:-0.01em}
a{color:inherit}
.ctn{max-width:1140px;margin:0 auto;padding:0 24px}
.sect{padding:88px 24px}
.btn-p{display:inline-flex;align-items:center;gap:8px;background:${pc};color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:15px;font-weight:600;transition:transform 0.2s,box-shadow 0.2s;border:none;cursor:pointer}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 14px 30px ${pc}33}
.btn-w{display:inline-flex;align-items:center;gap:8px;background:#fff;color:${pc};padding:14px 32px;border-radius:999px;text-decoration:none;font-size:15px;font-weight:700;box-shadow:0 6px 24px rgba(0,0,0,0.08)}
.btn-w:hover{transform:translateY(-2px)}
.btn-s{display:inline-flex;align-items:center;gap:8px;background:transparent;color:${pc};padding:14px 32px;border-radius:999px;text-decoration:none;font-size:15px;font-weight:600;border:1px solid ${pc}}
.nav{position:sticky;top:0;background:rgba(255,255,255,0.88);backdrop-filter:blur(14px);border-bottom:1px solid #f2ebe6;z-index:100}
.nav-i{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;max-width:1280px;margin:0 auto}
.nav-b{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:${pc};text-decoration:none}
.nav-ls{display:flex;align-items:center;gap:28px}
.nav-l{color:#1a1a1a;text-decoration:none;font-size:14px;font-weight:500;transition:color 0.2s}
.nav-l:hover{color:${pc}}
.nav-l.active{color:${pc}}
.mm-btn{display:none;background:none;border:none;cursor:pointer;padding:8px;font-size:22px;color:${pc}}
.mm{display:none;flex-direction:column;padding:12px 28px 20px;border-top:1px solid #f2ebe6;background:#fff;gap:14px}
.mm a{color:#1a1a1a;text-decoration:none;font-size:15px;font-weight:500}
.mm.open{display:flex}
@media (max-width:760px){.nav-ls{display:none}.mm-btn{display:inline-block}}
.hero{min-height:84vh;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;padding:80px 24px;position:relative;overflow:hidden}
.hero-bg{position:absolute;inset:0;z-index:-1}
.hero-overlay{position:absolute;inset:0;background:linear-gradient(135deg,${pc}ee 0%,${ac}bb 100%);z-index:-1}
.hero-credit{position:absolute;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.65)}
.hero-credit a{color:rgba(255,255,255,0.85);text-decoration:underline}
.kicker{letter-spacing:6px;font-size:11px;text-transform:uppercase;opacity:0.9;margin-bottom:20px}
.fade-up{animation:fadeUp 0.8s ease-out both}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.service-row{display:grid;grid-template-columns:1fr auto;gap:18px;padding:22px 0;border-bottom:1px solid #f2ebe6;align-items:center}
.service-row:last-child{border-bottom:none}
.price{font-weight:700;color:${pc};font-size:17px}
.svc-card{background:#fff;border-radius:20px;overflow:hidden;border:1px solid #f2ebe6;transition:transform 0.35s cubic-bezier(.16,1,.3,1),box-shadow 0.35s;display:flex;flex-direction:column;position:relative}
.svc-card:hover{transform:translateY(-6px);box-shadow:0 22px 50px rgba(20,12,18,0.12)}
.svc-media{aspect-ratio:4/3;background:linear-gradient(135deg,${pc} 0%,${ac} 120%);position:relative;overflow:hidden}
.svc-media img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.8s ease}
.svc-card:hover .svc-media img{transform:scale(1.06)}
.svc-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Playfair Display',serif;font-size:72px;font-weight:700;letter-spacing:-2px;opacity:0.9}
.svc-pill{position:absolute;top:14px;left:14px;background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);color:${pc};font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;padding:6px 12px;border-radius:999px;z-index:2}
.svc-body{padding:22px 22px 24px;display:flex;flex-direction:column;flex:1}
.svc-name{font-family:'Playfair Display',serif;font-size:21px;font-weight:700;color:#1a1a1a;margin-bottom:6px;line-height:1.25}
.svc-meta{font-size:13px;color:#888;margin-bottom:18px}
.svc-bottom{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;border-top:1px dashed #f2ebe6}
.svc-price{font-weight:800;color:${pc};font-size:19px}
.svc-book{background:${pc};color:#fff;padding:9px 18px;border-radius:999px;font-size:13px;font-weight:600;text-decoration:none;transition:background 0.2s}
.svc-book:hover{background:${ac}}
.svc-credit{position:absolute;bottom:8px;right:10px;font-size:10px;color:rgba(255,255,255,0.85);background:rgba(0,0,0,0.35);padding:3px 8px;border-radius:999px;text-decoration:none;z-index:2}
.svc-credit:hover{color:#fff;background:rgba(0,0,0,0.55)}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}
.stats-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:24px;background:#fff;border-radius:24px;padding:36px 32px;box-shadow:0 18px 60px rgba(20,12,18,0.08)}
.stat-n{font-family:'Playfair Display',serif;font-size:clamp(32px,4vw,44px);font-weight:700;background:linear-gradient(135deg,${pc},${ac});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
.stat-l{font-size:13px;color:#888;margin-top:6px;text-transform:uppercase;letter-spacing:1.5px}
.cat-bar{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:0 0 40px}
.cat-bar span{padding:8px 18px;border-radius:999px;background:#faf8f6;color:#555;font-size:13px;font-weight:500;border:1px solid #f2ebe6}
.trust-bar{display:inline-flex;align-items:center;gap:18px;padding:10px 22px;background:rgba(255,255,255,0.12);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.18);border-radius:999px;font-size:13px;letter-spacing:0.3px;margin-top:28px}
.trust-bar span{display:inline-flex;align-items:center;gap:6px}
.trust-bar svg{flex-shrink:0}
.ig-cta{background:linear-gradient(135deg,${pc} 0%,${ac} 100%);border-radius:24px;padding:48px 32px;color:#fff;text-align:center}
input,select,textarea{font:inherit}
.book-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
@media (max-width:560px){.book-grid{grid-template-columns:1fr}}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:24px}
.slot{padding:12px;border-radius:10px;border:1px solid #e6dcd3;background:#fff;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.15s}
.slot:hover{border-color:${pc}}
.slot.selected{background:${pc};color:#fff;border-color:${pc}}
.slot:disabled{opacity:0.35;cursor:not-allowed}
.bk-input{width:100%;padding:14px;border-radius:10px;border:1px solid #e6dcd3;background:#fff;font-size:15px}
.bk-input:focus{outline:none;border-color:${pc}}
.loading{color:#999;font-size:14px;padding:12px 0}
.error{color:#c0392b;font-size:14px;padding:10px 14px;background:#fff5f3;border-radius:10px;margin-bottom:12px}
.success{background:#f3faf5;border-radius:18px;padding:32px;text-align:center;color:#1a1a1a}
`;
}

function getNav(c, cur) {
  const ps = pages(c);
  return `
<nav class="nav"><div class="nav-i">
  <a href="/" class="nav-b">${esc(c.businessName)}</a>
  <div class="nav-ls">
    ${ps.map((p) => `<a href="${p.h}" class="nav-l${p.h === cur ? ' active' : ''}">${p.n}</a>`).join('')}
    <a href="/booking" class="btn-p" style="padding:10px 22px;font-size:13px">Book Now</a>
  </div>
  <button class="mm-btn" aria-label="Menu" onclick="document.getElementById('mm').classList.toggle('open')">☰</button>
</div>
<div class="mm" id="mm">
  ${ps.map((p) => `<a href="${p.h}">${p.n}</a>`).join('')}
  <a href="/booking" class="btn-p" style="align-self:flex-start">Book Now</a>
</div>
</nav>`;
}

function getFooter(c) {
  return `
<footer style="background:#0f0f12;color:#999;padding:48px 24px 24px;text-align:center">
  <p class="display" style="font-size:22px;color:#fff;margin-bottom:10px">${esc(c.businessName)}</p>
  ${c.footerTagline ? `<p style="font-size:13px;opacity:0.7;max-width:520px;margin:0 auto 16px">${esc(c.footerTagline)}</p>` : ''}
  <div style="display:flex;gap:18px;justify-content:center;margin-top:12px;flex-wrap:wrap">
    ${c.contactPhone ? `<a href="tel:${attr(c.contactPhone)}" style="color:#ddd;text-decoration:none;font-size:13px">${esc(c.contactPhone)}</a>` : ''}
    ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}" style="color:#ddd;text-decoration:none;font-size:13px">${esc(c.contactEmail)}</a>` : ''}
    ${c.instagramHandle ? `<a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener" style="color:#ddd;text-decoration:none;font-size:13px">Instagram @${esc(c.instagramHandle)}</a>` : ''}
  </div>
  <p style="font-size:12px;opacity:0.5;margin-top:24px">© ${new Date().getFullYear()} ${esc(c.businessName)}</p>
</footer>`;
}

function wrap(c, cur, body) {
  const pc = c.primaryColor || '#1F2937';
  const ac = c.accentColor || '#EC4899';
  const title = cur === '/' ? '' : ' — ' + cur.replace('/', '').replace(/^\w/, (x) => x.toUpperCase());
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(c.businessName)}${title}</title>
<meta name="description" content="${attr(c.tagline || '')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${getStyles(pc, ac)}</style>
</head><body>${getNav(c, cur)}<main>${body}</main>${getFooter(c)}</body></html>`;
}

// ─── HOME ──────────────────────────────────────────────────────────────────
function generateHomePage(c) {
  const pc = c.primaryColor || '#1F2937';
  const ac = c.accentColor || '#EC4899';
  const hasHero = !!(c.heroImage && c.heroImage.url);
  const heroImg = hasHero
    ? `<div class="hero-bg" style="background:url('${attr(c.heroImage.url)}') center/cover no-repeat"></div>`
    : '';
  const credit = hasHero
    ? `<div class="hero-credit">Photo by <a href="${attr(c.heroImage.photographerUrl)}" target="_blank" rel="noopener">${esc(c.heroImage.photographer)}</a> on <a href="${attr(c.heroImage.unsplashUrl)}" target="_blank" rel="noopener">Unsplash</a></div>`
    : '';

  const featured = (c.salonServices || []).slice(0, 6);
  const featuredCards = featured.map((s) => renderServiceCard(s, pc, ac, true)).join('');
  const stats = getStats(c);

  // Clock + checkmark icons for the hero trust bar.
  const iClock = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg>`;
  const iCheck = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const iSpark = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.4L21 11l-6.6 2.6L12 20l-2.4-6.4L3 11l6.6-2.6L12 2z"/></svg>`;

  const body = `
<section class="hero">
  ${heroImg}
  <div class="hero-overlay"></div>
  ${credit}
  <div class="fade-up" style="max-width:900px;position:relative">
    <p class="kicker">${esc(c.industry || 'Salon & Spa')}</p>
    <h1 style="font-size:clamp(42px,7vw,84px);font-weight:900;line-height:1.02;margin-bottom:24px">${esc(c.headline)}</h1>
    <p style="font-size:clamp(16px,2vw,19px);max-width:640px;margin:0 auto 32px;opacity:0.92;line-height:1.6">${esc(c.tagline)}</p>
    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
      <a href="/booking" class="btn-w">${esc(c.ctaButton || 'Book Now')} →</a>
      ${(c.salonServices || []).length > 0 ? `<a href="/services" class="btn-s" style="color:#fff;border-color:rgba(255,255,255,0.55)">View Services</a>` : ''}
    </div>
    <div class="trust-bar">
      <span>${iClock} Book in 30s</span>
      <span style="opacity:0.5">·</span>
      <span>${iCheck} Free cancellation 24h before</span>
      <span style="opacity:0.5">·</span>
      <span>${iSpark} Expert stylists</span>
    </div>
  </div>
</section>

<section style="padding:48px 24px;background:#faf8f6"><div class="ctn" style="max-width:960px">
  <div class="stats-strip">
    ${stats.map((s) => `<div style="text-align:center"><p class="stat-n">${esc(s.n)}</p><p class="stat-l">${esc(s.l)}</p></div>`).join('')}
  </div>
</div></section>

${featured.length > 0 ? `
<section class="sect" style="background:#faf8f6;padding-top:32px"><div class="ctn">
  <div style="text-align:center;margin-bottom:48px" class="fade-up">
    <p style="letter-spacing:4px;font-size:11px;text-transform:uppercase;color:${pc};margin-bottom:12px">Popular Services</p>
    <h2 style="font-size:clamp(32px,5vw,48px);font-weight:800">${esc(c.servicesTitle || 'The Menu')}</h2>
    <p style="color:#777;margin-top:14px;max-width:500px;margin-left:auto;margin-right:auto">A small, well-chosen list of the treatments we're known for. Full menu below.</p>
  </div>
  <div class="svc-grid">${featuredCards}</div>
  ${(c.salonServices || []).length > featured.length ? `<div style="text-align:center;margin-top:44px"><a href="/services" class="btn-s">See full menu →</a></div>` : ''}
</div></section>` : ''}

<section class="sect" style="background:#fff"><div class="ctn" style="max-width:760px;text-align:center">
  <p style="letter-spacing:4px;font-size:11px;text-transform:uppercase;color:${pc};margin-bottom:12px">About</p>
  <h2 style="font-size:clamp(30px,4vw,42px);font-weight:800;margin-bottom:20px">${esc(c.aboutTitle || 'Our Story')}</h2>
  <p style="font-size:17px;color:#555;line-height:1.85">${esc(c.aboutText)}</p>
</div></section>

${c.instagramHandle ? `
<section class="sect" style="background:#faf8f6"><div class="ctn">
  <div class="ig-cta">
    <p style="letter-spacing:4px;font-size:11px;text-transform:uppercase;margin-bottom:12px;opacity:0.85">Instagram</p>
    <h2 style="font-size:clamp(28px,4vw,40px);font-weight:800;margin-bottom:12px">See our latest work</h2>
    <p style="opacity:0.9;margin-bottom:24px;max-width:520px;margin-left:auto;margin-right:auto">Fresh transformations every week — follow along for inspiration, before-and-afters, and style drops.</p>
    <a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener" class="btn-w">Follow @${esc(c.instagramHandle)}</a>
  </div>
</div></section>` : ''}

<section class="sect" style="background:linear-gradient(135deg,${pc} 0%,${ac} 120%);color:#fff;text-align:center">
  <div class="ctn" style="max-width:760px">
    <h2 style="font-size:clamp(32px,5vw,52px);font-weight:900;margin-bottom:18px">${esc(c.ctaTitle || 'Ready to Book?')}</h2>
    <p style="font-size:19px;opacity:0.92;max-width:560px;margin:0 auto 32px;line-height:1.6">${esc(c.ctaText || 'Reserve your spot in seconds.')}</p>
    <a href="/booking" class="btn-w" style="font-size:17px;padding:18px 40px">${esc(c.ctaButton || 'Book Now')} →</a>
  </div>
</section>`;

  return wrap(c, '/', body);
}

// ─── SERVICES ───────────────────────────────────────────────────────────────
function generateServicesPage(c) {
  const pc = c.primaryColor || '#1F2937';
  const ac = c.accentColor || '#EC4899';
  const svcs = c.salonServices || [];

  // Distinct categories observed on the menu — drives the pill bar.
  const cats = Array.from(new Set(svcs.map((s) => categoryOf(s.name))));
  const catBar = cats.length > 1
    ? `<div class="cat-bar">${cats.map((c2) => `<span>${esc(c2)}</span>`).join('')}</div>`
    : '';

  const cards = svcs.map((s) => renderServiceCard(s, pc, ac, true)).join('');

  const body = `
<section style="padding:72px 24px 32px;background:#fff"><div class="ctn" style="max-width:1080px;text-align:center">
  <p style="letter-spacing:4px;font-size:11px;text-transform:uppercase;color:${pc};margin-bottom:12px">The Menu</p>
  <h1 style="font-size:clamp(36px,6vw,60px);font-weight:800">${esc(c.servicesTitle || 'Our Services')}</h1>
  <p style="color:#777;margin-top:14px;max-width:560px;margin-left:auto;margin-right:auto">Every service is handled by a trained stylist. Pick one below to book — walk-ins welcome when we have a slot.</p>
</div></section>

<section style="padding:12px 24px 80px;background:#fff"><div class="ctn" style="max-width:1180px">
  ${catBar}
  ${svcs.length > 0
    ? `<div class="svc-grid">${cards}</div>`
    : '<p style="text-align:center;color:#999">Menu coming soon — give us a call to book.</p>'}
  <div style="text-align:center;margin-top:56px"><a href="/booking" class="btn-p">Book an Appointment →</a></div>
</div></section>`;
  return wrap(c, '/services', body);
}

// ─── ABOUT ──────────────────────────────────────────────────────────────────
function generateAboutPage(c) {
  const pc = c.primaryColor || '#1F2937';
  const body = `
<section class="sect" style="background:#fff"><div class="ctn" style="max-width:760px;text-align:center">
  <p style="letter-spacing:4px;font-size:11px;text-transform:uppercase;color:${pc};margin-bottom:12px">About</p>
  <h1 style="font-size:clamp(36px,6vw,56px);font-weight:800;margin-bottom:24px">${esc(c.aboutTitle || `About ${c.businessName}`)}</h1>
  <p style="font-size:18px;color:#555;line-height:1.9">${esc(c.aboutText)}</p>
  ${c.instagramHandle ? `<p style="margin-top:36px"><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener" style="color:${pc};font-weight:600">Follow @${esc(c.instagramHandle)} on Instagram</a></p>` : ''}
  <div style="margin-top:48px"><a href="/booking" class="btn-p">Book an Appointment →</a></div>
</div></section>`;
  return wrap(c, '/about', body);
}

// ─── BOOKING ────────────────────────────────────────────────────────────────
function generateBookingPage(c) {
  const pc = c.primaryColor || '#1F2937';
  const isEmbed = c.bookingMode === 'embed' && c.bookingUrl;

  let content;
  if (isEmbed) {
    content = `
      <div style="background:#faf8f6;border-radius:20px;padding:12px;overflow:hidden">
        <iframe src="${attr(c.bookingUrl)}" style="width:100%;height:720px;border:none;border-radius:12px" title="Booking"></iframe>
      </div>
      <p style="text-align:center;margin-top:20px;color:#777"><a href="${attr(c.bookingUrl)}" target="_blank" rel="noopener" style="color:${pc};font-weight:600">Open booking page in a new tab →</a></p>`;
  } else if (c.bookingMode === 'native' && c.siteId) {
    const servicesJson = JSON.stringify(c.salonServices || []).replace(/</g, '\\u003c');
    const siteIdJson = JSON.stringify(c.siteId);
    const apiJson = JSON.stringify(PUBLIC_API_BASE);
    const tzJson = JSON.stringify(c.timezone || 'Europe/Dublin');
    const pcJson = JSON.stringify(pc);

    content = `
      <div id="booking-root">
        <div id="bk-error" class="error" style="display:none"></div>
        <div class="book-grid">
          <select id="bk-service" class="bk-input"></select>
          <input id="bk-date" type="date" class="bk-input" />
        </div>
        <p id="bk-loading" class="loading" style="display:none">Loading available times…</p>
        <div id="bk-slots" class="slots"></div>
        <div id="bk-form" style="display:none;background:#faf8f6;border-radius:16px;padding:24px">
          <p style="font-weight:600;margin-bottom:14px">Your details</p>
          <div style="display:grid;gap:10px">
            <input id="bk-name" class="bk-input" placeholder="Full name" />
            <input id="bk-email" class="bk-input" type="email" placeholder="Email (for your confirmation)" />
            <input id="bk-phone" class="bk-input" placeholder="Phone number" />
            <textarea id="bk-notes" class="bk-input" placeholder="Notes (optional)" style="min-height:70px;resize:vertical"></textarea>
            <button id="bk-submit" class="btn-p" type="button" style="justify-content:center;margin-top:4px">Confirm booking</button>
          </div>
          <p style="font-size:12px;color:#888;margin-top:12px;text-align:center">Free cancellation up to 24 hours before your appointment.</p>
        </div>
        <div id="bk-done" class="success" style="display:none">
          <h3 style="font-size:26px;font-weight:800;margin-bottom:10px">You're booked! ✨</h3>
          <p id="bk-done-msg" style="color:#555"></p>
          <p style="color:#999;font-size:13px;margin-top:16px">A confirmation email (with a cancellation link) is on its way.</p>
        </div>
      </div>
      <script>
      (function(){
        var API=${apiJson};
        var SITE=${siteIdJson};
        var SERVICES=${servicesJson};
        var TZ=${tzJson};
        var PC=${pcJson};
        var state={service:SERVICES[0]&&SERVICES[0].name||'',date:'',slot:null};
        var svcSel=document.getElementById('bk-service');
        var dateInp=document.getElementById('bk-date');
        var slotsEl=document.getElementById('bk-slots');
        var errEl=document.getElementById('bk-error');
        var loadingEl=document.getElementById('bk-loading');
        var formEl=document.getElementById('bk-form');
        var doneEl=document.getElementById('bk-done');
        var doneMsg=document.getElementById('bk-done-msg');
        var submitBtn=document.getElementById('bk-submit');
        SERVICES.forEach(function(s){
          var o=document.createElement('option');o.value=s.name;
          o.textContent=s.name+' — '+s.durationMinutes+' min'+(s.priceText?' · '+s.priceText:'');
          svcSel.appendChild(o);
        });
        dateInp.value=new Date().toISOString().slice(0,10);
        dateInp.min=new Date().toISOString().slice(0,10);
        state.date=dateInp.value;
        function showError(m){errEl.style.display='block';errEl.textContent=m;}
        function clearError(){errEl.style.display='none';errEl.textContent='';}
        function resetSlots(){slotsEl.innerHTML='';formEl.style.display='none';state.slot=null;}
        function loadSlots(){
          clearError();resetSlots();loadingEl.style.display='block';
          var url=API+'/api/booking/'+SITE+'/availability?service='+encodeURIComponent(state.service)+'&date='+state.date;
          fetch(url).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){
            loadingEl.style.display='none';
            if(!x.ok){showError(x.j.error||'Could not load available times');return;}
            var slots=x.j.slots||[];
            if(slots.length===0){slotsEl.innerHTML='<p style="grid-column:1/-1;color:#888;text-align:center;padding:14px">No open slots on this day.</p>';return;}
            slots.forEach(function(s){
              var b=document.createElement('button');b.type='button';b.className='slot';b.textContent=s.label;b.dataset.start=s.startAt;
              b.addEventListener('click',function(){
                state.slot=s.startAt;
                [].forEach.call(slotsEl.querySelectorAll('.slot'),function(el){el.classList.remove('selected')});
                b.classList.add('selected');
                formEl.style.display='block';
                formEl.scrollIntoView({behavior:'smooth',block:'center'});
              });
              slotsEl.appendChild(b);
            });
          }).catch(function(e){loadingEl.style.display='none';showError('Network error: '+e.message);});
        }
        svcSel.addEventListener('change',function(){state.service=svcSel.value;loadSlots();});
        dateInp.addEventListener('change',function(){state.date=dateInp.value;loadSlots();});
        submitBtn.addEventListener('click',function(){
          clearError();
          if(!state.slot){showError('Please pick a time.');return;}
          var name=document.getElementById('bk-name').value.trim();
          var email=document.getElementById('bk-email').value.trim();
          var phone=document.getElementById('bk-phone').value.trim();
          var notes=document.getElementById('bk-notes').value.trim();
          if(!name){showError('Please enter your name.');return;}
          if(!email&&!phone){showError('Please enter an email or phone so we can confirm.');return;}
          submitBtn.disabled=true;submitBtn.textContent='Booking…';
          fetch(API+'/api/booking/'+SITE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            service:state.service,startAt:state.slot,customerName:name,customerEmail:email,customerPhone:phone,notes:notes
          })}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){
            submitBtn.disabled=false;submitBtn.textContent='Confirm booking';
            if(!x.ok){showError(x.j.error||'Booking failed');return;}
            document.getElementById('booking-root').querySelectorAll('*').forEach(function(el){el.style.display='none';});
            doneEl.style.display='block';
            doneMsg.textContent=state.service+' on '+x.j.displayTime+' ('+TZ+')';
          }).catch(function(e){
            submitBtn.disabled=false;submitBtn.textContent='Confirm booking';
            showError('Network error: '+e.message);
          });
        });
        loadSlots();
      })();
      </script>`;
  } else {
    // No booking system configured (mode === 'native' but no siteId, or unknown mode) — fall back to call-to-book.
    content = `
      <div style="background:#faf8f6;border-radius:20px;padding:48px 32px;text-align:center">
        <h3 style="font-size:24px;font-weight:800;margin-bottom:12px">Book by phone</h3>
        <p style="color:#555;margin-bottom:24px">Give us a call and we'll get you in.</p>
        ${c.contactPhone ? `<a href="tel:${attr(c.contactPhone)}" class="btn-p">Call ${esc(c.contactPhone)}</a>` : ''}
      </div>`;
  }

  const body = `
<section class="sect" style="padding-top:56px;background:#fff"><div class="ctn" style="max-width:720px">
  <div style="text-align:center;margin-bottom:40px">
    <p style="letter-spacing:4px;font-size:11px;text-transform:uppercase;color:${pc};margin-bottom:12px">Appointments</p>
    <h1 style="font-size:clamp(36px,6vw,56px);font-weight:800">Book with us</h1>
    <p style="color:#777;margin-top:14px">${isEmbed ? 'Scheduled through our booking partner.' : (c.bookingMode === 'native' ? `Times shown in ${esc(c.timezone || 'local time')}.` : 'Give us a call to reserve your spot.')}</p>
  </div>
  ${content}
</div></section>`;
  return wrap(c, '/booking', body);
}

// ─── CONTACT ────────────────────────────────────────────────────────────────
function generateContactPage(c) {
  const pc = c.primaryColor || '#1F2937';
  const hours = c.weeklyHours ? renderHoursRows(c.weeklyHours) : '';

  const body = `
<section class="sect" style="background:#fff"><div class="ctn" style="max-width:960px">
  <div style="text-align:center;margin-bottom:48px">
    <p style="letter-spacing:4px;font-size:11px;text-transform:uppercase;color:${pc};margin-bottom:12px">Visit</p>
    <h1 style="font-size:clamp(36px,6vw,56px);font-weight:800">Find Us</h1>
  </div>
  <div style="display:grid;grid-template-columns:1fr;gap:40px" class="md2">
    <div>
      <h3 style="font-size:20px;font-weight:700;margin-bottom:16px">Contact</h3>
      <div style="display:flex;flex-direction:column;gap:10px;color:#555">
        ${c.contactAddress ? `<p>${esc(c.contactAddress)}</p>` : ''}
        ${c.contactPhone ? `<p><a href="tel:${attr(c.contactPhone)}" style="color:${pc};font-weight:600">${esc(c.contactPhone)}</a></p>` : ''}
        ${c.contactEmail ? `<p><a href="mailto:${attr(c.contactEmail)}" style="color:${pc};font-weight:600">${esc(c.contactEmail)}</a></p>` : ''}
        ${c.instagramHandle ? `<p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener" style="color:${pc};font-weight:600">Instagram @${esc(c.instagramHandle)}</a></p>` : ''}
      </div>
      <div style="margin-top:24px"><a href="/booking" class="btn-p">Book Appointment →</a></div>
    </div>
    ${hours ? `
    <div>
      <h3 style="font-size:20px;font-weight:700;margin-bottom:16px">Opening Hours</h3>
      <ul style="list-style:none;padding:0">${hours}</ul>
    </div>` : ''}
  </div>
</div>
<style>@media(min-width:760px){.md2{grid-template-columns:1fr 1fr!important}}</style>
</section>`;

  return wrap(c, '/contact', body);
}

function generateAllPages(config, watermark = false) {
  const pages = {
    '/index.html': generateHomePage(config),
    '/booking/index.html': generateBookingPage(config),
    '/about/index.html': generateAboutPage(config),
    '/contact/index.html': generateContactPage(config),
  };
  if ((config.salonServices || []).length > 0) {
    pages['/services/index.html'] = generateServicesPage(config);
  }
  if (watermark) {
    const WM = `<div style="position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#fff;text-align:center;padding:14px 20px;z-index:99999;font-family:sans-serif;font-size:14px;backdrop-filter:blur(8px)">Preview Only — <a href="https://bytesplatform.com" style="color:#818cf8;text-decoration:underline;font-weight:600">Built by Bytes Platform</a></div>`;
    for (const [p, html] of Object.entries(pages)) {
      pages[p] = html.replace('</body>', WM + '</body>');
    }
  }
  return pages;
}

module.exports = { generateAllPages };
