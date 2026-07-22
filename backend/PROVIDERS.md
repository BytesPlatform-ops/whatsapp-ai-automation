# Content AI providers

How the two content products reach real AI providers, and how mock mode keeps
local dev and tests at $0.

## Model seam (shared)

Both products use the one model layer in `backend/models/` (`ModelRouter` →
`FakeProvider` | `OpenAIProvider`). Mode is env-driven:

- `PIXIE_MODEL_MODE=fake` (default) → deterministic mock, **no network, $0**.
- `PIXIE_MODEL_MODE=openai` → real OpenAI via the async SDK (`OPENAI_API_KEY`,
  `OPENAI_MODEL`). The key is read **server-side only** and never returned to any
  HTTP caller or browser bundle.

Real mode **never silently falls back to mock** — an unconfigured/failed provider
raises a classified error.

## General Content Agent

- Adapter: `content_agent/generator.py` (`generate` → `_real`). Bounded
  per-variation calls (≤ `MAX_VARIATIONS=5`) — no uncontrolled fan-out.
- Structured types (ad copy / SEO / carousel) parse strict JSON and validate the
  required keys; the model layer does one bounded JSON-repair. Malformed output →
  `malformed_output` error, not a fake document.
- Usage recorded per request (`ca_usage`): provider, model, tokens, estimated
  cost, variations, duration, mock/real, success. See `GET /api/content-agent/usage`.
- Status: `GET /api/content-agent/status` reports mock/mode/provider/model/
  availability/missing config (no secrets, no paid probe).

## AI Influencer (Content Creator)

- Text (ideas/scripts): `content_creator/agents/idea_agent.py` +
  `script_agent.py` via the fallback-safe `CcAiClient`. Real when
  `PIXIE_MODEL_MODE=openai`, else deterministic mock. Provider metadata (model,
  prompt version, estimated cost, latency, fallback flag) is recorded as
  `AgentLog` telemetry — see `GET /api/content-creator/ai-usage`.
- Video (Higgsfield): `content_creator/providers/higgsfield.py`, gated by
  `CONTENT_CREATOR_MOCK` (mock default) and `CONTENT_CREATOR_DRY_RUN`. Real
  submission needs `HIGGSFIELD_API_KEY/SECRET` + `HIGGSFIELD_VIDEO_MODEL` and is
  blocked behind approval Gate 3. Missing config → `provider_not_configured`.

## Errors

All provider failures map through `content_agent/errors.py` to a small set of safe
categories (`provider_not_configured`, `invalid_credentials`, `rate_limited`,
`quota_exceeded`, `malformed_output`, `provider_timeout`, `job_failed`, …) with a
browser-safe message, a retry hint, and a correlation id. Raw provider payloads,
headers and credentials are never surfaced; server logs are redacted.

## Cost / billing

Usage is **recorded**, but credit deduction is **not enforced** (`billing_enforced:
false` everywhere). No wallet deduction, no subscription gating in this phase.

## Tests / no paid calls

`tests/conftest.py` forces `PIXIE_MODEL_MODE=fake`, `CONTENT_CREATOR_MOCK=true`,
`CONTENT_CREATOR_DRY_RUN=true`, `PIXIE_PERSIST=memory` for the whole suite, so a
developer's real keys can never trigger a paid call or live post. Real-provider
behaviour is tested with a mocked router/SDK. Opt-in live smoke tests are gated by
`RUN_LIVE_MODEL_TESTS` / `RUN_LIVE_VIDEO_TESTS` (default off) and make one minimal
call only.

## Environment variables (names only — never commit values)

`PIXIE_MODEL_MODE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `CONTENT_CREATOR_MOCK`,
`CONTENT_CREATOR_DRY_RUN`, `CONTENT_CREATOR_PROVIDER`,
`CONTENT_CREATOR_DEFAULT_PROVIDER_MODE`, `HIGGSFIELD_API_KEY`,
`HIGGSFIELD_API_SECRET`, `HIGGSFIELD_VIDEO_MODEL`, `HIGGSFIELD_ASPECT_RATIO`,
`HIGGSFIELD_RESOLUTION`, `PIXIE_PERSIST`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RUN_LIVE_MODEL_TESTS`, `RUN_LIVE_VIDEO_TESTS`.
