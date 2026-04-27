const {
  esc, telHref, icon,
  wrapRealEstatePage, netlifyFormAttrs, netlifyHiddenFields,
  getRealEstateAgentSchema, buildTokens,
} = require('./common');
const { consentField } = require('../_privacy');

function generateContactPage(c) {
  const TOKENS = buildTokens(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const email = c.contactEmail || '';
  const address = c.contactAddress || '';
  const city = c.primaryCity || '';
  const calendly = c.calendlyUrl || '';
  const areas = (c.serviceAreas || []);

  const hero = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> / Contact</p>
        <h1 class="h1">Let&apos;s talk.</h1>
        <p class="body-lg">Tell me what you&apos;re thinking — buying, selling, or just curious. I read every message personally and respond within 24 hours.</p>
      </div>
    </section>`;

  // Three intent paths at the top
  const intentPaths = `
    <section style="padding:32px 0 0">
      <div class="ctn">
        <div style="display:grid;gap:18px;grid-template-columns:1fr" class="intent-grid rv">
          <div style="padding:28px;border:1px solid ${TOKENS.beige};background:#fff">
            <div style="font-family:'Cormorant Garamond',serif;font-size:36px;color:${TOKENS.gold};line-height:1">01</div>
            <h3 class="h3" style="margin-top:6px">Buying</h3>
            <p class="body" style="margin-top:8px;font-size:15px">First-time buyer? Move-up? Investor? Tell me what fits and I&apos;ll send a curated short-list.</p>
          </div>
          <div style="padding:28px;border:1px solid ${TOKENS.beige};background:#fff">
            <div style="font-family:'Cormorant Garamond',serif;font-size:36px;color:${TOKENS.gold};line-height:1">02</div>
            <h3 class="h3" style="margin-top:6px">Selling</h3>
            <p class="body" style="margin-top:8px;font-size:15px">Get a free CMA on your home in 24 hours. No hard pitch — just numbers and next steps.</p>
          </div>
          <div style="padding:28px;border:1px solid ${TOKENS.beige};background:#fff">
            <div style="font-family:'Cormorant Garamond',serif;font-size:36px;color:${TOKENS.gold};line-height:1">03</div>
            <h3 class="h3" style="margin-top:6px">Just Curious</h3>
            <p class="body" style="margin-top:8px;font-size:15px">Browsing? That&apos;s welcome too. Send me a question and I&apos;ll send you market notes back.</p>
          </div>
        </div>
      </div>
      <style>@media(min-width:760px){.intent-grid{grid-template-columns:repeat(3,1fr)!important;gap:24px!important}}</style>
    </section>`;

  // Form + side info
  const formSection = `
    <section class="sect">
      <div class="ctn">
        <div style="display:grid;gap:48px;grid-template-columns:1fr" class="contact-wrap">
          <div class="rv">
            <span class="eyebrow">Send a Message</span>
            <h2 class="h2" style="margin-top:12px">Tell me what you&apos;re looking for.</h2>
            <span class="bar-accent bar-accent-l"></span>
            <form ${netlifyFormAttrs('consultation', c.siteId)} style="margin-top:32px">
              ${netlifyHiddenFields('consultation', '/contact')}
              <div class="form-grid">
                <div>
                  <label class="form-label" for="c-name">Your Name</label>
                  <input id="c-name" name="name" class="form-input" type="text" required>
                </div>
                <div>
                  <label class="form-label" for="c-phone">Phone</label>
                  <input id="c-phone" name="phone" class="form-input" type="tel" required>
                </div>
                <div class="form-row-full">
                  <label class="form-label" for="c-email">Email</label>
                  <input id="c-email" name="email" class="form-input" type="email" required>
                </div>
                <div class="form-row-full">
                  <label class="form-label" for="c-intent">I&apos;m interested in</label>
                  <select id="c-intent" name="intent" class="form-select">
                    <option>Buying a home</option>
                    <option>Selling my home</option>
                    <option>Both — moving up / right-sizing</option>
                    <option>Investment property</option>
                    <option>Free CMA / home valuation</option>
                    <option>Just exploring the market</option>
                  </select>
                </div>
                ${areas.length ? `
                <div class="form-row-full">
                  <label class="form-label" for="c-area">Neighborhood interest</label>
                  <select id="c-area" name="neighborhood" class="form-select">
                    <option>Open to suggestions</option>
                    ${areas.map((a) => `<option>${esc(a)}</option>`).join('')}
                  </select>
                </div>` : ''}
                <div class="form-row-full">
                  <label class="form-label" for="c-msg">Tell me more (optional)</label>
                  <textarea id="c-msg" name="message" class="form-textarea" placeholder="Timeline, budget, must-haves, what scared you off your last agent..."></textarea>
                </div>
                <div class="form-row-full">
                  ${consentField(c, { idPrefix: 'consult', accent: TOKENS.gold || c.primaryColor })}
                </div>
                <div class="form-row-full" style="padding-top:6px">
                  <button type="submit" class="btn btn-gold btn-lg" style="width:100%">Send Message</button>
                  <p style="text-align:center;margin-top:16px;color:${TOKENS.muted};font-size:13px;letter-spacing:.02em">I respond personally within 24 hours.</p>
                </div>
              </div>
            </form>
          </div>

          <aside class="rv" style="display:flex;flex-direction:column;gap:24px">
            ${phone ? `
            <div style="background:${TOKENS.navy};color:${TOKENS.warmWhite};padding:32px 30px;border-radius:2px">
              <span class="eyebrow" style="color:${TOKENS.gold}">Or call directly</span>
              <a href="tel:${esc(tel)}" style="display:inline-block;font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:600;color:${TOKENS.warmWhite};margin-top:14px;letter-spacing:-0.005em">${esc(phone)}</a>
              <p style="color:rgba(250,247,242,.7);margin-top:10px;font-size:14px">Mon-Fri 8 AM - 7 PM &middot; Sat 9 AM - 5 PM</p>
            </div>` : ''}

            ${calendly ? `
            <div style="padding:28px 26px;border:1px solid ${TOKENS.beige};background:#fff">
              <span class="eyebrow">Pick a Time</span>
              <p style="font-family:'Cormorant Garamond',serif;font-size:22px;color:${TOKENS.navy};margin-top:10px;font-weight:600">Book a 20-minute call</p>
              <p class="body" style="font-size:14.5px;margin-top:8px">No pressure. We see if it&apos;s a fit.</p>
              <a href="${esc(calendly)}" target="_blank" rel="noopener" class="btn btn-navy btn-sm" style="margin-top:18px">Open Calendar</a>
            </div>` : ''}

            <div style="padding:28px 26px;border:1px solid ${TOKENS.beige};background:#fff">
              <span class="eyebrow">My Promise</span>
              <p style="font-family:'Cormorant Garamond',serif;font-size:22px;color:${TOKENS.navy};margin-top:10px;font-weight:600;font-style:italic">"I&apos;ll personally review your details and send a comparative market analysis within 24 hours."</p>
              <p class="body" style="font-size:14px;margin-top:14px">No auto-responders. No call centers. No stranger from a different time zone. Just me, getting back to you with real information.</p>
            </div>

            <div style="padding:24px 26px">
              ${email ? `<p style="margin-bottom:10px"><span style="color:${TOKENS.muted};font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-right:10px">Email</span><a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ''}
              ${address ? `<p style="margin-bottom:10px"><span style="color:${TOKENS.muted};font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-right:10px">Office</span>${esc(address)}</p>` : ''}
              ${c.brokerageName ? `<p><span style="color:${TOKENS.muted};font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-right:10px">Brokerage</span><strong style="font-family:'Cormorant Garamond',serif;font-size:17px;color:${TOKENS.navy}">${esc(c.brokerageName)}</strong></p>` : ''}
            </div>
          </aside>
        </div>
      </div>
      <style>@media(min-width:960px){.contact-wrap{grid-template-columns:1.4fr .9fr!important;gap:64px!important}}</style>
    </section>`;

  const body = hero + intentPaths + formSection;

  return wrapRealEstatePage(c, '/contact', body, {
    title: `Contact ${c.businessName}${city ? ` — ${city} Real Estate` : ''}`,
    description: `Reach ${c.businessName} for buying, selling, or a free CMA${city ? ` in ${city}` : ''}. Personal response within 24 hours.${phone ? ` Call ${phone}.` : ''}`,
    schemas: [getRealEstateAgentSchema(c)],
  });
}

function generateThankYouPage(c) {
  const TOKENS = buildTokens(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const body = `
    <section class="sect" style="min-height:60vh;display:flex;align-items:center;background:${TOKENS.cream}">
      <div class="ctn" style="text-align:center;max-width:640px;margin:0 auto">
        <span style="font-family:'Cormorant Garamond',serif;font-size:80px;color:${TOKENS.gold};line-height:1">✓</span>
        <h1 class="h1" style="margin-top:18px">Message received.</h1>
        <p class="body-lg" style="margin-top:18px">I&apos;ll personally review what you&apos;ve sent and respond within 24 hours.${phone ? ` In the meantime, you can reach me directly at <a href="tel:${esc(tel)}" style="color:${TOKENS.navy};font-weight:600">${esc(phone)}</a>.` : ''}</p>
        <div style="margin-top:36px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
          <a href="/" class="btn btn-navy">Back to Home</a>
          <a href="/listings" class="btn btn-outline">Browse Listings</a>
        </div>
      </div>
    </section>`;

  return wrapRealEstatePage(c, '/thank-you', body, {
    title: `Thank You | ${c.businessName}`,
    description: `Your message was received. ${c.businessName} will respond personally within 24 hours.`,
    schemas: [],
  });
}

function generateThankYouCmaPage(c) {
  const TOKENS = buildTokens(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const body = `
    <section class="sect" style="min-height:60vh;display:flex;align-items:center;background:${TOKENS.cream}">
      <div class="ctn" style="text-align:center;max-width:680px;margin:0 auto">
        <span style="font-family:'Cormorant Garamond',serif;font-size:80px;color:${TOKENS.gold};line-height:1">✓</span>
        <h1 class="h1" style="margin-top:18px">CMA request received.</h1>
        <p class="body-lg" style="margin-top:18px">Thanks — I&apos;ll personally review your property details and send you a comparative market analysis <strong style="color:${TOKENS.navy}">within 24 hours</strong>. The report will include recent comps, neighborhood trends, and an honest opinion on pricing.${phone ? `<br><br>Need to talk sooner? Call me at <a href="tel:${esc(tel)}" style="color:${TOKENS.navy};font-weight:600">${esc(phone)}</a>.` : ''}</p>
        <div style="margin-top:36px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
          <a href="/" class="btn btn-navy">Back to Home</a>
          <a href="/about" class="btn btn-outline">About ${esc((c.businessName || '').split(' ')[0] || 'Me')}</a>
        </div>
      </div>
    </section>`;

  return wrapRealEstatePage(c, '/thank-you-cma', body, {
    title: `CMA Request Received | ${c.businessName}`,
    description: `Your CMA request was received. ${c.businessName} will personally send your comparative market analysis within 24 hours.`,
    schemas: [],
  });
}

module.exports = { generateContactPage, generateThankYouPage, generateThankYouCmaPage };
