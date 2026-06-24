"""Standalone demo app for the Pixie Marketing AI Agent dashboard.

Runs the marketing router PLUS a single served dashboard page so you can SEE and
drive the whole module in a browser — without touching app.py (which is mid-flight
with the receptionist work). This is the "FastAPI-for-frontend now" surface; the
Next.js dashboard comes later.

Run (from backend/):
    PIXIE_MODEL_MODE=fake .venv/bin/python -m uvicorn marketing.demo_app:app --port 8077
Then open http://localhost:8077/
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from .api import router as marketing_router

app = FastAPI(title="Pixie Marketing — Demo Dashboard")
app.include_router(marketing_router)


@app.get("/", response_class=HTMLResponse)
async def dashboard() -> str:
    return _PAGE


_PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pixie Marketing AI Agent</title>
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
  .wrap{display:grid;grid-template-columns:340px 1fr;gap:20px;padding:22px 28px;max-width:1400px;margin:0 auto}
  .card{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);
    border-radius:16px;padding:18px}
  .card h2{margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  label{display:block;font-size:12px;color:var(--muted);margin:12px 0 5px}
  input,select,textarea{width:100%;background:#0d1322;border:1px solid var(--line);color:var(--text);
    border-radius:10px;padding:10px 12px;font:inherit;outline:none}
  input:focus,select:focus,textarea:focus{border-color:var(--accent)}
  textarea{resize:vertical;min-height:60px}
  button{cursor:pointer;border:none;border-radius:11px;padding:12px 16px;font-weight:700;color:#0b0f1a;
    background:linear-gradient(135deg,var(--accent),var(--accent2));width:100%;margin-top:16px;font-size:14px}
  button.ghost{background:transparent;color:var(--text);border:1px solid var(--line);font-weight:600}
  button:disabled{opacity:.5;cursor:wait}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .results{display:flex;flex-direction:column;gap:18px}
  .panelhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
  .pill{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
  .pill.good{color:var(--good);border-color:#1d4d3a}.pill.warn{color:var(--warn);border-color:#4d3f1d}
  .pill.bad{color:var(--bad);border-color:#4d2330}
  .chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
  .chip{font-size:12px;background:#0d1322;border:1px solid var(--line);padding:5px 10px;border-radius:8px;color:#c7d2e8}
  .kv{font-size:13px;margin:6px 0}.kv b{color:var(--muted);font-weight:600}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .content-item{background:#0d1322;border:1px solid var(--line);border-radius:12px;padding:14px}
  .content-item .hook{font-weight:700;margin-bottom:6px}
  .muted{color:var(--muted)}.small{font-size:12px}
  .sched{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px}
  .day{background:#0d1322;border:1px solid var(--line);border-radius:10px;padding:9px}
  .day .d{font-size:11px;color:var(--accent2);font-weight:700}
  .presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:6px}
  .preset{background:#0d1322;border:1px solid var(--line);border-radius:10px;padding:10px;cursor:pointer;transition:.15s}
  .preset:hover{border-color:var(--accent)}
  .preset .nm{font-weight:700;font-size:13px}.preset .hr{font-size:11px;color:var(--bad);margin-top:3px}
  .empty{color:var(--muted);text-align:center;padding:40px 0}
  .spinner{display:inline-block;width:14px;height:14px;border:2px solid #ffffff55;border-top-color:#0b0f1a;
    border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px;margin-right:6px}
  @keyframes spin{to{transform:rotate(360deg)}}
  pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,Menlo,monospace;color:#cdd7ee;margin:6px 0 0}
</style>
</head>
<body>
<header>
  <div class="logo">P</div>
  <h1>Pixie Marketing AI Agent</h1>
  <span class="tag" id="mode">fake mode · $0</span>
  <span class="tag">deterministic services · AI for reasoning only</span>
</header>

<div class="wrap">
  <!-- LEFT: input -->
  <div class="card" style="align-self:start;position:sticky;top:90px">
    <h2>Business profile</h2>
    <label>Business name</label>
    <input id="name" value="Bliss Bridal Salon"/>
    <label>Industry</label>
    <select id="industry"></select>
    <div class="row">
      <div><label>Location</label><input id="location" value="Lahore"/></div>
      <div><label>Primary CTA</label><input id="cta" value="DM to book your bridal trial"/></div>
    </div>
    <label>Target audience</label>
    <input id="audience" value="brides-to-be, 22-35"/>
    <label>USP</label>
    <input id="usp" value="award-winning bridal styling"/>
    <label>Campaign goal</label>
    <textarea id="goal">2-week bridal-booking campaign</textarea>
    <div class="row">
      <div><label>Platform</label>
        <select id="platform">
          <option>instagram</option><option>tiktok</option><option>facebook</option>
          <option>youtube_shorts</option><option>linkedin</option><option>whatsapp</option>
        </select></div>
      <div><label>Duration (days)</label><input id="days" type="number" value="14"/></div>
    </div>
    <button id="run" onclick="buildAll()">✨ Build campaign plan</button>
    <button class="ghost" onclick="loadPreset('pixie')">Load Pixie soft-launch example</button>
  </div>

  <!-- RIGHT: results -->
  <div class="results">
    <div class="card">
      <div class="panelhead"><h2 style="margin:0">Strategy (the Brain)</h2><span class="pill" id="cost">—</span></div>
      <div id="strategy"><div class="empty">Fill the profile and hit <b>Build campaign plan</b>.</div></div>
    </div>
    <div class="card">
      <div class="panelhead"><h2 style="margin:0">Campaign plan</h2><span class="pill" id="campStatus">—</span></div>
      <div id="campaign"><div class="empty muted">No campaign yet.</div></div>
    </div>
    <div class="card">
      <h2>Content factory</h2>
      <div id="content"><div class="empty muted">No content yet.</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Creative brief</h2><div id="brief"><div class="empty muted">—</div></div></div>
      <div class="card"><h2>Platform dry-run <span class="small muted">(nothing posts live)</span></h2><div id="dry"><div class="empty muted">—</div></div></div>
    </div>
    <div class="card">
      <h2>Industry knowledge base · 20 presets</h2>
      <div class="presets" id="presets"></div>
    </div>
  </div>
</div>

<script>
const TID = "t_demo";
const $ = id => document.getElementById(id);
const esc = s => (s==null?"":String(s)).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const chips = arr => (arr||[]).map(x=>`<span class="chip">${esc(x)}</span>`).join("");

function profile(){
  return {
    tenant_id: TID,
    business_name: $("name").value,
    industry: $("industry").value,
    location: $("location").value,
    target_audience: $("audience").value,
    usp: $("usp").value,
    primary_cta: $("cta").value,
    platforms_used: [$("platform").value],
  };
}
async function api(path, body){
  const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  if(!r.ok) throw new Error(path+" → "+r.status+" "+await r.text());
  return r.json();
}

async function loadPresets(){
  const ps = await (await fetch("/v1/marketing/presets")).json();
  const sel = $("industry");
  sel.innerHTML = ps.map(p=>`<option value="${p.industry}">${esc(p.display_name)}</option>`).join("");
  sel.value = "beauty_salon";
  $("presets").innerHTML = ps.map(p=>`<div class="preset" onclick="pick('${p.industry}')">
     <div class="nm">${esc(p.display_name)}</div>
     ${p.high_risk?'<div class="hr">⚠ high-risk · human review</div>':'<div class="small muted" style="margin-top:3px">'+esc((p.best_campaign_types||[])[0]||"")+'</div>'}
   </div>`).join("");
}
function pick(ind){ $("industry").value = ind; window.scrollTo({top:0,behavior:"smooth"}); }
function loadPreset(which){
  if(which==="pixie"){
    $("name").value="Pixie"; $("industry").value="ai_saas"; $("location").value="United States";
    $("audience").value="small-business owners losing leads to missed calls";
    $("usp").value="an AI assistant that answers every call and recovers missed leads 24/7";
    $("cta").value="Book a demo"; $("goal").value="30-day Pixie US soft launch";
    $("platform").value="tiktok"; $("days").value="30";
  }
}

async function buildAll(){
  const btn=$("run"); btn.disabled=true; btn.innerHTML='<span class="spinner"></span>Building…';
  try{
    const prof = profile(), goal=$("goal").value, plat=$("platform").value;

    // 1. strategy
    const strat = await api("/v1/marketing/strategy", {tenant_id:TID, profile:prof, goal});
    const s = strat.strategy;
    $("cost").textContent = "$"+strat.cost_usd.toFixed(4)+(strat.used_fallback?" · synth":"");
    $("strategy").innerHTML = `
      <div class="kv"><b>Goal:</b> ${esc(s.campaignGoal)}</div>
      <div class="kv"><b>Audience:</b> ${esc(s.targetAudience)}</div>
      <div class="kv"><b>CTA:</b> ${esc(s.cta)}</div>
      <div class="kv"><b>Cadence:</b> ${esc(s.recommendedCadence)}</div>
      <div class="kv"><b>Platforms:</b></div><div class="chips">${chips(s.platforms)}</div>
      <div class="kv" style="margin-top:10px"><b>Content pillars:</b></div><div class="chips">${chips(s.contentPillars)}</div>
      <div class="kv" style="margin-top:10px"><b>Creative angles:</b></div><div class="chips">${chips(s.creativeAngles)}</div>
      <div class="kv" style="margin-top:10px"><b>Risk notes:</b></div><div class="chips">${chips(s.riskNotes)}</div>`;

    // 2. campaign
    const camp = await api("/v1/marketing/campaigns", {tenant_id:TID, profile:prof, goal, duration_days:+$("days").value});
    const st = (camp.approval_status||"").includes("review")?"warn":"good";
    $("campStatus").className="pill "+st; $("campStatus").textContent=camp.approval_status;
    $("campaign").innerHTML = `
      <div class="kv"><b>Name:</b> ${esc(camp.name)}</div>
      <div class="kv"><b>Type:</b> ${esc(camp.campaign_type)} &nbsp; <b>Posts:</b> ${(camp.schedule||[]).length}</div>
      <div class="kv"><b>Required assets:</b></div><div class="chips">${chips(camp.required_assets)}</div>
      <div class="kv" style="margin-top:10px"><b>Compliance:</b></div><div class="chips">${chips(camp.compliance_notes)}</div>
      <div class="kv" style="margin-top:10px"><b>Posting schedule:</b></div>
      <div class="sched">${(camp.schedule||[]).slice(0,12).map(d=>`
        <div class="day"><div class="d">Day ${esc(d.day_index??d.day)}</div>
        <div class="small">${esc(d.platform)} · ${esc(d.format)}</div>
        <div class="small muted">${esc(d.topic)}</div></div>`).join("")}</div>`;

    // 3. content
    const items = await api("/v1/marketing/content",
      {tenant_id:TID, profile:prof, campaign_id:camp.id, platform:plat, content_type:"reel_script", topic:goal, count:3});
    $("content").innerHTML = `<div class="grid2">`+items.map(it=>{
      const rk = it.risk_score>=60?"bad":it.risk_score>=30?"warn":"good";
      return `<div class="content-item">
        <div class="panelhead"><span class="pill ${rk}">risk ${it.risk_score}</span><span class="pill">${esc(it.content_type)}</span></div>
        <div class="hook">${esc(it.hook)}</div>
        <div class="small muted">${esc(it.main_copy)}</div>
        <div class="kv small" style="margin-top:8px"><b>CTA:</b> ${esc(it.cta)}</div>
        <div class="chips">${chips(it.hashtags)}</div></div>`;
    }).join("")+`</div>`;

    // 4. brief
    const brief = await api("/v1/marketing/briefs",
      {tenant_id:TID, profile:prof, platform:plat, video_format:"problem_solution_reel", concept:goal});
    $("brief").innerHTML = `
      <div class="kv"><b>Format:</b> ${esc(brief.video_format)} · ${esc(brief.aspect_ratio)} · ${esc(brief.duration_seconds)}s</div>
      <div class="kv"><b>Concept:</b> ${esc(brief.visual_concept)}</div>
      <div class="kv"><b>Mood:</b> ${esc(brief.mood)} &nbsp; <b>Pace:</b> ${esc(brief.editing_pace)}</div>
      <div class="kv"><b>Scenes:</b></div><div class="chips">${chips(brief.scene_direction)}</div>
      <div class="kv" style="margin-top:8px"><b>Asset checklist:</b></div><div class="chips">${chips(brief.asset_checklist)}</div>`;

    // 5. dry-run
    const dry = await api(`/v1/marketing/platforms/${plat}/dry-run`,
      {platform:plat, content_type:"reel_script", body:items[0].main_copy, caption:items[0].caption, hashtags:items[0].hashtags, cta:items[0].cta});
    $("dry").innerHTML = `
      <div class="kv"><b>Platform:</b> ${esc(dry.platform)} · <span class="pill">${esc(dry.support_level)}</span></div>
      <div class="kv"><b>Would post live:</b> <span class="pill ${dry.would_post?'bad':'good'}">${dry.would_post?'YES':'NO — dry-run'}</span></div>
      <div class="kv"><b>Limit checks:</b></div>
      <div class="chips">${(dry.limit_checks||[]).map(c=>`<span class="chip">${c.passed?'✓':'✗'} ${esc(c.name)}</span>`).join("")}</div>
      <pre>${esc(dry.notes||"")}</pre>`;
  }catch(e){
    alert(e.message);
  }finally{
    btn.disabled=false; btn.innerHTML="✨ Build campaign plan";
  }
}
loadPresets();
</script>
</body>
</html>"""
