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
 *   - activationAmount: number           (total in USD — website + domain combined)
 *   - originalAmount: number             (pre-discount total — for strikethrough)
 *   - discountPct: number                (0 or 20 — when 20h discount has been applied)
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
  // Detects both direct Stripe URLs and the Pixie /pay/:id redirect.
  // Both should render as "Activate Now" and open in the same tab so
  // the checkout / already-paid status loads inline.
  const isActivationLink = /stripe\.com|buy\.stripe|payments\.link|\/pay\//i.test(String(actionUrl || ''));

  // Price display — combined website+domain. Shown ONLY on the CTA button
  // (not duplicated in the text line). When a discount has been applied,
  // the button shows strikethrough + new price inline so the customer sees
  // the offer at a glance without cluttering the text.
  const amount = Number(config.activationAmount) || 0;
  const origAmount = Number(config.originalAmount) || amount;
  const discountPct = Number(config.discountPct) || 0;
  const hasDiscount = discountPct > 0 && origAmount > amount;

  // CTA button label — price lives here, nowhere else.
  let ctaLabel;
  if (!isActivationLink) {
    ctaLabel = 'Activate →';
  } else if (amount <= 0) {
    ctaLabel = 'Activate Now';
  } else if (hasDiscount) {
    ctaLabel = `Activate — <span class="pixie-cta-strike">$${origAmount}</span> $${amount}`;
  } else {
    ctaLabel = `Activate — $${amount}`;
  }

  // Leading badge — tone changes with state. Green "PREVIEW" normally,
  // orange "20% OFF" during the discount window (more urgent feel).
  const badgeClass = hasDiscount ? 'pixie-badge pixie-badge-discount' : 'pixie-badge';
  const badgeText = hasDiscount ? `${discountPct}% OFF` : 'PREVIEW MODE';

  // Descriptive line (desktop only — hidden on mobile for space).
  // Kept consistent across discount/no-discount so desktop layout doesn't
  // shift under the customer's feet when the 22h discount fires. Only the
  // badge + button price change; the copy stays the same.
  const descText = `Activate this site to make it live${config.businessName ? ` for ${escapeHtml(config.businessName)}` : ''}.`;

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
  #pixie-activation-banner .pixie-badge {
    flex-shrink: 0;
    padding: 3px 9px;
    border-radius: 4px;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: rgba(37, 211, 102, 0.18);
    color: #25D366;
  }
  #pixie-activation-banner .pixie-badge-discount {
    background: #F97316;
    color: #fff;
    animation: pixie-pulse 2s ease-in-out infinite;
  }
  @keyframes pixie-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  #pixie-activation-banner .pixie-desc {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #CBD5E1;
    font-size: 13px;
  }
  #pixie-activation-banner .pixie-cta {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #25D366;
    color: #0A1628;
    padding: 9px 18px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 13.5px;
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    white-space: nowrap;
    box-shadow: 0 6px 20px -6px rgba(37,211,102,0.6);
    flex-shrink: 0;
  }
  #pixie-activation-banner .pixie-cta-strike {
    text-decoration: line-through;
    opacity: 0.55;
    font-weight: 500;
    margin-right: 2px;
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
  /* Mobile: strip it down to [BADGE] [BUTTON]. Lock icon + desc are both
     hidden — the PREVIEW badge already communicates intent, and skipping
     the icon frees up space so the CTA button can breathe. space-between
     pins badge left and button right. */
  @media (max-width: 640px) {
    #pixie-activation-banner {
      padding: 10px 14px;
      gap: 12px;
      justify-content: space-between;
    }
    #pixie-activation-banner .pixie-lock {
      display: none;
    }
    #pixie-activation-banner .pixie-desc {
      display: none;
    }
    #pixie-activation-banner .pixie-badge {
      font-size: 10.5px;
      padding: 4px 10px;
      letter-spacing: 0.1em;
    }
    #pixie-activation-banner .pixie-cta {
      padding: 10px 16px;
      font-size: 13px;
      box-shadow: 0 4px 14px -4px rgba(37,211,102,0.7);
    }
    #pixie-activation-banner .pixie-cta-strike {
      font-size: 11.5px;
    }
    html.pixie-preview-mode body {
      padding-top: 48px !important;
    }
    html.pixie-preview-mode .nav,
    html.pixie-preview-mode nav.nav,
    html.pixie-preview-mode .scroll-bar {
      top: 48px !important;
    }
  }
  /* Extra-narrow phones (≤360px): tighten padding further */
  @media (max-width: 360px) {
    #pixie-activation-banner {
      padding: 9px 10px;
      gap: 8px;
    }
    #pixie-activation-banner .pixie-badge {
      font-size: 10px;
      padding: 3px 8px;
    }
    #pixie-activation-banner .pixie-cta {
      padding: 9px 14px;
      font-size: 12.5px;
    }
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
  <span class="${badgeClass}">${badgeText}</span>
  <span class="pixie-desc">${descText}</span>
  <a class="pixie-cta" href="${escapeHtml(actionUrl)}"${isActivationLink ? '' : ' target="_blank" rel="noopener"'}>
    <span>${ctaLabel}</span>
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
