// Activation banner — sticky top bar injected into every generated site
// while it's in `preview` state. Contains a prominent "Activate" button
// that links to the current Stripe payment URL. Disappears automatically
// after the site is redeployed with paymentStatus='paid'.
//
// Also emits a small <script> tag that disables form submissions while
// in preview mode, with an inline hint explaining why — prevents leads
// from going to an unpaid site and evaporating.

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Return the HTML snippet for the activation banner.
 * Returns '' when the site is paid (renders nothing, zero cost).
 *
 * Expected config fields:
 *   - paymentStatus: 'preview' | 'paid'  (falsy → 'preview')
 *   - paymentLinkUrl: string             (Stripe link or fallback WhatsApp link)
 *   - businessName: string               (shown in the "chat to activate" fallback)
 */
function renderActivationBanner(config = {}) {
  if (config.paymentStatus === 'paid') return '';

  // Fallback: if for some reason we didn't capture a Stripe link, route to
  // WhatsApp with a prefilled "please send me the activation link" message.
  // The sales bot can then quote + create a link.
  const whatsappNumber = '3197010277911';
  const prefill = `Hi! I want to activate my website${config.businessName ? ` (${config.businessName})` : ''}. Please send me the payment link.`;
  const fallbackUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(prefill)}`;
  const actionUrl = config.paymentLinkUrl || fallbackUrl;
  const isStripeLink = /stripe\.com|buy\.stripe|payments\.link/i.test(String(actionUrl || ''));

  // Styles use hard-coded colors (not template tokens) so the banner looks
  // identical across HVAC / Real Estate / Salon / Generic — it's an
  // "above-the-site" system UI element, not part of the business's brand.
  return `
<!-- ── Pixie activation banner (injected while site is in preview) ── -->
<style>
  #pixie-activation-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 11px 20px;
    background: linear-gradient(90deg, #0A1628 0%, #13335A 50%, #0A1628 100%);
    color: #F1F5F9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: 0.01em;
    box-shadow: 0 6px 24px -8px rgba(0,0,0,0.5);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    line-height: 1.35;
    -webkit-font-smoothing: antialiased;
  }
  #pixie-activation-banner .pixie-lock {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(37, 211, 102, 0.15);
    color: #25D366;
    flex-shrink: 0;
  }
  #pixie-activation-banner .pixie-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #pixie-activation-banner .pixie-text strong {
    color: #fff;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    font-size: 11.5px;
    margin-right: 6px;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(37, 211, 102, 0.15);
    color: #25D366;
  }
  #pixie-activation-banner .pixie-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #25D366;
    color: #0A1628;
    padding: 8px 16px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 13px;
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    white-space: nowrap;
    box-shadow: 0 6px 20px -6px rgba(37,211,102,0.6);
  }
  #pixie-activation-banner .pixie-cta:hover {
    background: #1EBE5D;
    transform: translateY(-1px);
    box-shadow: 0 10px 28px -6px rgba(37,211,102,0.75);
  }
  /* Push the rest of the page down so it isn't hidden under the fixed banner */
  html.pixie-preview-mode body {
    padding-top: 48px !important;
  }
  /* Fixed/sticky top-0 navs (salon, real-estate, generic) and sticky
     HVAC nav overlap the banner otherwise. Offset them by banner height
     so the business nav is visible right under the Pixie banner. Also
     covers the scroll-progress bar used on the generic template. */
  html.pixie-preview-mode .nav,
  html.pixie-preview-mode nav.nav,
  html.pixie-preview-mode .scroll-bar {
    top: 48px !important;
  }
  /* Mobile: stack text over button, keep compact */
  @media (max-width: 640px) {
    #pixie-activation-banner {
      padding: 9px 14px;
      gap: 10px;
      font-size: 12px;
    }
    #pixie-activation-banner .pixie-text {
      display: none;
    }
    #pixie-activation-banner .pixie-text-mobile {
      display: inline-block;
      color: #fff;
      font-weight: 600;
    }
    #pixie-activation-banner .pixie-cta {
      padding: 7px 13px;
      font-size: 12px;
    }
    html.pixie-preview-mode body {
      padding-top: 44px !important;
    }
    html.pixie-preview-mode .nav,
    html.pixie-preview-mode nav.nav,
    html.pixie-preview-mode .scroll-bar {
      top: 44px !important;
    }
  }
  @media (min-width: 641px) {
    #pixie-activation-banner .pixie-text-mobile { display: none; }
  }
  /* Contact form lock overlay */
  .pixie-form-locked {
    position: relative;
  }
  .pixie-form-locked::after {
    content: attr(data-pixie-lock-label);
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 22, 40, 0.88);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    padding: 20px;
    line-height: 1.5;
    border-radius: 8px;
    cursor: pointer;
    z-index: 10;
    backdrop-filter: blur(4px);
  }
</style>

<div id="pixie-activation-banner" role="region" aria-label="Activation banner">
  <span class="pixie-lock" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  </span>
  <span class="pixie-text"><strong>Preview Mode</strong>Activate this site to make it live${config.businessName ? ` for ${escapeHtml(config.businessName)}` : ''}.</span>
  <span class="pixie-text-mobile">Preview Mode</span>
  <a class="pixie-cta" href="${escapeHtml(actionUrl)}"${isStripeLink ? '' : ' target="_blank" rel="noopener"'}>
    ${isStripeLink ? 'Activate Now' : 'Activate →'}
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  </a>
</div>

<script>
(function(){
  // Tag <html> so the top-padding CSS rule kicks in (avoids body-margin
  // clashes with templates that already use margin on body).
  try { document.documentElement.classList.add('pixie-preview-mode'); } catch(_){}

  // Lock every contact <form> on the page — show an overlay explaining the
  // form activates after payment, and stop submits. Leads would otherwise
  // go to an abandoned preview site and evaporate.
  function lockForms(){
    var label = 'Contact forms activate once the site is published — click Activate above.';
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i];
      if (f.getAttribute('data-pixie-skip-lock') === '1') continue;
      f.classList.add('pixie-form-locked');
      f.setAttribute('data-pixie-lock-label', label);
      f.addEventListener('submit', function(e){
        e.preventDefault();
        var banner = document.getElementById('pixie-activation-banner');
        if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, true);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lockForms);
  } else {
    lockForms();
  }
})();
</script>
<!-- ── /Pixie activation banner ── -->
`.trim();
}

module.exports = { renderActivationBanner };
