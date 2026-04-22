# Pixie Humanization — Status & Remaining Work

_Snapshot as of workflow-2 branch, commit `b1675dc`._

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
| 6 | `b1675dc` | Localizer, per-user serial lock, message dedup, LLM-first intent classifiers for undo/keep, yes/skip, confirm/edit, show-summary, use-own-number, preview approval, real-estate currency detection |

### 🟡 In progress (uncommitted, pending re-implementation)

**Phase 7 — Rapid-message buffering** (reverted from [router.js](src/conversation/router.js); to be rebuilt when you're ready)

Designed approach (hybrid):
- **Pre-processing debounce (1s):** when a message arrives and nothing is in flight, it's buffered and a 1s timer starts. More messages reset the timer. When 1s of silence passes, the whole batch fires as ONE merged turn.
- **In-flight coalescing:** if messages arrive while a turn is already running, they're buffered and merged into the NEXT turn (drained after the current one finishes).
- **Escape hatches:** non-text (images, audio, buttons) skip the buffer and chain on the lock in order. Slash commands (`/reset`, `/menu`) skip debouncing so exact-match still works.
- **Cap:** 10 buffered messages per user.

**Manual test scenarios once re-built:**
1. Send three quick text messages within ~2 seconds: `bro` / `by the way` / `actually i meant X`. Expected: one merged reply ~1s after you stop typing, not three separate replies.
2. Send a single message. Expected: ~1s delay, then a reply (debounce applies to the first message too).
3. While the bot is clearly "typing" (the 4–8s reply delay), send another text. Expected: the bot's current reply lands, then a follow-up turn processes your second message merged with anything else you sent.
4. Send a text, then an image before 1s elapses. Expected: the text flushes its own turn, then the image processes in order.
5. Send `/reset` anytime. Expected: fires immediately, no debounce.

---

## 🔴 Remaining phases — to be implemented

The original plan (`PLAN_UPDATED.txt`) has 15 tasks. Crossing off what's done, here's what's still open. I've grouped them into three buckets by effort / impact so you can pick the order.

### Bucket A — still-core humanize work

These map to original Task 1, 7, 12. Short, focused, each is its own phase.

- **Phase 8 — Objection handler** (Task 1)
  - New handler for `intent === 'objection'`: validate concern → share social proof → low-commitment next step. Track `objectionTopics` in metadata so follow-ups can reference them.
  - Test scenarios:
    - `"this is too expensive, i'll just use wix"` mid-webdev → empathetic ack, value context, offer to continue OR schedule a call. Does NOT push.
    - `"not sure it's worth it"` → validation + social proof + lower-commitment option.
    - `"let me think about it"` → respects it, seeds a follow-up (no fake urgency).

- **Phase 9 — Session recap after inactivity** (Task 7)
  - If `now - user.last_message_at > 30 min`, prepend a contextual recap to the next bot reply. Example: _"Welcome back! We were working on your Glow Studio salon site. I had your name + industry — next up is services."_
  - No generic "continue where we left off".

- **Phase 10 — Interactive digit fallbacks** (Task 12)
  - Every interactive button/list message gets a "Or type 1, 2, 3 to choose" hint appended. Router maps a digit-only reply to the corresponding button id from the last interactive message sent.
  - Covers the user-on-desktop case where buttons aren't tappable.

### Bucket B — cross-flow carryover and queueing

Bigger surface area, touches multiple handlers. Map to Task 5 + Task 6.

- **Phase 11 — Accumulator applied to other flows**
  - Use the Phase 2 entity accumulator in `adGeneration.js`, `logoGeneration.js`, `chatbotService.js`.
  - Shared fields (business name, industry, colors, contact) carry across flows. Example: user completes webdev for a salon, then says "also make me a logo" → logo flow skips name/industry/colors, only asks logo-specific questions.

- **Phase 12 — Multi-service queue**
  - When one message names multiple services ("I need a website AND a logo AND some ads"), acknowledge all, suggest an order, queue them in `metadata.serviceQueue`, auto-transition through them.

### Bucket C — new input types + return visitors

Map to Task 13, 14, 15.

- **Phase 13 — Abuse detection**
  - `messageAnalyzer` returns `isAbusive: boolean`. Router short-circuits on abuse: firm polite decline, log for admin, no LLM escalation.
  - Covers hate / phishing / "help me hack a site" / etc.

- **Phase 14 — Document + location handling**
  - Webhook parser to handle `document` and `location` message types.
  - Docs: bot acknowledges ("thanks, let me take a look"), stored for admin.
  - Location: reverse-geocode into city/address and seed `websiteData.contactAddress` / `primaryCity`.

- **Phase 15 — Return-visitor recognition**
  - On entry, query completed sites/audits/logos for this phone. If any exist, prepend a specific greeting: _"Hey! How's the Glow Studio site treating you?"_ instead of the generic Pixie opener.

---

## Open questions (with my recommendations — review when you have time)

Each item has the question, my recommendation, and the reasoning. If you disagree with any, flag it and we'll change course.

### 1. Progress indicators — **recommend: leave dead**
Phase 4 tried "step 3 of 6" style indicators and we rolled them back because they read as robotic. WhatsApp is a casual medium; form-wizard phrasing feels off. We already imply progress softly in a few spots ("last thing — what contact info..."). Good enough.

### 2. Priority order for remaining phases — **recommend: A → B → C**
- **Bucket A** (objection handler, session recap, digit fallbacks) — small, user-visible, directly addresses things seen going wrong on WhatsApp. Ship first.
- **Bucket B** (cross-flow carryover, multi-service queue) — biggest UX unlock for returning or multi-service customers, but touches three other flows. Ship second.
- **Bucket C** (abuse detection, doc/location, return-visitor) — edge-case / infra; worth having but nobody's hit the absence of it yet. Ship last.

### 3. Objection handler scope — **recommend: sales-specific**
Route through it only when state is `SALES_CHAT` or a webdev collection state. Lower blast radius. If we later see objections happening in chatbot / domain flows, we broaden. Start narrow, widen when we see a real miss.

### 4. Abuse detection placement — **recommend: keep as its own phase**
Different code path (short-circuits router before any handler), different telemetry (admin log), different tone (firm refusal, not empathy). Folding it into the objection handler would muddy both.

### 5. Location reverse-geocoding service — **recommend: OpenStreetMap Nominatim**
Free, no API key, MIT-compatible terms for low volume. Good enough to turn `lat/lng → "Karachi, Sindh, Pakistan"`. Swap to Google Maps later if we ever hit fair-use limits (unlikely at this volume).

### 6. Testing discipline going forward — **recommend: keep live WhatsApp testing**
The original dumb-user harness caught easy bugs early; the bugs since Phase 6 (language mirroring, undo-during-edit, currency detection, duplicate greetings) are all things expensive to script into a harness and easier to catch on a real phone. Keep the harness around if it still runs, but don't block on expanding it per phase.

---

When you've read this, either say "all good" and we'll proceed in order (Phase 7 test → Phase 8 objection handler → onwards), or call out the ones you want to change.
