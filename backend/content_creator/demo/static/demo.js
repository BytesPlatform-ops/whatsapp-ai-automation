/* Pixie Content Creator — demo console.
   Vanilla JS, no build step. All fetches are same-origin to
   /demo/api/content-creator/*. State + logs are mock-only.
*/
"use strict";

const API = "/demo/api/content-creator";
const TENANT = "demo";

/* Stage buttons: label + endpoint (POST unless noted). Order = pipeline order. */
const STAGE_ACTIONS = [
  { key: "intake",        label: "1 · Intake (profile)",       fn: postProfile },
  { key: "influencer",    label: "2 · Influencer setup",       fn: postInfluencer },
  { key: "provider",      label: "3 · Provider connection",    fn: postProvider },
  { key: "ideas",         label: "4 · Generate ideas",         path: "/ideas/generate" },
  { key: "scripts",       label: "6 · Generate script",        path: "/scripts/generate" },
  { key: "cost",          label: "8 · Cost estimate",          path: "/cost-estimate" },
  { key: "video",         label: "9 · Generate video",         path: "/videos/generate" },
  { key: "quality",       label: "10 · Quality check",         path: "/videos/quality-check" },
  { key: "posting",       label: "12 · Schedule posts",        fn: postSchedule },
  { key: "analytics",     label: "13 · Analytics sync",        path: "/analytics/sync" },
];

/* Gate approve endpoints. */
const GATE_ACTIONS = {
  idea:       { path: "/ideas/approve" },
  script:     { path: "/scripts/approve" },
  production: { path: "/production/approve" },
  publish:    { path: "/videos/publish-approve" },
};

const el = (id) => document.getElementById(id);

/* ---------------- fetch helpers ---------------- */

async function call(path, body) {
  const res = await fetch(`${API}${path}?tenant=${encodeURIComponent(TENANT)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function getJSON(path) {
  const res = await fetch(`${API}${path}?tenant=${encodeURIComponent(TENANT)}`);
  return res.json();
}

/* ---------------- per-stage POST wrappers (bodies) ---------------- */

function postProfile() {
  return call("/profile", {
    brand: "Aurora Studio",
    niche: "boutique coffee roaster",
    tone: "warm",
    language: "en",
    audience: "local cafe lovers",
    goals: "drive foot traffic",
  });
}
function postInfluencer() {
  return call("/influencer/characteristics", {
    gender: "female",
    age: "late 20s",
    look: "approachable barista",
    style: "cozy minimal",
  });
}
function postProvider() {
  return call("/provider", { mode: "pixie_account", connection_type: "mock" });
}
function postSchedule() {
  return call("/posts/schedule", {
    platforms: ["meta", "instagram", "tiktok"],
    scheduled_time: "2026-07-01T09:00:00Z",
  });
}

/* ---------------- notice ---------------- */

function notice(kind, msg) {
  const n = el("notice");
  n.hidden = false;
  n.className = `notice ${kind}`;
  n.textContent = msg;
}
function clearNotice() {
  el("notice").hidden = true;
}

/* ---------------- rendering ---------------- */

let PROGRESS = [];

function renderProgress(progress, currentStage) {
  PROGRESS = progress;
  const bar = el("progressBar");
  bar.innerHTML = "";
  const curIndex = progress.findIndex((p) => p.stage === currentStage);
  progress.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "step" + (p.gate ? " gate" : "");
    if (i < curIndex) d.classList.add("done");
    if (p.stage === currentStage) d.classList.add("current");
    d.innerHTML = `<div class="n">${p.n}</div><div class="t">${escapeHtml(p.title)}</div>`;
    bar.appendChild(d);
  });
}

function renderState(state) {
  el("statePanel").textContent = JSON.stringify(state, null, 2);

  // video tile
  if (state.video && Object.keys(state.video).length) {
    el("videoCard").hidden = false;
    el("videoRef").textContent =
      state.video.asset_ref || state.video.video_ref || state.video.ref || "(mock)";
    el("videoStatus").textContent = state.video.status || "mock";
    el("videoDur").textContent =
      (state.video.duration_seconds ?? state.video.duration ?? 15) + "s";
  }

  // quality flags
  if (state.quality && Object.keys(state.quality).length) {
    el("qualityCard").hidden = false;
    renderQuality(state.quality);
  }

  // analytics
  if (state.metrics && Object.keys(state.metrics).length) {
    el("analyticsCard").hidden = false;
    renderMetrics(state.metrics);
  }

  // ideas
  if (Array.isArray(state.ideas) && state.ideas.length) {
    el("ideasCard").hidden = false;
    const ul = el("ideasList");
    ul.innerHTML = "";
    state.ideas.forEach((idea) => {
      const li = document.createElement("li");
      const text =
        typeof idea === "string"
          ? idea
          : idea.title || idea.hook || idea.summary || JSON.stringify(idea);
      li.textContent = text;
      ul.appendChild(li);
    });
  }

  // gate button states
  const approvals = state.approvals || {};
  Object.keys(GATE_ACTIONS).forEach((g) => {
    const btn = document.querySelector(`.btn.gate[data-gate="${g}"]`);
    if (btn) btn.classList.toggle("approved", approvals[g] === "approved");
  });
}

function renderQuality(quality) {
  const body = el("qualityBody");
  body.innerHTML = "";
  const overall = quality.status || quality.overall || "—";
  const head = document.createElement("div");
  head.className = "flag";
  head.innerHTML = `<strong>Overall</strong> <span class="pill ${pillClass(overall)}">${escapeHtml(String(overall))}</span>`;
  body.appendChild(head);

  const flags = quality.flags || quality.checks || [];
  const items = Array.isArray(flags) ? flags : Object.entries(flags);
  items.forEach((f) => {
    const div = document.createElement("div");
    div.className = "flag";
    let name, val;
    if (Array.isArray(f)) { name = f[0]; val = f[1]; }
    else { name = f.name || f.check || "flag"; val = f.status ?? f.result ?? f.value ?? "—"; }
    div.innerHTML = `<span>${escapeHtml(String(name))}</span> <span class="pill ${pillClass(val)}">${escapeHtml(String(val))}</span>`;
    body.appendChild(div);
  });
}

function pillClass(v) {
  const s = String(v).toLowerCase();
  if (s.includes("pass") || s === "true" || s === "ok") return "pass";
  if (s.includes("fail") || s === "false") return "fail";
  return "warn";
}

function renderMetrics(metrics) {
  const grid = el("metricsGrid");
  grid.innerHTML = "";
  Object.entries(metrics).forEach(([k, v]) => {
    if (typeof v === "object") return;
    const m = document.createElement("div");
    m.className = "metric";
    m.innerHTML = `<div class="v">${escapeHtml(String(v))}</div><div class="l">${escapeHtml(k)}</div>`;
    grid.appendChild(m);
  });
}

function renderLogs(logs) {
  const box = el("logsPanel");
  box.innerHTML = "";
  (logs || []).forEach((r) => {
    const row = document.createElement("div");
    row.className = "logrow";
    const cost = r.estimated_cost ? `$${Number(r.estimated_cost).toFixed(2)}` : "$0.00";
    row.innerHTML =
      `<span class="seq">#${r.seq}</span>` +
      `<span class="st">${escapeHtml(r.stage)}</span>` +
      `<span class="pill ${pillClass(r.status)}">${escapeHtml(r.status)}</span>` +
      `<span class="cost">${cost}</span>`;
    box.appendChild(row);
  });
}

function renderBanner(banner) {
  el("mockBadge").textContent = banner.banner || "DEMO · MOCK MODE";
  el("bannerInfo").textContent =
    `mock_mode=${banner.mock_mode} · dry_run=${banner.dry_run_posting} · model=${banner.model_mode} · live=${banner.live_enabled}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- apply an envelope response ---------------- */

function applyEnvelope(data) {
  if (data.banner) renderBanner(data.banner);
  if (data.progress) renderProgress(data.progress, data.state ? data.state.stage : null);
  if (data.state) renderState(data.state);
}

async function refreshLogs() {
  const data = await getJSON("/logs");
  renderLogs(data.logs);
}

/* ---------------- action runner ---------------- */

async function runAction(action, { quiet = false } = {}) {
  let result;
  if (action.fn) result = await action.fn();
  else result = await call(action.path);

  if (result.status === 409) {
    if (!quiet) notice("block", `🔒 blocked — ${result.data.detail || "approve the gate first"}`);
    applyEnvelopeFromState();
    return result;
  }
  if (!result.ok) {
    if (!quiet) notice("err", `Error ${result.status}`);
    return result;
  }
  applyEnvelope(result.data);
  if (!quiet) {
    clearNotice();
    notice("ok", "✓ " + (action.label || "done"));
  }
  await refreshLogs();
  return result;
}

async function applyEnvelopeFromState() {
  const data = await getJSON("/state");
  applyEnvelope(data);
}

async function approveGate(gate) {
  const result = await call(GATE_ACTIONS[gate].path);
  if (result.ok) {
    applyEnvelope(result.data);
    notice("ok", `✓ Gate "${gate}" approved`);
    await refreshLogs();
  } else {
    notice("err", `Gate approve failed (${result.status})`);
  }
}

/* ---------------- happy path ---------------- */

async function runHappyPath() {
  notice("ok", "Running full happy path…");
  await reset();
  const steps = [
    () => runAction(STAGE_ACTIONS[0], { quiet: true }), // intake
    () => runAction(STAGE_ACTIONS[1], { quiet: true }), // influencer
    () => runAction(STAGE_ACTIONS[2], { quiet: true }), // provider
    () => runAction(STAGE_ACTIONS[3], { quiet: true }), // ideas/generate
    () => approveGate("idea"),
    () => runAction(STAGE_ACTIONS[4], { quiet: true }), // scripts/generate
    () => approveGate("script"),
    () => runAction(STAGE_ACTIONS[5], { quiet: true }), // cost-estimate
    () => approveGate("production"),
    () => runAction(STAGE_ACTIONS[6], { quiet: true }), // videos/generate
    () => runAction(STAGE_ACTIONS[7], { quiet: true }), // quality-check
    () => approveGate("publish"),
    () => runAction(STAGE_ACTIONS[8], { quiet: true }), // posts/schedule
    () => runAction(STAGE_ACTIONS[9], { quiet: true }), // analytics/sync
  ];
  for (const step of steps) {
    await step();
    await sleep(120);
  }
  notice("ok", "✓ Happy path complete — reached Analytics with a mock video.");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- reset + init ---------------- */

async function reset() {
  // hide artifact cards
  ["videoCard", "qualityCard", "analyticsCard", "ideasCard"].forEach((id) => (el(id).hidden = true));
  const result = await call("/reset");
  applyEnvelope(result.data);
  await refreshLogs();
}

function buildStageButtons() {
  const wrap = el("stageButtons");
  wrap.innerHTML = "";
  STAGE_ACTIONS.forEach((a) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = a.label;
    b.addEventListener("click", () => runAction(a));
    wrap.appendChild(b);
  });
}

function wireGateButtons() {
  document.querySelectorAll(".btn.gate").forEach((btn) => {
    btn.addEventListener("click", () => approveGate(btn.dataset.gate));
  });
}

async function init() {
  buildStageButtons();
  wireGateButtons();
  el("btnReset").addEventListener("click", () => reset());
  el("btnHappy").addEventListener("click", () => runHappyPath());
  const data = await getJSON("/state");
  applyEnvelope(data);
  await refreshLogs();
}

document.addEventListener("DOMContentLoaded", init);
