const axios = require('axios');
const crypto = require('crypto');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

const NETLIFY_API = 'https://api.netlify.com/api/v1';

async function deployToNetlify(siteConfig, existingSiteId = null, { watermark = false } = {}) {
  if (!env.netlify.token) throw new Error('NETLIFY_TOKEN is not configured');
  const headers = { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/json' };
  try {
    const files = generateAllPages(siteConfig, watermark);
    let siteId, siteName;

    if (existingSiteId) {
      // Redeploy to existing site (same URL)
      siteId = existingSiteId;
      const siteInfo = await axios.get(`${NETLIFY_API}/sites/${siteId}`, { headers });
      siteName = siteInfo.data.name;
      logger.info(`[NETLIFY] Redeploying to existing site: ${siteName} (${siteId})`);
    } else {
      // Create a new site
      logger.info('[NETLIFY] Creating new site...');
      const siteResponse = await axios.post(`${NETLIFY_API}/sites`, { name: `preview-${Date.now()}` }, { headers });
      siteId = siteResponse.data.id;
      siteName = siteResponse.data.name;
      logger.info(`[NETLIFY] Site created: ${siteName} (${siteId})`);
    }

    const fileDigests = {};
    for (const [fp, content] of Object.entries(files)) {
      fileDigests[fp] = crypto.createHash('sha1').update(content).digest('hex');
    }
    logger.info(`[NETLIFY] Creating deploy with ${Object.keys(files).length} file(s)...`);
    const deployResponse = await axios.post(`${NETLIFY_API}/sites/${siteId}/deploys`, { files: fileDigests }, { headers });
    const deployId = deployResponse.data.id;
    const requiredFiles = deployResponse.data.required || [];
    for (const [fp, content] of Object.entries(files)) {
      const sha1 = crypto.createHash('sha1').update(content).digest('hex');
      if (requiredFiles.length === 0 || requiredFiles.includes(sha1)) {
        logger.info(`[NETLIFY] Uploading ${fp}...`);
        await axios.put(`${NETLIFY_API}/deploys/${deployId}/files${fp}`, content, { headers: { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/octet-stream' } });
      }
    }
    logger.info('[NETLIFY] Waiting for deploy to be ready...');
    const previewUrl = await waitForDeploy(deployId, headers);
    logger.info(`[NETLIFY] Deploy ready: ${previewUrl}`);
    return { previewUrl, netlifySiteId: siteId, netlifySubdomain: siteName };
  } catch (error) {
    logger.error('[NETLIFY] Deployment failed:', { message: error.message, status: error.response?.status, data: JSON.stringify(error.response?.data || {}) });
    throw error;
  }
}

async function waitForDeploy(deployId, headers) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await axios.get(`${NETLIFY_API}/deploys/${deployId}`, { headers });
      if (r.data.state === 'ready') return `https://${r.data.ssl_url || r.data.url}`.replace(/^https:\/\/https:\/\//, 'https://');
      if (r.data.state === 'error') throw new Error(`Deploy failed: ${r.data.error_message || 'Unknown'}`);
    } catch (e) { if (e.message?.includes('Deploy failed')) throw e; }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Deploy timed out after 3 minutes');
}

// ─── Icons ──────────────────────────────────────────────────────────────────
const ICON_MAP = {
  code: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>',
  chart: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
  palette: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>',
  shield: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>',
  globe: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
  megaphone: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>',
  camera: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>',
  wrench: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
  lightbulb: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>',
  users: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>',
  rocket: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>',
  heart: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>',
  star: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>',
  zap: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>',
  target: '<circle cx="12" cy="12" r="9" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="5" stroke-width="1.5" fill="none"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  layers: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>',
};
function getIcon(n) { return `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">${ICON_MAP[n]||ICON_MAP.star}</svg>`; }

// ─── Styles ─────────────────────────────────────────────────────────────────
function getStyles(pc, ac) {
  return `
:root{--pc:${pc};--ac:${ac}}*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}body{font-family:'Inter',sans-serif;color:#1a1a2e;overflow-x:hidden}
@keyframes fadeUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeDown{from{opacity:0;transform:translateY(-30px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
@keyframes floatSlow{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-20px) rotate(3deg)}}
@keyframes pulseGlow{0%,100%{box-shadow:0 0 20px rgba(255,255,255,0.1)}50%{box-shadow:0 0 50px rgba(255,255,255,0.3)}}
@keyframes morphBlob{0%,100%{border-radius:60% 40% 30% 70%/60% 30% 70% 40%}50%{border-radius:30% 60% 70% 40%/50% 60% 30% 60%}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes gridPulse{0%,100%{opacity:0.03}50%{opacity:0.06}}
@keyframes borderFlow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes pageIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
body{animation:pageIn 0.5s ease-out}
.glass{background:rgba(255,255,255,0.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12)}
.rv{opacity:0;transform:translateY(40px);transition:all 0.8s cubic-bezier(0.16,1,0.3,1)}.rv.v{opacity:1;transform:translateY(0)}
.rl{opacity:0;transform:translateX(-40px);transition:all 0.8s cubic-bezier(0.16,1,0.3,1)}.rl.v{opacity:1;transform:translateX(0)}
.rr{opacity:0;transform:translateX(40px);transition:all 0.8s cubic-bezier(0.16,1,0.3,1)}.rr.v{opacity:1;transform:translateX(0)}
.rs{opacity:0;transform:scale(0.9);transition:all 0.8s cubic-bezier(0.16,1,0.3,1)}.rs.v{opacity:1;transform:scale(1)}
.d1{transition-delay:.1s}.d2{transition-delay:.2s}.d3{transition-delay:.3s}.d4{transition-delay:.4s}.d5{transition-delay:.5s}.d6{transition-delay:.6s}.d7{transition-delay:.7s}
.blob{border-radius:60% 40% 30% 70%/60% 30% 70% 40%;animation:morphBlob 8s ease-in-out infinite}
.hl{transition:all 0.4s cubic-bezier(0.16,1,0.3,1)}.hl:hover{transform:translateY(-8px);box-shadow:0 25px 60px rgba(0,0,0,0.12)}
.tilt{transition:transform 0.4s ease}.tilt:hover{transform:perspective(800px) rotateY(-4deg) rotateX(4deg) translateY(-6px);box-shadow:0 25px 60px rgba(0,0,0,0.15)}
.sect{padding:100px 24px;position:relative}@media(min-width:768px){.sect{padding:120px 48px}}
.ctn{max-width:1200px;margin:0 auto}
.btn-p{display:inline-flex;align-items:center;gap:8px;padding:16px 32px;font-size:16px;font-weight:600;color:#fff;background:linear-gradient(135deg,${pc},${pc}dd);border:none;border-radius:50px;cursor:pointer;transition:all 0.4s cubic-bezier(0.16,1,0.3,1);text-decoration:none;position:relative;overflow:hidden}
.btn-p::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,transparent,rgba(255,255,255,0.15),transparent);transform:translateX(-100%);transition:transform 0.6s}.btn-p:hover::before{transform:translateX(100%)}
.btn-p:hover{transform:translateY(-3px);box-shadow:0 15px 40px ${pc}44}
.btn-s{display:inline-flex;align-items:center;gap:8px;padding:16px 32px;font-size:16px;font-weight:600;color:${pc};background:transparent;border:2px solid ${pc};border-radius:50px;cursor:pointer;transition:all 0.4s;text-decoration:none}.btn-s:hover{background:${pc};color:#fff;transform:translateY(-3px)}
.btn-w{display:inline-flex;align-items:center;gap:8px;padding:16px 32px;font-size:16px;font-weight:600;color:${pc};background:#fff;border:none;border-radius:50px;cursor:pointer;transition:all 0.4s cubic-bezier(0.16,1,0.3,1);text-decoration:none}.btn-w:hover{transform:translateY(-3px);box-shadow:0 15px 40px rgba(255,255,255,0.3)}
.glow-card{position:relative;background:#fff;border-radius:20px;padding:40px 32px;border:1px solid #f0f0f0;overflow:hidden;transition:all 0.5s}
.glow-card::before{content:'';position:absolute;top:-2px;left:-2px;right:-2px;bottom:-2px;background:linear-gradient(135deg,${pc},${ac},${pc});border-radius:inherit;z-index:-1;opacity:0;transition:opacity 0.5s;background-size:200% 200%;animation:borderFlow 3s ease infinite}
.glow-card:hover::before{opacity:1}.glow-card:hover{border-color:transparent;box-shadow:0 20px 60px rgba(0,0,0,0.08)}
.dot-grid{background-image:radial-gradient(circle,${pc}15 1px,transparent 1px);background-size:32px 32px;animation:gridPulse 4s ease-in-out infinite}
.noise::after{content:'';position:absolute;inset:0;opacity:0.03;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");pointer-events:none}
.nav{position:fixed;top:0;left:0;right:0;z-index:1000;transition:all 0.4s;padding:20px 24px}
.nav.scrolled,.nav.nav-dark{background:rgba(255,255,255,0.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 1px 30px rgba(0,0,0,0.08);padding:12px 24px}
.nav.scrolled .nav-l,.nav.nav-dark .nav-l{color:#333!important}.nav.scrolled .nav-l:hover,.nav.nav-dark .nav-l:hover{color:${pc}!important}
.nav.scrolled .nav-b,.nav.nav-dark .nav-b{color:${pc}!important}
.nav-i{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
.nav-b{font-size:22px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-0.5px;transition:color 0.3s}
.nav-ls{display:none;gap:32px;align-items:center}@media(min-width:768px){.nav-ls{display:flex}}
.nav-l{color:rgba(255,255,255,0.85);text-decoration:none;font-size:14px;font-weight:500;transition:all 0.3s;position:relative}
.nav-l:hover{color:#fff}.nav-l::after{content:'';position:absolute;bottom:-4px;left:0;width:0;height:2px;background:${ac};transition:width 0.3s;border-radius:2px}.nav-l:hover::after{width:100%}
.nav.nav-dark .nav-l:hover{color:${pc}!important}
.mt{display:flex;flex-direction:column;gap:5px;cursor:pointer;padding:8px}@media(min-width:768px){.mt{display:none}}
.mt span{display:block;width:24px;height:2px;background:#fff;transition:all 0.3s;border-radius:2px}.nav.scrolled .mt span,.nav.nav-dark .mt span{background:#333}
.mm{display:none;position:fixed;inset:0;background:rgba(10,10,26,0.98);z-index:1100;flex-direction:column;align-items:center;justify-content:center;gap:0}
.mm.open{display:flex}.mm a{color:#fff;font-size:28px;font-weight:600;text-decoration:none;padding:16px;opacity:0;transform:translateY(20px);transition:all 0.4s}
.mm.open a{opacity:1;transform:translateY(0)}.mm.open a:nth-child(1){transition-delay:0.1s}.mm.open a:nth-child(2){transition-delay:0.15s}.mm.open a:nth-child(3){transition-delay:0.2s}.mm.open a:nth-child(4){transition-delay:0.25s}.mm.open a:nth-child(5){transition-delay:0.3s}
.mm a:hover{color:${ac}}.mc{position:absolute;top:24px;right:24px;color:#fff;font-size:36px;cursor:pointer;background:none;border:none;z-index:1101;transition:transform 0.3s}.mc:hover{transform:rotate(90deg)}
.scroll-bar{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,${pc},${ac});z-index:1001;transition:width 0.1s;width:0}
.btt{position:fixed;bottom:32px;right:32px;width:48px;height:48px;border-radius:50%;background:${pc};color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:998;opacity:0;transform:translateY(20px);transition:all 0.4s;border:none;box-shadow:0 8px 24px ${pc}44}
.btt.show{opacity:1;transform:translateY(0)}.btt:hover{transform:translateY(-4px);box-shadow:0 12px 32px ${pc}66}
.marquee-strip{overflow:hidden;padding:20px 0;background:#fafafa;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0}
.marquee-track{display:flex;animation:marquee 25s linear infinite;width:max-content}
.marquee-item{padding:0 48px;font-size:15px;font-weight:600;color:#ccc;white-space:nowrap;display:flex;align-items:center;gap:16px;text-transform:uppercase;letter-spacing:2px}
.marquee-item .dot{width:6px;height:6px;border-radius:50%;background:${pc}44}
.faq-item{background:#fff;border-radius:16px;border:1px solid #eee;overflow:hidden;transition:border-color 0.3s}
.faq-item:hover{border-color:${pc}33}
.faq-q{padding:24px 32px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:17px;font-weight:700;color:#1a1a2e;transition:color 0.3s}
.faq-q:hover{color:${pc}}
.faq-q svg{flex-shrink:0;transition:transform 0.3s;color:${pc}}
.faq-a{max-height:0;overflow:hidden;transition:max-height 0.4s cubic-bezier(0.16,1,0.3,1),padding 0.3s}
.faq-item.open .faq-a{max-height:300px;padding:0 32px 24px}
.faq-item.open .faq-q svg{transform:rotate(180deg)}
.cursor-glow{position:fixed;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,${pc}08 0%,transparent 70%);pointer-events:none;z-index:0;transform:translate(-50%,-50%);transition:opacity 0.3s;opacity:0}
.cursor-glow.active{opacity:1}
@media(min-width:768px){.md2{grid-template-columns:1fr 1fr!important}}
@media(max-width:640px){.mobile-1col{grid-template-columns:1fr!important}.mobile-stack{display:flex!important;flex-direction:column!important}.sect{padding:60px 16px}}
`;
}

// ─── Script ─────────────────────────────────────────────────────────────────
function getScript() {
  return `<script>
const ob=new IntersectionObserver(e=>{e.forEach(x=>{if(x.isIntersecting)x.target.classList.add('v')})},{threshold:0.08,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.rv,.rl,.rr,.rs').forEach(el=>ob.observe(el));
const nav=document.querySelector('.nav');
const btt=document.querySelector('.btt');
const sb=document.querySelector('.scroll-bar');
const cg=document.querySelector('.cursor-glow');
window.addEventListener('scroll',()=>{
  const s=window.scrollY;
  if(nav)nav.classList.toggle('scrolled',s>50);
  if(btt)btt.classList.toggle('show',s>500);
  if(sb){const h=document.documentElement.scrollHeight-window.innerHeight;sb.style.width=(s/h*100)+'%'}
});
if(btt)btt.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
const mt=document.querySelector('.mt'),mm=document.querySelector('.mm'),mc=document.querySelector('.mc');
if(mt&&mm){mt.addEventListener('click',()=>mm.classList.add('open'));if(mc)mc.addEventListener('click',()=>mm.classList.remove('open'));mm.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>mm.classList.remove('open')))}
document.querySelectorAll('[data-count]').forEach(el=>{
  const cob=new IntersectionObserver(e=>{e.forEach(x=>{if(x.isIntersecting){const t=el.getAttribute('data-count'),n=parseInt(t);if(isNaN(n)){el.textContent=t;return}let c=0;const inc=Math.max(1,Math.floor(n/40));const tm=setInterval(()=>{c+=inc;if(c>=n){el.textContent=t;clearInterval(tm)}else{el.textContent=c+(t.includes('+')?'+':t.includes('%')?'%':'')}},30);cob.unobserve(el)}})},{threshold:0.5});cob.observe(el)});
const hero=document.querySelector('.hero-section');
if(hero)hero.addEventListener('mousemove',e=>{hero.querySelectorAll('.ps').forEach((s,i)=>{const sp=(i+1)*10;const x=(e.clientX/window.innerWidth-0.5)*2;const y=(e.clientY/window.innerHeight-0.5)*2;s.style.transform='translate('+x*sp+'px,'+y*sp+'px)'})});
if(cg)document.addEventListener('mousemove',e=>{cg.style.left=e.clientX+'px';cg.style.top=e.clientY+'px';cg.classList.add('active')});
document.querySelectorAll('.faq-q').forEach(q=>{q.addEventListener('click',()=>{const item=q.parentElement;document.querySelectorAll('.faq-item').forEach(f=>{if(f!==item)f.classList.remove('open')});item.classList.toggle('open')})});
document.querySelectorAll('.tilt').forEach(card=>{card.addEventListener('mousemove',e=>{const r=card.getBoundingClientRect();const x=(e.clientX-r.left)/r.width;const y=(e.clientY-r.top)/r.height;card.style.transform='perspective(800px) rotateY('+(x-0.5)*8+'deg) rotateX('+((0.5-y)*8)+'deg) translateY(-6px)'});card.addEventListener('mouseleave',()=>{card.style.transform=''})});
</script>`;
}

// ─── Navbar ─────────────────────────────────────────────────────────────────
function getPages(c) {
  const pages=[{n:'Home',h:'/'}];
  if((c.services||[]).length>0) pages.push({n:'Services',h:'/services'});
  pages.push({n:'About',h:'/about'});
  pages.push({n:'Contact',h:'/contact'});
  return pages;
}

function getNav(c, cur) {
  const pages=getPages(c);
  const isDark = cur !== '/';
  return `
<div class="scroll-bar"></div>
<div class="cursor-glow"></div>
<nav class="nav${isDark?' nav-dark':''}"><div class="nav-i">
  <a href="/" class="nav-b">${esc(c.businessName)}</a>
  <div class="nav-ls">${pages.map(p=>`<a href="${p.h}" class="nav-l${p.h===cur?' font-semibold':''}">${p.n}</a>`).join('')}<a href="/contact" class="btn-p" style="padding:10px 24px;font-size:14px">Get Started</a></div>
  <div class="mt" aria-label="Menu"><span></span><span></span><span></span></div>
</div></nav>
<div class="mm"><button class="mc" aria-label="Close">&times;</button>${pages.map(p=>`<a href="${p.h}">${p.n}</a>`).join('')}<a href="/contact" class="btn-p" style="margin-top:16px">Get Started</a></div>`;
}

// ─── Footer ─────────────────────────────────────────────────────────────────
function getFoot(c) {
  const pc=c.primaryColor||'#2563EB';
  return `
<footer style="background:#0a0a1a;color:#999;padding:80px 24px 40px"><div class="ctn">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:48px;margin-bottom:48px">
    <div><p style="font-size:24px;font-weight:800;color:#fff;margin-bottom:12px">${esc(c.businessName)}</p><p style="font-size:14px;line-height:1.8;opacity:0.6">${esc(c.footerTagline||'')}</p></div>
    <div><p style="font-weight:600;color:#fff;margin-bottom:16px;font-size:14px;text-transform:uppercase;letter-spacing:1px">Pages</p><div style="display:flex;flex-direction:column;gap:10px">
      ${getPages(c).map(p=>`<a href="${p.h}" style="color:#999;text-decoration:none;font-size:14px;transition:color 0.3s">${p.n}</a>`).join('')}
    </div></div>
    <div><p style="font-weight:600;color:#fff;margin-bottom:16px;font-size:14px;text-transform:uppercase;letter-spacing:1px">Contact</p><div style="display:flex;flex-direction:column;gap:10px">
      ${c.contactEmail?`<a href="mailto:${esc(c.contactEmail)}" style="color:#999;text-decoration:none;font-size:14px">${esc(c.contactEmail)}</a>`:''}
      ${c.contactPhone?`<a href="tel:${esc(c.contactPhone)}" style="color:#999;text-decoration:none;font-size:14px">${esc(c.contactPhone)}</a>`:''}
      ${c.contactAddress?`<p style="font-size:14px">${esc(c.contactAddress)}</p>`:''}
    </div></div>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
    <p style="font-size:12px;opacity:0.4">Built with care. All rights reserved.</p><p style="font-size:12px;opacity:0.4">${esc(c.businessName)} &copy; ${new Date().getFullYear()}</p>
  </div>
</div></footer>
<button class="btt" aria-label="Back to top"><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg></button>`;
}

// ─── Marquee ────────────────────────────────────────────────────────────────
function getMarquee(c) {
  const items = (c.services||[]).map(s=>s.title).concat([c.businessName, c.industry||'Excellence']).filter(Boolean);
  const track = items.map(t=>`<span class="marquee-item"><span class="dot"></span>${esc(t)}</span>`).join('');
  return `<div class="marquee-strip"><div class="marquee-track">${track}${track}</div></div>`;
}

// ─── Page Wrap ──────────────────────────────────────────────────────────────
function wrap(c, cur, body) {
  const pc=c.primaryColor||'#2563EB', ac=c.accentColor||'#60A5FA';
  const title = cur==='/'?'':" - "+cur.replace('/','').charAt(0).toUpperCase()+cur.slice(2);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(c.businessName||'Business')}${title}</title><meta name="description" content="${esc(c.tagline||'')}">
<script src="https://cdn.tailwindcss.com"><\/script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>${getStyles(pc,ac)}</style></head><body>${getNav(c,cur)}<main>${body}</main>${getFoot(c)}${getScript()}</body></html>`;
}

// ─── Arrow SVG shortcut ─────────────────────────────────────────────────────
const ARR = '<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>';
const CHK = '<svg style="flex-shrink:0;margin-top:2px" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';

// ═══════════════════════════════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════════════════════════════
function generateHomePage(c) {
  const pc=c.primaryColor||'#2563EB', ac=c.accentColor||'#60A5FA';
  const badges = (c.heroFeatures||[]).map(f=>`<span class="glass" style="padding:8px 20px;border-radius:50px;font-size:13px;font-weight:500;letter-spacing:0.5px">${esc(f)}</span>`).join('');

  const services = (c.services||[]).slice(0,6).map((s,i)=>`
    <div class="glow-card tilt rv d${(i%4)+1}">
      <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,${pc}15,${pc}08);display:flex;align-items:center;justify-content:center;color:${pc};margin-bottom:24px;transition:all 0.4s">${getIcon(s.icon||'star')}</div>
      <h3 style="font-size:20px;font-weight:700;margin-bottom:12px;color:#1a1a2e">${esc(s.title)}</h3>
      <p style="font-size:15px;line-height:1.7;color:#666;margin-bottom:20px">${esc(s.shortDescription||s.description)}</p>
      <a href="/services" style="font-size:14px;font-weight:600;color:${pc};text-decoration:none;display:inline-flex;align-items:center;gap:6px">Learn more ${ARR}</a>
    </div>`).join('');

  const stats = (c.stats||[]).map((s,i)=>`
    <div class="rv d${i+1}" style="text-align:center">
      <p data-count="${esc(s.number)}" style="font-size:52px;font-weight:900;background:linear-gradient(135deg,${pc},${ac});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1">0</p>
      <p style="font-size:14px;color:#666;margin-top:8px;font-weight:500">${esc(s.label)}</p>
    </div>`).join('');

  const starSVG = `<svg width="18" height="18" fill="${pc}" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
  const stars5 = starSVG.repeat(5);
  const testimonials = (c.testimonials||[]).map((t,i)=>`
    <div class="rv d${i+1} hl" style="background:#fff;border-radius:20px;padding:40px;border:1px solid #f0f0f0;position:relative">
      <div style="position:absolute;top:20px;right:24px;font-size:64px;font-weight:900;color:${pc}08;line-height:1;font-family:Georgia,serif">"</div>
      <div style="display:flex;gap:3px;margin-bottom:20px">${stars5}</div>
      <p style="font-size:16px;line-height:1.8;color:#444;font-style:italic;margin-bottom:24px;position:relative;z-index:1">"${esc(t.quote)}"</p>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,${pc},${ac});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px">${esc(t.name?.charAt(0)||'U')}</div>
        <div><p style="font-weight:700;font-size:15px;color:#1a1a2e">${esc(t.name)}</p><p style="font-size:13px;color:#888">${esc(t.role)}</p></div>
      </div>
    </div>`).join('');

  const process = (c.processSteps||[]).map((s,i)=>`
    <div class="rv d${i+1}" style="text-align:center;position:relative">
      <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,${pc},${ac});display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:800;margin:0 auto 20px;box-shadow:0 8px 24px ${pc}33">${i+1}</div>
      <h4 style="font-size:18px;font-weight:700;margin-bottom:8px;color:#1a1a2e">${esc(s.title)}</h4>
      <p style="font-size:14px;color:#666;line-height:1.6">${esc(s.description)}</p>
    </div>`).join('');

  const body = `
    <section class="hero-section" style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;position:relative;overflow:hidden;background:linear-gradient(135deg,${pc} 0%,${pc}dd 40%,${ac}88 100%)">
      <div class="noise" style="position:absolute;inset:0;pointer-events:none"></div>
      <div class="dot-grid" style="position:absolute;inset:0;pointer-events:none"></div>
      <div style="position:absolute;inset:0;overflow:hidden">
        <div class="ps blob" style="position:absolute;top:-10%;right:-5%;width:500px;height:500px;background:${ac};opacity:0.08"></div>
        <div class="ps blob" style="position:absolute;bottom:-15%;left:-10%;width:400px;height:400px;background:#fff;opacity:0.06;animation-direction:reverse"></div>
        <div class="ps" style="position:absolute;top:20%;left:10%;width:200px;height:200px;border-radius:50%;border:1px solid rgba(255,255,255,0.08);animation:float 7s ease-in-out infinite"></div>
        <div class="ps" style="position:absolute;bottom:30%;right:15%;width:120px;height:120px;border-radius:50%;border:1px solid rgba(255,255,255,0.06);animation:floatSlow 9s ease-in-out infinite"></div>
        <div style="position:absolute;top:35%;left:65%;width:6px;height:6px;background:rgba(255,255,255,0.3);border-radius:50%;animation:float 4s ease-in-out infinite"></div>
        <div style="position:absolute;top:55%;left:25%;width:4px;height:4px;background:rgba(255,255,255,0.2);border-radius:50%;animation:floatSlow 5s ease-in-out infinite"></div>
        <div style="position:absolute;top:70%;right:35%;width:5px;height:5px;background:rgba(255,255,255,0.15);border-radius:50%;animation:float 6s ease-in-out infinite 1s"></div>
      </div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.12) 0%,transparent 30%,transparent 70%,rgba(0,0,0,0.25) 100%)"></div>
      <div style="position:relative;z-index:10;padding:0 24px;max-width:900px">
        ${badges?`<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:32px;animation:fadeDown 0.8s ease-out forwards">${badges}</div>`:''}
        <h1 style="font-size:clamp(36px,7vw,76px);font-weight:900;line-height:1.05;letter-spacing:-2px;margin-bottom:24px;animation:fadeUp 0.8s ease-out 0.2s both">${esc(c.headline)}</h1>
        <p style="font-size:clamp(16px,2.5vw,22px);opacity:0.85;max-width:650px;margin:0 auto 40px;line-height:1.6;animation:fadeUp 0.8s ease-out 0.4s both">${esc(c.tagline)}</p>
        <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap;animation:fadeUp 0.8s ease-out 0.6s both">
          <a href="/contact" class="btn-w" style="animation:pulseGlow 3s ease-in-out infinite">${esc(c.ctaButton)} ${ARR}</a>
          ${(c.services||[]).length>0?`<a href="/services" class="btn-s" style="color:#fff;border-color:rgba(255,255,255,0.3)">Our Services</a>`:''}
        </div>
      </div>
      <div style="position:absolute;bottom:32px;left:50%;transform:translateX(-50%);animation:fadeIn 1s ease-out 1s both">
        <div style="width:28px;height:44px;border:2px solid rgba(255,255,255,0.3);border-radius:14px;display:flex;justify-content:center;padding-top:8px"><div style="width:3px;height:10px;background:rgba(255,255,255,0.6);border-radius:3px;animation:float 2s ease-in-out infinite"></div></div>
      </div>
    </section>

    ${(c.stats||[]).length>0?`<section style="padding:56px 24px;background:#fff;border-bottom:1px solid #f0f0f0"><div class="ctn" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,45%),1fr));gap:32px">${stats}</div></section>`:''}

    ${getMarquee(c)}

    ${(c.services||[]).length>0?`<section class="sect" style="background:#fafafa"><div class="ctn">
      <div class="rv" style="text-align:center;margin-bottom:64px">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">What We Do</span>
        <h2 style="font-size:clamp(28px,4vw,48px);font-weight:800;color:#1a1a2e;letter-spacing:-1px">${esc(c.servicesTitle)}</h2>
        <div style="width:60px;height:4px;border-radius:2px;background:linear-gradient(90deg,${pc},${ac});margin:20px auto 0"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));gap:28px">${services}</div>
      <div class="rv d4" style="text-align:center;margin-top:48px"><a href="/services" class="btn-p">View All Services ${ARR}</a></div>
    </div></section>`:''}

    <section class="sect" style="background:#fff"><div class="ctn">
      <div style="display:grid;grid-template-columns:1fr;gap:64px;align-items:center" class="md2">
        <div class="rl">
          <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">About Us</span>
          <h2 style="font-size:clamp(28px,4vw,44px);font-weight:800;color:#1a1a2e;letter-spacing:-1px;margin-bottom:24px">${esc(c.aboutTitle)}</h2>
          <div style="width:60px;height:4px;border-radius:2px;background:linear-gradient(90deg,${pc},${ac});margin-bottom:24px"></div>
          <p style="font-size:17px;line-height:1.8;color:#555;margin-bottom:32px">${esc(c.aboutText)}</p>
          <a href="/about" class="btn-s">Learn More About Us</a>
        </div>
        <div class="rr mobile-1col" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${(c.whyChooseUs||[]).slice(0,4).map((w,i)=>`
            <div class="hl d${i+1}" style="background:#fafafa;border-radius:16px;padding:28px;border:1px solid #f0f0f0">
              <div style="width:40px;height:40px;border-radius:10px;background:${pc}10;display:flex;align-items:center;justify-content:center;color:${pc};margin-bottom:16px">${CHK}</div>
              <h4 style="font-size:16px;font-weight:700;color:#1a1a2e;margin-bottom:8px">${esc(w.title)}</h4>
              <p style="font-size:13px;color:#888;line-height:1.6">${esc(w.description)}</p>
            </div>`).join('')}
        </div>
      </div>
    </div></section>

    ${(c.processSteps||[]).length>0?`<section class="sect" style="background:#fafafa"><div class="ctn">
      <div class="rv" style="text-align:center;margin-bottom:64px">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">How It Works</span>
        <h2 style="font-size:clamp(28px,4vw,44px);font-weight:800;color:#1a1a2e;letter-spacing:-1px">Our Process</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:40px">${process}</div>
    </div></section>`:''}

    ${(c.testimonials||[]).length>0?`<section class="sect" style="background:#fff"><div class="ctn">
      <div class="rv" style="text-align:center;margin-bottom:64px">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">Testimonials</span>
        <h2 style="font-size:clamp(28px,4vw,44px);font-weight:800;color:#1a1a2e;letter-spacing:-1px">What Our Clients Say</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));gap:28px">${testimonials}</div>
    </div></section>`:''}

    <section class="sect" style="background:linear-gradient(135deg,${pc} 0%,${pc}dd 50%,${ac}88 100%);color:#fff;text-align:center;position:relative;overflow:hidden">
      <div class="noise" style="position:absolute;inset:0"></div>
      <div class="dot-grid" style="position:absolute;inset:0;opacity:0.5"></div>
      <div style="position:absolute;inset:0;overflow:hidden"><div class="blob" style="position:absolute;top:-20%;right:-10%;width:400px;height:400px;background:${ac};opacity:0.1"></div><div class="blob" style="position:absolute;bottom:-20%;left:-10%;width:350px;height:350px;background:#fff;opacity:0.05"></div></div>
      <div class="ctn" style="position:relative;z-index:10"><div class="rv">
        <h2 style="font-size:clamp(28px,5vw,52px);font-weight:900;margin-bottom:20px;letter-spacing:-1px">${esc(c.ctaTitle)}</h2>
        <p style="font-size:20px;opacity:0.85;max-width:600px;margin:0 auto 40px;line-height:1.6">${esc(c.ctaText)}</p>
        <a href="/contact" class="btn-w" style="font-size:18px;padding:18px 40px">${esc(c.ctaButton)} ${ARR}</a>
      </div></div>
    </section>`;
  return wrap(c, '/', body);
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICES PAGE
// ═══════════════════════════════════════════════════════════════════════════
function generateServicesPage(c) {
  const pc=c.primaryColor||'#2563EB', ac=c.accentColor||'#60A5FA';
  const detailed = (c.services||[]).map((s,i)=>{
    const feats = (s.features||[]).map(f=>`<li style="display:flex;align-items:flex-start;gap:12px;font-size:15px;color:#555">${CHK} ${esc(f)}</li>`).join('');
    const isEven = i%2===0;
    const bg = i%2===0?'#fff':'#fafafa';
    return `
    <div class="sect" style="background:${bg}" id="service-${i}">
      <div class="ctn">
        <div style="display:grid;grid-template-columns:1fr;gap:56px;align-items:center" class="md2">
          <div class="${isEven?'rl':'rr'}" style="order:${isEven?1:2}">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
              <div style="width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,${pc},${ac});display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 8px 24px ${pc}33">${getIcon(s.icon||'star')}</div>
              <span style="font-size:72px;font-weight:900;color:${pc}08;line-height:1">${String(i+1).padStart(2,'0')}</span>
            </div>
            <h3 style="font-size:clamp(24px,3vw,36px);font-weight:800;color:#1a1a2e;margin-bottom:16px;letter-spacing:-0.5px">${esc(s.title)}</h3>
            <p style="font-size:17px;line-height:1.8;color:#555;margin-bottom:24px">${esc(s.fullDescription||s.description)}</p>
            <a href="/contact" class="btn-p">Get Started ${ARR}</a>
          </div>
          <div class="${isEven?'rr':'rl'}" style="order:${isEven?2:1}">
            <div style="background:${isEven?'#fafafa':'#fff'};border-radius:24px;padding:40px;border:1px solid #f0f0f0">
              <h4 style="font-size:16px;font-weight:700;color:#1a1a2e;margin-bottom:20px;text-transform:uppercase;letter-spacing:1px">Key Features</h4>
              ${feats?`<ul style="display:flex;flex-direction:column;gap:16px;list-style:none">${feats}</ul>`:''}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  const cards = (c.services||[]).map((s,i)=>`
    <a href="#service-${i}" class="glow-card tilt rv d${i+1}" style="text-decoration:none;display:flex;align-items:flex-start;gap:16px;padding:32px">
      <div style="width:48px;height:48px;border-radius:12px;background:${pc}10;display:flex;align-items:center;justify-content:center;color:${pc};flex-shrink:0">${getIcon(s.icon||'star')}</div>
      <div><h3 style="font-size:17px;font-weight:700;color:#1a1a2e;margin-bottom:6px">${esc(s.title)}</h3><p style="font-size:13px;color:#888;line-height:1.5">${esc(s.shortDescription||s.description)}</p></div>
    </a>`).join('');

  const processTimeline = (c.processSteps||[]).map((s,i)=>`
    <div class="rv d${i+1}" style="display:flex;gap:24px;margin-bottom:${i<(c.processSteps||[]).length-1?'48px':'0'};position:relative">
      ${i<(c.processSteps||[]).length-1?`<div style="position:absolute;left:24px;top:56px;bottom:-48px;width:2px;background:linear-gradient(180deg,${pc}33,${pc}08)"></div>`:''}
      <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,${pc},${ac});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;flex-shrink:0;box-shadow:0 4px 16px ${pc}33">${i+1}</div>
      <div style="padding-top:4px"><h4 style="font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:8px">${esc(s.title)}</h4><p style="font-size:15px;color:#666;line-height:1.7">${esc(s.description)}</p></div>
    </div>`).join('');

  const body = `
    <section style="padding:160px 24px 80px;text-align:center;position:relative;overflow:hidden;background:linear-gradient(135deg,${pc}06,${ac}06)">
      <div class="dot-grid" style="position:absolute;inset:0"></div>
      <div style="position:absolute;top:-50%;right:-20%;width:600px;height:600px;border-radius:50%;background:${pc};opacity:0.03"></div>
      <div class="ctn" style="position:relative;z-index:10"><div style="animation:fadeUp 0.8s ease-out">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}15;color:${pc};margin-bottom:16px">Our Services</span>
        <h1 style="font-size:clamp(32px,5vw,56px);font-weight:900;color:#1a1a2e;letter-spacing:-2px;margin-bottom:20px">${esc(c.servicesTitle)}</h1>
        <p style="font-size:18px;color:#666;max-width:650px;margin:0 auto;line-height:1.7">${esc(c.servicesPageIntro||'')}</p>
      </div></div>
    </section>

    <section style="padding:0 24px 80px;margin-top:-20px"><div class="ctn"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:20px">${cards}</div></div></section>

    ${getMarquee(c)}

    ${detailed}

    ${(c.processSteps||[]).length>0?`<section class="sect" style="background:#fafafa"><div class="ctn">
      <div class="rv" style="text-align:center;margin-bottom:64px">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">Our Process</span>
        <h2 style="font-size:clamp(28px,4vw,44px);font-weight:800;color:#1a1a2e;letter-spacing:-1px">How We Work</h2>
      </div>
      <div style="max-width:700px;margin:0 auto">${processTimeline}</div>
    </div></section>`:''}

    <section class="sect" style="background:linear-gradient(135deg,${pc},${ac}88);color:#fff;text-align:center"><div class="ctn rv">
      <h2 style="font-size:clamp(28px,4vw,44px);font-weight:900;margin-bottom:20px">${esc(c.ctaTitle)}</h2>
      <p style="font-size:18px;opacity:0.85;max-width:500px;margin:0 auto 32px">${esc(c.ctaText)}</p>
      <a href="/contact" class="btn-w">${esc(c.ctaButton)} ${ARR}</a>
    </div></section>`;
  return wrap(c, '/services', body);
}

// ═══════════════════════════════════════════════════════════════════════════
// ABOUT PAGE
// ═══════════════════════════════════════════════════════════════════════════
function generateAboutPage(c) {
  const pc=c.primaryColor||'#2563EB', ac=c.accentColor||'#60A5FA';
  const values = (c.values||[]).map((v,i)=>`
    <div class="glow-card tilt rv d${i+1}" style="text-align:center;padding:36px">
      <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,${pc}15,${ac}10);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:${pc}">${CHK}</div>
      <h4 style="font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:8px">${esc(v.title)}</h4>
      <p style="font-size:14px;color:#666;line-height:1.6">${esc(v.description)}</p>
    </div>`).join('');

  const statsBar = (c.stats||[]).map((s,i)=>`
    <div class="rv d${i+1}" style="text-align:center;padding:32px">
      <p data-count="${esc(s.number)}" style="font-size:52px;font-weight:900;color:#fff;line-height:1">0</p>
      <p style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:8px">${esc(s.label)}</p>
    </div>`).join('');

  const why = (c.whyChooseUs||[]).map((w,i)=>`
    <div class="rv d${i+1}" style="display:flex;gap:20px;align-items:flex-start">
      <div style="width:48px;height:48px;border-radius:12px;background:${pc}10;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${pc}">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
      </div>
      <div><h4 style="font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:8px">${esc(w.title)}</h4><p style="font-size:15px;color:#666;line-height:1.7">${esc(w.description)}</p></div>
    </div>`).join('');

  const body = `
    <section style="padding:160px 24px 80px;position:relative;overflow:hidden;background:linear-gradient(135deg,${pc}06,${ac}06)">
      <div class="dot-grid" style="position:absolute;inset:0"></div>
      <div class="ctn" style="position:relative;z-index:10"><div style="max-width:700px;animation:fadeUp 0.8s ease-out">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}15;color:${pc};margin-bottom:16px">About Us</span>
        <h1 style="font-size:clamp(32px,5vw,56px);font-weight:900;color:#1a1a2e;letter-spacing:-2px;margin-bottom:24px">${esc(c.aboutTitle)}</h1>
        <p style="font-size:18px;color:#666;line-height:1.8">${esc(c.aboutText)}</p>
      </div></div>
    </section>

    <section class="sect" style="background:#fff"><div class="ctn"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:32px">
      <div class="rv hl" style="background:linear-gradient(135deg,${pc},${pc}dd);border-radius:24px;padding:48px;color:#fff;position:relative;overflow:hidden">
        <div class="blob" style="position:absolute;top:-30%;right:-20%;width:200px;height:200px;background:${ac};opacity:0.15"></div>
        <div style="position:relative;z-index:10">
          <div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:24px"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div>
          <h3 style="font-size:24px;font-weight:800;margin-bottom:16px">Our Mission</h3>
          <p style="font-size:16px;opacity:0.9;line-height:1.7">${esc(c.mission||'To deliver exceptional value.')}</p>
        </div>
      </div>
      <div class="rv d2 hl" style="background:#fafafa;border-radius:24px;padding:48px;border:1px solid #eee;position:relative;overflow:hidden"><div style="position:relative;z-index:10">
        <div style="width:48px;height:48px;border-radius:12px;background:${pc}10;display:flex;align-items:center;justify-content:center;margin-bottom:24px;color:${pc}"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></div>
        <h3 style="font-size:24px;font-weight:800;margin-bottom:16px;color:#1a1a2e">Our Vision</h3>
        <p style="font-size:16px;color:#555;line-height:1.7">${esc(c.vision||'To be the leading force of innovation.')}</p>
      </div></div>
    </div></div></section>

    ${(c.stats||[]).length>0?`<section style="padding:80px 24px;background:linear-gradient(135deg,${pc},${pc}dd);position:relative;overflow:hidden"><div class="noise" style="position:absolute;inset:0"></div><div class="dot-grid" style="position:absolute;inset:0;opacity:0.5"></div><div class="ctn" style="position:relative;z-index:10"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,45%),1fr));gap:16px">${statsBar}</div></div></section>`:''}

    ${(c.values||[]).length>0?`<section class="sect" style="background:#fafafa"><div class="ctn">
      <div class="rv" style="text-align:center;margin-bottom:64px">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">Our Values</span>
        <h2 style="font-size:clamp(28px,4vw,44px);font-weight:800;color:#1a1a2e;letter-spacing:-1px">What We Stand For</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:24px">${values}</div>
    </div></section>`:''}

    ${(c.whyChooseUs||[]).length>0?`<section class="sect" style="background:#fff"><div class="ctn">
      <div style="display:grid;grid-template-columns:1fr;gap:64px;align-items:start" class="md2">
        <div class="rl">
          <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">Why Us</span>
          <h2 style="font-size:clamp(28px,4vw,44px);font-weight:800;color:#1a1a2e;letter-spacing:-1px;margin-bottom:24px">Why Choose ${esc(c.businessName)}</h2>
          <div style="width:60px;height:4px;border-radius:2px;background:linear-gradient(90deg,${pc},${ac});margin-bottom:24px"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:32px">${why}</div>
      </div>
    </div></section>`:''}

    <section class="sect" style="background:linear-gradient(135deg,${pc},${ac}88);color:#fff;text-align:center"><div class="ctn rv">
      <h2 style="font-size:clamp(28px,4vw,44px);font-weight:900;margin-bottom:20px">Ready to Work Together?</h2>
      <p style="font-size:18px;opacity:0.85;max-width:500px;margin:0 auto 32px">Let's discuss how we can help your business grow.</p>
      <a href="/contact" class="btn-w">${esc(c.ctaButton)} ${ARR}</a>
    </div></section>`;
  return wrap(c, '/about', body);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT PAGE
// ═══════════════════════════════════════════════════════════════════════════
function generateContactPage(c) {
  const pc=c.primaryColor||'#2563EB', ac=c.accentColor||'#60A5FA';
  const iconSVGs = {
    mail:'<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
    phone:'<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>',
    location:'<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>',
  };
  const items = [
    c.contactEmail?{ic:'mail',l:'Email',v:c.contactEmail,h:`mailto:${c.contactEmail}`}:null,
    c.contactPhone?{ic:'phone',l:'Phone',v:c.contactPhone,h:`tel:${c.contactPhone}`}:null,
    c.contactAddress?{ic:'location',l:'Address',v:c.contactAddress,h:null}:null,
  ].filter(Boolean);

  const contactCards = items.map((it,i)=>{
    const inner = `<div style="width:56px;height:56px;border-radius:16px;background:${pc}10;display:flex;align-items:center;justify-content:center;color:${pc};margin:0 auto 20px"><svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">${iconSVGs[it.ic]}</svg></div>
      <p style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px">${it.l}</p>
      <p style="font-size:17px;font-weight:600;color:#1a1a2e">${esc(it.v)}</p>`;
    return it.h
      ?`<a href="${esc(it.h)}" class="glow-card tilt rv d${i+1}" style="text-decoration:none;text-align:center;display:block;padding:40px">${inner}</a>`
      :`<div class="glow-card tilt rv d${i+1}" style="text-align:center;padding:40px">${inner}</div>`;
  }).join('');

  const faqItems = (c.faq||[]).map((f,i)=>`
    <div class="faq-item rv d${i+1}">
      <div class="faq-q">${esc(f.question)}<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></div>
      <div class="faq-a"><p style="font-size:15px;color:#666;line-height:1.7">${esc(f.answer)}</p></div>
    </div>`).join('');

  const body = `
    <section style="padding:160px 24px 80px;text-align:center;position:relative;overflow:hidden;background:linear-gradient(135deg,${pc}06,${ac}06)">
      <div class="dot-grid" style="position:absolute;inset:0"></div>
      <div class="ctn" style="position:relative;z-index:10"><div style="animation:fadeUp 0.8s ease-out">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}15;color:${pc};margin-bottom:16px">Contact Us</span>
        <h1 style="font-size:clamp(32px,5vw,56px);font-weight:900;color:#1a1a2e;letter-spacing:-2px;margin-bottom:20px">Get In Touch</h1>
        <p style="font-size:18px;color:#666;max-width:550px;margin:0 auto;line-height:1.7">${esc(c.contactPageIntro||'We would love to hear from you.')}</p>
      </div></div>
    </section>

    <section style="padding:0 24px 80px"><div class="ctn"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:24px">${contactCards}</div></div></section>

    <section class="sect" style="background:#fff"><div class="ctn" style="max-width:700px">
      <div class="rv" style="text-align:center;margin-bottom:48px">
        <h2 style="font-size:clamp(28px,4vw,40px);font-weight:800;color:#1a1a2e;letter-spacing:-1px;margin-bottom:12px">Send Us a Message</h2>
        <p style="font-size:16px;color:#888">Fill out the form below and we'll get back to you soon.</p>
      </div>
      <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" class="rv d2" onsubmit="event.preventDefault();const f=this;const b=f.querySelector('button');b.disabled=true;b.innerHTML='Sending...';fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(f)).toString()}).then(()=>{b.innerHTML='Message Sent! &#10003;';b.style.background='#10b981';f.reset()}).catch(()=>{b.innerHTML='Error — try again';b.style.background='#ef4444';b.disabled=false})" style="display:flex;flex-direction:column;gap:20px">
        <input type="hidden" name="form-name" value="contact">
        <p style="display:none"><label>Don't fill this out: <input name="bot-field"></label></p>
        <div class="mobile-1col" style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <div><label style="display:block;font-size:14px;font-weight:600;color:#333;margin-bottom:8px">First Name</label><input type="text" name="first-name" required placeholder="John" style="width:100%;padding:14px 18px;border:2px solid #eee;border-radius:12px;font-size:15px;font-family:inherit;transition:all 0.3s;outline:none" onfocus="this.style.borderColor='${pc}';this.style.boxShadow='0 0 0 4px ${pc}15'" onblur="this.style.borderColor='#eee';this.style.boxShadow='none'"></div>
          <div><label style="display:block;font-size:14px;font-weight:600;color:#333;margin-bottom:8px">Last Name</label><input type="text" name="last-name" required placeholder="Doe" style="width:100%;padding:14px 18px;border:2px solid #eee;border-radius:12px;font-size:15px;font-family:inherit;transition:all 0.3s;outline:none" onfocus="this.style.borderColor='${pc}';this.style.boxShadow='0 0 0 4px ${pc}15'" onblur="this.style.borderColor='#eee';this.style.boxShadow='none'"></div>
        </div>
        <div><label style="display:block;font-size:14px;font-weight:600;color:#333;margin-bottom:8px">Email</label><input type="email" name="email" required placeholder="john@example.com" style="width:100%;padding:14px 18px;border:2px solid #eee;border-radius:12px;font-size:15px;font-family:inherit;transition:all 0.3s;outline:none" onfocus="this.style.borderColor='${pc}';this.style.boxShadow='0 0 0 4px ${pc}15'" onblur="this.style.borderColor='#eee';this.style.boxShadow='none'"></div>
        <div><label style="display:block;font-size:14px;font-weight:600;color:#333;margin-bottom:8px">Message</label><textarea rows="5" name="message" required placeholder="Tell us about your project..." style="width:100%;padding:14px 18px;border:2px solid #eee;border-radius:12px;font-size:15px;font-family:inherit;resize:vertical;transition:all 0.3s;outline:none" onfocus="this.style.borderColor='${pc}';this.style.boxShadow='0 0 0 4px ${pc}15'" onblur="this.style.borderColor='#eee';this.style.boxShadow='none'"></textarea></div>
        <button type="submit" class="btn-p" style="justify-content:center;font-size:16px;padding:18px 32px;border-radius:12px;width:100%;cursor:pointer">Send Message <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg></button>
      </form>
    </div></section>

    ${(c.faq||[]).length>0?`<section class="sect" style="background:#fafafa"><div class="ctn" style="max-width:800px">
      <div class="rv" style="text-align:center;margin-bottom:48px">
        <span style="display:inline-block;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;background:${pc}10;color:${pc};margin-bottom:16px">FAQ</span>
        <h2 style="font-size:clamp(28px,4vw,40px);font-weight:800;color:#1a1a2e;letter-spacing:-1px">Frequently Asked Questions</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">${faqItems}</div>
    </div></section>`:''}

    <section class="sect" style="background:linear-gradient(135deg,${pc},${ac}88);color:#fff;text-align:center"><div class="ctn rv">
      <h2 style="font-size:clamp(28px,4vw,44px);font-weight:900;margin-bottom:20px">${esc(c.ctaTitle)}</h2>
      <p style="font-size:18px;opacity:0.85;max-width:500px;margin:0 auto 32px">${esc(c.ctaText)}</p>
      ${c.contactEmail?`<a href="mailto:${esc(c.contactEmail)}" class="btn-w">${esc(c.ctaButton)} ${ARR}</a>`:''}
    </div></section>`;
  return wrap(c, '/contact', body);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const WATERMARK_HTML = `<div style="position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.9);color:#fff;text-align:center;padding:14px 20px;z-index:99999;font-family:sans-serif;font-size:14px;backdrop-filter:blur(8px)">Preview Only — <a href="https://bytesplatform.com" style="color:#818cf8;text-decoration:underline;font-weight:600">Built by Bytes Platform</a></div>`;

function generateAllPages(config, watermark = false) {
  const pages = {
    '/index.html': generateHomePage(config),
    '/about/index.html': generateAboutPage(config),
    '/contact/index.html': generateContactPage(config),
  };
  if ((config.services || []).length > 0) {
    pages['/services/index.html'] = generateServicesPage(config);
  }
  if (watermark) {
    for (const [path, html] of Object.entries(pages)) {
      pages[path] = html.replace('</body>', WATERMARK_HTML + '</body>');
    }
  }
  return pages;
}
function generateStaticHTML(config) { return generateHomePage(config); }
function esc(s) { if(!s)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

/**
 * Add a custom domain to an existing Netlify site.
 */
async function addCustomDomainToNetlify(netlifySiteId, domain) {
  const headers = { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/json' };
  try {
    await axios.post(`${NETLIFY_API}/sites/${netlifySiteId}/domain_aliases`, { domain }, { headers });
    logger.info(`[NETLIFY] Custom domain added: ${domain} -> site ${netlifySiteId}`);
    return true;
  } catch (error) {
    logger.error(`[NETLIFY] Failed to add custom domain ${domain}:`, error.response?.data || error.message);
    throw error;
  }
}

module.exports = { deployToNetlify, addCustomDomainToNetlify };
