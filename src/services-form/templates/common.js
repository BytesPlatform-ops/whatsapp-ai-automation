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
  input[type=text],input[type=number],select{
    width:100%;padding:11px 13px;border:1.5px solid ${BRAND.ink200};
    border-radius:10px;font:inherit;color:inherit;background:#fff;
    transition:border-color .15s ease, box-shadow .15s ease;
  }
  input[type=text]:hover,input[type=number]:hover,select:hover{border-color:${BRAND.ink300}}
  input[type=text]:focus,input[type=number]:focus,select:focus{
    outline:none;border-color:${BRAND.green};
    box-shadow:0 0 0 4px rgba(37,211,102,0.18);
  }
  input::placeholder{color:${BRAND.ink300}}

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

  .price-wrap{position:relative;display:flex;align-items:center}
  .price-wrap .price-sym{
    position:absolute;left:13px;
    font-size:14px;font-weight:600;color:${BRAND.ink500};
    pointer-events:none;user-select:none;
  }
  .price-wrap .price-num-input{padding-left:36px!important}
  .price-wrap .price-num-input:focus{padding-left:36px!important}

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

// Currency options shared by both forms. Symbol shown inline so the user
// knows exactly what they're selecting without needing external knowledge.
const CURRENCIES = [
  // Americas
  { code: 'USD', label: 'US Dollar',          sym: '$'    },
  { code: 'CAD', label: 'Canadian Dollar',     sym: 'CA$'  },
  { code: 'BRL', label: 'Brazilian Real',      sym: 'R$'   },
  { code: 'MXN', label: 'Mexican Peso',        sym: 'MX$'  },
  // Europe
  { code: 'GBP', label: 'British Pound',       sym: '£'    },
  { code: 'EUR', label: 'Euro',                sym: '€'    },
  { code: 'CHF', label: 'Swiss Franc',         sym: 'CHF'  },
  { code: 'TRY', label: 'Turkish Lira',        sym: '₺'    },
  // Middle East
  { code: 'AED', label: 'UAE Dirham',          sym: 'AED'  },
  { code: 'SAR', label: 'Saudi Riyal',         sym: 'SAR'  },
  { code: 'QAR', label: 'Qatari Riyal',        sym: 'QAR'  },
  { code: 'KWD', label: 'Kuwaiti Dinar',       sym: 'KWD'  },
  { code: 'OMR', label: 'Omani Rial',          sym: 'OMR'  },
  { code: 'BHD', label: 'Bahraini Dinar',      sym: 'BHD'  },
  { code: 'JOD', label: 'Jordanian Dinar',     sym: 'JD'   },
  { code: 'EGP', label: 'Egyptian Pound',      sym: 'E£'   },
  // South Asia
  { code: 'PKR', label: 'Pakistani Rupee',     sym: 'Rs'   },
  { code: 'INR', label: 'Indian Rupee',        sym: '₹'    },
  { code: 'BDT', label: 'Bangladeshi Taka',    sym: '৳'    },
  { code: 'LKR', label: 'Sri Lankan Rupee',    sym: 'Rs'   },
  { code: 'NPR', label: 'Nepalese Rupee',      sym: 'Rs'   },
  // Southeast Asia & Pacific
  { code: 'AUD', label: 'Australian Dollar',   sym: 'A$'   },
  { code: 'NZD', label: 'New Zealand Dollar',  sym: 'NZ$'  },
  { code: 'SGD', label: 'Singapore Dollar',    sym: 'S$'   },
  { code: 'MYR', label: 'Malaysian Ringgit',   sym: 'RM'   },
  // Africa
  { code: 'ZAR', label: 'South African Rand',  sym: 'R'    },
  { code: 'NGN', label: 'Nigerian Naira',       sym: '₦'    },
  { code: 'KES', label: 'Kenyan Shilling',      sym: 'KSh'  },
  { code: 'GHS', label: 'Ghanaian Cedi',        sym: 'GH₵'  },
];

const CURRENCY_OPTIONS_HTML = CURRENCIES
  .map((c) => `<option value="${c.code}">${c.code} – ${c.label} (${c.sym})</option>`)
  .join('\n      ');

// JS-safe map of code → symbol, embedded in form scripts.
const CURRENCY_SYM_MAP_JS = '{' + CURRENCIES.map((c) => `'${c.code}':'${c.sym}'`).join(',') + '}';

module.exports = { escapeHtml, pageShell, infoPage, CURRENCY_OPTIONS_HTML, CURRENCY_SYM_MAP_JS };
