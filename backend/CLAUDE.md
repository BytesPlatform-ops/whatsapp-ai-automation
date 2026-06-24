# CLAUDE.md — Pixie Backend

Instructions for Claude Code when working **inside the `backend/` folder**. This file is
scoped to the backend; the repo-root `CLAUDE.md` (the WhatsApp/Express app) still applies to
the rest of the repository and is **not** replaced by this one.

> From now on, our work happens in `backend/`. Treat this folder as the working set.

---

## Project Overview

**Pixie** — an AI website builder + business assistant. The `backend/` folder is the
**Python service** that turns a plain-language request into a complete, structured website.

Detected stack (verified from the code in this folder):

| Layer | What's actually here |
|---|---|
| **Backend** | **Python 3.12 + FastAPI** (`app.py`), **Pydantic v2** schemas, served by **uvicorn** |
| **AI core** | Provider-abstracted **model layer** (`models/`: `base.py` Provider protocol, `fake.py`, `router.py`, `pricing.py`), env-driven by `PIXIE_MODEL_MODE` (default `fake`; `openai` wired later). Cheap-first tier routing: classify/firewall → SMALL, full generation → LARGE. System prompt in `prompts/PIXIE_AGENT_system_prompt.md`. |
| **Pipeline** | `orchestrator/` (build-vs-edit + usage metering) → `generation/` (`builder.py`, `node_bridge.py`) → `bridge/render_site.js` (Python→Node bridge reusing the repo's website-gen templates) → `preview/renderer.py` |
| **Schemas** | `schemas/` — `Request`, `Site` (the central product object), `UsageEvent`, pricing/usage envelopes |
| **Billing** | `billing/` — `UsageRecorder`, per-call `{model, tokens, latency, cost}` metering |
| **Tests** | **pytest** + **httpx** + **anyio** (`tests/test_pipe.py`, exercises the ASGI app via `TestClient`) |
| **Deploy** | **Docker** (`Dockerfile`, `docker-compose.yml`) — `uvicorn app:app` on port 8000 |
| **Frontend** | **React/Next.js lives at the repo root (`landing/`), NOT in `backend/`.** The `frontend-ui` agent is rarely needed here — to be confirmed if a backend-owned UI appears. |
| **Database** | **No Prisma in this repo.** The product database is **Supabase (PostgreSQL)** accessed at the repo root via `@supabase/supabase-js`. The `backend/` folder currently has **no DB layer** — to be confirmed as the backend grows. The `database-prisma` agent therefore covers **Supabase / PostgreSQL** here (Prisma terminology only applies if/when a Prisma layer is introduced). |

> Note on the original brief: it described the DB as "Supabase + Prisma ORM." Prisma was **not**
> found anywhere in the codebase. This file reflects what is actually present; update it if a
> Prisma layer is added.

Key commands (run from `backend/`):

```bash
pip install -r requirements.txt          # install deps
uvicorn app:app --reload --port 8000      # run the API locally
pytest -q                                 # run the test suite
python -m py_compile <file.py>            # quick syntax check (no execution)
docker compose up --build                 # run via Docker
```

The model layer defaults to `PIXIE_MODEL_MODE=fake` — tests and local runs cost **$0** and hit
no network. Set `PIXIE_MODEL_MODE=openai` only with real keys present.

---

## Core Working Rules

- **Never delete existing functionality.**
- **Never change the database schema unless explicitly approved.**
- **Never change API contracts** (request/response shapes, the `Site` JSON schema, `/v1/generate`)
  unless the task requires it — and call it out when it does.
- **Always inspect related files before editing** (the schema, the orchestrator path, the model
  layer) — this codebase is layered; an edit in one place ripples.
- **Always preserve business logic** when doing UI or refactor work.
- **Always run available validation after implementation when possible** — `pytest -q`,
  `python -m py_compile`, and the relevant `node --check` for bridge JS.
- **Always summarize** changed files, risks, and testing status at the end.

---

## Multi-Agent Workflow

Claude should delegate to specialist subagents based on the task. Agents live in
`backend/.claude/agents/`. Pick the narrowest fit:

| Agent | Use it for |
|---|---|
| **lead-engineer** | Planning, task breakdown, deciding order, coordinating other agents, final delivery summary |
| **frontend-ui** | UI / React / Tailwind / shadcn / Framer Motion / responsiveness (rare in this folder — UI is at repo root) |
| **backend-api** | FastAPI/Python routes, services, dependencies, Pydantic models, auth, validation, server bugs |
| **database-prisma** | Supabase / PostgreSQL (and Prisma if added): queries, relations, migrations, constraints, data integrity |
| **qa-tester** | Regression checks, broken flows, reproduction steps, `pytest`/lint/build verification, edge cases |
| **code-reviewer** | Final review of a change: quality, security, performance, regressions, CLAUDE.md compliance |
| **devops-git** | Git status/branches/commits, package scripts, Docker, CI/CD, Render/Vercel, build errors, env setup |
| **product-analyst** | Requirements, user flows, UX, acceptance criteria, missing features (read-only) |
| **ai-prompt-engineer** | Pixie's AI core: the website-builder system prompt, model selection/routing (cheap vs large), structured output (`Site` JSON), prompt-injection safety, generation quality (bespoke vs templated) |

A typical task: **lead-engineer** plans → the right specialist implements → **qa-tester** checks →
**code-reviewer** signs off.

---

## Safety Rules (IMPORTANT — we work on a SHARED branch)

Two developers — **Anas** and **Ali** — work on the **same branch (`my-future-work`)** but on
**different files**. To avoid conflicts:

- **NEVER let two agents edit the same file at the same time.**
- **Before editing, check `git status`** and warn me about any dirty/uncommitted files that
  belong to the other developer.
- **Prefer creating NEW files over editing shared ones.** A new file = no merge conflict.
- If a task needs a file the other developer likely owns, **STOP and tell me** — don't edit it.
- Make **small, focused changes.**
- **Ask before** destructive commands, deleting files, schema migrations, and dependency upgrades.
- **Do not expose secrets** from `.env` files (keys, Supabase service role, Stripe, OpenAI).
- **Do not commit unless I explicitly ask.**

---

## Final Response Format

Every implementation task must end with:

1. **Summary** — what was done, in 1–2 lines
2. **Files changed** — exact paths
3. **What was fixed/added**
4. **Commands run** — and their result
5. **Testing result** — pass/fail, or what couldn't be tested
6. **Remaining risks**
7. **Recommended next step**

---

## Enabling experimental agent teams (manual note)

This setup configures the **standard Claude Code subagent system** (the `.claude/agents/*.md`
files), which works without any flag — Claude can delegate to any of the 9 agents above today.

`backend/.claude/settings.local.json` also sets an opt-in env flag:

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

The `env` block is a supported Claude Code setting (it injects environment variables into the
session), so this is safe to keep. The specific flag is **experimental and may be a no-op** in
the current version — if so, it changes nothing and subagent delegation still works. To enable or
disable it manually, edit that `env` value (or remove the key). You can confirm what's active with
`/status` / `/config` inside Claude Code.
