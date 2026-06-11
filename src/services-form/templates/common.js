// Shared HTML scaffolding for the services form pages — page chrome, base
// styles, and small helpers used by both the salon and real-estate forms.
// Brand: matches landing/tailwind.config.ts (navy + WA-green palette,
// Plus Jakarta Sans display, Inter body).

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND = {
  green: '#25D366',
  greenDark: '#1EBE5D',
  navy900: '#0A1628',
  ink900: '#0F172A',
  ink500: '#475569',
  ink400: '#64748B',
  ink300: '#94A3B8',
  ink200: '#CBD5E1',
  ink100: '#E5E9F0',
  bgSoft: '#F6F8FB',
  bubble: '#DCF8C6',
};

const BASE_STYLES = `
  *,*::before,*::after{box-sizing:border-box}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  body{
    font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    color:${BRAND.ink900};
    margin:0;padding:0;line-height:1.55;
    background:
      radial-gradient(1100px 600px at 50% -150px, rgba(37,211,102,0.10), transparent 60%),
      radial-gradient(900px 500px at 90% 110%, rgba(13,43,74,0.06), transparent 60%),
      ${BRAND.bgSoft};
    min-height:100vh;
  }
  ::selection{background:${BRAND.bubble};color:${BRAND.ink900}}

  .topbar{
    width:100%;padding:16px 20px;
    display:flex;align-items:center;gap:10px;
    border-bottom:1px solid ${BRAND.ink100};
    background:rgba(255,255,255,0.78);
    backdrop-filter:saturate(180%) blur(8px);
    -webkit-backdrop-filter:saturate(180%) blur(8px);
    position:sticky;top:0;z-index:5;
  }
  .topbar img{height:30px;width:30px;border-radius:8px;display:block}
  .topbar .brand{font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif;font-weight:800;font-size:17px;letter-spacing:-0.01em;color:${BRAND.ink900}}
  .topbar .by{margin-left:auto;font-size:12px;color:${BRAND.ink400};font-weight:500}

  .wrap{max-width:720px;margin:0 auto;padding:32px 18px 56px}

  .hero{margin-bottom:22px}
  .badge{
    display:inline-flex;align-items:center;gap:6px;
    padding:5px 11px;border-radius:999px;
    background:${BRAND.bubble};color:#0B3A1E;
    font-size:12px;font-weight:600;letter-spacing:0.01em;margin-bottom:10px;
  }
  .badge::before{content:'';width:6px;height:6px;border-radius:999px;background:${BRAND.green};box-shadow:0 0 0 3px rgba(37,211,102,0.25)}

  h1{
    font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif;
    font-size:clamp(26px,4vw,34px);font-weight:800;
    margin:6px 0 8px;letter-spacing:-0.02em;line-height:1.1;
    color:${BRAND.ink900};
  }
  .sub{color:${BRAND.ink500};font-size:15px;margin:0 0 6px;max-width:60ch}

  .card{
    background:#fff;border:1px solid ${BRAND.ink100};
    border-radius:16px;padding:20px 18px 18px;
    margin-bottom:14px;position:relative;
    box-shadow:0 4px 20px -8px rgba(15,23,42,0.06);
  }
  .card .row-num{
    position:absolute;top:14px;right:16px;font-size:11px;
    color:${BRAND.ink300};font-weight:700;letter-spacing:0.04em;text-transform:uppercase;
  }
  .card .remove{
    position:absolute;top:8px;right:46px;background:transparent;border:0;
    color:${BRAND.ink300};cursor:pointer;font-size:22px;line-height:1;padding:4px 7px;
    border-radius:8px;transition:all .15s ease;
  }
  .card .remove:hover{color:#EF4444;background:#FEF2F2}

  label{display:block;font-size:13px;font-weight:600;color:${BRAND.ink900};margin:12px 0 6px}
  input[type=text],input[type=number],select,textarea{
    width:100%;padding:11px 13px;border:1.5px solid ${BRAND.ink200};
    border-radius:10px;font:inherit;color:inherit;background:#fff;
    transition:border-color .15s ease, box-shadow .15s ease;
  }
  textarea{min-height:78px;resize:vertical;line-height:1.5}
  input[type=text]:hover,input[type=number]:hover,select:hover,textarea:hover{border-color:${BRAND.ink300}}
  input[type=text]:focus,input[type=number]:focus,select:focus,textarea:focus{
    outline:none;border-color:${BRAND.green};
    box-shadow:0 0 0 4px rgba(37,211,102,0.18);
  }
  input::placeholder,textarea::placeholder{color:${BRAND.ink300}}

  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}

  .photo-row{display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap}
  .photo-label{
    display:inline-flex;align-items:center;gap:8px;
    padding:10px 14px;background:${BRAND.bgSoft};
    border:1.5px dashed ${BRAND.ink200};border-radius:10px;
    cursor:pointer;font-size:13px;font-weight:500;color:${BRAND.ink500};
    transition:all .15s ease;
  }
  .photo-label:hover{border-color:${BRAND.green};background:#F0FFF6;color:${BRAND.greenDark}}
  .photo-label input{display:none}
  .photo-name{font-size:12px;color:${BRAND.ink400};max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .photo-clear{background:none;border:none;padding:0;font-size:12px;color:${BRAND.ink400};cursor:pointer;text-decoration:underline;}

  .add-btn{
    display:block;width:100%;padding:15px;
    background:#fff;border:1.5px dashed ${BRAND.ink200};
    border-radius:14px;color:${BRAND.ink500};
    font-size:14px;font-weight:600;cursor:pointer;
    margin:6px 0 22px;transition:all .15s ease;
    font-family:inherit;
  }
  .add-btn:hover{border-color:${BRAND.green};color:${BRAND.greenDark};background:#F0FFF6}
  .add-btn:disabled{opacity:.5;cursor:not-allowed}

  .submit-row{margin-top:8px;display:flex;flex-direction:column;gap:18px}
  .consent{
    display:flex;gap:10px;align-items:flex-start;font-size:13px;
    color:${BRAND.ink500};background:#fff;border:1px solid ${BRAND.ink100};
    border-radius:12px;padding:14px;
  }
  .consent input{margin-top:3px;accent-color:${BRAND.green}}
  .consent a{color:${BRAND.greenDark};font-weight:600;text-decoration:none}
  .consent a:hover{text-decoration:underline}

  .submit-btn{
    padding:15px 26px;background:${BRAND.green};color:#fff;
    border:0;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;
    font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif;
    box-shadow:0 8px 22px -6px rgba(37,211,102,0.55);
    transition:transform .12s ease, box-shadow .15s ease, background .15s ease;
    letter-spacing:-0.01em;
  }
  .submit-btn:hover{background:${BRAND.greenDark};transform:translateY(-1px);box-shadow:0 12px 26px -6px rgba(37,211,102,0.6)}
  .submit-btn:active{transform:translateY(0)}
  .submit-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}

  .err{color:#DC2626;font-size:13px;margin-top:2px;font-weight:500}

  .price-wrap{
    display:flex;align-items:center;
    border:1.5px solid ${BRAND.ink200};border-radius:10px;
    background:#fff;overflow:hidden;
    transition:border-color .15s ease,box-shadow .15s ease;
  }
  .price-wrap:focus-within{
    border-color:${BRAND.green};
    box-shadow:0 0 0 4px rgba(37,211,102,0.18);
  }
  .price-wrap .price-sym{
    padding:11px 6px 11px 13px;
    font-size:14px;font-weight:600;color:${BRAND.ink500};
    white-space:nowrap;pointer-events:none;user-select:none;flex-shrink:0;
  }
  .price-wrap .price-num-input{
    flex:1;min-width:0;border:none!important;outline:none!important;
    box-shadow:none!important;border-radius:0!important;
    padding:11px 13px 11px 4px!important;background:transparent;
  }

  /* ── Custom currency dropdown ─────────────────────────────────── */
  .cur-wrap{position:relative}
  .cur-btn{
    width:100%;padding:11px 38px 11px 13px;
    border:1.5px solid ${BRAND.ink200};border-radius:10px;
    font:inherit;color:inherit;background:#fff;
    text-align:left;cursor:pointer;
    transition:border-color .15s ease,box-shadow .15s ease;
    position:relative;
  }
  .cur-btn::after{
    content:'';position:absolute;right:14px;top:50%;transform:translateY(-50%);
    width:0;height:0;
    border-left:5px solid transparent;border-right:5px solid transparent;
    border-top:6px solid ${BRAND.ink400};
    transition:transform .15s ease;
  }
  .cur-btn[aria-expanded=true]::after{transform:translateY(-50%) rotate(180deg)}
  .cur-btn:hover{border-color:${BRAND.ink300}}
  .cur-btn:focus,.cur-btn[aria-expanded=true]{
    outline:none;border-color:${BRAND.green};
    box-shadow:0 0 0 4px rgba(37,211,102,0.18);
  }
  .cur-panel{
    display:none;position:absolute;top:calc(100% + 6px);left:0;right:0;
    background:#fff;border:1.5px solid ${BRAND.ink200};border-radius:12px;
    box-shadow:0 8px 28px -6px rgba(15,23,42,0.16);z-index:50;overflow:hidden;
  }
  .cur-panel.open{display:block}
  .cur-search{
    width:100%;padding:10px 13px;border:none;border-bottom:1px solid ${BRAND.ink100};
    font:inherit;font-size:13px;color:inherit;outline:none;background:#fff;
  }
  .cur-list{max-height:240px;overflow-y:auto;overscroll-behavior:contain}
  .cur-grp{
    padding:6px 13px 2px;font-size:11px;font-weight:700;letter-spacing:0.06em;
    text-transform:uppercase;color:${BRAND.ink300};
  }
  .cur-opt{
    padding:9px 13px;font-size:14px;cursor:pointer;color:${BRAND.ink900};
    transition:background .1s ease;
  }
  .cur-opt:hover{background:${BRAND.bgSoft}}
  .cur-opt.selected{background:#F0FFF6;color:#0B3A1E;font-weight:600}
  .cur-opt.hidden{display:none}

  .footer{text-align:center;margin-top:32px;font-size:12px;color:${BRAND.ink400}}
  .footer a{color:${BRAND.ink500};text-decoration:none;font-weight:600}
  .footer a:hover{color:${BRAND.greenDark}}

  .info-card{
    background:#fff;border:1px solid ${BRAND.ink100};
    border-radius:16px;padding:36px 24px;text-align:center;
    box-shadow:0 4px 20px -8px rgba(15,23,42,0.06);max-width:480px;margin:60px auto 0;
  }
  .info-card h1{font-size:22px;margin:0 0 10px}
  .info-card .sub{margin:0 auto}

  @media (max-width:520px){
    .grid-3{grid-template-columns:1fr 1fr}
    .wrap{padding:22px 14px 40px}
  }
  @media (max-width:380px){
    .grid-2,.grid-3{grid-template-columns:1fr}
  }
`;

const TOPBAR_HTML = `
<header class="topbar">
  <img src="/services-form/assets/pixie-logo.png" alt="Pixie" />
  <span class="brand">Pixie</span>
  <span class="by">CRM intake</span>
</header>`;

const FOOTER_HTML = `
<div class="footer">
  Powered by <a href="https://pixiebot.co" target="_blank" rel="noopener">Pixie</a> · Your data stays private.
</div>`;

function pageShell({ title, body }) {
  const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(title)} · Pixie</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/services-form/assets/pixie-logo.png">
${fonts}
<style>${BASE_STYLES}</style>
</head><body>${TOPBAR_HTML}<div class="wrap">${body}${FOOTER_HTML}</div></body></html>`;
}

function infoPage({ title, message, accent }) {
  const body = `<div class="info-card"><h1${accent ? ` style="color:${escapeHtml(accent)}"` : ''}>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(message)}</p></div>`;
  return pageShell({ title, body });
}

// Currency options shared by both forms, grouped by region via <optgroup>.
// Grouping gives scroll anchors so users can navigate a long list easily.
const CURRENCY_GROUPS = [
  { group: 'Americas', currencies: [
    { code: 'USD', label: 'US Dollar',           sym: '$'   },
    { code: 'CAD', label: 'Canadian Dollar',     sym: 'CA$' },
    { code: 'BRL', label: 'Brazilian Real',      sym: 'R$'  },
    { code: 'MXN', label: 'Mexican Peso',        sym: 'MX$' },
  ]},
  { group: 'Europe', currencies: [
    { code: 'GBP', label: 'British Pound',       sym: '£'   },
    { code: 'EUR', label: 'Euro',                sym: '€'   },
    { code: 'CHF', label: 'Swiss Franc',         sym: 'CHF' },
    { code: 'TRY', label: 'Turkish Lira',        sym: '₺'   },
  ]},
  { group: 'Middle East', currencies: [
    { code: 'AED', label: 'UAE Dirham',          sym: 'AED' },
    { code: 'SAR', label: 'Saudi Riyal',         sym: 'SAR' },
    { code: 'QAR', label: 'Qatari Riyal',        sym: 'QAR' },
    { code: 'KWD', label: 'Kuwaiti Dinar',       sym: 'KWD' },
    { code: 'OMR', label: 'Omani Rial',          sym: 'OMR' },
    { code: 'BHD', label: 'Bahraini Dinar',      sym: 'BHD' },
    { code: 'JOD', label: 'Jordanian Dinar',     sym: 'JD'  },
    { code: 'EGP', label: 'Egyptian Pound',      sym: 'E£'  },
  ]},
  { group: 'South Asia', currencies: [
    { code: 'PKR', label: 'Pakistani Rupee',     sym: 'Rs'  },
    { code: 'INR', label: 'Indian Rupee',        sym: '₹'   },
    { code: 'BDT', label: 'Bangladeshi Taka',    sym: '৳'   },
    { code: 'LKR', label: 'Sri Lankan Rupee',    sym: 'Rs'  },
    { code: 'NPR', label: 'Nepalese Rupee',      sym: 'Rs'  },
  ]},
  { group: 'Asia Pacific', currencies: [
    { code: 'AUD', label: 'Australian Dollar',   sym: 'A$'  },
    { code: 'NZD', label: 'New Zealand Dollar',  sym: 'NZ$' },
    { code: 'SGD', label: 'Singapore Dollar',    sym: 'S$'  },
    { code: 'MYR', label: 'Malaysian Ringgit',   sym: 'RM'  },
  ]},
  { group: 'Africa', currencies: [
    { code: 'ZAR', label: 'South African Rand',  sym: 'R'   },
    { code: 'NGN', label: 'Nigerian Naira',       sym: '₦'   },
    { code: 'KES', label: 'Kenyan Shilling',      sym: 'KSh' },
    { code: 'GHS', label: 'Ghanaian Cedi',        sym: 'GH₵' },
  ]},
];

// Flat list for JS symbol lookups
const CURRENCIES = CURRENCY_GROUPS.flatMap((g) => g.currencies);
// JS-safe map of code → symbol, embedded in form scripts.
const CURRENCY_SYM_MAP_JS = '{' + CURRENCIES.map((c) => `'${c.code}':'${c.sym}'`).join(',') + '}';

// Custom dropdown HTML — replaces native <select> so scrolling works
// reliably across all browsers/OS combinations.
function buildCurrencyDropdown(inputName) {
  const opts = CURRENCY_GROUPS.map(({ group, currencies }) =>
    `<div class="cur-grp">${group}</div>` +
    currencies.map((c) =>
      `<div class="cur-opt${c.code === 'USD' ? ' selected' : ''}" data-value="${c.code}" data-sym="${c.sym}">${c.code} – ${c.label} (${c.sym})</div>`
    ).join('')
  ).join('');

  return `
    <div class="cur-wrap" id="${inputName}-wrap">
      <input type="hidden" name="${inputName}" id="${inputName}" value="USD">
      <button type="button" class="cur-btn" id="${inputName}-btn" aria-expanded="false" aria-haspopup="listbox">
        USD – US Dollar ($)
      </button>
      <div class="cur-panel" id="${inputName}-panel" role="listbox">
        <input type="text" class="cur-search" placeholder="Search currency…" autocomplete="off">
        <div class="cur-list">${opts}</div>
      </div>
    </div>`;
}

// Shared JS that wires up ALL .cur-wrap dropdowns on the page.
const CURRENCY_DROPDOWN_JS = `
(function(){
  document.querySelectorAll('.cur-wrap').forEach(function(wrap){
    var btn    = wrap.querySelector('.cur-btn');
    var panel  = wrap.querySelector('.cur-panel');
    var search = wrap.querySelector('.cur-search');
    var input  = wrap.querySelector('input[type=hidden]');
    var opts   = wrap.querySelectorAll('.cur-opt');

    function open(){
      btn.setAttribute('aria-expanded','true');
      panel.classList.add('open');
      search.value='';
      opts.forEach(function(o){o.classList.remove('hidden')});
      search.focus();
    }
    function close(){
      btn.setAttribute('aria-expanded','false');
      panel.classList.remove('open');
    }
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      panel.classList.contains('open') ? close() : open();
    });
    search.addEventListener('input',function(){
      var q=search.value.toLowerCase();
      opts.forEach(function(o){
        o.classList.toggle('hidden', q && !o.textContent.toLowerCase().includes(q));
      });
    });
    opts.forEach(function(opt){
      opt.addEventListener('click',function(){
        opts.forEach(function(o){o.classList.remove('selected')});
        opt.classList.add('selected');
        input.value = opt.dataset.value;
        btn.textContent = opt.textContent;
        // notify price-symbol listeners
        wrap.dispatchEvent(new CustomEvent('currency-change',{bubbles:true,detail:{code:opt.dataset.value,sym:opt.dataset.sym}}));
        close();
      });
    });
    document.addEventListener('click',function(e){
      if(!wrap.contains(e.target)) close();
    });
  });
})();`;

module.exports = { escapeHtml, pageShell, infoPage, buildCurrencyDropdown, CURRENCY_DROPDOWN_JS, CURRENCY_SYM_MAP_JS };
