// Pixie Portfolio — Designer Template ("Editorial Luxe — Scarcity Edition")
//
// Self-contained designer portfolio. Visual system (CSS) + interactions (JS)
// live next to this file and are read once at load; this module builds the
// per-user HTML from `config`. Built to look complete from just name +
// profession + one line — generative CSS covers + a monogram fill every image
// slot. Real projects / photos slot in when present. Case studies are
// AUTO-GENERATED per work item (the user never writes them).
//
// Routes: /  /work/  /work/<slug>/ (case study per item)  /contact/  /thank-you/  /privacy/

const fs = require('fs');
const path = require('path');
const {
  PUBLIC_API_BASE, renderActivationBanner, consentField, generatePrivacyBody,
  esc, attr, pad2, normalizeSkillsList,
  firstNameOf, initialsOf,
  getJsonLd, getFavicon,
} = require('./_shared');

const BASE_CSS = fs.readFileSync(path.join(__dirname, 'designer.css'), 'utf8');
const APP_JS = fs.readFileSync(path.join(__dirname, 'designer.app.js'), 'utf8');

const EXTRA_CSS = `
.portrait .portrait-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2}
.cover .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:3}
.cs-cover .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2}
.page-wrap{padding-top:clamp(132px,16vw,196px);padding-bottom:clamp(60px,10vw,120px)}
.page-wrap .ttl{font-family:var(--sans);font-weight:600;font-size:clamp(40px,8vw,110px);line-height:.9;letter-spacing:-.04em}
.page-wrap .ttl .em{font-family:var(--serif);font-style:italic;font-weight:400;color:var(--accent)}
.page-wrap .body{max-width:62ch;color:var(--ink-2);font-size:18px;line-height:1.6;margin-top:30px}
.page-wrap .body p{margin-bottom:14px}
.cform{display:flex;flex-direction:column;gap:14px;max-width:580px;margin-top:34px}
.cform input,.cform textarea{padding:15px 18px;border:1px solid var(--line);border-radius:16px;background:var(--paper);font:inherit;color:var(--ink)}
.cform input:focus,.cform textarea:focus{outline:none;border-color:var(--ink)}
.cform textarea{min-height:150px;resize:vertical}
.cform .consent{display:flex;gap:10px;font-size:13px;color:var(--muted);align-items:flex-start}
.cform .consent input{width:auto;margin-top:4px}
.cform button{align-self:flex-start;cursor:pointer}
.form-status{font-size:13px;color:var(--muted);margin-top:2px}
.form-status.ok{color:#1A7A3A}.form-status.err{color:#B3261E}
.cs-live{margin-top:6px}
/* Service-card image (relevant photo behind the spec, paper scrim keeps text readable) */
.spec-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;transition:transform .9s var(--e)}
.spec:hover .spec-img{transform:scale(1.06)}
.spec-shade{position:absolute;inset:0;z-index:0;background:linear-gradient(180deg,rgba(17,17,17,.22) 0%,transparent 26%,rgba(251,248,242,.84) 62%,var(--paper) 100%)}
.spec.has-img .n{position:relative;z-index:2;align-self:flex-start;background:var(--bg);padding:4px 11px;border-radius:100px;color:var(--ink-2)}
.spec.has-img .nm,.spec.has-img .ds{position:relative;z-index:1}
/* "How it works" — connected step flow: dashed line draws in, circles fill in
   sequence on scroll, accent hover. */
.proc{background:var(--paper) !important}
.flow{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:clamp(20px,3vw,44px)}
@media(max-width:860px){.flow{grid-template-columns:1fr 1fr;row-gap:clamp(40px,6vw,54px)}}
@media(max-width:520px){.flow{grid-template-columns:1fr}}
.flow-line{position:absolute;top:26px;left:26px;right:calc((100% - 3 * clamp(20px,3vw,44px)) / 4 - 26px);height:0;z-index:0}
.flow-line::before{content:"";position:absolute;inset:0;border-top:1.5px dashed var(--line-2)}
.flow-line::after{content:"";position:absolute;left:0;top:-1px;width:0;border-top:1.5px solid var(--accent);transition:width 1.6s var(--e) .3s}
.flow.in .flow-line::after{width:100%}
@media(max-width:860px){.flow-line{display:none}}
.flow-step{position:relative;z-index:1}
.flow-circle{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;border:1.5px solid var(--line-2);background:var(--bg);box-shadow:0 0 0 6px var(--paper);font-family:var(--mono);font-size:14px;font-weight:600;color:var(--ink-2);transition:border-color .5s var(--e),color .5s var(--e),background .5s var(--e),transform .5s var(--e)}
.flow.in .flow-step:nth-child(2) .flow-circle{transition-delay:.25s}
.flow.in .flow-step:nth-child(3) .flow-circle{transition-delay:.55s}
.flow.in .flow-step:nth-child(4) .flow-circle{transition-delay:.85s}
.flow.in .flow-step:nth-child(5) .flow-circle{transition-delay:1.15s}
.flow.in .flow-circle{border-color:var(--accent);color:var(--accent)}
.flow-step:hover .flow-circle{background:var(--accent);border-color:var(--accent);color:#fff;transform:scale(1.1)}
.flow-name{font-family:var(--serif);font-size:clamp(26px,2.6vw,36px);line-height:1;margin-top:22px;transition:color .4s var(--e)}
.flow-step:hover .flow-name{color:var(--accent)}
.flow-desc{font-size:15px;line-height:1.55;color:var(--muted);max-width:28ch;margin-top:12px}
.flow-tag{display:inline-flex;align-items:center;gap:8px;margin-top:18px;padding:8px 15px;border:1px solid var(--line);border-radius:100px;font-size:12.5px;font-weight:600;color:var(--ink-2);background:var(--paper);transition:border-color .4s var(--e),transform .4s var(--e)}
.flow-tag .dot{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.flow-step:hover .flow-tag{border-color:var(--accent);transform:translateY(-2px)}
/* Activation banner offsets .nav/nav.nav by 48px in preview mode, but this
   template's bar is .head — offset it too so it isn't hidden behind the banner. */
html.pixie-preview-mode .head{top:48px !important}
/* No-portrait hero: drop the right card, go full-width editorial */
.hero--solo .hero-inner{grid-template-columns:1fr;align-items:start}
.hero--solo .hero-l{max-width:none;gap:clamp(20px,2.6vw,32px)}
.hero--solo .hero-name{font-size:clamp(60px,14vw,188px)}
.hero--solo .hero-pos{max-width:50ch}
.hero--solo .hero-foot{margin-top:clamp(40px,7vw,90px)}
`;

// ─── helpers ──────────────────────────────────────────────────────────────
const GX = ['gx-a', 'gx-c', 'gx-f', 'gx-e', 'gx-d', 'gx-b'];
const PAL = ['#C46A42', '#D4A373', '#2A2521', '#F6F1EA'];
const DEFAULT_PALETTE = [['#C46A42', 'Terracotta'], ['#D4A373', 'Sand'], ['#2A2521', 'Ink'], ['#F6F1EA', 'Paper']];

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'; }
function splitName(name) {
  const w = String(name || 'Studio').trim().split(/\s+/);
  if (w.length === 1) return { first: w[0], last: '' };
  return { first: w.slice(0, -1).join(' '), last: w[w.length - 1] };
}
function twoLetters(s) {
  const t = String(s || '').replace(/[^A-Za-z]/g, '');
  if (!t) return '✶';
  return t[0].toUpperCase() + (t[1] ? t[1].toLowerCase() : '');
}
function lum(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function swatches(pal) {
  return pal.map(([hex]) => {
    const col = lum(hex) > 0.6 ? 'var(--ink-2)' : 'rgba(255,255,255,.92)';
    return `<div class="sw" style="background:${attr(hex)};color:${col}">${esc(hex.toUpperCase())}</div>`;
  }).join('');
}
const SPEC_DESC = {
  'brand identity': 'Strategy, naming and the core mark that anchors everything.',
  'logo systems': 'Flexible wordmarks and symbols built to scale anywhere.',
  'logo design': 'Flexible wordmarks and symbols built to scale anywhere.',
  'packaging': 'Structure, labels and the unboxing moment that sells.',
  'art direction': 'Type, color and imagery composed into one clear voice.',
  'visual systems': 'Type, color and grid woven into one coherent language.',
  'creative direction': 'Concept, campaign and the through-line that ties it together.',
  'web design': 'Type-driven, minimal sites that feel handcrafted.',
  'typography': 'Custom type and editorial systems with real personality.',
};
function specDesc(name) {
  return SPEC_DESC[String(name || '').toLowerCase().trim()] || 'Considered, crafted work tailored to your brand.';
}
function defaultDisciplines() {
  return ['Brand Identity', 'Logo Systems', 'Packaging', 'Visual Systems', 'Creative Direction', 'Art Direction'];
}
function disciplineList(c) {
  const skills = normalizeSkillsList(c.services);
  return skills.length ? skills : defaultDisciplines();
}
// Service-card images, found from the user's services. Reads an explicit
// serviceImages array (demo) OR the generator's per-service image field
// (production: services arrive as { title, desc, image } with a Pexels photo).
function serviceImageList(c) {
  if (Array.isArray(c.serviceImages) && c.serviceImages.length) return c.serviceImages;
  if (Array.isArray(c.services)) {
    return c.services.map((s) => (s && typeof s === 'object' ? (s.image || s.imageUrl || s.photoUrl || null) : null));
  }
  return [];
}

// Pre-written case-study content for the default disciplines (the "concept
// showcase" — looks complete with zero real projects). Keyed by slug.
const DISCIPLINE_DATA = {
  'brand-identity': { gx: 'gx-a', scope: 'Strategy → System', time: '4–8 weeks',
    sub: 'A complete identity system — built from strategy, not decoration — so the brand looks deliberate everywhere it shows up.',
    overview: ["A brand is more than a logo — it's the sum of every decision a company makes visible. I start by understanding the business, the audience and the field, then translate that into a clear visual position the whole team can stand behind.", 'The result is a system that feels intentional at every touchpoint, from the smallest favicon to a full campaign.'],
    approach: ['We begin with discovery — questions before sketches — to define what the brand needs to mean. From there I explore distinct directions, then sharpen the strongest into a complete system.', 'Every element is pressure-tested in real contexts so it holds up the day it launches.'],
    deliv: ['Brand strategy', 'Primary logo & marks', 'Type system', 'Color palette', 'Usage guidelines', 'Asset kit'],
    palette: [['#C46A42', 'Terracotta'], ['#D4A373', 'Sand'], ['#2A2521', 'Ink'], ['#F6F1EA', 'Paper']] },
  'logo-systems': { gx: 'gx-c', scope: 'Marks & wordmarks', time: '2–4 weeks',
    sub: 'A distinctive, flexible mark engineered to work everywhere — from a phone screen to the side of a building.',
    overview: ['The mark is the most repeated, most scrutinised asset a brand owns. It has to be simple enough to recognise instantly and rich enough to carry meaning.', 'I design logos as systems — primary, secondary and responsive forms — so there is always a right version for the moment.'],
    approach: ['Form follows the brand character. I work in black and white first to get the shape right, then introduce color once the silhouette is undeniable.', 'Each mark is drawn for scale and reproduction, tested at tiny and huge sizes.'],
    deliv: ['Primary logo', 'Secondary mark', 'Responsive logo', 'Clear-space rules', 'Master vector files', 'Favicon & app icon'],
    palette: [['#111111', 'Ink'], ['#C46A42', 'Terracotta'], ['#FBF8F2', 'Paper']] },
  'packaging': { gx: 'gx-f', scope: 'Structure & label', time: '4–6 weeks',
    sub: 'Structure, label and the unboxing moment — designed to be picked up, remembered and re-bought.',
    overview: ['Packaging is where a brand becomes physical. It has to earn attention on a crowded shelf and then reward the person who chose it.', 'I design the whole object — proportion, material, hierarchy and finish — not just a sticker on a box.'],
    approach: ['I start with how the product is held and used, then build a structure and label system that is both beautiful and production-ready.', 'Artwork is prepared to real dielines so it moves from screen to print without surprises.'],
    deliv: ['Structural concept', 'Label system', 'Dielines', 'Print-ready artwork', 'Finish & material notes', 'Mockup set'],
    palette: [['#D4A373', 'Sand'], ['#6B4A2E', 'Cocoa'], ['#EDE6D6', 'Cream']] },
  'visual-systems': { gx: 'gx-e', scope: 'Type · color · grid', time: '3–6 weeks',
    sub: 'The grid, type and rules that let a brand produce its own work — consistently, at speed.',
    overview: ['A brand lives or dies by what happens after the logo is done. A visual system is the operating manual — the grids, scales and components that keep everything coherent.', 'Done well, it makes a small team look like a big one.'],
    approach: ['I define the smallest set of rules that produces the widest range of on-brand work, then document them clearly and build templates teams actually use.', 'Flexibility is the goal: a system that bends without breaking.'],
    deliv: ['Layout grids', 'Type scale', 'Color system', 'Iconography', 'Component library', 'Templates'],
    palette: [['#2A2521', 'Ink'], ['#C46A42', 'Terracotta'], ['#D4A373', 'Sand'], ['#F6F1EA', 'Paper']] },
  'creative-direction': { gx: 'gx-d', scope: 'Campaign & launch', time: 'Per engagement',
    sub: 'Setting the visual tone for a campaign or launch — and keeping every piece pulling in the same direction.',
    overview: ['Big moments need a single point of view. Creative direction is deciding what something should feel like, then guiding photography, type, motion and copy to deliver it.', 'It is the difference between a set of assets and a campaign that lands.'],
    approach: ['I write the brief the work has to answer, build the reference and tone, then direct the makers — photographers, writers, animators — to a unified result.', 'The job is taste plus follow-through.'],
    deliv: ['Creative brief', 'Art direction', 'Photography direction', 'Tone of voice', 'Launch system', 'Review & QA'],
    palette: [['#C46A42', 'Terracotta'], ['#111111', 'Ink'], ['#D4A373', 'Sand']] },
  'art-direction': { gx: 'gx-b', scope: 'Editorial & social', time: 'Ongoing',
    sub: 'Composing type, image and space into one clear, repeatable voice — for editorial, social and everything between.',
    overview: ['Art direction is the craft of arrangement — how type, image and space combine to say something specific and stay consistent across hundreds of posts and pages.', 'It turns a brand raw ingredients into a recognisable look.'],
    approach: ['I build layout systems and rules that make great composition the default, so output stays sharp even at volume and speed.', 'Then I direct and refine until the voice is unmistakable.'],
    deliv: ['Editorial layouts', 'Social systems', 'Composition rules', 'Type & image pairing', 'Template kit', 'Styling direction'],
    palette: [['#6B4A2E', 'Cocoa'], ['#D4A373', 'Sand'], ['#FBF8F2', 'Paper']] },
};

// Work items: real projects when present, else disciplines. Slug is stable so
// links and the generated case-study routes always match.
function workItems(c) {
  const projects = (Array.isArray(c.projects) && c.projects.length) ? c.projects : null;
  if (projects) {
    return projects.slice(0, 6).map((p, i) => ({
      title: p.title || `Project ${i + 1}`,
      role: p.role || p.client || 'Selected project',
      cover: GX[i % GX.length], photoUrl: p.photoUrl || null, link: p.link || null,
      desc: p.description || '', tools: normalizeSkillsList(p.tools), year: p.year || '',
      isProject: true, slug: slugify(p.title || `project-${i + 1}`),
    }));
  }
  return disciplineList(c).slice(0, 6).map((name, i) => ({
    title: name, role: 'Concept showcase', cover: GX[i % GX.length], photoUrl: null, link: null,
    desc: '', tools: [], year: '', isProject: false, slug: slugify(name),
  }));
}

function socialLinks(c) {
  const out = [];
  if (c.instagramHandle) out.push(['Instagram', `https://instagram.com/${String(c.instagramHandle).replace(/^@/, '')}`]);
  if (c.behanceHandle) out.push(['Behance', `https://behance.net/${c.behanceHandle}`]);
  if (c.dribbbleHandle) out.push(['Dribbble', `https://dribbble.com/${c.dribbbleHandle}`]);
  if (c.linkedinHandle) out.push(['LinkedIn', `https://linkedin.com/in/${String(c.linkedinHandle).replace(/^in\//, '')}`]);
  if (c.githubHandle) out.push(['GitHub', `https://github.com/${c.githubHandle}`]);
  if (c.twitterHandle) out.push(['Twitter', `https://twitter.com/${String(c.twitterHandle).replace(/^@/, '')}`]);
  return out;
}

// ─── chrome ───────────────────────────────────────────────────────────────
function header(c, onHome) {
  const fn = esc(firstNameOf(c.businessName) || 'Studio');
  const h = (hash) => (onHome ? `#${hash}` : `/#${hash}`);
  return `
<header class="head">
  <a href="${onHome ? '#top' : '/'}" class="logo"><span class="mk">✶</span><span class="lname">${fn}</span><span class="logo-tag">Studio</span></a>
  <nav class="nav">
    <div class="links">
      <a class="nl" href="${h('expertise')}"><span class="n">01</span>Expertise</a>
      <a class="nl" href="${h('studio')}"><span class="n">02</span>Studio</a>
      <a class="nl" href="/work/"><span class="n">03</span>Work</a>
      <a class="nl" href="${h('process')}"><span class="n">04</span>Process</a>
    </div>
    <a class="cta" href="${h('contact')}" data-cursor="Say hi"><span class="d"></span>Let's talk</a>
  </nav>
</header>`;
}

function contactFooter(c) {
  const fn = esc(firstNameOf(c.businessName) || 'Studio');
  const mail = c.contactEmail ? `mailto:${attr(c.contactEmail)}` : '/contact/';
  const call = c.contactPhone ? `tel:${attr(String(c.contactPhone).replace(/\s+/g, ''))}` : '/contact/';
  const socials = socialLinks(c);
  const socialHtml = socials.length
    ? socials.map(([l, u]) => `<a href="${attr(u)}" target="_blank" rel="noopener" data-cursor="↗">${esc(l)}</a>`).join('')
    : `<a href="/contact/" data-cursor="↗">Get in touch</a>`;
  return `
<footer class="contact" id="contact" data-screen-label="Contact">
  <div class="wrap">
    <div class="c-cta">
      <span class="kicker center reveal" style="justify-content:center">Let's build something</span>
      <h2 class="big reveal d1" style="margin-top:26px">Have a brand worth <span class="em">telling?</span></h2>
      <p class="sub reveal d2">Tell me what you're making — I reply to every message personally.</p>
      <div class="c-actions reveal d2">
        <a href="${mail}" class="btn btn--solid" data-magnetic data-cursor="Email">${esc(c.contactEmail || 'Get in touch')} <span class="arr">↗</span></a>
        <a href="${call}" class="btn btn--out">Book a call</a>
      </div>
    </div>
    <div class="foot">
      <span class="logo"><span class="mk">✶</span><span class="lname">${fn}</span><span class="logo-tag">Studio</span></span>
      <div class="socials">${socialHtml}</div>
      <span class="cp">© <span data-year>${new Date().getFullYear()}</span> ${esc(c.businessName)} — ${esc(c.industry || 'Designer')}</span>
    </div>
  </div>
</footer>`;
}

function scripts() {
  const imgFallback = '(function(){var i=document.querySelectorAll(".portrait-img,.cover-img,.spec-img");[].forEach.call(i,function(im){function f(){im.style.display="none";}if(im.complete&&im.naturalWidth===0)f();im.addEventListener("error",f);});})();';
  return `<script>${APP_JS}</script>\n<script>${imgFallback}</script>`;
}

function shell(c, body, onHome) {
  const title = `${c.businessName} — ${c.industry || 'Designer'}`;
  const desc = c.tagline || c.portfolioAbout || `${c.businessName} — portfolio`;
  return `<!DOCTYPE html>
<html lang="${esc(c.htmlLang || 'en')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
${getFavicon(c, '#F6F1EA')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${getJsonLd(c)}
<style>${BASE_CSS}${EXTRA_CSS}</style>
</head>
<body id="top">
${renderActivationBanner(c)}
<div class="grain"></div>
<div class="vign"></div>
${header(c, onHome)}
<main>${body}</main>
${scripts()}
</body>
</html>`;
}

// ─── home sections ────────────────────────────────────────────────────────
function hero(c) {
  const { first, last } = splitName(c.businessName);
  const role = esc(c.industry || 'Designer');
  const pos = esc(c.tagline || 'Helping ambitious companies become brands people remember — from the first mark to the full rollout.');
  const yrs = Number(c.yearsExperience) || 0;
  const since = yrs ? (new Date().getFullYear() - yrs) : 2017;
  const place = esc(c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || 'Remote · Worldwide');
  const avail = esc(c.availabilityStatus || 'Available for new projects');
  const mono = esc(initialsOf(c.businessName) || twoLetters(c.businessName));
  // Hero photo is the user's OWN headshot only — an OPTIONAL upload. No random
  // fallback: if they didn't give one, the hero runs full-width solo (no empty
  // card, nothing stock).
  const portraitUrl = c.aboutPhotoUrl || null;
  const hasPortrait = !!portraitUrl;
  // With a photo → two-column hero with the portrait card. Without one → drop
  // the card entirely and run a clean, full-width editorial hero (the empty
  // monogram card looked weak); an availability pill keeps it lively.
  const aside = hasPortrait ? `
    <aside class="hero-r reveal d2">
      <div class="portrait">
        <div class="mono"><span>${mono}</span></div>
        <img class="portrait-img" src="${attr(portraitUrl)}" alt="${attr(c.businessName)}">
        <span class="portrait-rail">Portfolio — ${new Date().getFullYear()}</span>
        <span class="portrait-tag"><span class="pulse"></span> ${avail}</span>
      </div>
    </aside>` : '';
  const availPill = hasPortrait ? '' : `<span class="hero-avail reveal d2"><span class="pulse"></span> ${avail}</span>`;
  return `
<section class="hero${hasPortrait ? '' : ' hero--solo'}" data-screen-label="Hero">
  <div class="hero-rules"></div>
  <div class="wrap hero-inner">
    <div class="hero-l">
      <span class="hero-eyebrow reveal"><span class="ln"></span>Independent Studio · Est. ${since}</span>
      ${availPill}
      <h1 class="hero-name reveal d1">${esc(first)}${last ? ` <span class="em">${esc(last)}</span>` : ''}</h1>
      <span class="hero-role reveal d2">${role}</span>
      <p class="hero-pos reveal d2">${pos}</p>
      <div class="hero-cta reveal d3">
        <a href="#work" class="btn btn--solid" data-magnetic data-cursor="See work">View work <span class="arr">↗</span></a>
        <a href="#contact" class="btn btn--out">Start a project</a>
      </div>
    </div>
    ${aside}
  </div>
  <div class="wrap hero-foot reveal d4">
    <div class="hero-meta">
      <span><b>Discipline</b><em>${role}</em></span>
      <span><b>Based</b><em>${place}</em></span>
      <span><b>Working since</b><em>${since}</em></span>
    </div>
    <span class="scroll-ind">Scroll <span class="bar"></span></span>
  </div>
</section>`;
}

function marquee(c) {
  const unit = disciplineList(c).slice(0, 6).map((w) => `<i>${esc(w)}</i>`).join('');
  return `<div class="marq" aria-hidden="true"><div class="marq-t">${unit}${unit}</div></div>`;
}

function specializations(c) {
  const imgs = serviceImageList(c);
  const cells = disciplineList(c).slice(0, 4).map((name, i) => {
    const im = imgs[i];
    return `
    <div class="spec reveal${i ? ` d${i}` : ''}${im ? ' has-img' : ''}">
      <span class="gx ${GX[i % GX.length]}"></span>
      ${im ? `<img class="spec-img" src="${attr(im)}" alt="${attr(name)}" loading="lazy"><span class="spec-shade"></span>` : ''}
      <span class="n">${pad2(i + 1)}</span>
      <h3 class="nm">${esc(name)}</h3>
      <p class="ds">${esc(specDesc(name))}</p>
    </div>`;
  }).join('');
  return `
<section class="section" id="expertise" data-screen-label="Specializations">
  <div class="wrap">
    <div class="sec-head">
      <div><span class="kicker reveal">Expertise</span><h2 class="h-md t reveal d1" style="margin-top:18px">What I do <span class="serif it">best.</span></h2></div>
      <p class="lead reveal d2" style="max-width:26ch">Four disciplines, one obsession with craft — the foundation of every engagement.</p>
    </div>
    <div class="spec-grid">${cells}</div>
  </div>
</section>`;
}

function philosophy(c) {
  const fn = esc(firstNameOf(c.businessName));
  const role = (c.industry || 'designer').toLowerCase();
  const bio = c.portfolioAbout || c.aboutText
    || `${fn} is an independent ${role} helping ambitious companies become brands people remember. He partners with founders and teams to turn a rough idea into a complete visual system — strategy, mark, type and the details in between — so the work feels considered, cohesive and unmistakably theirs.`;
  return `
<section class="section philo" id="studio" data-screen-label="Philosophy">
  <div class="wrap">
    <span class="kicker reveal">Design Philosophy</span>
    <h2 class="statement reveal d1" style="margin-top:30px">I believe memorable brands are built through <span class="em">clarity,</span> consistency and <span class="em">thoughtful design</span> — <span class="dim">not decoration.</span></h2>
    <p class="philo-about reveal d2">${esc(bio)}</p>
    <div class="philo-foot">
      <div class="blk reveal"><h4>Strategy first</h4><p>Every mark starts with a question, not a sketch. The why comes before the what.</p></div>
      <div class="blk reveal d1"><h4>Systems, not assets</h4><p>A logo is one note. I design the whole instrument — type, color, motion, voice.</p></div>
      <div class="blk reveal d2"><h4>Warm precision</h4><p>Considered down to the kerning, but never cold. Brands should feel made by a human.</p></div>
    </div>
  </div>
</section>`;
}

function selectedWork(c, items) {
  const real = items.length && items[0].isProject;
  const note = real ? 'Selected projects' : 'Concept showcase — add real projects anytime';
  const rows = items.map((it, i) => `
    <a class="idx-row" href="/work/${it.slug}/" data-cover="${it.cover}"${it.photoUrl ? ` data-img="${attr(it.photoUrl)}"` : ''}>
      <span class="ix">${pad2(i + 1)}</span>
      <span class="t">${esc(it.title)}</span>
      <span class="c">${esc(it.role)}</span>
      <span class="ar">↗</span>
    </a>`).join('');
  return `
<section class="section work-idx" id="work" data-screen-label="Work">
  <div class="wrap">
    <div class="sec-head">
      <div><span class="kicker reveal">Selected Work</span><h2 class="h-md t reveal d1" style="margin-top:18px">A taste of the <span class="serif it">range.</span></h2></div>
      <span class="work-note reveal d2"><span class="dt"></span> ${esc(note)}</span>
    </div>
    <div class="idx-list reveal d1">${rows}</div>
    <div class="work-more reveal d2">
      <a class="more-link" href="/work/" data-magnetic>View all work <span class="arr">↗</span></a>
      <span class="more-count">${items.length} ${real ? 'projects' : 'disciplines'}</span>
    </div>
  </div>
  <div class="idx-preview" aria-hidden="true"><span class="gx gx-a"></span></div>
</section>`;
}

function process() {
  const steps = [
    ['Discover', 'We dig into the brief, the audience and what the work has to achieve.', 'Brief & moodboard'],
    ['Direction', 'Distinct routes explored, then sharpened into one confident direction.', 'Concept directions'],
    ['Craft', 'Every detail — type, composition, colour — pushed until it feels inevitable.', 'Final proofs'],
    ['Deliver', 'Production-ready files, specs and everything you need to ship.', 'Files & specs'],
  ];
  const cells = steps.map(([n, p, tag], i) => `
    <div class="flow-step">
      <span class="flow-circle">${pad2(i + 1)}</span>
      <h3 class="flow-name">${esc(n)}</h3>
      <p class="flow-desc">${esc(p)}</p>
      <span class="flow-tag"><span class="dot"></span>${esc(tag)}</span>
    </div>`).join('');
  return `
<section class="section proc" id="process" data-screen-label="Process">
  <div class="wrap">
    <div class="sec-head">
      <div><span class="kicker reveal">How it works</span><h2 class="h-md t reveal d1" style="margin-top:18px">A simple, <span class="serif it">considered</span> process.</h2></div>
      <p class="lead reveal d2" style="max-width:24ch">Four steps from first conversation to final handover.</p>
    </div>
    <div class="flow reveal d1">
      <div class="flow-line" aria-hidden="true"></div>
      ${cells}
    </div>
  </div>
</section>`;
}

function availability(c) {
  const timeline = esc(c.typicalTimeline || '4–8 weeks');
  const place = esc(c.contactAddress || (Array.isArray(c.serviceAreas) && c.serviceAreas[0]) || 'Remote · Worldwide');
  return `
<section class="section avail" data-screen-label="Availability">
  <div class="wrap avail-inner">
    <div><span class="kicker reveal">Availability</span><h2 class="reveal d1" style="margin-top:22px">Currently taking <span class="em">new projects</span>.</h2></div>
    <div class="avail-list reveal d2">
      <div class="row"><span class="k">New projects</span><span class="v"><span class="dt"></span> Open</span></div>
      <div class="row"><span class="k">Collaborations</span><span class="v"><span class="dt"></span> Welcome</span></div>
      <div class="row"><span class="k">Typical timeline</span><span class="v soft"><span class="dt"></span> ${timeline}</span></div>
      <div class="row"><span class="k">Based</span><span class="v soft"><span class="dt"></span> ${place}</span></div>
    </div>
  </div>
</section>`;
}

// ─── pages ────────────────────────────────────────────────────────────────
function generateHomePage(c) {
  const items = workItems(c);
  const body = hero(c) + marquee(c) + specializations(c) + philosophy(c) + selectedWork(c, items) + process() + availability(c) + contactFooter(c);
  return shell(c, body, true);
}

function generateWorkPage(c) {
  const items = workItems(c);
  const spans = items.length >= 6 ? ['f4 short', '', '', '', '', 'f6 short'] : items.map(() => '');
  const cards = items.map((it, i) => {
    const cover = (it.photoUrl ? `<img class="cover-img" src="${attr(it.photoUrl)}" alt="${attr(it.title)}">` : '')
      + `<span class="gx ${it.cover}"></span><span class="big-let">${esc(twoLetters(it.title))}</span>`;
    const pal = PAL.map((col) => `<i style="background:${col}"></i>`).join('');
    return `
      <a class="concept ${spans[i] || ''} reveal${i ? ` d${i % 3}` : ''}" href="/work/${it.slug}/" data-cursor="View">
        <div class="cover">${cover}<span class="num">${pad2(i + 1)}</span><span class="cat">${esc(it.title)}</span>
          <div class="panel"><div class="pal">${pal}</div><span class="vb">View case study ↗</span></div></div>
        <div class="concept-foot"><span class="ttl">${esc(it.title)}</span><span class="role">${esc(it.role)}</span></div>
      </a>`;
  }).join('');
  const body = `
<section class="wrap page-hero" data-screen-label="Work — Hero">
  <a href="/" class="back-link reveal">← Back to home</a>
  <div>
    <span class="kicker reveal">Selected Work</span>
    <h1 class="ttl reveal d1">The full <span class="em">range.</span></h1>
    <p class="sub reveal d2">A showcase of the work I do. Every engagement draws on a few of these — strategy through to the smallest production detail.</p>
    <div class="meta reveal d3">
      <span><b>Pieces</b><em>${items.length}</em></span>
      <span><b>Focus</b><em>${esc(c.industry || 'Brand & Identity')}</em></span>
      <span><b>Status</b><em>${esc(c.availabilityStatus || 'Open to work')}</em></span>
    </div>
  </div>
</section>
<section class="section" style="padding-top:clamp(20px,3vw,40px)" data-screen-label="Work — Grid">
  <div class="wrap"><div class="work">${cards}</div></div>
</section>
${contactFooter(c)}`;
  return shell(c, body, false);
}

// Build auto case-study content for one work item.
function caseContent(c, it) {
  if (it.isProject) {
    const deliv = it.tools.length ? it.tools : ['Strategy', 'Design', 'Delivery'];
    const overview = (it.desc ? [it.desc] : ['A selected project from the studio.'])
      .concat(['Built end to end — from first direction to final, production-ready files.']);
    return {
      letters: twoLetters(it.title), gx: it.cover, titleHtml: esc(it.title),
      sub: it.desc ? esc(it.desc) : `${esc(it.role || 'Selected work')}.`,
      disc: esc(it.role || c.industry || 'Design'), scope: esc(it.role || 'End to end'),
      time: esc(it.year ? String(it.year) : 'Per engagement'),
      deliv, overview, approach: ['Discovery first, then distinct directions, then one sharpened system.', 'Every detail pressure-tested in real contexts before handover.'],
      palette: DEFAULT_PALETTE, link: it.link, photoUrl: it.photoUrl,
    };
  }
  const d = DISCIPLINE_DATA[it.slug];
  if (d) {
    return {
      letters: twoLetters(it.title), gx: d.gx, titleHtml: esc(it.title), sub: d.sub,
      disc: esc(it.title), scope: d.scope, time: d.time, deliv: d.deliv,
      overview: d.overview, approach: d.approach, palette: d.palette, link: null, photoUrl: null,
    };
  }
  return {
    letters: twoLetters(it.title), gx: it.cover, titleHtml: esc(it.title), sub: specDesc(it.title),
    disc: esc(it.title), scope: 'End to end', time: 'Per engagement',
    deliv: ['Strategy', 'Design', 'System', 'Guidelines'],
    overview: [specDesc(it.title), 'A core part of how I help brands look deliberate everywhere.'],
    approach: ['Questions before sketches.', 'Sharpen the strongest direction into a complete system.'],
    palette: DEFAULT_PALETTE, link: null, photoUrl: null,
  };
}

function generateCaseStudyPage(c, it, next) {
  const d = caseContent(c, it);
  const paras = (arr) => arr.map((p) => `<p>${esc(p)}</p>`).join('');
  const coverImg = d.photoUrl ? `<img class="cover-img" src="${attr(d.photoUrl)}" alt="${attr(it.title)}">` : '';
  const body = `
<section class="wrap cs-hero" data-screen-label="Case Study — Hero">
  <a href="/work/" class="back-link reveal">← All work</a>
  <span class="cs-tag reveal">Capability · ${d.disc}</span>
  <h1 class="cs-title reveal d1">${d.titleHtml}</h1>
  <p class="cs-sub reveal d2">${esc(d.sub)}</p>
  <div class="cs-meta reveal d3">
    <div><div class="k">Discipline</div><div class="v">${d.disc}</div></div>
    <div><div class="k">Scope</div><div class="v">${esc(d.scope)}</div></div>
    <div><div class="k">Timeline</div><div class="v">${esc(d.time)}</div></div>
    <div><div class="k">Deliverables</div><div class="v">${d.deliv.length} items</div></div>
  </div>
</section>
<section class="wrap" style="padding-bottom:clamp(20px,3vw,40px)" data-screen-label="Case Study — Cover">
  <div class="cs-cover reveal">${coverImg}<span class="gx ${d.gx}"></span><span class="lt">${esc(d.letters)}</span><span class="cn">${d.photoUrl ? '' : 'Concept showcase'}</span></div>
</section>
<section class="wrap" data-screen-label="Case Study — Body">
  <div class="cs-block reveal"><div class="bh">Overview</div><div class="body">${paras(d.overview)}</div></div>
  <div class="cs-block reveal"><div class="bh">Approach</div><div class="body">${paras(d.approach)}</div></div>
  <div class="cs-block reveal"><div class="bh">Deliverables</div><div class="body"><div class="cs-deliv">${d.deliv.map((t) => `<span>${esc(t)}</span>`).join('')}</div></div></div>
  ${d.link ? `<div class="cs-block reveal"><div class="bh">Live</div><div class="body cs-live"><a class="btn btn--out" href="${attr(d.link)}" target="_blank" rel="noopener">Visit project ↗</a></div></div>` : ''}
  <div class="cs-next">
    <span class="nl">Next ${it.isProject ? 'project' : 'discipline'}</span>
    <a href="/work/${next.slug}/" data-cursor="View"><span class="nt">${esc(next.title)}</span> ↗</a>
  </div>
</section>
${contactFooter(c)}`;
  return shell(c, body, false);
}

function pageShell(c, inner) {
  return shell(c, `<section class="wrap page-wrap">${inner}</section>${contactFooter(c)}`, false);
}
function generateContactPage(c) {
  return pageShell(c, `
    <a href="/" class="back-link reveal">← Back to home</a>
    <h1 class="ttl reveal d1">Let's <span class="em">talk.</span></h1>
    <form class="cform reveal d2" id="cf">
      <input type="text" name="name" placeholder="Your name" required>
      <input type="email" name="email" placeholder="Email" required>
      <textarea name="message" placeholder="Tell me about your project" required></textarea>
      ${consentField()}
      <button class="btn btn--solid" type="submit" id="cf-btn">Send message <span class="arr">↗</span></button>
      <p class="form-status" id="cf-status"></p>
    </form>
    <script>
    (function(){
      var form=document.getElementById('cf'),status=document.getElementById('cf-status'),btn=document.getElementById('cf-btn');
      if(!form)return;
      form.addEventListener('submit',function(e){
        e.preventDefault();
        var data=new FormData(form);
        if(!data.get('consent')){status.textContent='Please confirm consent first.';status.className='form-status err';return;}
        btn.disabled=true;status.textContent='Sending…';status.className='form-status';
        fetch('${attr(PUBLIC_API_BASE)}/api/leads/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({siteId:'${attr(c.siteId || '')}',name:data.get('name'),email:data.get('email'),message:data.get('message'),consent:!!data.get('consent')})})
          .then(function(r){return r.json();})
          .then(function(j){if(j&&j.ok){status.textContent="Got it — I'll reply soon.";status.className='form-status ok';form.reset();}else{status.textContent='Send failed — try emailing directly.';status.className='form-status err';btn.disabled=false;}})
          .catch(function(){status.textContent='Network error — try emailing directly.';status.className='form-status err';btn.disabled=false;});
      });
    })();
    </script>`);
}
function generateThankYouPage(c) {
  return pageShell(c, `<h1 class="ttl reveal">Thank <span class="em">you.</span></h1>
    <div class="body reveal d1"><p>Your message landed — I'll be in touch shortly.</p><p><a class="back-link" href="/">← Back home</a></p></div>`);
}
function generatePrivacyPage(c) {
  return pageShell(c, `<h1 class="ttl reveal">Privacy.</h1><div class="body reveal d1">${generatePrivacyBody(c)}</div>`);
}

function generatePages(config) {
  const items = workItems(config);
  const pages = {
    '/index.html':           generateHomePage(config),
    '/work/index.html':      generateWorkPage(config),
    '/contact/index.html':   generateContactPage(config),
    '/thank-you/index.html': generateThankYouPage(config),
    '/privacy/index.html':   generatePrivacyPage(config),
  };
  // One auto-generated case study per work item.
  items.forEach((it, i) => {
    const next = items[(i + 1) % items.length];
    pages[`/work/${it.slug}/index.html`] = generateCaseStudyPage(config, it, next);
  });
  return pages;
}

module.exports = { generatePages };
