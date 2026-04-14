const { esc, telHref, icon, wrapHvacPage, getLocalBusinessSchema, TOKENS } = require('./common');

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function generateAreasPage(c) {
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const primary = c.primaryCity || '';
  const areas = (c.serviceAreas && c.serviceAreas.length ? c.serviceAreas : (primary ? [primary] : []));
  const descriptions = c.areaDescriptions || {}; // map of area -> LLM-generated description
  const mapsQuery = primary ? encodeURIComponent(`${primary}`) : '';

  const hero = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> &rsaquo; Service Areas</p>
        <h1 class="h1">Service Areas.</h1>
        <p class="body-lg">${primary ? `Based in ${esc(primary)}, ` : ''}we serve homeowners across the region with same-day HVAC service, free quotes, and 24/7 emergency response.</p>
      </div>
    </section>`;

  const mapEmbed = mapsQuery ? `
    <section style="padding:0 0 48px 0">
      <div class="ctn">
        <div class="rv" style="border:1px solid ${TOKENS.border};border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.06)">
          <iframe loading="lazy" width="100%" height="380" style="border:0;display:block" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${mapsQuery}&output=embed"></iframe>
        </div>
      </div>
    </section>` : '';

  const pills = areas.length ? `
    <section style="padding:16px 0 32px 0">
      <div class="ctn">
        <div class="areas-grid rv">
          ${areas.map((a) => `<a href="#${slugify(a)}" class="area-pill">${icon('mapPin', 14)} ${esc(a)}</a>`).join('')}
        </div>
      </div>
    </section>` : '';

  const areaBlocks = areas.map((a) => {
    const desc = descriptions[a] || descriptions[a.toLowerCase()] || `Our technicians cover ${a} with same-day service and 24/7 emergency response. Whether it&apos;s AC repair, heating installation, or a seasonal tune-up, we&apos;re a short drive from your door — fully licensed, fully insured, and backed by a satisfaction guarantee.`;
    return `
      <div id="${slugify(a)}" class="rv" style="background:#fff;border:1px solid ${TOKENS.border};border-radius:18px;padding:32px;display:grid;gap:24px;grid-template-columns:1fr;margin-bottom:20px">
        <div>
          <div class="flex items-center gap-12 mb-4" style="gap:12px">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;background:${TOKENS.sectionAlt};color:${TOKENS.trust}">${icon('mapPin', 20)}</span>
            <h2 class="ff-display" style="font-size:24px;font-weight:700;color:${TOKENS.heading}">HVAC Service in ${esc(a)}</h2>
          </div>
          <p class="body">${esc(desc)}</p>
          <div class="flex flex-wrap gap-12 mt-6">
            <a href="/contact?area=${encodeURIComponent(a)}" class="btn btn-orange btn-sm">Get a Quote in ${esc(a)} ${icon('arrowRight', 14, '#fff')}</a>
            ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline btn-sm">${icon('phone', 14)} Call ${esc(phone)}</a>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const areasSection = areas.length ? `
    <section class="sect">
      <div class="ctn">${areaBlocks}</div>
    </section>` : `
    <section class="sect">
      <div class="ctn center">
        <p class="body">Service area list coming soon. Call us at ${phone ? `<a href="tel:${esc(tel)}">${esc(phone)}</a>` : 'our main line'} to confirm we cover your neighborhood.</p>
      </div>
    </section>`;

  const ctaBanner = `
    <section class="cta-banner">
      <div class="ctn rv">
        <h2 class="h2">Don&apos;t see your area? Call us anyway.</h2>
        <p class="body-lg">We&apos;re adding new service areas all the time. Most of the time, we can still help.</p>
        <div class="flex flex-wrap gap-12" style="justify-content:center">
          ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-orange btn-lg">${icon('phone', 18, '#fff')} Call ${esc(phone)}</a>` : ''}
          <a href="/contact" class="btn btn-outline-white btn-lg">Request Free Quote</a>
        </div>
      </div>
    </section>`;

  const body = hero + mapEmbed + pills + areasSection + ctaBanner;

  return wrapHvacPage(c, '/areas', body, {
    title: `HVAC Service Areas${primary ? ` — ${primary} & Surrounding Cities` : ''} | ${c.businessName}`,
    description: `${c.businessName} provides HVAC service across ${areas.length ? areas.slice(0, 5).join(', ') : primary || 'the region'}. Same-day response, 24/7 emergency, licensed & insured.`,
    schemas: [getLocalBusinessSchema(c)],
  });
}

module.exports = { generateAreasPage };
