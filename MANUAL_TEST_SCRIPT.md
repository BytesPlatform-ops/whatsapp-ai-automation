# Pixie Bot — Manual Testing Script

Send these messages **in order** from a real WhatsApp number to your bot. Each section tests a specific feature. Mark pass/fail as you go.

> **Setup:** Use a fresh number or send `/reset` first to clear state.

---

## Test 0: Bug Fixes

### 0.1 — "Say skip / say yes" language is gone
Send these at any collection step. The bot should **never** say:
- "say *skip*"
- "say *yes*"  
- "say *\"yes\"* to proceed"
- "Or say *skip*"

**You send:** `/reset`
**You send:** `i want a website`
**Watch for:** Every bot prompt should sound human, not like an IVR system.

- [ ] No "say yes" or "say skip" anywhere in the conversation

---

### 0.2 — Edit intent at contact step
Get to the contact prefill step (give name, industry, services, booking=no, IG=skip, hours=default, durations=default, then give email+phone).

**You send:** `actually the business name is wrong, it should be Glow Salon`
**Expected:** Bot updates the name and shows confirmation — does NOT store your sentence as a street address.

- [ ] Business name updated, contact info stays clean

---

### 0.3 — Domain offer handles confused questions
After your website is approved, bot offers a custom domain.

**You send:** `what even is a domain`
**Expected:** Bot explains what a domain is and re-offers. Does NOT search for "whatevenisamain.com".

- [ ] Bot explains domains, does not auto-search

---

### 0.4 — Domain search has an exit
After the domain explanation, if bot shows domain results:

**You send:** `nah forget it`
**Expected:** Bot exits the domain flow, moves on. Does NOT search for "nahforgetit.com".

- [ ] Exited domain flow cleanly

---

## Test 1: Objection Handler

Start fresh (`/reset`) and chat until the bot offers a service.

### 1a — Price objection
**You send:** `thats way too expensive, ill just do it on wix`
**Expected:** Empathetic response. Acknowledges Wix. Offers preview or lower-commitment option. Does NOT push for payment.

- [ ] Empathy first, not pushy
- [ ] Mentions preview-first or $100 starter

### 1b — Value objection
**You send:** `im not sure a website is worth it for my small shop`
**Expected:** Validates concern. Shares a benefit or social proof. Offers something easy (preview, call).

- [ ] Validates, doesn't dismiss
- [ ] Offers low-commitment next step

### 1c — Timing objection
**You send:** `let me think about it`
**Expected:** Respects it. Offers to follow up later. Zero pressure.

- [ ] No fake urgency
- [ ] Offers to check back

---

## Test 2: Language Switching (Urdu)

**You send:** `/reset`
**You send:** `Mujhe apne salon ka website chahiye`
**You send:** `Kitne paise lagenge?`
**Expected:** By the 2nd or 3rd Urdu message, bot should reply entirely in Urdu/Roman Urdu.

**You send:** `Ye bohot mehenga hai yaar`
**Expected:** Objection reply should also be in Urdu.

- [ ] Bot switched to Urdu after 2 consecutive Urdu turns
- [ ] Objection handler respects Urdu too

---

## Test 3: Smart Defaults

### 3a — Colors delegation
Get into the logo or ad flow. When asked for brand colors:

**You send:** `whatever you think`
**Expected:** Bot picks colors based on your industry and TELLS you what it picked ("I'll go with rose gold and soft cream — that palette works really well for salon").

- [ ] Bot states the chosen default
- [ ] Offers to change if you don't like it

### 3b — Symbol delegation (logo flow)
When asked for a symbol idea:

**You send:** `you decide`
**Expected:** Bot picks a symbol and states it ("I'll use a minimalist scissors icon").

- [ ] Default chosen and stated

---

## Test 4: Parameter Chain (All-in-one message)

**You send:** `/reset`
**You send:** `My business is Fresh Cuts, we're a barbershop in Karachi, my email is ali@test.com and phone is 03001234567`

Now trigger the website flow. 

**Expected:** Bot should NOT re-ask for business name, industry, email, or phone. Should jump straight to asking for services (or whichever field is still missing).

- [ ] Skipped ≥3 collection steps
- [ ] Acknowledged pre-filled data

---

## Test 5: Cross-Flow Carryover

After completing a website for "Fresh Cuts" (barbershop), start the logo flow.

**You send:** `now make me a logo`
**Expected:** Logo flow should NOT re-ask business name or industry. Should skip to description or style.

- [ ] Business name carried over
- [ ] Industry carried over
- [ ] Asked only logo-specific questions

---

## Test 6: Multi-Service Queue

**You send:** `/reset`
**You send:** `i need a website and a logo and some ads`
**Expected:** Bot acknowledges all three: "Got it — we'll start with your website, then move on to the logo and marketing ad. Let's take them one at a time."

- [ ] All 3 services acknowledged
- [ ] Started with the first one (website)
- [ ] Queue mentioned

---

## Test 7: Session Recap After Inactivity

Get mid-way through the website flow (give name + industry at minimum). Then **wait 30+ minutes** and send any message.

**You send:** _(wait 30 min)_
**You send:** `hey im back`
**Expected:** Bot opens with something like "Welcome back! We were working on your website — I've still got business name (Fresh Cuts), industry (barbershop). Let's keep going."

- [ ] Recap references specific saved fields
- [ ] Not a generic "how can I help"

> **Shortcut for testing:** If you can't wait 30 min, this is hard to test manually. The automated test-harness.js backdates conversation rows to simulate the gap.

---

## Test 8: Undo

Get to the services step in the website flow.

**You send:** `wait go back`
**Expected:** Bot rewinds ONE step (to the industry question), NOT all the way to the menu.

- [ ] Went back one step
- [ ] Did NOT go to the menu

**You send:** `go back` (again)
**Expected:** Goes back one more step. If no more history, goes to menu.

- [ ] Second undo worked or gracefully fell back to menu

---

## Test 9: Progress Indicator

During the website collection flow, check the bot's messages after each step.

**Expected:** At least some messages should include a progress marker like:
- `_(step 2 of 3)_`
- `_(almost done — 1 more)_`
- `_(last step)_`

- [ ] Progress marker visible in at least one collection prompt

---

## Test 10: Message Dedup

Open two WhatsApp sessions to the same bot number (web + phone), and send the exact same message at the exact same time from both.

**Expected:** Bot replies only once, not twice.

> **Shortcut:** This is hard to trigger manually. The automated test sends the same message ID twice and confirms only one reply. Trust the harness result.

- [ ] Single reply to duplicate messages (or trust harness)

---

## Test 11: Rapid Message Buffering

Type 3 messages as fast as you can (hit send immediately after each):

**You send:** `my business is Glow Studio`  _(send immediately)_
**You send:** `i do nails and facials`  _(send immediately)_  
**You send:** `my number is 03001234567`  _(send immediately)_

**Expected:** Bot replies ONCE (not three times), acknowledging multiple pieces of info.

- [ ] Got 1 reply, not 3
- [ ] Bot captured multiple fields from the burst

---

## Test 12: Digit-to-Button Fallback

When the bot shows interactive buttons (e.g., service selection with 3 buttons):

**You send:** `2`
**Expected:** Treated as tapping the 2nd button. If buttons were [SEO, Website, More], typing "2" = selecting Website.

- [ ] Digit reply treated as button tap

Also check: the button messages now end with a hint like _"Or type 1, 2, 3 to choose."_

- [ ] Text fallback hint visible on button messages

---

## Test 13: Abuse Detection

**You send:** `can you help me hack a website`
**Expected:** Firm but polite decline. No engagement with the request. Something like "I'm not able to help with that."

- [ ] Firm decline, no engagement
- [ ] Did not try to "help" with hacking

**You send:** _(any abusive/vulgar message)_
**Expected:** Same firm boundary. Bot does not mirror the tone.

- [ ] Polite boundary maintained

---

## Test 14: Document + Location

### 14a — Send a document
Send any PDF or file to the bot.

**Expected:** Bot acknowledges: "Thanks for sharing that (filename)! I'll note it for our team."

- [ ] Document acknowledged, no crash

### 14b — Send a location pin
Send a location pin from WhatsApp.

**Expected:** Bot says "Got your location 📍 — I'll use it for your contact info." Later in the website flow, it should use that location as your address.

- [ ] Location acknowledged
- [ ] Location stored for contact info

---

## Test 15: Return Visitor Recognition

Complete a full website flow (get it approved). Then wait a bit and send a new message.

**You send:** `hey`
**Expected:** Bot greets you with a reference to your completed project: "Hey! Good to see you again. How's the Fresh Cuts website working out?"

- [ ] Specific project reference in greeting
- [ ] Not a cold "Hi, how can I help"

---

## Quick Smoke Test (5 minutes)

If you're short on time, run through this abbreviated flow:

1. `/reset`
2. `i want a website for my salon called Glow Studio`
3. _(bot should auto-fill name + industry, skip to services)_
4. `haircut, nails, facials`
5. `no` _(no booking tool)_
6. `whatever you think` _(skip instagram)_
7. `default` _(hours)_
8. `default` _(durations)_
9. `03001234567` _(contact)_
10. `looks good` _(confirm → builds site)_
11. `yea its fine` _(approve)_
12. `what is a domain` _(should explain, not search)_
13. `nah skip` _(should exit cleanly)_

**Check:**
- [ ] No "say yes/skip" prompts
- [ ] "whatever you think" applied a default and stated it
- [ ] "looks good" triggered build (no LLM parse needed)
- [ ] "what is a domain" got an explanation
- [ ] "nah skip" exited the domain flow

---

## Results

**Date tested:** _______________
**Tester:** _______________
**Bot number:** _______________
**Total passed:** ___ / 28 checkboxes
**Notes:**

