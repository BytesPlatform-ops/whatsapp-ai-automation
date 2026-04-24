const { env } = require('../../config/env');
const { computeHeroPaletteFromConfig } = require('../heroPalette');
const { renderActivationBanner } = require('../activationBanner');

// Public URL the static salon site uses to reach the booking API.
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE_URL || env.chatbot.baseUrl;

// ─── helpers ────────────────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
const attr = (s) => esc(s).replace(/\n/g, ' ');

const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function renderHoursRows(hours) {
  if (!hours) return '';
  return DAYS.map((d) => {
    const ws = hours[d] || [];
    const value = ws.length === 0 ? 'Closed' : ws.map((w) => `${w.open} – ${w.close}`).join(', ');
    return `<li class="hr"><span class="hr-d">${DAY_LABELS[d]}</span><span class="hr-v">${esc(value)}</span></li>`;
  }).join('');
}

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

function pages(c) {
  const list = [{ n: 'Home', h: '/' }];
  if ((c.salonServices || []).length > 0) list.push({ n: 'Services', h: '/services' });
  list.push({ n: 'Booking', h: '/booking' });
  list.push({ n: 'About', h: '/about' });
  list.push({ n: 'Contact', h: '/contact' });
  return list;
}

// Pad numbers for editorial numbering "01", "02".
const pad2 = (n) => String(n).padStart(2, '0');

// ─── global style ──────────────────────────────────────────────────────────
function getStyles(pc, ac, heroPal) {
  // Default to white-on-dark if no palette is supplied (pre-existing behaviour
  // for non-home pages where the .hero element never renders). On the home
  // page the palette is derived from the Unsplash hero image + primaryColor.
  const hp = heroPal || { isDark: false, fg: '#fff', fgSoft: 'rgba(255,255,255,0.85)', fgMuted: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.3)' };
  // Dark text case (bright hero image): overlay biases toward cream so the
  // title area stays readable even over bright photo patches.
  // White text case (dark hero image): overlay biases dark, with the top stop
  // bumped from 0.25 → 0.40 so a mid-bright title band still has a floor of
  // contrast instead of washing out on a mixed-brightness photo.
  const heroOverlay = hp.isDark
    ? 'linear-gradient(180deg,rgba(246,239,229,0.55) 0%,rgba(246,239,229,0.75) 60%,rgba(246,239,229,0.92) 100%)'
    : 'linear-gradient(180deg,rgba(14,13,12,0.40) 0%,rgba(14,13,12,0.65) 65%,rgba(14,13,12,0.9) 100%)';
  return `
*{box-sizing:border-box;margin:0;padding:0}
:root{--pc:${pc};--ac:${ac};--ink:#0E0D0C;--cream:#F6EFE5;--bone:#FBF6EC;--paper:#FFFBF3;--mute:#8A7F74;--line:#E8DFD2}
html{scroll-behavior:smooth}
body{font-family:'Inter',-apple-system,system-ui,sans-serif;font-weight:400;color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;line-height:1.6}
h1,h2,h3,h4,.display{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;letter-spacing:-0.01em;color:var(--ink)}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
::selection{background:var(--pc);color:#fff}

.ctn{max-width:1280px;margin:0 auto;padding:0 32px}
.ctn-sm{max-width:960px;margin:0 auto;padding:0 32px}
.sect{padding:120px 0}
@media(max-width:720px){.sect{padding:80px 0}.ctn,.ctn-sm{padding:0 22px}}

.eyebrow{font-family:'Inter',sans-serif;font-size:11px;font-weight:500;letter-spacing:0.42em;text-transform:uppercase;color:var(--mute)}
.eyebrow--light{color:${hp.fgSoft}}
.divider{width:44px;height:1px;background:var(--pc);display:inline-block;margin:0 14px;vertical-align:middle}
.divider--light{background:${hp.border}}

.btn{display:inline-flex;align-items:center;gap:10px;padding:15px 30px;border-radius:0;text-decoration:none;font-size:12px;font-weight:500;letter-spacing:0.24em;text-transform:uppercase;transition:all 0.3s cubic-bezier(.2,.7,.2,1);border:1px solid transparent;cursor:pointer;font-family:'Inter',sans-serif}
.btn-p{background:var(--pc);color:#fff;border-color:var(--pc)}
.btn-p:hover{background:transparent;color:var(--pc)}
.btn-w{background:#fff;color:var(--ink);border-color:#fff}
.btn-w:hover{background:transparent;color:#fff}
.btn-g{background:transparent;color:${hp.fg};border-color:${hp.border}}
.btn-g:hover{background:${hp.fg};color:${hp.isDark ? 'var(--bone)' : 'var(--ink)'};border-color:${hp.fg}}
.btn-ink{background:transparent;color:var(--ink);border-color:var(--ink)}
.btn-ink:hover{background:var(--ink);color:#fff}

.arr{width:14px;height:10px;transition:transform 0.3s}
.btn:hover .arr{transform:translateX(4px)}

/* Navigation */
.nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:22px 40px;display:flex;align-items:center;justify-content:space-between;transition:background 0.3s,backdrop-filter 0.3s,border-color 0.3s;border-bottom:1px solid transparent}
.nav.dark{color:#fff}
.nav.scrolled{background:rgba(251,246,236,0.92);backdrop-filter:blur(14px);border-bottom-color:var(--line);color:var(--ink)}
.nav.scrolled .nav-l{color:var(--ink)}
.nav.scrolled .nav-b{color:var(--ink)}
.nav-b{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:500;letter-spacing:0.02em;color:inherit}
.nav-ls{display:flex;align-items:center;gap:34px}
.nav-l{color:inherit;font-size:11px;font-weight:500;letter-spacing:0.24em;text-transform:uppercase;opacity:0.85;transition:opacity 0.2s}
.nav-l:hover,.nav-l.active{opacity:1}
.nav-cta{padding:11px 22px;border:1px solid currentColor;font-size:10.5px;font-weight:500;letter-spacing:0.28em;text-transform:uppercase;transition:background 0.3s,color 0.3s}
.nav-cta:hover{background:currentColor}
.nav-cta:hover span{color:var(--bone)}
.mm-btn{display:none;background:none;border:none;cursor:pointer;padding:6px;color:inherit;font-size:20px}
.mm{position:fixed;inset:0;background:var(--ink);color:#fff;z-index:120;padding:100px 40px 40px;display:flex;flex-direction:column;gap:26px;transform:translateY(-100%);transition:transform 0.5s cubic-bezier(.2,.7,.2,1)}
.mm.open{transform:translateY(0)}
.mm a{font-family:'Cormorant Garamond',serif;font-size:34px;color:#fff;font-weight:500}
.mm-close{position:absolute;top:26px;right:40px;background:none;border:none;color:#fff;font-size:30px;cursor:pointer;line-height:1}
@media(max-width:820px){.nav-ls{display:none}.mm-btn{display:inline-flex}.nav{padding:20px 22px}}

/* Hero */
.hero{position:relative;min-height:100vh;display:flex;align-items:flex-end;color:${hp.fg};overflow:hidden;padding:160px 40px 100px}
.hero h1,.hero h2,.hero h3,.hero h4{color:${hp.fg}}
.hero-bg{position:absolute;inset:0;z-index:-2}
.hero-bg img{width:100%;height:100%;object-fit:cover}
.hero-overlay{position:absolute;inset:0;z-index:-1;background:${heroOverlay}}
.hero-inner{max-width:1280px;margin:0 auto;width:100%;position:relative}
.hero-kicker{display:flex;align-items:center;gap:10px;margin-bottom:26px}
.hero-h1{font-family:'Cormorant Garamond',serif;font-size:clamp(52px,9vw,128px);font-weight:500;line-height:0.96;letter-spacing:-0.03em;margin-bottom:36px;max-width:13ch}
.hero-h1 em{font-style:italic;font-weight:400;color:var(--ac);filter:saturate(0.7) brightness(1.15)}
.hero-tag{font-size:18px;font-weight:300;line-height:1.65;opacity:0.88;max-width:520px;margin-bottom:40px}
.hero-ctas{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:48px}
.hero-meta{display:flex;flex-wrap:wrap;gap:28px;padding-top:28px;border-top:1px solid ${hp.border};max-width:720px}
.hero-meta-item{display:flex;flex-direction:column;gap:4px}
.hero-meta-item .k{font-size:10px;letter-spacing:0.32em;text-transform:uppercase;opacity:0.55;font-weight:500}
.hero-meta-item .v{font-size:15px;font-weight:400;line-height:1.4;max-width:230px}
.hero-scroll{position:absolute;right:40px;bottom:40px;display:flex;flex-direction:column;align-items:center;gap:12px;color:${hp.fgMuted};font-size:10px;letter-spacing:0.3em;text-transform:uppercase}
.hero-scroll::after{content:'';width:1px;height:44px;background:${hp.border};animation:scrollLine 2.4s ease-in-out infinite}
@keyframes scrollLine{0%,100%{transform:scaleY(0.3);transform-origin:top}50%{transform:scaleY(1)}}
@media(max-width:720px){.hero{padding:130px 22px 60px}.hero-scroll{display:none}.hero-meta{gap:18px}}

/* Marquee credit */
.hero-credit{position:absolute;top:20px;right:44px;font-size:10px;color:rgba(255,255,255,0.55);letter-spacing:0.1em;z-index:1}
.hero-credit a{color:rgba(255,255,255,0.8);text-decoration:underline;text-underline-offset:3px}
@media(max-width:820px){.hero-credit{top:auto;bottom:8px;right:12px}}

/* Editorial intro block */
.intro{padding:120px 40px;background:var(--bone)}
.intro-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:60px;align-items:flex-start;max-width:1180px;margin:0 auto}
.intro-label{font-family:'Cormorant Garamond',serif;font-size:22px;font-style:italic;color:var(--mute);line-height:1.5}
.intro-h{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,5.2vw,66px);font-weight:500;letter-spacing:-0.015em;line-height:1.1}
.intro-h em{font-style:italic;color:var(--pc)}
@media(max-width:820px){.intro{padding:80px 22px}.intro-grid{grid-template-columns:1fr;gap:22px}}

/* Signature services section */
.sig-head{display:flex;justify-content:space-between;align-items:flex-end;gap:40px;margin-bottom:70px;flex-wrap:wrap}
.sig-title{font-size:clamp(38px,5vw,62px);font-weight:500;letter-spacing:-0.015em;line-height:1.05;max-width:14ch}
.sig-sub{max-width:420px;font-size:15px;color:var(--mute);line-height:1.7}

.svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:40px 28px}
@media(max-width:960px){.svc-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.svc-grid{grid-template-columns:1fr}}

.svc{position:relative;display:flex;flex-direction:column;cursor:pointer}
.svc-num{font-family:'Cormorant Garamond',serif;font-size:15px;font-weight:500;color:var(--mute);letter-spacing:0.1em;margin-bottom:16px;display:flex;align-items:center;gap:14px}
.svc-num::after{content:'';flex:1;height:1px;background:var(--line)}
.svc-media{position:relative;aspect-ratio:4/5;overflow:hidden;background:linear-gradient(135deg,var(--pc),var(--ac));margin-bottom:22px}
.svc-media img{width:100%;height:100%;object-fit:cover;transition:transform 1s cubic-bezier(.2,.7,.2,1);filter:saturate(0.95)}
.svc:hover .svc-media img{transform:scale(1.04)}
.svc-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Cormorant Garamond',serif;font-size:92px;font-weight:500;opacity:0.9}
.svc-overlay{position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(14,13,12,0.55));opacity:0;transition:opacity 0.5s;display:flex;align-items:flex-end;padding:22px;pointer-events:none}
.svc:hover .svc-overlay{opacity:1}
.svc-cat{position:absolute;top:16px;left:16px;font-size:10px;font-weight:500;letter-spacing:0.3em;text-transform:uppercase;color:#fff;background:rgba(14,13,12,0.4);backdrop-filter:blur(6px);padding:7px 12px;border:1px solid rgba(255,255,255,0.18)}
/* Per-image photographer credit is consolidated into the footer; no overlay on the image. */
.svc-body{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.svc-name{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:500;letter-spacing:-0.01em;line-height:1.15;margin-bottom:6px}
.svc-meta{font-size:12px;color:var(--mute);letter-spacing:0.14em;text-transform:uppercase}
.svc-price{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:500;color:var(--pc);white-space:nowrap;line-height:1}
.svc-book{display:inline-flex;align-items:center;gap:8px;margin-top:14px;font-size:11px;font-weight:500;letter-spacing:0.26em;text-transform:uppercase;color:var(--ink);padding-bottom:3px;border-bottom:1px solid var(--ink);align-self:flex-start;transition:color 0.3s,border-color 0.3s}
.svc-book:hover{color:var(--pc);border-color:var(--pc)}

/* Manifesto / pull quote */
.manifesto{padding:130px 40px;background:var(--ink);color:#fff;text-align:center}
.manifesto-q{font-family:'Cormorant Garamond',serif;font-size:clamp(32px,4.4vw,54px);font-weight:400;font-style:italic;line-height:1.32;letter-spacing:-0.01em;max-width:960px;margin:0 auto 36px}
.manifesto-q::before,.manifesto-q::after{color:var(--ac);font-size:0.8em;opacity:0.8}
.manifesto-q::before{content:'“ '}
.manifesto-q::after{content:' ”'}
.manifesto-attr{font-size:11px;letter-spacing:0.4em;text-transform:uppercase;opacity:0.6}
@media(max-width:720px){.manifesto{padding:80px 22px}}

/* About split */
.about-split{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;max-width:1280px;margin:0 auto;padding:0 40px}
@media(max-width:820px){.about-split{grid-template-columns:1fr;gap:32px;padding:0 22px}}
.about-body p{font-size:17px;font-weight:300;line-height:1.85;color:#3a3530;margin-bottom:20px}

/* Instagram call-out */
.ig{padding:120px 40px;background:var(--cream)}
.ig-inner{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;max-width:1180px;margin:0 auto}
@media(max-width:820px){.ig{padding:80px 22px}.ig-inner{grid-template-columns:1fr;gap:30px}}
.ig-visual{aspect-ratio:1/1;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--pc),var(--ac));display:flex;align-items:center;justify-content:center}
.ig-visual img{width:100%;height:100%;object-fit:cover}
.ig-visual-overlay{position:absolute;inset:0;background:radial-gradient(circle at 70% 30%,rgba(0,0,0,0) 0%,rgba(0,0,0,0.45) 100%)}
.ig-handle{position:absolute;bottom:24px;left:24px;color:#fff;font-family:'Cormorant Garamond',serif;font-size:26px;font-style:italic}

/* Contact / CTA closing */
.close-cta{padding:130px 40px;background:var(--pc);color:#fff;text-align:center;position:relative;overflow:hidden}
.close-cta h2{font-size:clamp(44px,6vw,88px);font-weight:500;letter-spacing:-0.02em;line-height:1.02;margin-bottom:28px;color:#fff}
.close-cta p{font-size:18px;max-width:520px;margin:0 auto 44px;opacity:0.9;font-weight:300;line-height:1.6}

/* Footer */
.foot{background:var(--ink);color:#beb3a6;padding:90px 40px 36px}
.foot-inner{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:56px;padding-bottom:60px;border-bottom:1px solid rgba(255,255,255,0.08)}
@media(max-width:820px){.foot{padding:60px 22px 30px}.foot-inner{grid-template-columns:1fr 1fr;gap:36px}}
.foot-brand{font-family:'Cormorant Garamond',serif;font-size:36px;color:#fff;font-weight:500;letter-spacing:0.01em;margin-bottom:16px}
.foot-tag{font-size:14px;line-height:1.75;max-width:320px;color:#8a8179;font-weight:300}
.foot h4{font-family:'Inter',sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#fff;font-weight:500;margin-bottom:18px}
.foot a{display:block;padding:5px 0;font-size:14px;color:#beb3a6;transition:color 0.2s;font-weight:300}
.foot a:hover{color:#fff}
.foot-credits{max-width:1280px;margin:26px auto 0;padding:20px 0;font-size:11px;color:#6d655d;letter-spacing:0.08em;line-height:1.8;display:flex;flex-wrap:wrap;gap:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06)}
.foot-credits a{display:inline;padding:0;color:#8a8179;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(255,255,255,0.15)}
.foot-credits a:hover{color:#fff;text-decoration-color:#fff}
.foot-credits .sep{opacity:0.4}
.foot-bottom{max-width:1280px;margin:22px auto 0;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6d655d;letter-spacing:0.06em;flex-wrap:wrap;gap:12px}

/* Page headers (Services / About / etc) */
.page-head{padding:160px 40px 80px;background:var(--bone)}
.page-head-inner{max-width:1280px;margin:0 auto}
.page-head h1{font-family:'Cormorant Garamond',serif;font-size:clamp(56px,9vw,140px);font-weight:500;line-height:0.98;letter-spacing:-0.03em;margin-top:22px}
.page-head h1 em{font-style:italic;color:var(--pc)}
@media(max-width:820px){.page-head{padding:120px 22px 60px}}

/* Contact two-col */
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;max-width:1280px;margin:0 auto;padding:0 40px}
@media(max-width:820px){.contact-grid{grid-template-columns:1fr;gap:40px;padding:0 22px}}
.contact-block h3{font-family:'Cormorant Garamond',serif;font-size:32px;margin-bottom:20px;font-weight:500}
.contact-block p,.contact-block a{font-size:15px;line-height:1.8;color:#4a4540;display:block;padding:4px 0;font-weight:300}
.contact-block a:hover{color:var(--pc)}
.hr{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--line);font-weight:300}
.hr:last-child{border-bottom:none}
.hr-d{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--ink);font-weight:500}
.hr-v{font-size:13px;color:var(--mute);letter-spacing:0.08em}

/* Booking form */
.bk-wrap{max-width:700px;margin:0 auto;padding:0 32px}
.bk-note{text-align:center;color:var(--mute);margin-bottom:40px;font-size:14px;font-weight:300}
.bk-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
@media(max-width:560px){.bk-row{grid-template-columns:1fr}}
.bk-input,.bk-select{width:100%;padding:16px 18px;border:1px solid var(--line);background:var(--paper);font-family:'Inter',sans-serif;font-size:15px;color:var(--ink);transition:border-color 0.2s}
.bk-input:focus,.bk-select:focus{outline:none;border-color:var(--pc)}
.bk-label{font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:var(--mute);margin-bottom:10px;display:block;font-weight:500}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:8px;margin-bottom:36px}
.slot{padding:14px 0;text-align:center;background:var(--paper);border:1px solid var(--line);font-family:'Cormorant Garamond',serif;font-size:17px;cursor:pointer;transition:all 0.2s;font-weight:500}
.slot:hover{border-color:var(--pc);color:var(--pc)}
.slot.selected{background:var(--ink);color:#fff;border-color:var(--ink)}
.bk-panel{padding:32px;background:var(--bone);border:1px solid var(--line);margin-top:24px}
.bk-panel-title{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:500;margin-bottom:18px}
.bk-submit{width:100%;margin-top:20px;padding:18px;background:var(--ink);color:#fff;border:none;font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;cursor:pointer;transition:background 0.3s}
.bk-submit:hover{background:var(--pc)}
.bk-submit[disabled]{opacity:0.5;cursor:not-allowed}
.error{padding:14px 18px;background:#f8eded;color:#6d1a1a;font-size:13px;margin-bottom:18px;border-left:3px solid #a33}
.success{padding:54px 32px;background:var(--bone);border:1px solid var(--line);text-align:center}
.success h3{font-family:'Cormorant Garamond',serif;font-size:40px;margin-bottom:14px}

/* Reveal animation */
.rv{opacity:0;transform:translateY(26px);transition:opacity 0.9s cubic-bezier(.2,.7,.2,1),transform 0.9s cubic-bezier(.2,.7,.2,1)}
.rv.in{opacity:1;transform:none}
.rv.d1{transition-delay:0.08s}.rv.d2{transition-delay:0.16s}.rv.d3{transition-delay:0.24s}.rv.d4{transition-delay:0.32s}.rv.d5{transition-delay:0.4s}.rv.d6{transition-delay:0.48s}
`;
}

function getScript() {
  return `<script>
(function(){
  var nav=document.querySelector('.nav');
  var sentinel=document.querySelector('.hero,.page-head');
  function onScroll(){
    if(!nav)return;
    var scrolled=window.scrollY>60;
    nav.classList.toggle('scrolled',scrolled);
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();

  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
  },{threshold:0.14,rootMargin:'0px 0px -60px 0px'});
  document.querySelectorAll('.rv').forEach(function(el){io.observe(el);});

  var mmBtn=document.querySelector('.mm-btn');
  var mm=document.querySelector('.mm');
  var mmClose=document.querySelector('.mm-close');
  if(mmBtn&&mm){mmBtn.addEventListener('click',function(){mm.classList.add('open')});}
  if(mmClose&&mm){mmClose.addEventListener('click',function(){mm.classList.remove('open')});}
  if(mm){mm.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){mm.classList.remove('open')});});}
})();
</script>`;
}

// ─── nav / footer ──────────────────────────────────────────────────────────
function getNav(c, cur, opts = {}) {
  const ps = pages(c);
  const dark = opts.dark ? ' dark' : '';
  return `
<nav class="nav${dark}">
  <a href="/" class="nav-b">${c.logoUrl
    ? `<img src="${attr(c.logoUrl)}" alt="${attr(c.businessName || '')}" style="height:56px;max-height:56px;width:auto;display:inline-block;vertical-align:middle;object-fit:contain">`
    : esc(c.businessName)}</a>
  <div class="nav-ls">
    ${ps.map((p) => `<a href="${p.h}" class="nav-l${p.h === cur ? ' active' : ''}">${p.n}</a>`).join('')}
    <a href="/booking" class="nav-cta"><span>Reserve</span></a>
  </div>
  <button class="mm-btn" aria-label="Menu">Menu</button>
</nav>
<div class="mm"><button class="mm-close" aria-label="Close">×</button>
  ${ps.map((p) => `<a href="${p.h}">${p.n}</a>`).join('')}
  <a href="/booking">Reserve</a>
</div>`;
}

function getFooter(c) {
  const ps = pages(c);
  return `
<footer class="foot">
  <div class="foot-inner">
    <div>
      <p class="foot-brand">${esc(c.businessName)}</p>
      <p class="foot-tag">${esc(c.footerTagline || c.tagline || '')}</p>
    </div>
    <div>
      <h4>Visit</h4>
      ${ps.map((p) => `<a href="${p.h}">${p.n}</a>`).join('')}
    </div>
    <div>
      <h4>Contact</h4>
      ${c.contactPhone ? `<a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a>` : ''}
      ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a>` : ''}
      ${c.contactAddress ? `<p style="font-size:14px;line-height:1.75;font-weight:300;padding-top:6px">${esc(c.contactAddress)}</p>` : ''}
    </div>
    <div>
      <h4>Follow</h4>
      ${c.instagramHandle ? `<a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">Instagram</a>` : ''}
      <a href="/booking">Book a visit</a>
    </div>
  </div>
  <div class="foot-bottom">
    <span>© ${new Date().getFullYear()} ${esc(c.businessName)} — All rights reserved.</span>
    <span>Handcrafted in ${esc((c.contactAddress || '').split(',').pop() || 'the studio')}</span>
  </div>
</footer>`;
}

// ─── shared service card ───────────────────────────────────────────────────
function renderServiceCard(s, index) {
  const cat = categoryOf(s.name);
  const initial = String(s.name || '?').trim().charAt(0).toUpperCase();
  const hasImg = !!(s.image && s.image.url);
  const num = pad2(index + 1);
  const media = hasImg
    ? `<div class="svc-media">
         <img src="${attr(s.image.url)}" alt="${attr(s.name)}" loading="lazy">
         <span class="svc-cat">${esc(cat)}</span>
         <div class="svc-overlay"></div>
       </div>`
    : `<div class="svc-media">
         <div class="svc-fallback">${esc(initial)}</div>
         <span class="svc-cat">${esc(cat)}</span>
         <div class="svc-overlay"></div>
       </div>`;
  const dur = s.durationMinutes ? `${s.durationMinutes} min` : '';
  return `
  <a href="/booking" class="svc rv">
    <span class="svc-num">${num}<span class="sr-only"> —</span></span>
    ${media}
    <div class="svc-body">
      <div>
        <h3 class="svc-name">${esc(s.name)}</h3>
        <p class="svc-meta">${esc(dur)}</p>
      </div>
      <span class="svc-price">${esc(s.priceText || '—')}</span>
    </div>
    <span class="svc-book">Reserve <svg class="arr" viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></span>
  </a>`;
}

// ─── PAGE SHELL ────────────────────────────────────────────────────────────
function wrap(c, cur, body, { navDark = false, heroPal = null } = {}) {
  const pc = c.primaryColor || '#1F2937';
  const ac = c.accentColor || '#EC4899';
  const title = cur === '/' ? esc(c.businessName) : `${esc(c.businessName)} — ${cur.replace('/', '').replace(/^\w/, (x) => x.toUpperCase())}`;
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${attr(c.tagline || '')}">
<link rel="icon" type="image/png" href="${attr(c.logoUrl || 'https://pixiebot.co/pixie-logo.png')}">
<link rel="apple-touch-icon" href="${attr(c.logoUrl || 'https://pixiebot.co/pixie-logo.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${getStyles(pc, ac, heroPal)}</style>
</head><body>${renderActivationBanner(c)}${getNav(c, cur, { dark: navDark })}<main>${body}</main>${getFooter(c)}${getScript()}</body></html>`;
}

// ─── HOME ──────────────────────────────────────────────────────────────────
function generateHomePage(c) {
  const hasHero = !!(c.heroImage && c.heroImage.url);
  // Decide hero text palette from the Unsplash image's dominant colour
  // blended with primaryColor. On a bright image we render dark text + a
  // cream-tinted overlay; on a dark/medium image we keep white text with a
  // stronger dark overlay. Nav-over-hero mirrors the same decision.
  const heroPal = computeHeroPaletteFromConfig(c);
  const heroImg = hasHero
    ? `<div class="hero-bg"><img src="${attr(c.heroImage.url)}" alt=""></div>`
    : `<div class="hero-bg" style="background:linear-gradient(135deg,var(--pc),var(--ac))"></div>`;
  // Hero credit is consolidated into the footer along with service-image credits.
  const credit = '';

  const featured = (c.salonServices || []).slice(0, 6);
  const featuredCards = featured.map((s, i) => renderServiceCard(s, i)).join('');

  // Pull a plausible pull-quote from the about text.
  const quote = (c.aboutText || '')
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 180)[0]
    || 'Every appointment is a chance to make someone feel a little more themselves.';

  const igPhoto = (c.salonServices || []).find((s) => s.image)?.image;

  const body = `
<section class="hero">
  ${heroImg}
  <div class="hero-overlay"></div>
  ${credit}
  <div class="hero-inner">
    <div class="hero-kicker">
      <span class="divider divider--light"></span>
      <span class="eyebrow eyebrow--light">${esc(c.industry || 'Atelier & Salon')}</span>
    </div>
    <h1 class="hero-h1 rv">${esc(c.headline)}</h1>
    <p class="hero-tag rv d1">${esc(c.tagline)}</p>
    <div class="hero-ctas rv d2">
      <a href="/booking" class="btn btn-w">Reserve a Visit <svg class="arr" viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
      ${(c.salonServices || []).length > 0 ? `<a href="/services" class="btn btn-g">The Menu</a>` : ''}
    </div>
    <div class="hero-meta rv d3">
      <div class="hero-meta-item"><span class="k">Reservations</span><span class="v">Online in under a minute</span></div>
      <div class="hero-meta-item"><span class="k">Cancellation</span><span class="v">Free up to 24h before</span></div>
      ${c.contactAddress ? `<div class="hero-meta-item"><span class="k">Address</span><span class="v">${esc(c.contactAddress)}</span></div>` : ''}
      ${c.contactPhone ? `<div class="hero-meta-item"><span class="k">Call us</span><span class="v">${esc(c.contactPhone)}</span></div>` : ''}
    </div>
  </div>
  <div class="hero-scroll">Scroll</div>
</section>

<section class="intro">
  <div class="intro-grid">
    <p class="intro-label rv">— ${esc(c.aboutTitle || 'A salon with intent')}.</p>
    <h2 class="intro-h rv d1">${esc((c.aboutText || '').split(/[.!?]/)[0] || c.tagline || '')}.</h2>
  </div>
</section>

${featured.length > 0 ? `
<section class="sect" style="background:var(--paper)"><div class="ctn">
  <div class="sig-head rv">
    <div>
      <p class="eyebrow" style="margin-bottom:18px">— Signature Services —</p>
      <h2 class="sig-title">${esc(c.servicesTitle || 'The treatments we are known for')}</h2>
    </div>
    <p class="sig-sub">A curated list of the treatments our regulars return for. Every appointment is handled by a senior stylist — no shortcuts.</p>
  </div>
  <div class="svc-grid">${featuredCards}</div>
  ${(c.salonServices || []).length > featured.length ? `<div style="text-align:center;margin-top:80px"><a href="/services" class="btn btn-ink">The Full Menu <svg class="arr" viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a></div>` : ''}
</div></section>` : ''}

<section class="manifesto">
  <p class="manifesto-q rv">${esc(quote)}</p>
  <p class="manifesto-attr rv d1"><span class="divider divider--light"></span> ${esc(c.businessName)} <span class="divider divider--light"></span></p>
</section>

${c.instagramHandle ? `
<section class="ig">
  <div class="ig-inner">
    <div class="ig-visual rv">
      ${igPhoto ? `<img src="${attr(igPhoto.url)}" alt="${attr(c.businessName)} on Instagram">` : ''}
      <div class="ig-visual-overlay"></div>
      <p class="ig-handle">@${esc(c.instagramHandle)}</p>
    </div>
    <div class="rv d1">
      <p class="eyebrow" style="margin-bottom:18px">— In the chair —</p>
      <h2 style="font-size:clamp(36px,4.6vw,58px);font-weight:500;line-height:1.08;letter-spacing:-0.015em;margin-bottom:24px">Follow along for our latest work.</h2>
      <p style="font-size:16px;color:var(--mute);line-height:1.8;font-weight:300;margin-bottom:28px;max-width:440px">Fresh transformations, styling notes, and the occasional behind-the-chair moment. No filters required.</p>
      <a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener" class="btn btn-ink">Follow @${esc(c.instagramHandle)} <svg class="arr" viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
    </div>
  </div>
</section>` : ''}

<section class="close-cta">
  <p class="eyebrow eyebrow--light rv" style="margin-bottom:22px">— Appointments now open —</p>
  <h2 class="rv d1">${esc(c.ctaTitle || 'Make it your next ritual.')}</h2>
  <p class="rv d2">${esc(c.ctaText || 'Reserve a time in under a minute. We will confirm by email and send a reminder the day before.')}</p>
  <a href="/booking" class="btn btn-w rv d3">Reserve a Visit <svg class="arr" viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
</section>`;

  // navDark=true paints the nav white for dark-hero pages. When the palette
  // flips to dark-text (bright image), the nav needs to stay on its default
  // ink palette so the links remain readable over the cream-tinted overlay.
  return wrap(c, '/', body, { navDark: !heroPal.isDark, heroPal });
}

// ─── SERVICES ───────────────────────────────────────────────────────────────
function generateServicesPage(c) {
  const svcs = c.salonServices || [];
  const cards = svcs.map((s, i) => renderServiceCard(s, i)).join('');

  const body = `
<section class="page-head">
  <div class="page-head-inner">
    <p class="eyebrow rv">— The Menu —</p>
    <h1 class="rv d1">${esc(c.servicesTitle || 'Services')}<em>.</em></h1>
    <p class="rv d2" style="max-width:560px;margin-top:32px;color:var(--mute);font-size:17px;line-height:1.75;font-weight:300">Every treatment below is handled by a trained stylist. Reserve one online, or give us a call — we are happy to help you pick the right one.</p>
  </div>
</section>

<section style="padding:90px 0 120px;background:var(--paper)"><div class="ctn">
  ${svcs.length > 0
    ? `<div class="svc-grid">${cards}</div>`
    : '<p style="text-align:center;color:var(--mute);padding:60px 0">Menu coming soon — give us a call to book.</p>'}
  <div style="text-align:center;margin-top:90px"><a href="/booking" class="btn btn-p">Reserve a Visit <svg class="arr" viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a></div>
</div></section>`;

  return wrap(c, '/services', body);
}

// ─── ABOUT ──────────────────────────────────────────────────────────────────
function generateAboutPage(c) {
  const paras = String(c.aboutText || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sentences = String(c.aboutText || '').split(/[.!?]/).map((s) => s.trim()).filter((s) => s.length > 40 && s.length < 200);
  const pullQuote = sentences[Math.floor(sentences.length / 2)] || sentences[0] || 'We believe a salon should feel like a retreat, not a rush.';

  const bodyParas = (paras.length ? paras : [c.aboutText]).map((p, i) => `<p class="rv d${Math.min(i + 1, 5)}">${esc(p)}</p>`).join('');

  const imgForSide = (c.salonServices || []).find((s) => s.image)?.image || c.heroImage;

  const body = `
<section class="page-head">
  <div class="page-head-inner">
    <p class="eyebrow rv">— Our Story —</p>
    <h1 class="rv d1">${esc(c.aboutTitle || 'About')}<em>.</em></h1>
  </div>
</section>

<section style="padding:90px 0 110px;background:var(--paper)">
  <div class="about-split">
    <div class="rv">
      ${imgForSide ? `<div style="aspect-ratio:4/5;overflow:hidden;background:linear-gradient(135deg,var(--pc),var(--ac))"><img src="${attr(imgForSide.url)}" alt="${attr(c.businessName)}" style="width:100%;height:100%;object-fit:cover"></div>` : `<div style="aspect-ratio:4/5;background:linear-gradient(135deg,var(--pc),var(--ac))"></div>`}
    </div>
    <div class="about-body">
      ${bodyParas}
      ${c.instagramHandle ? `<p style="margin-top:34px"><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener" class="btn btn-ink" style="margin-top:12px">Follow @${esc(c.instagramHandle)}</a></p>` : ''}
    </div>
  </div>
</section>

<section class="manifesto">
  <p class="manifesto-q rv">${esc(pullQuote)}</p>
  <p class="manifesto-attr rv d1"><span class="divider divider--light"></span> ${esc(c.businessName)} <span class="divider divider--light"></span></p>
</section>

<section class="close-cta">
  <p class="eyebrow eyebrow--light rv" style="margin-bottom:22px">— Reservations —</p>
  <h2 class="rv d1">Come and see for yourself.</h2>
  <p class="rv d2">Book a treatment online, or call us if you would rather chat it through first.</p>
  <a href="/booking" class="btn btn-w rv d3">Reserve a Visit</a>
</section>`;

  return wrap(c, '/about', body);
}

// ─── BOOKING ────────────────────────────────────────────────────────────────
function generateBookingPage(c) {
  const isEmbed = c.bookingMode === 'embed' && c.bookingUrl;

  let content;
  if (isEmbed) {
    content = `
      <div class="bk-wrap">
        <p class="bk-note">Reservations are handled by our booking partner.</p>
        <div style="background:var(--bone);padding:12px;border:1px solid var(--line)">
          <iframe src="${attr(c.bookingUrl)}" style="width:100%;height:780px;border:none;background:var(--paper)" title="Booking"></iframe>
        </div>
        <p style="text-align:center;margin-top:26px"><a href="${attr(c.bookingUrl)}" target="_blank" rel="noopener" class="btn btn-ink">Open in a new tab</a></p>
      </div>`;
  } else if (c.bookingMode === 'native' && c.siteId) {
    const servicesJson = JSON.stringify(c.salonServices || []).replace(/</g, '\\u003c');
    const siteIdJson = JSON.stringify(c.siteId);
    const apiJson = JSON.stringify(PUBLIC_API_BASE);
    const tzJson = JSON.stringify(c.timezone || 'Europe/Dublin');
    content = `
      <div class="bk-wrap" id="booking-root">
        <div id="bk-error" class="error" style="display:none"></div>

        <div class="bk-row">
          <div>
            <label class="bk-label">Treatment</label>
            <select id="bk-service" class="bk-select"></select>
          </div>
          <div>
            <label class="bk-label">Date</label>
            <input id="bk-date" type="date" class="bk-input" />
          </div>
        </div>

        <label class="bk-label">Available Times</label>
        <p id="bk-loading" class="bk-note" style="display:none;margin:0 0 18px;text-align:left">Loading times…</p>
        <div id="bk-slots" class="slots"></div>

        <div id="bk-form" style="display:none">
          <div class="bk-panel">
            <p class="bk-panel-title">Your Details</p>
            <div style="display:grid;gap:12px">
              <input id="bk-name" class="bk-input" placeholder="Full name" />
              <input id="bk-email" class="bk-input" type="email" placeholder="Email" />
              <input id="bk-phone" class="bk-input" placeholder="Phone number" />
              <textarea id="bk-notes" class="bk-input" placeholder="Anything we should know? (optional)" style="min-height:80px;resize:vertical;font-family:inherit"></textarea>
              <button id="bk-submit" class="bk-submit" type="button">Confirm Reservation</button>
            </div>
            <p class="bk-note" style="margin:20px 0 0">A confirmation email with a cancellation link will arrive shortly after.</p>
          </div>
        </div>

        <div id="bk-done" class="success" style="display:none">
          <p class="eyebrow" style="margin-bottom:14px">— Reserved —</p>
          <h3>Thank you.</h3>
          <p id="bk-done-msg" style="color:#4a4540;margin-top:8px"></p>
          <p style="color:var(--mute);font-size:13px;margin-top:22px">Your confirmation email is on its way.</p>
        </div>
      </div>

      <script>
      (function(){
        var API=${apiJson};
        var SITE=${siteIdJson};
        var SERVICES=${servicesJson};
        var TZ=${tzJson};
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
            if(!x.ok){showError(x.j.error||'Could not load times');return;}
            var slots=x.j.slots||[];
            if(slots.length===0){slotsEl.innerHTML='<p style="grid-column:1/-1;color:var(--mute);padding:18px 0;text-align:center">No times available this day.</p>';return;}
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
          if(!email&&!phone){showError('Please share an email or phone so we can confirm.');return;}
          submitBtn.disabled=true;submitBtn.textContent='Booking…';
          fetch(API+'/api/booking/'+SITE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            service:state.service,startAt:state.slot,customerName:name,customerEmail:email,customerPhone:phone,notes:notes
          })}).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(x){
            submitBtn.disabled=false;submitBtn.textContent='Confirm Reservation';
            if(!x.ok){showError(x.j.error||'Booking failed');return;}
            // Redirect to standalone thank-you page. Booking details travel
            // via query string so the page can render a rich summary without
            // needing a server round-trip. Inline success card stays as a
            // fallback in case navigation is blocked.
            var q=new URLSearchParams({
              svc:state.service,
              time:x.j.displayTime||'',
              tz:TZ,
              name:name,
              email:email
            }).toString();
            window.location.href='/thank-you/?'+q;
          }).catch(function(e){
            submitBtn.disabled=false;submitBtn.textContent='Confirm Reservation';
            showError('Network error: '+e.message);
          });
        });
        loadSlots();
      })();
      </script>`;
  } else {
    content = `
      <div class="bk-wrap">
        <div class="success">
          <p class="eyebrow" style="margin-bottom:14px">— Reservations —</p>
          <h3>Book by phone</h3>
          <p style="color:#4a4540;margin:10px 0 30px">Give us a call and we will get you in.</p>
          ${c.contactPhone ? `<a href="tel:${attr(c.contactPhone)}" class="btn btn-p">Call ${esc(c.contactPhone)}</a>` : ''}
        </div>
      </div>`;
  }

  const body = `
<section class="page-head">
  <div class="page-head-inner">
    <p class="eyebrow rv">— Reservations —</p>
    <h1 class="rv d1">Reserve a visit<em>.</em></h1>
    <p class="rv d2" style="max-width:560px;margin-top:32px;color:var(--mute);font-size:17px;line-height:1.75;font-weight:300">${isEmbed ? 'Managed by our booking partner.' : (c.bookingMode === 'native' ? `Times shown in ${esc(c.timezone || 'local time')}. Free cancellation up to 24 hours before your visit.` : 'Give us a call to reserve your spot.')}</p>
  </div>
</section>

<section style="padding:60px 0 120px;background:var(--paper)">
  ${content}
</section>`;
  return wrap(c, '/booking', body);
}

// ─── CONTACT ────────────────────────────────────────────────────────────────
function generateContactPage(c) {
  const hours = c.weeklyHours ? renderHoursRows(c.weeklyHours) : '';
  const formAction = PUBLIC_API_BASE && c.siteId
    ? `${PUBLIC_API_BASE}/public/leads/${c.siteId}`
    : '/thank-you/';

  const body = `
<section class="page-head">
  <div class="page-head-inner">
    <p class="eyebrow rv">— Visit —</p>
    <h1 class="rv d1">Find us<em>.</em></h1>
  </div>
</section>

<section style="padding:90px 0 110px;background:var(--paper)">
  <div class="contact-grid">
    <div class="contact-block rv">
      <h3>In person</h3>
      ${c.contactAddress ? `<p>${esc(c.contactAddress)}</p>` : ''}
      ${c.contactPhone ? `<a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a>` : ''}
      ${c.contactEmail ? `<a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a>` : ''}
      ${c.instagramHandle ? `<a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">Instagram — @${esc(c.instagramHandle)}</a>` : ''}
      <div style="margin-top:34px"><a href="/booking" class="btn btn-ink">Reserve a Visit</a></div>
    </div>
    ${hours ? `
    <div class="contact-block rv d1">
      <h3>Opening hours</h3>
      <ul style="list-style:none;padding:0;margin-top:10px">${hours}</ul>
      <p class="bk-note" style="margin-top:24px;text-align:left">Last booking 30 min before close.</p>
    </div>` : ''}
  </div>
</section>

<section style="padding:20px 0 130px;background:var(--paper)">
  <div class="bk-wrap rv">
    <div style="text-align:center;margin-bottom:40px">
      <p class="eyebrow" style="margin-bottom:14px">— Write to us —</p>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:44px;font-weight:500;letter-spacing:-0.01em;color:var(--ink);margin:0">Send a note<em style="color:var(--pc);font-style:normal">.</em></h2>
      <p class="bk-note" style="margin-top:14px;max-width:440px;margin-left:auto;margin-right:auto">For questions, private events, or a service you can&rsquo;t find &mdash; we&rsquo;ll write back shortly.</p>
    </div>

    <form name="contact" method="POST" action="${attr(formAction)}" data-pixie-form="1" data-thank-you="/contact/?sent=1" onsubmit="event.preventDefault();var f=this;var b=f.querySelector('.bk-submit');var s=f.querySelector('.bk-status');b.disabled=true;b.innerText='Sending...';fetch(f.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams(new FormData(f)).toString()}).then(function(r){return r.json().catch(function(){return{}})}).then(function(j){if(j&&j.ok===false){throw new Error(j.error||'send-failed')}s.className='success';s.innerHTML='<h3>Message received<em style=&quot;color:var(--pc);font-style:normal&quot;>.</em></h3><p style=&quot;color:var(--mute);font-weight:300;margin-top:4px&quot;>We&rsquo;ll be in touch soon.</p>';f.reset();f.style.display='none'}).catch(function(){b.disabled=false;b.innerText='Send message';s.className='error';s.innerText='Something went wrong &mdash; please try again or email us directly.'})">
      <input type="hidden" name="form_name" value="contact">
      <input type="hidden" name="source_page" value="/contact">
      <input type="hidden" name="_honey" value="" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none">

      <div class="bk-status" role="status" aria-live="polite"></div>

      <div class="bk-row">
        <div>
          <label class="bk-label" for="contact-first">First name</label>
          <input id="contact-first" class="bk-input" type="text" name="first-name" required placeholder="Jane">
        </div>
        <div>
          <label class="bk-label" for="contact-last">Last name</label>
          <input id="contact-last" class="bk-input" type="text" name="last-name" placeholder="Doe">
        </div>
      </div>
      <div class="bk-row">
        <div>
          <label class="bk-label" for="contact-email">Email</label>
          <input id="contact-email" class="bk-input" type="email" name="email" required placeholder="you@email.com">
        </div>
        <div>
          <label class="bk-label" for="contact-phone">Phone <span style="text-transform:none;letter-spacing:0;opacity:0.55">(optional)</span></label>
          <input id="contact-phone" class="bk-input" type="tel" name="phone" placeholder="+1 (555) 123-4567">
        </div>
      </div>
      <div style="margin-bottom:28px">
        <label class="bk-label" for="contact-message">Message</label>
        <textarea id="contact-message" class="bk-input" name="message" required placeholder="Tell us what you&rsquo;re looking for&hellip;" style="min-height:140px;resize:vertical;font-family:inherit"></textarea>
      </div>
      <button type="submit" class="bk-submit">Send message</button>
    </form>
  </div>
</section>

<section class="close-cta">
  <p class="eyebrow eyebrow--light rv" style="margin-bottom:22px">— See you soon —</p>
  <h2 class="rv d1">A warm welcome awaits.</h2>
  <a href="/booking" class="btn btn-w rv d2" style="margin-top:20px">Reserve a Visit</a>
</section>`;

  return wrap(c, '/contact', body);
}

// ─── THANK-YOU ──────────────────────────────────────────────────────────────
// Shown after a successful booking. Booking details arrive as query-string
// params from the booking page's submit handler, so this page is fully
// static and doesn't need a round-trip. Query params are the only dynamic
// layer — no server call, no secrets. If the user lands here directly
// (typed URL, shared link), a generic fallback copy renders instead.
function generateThankYouPage(c) {
  // Compact, above-the-fold layout. Avoids the .page-head hero style used
  // on other pages — that clamps H1 at 140px which turns "Thank you, <long
  // name>" into a screen-filling monolith. Here everything lives in one
  // centered column: greeting → summary card → email note → CTAs.
  const body = `
<section class="ty-hero">
  <div class="ty-shell rv">
    <p class="eyebrow">— Reserved —</p>
    <h1 class="ty-title">Thank you<em>.</em></h1>
    <p id="ty-greet" class="ty-greet">Your reservation is confirmed. We look forward to seeing you.</p>

    <div id="ty-card" class="ty-card" style="display:none">
      <div class="ty-row">
        <span class="ty-key">Treatment</span>
        <span id="ty-svc" class="ty-val"></span>
      </div>
      <div class="ty-row">
        <span class="ty-key">When</span>
        <span id="ty-time" class="ty-val"></span>
      </div>
      <div class="ty-row" id="ty-tz-row" style="display:none">
        <span class="ty-key">Timezone</span>
        <span id="ty-tz" class="ty-val ty-val-sm"></span>
      </div>
    </div>

    <p id="ty-email" class="ty-note" style="display:none">
      A confirmation email with a cancellation link is on its way to <strong id="ty-email-value"></strong>. Check your inbox (and spam, just in case).
    </p>
    <p id="ty-email-fallback" class="ty-note">
      A confirmation email with a cancellation link is on its way. Check your inbox (and spam).
    </p>

    <div class="ty-cta">
      <a href="/" class="btn btn-ink">Back to Home</a>
      <a href="/booking" class="btn btn-p">Book Another Visit</a>
    </div>
  </div>
</section>

<style>
  .ty-hero{padding:120px 24px 90px;background:var(--bone);min-height:calc(100vh - 180px);display:flex;align-items:center;justify-content:center}
  .ty-shell{max-width:560px;width:100%;text-align:center}
  .ty-shell .eyebrow{margin-bottom:18px}
  .ty-title{font-family:'Cormorant Garamond',serif;font-size:clamp(44px,6.5vw,84px);font-weight:500;letter-spacing:-0.02em;line-height:1.02;margin:0;color:var(--ink)}
  .ty-title em{font-style:normal;color:var(--pc)}
  .ty-greet{margin:22px auto 0;max-width:460px;color:var(--mute);font-size:16px;line-height:1.7;font-weight:300}
  .ty-card{margin:40px auto 0;max-width:440px;background:var(--paper);border:1px solid var(--line);padding:24px 28px;text-align:left}
  .ty-row{display:flex;justify-content:space-between;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line);gap:18px}
  .ty-row:first-child{padding-top:4px}
  .ty-row:last-child{border-bottom:none;padding-bottom:4px}
  .ty-key{font-family:'Inter',sans-serif;font-size:10px;font-weight:500;letter-spacing:0.3em;text-transform:uppercase;color:var(--mute);flex-shrink:0}
  .ty-val{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:500;color:var(--ink);text-align:right}
  .ty-val-sm{font-size:14px;font-family:'Inter',sans-serif;font-weight:400;color:var(--mute);letter-spacing:0.04em}
  .ty-note{margin:28px auto 0;max-width:460px;color:var(--mute);font-size:13.5px;line-height:1.65;font-weight:300}
  .ty-note strong{color:var(--ink);font-weight:500}
  .ty-cta{display:flex;gap:12px;justify-content:center;margin-top:34px;flex-wrap:wrap}
  @media(max-width:640px){
    .ty-hero{padding:90px 18px 60px;min-height:calc(100vh - 140px)}
    .ty-card{padding:18px 20px}
    .ty-val{font-size:17px}
  }
</style>

<script>
(function(){
  var q=new URLSearchParams(window.location.search);
  function decode(s){try{return decodeURIComponent(s||'').trim()}catch(e){return (s||'').trim()}}
  var svc=decode(q.get('svc')), time=decode(q.get('time')), tz=decode(q.get('tz')), name=decode(q.get('name')), email=decode(q.get('email'));
  function esc(s){return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/&/g,'&amp;')}
  if(name){
    var first=name.split(/\\s+/)[0];
    document.getElementById('ty-greet').innerHTML='Hi '+esc(first)+', your reservation is confirmed. We look forward to seeing you.';
  }
  if(svc && time){
    document.getElementById('ty-svc').textContent=svc;
    document.getElementById('ty-time').textContent=time;
    if(tz){
      document.getElementById('ty-tz').textContent=tz;
      document.getElementById('ty-tz-row').style.display='flex';
    }
    document.getElementById('ty-card').style.display='block';
  }
  if(email){
    document.getElementById('ty-email-value').textContent=email;
    document.getElementById('ty-email').style.display='block';
    document.getElementById('ty-email-fallback').style.display='none';
  }
})();
</script>`;

  return wrap(c, '/thank-you', body);
}

// ─── deployer entry ────────────────────────────────────────────────────────
function generateAllPages(config, watermark = false) {
  const pages = {
    '/index.html': generateHomePage(config),
    '/booking/index.html': generateBookingPage(config),
    '/about/index.html': generateAboutPage(config),
    '/contact/index.html': generateContactPage(config),
    '/thank-you/index.html': generateThankYouPage(config),
  };
  if ((config.salonServices || []).length > 0) {
    pages['/services/index.html'] = generateServicesPage(config);
  }
  if (watermark) {
    const WM = `<div style="position:fixed;bottom:0;left:0;right:0;background:rgba(14,13,12,0.94);color:#fff;text-align:center;padding:14px 20px;z-index:99999;font-family:'Inter',sans-serif;font-size:12px;letter-spacing:0.3em;text-transform:uppercase">Preview — <a href="https://bytesplatform.com" style="color:#fff;text-decoration:underline;font-weight:500">Built by Pixie</a></div>`;
    for (const [p, html] of Object.entries(pages)) {
      pages[p] = html.replace('</body>', WM + '</body>');
    }
  }
  return pages;
}

module.exports = { generateAllPages };
