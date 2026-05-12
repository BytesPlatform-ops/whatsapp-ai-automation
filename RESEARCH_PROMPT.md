# Pixie Ban-Risk Research — Prompt

> Paste the block below into a fresh Claude conversation that has web
> access. Attach `PIXIE_RESEARCH_CONTEXT.md` so the model has the full
> system context. Fill in any `<<TODO>>` placeholders in the context
> file first — the verdict is only as good as those inputs.

---

You are auditing a real production system for **suspension / ban / policy-violation risk** across WhatsApp, Messenger, and Instagram. Treat this as a senior-engineer compliance review, not a generic overview.

The system: **Pixie**, a WhatsApp / Messenger / Instagram bot that sells, builds, and delivers small-business websites end-to-end inside the chat. Full architecture, message patterns, follow-up cadence, bot-disclosure stance, privacy posture, and known compliance gaps are in the attached **`PIXIE_RESEARCH_CONTEXT.md`**. Read it first.

## Your job

Produce a verdict on whether Pixie can run at scale (or continue to run) **without getting its phone numbers / pages / accounts suspended or banned by Meta**, and what specifically needs to change to keep it safe. Use web search aggressively — Meta's policies and enforcement posture move fast and your training cutoff is stale relative to the current ToS.

Sources to pull from (non-exhaustive — find more):
- Official Meta / WhatsApp Business policies (Messaging Policy, Cloud API ToS, Commerce Policy, Business Help Center).
- Recent Meta enforcement actions and number-bans posted publicly (developer forums, tech press, BSP changelogs from 360dialog / Twilio / Wati / MessageBird etc.).
- Local consumer-protection / bot-disclosure laws relevant to the user base (USA — California SB 1001, FTC; EU — GDPR Art. 13–14, ePrivacy; Pakistan — PECA; UK — DMCC / ICO guidance).
- Legitimate practitioner posts on quality-rating mechanics (Green / Yellow / Red), template gating, the 24-hour customer-service window, opt-in evidence requirements.

Cite every concrete claim. If a Meta page changed in the last six months, prefer the current text over your training-time recollection.

## Deliverable format

Structure your response exactly like this:

### A. One-line verdict
One of: **Ship as-is** / **Ship with monitoring** / **Pause until specific fixes** / **Rearchitect**. Followed by a one-sentence justification.

### B. Risk register
A table with columns: *Risk* | *Channel* | *Severity* (Low / Med / High / Critical) | *Time-to-impact* (immediate / weeks / months) | *Likelihood* | *Specific Pixie evidence* | *Source*. Cover at minimum:
- Outbound free-form messaging past the 24-hour customer-service window on WhatsApp.
- Lack of approved Message Templates for bot-initiated nudges.
- Bot identity / "I'm a real person" claim — disclosure laws by jurisdiction.
- User-block / report rate driving quality-rating drops to Yellow / Red.
- Click-to-WhatsApp ad-driven inbound spikes that may look like a list import to Meta's classifiers.
- Sales / payment-link sending pattern (transactional vs marketing classification).
- Multi-phone-number routing — concentration on a single line vs spreading load.
- Privacy / consent posture (GDPR notice timing, regional opt-in proofs).
- Anything else relevant the context surfaces.

### C. Specific fixes, prioritized
For every High / Critical risk, give a concrete fix with:
- **What** — the change (e.g. "gate WhatsApp follow-ups on `last_inbound_at < 24h` AND if past, switch to an approved utility-category Template").
- **Where in the codebase** the change goes (use the file paths listed in the context file).
- **Effort estimate** (lines of code / dev-days).
- **Why it works** — cite the specific Meta rule it addresses.
- **What it costs** — false-positive impact on legitimate follow-ups, dev velocity, etc.

### D. Monitoring & instrumentation
What metrics should Pixie track right now to catch a slide toward suspension early? Be specific (e.g. "rolling 7-day user-block rate per phone number, alert > 0.5%"). Recommend what's worth wiring up vs what can wait.

### E. Watch list
Things that aren't fixes today but matter when Pixie scales up. Include thresholds (e.g. "at >X messages/month, you'll need a Tier 2 number").

### F. Open questions
What context did you NOT have that would change the verdict? List the `<<TODO>>` items in the context dossier whose values would actually move the needle, plus any external info you couldn't find that would be useful.

## Boundaries

- Don't speculate beyond what sources support. If a claim is "I think Meta might…", say so explicitly.
- Don't recommend dark-pattern workarounds (e.g. "rotate phone numbers to evade bans"). Only legitimate, ToS-compliant mitigation.
- Don't pad. If a section has nothing to say, write "Nothing material" and move on.
- This is for an operator who will act on your verdict — favor specificity over hedging.

When you're done, end with a 3-line "TL;DR for the founder" — what to do this week, this month, and what to watch.
