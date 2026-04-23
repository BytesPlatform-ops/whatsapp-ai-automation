# Outstanding Manual Tests

Every item below needs verification on real WhatsApp before shipping. Tests are grouped by the commit that introduced them, most recent first. Each test has an expected outcome and the log line(s) to watch for when debugging.

---

## Phase 15 — Return-visitor recognition (commit pending)

LLM-generated warm greeting when a user who has **completed** a prior project messages after a long gap. Gated on a completion marker (`metadata.lastBusinessName` + `lastCompletedProjectType`) written by each service's completion hook. Preserved across `/reset` so users who restart their conversation still get recognized.

### Tests

- [ ] **Fresh user, no history** — first-ever `/reset` → send *"hi"* → standard Pixie greeting. No return-greet. Log line: no `[RETURN-GREET]` entry.
- [ ] **Returning after completed website** — complete a webdev flow end-to-end through domain purchase. Wait 31+ min. Send *"hi"* → expect a warm line like *"hey, hows the Noman Plumbing site treating you? want any tweaks or ready to start something new?"*. NOT *"Hi! I'm Pixie..."*. Log line: `[RETURN-GREET] Sending return-visitor greeting to +phone`.
- [ ] **Cooldown within same session** — after the greeting above, reply within 5 min → no second greeting (gap < 30 min).
- [ ] **Mid-flow user after gap** — start webdev, give name + industry, leave it. 31 min later send *"hi"* → Phase 9 recap fires, return-greet does NOT fire. User gets the recap only.
- [ ] **Surviving `/reset`** — complete a website, `/reset`, then 31 min later send *"hi"* → still get the return-greet (fields preserved across reset). Log line: `[RETURN-GREET] Marked website completion for +phone (Noman Plumbing)` from the earlier completion.
- [ ] **Logo-only user** — complete a logo flow only (no webdev). 31 min later → greeting references the logo's business name.
- [ ] **Ad-only user** — complete an ad flow only. 31 min later → greeting references the ad's business name.
- [ ] **Chatbot-only user** — activate a chatbot trial. 31 min later → greeting references the chatbot's business name.
- [ ] **SEO-audit-only user** — complete an SEO audit for `hasnain-plumbing.com`. 31 min later → greeting references *"hasnain plumbing"* (derived from URL) as the business, labels it *"SEO audit"*.
- [ ] **Fallback to websiteData without explicit marker** — if a user completed webdev before Phase 15 shipped (no `lastBusinessName` set yet), the fallback chain should still find their `websiteData.businessName` and greet them.
- [ ] **Button tap / slash command** — return-greet should NOT fire when the incoming message is a button tap or a `/reset` / `/menu`.

---

## Humanize pass (commit `3e5c2a4`)

### Industry inference from business name

LLM infers industry from trade words in the business name so chatbot / logo / ad flows stop asking for industry when it's obvious. Helper: `inferIndustryFromBusinessName` in `entityAccumulator.js`.

- [ ] **Chatbot flow — trade name** — tap AI Chatbot → name = *"Noman Plumbing"* → expect *"Got it — *Noman Plumbing* · _Plumbing_ 👍 What are the top questions..."*. Industry step is skipped.
- [ ] **Logo flow — trade name** — tap Logo Maker → name = *"Bright Dental"* → skips industry, jumps to description question (*"In one sentence, what does your business do?"*).
- [ ] **Ad flow — trade name** — tap Marketing Ads → name = *"Joe's Auto Repair"* → skips industry, jumps to niche question (*"What product or service is this ad promoting?"*).
- [ ] **Generic name still asks** — name = *"TechCorp"* or *"Glow Studio"* (no trade word) → industry question IS asked. No silent assumption.
- [ ] **Non-English normalization** — *"Maria's Thai Kitchen"* → industry = *"Thai Restaurant"*. *"SunCity Roofing"* → *"Roofing"*.

### Chatbot FAQ multi-question splitter

One message can now carry many questions in any format. Helper: `splitFaqQuestions` in `chatbotService.js`.

- [ ] **Question-marked list** — *"how much does it cost? what hours? do you take cards?"* → 3 FAQs stored, ack *"Added 3 questions — 3 total."*
- [ ] **Comma list** — *"pricing, hours, cancellation policy"* → 3 FAQs (normalized to full questions).
- [ ] **Numbered list** — *"1. pricing 2. hours 3. payment methods"* → 3 FAQs.
- [ ] **Newlines** — 3 lines of question topics → 3 FAQs.
- [ ] **Prose with multiple "and"s** — *"they ask about pricing and appointments and what we do"* → 3 FAQs.
- [ ] **Single question still works** — *"how much does it cost?"* → 1 FAQ, ack *"Got it! (1 so far)"*. No LLM call (fast path).
- [ ] **Legit single question with "and"** — *"do you do emergency calls and weekends?"* → 1 FAQ (only 1 "and", question-marked → fast path).
- [ ] **"Done" variants** — typing *"that's it"*, *"that's all"*, *"no more"*, *"i'm done"*, *"finished"*, *"all done"* all advance to next step (previously only exact `done` worked).

### Webdev cross-flow carryover (startWebdevFlow)

Switching back to webdev mid-conversation now resumes at the first missing field instead of restarting.

- [ ] **Scenario from the bug report** — start webdev, give name + industry + city + service areas + services → switch to logo → switch to chatbot → say *"umm, can we continue with the website"* → expect *"🌐 Website Development — Picking up with *Noman Plumbing* · _Plumbing_."* then the contact question. NOT a fresh *"What's your business name?"*.
- [ ] **No partial progress** — fresh user taps Website button → standard *"First, what's your business name?"*.
- [ ] **All fields present** — hypothetically if everything's collected → jumps to confirm summary.

Log line: `Resuming webdev at WEB_COLLECT_CONTACT (name=Noman Plumbing, industry=Plumbing)`.

### Admin conversation page — summary logging

The webdev confirmation summary and mid-flow summary peek now log the actual text the user saw (not a placeholder).

- [ ] Complete a webdev flow to `WEB_CONFIRM` → open admin conversations page for that user → the summary row shows *"Here's a summary of your website details: Business Name: ..."* instead of *"Showing website confirmation summary"*.
- [ ] Mid-flow, ask *"what are my current details?"* → admin page shows the peek contents too.

**Note:** this fix only affects messages logged AFTER the commit. Old conversations still show the placeholder. A backfill script would be needed to fix historical rows (not done).

---

## Phase 12 — Multi-service queue (commit `af2928e`)

Detects 2+ queueable services in one message, queues them, auto-advances between flows.

### Initial queue build

- [ ] **Fresh user after `/reset`** — send *"i need a website, logo and some ads and also a chatbot"* → expect ack *"Got it — I'll handle the website, logo, ads, and chatbot one after the other. Starting with the website now."* then webdev greeting.
- [ ] **Pair queue** — *"build me a website and a chatbot"* → 2-item ack, webdev starts.
- [ ] **Single service** — *"just a website"* → no queue ack. Standard webdev greeting.
- [ ] **Fuzzy phrasing** — *"set me up with the whole package — site, brand, and assistant"* → queue with webdev / logo / chatbot.
- [ ] **False positive guard** — *"my friend already has a website and a logo"* → NO queue built. Falls through to normal sales chat.

### Queue advance between flows

- [ ] **Natural completion** — build a website end-to-end through domain purchase. Expect *"Nice — that's wrapped. Next up: *logo*."* and logo flow auto-starts with carryover (business name + industry already known).
- [ ] **User-initiated skip** — mid-webdev say *"forget this, lets do the rest"* → *"Got it, skipping ahead. Next up: *logo*."* logo flow starts. Ads follows logo; chatbot follows ads.
- [ ] **Skip current to specific queued item** — mid-webdev say *"forget this, do the logo first"* → logo starts, and logo is deduped from the remaining queue so it won't run twice.
- [ ] **Queue empty → main menu** — complete the last queued service → next `back_menu` button falls through to generic welcome (no more queue).

### Intent classifier robustness

After Phase 12 we tightened then re-broadened the `menu` intent definition. Verify both sides hold:

- [ ] **Trade word in business name is NOT a flow-switch** — mid-`WEB_COLLECT_NAME` send *"Hasnain Plumbing"* → treated as an ANSWER, not a menu switch. Flow advances to email collection.
- [ ] **Explicit skip phrasings IS a flow-switch** — mid-`WEB_COLLECT_CONTACT` send *"nevermind, skip this, lets go with the next one"* → `menu` intent, queue advances. NOT saved as a contact address.

### `/reset` and `/menu`

- [ ] **`/reset` clears queue** — build a queue, reset → queue wiped. Next multi-service message builds a fresh queue.
- [ ] **`/menu` cancels queue** — mid-queue send `/menu` → queue cleared, main menu shown.

### Recovery on failure

- [ ] **Simulated failure** — if something throws while starting the next queued flow, expect the recovery nudge: *"hmm, something glitched while starting the next one — try sending menu and we can pick it back up."*

### Ad product-type inference

Saves one click when the industry + niche already answer *"physical / service / digital"*.

- [ ] **Industry says service** — ad flow with industry = *"Plumbing"*, niche = *"multiple plumbing packages deal"* → skips the 3-button type question, jumps to slogan. Log: `Inferred type: service`.
- [ ] **Industry says digital** — industry = *"SaaS"*, niche = *"my productivity app"* → skips, type = digital.
- [ ] **Generic case falls back to buttons** — industry = *"Fashion"*, niche = *"Handmade Leather Bags"* → buttons still shown (correct — physical is right but not trivially inferrable).

---

## Carried over from SESSION_2026-04-23.md (phases 8-11 + extras)

Earlier outstanding tests. Full checklist: see [SESSION_2026-04-23.md](SESSION_2026-04-23.md). Summary by area:

### Phase 11 — cross-flow entity carryover (commit `7002857`)

- [ ] Complete webdev with name + industry → tap Logo Maker from `/menu` → greeting references name + industry, jumps straight to description question.
- [ ] Same setup → tap Marketing Ads → jumps to niche question.
- [ ] Same setup → tap AI Chatbot → jumps to FAQs.
- [ ] Fresh user (no webdev data) → tap Logo Maker → standard *"what is your business name?"* greeting.
- [ ] Partial carryover (name only, no industry) → Logo Maker → references name, still asks industry.

Log lines: `Started logo flow with prefilled name=...`, `Started ad generation with prefilled name=...`, `Started chatbot flow with prefilled name=..., industry=..., services=true`.

### Flow-switch mid-conversation

- [ ] Mid-webdev at contact step: *"forget the website, can you do ai chatbot for me?"* → ONE message, chatbot starts (no webdev re-prompt).
- [ ] Mid-ad-flow: *"scrap this, lets do a logo"* → logo starts.
- [ ] Mid-any-flow: *"wait can you also build a chatbot?"* → chatbot starts.
- [ ] Negative control: *"how much does it cost?"* mid-webdev → LLM aside + *"back to where we were"*. NOT a flow-switch.

### `/menu` command

- [ ] `/reset` → `/menu` → *"Here's what I can help with — pick one to get started:"* with 3 buttons. NOT *"hmm, didn't catch that"*.
- [ ] Mid-any-flow: `/menu` → same behavior.
- [ ] *"any other services?"* in `SERVICE_SELECTION` → full 10-item service list (not the 3-button menu).

### Industry extraction

- [ ] Start webdev with trade name — *"hasnain plumbing"*, *"maria's thai kitchen"*, *"bright dental"*. Answer industry question with *"im not sure, pick one"* → extractor returns the right industry. Log: `Got it, I'll go with *<industry>*`.

### Multi-field contact input (commit `d86e741`)

- [ ] `WEB_COLLECT_CONTACT`: *"email is test@gmail.com and phone is 09876544567"* → both fields stored separately, no mixup.
- [ ] Variations: *"my email is X, my phone is Y, address is Z"*, *"foo@bar.com, 555-1234, 123 Main St"*.

### Localizer safety net (commit `d86e741`)

- [ ] Cached `preferredLanguage='roman-urdu'`, but user sends English → bot replies in English.
- [ ] User sends Roman Urdu (*"mujhe website chahiye"*) → bot replies in Roman Urdu.

### Post-website in-bot upsell (commit `355e090`)

- [ ] Complete a webdev flow end-to-end → expect a follow-up pitch ~3-4 s after domain-registered message (*"say audit and i'll run a free SEO check..."*).
- [ ] Re-fire payment webhook (simulate retry) → NO second pitch (idempotent via `postWebsiteUpsellSent`).
- [ ] Reply *"audit"* after the pitch → SEO audit flow starts.

**Note:** Phase 12 queue advance now takes priority over this upsell. If the user has a pending queue, queue advance fires instead of the upsell. If you want to test the upsell specifically, start webdev as a single-service intent (no queue).

Log line: `[PAY] Site-live upsell pitched (seo_audit) to +phone` (upsell path) or `[QUEUE] Advancing to svc_... (completed) ...` (queue path).

### `/reset` scope

- [ ] Build a website end-to-end with domain → `/reset` → send *"can you do a website for me please"* → fresh flow starts. No reference to previous business name, industry, domain.
- [ ] After `/reset`: `adSource` / `paymentConfirmed` / `adReferral` / `lastBusinessName` / `lastCompletedProjectType` should still be in metadata (intentionally kept).

### Phase 10 — interactive reply matcher (commit `0c1e1f1`)

- [ ] `/menu` → send `5` (out of range) → *"that was only 3 options — pick 1-3 or tap one of the buttons above."* then `2` resolves correctly.
- [ ] `/menu` → send *"the second one please"* → 2nd button fires.
- [ ] `/menu` → send *"website"* → webdev flow starts via keyword match.
- [ ] Mid-flow: answering *"how many years?"* with `5` → treated as the answer, NOT a button pick.

### Phase 9 — session recap (commit `39a3840`)

- [ ] Start webdev, give name + industry, wait 31+ min, send *"hi"* → *"welcome back — we were working on your Glow Studio site..."* before the handler's reply.
- [ ] After 31 min, send `/reset` → NO recap (slash command skips).
- [ ] Fresh user, 31 min idle, send *"hi"* → NO recap (no accumulated context).

### Phase 8 — sales-chat objection handling (commit `0860992`)

- [ ] After SEO audit + sales pitch: *"its too expensive, i'll look at alternatives"* → one-line soft acknowledge. No tier drop, no bullet re-pitch.
- [ ] *"let me think about it"* → *"of course, take your time. ping me whenever."* and silence.
- [ ] *"what's the price for the Pro package?"* → normal sales-bot price answer (NOT objection handler — it's a question).

Log line: `[SALES] Objection intercepted for +phone`.

---

## Deferred / not yet built

From [PLAN_STATUS.md](PLAN_STATUS.md):

- **Phase 13** — Abuse detection (firm polite decline for hate / phishing / "help me hack").
- **Phase 14** — Document + location message handling (webhook parser for `document` and `location`; reverse-geocode into address).

Phase 12 and Phase 15 are now code-complete; only the manual verification above is left.

---

## Known pre-existing issues not covered by above

- **Stale `via_phone_number_id`** on some user rows causing *"Unsupported request - method type: post"* errors from Meta on follow-up sends. Needs a one-time audit+backfill script OR a sender-level retry with `env.whatsapp.phoneNumberId` on error 100.
- **Netlify cleanup job 401s** — expired/revoked `NETLIFY_TOKEN`. Operational: rotate the token in `.env` and restart.
- **Old conversation-log placeholders** — summaries logged before the commit `3e5c2a4` fix still appear as *"Showing website confirmation summary"* in the admin page. A backfill migration would correct historical rows.
