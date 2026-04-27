/**
 * Shared GDPR privacy bits used across all 4 site templates (HVAC, salon,
 * real estate, generic). Two pieces:
 *
 *   1. consentField(c, opts) — HTML snippet for a privacy-policy checkbox
 *      that every visitor-data form must include. Required attribute is
 *      set so the browser blocks submission until checked, and the input
 *      is named `consent_given` with value `yes` so the backend has a
 *      trivial truthy check.
 *
 *   2. generatePrivacyBody(c) — the body HTML for /privacy/index.html.
 *      Caller wraps it with their template's page chrome (header/footer)
 *      so the privacy page looks native to each template.
 *
 * Keeping this in one file means a copy-text change to the policy
 * propagates automatically to every template, and a future legal review
 * has one file to read.
 */

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML snippet for the consent checkbox + privacy-policy link.
 *
 * @param {object} c        siteConfig (used for accent color)
 * @param {object} [opts]
 * @param {string} [opts.idPrefix]    Unique prefix when multiple forms live on
 *                                    the same page (e.g. "valuation" + "contact"
 *                                    on the RE home page). Default: 'gdpr'.
 * @param {string} [opts.accent]      CSS color for the link / checkbox accent.
 * @param {boolean} [opts.darkBg]     Render label text in light color (for
 *                                    forms placed on dark hero panels).
 */
function consentField(c, opts = {}) {
  const idPrefix = opts.idPrefix || 'gdpr';
  const id = `${idPrefix}-consent`;
  const accent = opts.accent || c?.primaryColor || '#2563EB';
  const labelColor = opts.darkBg ? 'rgba(255,255,255,0.85)' : '#4b5563';
  const linkColor = opts.darkBg ? '#fff' : accent;
  return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:14px 0;font-size:13.5px;line-height:1.55;color:${labelColor}">
      <input id="${id}" type="checkbox" name="consent_given" value="yes" required
        style="flex-shrink:0;margin-top:3px;width:16px;height:16px;accent-color:${accent};cursor:pointer">
      <label for="${id}" style="cursor:pointer">
        I agree to the <a href="/privacy/" target="_blank" rel="noopener" style="color:${linkColor};text-decoration:underline">Privacy Policy</a>
        and consent to ${escHtml(c?.businessName || 'this business')} processing the personal data I provide so they can respond to my enquiry.
      </label>
    </div>`;
}

/**
 * Body HTML for the /privacy/ page. Caller wraps with their template's
 * shell. Pulls business name + contact email from siteConfig so the
 * policy is identifiable. Last-updated is fixed at generation time —
 * the SMB owner can update by regenerating the site.
 */
function generatePrivacyBody(c) {
  const business = escHtml(c?.businessName || 'This business');
  const contactEmail = c?.contactEmail || '';
  const contactPhone = c?.contactPhone || '';
  const address = c?.contactAddress || '';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const contactLine = contactEmail
    ? `email <a href="mailto:${escHtml(contactEmail)}" style="color:#2563EB">${escHtml(contactEmail)}</a>`
    : (contactPhone
        ? `phone ${escHtml(contactPhone)}`
        : `the contact details on our home page`);

  return `
    <section style="max-width:780px;margin:0 auto;padding:120px 24px 80px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937;line-height:1.7">
      <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;margin-bottom:18px">Legal</p>
      <h1 style="font-size:38px;font-weight:800;letter-spacing:-0.5px;margin:0 0 12px;color:#0f172a">Privacy Policy</h1>
      <p style="font-size:14px;color:#6b7280;margin-bottom:48px">Last updated: ${today}</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">Who we are</h2>
      <p>${business} runs this website${address ? ` from ${escHtml(address)}` : ''}. If you have questions about this policy or how we handle your data, ${contactLine}.</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">What we collect</h2>
      <p>When you fill in a form on this site we collect the personal information you choose to share — typically your name, email address, phone number, and the message or request you send. If you book an appointment we additionally store the service, date, and time you select. We may also automatically log your IP address and browser user-agent for spam protection.</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">Why we collect it</h2>
      <p>We use the information you submit only to respond to your enquiry, schedule the service you asked about, and follow up about that specific request. The legal basis is your <strong>consent</strong>, which you give by ticking the agreement box before submitting any form. We do not sell or rent your data, and we do not use it for advertising or unrelated marketing.</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">Who handles your data</h2>
      <p>Submissions are stored on our website provider's servers and emailed to ${business} so they can respond. We use a small number of vetted processors (a database host, a transactional email provider, a domain / DNS provider) — each is contractually required to process data only on our instructions and to keep it secure.</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">How long we keep it</h2>
      <p>We keep enquiry data for as long as needed to handle your request and any follow-up business that comes from it, plus a reasonable buffer for our records (typically up to 24 months). After that it is deleted or anonymised. If you ask us to delete it sooner we will do so unless we are legally required to keep it.</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">Your rights</h2>
      <p>If you are in the EU, UK, or another region with similar data-protection laws, you have the right to:</p>
      <ul style="padding-left:24px;margin:8px 0 16px">
        <li>access the personal data we hold about you,</li>
        <li>have inaccurate data corrected,</li>
        <li>have your data deleted (the "right to be forgotten"),</li>
        <li>withdraw your consent at any time, and</li>
        <li>complain to your local data-protection authority.</li>
      </ul>
      <p>To exercise any of these rights, ${contactLine}. We will respond within 30 days.</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">Cookies</h2>
      <p>This site does not set any tracking or advertising cookies. If we add an analytics or chat tool in future that uses cookies we will update this policy and ask for your consent first.</p>

      <h2 style="font-size:22px;font-weight:700;margin:32px 0 12px;color:#0f172a">Changes to this policy</h2>
      <p>We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" date at the top of the page.</p>

      <p style="margin-top:48px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">Questions? Reach out via ${contactLine}.</p>
    </section>`;
}

module.exports = { consentField, generatePrivacyBody };
