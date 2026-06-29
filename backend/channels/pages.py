"""Channels HTML pages — FastAPI-served frontend (dark Pixie style).

Pure render functions returning self-contained HTML strings (inline CSS + JS that
`fetch`es the /api/channels endpoints). NO routes are declared here — the lead
mounts these via the runnable entrypoint:

    from channels.pages import omni_page, agent_page
    @app.get("/channels", response_class=HTMLResponse)
    def _omni(): return omni_page()
    @app.get("/channels/agents/{name}", response_class=HTMLResponse)
    def _agent(name: str): return agent_page(name)

Pages read `tenant_id` from the `?tenant_id=` query string (default `t_demo`).
"""

from __future__ import annotations

from .agents import list_agents

# ── shared chrome (CSS + small JS helpers), reused by every page ──────────────
_STYLE = r"""
<style>
  :root{
    --bg:#0b0f1a; --panel:#121829; --panel2:#172036; --line:#26304a;
    --text:#e8edf7; --muted:#9aa7c2; --accent:#7c5cff; --accent2:#22d3ee;
    --good:#34d399; --warn:#fbbf24; --bad:#fb7185;
  }
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,Inter,sans-serif;background:
    radial-gradient(1200px 600px at 80% -10%,#1b1140 0%,transparent 60%),var(--bg);color:var(--text)}
  header{display:flex;align-items:center;gap:14px;padding:18px 28px;border-bottom:1px solid var(--line);
    background:rgba(10,14,26,.6);backdrop-filter:blur(8px);position:sticky;top:0;z-index:5}
  .logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));
    display:grid;place-items:center;font-weight:800;color:#0b0f1a}
  header h1{font-size:17px;margin:0;font-weight:700}
  header .tag{font-size:12px;color:var(--muted);border:1px solid var(--line);padding:3px 9px;border-radius:999px}
  nav{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
  nav a{font-size:12px;color:var(--muted);text-decoration:none;border:1px solid var(--line);
    padding:6px 11px;border-radius:999px}
  nav a:hover,nav a.active{color:var(--text);border-color:var(--accent)}
  .wrap{max-width:1100px;margin:0 auto;padding:22px 28px;display:flex;flex-direction:column;gap:18px}
  .card{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);
    border-radius:16px;padding:18px}
  .card h2{margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  label{display:block;font-size:12px;color:var(--muted);margin:10px 0 5px}
  input,select,textarea{width:100%;background:#0d1322;border:1px solid var(--line);color:var(--text);
    border-radius:10px;padding:9px 12px;font:inherit;outline:none}
  input:focus,select:focus,textarea:focus{border-color:var(--accent)}
  input[type=checkbox]{width:auto}
  button{cursor:pointer;border:none;border-radius:11px;padding:9px 14px;font-weight:700;color:#0b0f1a;
    background:linear-gradient(135deg,var(--accent),var(--accent2));font-size:13px}
  button.ghost{background:transparent;color:var(--text);border:1px solid var(--line);font-weight:600}
  button:disabled{opacity:.5;cursor:wait}
  .pill{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
  .pill.good{color:var(--good);border-color:#1d4d3a}.pill.warn{color:var(--warn);border-color:#4d3f1d}
  .pill.bad{color:var(--bad);border-color:#4d2330}
  .chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
  .chip{font-size:12px;background:#0d1322;border:1px solid var(--line);padding:5px 10px;border-radius:8px;color:#c7d2e8}
  .chip.bad{color:var(--bad);border-color:#4d2330}.chip.good{color:var(--good);border-color:#1d4d3a}
  .muted{color:var(--muted)}.small{font-size:12px}
  .ch-row{background:#0d1322;border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:10px}
  .ch-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .ch-head .nm{font-weight:700}
  .ch-head .sp{margin-left:auto}
  .needed{margin-top:8px}
  .dry{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-top:10px;align-items:end}
  .check{display:flex;align-items:center;gap:8px}
  pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,Menlo,monospace;color:#cdd7ee;
    background:#0a0e1a;border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0 0}
  .prereq{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--line)}
  .prereq:last-child{border-bottom:none}
  .dot{width:9px;height:9px;border-radius:50%;background:var(--warn);flex:none}
  .empty{color:var(--muted);text-align:center;padding:30px 0}
</style>
"""

_JS_HELPERS = r"""
const $ = id => document.getElementById(id);
const TID = new URLSearchParams(location.search).get("tenant_id") || "t_demo";
const esc = s => (s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function jget(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(path+" → "+r.status+" "+await r.text());
  return r.json();
}
async function jpost(path, body){
  const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"},
                              body: body===undefined?undefined:JSON.stringify(body)});
  if(!r.ok) throw new Error(path+" → "+r.status+" "+await r.text());
  return r.json();
}
function statusPill(s){
  if(s.live) return '<span class="pill good">live</span>';
  if(s.requirements_met) return '<span class="pill warn">ready · dry-run</span>';
  return '<span class="pill bad">missing requirements</span>';
}
function neededHtml(s){
  if(!s.missing || !s.missing.length) return '<div class="small muted needed">All requirements met ✓</div>';
  return '<div class="needed"><div class="small muted">What\'s needed:</div><div class="chips">'+
    s.missing.map(m=>'<span class="chip bad">'+esc(m)+'</span>').join("")+'</div></div>';
}
"""


def _nav(active: str) -> str:
    """Top nav linking the omni page + each agent page."""
    links = [('omni', '/channels', 'Omni-channel')]
    for a in list_agents():
        links.append((a["name"], f'/channels/agents/{a["name"]}', a["display_name"]))
    items = "".join(
        f'<a class="{"active" if key == active else ""}" href="{href}">{label}</a>'
        for key, href, label in links
    )
    return f"<nav>{items}</nav>"


def _header(title: str, active: str) -> str:
    return f"""
<header>
  <div class="logo">P</div>
  <h1>{title}</h1>
  <span class="tag" id="tid">tenant · loading…</span>
  {_nav(active)}
</header>
"""


# ── the omni-channel manager ──────────────────────────────────────────────────
def omni_page() -> str:
    return r"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pixie Channels — Omni-channel</title>
""" + _STYLE + "</head><body>" + _header("Pixie Channels", "omni") + r"""
<div class="wrap">
  <div class="card">
    <h2>Channels</h2>
    <div class="small muted">Enable a channel, check what it still needs, and dry-run a test message. Nothing sends live in mock mode.</div>
    <div id="channels"><div class="empty">Loading channels…</div></div>
  </div>

  <div class="card">
    <h2>Pixie can reach me at</h2>
    <div class="small muted">Where Pixie notifies you (the owner) — new leads, bookings, approvals. We store this encrypted and only ever show a masked value.</div>
    <div class="dry" style="grid-template-columns:1fr 2fr">
      <div><label>Type</label>
        <select id="ct_type"><option value="email">email</option><option value="phone">phone</option>
        <option value="whatsapp">whatsapp</option><option value="telegram">telegram</option><option value="other">other</option></select></div>
      <div><label>Value (stored encrypted)</label><input id="ct_value" placeholder="owner@business.com"/></div>
    </div>
    <label>Preferred channel</label>
    <select id="ct_pref"></select>
    <label>Notify me on</label>
    <div class="chips" id="ct_events"></div>
    <div style="display:flex;gap:8px;margin-top:14px;align-items:center">
      <button onclick="saveContact()">Save contact</button>
      <button class="ghost" onclick="verifyContact()">Verify</button>
      <span id="ct_status" class="pill">no contact</span>
    </div>
    <pre id="ct_view" class="small">—</pre>
  </div>
</div>
<script>
""" + _JS_HELPERS + r"""
$("tid").textContent = "tenant · " + TID;
let CONTACT_EVENTS = [];

function channelRow(s){
  const ch = s.channel;
  const enabledModeLive = s.mode === "live";
  return `<div class="ch-row" data-ch="${ch}">
    <div class="ch-head">
      <label class="check"><input type="checkbox" ${s.enabled?"checked":""} onchange="toggle('${ch}',this.checked)"/> </label>
      <span class="nm">${esc(ch)}</span>
      <span class="pill">${esc(s.support_level)}</span>
      <span class="sp">${statusPill(s)}</span>
    </div>
    ${neededHtml(s)}
    <div class="dry">
      <div><label>Recipient id</label><input id="rcpt_${ch}" placeholder="u_123" value="u_test"/></div>
      <div><label>Test message</label><input id="txt_${ch}" placeholder="hello from Pixie" value="Hi from Pixie"/></div>
      <div><button class="ghost" onclick="dryRun('${ch}')">Dry-run</button></div>
    </div>
    <pre id="out_${ch}" class="small" style="display:none"></pre>
  </div>`;
}

async function loadChannels(){
  try{
    const list = await jget(`/api/channels/status?tenant_id=${encodeURIComponent(TID)}`);
    $("channels").innerHTML = list.map(channelRow).join("");
  }catch(e){ $("channels").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

async function toggle(ch, enabled){
  try{
    // Enabling flips to live mode so a ready channel shows "live"; settings preserved server-side only via config post.
    const s = await jpost(`/api/channels/${ch}/config`,
      {tenant_id:TID, enabled, mode: enabled?"live":"mock", settings:{}, credentials_present:{}});
    await loadChannels();
  }catch(e){ alert(e.message); await loadChannels(); }
}

async function dryRun(ch){
  const out = $("out_"+ch); out.style.display="block"; out.textContent="…";
  try{
    const r = await jpost(`/api/channels/${ch}/dry-run`,
      {tenant_id:TID, recipient_id:$("rcpt_"+ch).value, text:$("txt_"+ch).value});
    out.textContent = `sent: ${r.sent}  dry_run: ${r.dry_run}  reason: ${r.reason}\n`+
      `preview: ${JSON.stringify(r.preview)}`;
  }catch(e){ out.textContent = e.message; }
}

// ── owner contact ──
async function loadContactMeta(){
  const c = await jget(`/api/channels/pixie-contact?tenant_id=${encodeURIComponent(TID)}`);
  CONTACT_EVENTS = c.available_events || [];
  $("ct_events").innerHTML = CONTACT_EVENTS.map(e=>
    `<label class="chip"><input type="checkbox" value="${esc(e)}" ${(c.notify_on||[]).includes(e)?"checked":""}/> ${esc(e)}</label>`).join("");
  // preferred channel options from the channel list
  const chans = await jget(`/api/channels/status?tenant_id=${encodeURIComponent(TID)}`);
  $("ct_pref").innerHTML = chans.map(s=>`<option value="${s.channel}" ${s.channel===c.preferred_channel?"selected":""}>${esc(s.channel)}</option>`).join("");
  renderContact(c);
}
function renderContact(c){
  $("ct_status").className = "pill " + (c.verified?"good":(c.exists?"warn":""));
  $("ct_status").textContent = c.exists ? (c.verified?"verified":"unverified") : "no contact";
  $("ct_view").textContent = c.exists ? `${c.type}: ${c.value_masked}  ·  notify: ${(c.notify_on||[]).join(", ")||"—"}` : "—";
  if(c.value_masked) $("ct_value").placeholder = c.value_masked;
}
function checkedEvents(){
  return [...$("ct_events").querySelectorAll("input:checked")].map(i=>i.value);
}
async function saveContact(){
  try{
    const c = await jpost(`/api/channels/pixie-contact`, {
      tenant_id:TID, type:$("ct_type").value, value:$("ct_value").value,
      preferred_channel:$("ct_pref").value, notify_on: checkedEvents()});
    $("ct_value").value = "";
    renderContact(c);
  }catch(e){ alert(e.message); }
}
async function verifyContact(){
  try{ renderContact(await jpost(`/api/channels/pixie-contact/verify?tenant_id=${encodeURIComponent(TID)}`)); }
  catch(e){ alert(e.message); }
}

loadChannels();
loadContactMeta();
</script>
</body></html>"""


# ── one page per agent ────────────────────────────────────────────────────────
def agent_page(agent_name: str) -> str:
    safe = agent_name.replace('"', "")
    return (r"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pixie Channels — Agent</title>
""" + _STYLE + "</head><body>" + _header("Pixie Channels", safe) + r"""
<div class="wrap">
  <div class="card">
    <div class="ch-head"><h2 style="margin:0" id="agent_name">Agent</h2><span class="sp pill" id="agent_ready">—</span></div>
    <div class="small muted" id="agent_desc"></div>
  </div>
  <div class="card">
    <h2>Prerequisites</h2>
    <div id="prereqs"><div class="empty">Loading…</div></div>
  </div>
  <div class="card">
    <h2>Channels this agent uses</h2>
    <div class="small muted">Enable each channel and clear its remaining requirements.</div>
    <div id="channels"><div class="empty">Loading…</div></div>
  </div>
</div>
<script>
""" + _JS_HELPERS + r"""
const AGENT = """ + f'"{safe}"' + r""";
$("tid").textContent = "tenant · " + TID;

function channelRow(s){
  const ch = s.channel;
  return `<div class="ch-row">
    <div class="ch-head">
      <label class="check"><input type="checkbox" ${s.enabled?"checked":""} onchange="toggle('${ch}',this.checked)"/></label>
      <span class="nm">${esc(ch)}</span>
      <span class="pill">${esc(s.support_level)}</span>
      <span class="sp">${statusPill(s)}</span>
    </div>
    ${neededHtml(s)}
  </div>`;
}

async function load(){
  try{
    const a = await jget(`/api/channels/agents/${AGENT}?tenant_id=${encodeURIComponent(TID)}`);
    $("agent_name").textContent = a.display_name || a.name;
    $("agent_desc").textContent = a.description || "";
    const stats = a.channel_statuses || [];
    const allReady = stats.length && stats.every(s=>s.requirements_met);
    $("agent_ready").className = "sp pill " + (allReady?"good":"warn");
    $("agent_ready").textContent = allReady ? "channels ready" : "setup needed";
    $("prereqs").innerHTML = (a.prerequisites||[]).map(p=>
      `<div class="prereq"><span class="dot"></span><span>${esc(p)}</span></div>`).join("")
      || '<div class="empty">No prerequisites.</div>';
    $("channels").innerHTML = stats.map(channelRow).join("") || '<div class="empty">No channels.</div>';
  }catch(e){ $("prereqs").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

async function toggle(ch, enabled){
  try{
    await jpost(`/api/channels/${ch}/config`,
      {tenant_id:TID, enabled, mode: enabled?"live":"mock", settings:{}, credentials_present:{}});
    await load();
  }catch(e){ alert(e.message); await load(); }
}

load();
</script>
</body></html>""")
