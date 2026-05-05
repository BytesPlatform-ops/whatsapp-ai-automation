# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pixie — a WhatsApp + Messenger + Instagram chatbot that sells digital-agency services (websites, logos, ads, SEO audits, AI chatbots, custom software). One Express server in `src/index.js`, a single per-user conversation state machine, and an LLM driving the discovery/sales conversation. The product context lives in [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md); the *implementation* map is [FLOW.md](FLOW.md) and is the most useful single file in the repo when something is broken — read it before grep-spelunking.

## Commands

```bash
npm start                         # node src/index.js (production)
npm run dev                       # node --watch (auto-reload)
npm run embed                     # rebuild knowledge-base embeddings (src/knowledge/loader.js)
npm run build:landing             # build the Next.js landing page in landing/
npm run test:replay               # run every fixture in test/fixtures/
npm run test:replay:list          # list fixtures without running
node test/replay.js test/fixtures/02_*    # run a single fixture (or glob)
node --check src/path/to/file.js  # syntax check — used heavily; the .claude/settings.json allowlist confirms this is the standard verification step before commit
```

The replay suite hits the real Supabase + real OpenAI (~$0.05–0.20 per sweep), creates short-lived `test_…` user rows, and only mocks outbound messaging. See [test/README.md](test/README.md) for fixture format. The `Reply` assertions are substring-soft (LLM is non-deterministic); state and metadata assertions are strict.

## Architecture

### Inbound pipeline (the single most important thing to know)

Every message — WhatsApp, Messenger, Instagram — flows through the same path:

```
webhook route → src/webhook/parser.js → src/conversation/router.js → STATE_HANDLERS[user.state]
```

The router runs a **26-check pipeline** before dispatching to a handler. Anything that "didn't reply" or "got swallowed" is almost always one of those 26 checks intercepting silently — dedup, per-user lock, abuse detector, human-takeover gate, `/reset`, intent interceptor, undo classifier, etc. The full table with file:line refs is in [FLOW.md § Router pipeline](FLOW.md). Skim it whenever debugging "the bot didn't respond."

Notable behaviors of the pipeline:

- **Per-user serial lock** ([router.js:58](src/conversation/router.js#L58)) — two webhooks for the same user can land in parallel; the lock chains them so `/reset → first message` doesn't race.
- **1-second message buffer** — multiple texts within 1s are merged into one turn so a user typing in bursts is handled as a single intent.
- **Dedup window** — Meta occasionally redelivers the same `messageId`; the LRU map at the top of router.js silently drops repeats.
- **Auto-log of outbound** — handlers call `sendTextMessage(...)` etc., never log explicitly. `src/messages/sender.js` reads the current `userId` out of an AsyncLocalStorage and writes the assistant turn to `conversations` with the platform message id, so future inbound replies (`context.id` / `reply_to.mid`) can be resolved against bot messages.

### State machine

States are enumerated in [src/conversation/states.js](src/conversation/states.js); the dispatch table is `STATE_HANDLERS` near the top of `router.js`. Each handler lives in [src/conversation/handlers/](src/conversation/handlers/) and is responsible for mutating `user.state` and `user.metadata` (via `updateUserState` / `updateUserMetadata`). Handlers also use `pushStateHistory` from `undoStack.js` so users can say "go back".

Default state for new users is `SALES_CHAT` — an LLM-driven discovery conversation in [salesBot.js](src/conversation/handlers/salesBot.js). The salesbot doesn't route flows by intent classifier; instead the LLM is prompted to emit **trigger tags** like `[TRIGGER_WEBSITE_DEMO]`, `[TRIGGER_LOGO_MAKER]`, `[SEND_PAYMENT: amount=X, ...]`, which `salesBot.js` parses out and turns into state transitions / Stripe links. If the bot won't trigger, the LLM examples in [src/llm/prompts.js](src/llm/prompts.js) are usually the fix.

The biggest flow is the website builder ([webDev.js](src/conversation/handlers/webDev.js)) with ~22 states. Industry keyword decides template (`isHvac` / `isRealEstate` / `isSalon` arrays in [src/website-gen/templates/index.js](src/website-gen/templates/index.js#L19-L100)) — unrecognised industries fall to a generic template, so adding a niche means appending to those keyword arrays.

### Outbound + payment

`createPaymentLink` in [src/payments/stripe.js](src/payments/stripe.js) inserts a pending row in `payments` and builds a Stripe Checkout URL combining website + domain price. Stripe webhook handler at [src/payments/stripeWebhook.js](src/payments/stripeWebhook.js) is mounted **before** `express.json()` in `src/index.js` because Stripe signature verification needs the exact raw bytes — moving it breaks signatures. On `checkout.session.completed`, [postPayment.js](src/payments/postPayment.js) marks the payment paid, optionally registers the domain (Namecheap), redeploys the site as `paymentStatus='paid'` (banner removed), and emails admin. Refunds flip `paymentStatus` back to `'preview'` and the 3-revision cap re-applies — that's intentional.

### Background jobs

All started in `src/index.js` after `app.listen`:

| Job | Where | Cadence |
|---|---|---|
| Followup scheduler (22h website discount, 24h SEO nudge) | [src/followup/scheduler.js](src/followup/scheduler.js) | every 30 min |
| Chatbot SaaS scheduler (trial expiry, demo follow-ups) | [src/chatbot/jobs/scheduler.js](src/chatbot/jobs/scheduler.js) | varies |
| Instagram token auto-refresh | [src/jobs/instagramTokenRefresh.js](src/jobs/instagramTokenRefresh.js) | every 50 days |
| Day-30 upsell email | [src/jobs/upsellScheduler.js](src/jobs/upsellScheduler.js) | daily |
| Domain DNS verifier | [src/jobs/domainVerifier.js](src/jobs/domainVerifier.js) | every 5 min |
| Site cleanup (1h watermark, 60d delete) | [src/jobs/siteCleanup.js](src/jobs/siteCleanup.js) | every 15 min |
| Salon booking 24h reminders | [src/jobs/bookingReminders.js](src/jobs/bookingReminders.js) | every 15 min |

### Boot smoke check

[src/boot/handlerSmokeCheck.js](src/boot/handlerSmokeCheck.js) runs before `app.listen` and `process.exit(1)`s on failure — it `require()`s every handler (catching parse / missing-import errors that wouldn't surface until a user hit a specific code path) and statically scans for calls to known sender/db functions that aren't destructured from a require. Add new common exports to its `KNOWN_EXPORTS` map when introducing them.

### Settings + price interpolation

Admin-managed settings live in the `admin_settings` Supabase table, cached in-process by [src/db/settings.js](src/db/settings.js). [src/llm/provider.js](src/llm/provider.js) interpolates tokens like `{{WEBSITE_PRICE}}`, `{{WEBSITE_DISCOUNT_PCT}}`, `{{REVISION_PRICE}}`, `{{SEO_FLOOR_PRICE}}` into prompts at call time, so price changes from the admin panel propagate without a deploy. The cache is warmed at boot — there's no cross-instance pub/sub yet, so multi-instance deploys can briefly serve stale prices after a write.

## Conventions worth knowing

- **CommonJS, not ESM** (`"type": "commonjs"` in package.json). Use `require` / `module.exports`.
- **No test runner / no linter configured.** `node --check <file>` for syntax verification, the smoke check at boot for import checks, and `node test/replay.js` for behavioral regression. Many `node --check` invocations are pre-allowed in [.claude/settings.json](.claude/settings.json) for that reason.
- **Per-platform identity:** users are keyed by `(phone, channel, phone_number_id)`, so the same person texting two of our numbers yields two distinct user rows. Don't dedupe on phone alone.
- **Tester phones** (`TESTER_PHONES` env) are excluded from the feedback system, implicit-friction logging, and the website rate-limit. Useful when manually testing — set your number there and you won't pollute analytics.
- **GDPR consent gates leads:** every lead form (contact, salon booking) requires a checked consent checkbox. Server rejects submissions without `consent_given`. Don't relax this without a deliberate change to the privacy/legal posture.
- **Helmet is selectively bypassed** for `/admin`, `/widget.js`, `/chat/*`, `/demo/*`, `/privacy`, and the landing root because each of those uses inline scripts/styles that the default CSP would block (see `app.use((req, res, next) => ...)` in `src/index.js`). Don't blanket-enable helmet without re-verifying those surfaces.
- **Outbound IP whitelist:** Namecheap requires a whitelisted source IP, and Render rotates IPs on free/Starter plans. `GET /debug/outbound-ip` reports what the server is currently sending from.

## Reference documents in the repo

- [FLOW.md](FLOW.md) — implementation map: every state, the 26-check router pipeline with file:lines, payment flow, and a failure-mode runbook keyed by tester symptom. Skim before debugging.
- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) / [WHAT_IS_PIXIE.md](WHAT_IS_PIXIE.md) — product spec, pricing, voice.
- [pixie_flows.md](pixie_flows.md) — design-side narrative of how each conversation should *feel* (sister to FLOW.md). When code and this disagree, code wins; one of the two needs an update.
- [test/README.md](test/README.md) — fixture format and how to add a regression test from a real tester transcript.
- [DOMAIN_FLOW_PLAN.md](DOMAIN_FLOW_PLAN.md), [DOMAIN_RENEWAL_PLAN.md](DOMAIN_RENEWAL_PLAN.md) — domain purchase + DNS specifics.
- [knowledge/](knowledge/) — markdown corpus loaded into pgvector via `npm run embed` and queried by [src/knowledge/retriever.js](src/knowledge/retriever.js) for FAQ-style answers.
