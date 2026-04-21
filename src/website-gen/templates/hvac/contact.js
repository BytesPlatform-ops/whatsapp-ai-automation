const { esc, telHref, icon, wrapHvacPage, netlifyFormAttrs, netlifyHiddenFields, getLocalBusinessSchema, TOKENS } = require('./common');

function generateContactPage(c) {
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const email = c.contactEmail || '';
  const address = c.contactAddress || '';
  const services = c.services || [];
  const city = c.primaryCity || '';

  const hero = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> &rsaquo; Contact</p>
        <h1 class="h1">Request a free quote.</h1>
        <p class="body-lg">Send a message or call directly. We respond within one hour, 7 days a week.</p>
      </div>
    </section>`;

  const form = `
    <form ${netlifyFormAttrs('quote', c.siteId)}>
      ${netlifyHiddenFields('quote', '/contact')}
      <div class="form-grid">
        <div>
          <label class="form-label" for="name">Your Name *</label>
          <input id="name" name="name" class="form-input" type="text" required placeholder="Jane Smith">
        </div>
        <div>
          <label class="form-label" for="phone">Phone Number *</label>
          <input id="phone" name="phone" class="form-input" type="tel" required placeholder="(555) 555-5555">
        </div>
        <div>
          <label class="form-label" for="email">Email</label>
          <input id="email" name="email" class="form-input" type="email" placeholder="you@email.com">
        </div>
        <div>
          <label class="form-label" for="service">Service Needed</label>
          <select id="service" name="service" class="form-select">
            <option value="">Not sure — just need help</option>
            ${services.map((s) => `<option value="${esc(s.title)}">${esc(s.title)}</option>`).join('')}
            <option value="Emergency Service">Emergency Service</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-row-full">
          <label class="form-label" for="address">Service Address</label>
          <input id="address" name="address" class="form-input" type="text" placeholder="Street, City">
        </div>
        <div class="form-row-full">
          <label class="form-label" for="details">What&apos;s going on?</label>
          <textarea id="details" name="details" class="form-textarea" placeholder="Describe the issue — or when you&apos;d like us to come by."></textarea>
        </div>
        <div>
          <label class="form-label" for="date">Preferred Date</label>
          <input id="date" name="date" class="form-input" type="date">
        </div>
        <div>
          <label class="form-label" for="urgency">Urgency</label>
          <select id="urgency" name="urgency" class="form-select">
            <option>Flexible</option>
            <option>Within a few days</option>
            <option>Same-day needed</option>
            <option>Emergency — right now</option>
          </select>
        </div>
        <div class="form-row-full" style="padding-top:8px">
          <button type="submit" class="btn btn-orange btn-lg" style="width:100%">Request Free Quote ${icon('arrowRight', 18, '#fff')}</button>
          <p class="muted mt-4 center">We&apos;ll call you back within 1 hour during business hours. Emergencies answered 24/7.</p>
        </div>
      </div>
    </form>`;

  const contactInfo = `
    <aside style="display:flex;flex-direction:column;gap:20px">
      ${phone ? `
      <div style="background:${TOKENS.trust};color:#fff;border-radius:16px;padding:28px">
        <p style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,.7);margin-bottom:8px">Call Us Now</p>
        <a href="tel:${esc(tel)}" style="font-family:'Plus Jakarta Sans',sans-serif;font-size:28px;font-weight:800;color:#fff;display:inline-flex;align-items:center;gap:10px">${icon('phone', 24, '#fff')} ${esc(phone)}</a>
        <p style="color:rgba(255,255,255,.75);margin-top:10px;font-size:14px">24/7 emergency service available</p>
      </div>` : ''}

      <div class="card">
        <h3 class="ff-display" style="font-size:17px;margin-bottom:16px">Hours</h3>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:8px;font-size:14px;color:${TOKENS.body}">
          <li style="display:flex;justify-content:space-between"><span>Monday &ndash; Friday</span><span>7:00 AM &ndash; 6:00 PM</span></li>
          <li style="display:flex;justify-content:space-between"><span>Saturday</span><span>8:00 AM &ndash; 4:00 PM</span></li>
          <li style="display:flex;justify-content:space-between"><span>Sunday</span><span>Emergency only</span></li>
          <li style="display:flex;justify-content:space-between;color:${TOKENS.orangeHover};font-weight:600"><span>Emergency</span><span>24 / 7</span></li>
        </ul>
      </div>

      ${email || address ? `
      <div class="card">
        <h3 class="ff-display" style="font-size:17px;margin-bottom:12px">Other Ways to Reach Us</h3>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:10px;font-size:14px">
          ${email ? `<li>${icon('checkCircle', 16, TOKENS.orange)} <a href="mailto:${esc(email)}">${esc(email)}</a></li>` : ''}
          ${address ? `<li>${icon('mapPin', 16, TOKENS.orange)} <span style="color:${TOKENS.body}">${esc(address)}</span></li>` : ''}
        </ul>
      </div>` : ''}

      <div class="card" style="background:rgba(249,115,22,.06);border-color:rgba(249,115,22,.2)">
        <p style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;color:${TOKENS.heading};font-size:15px;margin-bottom:6px">Our promise</p>
        <p class="body" style="font-size:14px">We call you back within <strong>1 hour</strong> during business hours. Flat-rate pricing. No surprise fees. Ever.</p>
      </div>
    </aside>`;

  const body = hero + `
    <section class="sect">
      <div class="ctn">
        <div style="display:grid;gap:40px;grid-template-columns:1fr" class="contact-wrap rv">
          <div>${form}</div>
          ${contactInfo}
        </div>
      </div>
    </section>
    <style>
      @media(min-width:900px){.contact-wrap{grid-template-columns:1.4fr 1fr!important;gap:56px!important}}
    </style>`;

  return wrapHvacPage(c, '/contact', body, {
    title: `Contact ${c.businessName}${city ? ` — HVAC in ${city}` : ''}`,
    description: `Request a free HVAC quote from ${c.businessName}${city ? ` in ${city}` : ''}. Same-day service, 1-hour callback, 24/7 emergencies.${phone ? ` Call ${phone}.` : ''}`,
    schemas: [getLocalBusinessSchema(c)],
  });
}

function generateThankYouPage(c) {
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const body = `
    <section class="sect" style="min-height:60vh;display:flex;align-items:center">
      <div class="ctn center" style="max-width:640px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;background:rgba(249,115,22,.12);color:${TOKENS.orange};margin-bottom:24px">${icon('checkCircle', 40, TOKENS.orange)}</span>
        <h1 class="h1 mb-4">Thanks — we got it.</h1>
        <p class="body-lg mb-6">We&apos;ll call you back within <strong>1 hour</strong> during business hours. If this is an emergency${phone ? `, call us directly at <a href="tel:${esc(tel)}">${esc(phone)}</a>` : ''}.</p>
        <div class="flex flex-wrap gap-12" style="justify-content:center">
          <a href="/" class="btn btn-blue">Back to Home</a>
          ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-orange">${icon('phone', 16, '#fff')} Call Now</a>` : ''}
        </div>
      </div>
    </section>`;

  return wrapHvacPage(c, '/thank-you', body, {
    title: `Thank You | ${c.businessName}`,
    description: `Your quote request was received. ${c.businessName} will reply within one hour.`,
    schemas: [],
  });
}

module.exports = { generateContactPage, generateThankYouPage };
