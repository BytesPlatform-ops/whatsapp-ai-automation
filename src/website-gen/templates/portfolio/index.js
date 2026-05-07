// Portfolio template — single generic, audience-agnostic design that works
// for designers / developers / photographers / writers / freelancers /
// artists. Modern minimalist aesthetic: large display type, generous
// whitespace, project grid as the centerpiece, contact + social as a
// closing section. Three pages: Home (hero + bio + skills + featured
// projects + contact), Projects (full grid), Contact (form).
//
// Reads the same `config` shape every other template gets from
// generateWebsiteContent. Portfolio-specific fields:
//   - portfolioAbout : 1-2 sentence bio (string, optional)
//   - projects       : array of { title, description, role, year, link,
//                                  tools, photoUrl } from the user's
//                                  iterative collection (optional)

const { env } = require('../../../config/env');
const { computeHeroPaletteFromConfig } = require('../../heroPalette');
const { renderActivationBanner } = require('../../activationBanner');
const { consentField, generatePrivacyBody } = require('../_privacy');

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
const pad2 = (n) => String(n).padStart(2, '0');

function pages() {
  return [
    { n: 'Work', h: '/' },
    { n: 'About', h: '/about' },
    { n: 'Contact', h: '/contact' },
  ];
}

// ─── styles (shared across all pages) ──────────────────────────────────────
function getStyles(pc, ac) {
  return `
:root {
  --ink: #0e0e10;
  --ink-soft: #1a1a1d;
  --paper: #fafaf7;
  --paper-soft: #f0f0eb;
  --line: rgba(14, 14, 16, 0.08);
  --mute: rgba(14, 14, 16, 0.55);
  --primary: ${pc};
  --accent: ${ac};
  --radius: 6px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink);
  background: var(--paper);
  font-weight: 400;
}
h1, h2, h3, h4 {
  font-family: 'Fraunces', 'Inter', -apple-system, serif;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: var(--ink);
}
h1 { font-size: clamp(48px, 8vw, 112px); }
h2 { font-size: clamp(36px, 5vw, 64px); }
h3 { font-size: clamp(22px, 2.4vw, 32px); }
p { color: var(--ink-soft); }
a { color: inherit; text-decoration: none; transition: opacity 0.15s; }
a:hover { opacity: 0.6; }
.container { max-width: 1280px; margin: 0 auto; padding: 0 32px; }
@media (max-width: 720px) { .container { padding: 0 20px; } }

/* nav */
.nav {
  position: sticky; top: 0; z-index: 50;
  background: rgba(250, 250, 247, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.nav-inner { display: flex; align-items: center; justify-content: space-between; padding: 22px 32px; }
.nav-brand { font-family: 'Fraunces', serif; font-weight: 500; font-size: 20px; letter-spacing: -0.01em; }
.nav-links { display: flex; gap: 40px; align-items: center; }
.nav-links a { font-size: 14px; font-weight: 400; }
.nav-links a.active { font-weight: 500; }
.nav-links a:after {
  content: ''; display: block; height: 1px; background: var(--ink); width: 0; transition: width 0.2s;
}
.nav-links a:hover:after, .nav-links a.active:after { width: 100%; }
@media (max-width: 720px) {
  .nav-inner { padding: 18px 20px; }
  .nav-links { gap: 22px; }
  .nav-links a { font-size: 13px; }
}

/* hero */
.hero { padding: 120px 0 80px; }
.hero-eyebrow {
  display: inline-block;
  font-size: 12px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--mute); margin-bottom: 24px;
}
.hero-eyebrow-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent); margin-right: 10px; vertical-align: middle;
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.hero h1 { margin-bottom: 28px; max-width: 14ch; }
.hero-bio {
  font-size: clamp(18px, 1.6vw, 22px);
  line-height: 1.55;
  max-width: 56ch;
  color: var(--mute);
  margin-bottom: 40px;
  font-weight: 400;
}
.hero-cta {
  display: inline-flex; align-items: center; gap: 14px;
  padding: 16px 28px;
  background: var(--ink); color: var(--paper);
  border-radius: 999px;
  font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
  transition: transform 0.18s, box-shadow 0.18s;
}
.hero-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(14,14,16,0.18); opacity: 1; }
.hero-cta svg { width: 14px; height: 10px; }

/* skills strip */
.skills { padding: 40px 0 80px; border-top: 1px solid var(--line); }
.skills-label {
  font-size: 12px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--mute); margin-bottom: 24px;
}
.skills-list { display: flex; flex-wrap: wrap; gap: 8px; }
.skill-chip {
  padding: 8px 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 13px; font-weight: 500;
  background: var(--paper);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.skill-chip:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }

/* projects section */
.projects-section { padding: 96px 0; border-top: 1px solid var(--line); }
.projects-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 56px; gap: 32px; flex-wrap: wrap; }
.projects-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 48px 40px;
}
@media (max-width: 920px) { .projects-grid { grid-template-columns: 1fr; gap: 56px; } }
.project-card { display: block; cursor: pointer; }
.project-cover {
  aspect-ratio: 4 / 3;
  background: var(--paper-soft);
  background-size: cover; background-position: center;
  border-radius: var(--radius);
  position: relative;
  overflow: hidden;
  transition: transform 0.4s cubic-bezier(.2,.8,.2,1);
}
.project-card:hover .project-cover { transform: scale(1.015); }
.project-cover-empty {
  display: flex; align-items: center; justify-content: center;
  font-family: 'Fraunces', serif; font-weight: 500; font-size: 96px;
  color: rgba(14,14,16,0.18);
  letter-spacing: -0.04em;
}
.project-num {
  position: absolute; top: 16px; right: 18px;
  font-family: 'Fraunces', serif; font-size: 13px; font-weight: 500;
  color: var(--paper); background: rgba(14,14,16,0.7); backdrop-filter: blur(6px);
  padding: 4px 10px; border-radius: 4px; letter-spacing: 0.04em;
}
.project-meta { padding: 24px 4px 0; }
.project-title { font-family: 'Fraunces', serif; font-size: clamp(22px, 2.2vw, 30px); font-weight: 500; margin-bottom: 8px; line-height: 1.2; }
.project-sub { display: flex; align-items: center; gap: 14px; font-size: 13px; color: var(--mute); margin-bottom: 12px; flex-wrap: wrap; }
.project-sub-dot { display: inline-block; width: 3px; height: 3px; background: var(--mute); border-radius: 50%; }
.project-desc { font-size: 15px; line-height: 1.6; color: var(--ink-soft); }
.project-tools {
  margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px;
}
.project-tool {
  font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
  padding: 3px 9px; background: var(--paper-soft);
  border-radius: 3px; color: var(--ink-soft);
}
.project-link {
  margin-top: 16px;
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 500;
}
.project-link svg { width: 11px; height: 11px; }

/* close CTA */
.close-cta {
  background: var(--ink); color: var(--paper);
  padding: 100px 0 110px;
  text-align: center;
}
.close-cta .eyebrow-light { color: rgba(250,250,247,0.55); }
.close-cta h2 { color: var(--paper); margin: 18px 0 22px; max-width: 18ch; margin-left: auto; margin-right: auto; }
.close-cta p { color: rgba(250,250,247,0.7); max-width: 50ch; margin: 0 auto 36px; font-size: 18px; }
.close-cta .btn-w {
  display: inline-flex; align-items: center; gap: 12px;
  padding: 16px 32px;
  background: var(--paper); color: var(--ink);
  border-radius: 999px;
  font-size: 14px; font-weight: 500;
  transition: transform 0.18s;
}
.close-cta .btn-w:hover { transform: translateY(-2px); opacity: 1; }
.close-cta .btn-w svg { width: 14px; height: 10px; }

/* about page */
.about-section { padding: 100px 0 80px; max-width: 880px; margin: 0 auto; }
.about-eyebrow {
  font-size: 12px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--mute); margin-bottom: 32px;
}
.about-section h1 { margin-bottom: 56px; max-width: 18ch; }
.about-body p { font-size: clamp(17px, 1.4vw, 20px); line-height: 1.65; margin-bottom: 24px; color: var(--ink-soft); }
.about-detail-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 48px 40px; margin-top: 80px;
  padding-top: 56px; border-top: 1px solid var(--line);
}
@media (max-width: 720px) { .about-detail-grid { grid-template-columns: 1fr; gap: 40px; } }
.about-detail h4 {
  font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--mute); margin-bottom: 16px;
}
.about-detail p { font-size: 15px; line-height: 1.7; }

/* contact page + form */
.contact-section { padding: 100px 0 60px; max-width: 720px; margin: 0 auto; }
.contact-section h1 { margin-bottom: 18px; }
.contact-section .lead { font-size: clamp(17px, 1.4vw, 20px); color: var(--mute); margin-bottom: 56px; max-width: 50ch; }
.contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 56px; }
@media (max-width: 720px) { .contact-grid { grid-template-columns: 1fr; gap: 24px; } }
.contact-block h4 {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--mute); margin-bottom: 12px;
}
.contact-block a, .contact-block p { font-size: 17px; font-weight: 500; }

.form { display: flex; flex-direction: column; gap: 18px; }
.form input, .form textarea {
  width: 100%;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-family: inherit; font-size: 15px;
  background: var(--paper);
  color: var(--ink);
  transition: border-color 0.15s;
}
.form input:focus, .form textarea:focus { outline: none; border-color: var(--ink); }
.form textarea { min-height: 140px; resize: vertical; }
.form button {
  align-self: flex-start;
  padding: 16px 32px;
  background: var(--ink); color: var(--paper);
  border: 0; border-radius: 999px;
  font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  transition: transform 0.18s;
}
.form button:hover { transform: translateY(-2px); }
.form button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.form .consent { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: var(--mute); margin-top: -4px; }
.form .consent input { width: auto; margin-top: 3px; }
.form .consent a { text-decoration: underline; }
.form-status { font-size: 14px; color: var(--mute); }
.form-status.ok { color: #1a7a3a; }
.form-status.err { color: #b3261e; }

/* footer */
.footer {
  border-top: 1px solid var(--line);
  padding: 40px 0;
  font-size: 13px; color: var(--mute);
}
.footer-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.footer-links { display: flex; gap: 24px; }

/* reveal-on-scroll */
.rv { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
.rv.in { opacity: 1; transform: none; }
.rv.d1 { transition-delay: 0.08s; }
.rv.d2 { transition-delay: 0.16s; }
.rv.d3 { transition-delay: 0.24s; }
`;
}

// ─── shared bits ────────────────────────────────────────────────────────────
function getNav(c, currentPath) {
  return `
<nav class="nav">
  <div class="nav-inner">
    <a class="nav-brand" href="/">${esc(c.businessName)}</a>
    <div class="nav-links">
      ${pages().map((p) => `<a href="${attr(p.h)}"${currentPath === p.h ? ' class="active"' : ''}>${esc(p.n)}</a>`).join('')}
    </div>
  </div>
</nav>`;
}

function getFooter(c) {
  const year = new Date().getFullYear();
  return `
<footer class="footer">
  <div class="container">
    <div class="footer-inner">
      <span>© ${year} ${esc(c.businessName)}.</span>
      <div class="footer-links">
        <a href="/">Work</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/privacy">Privacy</a>
      </div>
    </div>
  </div>
</footer>`;
}

function getScript() {
  return `
<script>
(function(){
  // Reveal-on-scroll
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('.rv').forEach((el) => el.classList.add('in'));
  }
})();
</script>`;
}

function wrap(c, currentPath, body) {
  const heroPal = computeHeroPaletteFromConfig(c);
  const banner = renderActivationBanner(c);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.businessName)} — ${esc(c.industry || 'Portfolio')}</title>
<meta name="description" content="${attr(c.tagline || c.aboutText || c.businessName + ' — portfolio')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap">
<style>${getStyles(c.primaryColor || '#0e0e10', c.accentColor || '#ff5b04')}</style>
</head>
<body>
${banner}
${getNav(c, currentPath)}
${body}
${getFooter(c)}
${getScript()}
</body>
</html>`;
}

// ─── project-card rendering ────────────────────────────────────────────────
function projectCover(p, idx) {
  if (p.photoUrl) {
    return `<div class="project-cover" style="background-image: url('${attr(p.photoUrl)}')"><span class="project-num">${pad2(idx + 1)}</span></div>`;
  }
  // Fallback: typographic initial cover.
  const initial = String(p.title || '?').trim().charAt(0).toUpperCase();
  return `<div class="project-cover project-cover-empty"><span>${esc(initial)}</span><span class="project-num">${pad2(idx + 1)}</span></div>`;
}

function renderProjectCard(p, idx) {
  const subs = [p.role, p.year].filter(Boolean);
  const linkBlock = p.link
    ? `<div><a class="project-link" href="${attr(p.link)}" target="_blank" rel="noopener">View case <svg viewBox="0 0 14 14" fill="currentColor"><path d="M3 11l8-8M5 3h6v6"/></svg></a></div>`
    : '';
  const toolsBlock = Array.isArray(p.tools) && p.tools.length
    ? `<div class="project-tools">${p.tools.slice(0, 6).map((t) => `<span class="project-tool">${esc(t)}</span>`).join('')}</div>`
    : '';
  return `
<a class="project-card rv ${idx % 2 === 0 ? '' : 'd1'}" ${p.link ? `href="${attr(p.link)}" target="_blank" rel="noopener"` : 'href="javascript:void(0)"'}>
  ${projectCover(p, idx)}
  <div class="project-meta">
    <h3 class="project-title">${esc(p.title)}</h3>
    ${subs.length ? `<div class="project-sub">${subs.map((s, i) => (i > 0 ? `<span class="project-sub-dot"></span>${esc(s)}` : esc(s))).join('')}</div>` : ''}
    ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
    ${toolsBlock}
    ${linkBlock}
  </div>
</a>`;
}

// ─── default placeholders ──────────────────────────────────────────────────
function defaultPlaceholderProjects(industry) {
  // When the user skipped projects entirely, render three plausible
  // placeholders matching the audience. Generic enough that the LLM won't
  // be tempted to invent unrelated work.
  return [
    { title: 'Selected Work', description: 'A recent client project, replace this card with your own.', role: '', year: '', link: '', tools: [], photoUrl: null },
    { title: 'Case Study', description: 'A deeper look at a problem and the design / engineering decisions that shaped it.', role: '', year: '', link: '', tools: [], photoUrl: null },
    { title: 'Personal Project', description: 'Something self-initiated, exploring a craft, tool, or curiosity.', role: '', year: '', link: '', tools: [], photoUrl: null },
  ];
}

// ─── pages ──────────────────────────────────────────────────────────────────
function generateHomePage(c) {
  const userProjects = Array.isArray(c.projects) && c.projects.length ? c.projects : null;
  const projects = userProjects || defaultPlaceholderProjects(c.industry);
  const hasUserProjects = !!userProjects;
  const skills = Array.isArray(c.services) && c.services.length ? c.services.slice(0, 12) : [];
  const aboutLine = c.portfolioAbout || c.aboutText || `${c.businessName} — ${c.industry || 'creative work'}.`;

  const skillsBlock = skills.length
    ? `
<section class="skills">
  <div class="container">
    <div class="rv">
      <p class="skills-label">Toolkit</p>
      <div class="skills-list">
        ${skills.map((s) => `<span class="skill-chip">${esc(s)}</span>`).join('')}
      </div>
    </div>
  </div>
</section>`
    : '';

  const body = `
<section class="hero">
  <div class="container">
    <div class="rv">
      <p class="hero-eyebrow"><span class="hero-eyebrow-dot"></span>Available for new work</p>
      <h1>${esc(c.tagline || c.businessName)}</h1>
      <p class="hero-bio">${esc(aboutLine)}</p>
      <a class="hero-cta" href="/contact">Get in touch <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
    </div>
  </div>
</section>

${skillsBlock}

<section class="projects-section">
  <div class="container">
    <div class="projects-header rv">
      <h2>${hasUserProjects ? 'Selected work.' : 'Recent work.'}</h2>
      <p class="skills-label">${hasUserProjects ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : 'A peek'}</p>
    </div>
    <div class="projects-grid">
      ${projects.slice(0, 6).map((p, i) => renderProjectCard(p, i)).join('')}
    </div>
  </div>
</section>

<section class="close-cta">
  <div class="container">
    <p class="hero-eyebrow eyebrow-light rv">— Now booking projects —</p>
    <h2 class="rv d1">Let's build something good together.</h2>
    <p class="rv d2">Tell me about your project and we'll see if it's a fit. I usually reply within a day.</p>
    <a href="/contact" class="btn-w rv d3">Start a conversation <svg viewBox="0 0 14 10" fill="currentColor"><path d="M8.5 0l4.8 5L8.5 10l-.7-.7L11.4 5.7H0v-1.4h11.4L7.8.7z"/></svg></a>
  </div>
</section>`;
  return wrap(c, '/', body);
}

function generateAboutPage(c) {
  const aboutBody = c.portfolioAbout || c.aboutText || `${c.businessName} is a ${c.industry || 'creative professional'}.`;
  const skills = Array.isArray(c.services) && c.services.length ? c.services : [];
  const yearsLine = c.yearsExperience ? `${c.yearsExperience}+ years` : '';

  const body = `
<section class="about-section container">
  <p class="about-eyebrow rv">— About —</p>
  <h1 class="rv d1">A bit about ${esc((c.businessName || '').split(' ')[0] || 'me')}.</h1>
  <div class="about-body rv d2">
    <p>${esc(aboutBody)}</p>
    ${c.industry ? `<p>Working in ${esc(c.industry)} ${yearsLine ? `for ${esc(yearsLine)}, ` : ''}building work that's clear, honest, and useful.</p>` : ''}
  </div>
  <div class="about-detail-grid rv d3">
    ${skills.length ? `
    <div class="about-detail">
      <h4>Toolkit</h4>
      <p>${esc(skills.join(' · '))}</p>
    </div>` : ''}
    ${c.contactEmail ? `
    <div class="about-detail">
      <h4>Reach me</h4>
      <p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p>
    </div>` : ''}
  </div>
</section>`;
  return wrap(c, '/about', body);
}

function generateContactPage(c) {
  const body = `
<section class="contact-section container">
  <p class="about-eyebrow rv">— Contact —</p>
  <h1 class="rv d1">Let's talk.</h1>
  <p class="lead rv d2">Tell me about your project, your timeline, and anything else worth knowing. I read everything that comes through.</p>

  <div class="contact-grid rv d3">
    ${c.contactEmail ? `
    <div class="contact-block">
      <h4>Email</h4>
      <p><a href="mailto:${attr(c.contactEmail)}">${esc(c.contactEmail)}</a></p>
    </div>` : ''}
    ${c.contactPhone ? `
    <div class="contact-block">
      <h4>Phone</h4>
      <p><a href="tel:${attr(c.contactPhone)}">${esc(c.contactPhone)}</a></p>
    </div>` : ''}
    ${c.instagramHandle ? `
    <div class="contact-block">
      <h4>Instagram</h4>
      <p><a href="https://instagram.com/${attr(c.instagramHandle)}" target="_blank" rel="noopener">@${esc(c.instagramHandle)}</a></p>
    </div>` : ''}
  </div>

  <form class="form rv d3" id="cf">
    <input type="text" name="name" placeholder="Your name" required>
    <input type="email" name="email" placeholder="Your email" required>
    <textarea name="message" placeholder="What do you want to build?" required></textarea>
    ${consentField()}
    <button type="submit" id="cf-btn">Send message</button>
    <p class="form-status" id="cf-status"></p>
  </form>
</section>

<script>
(function(){
  const form = document.getElementById('cf');
  const status = document.getElementById('cf-status');
  const btn = document.getElementById('cf-btn');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const data = new FormData(form);
    if (!data.get('consent')) { status.textContent = 'Please confirm consent first.'; status.className = 'form-status err'; return; }
    btn.disabled = true; status.textContent = 'Sending…'; status.className = 'form-status';
    fetch('${attr(PUBLIC_API_BASE)}/api/leads/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: '${attr(c.siteId || '')}',
        name: data.get('name'), email: data.get('email'),
        message: data.get('message'),
        consent: !!data.get('consent'),
      }),
    }).then((r) => r.json()).then((j) => {
      if (j && j.ok) { status.textContent = 'Got it — I\\'ll reply soon.'; status.className = 'form-status ok'; form.reset(); }
      else { status.textContent = 'Send failed — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; }
    }).catch(() => { status.textContent = 'Network error — try emailing directly.'; status.className = 'form-status err'; btn.disabled = false; });
  });
})();
</script>`;
  return wrap(c, '/contact', body);
}

function generatePrivacyPage(c) {
  const body = `
<section class="about-section container">
  <p class="about-eyebrow">— Privacy —</p>
  <h1>Privacy</h1>
  <div class="about-body" style="margin-top:32px">${generatePrivacyBody(c)}</div>
</section>`;
  return wrap(c, '/privacy', body);
}

function generateThankYouPage(c) {
  const body = `
<section class="about-section container" style="text-align:center">
  <p class="about-eyebrow">— Thank you —</p>
  <h1>Got your message.</h1>
  <p style="font-size:18px;color:var(--mute);margin-top:24px">I'll get back to you within a day or two. — ${esc((c.businessName || '').split(' ')[0] || c.businessName)}</p>
  <p style="margin-top:48px"><a href="/" class="hero-cta" style="background:var(--ink);color:var(--paper);">Back to work</a></p>
</section>`;
  return wrap(c, '/thank-you', body);
}

// ─── entry ─────────────────────────────────────────────────────────────────
function generatePortfolioPages(config /* watermark unused — banner pulled from config */) {
  return {
    '/index.html': generateHomePage(config),
    '/about/index.html': generateAboutPage(config),
    '/contact/index.html': generateContactPage(config),
    '/thank-you/index.html': generateThankYouPage(config),
    '/privacy/index.html': generatePrivacyPage(config),
  };
}

module.exports = { generatePortfolioPages };
