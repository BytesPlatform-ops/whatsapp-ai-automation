"""Standalone demo frontend for the existing Pixie SEO service.

Mounts the unmodified `seo.router` and serves a single dashboard page so the SEO
service can be SEEN and driven in a browser. This file does NOT edit anything
under `seo/` — it only imports the router (the same one-line handoff the lead
would add to app.py) and adds a read-only UI on top.

Run (from backend/):
    PIXIE_MODEL_MODE=fake .venv/bin/python -m uvicorn seo_demo_app:app --port 8078
Then open http://localhost:8078/
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from seo.router import router as seo_router

app = FastAPI(title="Pixie SEO — Demo Dashboard")
app.include_router(seo_router)


@app.get("/", response_class=HTMLResponse)
async def dashboard() -> str:
    return _PAGE


_PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pixie SEO Service</title>
<style>
  :root{--bg:#07101a;--panel:#0f1b2a;--panel2:#142433;--line:#22344a;
    --text:#e6f0fa;--muted:#93a7bd;--accent:#22d3ee;--accent2:#34d399;--good:#34d399;
    --warn:#fbbf24;--high:#fb923c;--bad:#fb7185;--crit:#ef4444}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Roboto,Inter,sans-serif;color:var(--text);
    background:radial-gradient(1100px 500px at 85% -10%,#06283a 0%,transparent 60%),var(--bg)}
  header{display:flex;align-items:center;gap:14px;padding:18px 28px;border-bottom:1px solid var(--line);
    position:sticky;top:0;background:rgba(7,16,26,.7);backdrop-filter:blur(8px);z-index:5}
  .logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));
    display:grid;place-items:center;font-weight:800;color:#07101a}
  header h1{font-size:17px;margin:0}
  .tag{font-size:12px;color:var(--muted);border:1px solid var(--line);padding:3px 9px;border-radius:999px}
  .wrap{display:grid;grid-template-columns:360px 1fr;gap:20px;padding:22px 28px;max-width:1400px;margin:0 auto}
  .card{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:16px;padding:18px}
  .card h2{margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  label{display:block;font-size:12px;color:var(--muted);margin:12px 0 5px}
  input,select,textarea{width:100%;background:#0a1420;border:1px solid var(--line);color:var(--text);
    border-radius:10px;padding:10px 12px;font:inherit;outline:none}
  input:focus,textarea:focus{border-color:var(--accent)}
  textarea{resize:vertical;min-height:64px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  button{cursor:pointer;border:none;border-radius:11px;padding:12px 16px;font-weight:700;color:#07101a;
    background:linear-gradient(135deg,var(--accent),var(--accent2));width:100%;margin-top:16px;font-size:14px}
  button.ghost{background:transparent;color:var(--text);border:1px solid var(--line);font-weight:600}
  button:disabled{opacity:.5;cursor:wait}
  .tabs{display:flex;gap:8px;margin-bottom:6px}
  .tab{flex:1;text-align:center;padding:9px;border:1px solid var(--line);border-radius:10px;cursor:pointer;color:var(--muted);font-weight:600}
  .tab.on{background:#0a1420;color:var(--text);border-color:var(--accent)}
  .results{display:flex;flex-direction:column;gap:18px}
  .scorewrap{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
  .gauge{--v:0;width:120px;height:120px;border-radius:50%;display:grid;place-items:center;flex:none;
    background:conic-gradient(var(--g) calc(var(--v)*1%),#1b2c3e 0)}
  .gauge .inner{width:96px;height:96px;border-radius:50%;background:#0b1726;display:grid;place-items:center;text-align:center}
  .gauge .num{font-size:30px;font-weight:800}.gauge .of{font-size:11px;color:var(--muted)}
  .delta{font-size:13px}.delta b{font-size:22px}
  .cats{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin-top:14px}
  .cat{font-size:12px}
  .bar{height:7px;background:#1b2c3e;border-radius:6px;overflow:hidden;margin-top:3px}
  .bar > i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--accent2),var(--accent))}
  .cat .lab{display:flex;justify-content:space-between;color:var(--muted)}
  .issue{display:flex;gap:10px;padding:11px 0;border-top:1px solid var(--line)}
  .dot{width:9px;height:9px;border-radius:50%;margin-top:6px;flex:none}
  .sev-critical{background:var(--crit)}.sev-high{background:var(--high)}.sev-medium{background:var(--warn)}.sev-low{background:var(--muted)}
  .issue .t{font-weight:700}.issue .d{color:var(--muted);font-size:13px}
  .issue .rec{font-size:12px;color:var(--accent2);margin-top:3px}
  .sevpill{font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
  .empty{color:var(--muted);text-align:center;padding:36px 0}
  .muted{color:var(--muted)}.small{font-size:12px}
  .spinner{display:inline-block;width:14px;height:14px;border:2px solid #ffffff55;border-top-color:#07101a;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px;margin-right:6px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .note{font-size:12px;color:var(--warn);margin-top:8px}
</style>
</head>
<body>
<header>
  <div class="logo">S</div>
  <h1>Pixie SEO Service</h1>
  <span class="tag" id="mode">fake mode · $0</span>
  <span class="tag">Mode A enrich · Mode B audit</span>
</header>

<div class="wrap">
  <div class="card" style="align-self:start;position:sticky;top:90px">
    <div class="tabs">
      <div class="tab on" id="tabB" onclick="setMode('B')">Mode B · Audit</div>
      <div class="tab" id="tabA" onclick="setMode('A')">Mode A · Enrich</div>
    </div>

    <div id="formB">
      <h2 style="margin-top:8px">Audit a page</h2>
      <label>Live URL (needs network/SSL)</label>
      <input id="url" placeholder="https://example.com — or leave blank & use fields below"/>
      <label>Page title</label><input id="b_title" value="hi"/>
      <label>Meta description</label><input id="b_meta" value=""/>
      <label>H1 heading</label><input id="b_h1" value=""/>
      <label>Body content</label><textarea id="b_content">Short page about bridal makeup in Lahore.</textarea>
      <div class="row">
        <div><label>Images</label><input id="b_imgs" type="number" value="2"/></div>
        <div><label>Images w/ alt</label><input id="b_alt" type="number" value="0"/></div>
      </div>
      <button id="runB" onclick="audit()">🔎 Run SEO audit</button>
    </div>

    <div id="formA" style="display:none">
      <h2 style="margin-top:8px">Enrich a Pixie page</h2>
      <div class="row">
        <div><label>Business type</label><input id="a_type" value="beauty salon"/></div>
        <div><label>Brand</label><input id="a_brand" value="Bliss Bridal"/></div>
      </div>
      <label>Page title</label><input id="a_title" value="home"/>
      <label>Body content</label><textarea id="a_content">We do bridal makeup and hair in Lahore.</textarea>
      <button id="runA" onclick="enrich()">✨ Enrich & re-score</button>
      <div class="small muted" style="margin-top:10px">Mode A injects meta, headings, schema & alt text, then re-scores — before vs after.</div>
    </div>
  </div>

  <div class="results">
    <div class="card">
      <div id="scoreCard"><div class="empty">Run an audit to see the SEO score.</div></div>
    </div>
    <div class="card">
      <h2>Issues &amp; recommendations</h2>
      <div id="issues"><div class="empty muted">—</div></div>
    </div>
  </div>
</div>

<script>
const TID="t_demo";
const $=id=>document.getElementById(id);
const esc=s=>(s==null?"":String(s)).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const gcol=v=>v>=70?"#34d399":v>=40?"#fbbf24":"#fb7185";

function setMode(m){
  $("tabB").classList.toggle("on",m==="B"); $("tabA").classList.toggle("on",m==="A");
  $("formB").style.display=m==="B"?"":"none"; $("formA").style.display=m==="A"?"":"none";
}
async function api(path,body){
  const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json(); if(!r.ok) throw new Error((j.detail&&JSON.stringify(j.detail))||r.status); return j;
}
function gauge(score,max){
  const v=Math.round(score/(max||100)*100);
  return `<div class="gauge" style="--v:${v};--g:${gcol(v)}"><div class="inner"><div><div class="num">${score}</div><div class="of">/ ${max||100}</div></div></div></div>`;
}
function cats(by){
  return `<div class="cats">`+Object.entries(by||{}).map(([k,c])=>`
    <div class="cat"><div class="lab"><span>${esc(k)}</span><span>${c.score}%</span></div>
    <div class="bar"><i style="width:${c.score}%"></i></div></div>`).join("")+`</div>`;
}
function renderScore(sc,extra){
  $("scoreCard").innerHTML=`<h2>SEO score</h2><div class="scorewrap">${gauge(sc.score,sc.max_score)}
    <div><div class="small muted">${sc.passed_count} passed · ${sc.failed_count} failed · ${sc.applicable_count} checks</div>
    ${extra||""}</div></div>${cats(sc.by_category)}`;
}
function renderIssues(issuesDict){
  const order=["critical","high","medium","low"];
  let html="",n=0;
  for(const sev of order){
    for(const it of (issuesDict[sev]||[])){
      n++;
      html+=`<div class="issue"><div class="dot sev-${sev}"></div><div style="flex:1">
        <div class="t">${esc(it.title)} <span class="sevpill">${sev}</span></div>
        <div class="d">${esc(it.description)}</div>
        ${it.recommendation?`<div class="rec">→ ${esc(it.recommendation)}</div>`:""}</div></div>`;
    }
  }
  $("issues").innerHTML=n?html:`<div class="empty muted">No issues — clean page 🎉</div>`;
}

function pageObj(){
  const imgs=[],alt=+$("b_alt").value;
  for(let i=0;i<+$("b_imgs").value;i++) imgs.push(i<alt?{src:`img${i}.jpg`,alt:"described image"}:{src:`img${i}.jpg`});
  const headings=$("b_h1").value?[{tag:"h1",text:$("b_h1").value}]:[];
  return {title:$("b_title").value,meta_description:$("b_meta").value,content:$("b_content").value,headings,images:imgs};
}
async function audit(){
  const btn=$("runB");btn.disabled=true;btn.innerHTML='<span class="spinner"></span>Auditing…';
  try{
    const body={tenant_id:TID};
    if($("url").value.trim()) body.url=$("url").value.trim(); else body.page=pageObj();
    const d=await api("/api/seo/audit-url",body);
    renderScore(d.score, d.url?`<div class="small muted">audited: ${esc(d.url)}</div>`:"");
    renderIssues(d.issues||{});
  }catch(e){
    $("scoreCard").innerHTML=`<div class="empty">Audit failed: ${esc(e.message)}</div>`;
    $("issues").innerHTML=`<div class="note">If you used a live URL, this environment's Python is missing SSL root certs — leave the URL blank to audit the fields offline.</div>`;
  }finally{btn.disabled=false;btn.innerHTML="🔎 Run SEO audit";}
}
async function enrich(){
  const btn=$("runA");btn.disabled=true;btn.innerHTML='<span class="spinner"></span>Enriching…';
  try{
    const d=await api("/api/seo/generate",{tenant_id:TID,business_type:$("a_type").value,brand:$("a_brand").value,
      page:{title:$("a_title").value,content:$("a_content").value,headings:[],images:[{src:"hero.jpg"}]}});
    const before=d.score_before.score, after=d.score_after.score, up=after-before;
    renderScore(d.score_after,
      `<div class="delta">before <b style="color:${gcol(before)}">${before}</b> → after <b style="color:${gcol(after)}">${after}</b>
       <span class="sevpill" style="color:var(--good);border-color:#1d4d3a">▲ +${up}</span></div>
       <div class="small muted" style="margin-top:4px">applied ${(d.applied||[]).length} fixes${d.ai_fallback?" · AI fallback":""}</div>`);
    // show what's still failing after enrichment
    const checks=(d.score_after.by_category)?{}:{};
    $("issues").innerHTML=`<div class="small muted">Mode A applied: ${esc((d.applied||[]).join(", ")||"meta, headings, schema, alt text")}.<br>Suggested slug: <b>${esc(d.suggested_slug||"—")}</b></div>`;
  }catch(e){
    $("scoreCard").innerHTML=`<div class="empty">Enrich failed: ${esc(e.message)}</div>`;
  }finally{btn.disabled=false;btn.innerHTML="✨ Enrich & re-score";}
}
</script>
</body>
</html>"""
