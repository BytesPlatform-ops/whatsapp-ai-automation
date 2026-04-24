# Pixie Humanization — Status & Remaining Work

_Snapshot as of workflow-3 branch, commit `eae1389`. Updated 2026-04-23._

## Where things stand

### ✅ Done and committed

| Phase | Commit | What landed |
|-------|--------|-------------|
| 0 | `c3f6b9d` | Rolling conversation summary (remembers long chats) |
| 1 | (bundled) | Bug fixes from prior dumb-user test runs |
| 2 | `1f667de` | Entity accumulator for the webdev flow |
| 3 | `d8f2095` | Smart defaults + LLM-first extraction, gpt-5 upgrade |
| 4 | (rolled back) | Progress indicators were tried and pulled — they read as robotic |
| 5 | `98b167f` | Undo stack — "wait go back" pops one webdev step |
| 6 | `b1675dc` | Localizer, per-user serial lock, message dedup, LLM-first intent classifiers |
| 7 | `441d735` | Rapid-message buffering — debounce + in-flight coalescing merges rapid typing into one turn |
| 8 | `0860992` | Objection handler + gentler sales Stage 6 + language-rule guardrails (names aren't language signals) |
| 9 | `39a3840` | Session recap — warm contextual welcome-back after 30 min of silence |
| 10 | `0c1e1f1` | Interactive reply matcher — type a number/title/synonym to pick a button (regex fast-path + LLM fallback) |
| 11 | `7002857` | Cross-flow entity carryover — webdev's name/industry/services flow into ad / logo / chatbot flows |

### 🎁 Extras landed in-session (not in the original 15-task plan)

| Topic | Commit | What landed |
|-------|--------|-------------|
| HVAC template expansion | `bc35564` | 8 new trades supported (electrical, roofing, appliance, garage door, locksmith, pest control, water damage, tree service) — each with keyword detection, default services, per-trade LLM content prompt, and credentials card |
| Trade-aware summary | `da18de0` | Webdev summary now previews default trade services instead of "None (skipped)" |
| SEO pipeline speed | `d327d3a` | Tightened LLM timeouts so stalls surface as errors instead of 90s silent hangs |
| Post-website upsell | `355e090` | One in-bot soft cross-sell right after the site goes live (complements the existing day-7/30/60/90 email upsell) |
| Webdev + localizer fixes | `d86e741` | Multi-field contact input ("email is X and phone is Y") parses correctly; localizer auto-fetches latest user message so stale language caches can't translate replies into the wrong language |
| Boot smoke check | `0c1e1f1` | `src/boot/handlerSmokeCheck.js` runs on startup — catches missing-import bugs (like the `sendCTAButton` one) before the server accepts traffic |
| Service selection polish | `7002857` | `/menu` uses a dedicated greeting (no "didn't catch that" for `/menu` itself); "any other services?" routes to the full 10-item list; `pickServiceFromSwitch` handles negation ("forget the website, do chatbot") and plurals ("marketing ads"); `/reset` now clears `conversationSummary`, domain state, preferredLanguage, objectionTopics, upsell flags |

---

## 🔴 Remaining phases

4 phases left. Grouped by bucket.

### Bucket B — multi-service handling

- **Phase 12 — Multi-service queue**
  - When one message names multiple services ("I need a website AND a logo AND some ads"), acknowledge all, suggest an order, queue them in `metadata.serviceQueue`, auto-transition through them after each completion.
  - Entry point in messageAnalyzer / intent classifier to return `topicSwitches: string[]` (plural) when multiple services detected.

### Bucket C — new input types + return visitors

- **Phase 13 — Abuse detection**
  - Classifier returns `isAbusive: boolean`. Router short-circuits on abuse: firm polite decline, log for admin, no LLM escalation.
  - Covers hate / phishing / "help me hack a site" / etc.

- **Phase 14 — Document + location handling**
  - Webhook parser to handle `document` and `location` message types.
  - Docs: bot acknowledges ("thanks, let me take a look"), stored for admin.
  - Location: reverse-geocode into city/address and seed `websiteData.contactAddress` / `primaryCity`.

- **Phase 15 — Return-visitor recognition**
  - On entry, query completed sites/audits/logos for this phone. If any exist, prepend a specific greeting: *"Hey! How's the Glow Studio site treating you?"* instead of the generic Pixie opener.

---

## Outstanding manual testing

See [SESSION_2026-04-23.md](SESSION_2026-04-23.md) for the full 25+ scenario checklist covering Phases 8-11 + the in-bot upsell + bug fixes. Every commit landed today needs to be verified on real WhatsApp before the work is shippable.

---

## Open questions (still relevant)

### 1. Progress indicators — **recommend: leave dead**
Phase 4 tried "step 3 of 6" style indicators and we rolled them back because they read as robotic. WhatsApp is a casual medium; form-wizard phrasing feels off. We already imply progress softly in a few spots ("last thing — what contact info..."). Good enough.

### 2. Priority order for remaining phases — **recommend: B → C**
- **Phase 12 (multi-service queue)** — good UX unlock for multi-intent messages, but haven't seen users bumping into this a lot.
- **Phase 13 (abuse detection)** — edge-case / infra; no reported incidents, but cheap insurance.
- **Phase 14 (doc/location)** — users have sent locations a few times; the bot logs but doesn't use them.
- **Phase 15 (return-visitor)** — biggest UX unlock for repeat customers. Would combine nicely with the existing email upsell cadence.

Revised take after today: Phase 15 is probably the next highest-impact, Phase 12 second. Happy to build either order.

### 3. Location reverse-geocoding service — **recommend: OpenStreetMap Nominatim**
Free, no API key, MIT-compatible terms for low volume. Good enough to turn `lat/lng → "Karachi, Sindh, Pakistan"`. Swap to Google Maps later if we ever hit fair-use limits.

### 4. Full cross-sell engine (Option C from dev session) — **currently deferred**
Option B shipped today: one pitch at site-live. If that single pitch converts well we can expand into a multi-event rules-based engine. Decision gate: look at analytics after ~50 post-website upsell fires; if conversion to the next service is decent, expand.

### 5. Known pre-existing issues not touched today
- Stale `via_phone_number_id` on some user rows causing `"Unsupported request - method type: post"` errors from Meta on follow-up sends. Needs either a one-time audit/backfill script or a sender-level fallback retry with `env.whatsapp.phoneNumberId` on error 100.
- 34-minute gap some users saw between "⏳ Analyzing..." and the audit report — most likely Meta webhook queuing on the user side, not reproducible from code. Timeouts tightened so stalls surface rather than silently stall.

---

## Recent commit log (reverse chronological)

```
eae1389  session notes: document today's work + outstanding manual tests
d86e741  webdev + localizer: parse multi-field contact blobs, kill stale language caches
355e090  post-website upsell: one soft in-bot pitch after site goes live
7002857  phase 11: cross-flow entity carryover + smarter menu routing
0c1e1f1  interactive reply matcher: type a number or the option name to pick
da18de0  webdev summary: preview trade defaults instead of "None (skipped)"
39a3840  session recap: warm welcome-back after 30 min of silence
bc35564  hvac template: add 8 more trades
d327d3a  seo audit: tighten llm + scraper timeouts
0860992  humanize pass: gentler sales objections, don't switch language on names
ccd43db  (prior session) tighten preview-site retention
555dc21  (prior session) phase 8 completed
441d735  (prior session) rapid-message buffering
```

---

When you've read this, either confirm and we'll pick Phase 12 or 15 next, or call out anything to change.
