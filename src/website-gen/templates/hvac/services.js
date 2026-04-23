const { esc, telHref, icon, wrapHvacPage, getLocalBusinessSchema, getServiceListSchema, getTradeCopy, buildTokens } = require('./common');

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function priceDisplay(priceFrom) {
  if (!priceFrom) return { label: 'Pricing', value: 'Free Quote', accent: true };
  const raw = String(priceFrom);
  if (/[a-zA-Z]/.test(raw)) return { label: 'Pricing', value: raw, accent: true };
  return { label: 'Starts from', value: `$${raw}`, accent: true };
}

function generateServicesPage(c) {
  const tc = getTradeCopy(c);
  const TOKENS = buildTokens(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const services = c.services || [];

  const overview = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> &rsaquo; Services</p>
        <h1 class="h1">${esc(tc.servicesH1)}</h1>
        <p class="body-lg">${esc(tc.servicesSub)}</p>
      </div>
    </section>`;

  // Zigzag rows — redesigned: numbered label, prominent price block, colored bullets
  const zigzag = services.map((s, i) => {
    const sid = slugify(s.title);
    const price = priceDisplay(s.priceFrom);
    const features = (s.features && s.features.length ? s.features : [
      'Free diagnostic with repair',
      'Upfront pricing before any work',
      'Licensed & insured technicians',
      'Workmanship warranty included',
    ]).slice(0, 4);

    const textCol = `
      <div class="zz-text rv">
        <span class="zz-label">Service ${String(i + 1).padStart(2, '0')}</span>
        <h2 class="h2 mb-4" id="${sid}">${esc(s.title)}</h2>
        <p class="body mb-6">${esc(s.fullDescription || s.shortDescription || '')}</p>
        <div class="zz-price-block">
          <div class="zz-price-cell">
            <span class="zz-price-label">Timeframe</span>
            <span class="zz-price-val">${esc(s.timeframe || 'Same-day')}</span>
          </div>
          <div class="zz-price-cell zz-price-accent">
            <span class="zz-price-label">${esc(price.label)}</span>
            <span class="zz-price-val">${esc(price.value)}</span>
          </div>
        </div>
        <ul class="zz-feats">
          ${features.map((f) => `<li class="zz-feat">${esc(f)}</li>`).join('')}
        </ul>
        <div class="flex flex-wrap gap-12">
          <a href="/contact?service=${encodeURIComponent(s.title || '')}" class="btn btn-orange">Request This Service ${icon('arrowRight', 16, '#fff')}</a>
          ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline">Call Now</a>` : ''}
        </div>
      </div>`;

    const hasImg = !!(s.image && s.image.url);
    const visualCol = hasImg
      ? `<div class="zz-visual rv" style="background:url('${esc(s.image.url)}') center/cover no-repeat"></div>`
      : `<div class="zz-visual rv">
           <div class="zz-ico">${icon('wrench', 120)}</div>
           <div class="zz-visual-label">Real project photos coming soon</div>
         </div>`;

    return `<div class="zz-row">${textCol}${visualCol}</div>`;
  }).join('');

  const zzSection = services.length ? `
    <section class="sect">
      <div class="ctn">${zigzag}</div>
    </section>` : '';

  const notSure = `
    <section class="sect sect-soft">
      <div class="ctn center rv" style="max-width:720px">
        <h2 class="h2 mb-4">Not sure what you need?</h2>
        <p class="body-lg mb-6">Call us at ${phone ? `<a href="tel:${esc(tel)}" style="color:${TOKENS.trust};font-weight:700">${esc(phone)}</a>` : 'the number on this page'} &mdash; we&apos;ll diagnose the issue for free and quote upfront.</p>
        <div class="flex gap-12" style="justify-content:center;flex-wrap:wrap">
          ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-blue btn-lg">Call for Free Diagnostic</a>` : ''}
          <a href="/contact" class="btn btn-outline btn-lg">Request Free Quote</a>
        </div>
      </div>
    </section>`;

  const body = overview + zzSection + notSure;

  // Meta description lists a handful of services so search snippets are
  // specific. We pull from the effective services list (user-supplied or
  // trade defaults) rather than hardcoding HVAC-specific examples.
  const sampleTitles = (services || []).slice(0, 5).map((s) => s.title).filter(Boolean).join(', ');
  const metaDesc = `Full list of ${tc.label} services from ${c.businessName}${c.primaryCity ? ` in ${c.primaryCity}` : ''}${sampleTitles ? `: ${sampleTitles}, and more.` : '.'}`;

  return wrapHvacPage(c, '/services', body, {
    title: `${tc.label} Services${c.primaryCity ? ` in ${c.primaryCity}` : ''} | ${c.businessName}`,
    description: metaDesc,
    schemas: [getLocalBusinessSchema(c), getServiceListSchema(c)],
  });
}

module.exports = { generateServicesPage };
