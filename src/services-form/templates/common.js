// Shared HTML scaffolding for the services form pages — page chrome, base
// styles, and small helpers used by both the salon and real-estate forms.

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_STYLES = `
  *,*::before,*::after{box-sizing:border-box}
  body{font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#F8FAFC;color:#0F172A;margin:0;padding:24px 16px;line-height:1.5}
  .wrap{max-width:680px;margin:0 auto}
  h1{font-size:24px;margin:0 0 6px;letter-spacing:-.01em}
  .sub{color:#475569;font-size:14px;margin:0 0 24px}
  .card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:18px;margin-bottom:14px;position:relative}
  .card .row-num{position:absolute;top:14px;right:14px;font-size:12px;color:#94A3B8;font-weight:600}
  .card .remove{position:absolute;top:10px;right:42px;background:none;border:0;color:#94A3B8;cursor:pointer;font-size:20px;line-height:1;padding:4px;border-radius:6px}
  .card .remove:hover{color:#EF4444;background:#FEF2F2}
  label{display:block;font-size:13px;font-weight:600;color:#334155;margin:10px 0 4px}
  input[type=text],input[type=number]{width:100%;padding:10px 12px;border:1px solid #CBD5E1;border-radius:8px;font:inherit;color:inherit;background:#fff}
  input[type=text]:focus,input[type=number]:focus,select:focus{outline:none;border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.15)}
  select{width:100%;padding:10px 12px;border:1px solid #CBD5E1;border-radius:8px;font:inherit;color:inherit;background:#fff}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .photo-row{display:flex;align-items:center;gap:10px;margin-top:6px}
  .photo-label{display:inline-flex;align-items:center;padding:8px 12px;background:#F1F5F9;border:1px dashed #CBD5E1;border-radius:8px;cursor:pointer;font-size:13px;color:#475569}
  .photo-label:hover{background:#E2E8F0}
  .photo-label input{display:none}
  .photo-name{font-size:12px;color:#64748B}
  .add-btn{display:block;width:100%;padding:14px;background:#fff;border:1.5px dashed #94A3B8;border-radius:12px;color:#475569;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:14px}
  .add-btn:hover{border-color:#2563EB;color:#2563EB;background:#F0F7FF}
  .add-btn:disabled{opacity:.5;cursor:not-allowed}
  .submit-row{margin-top:16px;display:flex;flex-direction:column;gap:14px}
  .consent{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#475569}
  .consent input{margin-top:3px}
  .consent a{color:#2563EB}
  .submit-btn{padding:14px 24px;background:#0F172A;color:#fff;border:0;border-radius:999px;font-size:15px;font-weight:600;cursor:pointer}
  .submit-btn:hover{background:#1E293B}
  .submit-btn:disabled{opacity:.5;cursor:not-allowed}
  .err{color:#DC2626;font-size:13px;margin-top:8px}
  @media (max-width:520px){.grid-3{grid-template-columns:1fr 1fr}}
`;

function pageShell({ title, body }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${BASE_STYLES}</style>
</head><body><div class="wrap">${body}</div></body></html>`;
}

function infoPage({ title, message, accent = '#0F172A' }) {
  return pageShell({
    title,
    body: `<h1 style="color:${accent}">${escapeHtml(title)}</h1><p class="sub">${escapeHtml(message)}</p>`,
  });
}

module.exports = { escapeHtml, pageShell, infoPage };
