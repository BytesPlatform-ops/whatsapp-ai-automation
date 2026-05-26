/**
 * Follow-Up Scheduler
 *
 * Website/domain flow uses a single nudge at 22h: apply a 20% discount to
 * the website price (domain cost is fixed by Namecheap and can't be cut),
 * deactivate the old Stripe link, issue a new one, and redeploy the site
 * banner so the strikethrough pricing shows. Preview site self-destructs
 * at 23h via siteCleanup — the 1-hour gap between discount and expiry is
 * the close window.
 *
 * Split payments are NOT offered — kept out intentionally because (a) at
 * $199 the ticket is already low enough that splitting is friction not
 * value, and (b) the discount alone is a cleaner single-decision pitch.
 */

const { supabase } = require('../config/database');
const { sendTextMessage } = require('../messages/sender');
const { runWithChannel, runWithContext } = require('../messages/channelContext');
const { logMessage } = require('../db/conversations');
const { updateUserMetadata } = require('../db/users');
const { handleConfirmedPayment } = require('../payments/postPayment');
const { sendEmail } = require('../notifications/email');
const { logger } = require('../utils/logger');
const { STATES } = require('../conversation/states');
const { generateResponse } = require('../llm/provider');

// WhatsApp's customer-service window: free-form messages may only be
// sent within 24 hours of the user's last INBOUND message. Outside
// this window, Meta requires an approved Message Template; sending
// free-form anyway risks quality-rating drops, throttling, and
// eventual phone-number suspension. Until templates are wired up,
// every bot-initiated WhatsApp outbound from a background worker
// must gate on this window. Messenger / Instagram have similar 24h
// rules (already handled by the channel skip in runFollowupCycle).
const WA_24H_WINDOW_MS = 24 * 60 * 60 * 1000;
function isWithinWaWindow(lastInboundIso) {
  if (!lastInboundIso) return false;
  const since = Date.now() - new Date(lastInboundIso).getTime();
  return since < WA_24H_WINDOW_MS;
}

// Single-step ladder: at 22h unpaid, apply 20% discount to website portion.
const FOLLOWUP_LADDER = [
  { step: 'followup_22h_discount', afterHours: 22 },
];

// ${discountPct}% off the website portion — domain price is fixed by Namecheap. The
// percentage is admin-managed (admin_settings.website_discount_pct);
// the constant below is the cold-cache fallback.
const WEBSITE_DISCOUNT_PCT_DEFAULT = 20;

// SEO-audit leads get their own ladder. The existing website ladder pitches a
// $100 payment / domain — wrong message for someone who only ran an audit.
// One gentle nudge at ~24h quoting their biggest-opportunity item, then we
// stop. Kept short on purpose: SEO buyers tend to be comparison-shoppers and
// a heavy follow-up cascade reads as desperate.
const SEO_FOLLOWUP_LADDER = [
  { step: 'seo_followup_24h', afterHours: 24 },
];

// "Said hello, ghosted" ladder. Users who landed in SALES_CHAT, said hi, and
// never engaged with any flow (no business name, no domain, no demo trigger,
// no payment context) are silently skipped by FOLLOWUP_LADDER's
// engagedWithWebdev gate. This ladder fills that gap with three low-pressure
// touches inside the 24h WhatsApp window. Each step is designed to spark a
// reply — a reply re-opens the window AND lets salesBot pick the conversation
// back up, often firing [TRIGGER_WEBSITE_DEMO] into WEB_COLLECT_NAME.
const EXPLORATORY_LADDER = [
  { step: 'expl_2h_soft',  afterHours: 2  },
  { step: 'expl_8h_value', afterHours: 8  },
  { step: 'expl_20h_last', afterHours: 20 },
];

// Email-based follow-up ladder. Fires for users whose WhatsApp 24h window
// has closed (free-form WA outbound blocked) but who reached the contact
// step and left an email on file. Anchored to paymentLinkSentAt — the
// strongest signal we delivered a real preview + Stripe link they could
// have acted on. Steps run independent of the WA ladders (their own
// metadata key + their own cadence in days, not hours).
//
// Cold-lead recovery used to be zero: WA window closes → silently mark
// all WA steps complete → never message again. Real SMB sales cycle is
// 30–60 days, so day-3 / day-7 / day-30 reaches buyers who needed
// breathing room. PIXIE_RESEARCH_CONTEXT.md item #2.
const EMAIL_FOLLOWUP_LADDER = [
  { step: 'email_day3',  afterDays: 3,  subject: (biz) => `Your ${biz} preview is still saved` },
  { step: 'email_day7',  afterDays: 7,  subject: (biz) => `Last call for ${biz} this week` },
  { step: 'email_day30', afterDays: 30, subject: (biz) => `${biz} site is still here if you want it` },
];

// Discount follow-up copy per personality. One step only — no ladder, no
// split payment offers. Amount placeholders (${newTotal}, ${originalTotal})
// get filled in at send time once we compute the per-user discount.
const DISCOUNT_MESSAGES = {
  COOL: "preview expires in 1 hour — i got ${discountPct}% off the website for you. new total: *$${newTotal}* (was *$${originalTotal}*). link 👇",
  PROFESSIONAL: "Your preview expires in 1 hour. I can offer ${discountPct}% off the website: *$${newTotal}* (from *$${originalTotal}*). New link below.",
  UNSURE: "hey! your preview expires in 1 hour — got approved to do ${discountPct}% off the website. new total is *$${newTotal}* (was *$${originalTotal}*) 😊",
  NEGOTIATOR: "preview dies in 1h. ${discountPct}% off website. new total *$${newTotal}*. link below.",
  DEFAULT: "Heads up — your preview expires in 1 hour. Taking ${discountPct}% off the website: *$${newTotal}* (was *$${originalTotal}*). New link below.",
};

/**
 * Determine which follow-up step (if any) a user is due for.
 * HOT leads get follow-ups sooner (first check at 1h instead of 2h).
 * COLD leads get follow-ups later (first check at 4h instead of 2h).
 * Returns the step object or null.
 */
function getNextFollowup(lastMessageAt, completedSteps, leadTemp = 'WARM', ladder = FOLLOWUP_LADDER) {
  const now = Date.now();
  const elapsedHours = (now - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60);

  // Adjust timing based on lead temperature
  const timeMultiplier = leadTemp === 'HOT' ? 0.5 : leadTemp === 'COLD' ? 2 : 1;

  for (const rung of ladder) {
    const adjustedHours = rung.afterHours * timeMultiplier;
    if (elapsedHours >= adjustedHours && !completedSteps.includes(rung.step)) {
      return rung;
    }
  }
  return null;
}

/**
 * Render the SEO-silence follow-up for a given personality, quoting the
 * audit's top-fix item if we have one on file. When the top fix is missing
 * (older audits, extraction failure) we fall back to a generic pitch.
 */
function renderSeoFollowupMessage(personalityMode, topFix, url, seoFloor = 200) {
  const mode = (personalityMode || '').toUpperCase();
  const hasFix = Boolean(topFix && topFix.trim());
  const fix = hasFix ? topFix.trim() : '';
  const site = url ? ` for ${url}` : '';
  const px = `$${seoFloor}`;

  if (mode === 'COOL') {
    return hasFix
      ? `yo — you saw that audit${site} right? biggest thing was *${fix}*. i can knock out the top 5 fixes from the report for ${px} if you wanna ship them fast 🔧`
      : `yo — you saw that audit${site} right? i can handle the top 5 fixes from the report for ${px} if you wanna ship them fast 🔧`;
  }
  if (mode === 'PROFESSIONAL') {
    return hasFix
      ? `Quick follow-up on your SEO audit${site}. The biggest opportunity I flagged was *${fix}*. I can handle the top 5 fixes from the report for ${px} — want me to put the details together?`
      : `Quick follow-up on your SEO audit${site}. I can handle the top 5 fixes from the report for ${px} — want me to put the details together?`;
  }
  if (mode === 'UNSURE') {
    return hasFix
      ? `hey! following up on your audit${site} — the main thing that stood out was *${fix}*. happy to handle the top 5 fixes for ${px} if you'd like. no pressure at all 😊`
      : `hey! following up on your audit${site} — happy to handle the top 5 fixes from the report for ${px} if you'd like. no pressure at all 😊`;
  }
  if (mode === 'NEGOTIATOR') {
    return hasFix
      ? `audit follow-up${site}. biggest fix: *${fix}*. ${px} for the top 5 from the report. yes or no?`
      : `audit follow-up${site}. ${px} for the top 5 fixes from the report. yes or no?`;
  }
  return hasFix
    ? `Following up on your SEO audit${site} — *${fix}* was the biggest opportunity I flagged. Want me to handle the top 5 fixes from the report for ${px}?`
    : `Following up on your SEO audit${site} — want me to handle the top 5 fixes from the report for ${px}?`;
}

/**
 * Build the HTML + plain-text body for one rung of the email follow-up
 * ladder. Tone shifts per step: day-3 "still waiting," day-7 "last call,"
 * day-30 "still here if you want it." Restoration framing — users respond
 * to "your work is saved" better than "buy now."
 *
 * Note: `previewUrl` and `paymentLinkUrl` are accepted for back-compat but
 * deliberately NOT rendered. By day-3 both are dead:
 *   - Netlify previews self-destruct at 23h (src/jobs/siteCleanup.js, line 39)
 *   - Stripe Checkout sessions expire 24h after creation
 * The build data itself is preserved in the `generated_sites` row though
 * (status flips to a non-preview value when the site is deleted but the
 * payload stays), so restoration is fast — we just need the user to reply,
 * and the team can rebuild from the stored config in seconds. CTAs use a
 * `mailto:` deep link with pre-filled subject so the team's inbox shows a
 * clean "restore X" thread on every reply.
 */
function renderFollowupEmailContent(step, { businessName /* , previewUrl, paymentLinkUrl */ }) {
  const copyByStep = {
    email_day3: {
      headlineLine1: 'Your build is',
      headlineAccent: 'still waiting',
      body: `Hey — Pixie here.\n\nI built ${businessName} a few days back and parked it on the shelf. Whenever you're ready to bring it online, reply to this email and I'll have it back up in under a minute.`,
      ctaLabel: 'Restore my preview',
      subjectPrefill: `Restore ${businessName}`,
    },
    email_day7: {
      headlineLine1: 'Last call —',
      headlineAccent: businessName,
      body: `Closing out this week's queue.\n\nI'll archive ${businessName} for good unless I hear from you. If you still want it live, just hit the button below (or reply to this email) and it's back in 60 seconds.`,
      ctaLabel: 'Bring it back',
      subjectPrefill: `Restore ${businessName} — last call`,
    },
    email_day30: {
      headlineLine1: 'Still here',
      headlineAccent: 'if you want it',
      body: `Been about a month since I built ${businessName}.\n\nI'm not chasing — just letting you know it's still safely stored. If timing's better now, reply and I'll bring it back online for you.`,
      ctaLabel: 'Bring it back',
      subjectPrefill: `Restore ${businessName}`,
    },
  };
  const copy = copyByStep[step] || copyByStep.email_day3;

  const ctaHref =
    `mailto:bytesuite@bytesplatform.com` +
    `?subject=${encodeURIComponent(copy.subjectPrefill)}` +
    `&body=${encodeURIComponent(`Hi Pixie team,\n\nPlease restore my ${businessName} preview.\n\nThanks.`)}`;

  // Inline-styled, table-based — bulletproof across Gmail / Apple Mail /
  // Outlook web. The header gradient bar + gradient text on the accent
  // word use `background-image: linear-gradient(...)` which renders in
  // every modern client (Outlook desktop falls back to solid colour, which
  // is fine — the rest of the layout still holds up).
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${copy.headlineLine1} ${copy.headlineAccent}</title>
</head>
<body style="margin:0;padding:0;background:#06060A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',Helvetica,Arial,sans-serif;color:#F5F5F7;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#06060A;">
    <tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- Gradient accent bar -->
        <tr><td height="4" style="height:4px;line-height:1px;font-size:1px;background-color:#4F46E5;background-image:linear-gradient(90deg,#4F46E5 0%,#7C3AED 30%,#EC4899 65%,#06B6D4 100%);border-radius:16px 16px 0 0;">&nbsp;</td></tr>

        <!-- Main card -->
        <tr><td style="background-color:#0E0E14;border:1px solid rgba(255,255,255,0.06);border-top:0;border-radius:0 0 16px 16px;padding:48px 44px;">

          <!-- Brand mark -->
          <p style="margin:0 0 36px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.14em;color:#6E6E76;text-transform:uppercase;">
            <span style="color:#818CF8;">/</span>&nbsp;Pixie&nbsp;·&nbsp;Bytes&nbsp;Platform
          </p>

          <!-- Display headline -->
          <h1 style="margin:0 0 28px;font-size:36px;font-weight:600;letter-spacing:-0.035em;line-height:1.05;color:#F5F5F7;">
            ${copy.headlineLine1}<br>
            <span style="background-color:#A78BFA;background-image:linear-gradient(135deg,#818CF8 0%,#A78BFA 45%,#F472B6 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">${copy.headlineAccent}</span>
          </h1>

          <!-- Body copy -->
          <p style="margin:0 0 32px;font-size:15px;line-height:1.7;color:#A6A6AE;white-space:pre-line;">${copy.body}</p>

          <!-- Build status card -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#15151D;border:1px solid rgba(255,255,255,0.07);border-radius:12px;margin:0 0 36px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 6px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.10em;color:#6E6E76;text-transform:uppercase;">Your build</p>
              <p style="margin:0;font-size:17px;font-weight:500;color:#F5F5F7;letter-spacing:-0.015em;">${businessName}</p>
              <p style="margin:10px 0 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:#A78BFA;letter-spacing:0.04em;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#34D399;margin-right:8px;vertical-align:middle;"></span>ARCHIVED&nbsp;·&nbsp;restorable in 60s
              </p>
            </td></tr>
          </table>

          <!-- Bulletproof gradient CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
            <tr><td style="border-radius:10px;background-color:#4F46E5;background-image:linear-gradient(135deg,#4F46E5 0%,#7C3AED 50%,#EC4899 100%);">
              <a href="${ctaHref}" style="display:inline-block;color:#FFFFFF;text-decoration:none;padding:16px 30px;font-size:15px;font-weight:600;letter-spacing:-0.01em;line-height:1;">${copy.ctaLabel}&nbsp;&nbsp;→</a>
            </td></tr>
          </table>

          <p style="margin:20px 0 0;font-size:13px;line-height:1.65;color:#6E6E76;">
            Or just reply to this email — it goes straight to the team and we'll have it back up before you finish reading.
          </p>

          <!-- Footer -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:56px 0 0;border-top:1px solid rgba(255,255,255,0.06);">
            <tr><td style="padding:24px 0 0;">
              <p style="margin:0 0 6px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.06em;color:#6E6E76;">Pixie&nbsp;·&nbsp;Bytes&nbsp;Platform&nbsp;·&nbsp;bytesplatform.com</p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#4D4D54;">To stop these, reply "stop following up" — we'll hear you.</p>
            </td></tr>
          </table>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text =
    `${copy.headlineLine1} ${copy.headlineAccent}\n` +
    `Pixie · Bytes Platform\n\n` +
    `${copy.body}\n\n` +
    `Your build: ${businessName} (archived — restorable in 60s)\n\n` +
    `${copy.ctaLabel}: ${ctaHref}\n\n` +
    `Or just reply to this email.\n\n` +
    `— Pixie · Bytes Platform\n` +
    `Reply "stop following up" to opt out.`;

  return { html, text };
}

/**
 * Run the email follow-up ladder for one user. Cheap to call repeatedly —
 * checks completion state + anchor age, fires at most one email per pass,
 * silently no-ops when nothing is due. Independent of the WhatsApp
 * ladders (own metadata key, own anchor, own cadence).
 */
async function processEmailFollowup(user) {
  const metadata = user.metadata || {};

  // Same exit gates as the WA flow — closed leads, converted customers,
  // explicit opt-outs, human-takeover. Re-checking these here means the
  // email ladder respects the same boundaries the chat ladders do.
  if (metadata.leadClosed) return;
  if (metadata.meetingBooked) return;
  if (metadata.paymentConfirmed) return;
  if (metadata.followupOptOut) return;
  if (metadata.humanTakeover) return;

  // Need an email address. The WEB_COLLECT_CONTACT step at the end of the
  // wizard collects this; users who dropped off before that step won't have
  // one on file and silently skip — which is correct, we can't email them.
  const email =
    metadata.email ||
    (metadata.websiteData && metadata.websiteData.contactEmail) ||
    null;
  if (!email) return;

  // Anchor: when the Stripe link was sent. Strongest "real value delivered"
  // signal we have. Without this anchor there's nothing concrete to follow
  // up about — exploratory-only leads (said hello, never engaged) are not
  // candidates for the email ladder.
  const anchorIso = metadata.paymentLinkSentAt;
  if (!anchorIso) return;

  const elapsedDays = (Date.now() - new Date(anchorIso).getTime()) / (1000 * 60 * 60 * 24);
  const completed = Array.isArray(metadata.emailFollowupSteps) ? metadata.emailFollowupSteps : [];

  // Walk the ladder and pick the LATEST step that's due. Walking
  // latest-first means a user we picked up after a missed cycle still
  // gets the most-current step (e.g. day-7 if we missed day-3).
  let nextStep = null;
  for (let i = EMAIL_FOLLOWUP_LADDER.length - 1; i >= 0; i--) {
    const rung = EMAIL_FOLLOWUP_LADDER[i];
    if (elapsedDays >= rung.afterDays && !completed.includes(rung.step)) {
      nextStep = rung;
      break;
    }
  }
  if (!nextStep) return;

  const websiteData = metadata.websiteData || {};
  const businessName = websiteData.businessName || 'your business';
  const previewUrl = metadata.currentSitePreviewUrl || metadata.previewUrl || null;
  const paymentLinkUrl = metadata.lastPaymentLinkUrl || metadata.paymentLinkUrl || null;

  const { html, text } = renderFollowupEmailContent(nextStep.step, {
    businessName,
    previewUrl,
    paymentLinkUrl,
  });

  const ok = await sendEmail({
    to: email,
    subject: nextStep.subject(businessName),
    html,
    text,
  });

  if (ok) {
    // Mark every step at-or-before the one we just sent as completed. If
    // we sent day-7 because we missed day-3, day-3 is also "done" — we're
    // not going to retroactively send it now.
    const sentIdx = EMAIL_FOLLOWUP_LADDER.findIndex((r) => r.step === nextStep.step);
    const newCompleted = Array.from(new Set([
      ...completed,
      ...EMAIL_FOLLOWUP_LADDER.slice(0, sentIdx + 1).map((r) => r.step),
    ]));
    await updateUserMetadata(user.id, {
      emailFollowupSteps: newCompleted,
      lastEmailFollowupAt: new Date().toISOString(),
    });
    logger.info(
      `[FOLLOWUP-EMAIL] Sent ${nextStep.step} to ${email} (user ${user.phone_number}, ` +
        `anchor ${anchorIso}, ${elapsedDays.toFixed(1)}d elapsed)`
    );
  } else {
    logger.warn(`[FOLLOWUP-EMAIL] Send failed for ${email} (step ${nextStep.step}, user ${user.phone_number})`);
  }
}

/**
 * Render the 22h discount message for a personality. Substitutes
 * ${newTotal} and ${originalTotal} placeholders at call time.
 */
function renderDiscountMessage(personalityMode, newTotal, originalTotal, discountPct) {
  const mode = (personalityMode || '').toUpperCase();
  const template = DISCOUNT_MESSAGES[mode] || DISCOUNT_MESSAGES.DEFAULT;
  return template
    .replace(/\$\{newTotal\}/g, String(newTotal))
    .replace(/\$\{originalTotal\}/g, String(originalTotal))
    .replace(/\$\{discountPct\}/g, String(discountPct));
}

// Exploratory-ladder copy keyed by step + personality. English only here —
// per-user translation happens at send time via the localizer (cache hits
// for English speakers, one LLM call for non-English). Placeholders:
//   ${portfolioUrl}  — recent work to show the user
//   ${calendlyUrl}   — meeting-booking fallback for the final rung
// Per-step behavioral spec for the exploratory follow-up ladder. Each step
// names ONE psychological lever (from the 12-lever arsenal in
// PIXIE_CHAT_FLOW_PLAN.md Section B) and an intent description. The actual
// message text is composed FRESH by the LLM at send time, so two silent
// users on the same step get differently-worded nudges. No hardcoded
// personality variants — they made every silent lead see byte-identical copy.
const EXPLORATORY_STEP_SPEC = {
  expl_2h_soft: {
    lever: 'Loss aversion',
    intentEn:
      'It has been 2 hours since the user said hi to Pixie and never replied. Write ONE short, casual WhatsApp nudge that: (a) acknowledges you noticed they went quiet, without sounding clingy or naggy, (b) lowers the friction with a no-commitment ask — offer to send them a real example for their trade if they tell you what they do, (c) ends with one easy question (their trade / kind of business). No links, no preview pitch, no business-name ask. One sentence is fine.',
  },
  expl_8h_value: {
    lever: 'Reciprocity',
    intentEn:
      'It has been 8 hours since the user said hi and never replied. Write ONE short, casual WhatsApp message that: (a) shares the recent example URL ${portfolioUrl} (keep the URL exact and inline) as proof of recent work, (b) offers to spin up a FREE demo of THEIR site in about 5 minutes if they send their business name, (c) makes it clear there is no payment until they see it live. Casual / human tone. No emoji unless it matches their vibe.',
  },
  expl_20h_last: {
    lever: 'Pattern interrupt',
    intentEn:
      'It has been ~20 hours since the user said hi and never replied — this is the LAST follow-up message they will get from Pixie. Write ONE short, casual WhatsApp message that: (a) explicitly tells them this is the last nudge ("last ping from me", or local-language equivalent), (b) PRESSURE-RELEASES — say something like "if you are just browsing, all good, I will stop messaging" — counterintuitively this raises reply rate, (c) offers ONE last path back if they want it (a free demo with their business name, OR a 15-min booked call at ${calendlyUrl} — pick one based on tone, do not push both). After this message we stop messaging this user unless they reach out first.',
  },
};

/**
 * Compose an exploratory-ladder follow-up via the LLM at send time. Returns
 * the fully-worded WhatsApp message (already in the user's language, with
 * URLs substituted, and pulling the lever specified by EXPLORATORY_STEP_SPEC).
 *
 * No more hardcoded personality variants — each silent user gets a
 * uniquely-worded nudge. See PIXIE_CHAT_FLOW_PLAN.md Phase 3.
 *
 * Returns { text, lever } on success, null if the step is unknown.
 */
async function composeExploratoryFollowup(stepKey, user, env, recentLevers = []) {
  const spec = EXPLORATORY_STEP_SPEC[stepKey];
  if (!spec) return null;

  const portfolioUrl = 'https://austinclimate.pixiebot.co';
  const calendlyUrl = (env && env.calendlyUrl) || 'https://calendly.com/bytes-platform';

  const filledIntent = spec.intentEn
    .replace(/\$\{portfolioUrl\}/g, portfolioUrl)
    .replace(/\$\{calendlyUrl\}/g, calendlyUrl);

  // Language detection: reuse the cached preferredLanguage if available so
  // we don't pay for a detection call on every follow-up. Falls back to
  // English when nothing is on file.
  const { resolveLanguage } = require('../utils/localizer');
  const lang = await resolveLanguage(user, null);
  const targetLang = (!lang || lang === 'english') ? 'English' : lang;
  const isRoman = typeof lang === 'string' && lang.startsWith('roman-');

  const banList = Array.isArray(recentLevers) && recentLevers.length > 0
    ? `\nDO NOT use these levers — they were used in your last few messages: ${recentLevers.join(', ')}. You MUST pick a different angle within the spirit of "${spec.lever}".`
    : '';

  const sysPrompt = `You are Pixie, an AI assistant for a digital agency that builds business websites in 60 seconds via WhatsApp. You are composing ONE follow-up WhatsApp message to a silent lead — a user who said hi but never replied. Make it sound human, casual, like a real person typing on their phone. Never robotic.

Lever to pull: **${spec.lever}**. ${banList}

Rules:
- Output language: ${targetLang}.${isRoman ? ' Use Latin/Roman script.' : ''}
- ONE short paragraph (1-3 sentences). WhatsApp = brief.
- Preserve any URLs and inline values exactly as they appear in the intent.
- Never re-introduce yourself (no "Hey, I'm Pixie") — the user already knows.
- No preamble, no quotes, no commentary in your output. Output ONLY the WhatsApp message text.${isRoman ? '\n- For gendered languages, commit to masculine/neutral form. Never slash hedges like "karunga/karungi".' : ''}

Intent of this follow-up: ${filledIntent}`;

  try {
    const out = await generateResponse(
      sysPrompt,
      [{ role: 'user', content: '(compose the follow-up message)' }],
      { userId: user?.id, operation: 'exploratory_followup' }
    );
    const text = String(out || '').trim();
    if (!text) return null;
    return { text, lever: spec.lever };
  } catch (err) {
    logger.warn(`[EXPL] compose failed for ${stepKey} / ${user.phone_number}: ${err.message}`);
    return null;
  }
}

/**
 * Apply the 22h website-only discount for a user. Returns the new link
 * URL + amounts, or null if no pending website payment exists or the
 * discount was already applied.
 *
 * Steps:
 *   1. Fetch latest pending website payment
 *   2. Skip if discount_applied=true OR not a website service
 *   3. Compute newWebsiteAmount = floor(websiteAmount * 0.8)
 *      (domain amount stays verbatim — Namecheap bills us the full price)
 *   4. createPaymentLink with the new total
 *      — cancelPendingPaymentsForUser in stripe.js auto-deactivates the old link
 *   5. Mark the old payment row discount_applied=true (on top of superseded)
 *      so we never re-discount even if the row stays around
 *   6. Update the preview site's activation banner with new pricing
 *      (strikethrough the original)
 */
async function applyWebsiteDiscount(user) {
  const { data: pending } = await supabase
    .from('payments')
    .select('id, website_amount, domain_amount, original_amount, amount, selected_domain, discount_applied, service_type, stripe_payment_link_id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .eq('service_type', 'website')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    logger.info(`[DISCOUNT] No pending website payment for user ${user.id} — skipping`);
    return null;
  }
  if (pending.discount_applied) {
    logger.info(`[DISCOUNT] Already discounted for payment ${pending.id} — skipping`);
    return null;
  }

  // Amounts in cents in the DB. website_amount can be null on very old rows
  // — fall back to full amount with zero domain.
  const websiteCents = pending.website_amount != null ? pending.website_amount : pending.amount;
  const domainCents = pending.domain_amount || 0;
  const originalCents = pending.original_amount || pending.amount;

  const { getNumberSetting } = require('../db/settings');
  const discountPct = await getNumberSetting('website_discount_pct', WEBSITE_DISCOUNT_PCT_DEFAULT);
  const newWebsiteCents = Math.floor(websiteCents * (100 - discountPct) / 100);
  const newTotalCents = newWebsiteCents + domainCents;
  const newWebsite = Math.round(newWebsiteCents / 100);
  const newDomain = Math.round(domainCents / 100);
  const newTotal = Math.round(newTotalCents / 100);
  const originalTotal = Math.round(originalCents / 100);

  const selectedDomain = pending.selected_domain || null;
  const description = selectedDomain && newDomain > 0
    ? `Website activation + domain ${selectedDomain} — ${discountPct}% off website`
    : `Website activation — ${discountPct}% off`;

  let newLinkUrl = null;
  let newPaymentId = null;
  try {
    const { createPaymentLink } = require('../payments/stripe');
    const linkResult = await createPaymentLink({
      userId: user.id,
      phoneNumber: user.phone_number,
      amount: newTotal,
      serviceType: 'website',
      packageTier: 'activation-discount',
      description,
      customerName: user.name || '',
      websiteAmount: newWebsite,
      domainAmount: newDomain,
      selectedDomain,
      originalAmount: originalTotal,
    });
    newLinkUrl = linkResult?.pixieUrl || linkResult?.url || null;
    newPaymentId = linkResult?.paymentId || null;
  } catch (err) {
    logger.error(`[DISCOUNT] Failed to create discounted payment link for ${user.phone_number}: ${err.message}`);
    return null;
  }

  // Flag the fresh row as discounted so if the scheduler ever pulls it again
  // we don't re-cut. (The prior pending row is now status=superseded via
  // cancelPendingPaymentsForUser — no need to touch it further.)
  if (newPaymentId) {
    await supabase
      .from('payments')
      .update({ discount_applied: true, discount_pct: discountPct })
      .eq('id', newPaymentId);
  }

  // Redeploy the preview site with the discounted banner (strikethrough +
  // ${discountPct}% off badge). Fire-and-forget — the chat message already has the new
  // link, so a redeploy failure doesn't block the sale.
  try {
    const { updateSiteBannerPricing } = require('../website-gen/redeployer');
    updateSiteBannerPricing(user.id, {
      paymentLinkUrl: newLinkUrl,
      activationAmount: newTotal,
      originalAmount: originalTotal,
      discountPct,
    }).catch((err) =>
      logger.warn(`[DISCOUNT] Banner pricing redeploy failed for user ${user.id}: ${err.message}`)
    );
  } catch (err) {
    logger.warn(`[DISCOUNT] Could not dispatch banner pricing update: ${err.message}`);
  }

  logger.info(
    `[DISCOUNT] Applied to ${user.phone_number}: $${originalTotal} → $${newTotal} ` +
      `(website $${Math.round(websiteCents / 100)} → $${newWebsite}, domain $${newDomain} unchanged)`
  );

  return { newLinkUrl, newTotal, originalTotal, discountPct };
}

/**
 * Run one pass of the follow-up check.
 * Queries all users in SALES_CHAT state, finds the most recent assistant
 * message timestamp, and sends the appropriate follow-up if due.
 */
async function runFollowupCycle() {
  try {
    // Get all users currently in the sales chat state
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('id, phone_number, metadata, channel, via_phone_number_id')
      .eq('state', STATES.SALES_CHAT);

    if (userErr) {
      logger.error('Followup: failed to query users', userErr);
      return;
    }

    if (!users || users.length === 0) return;

    for (const user of users) {
      const channel = user.channel || 'whatsapp';
      // Messenger / Instagram: Meta's 24h-interaction-window rule blocks
      // free-form outbound regardless of intent. Chat follow-up is out,
      // but email is fair game — try the email ladder for those users.
      if (channel === 'messenger' || channel === 'instagram') {
        try {
          await processEmailFollowup(user);
        } catch (err) {
          logger.warn(`[FOLLOWUP-EMAIL] ${channel} branch failed for ${user.phone_number}: ${err.message}`);
        }
        continue;
      }

      try {
        // Reply on whichever of our WhatsApp numbers the user originally
        // messaged, not the env default — avoids surfacing a brand-new thread
        // from an unfamiliar business number.
        await runWithContext(
          { channel, phoneNumberId: user.via_phone_number_id || null },
          () => processUserFollowup(user)
        );
      } catch (err) {
        logger.error(`Followup: error processing user ${user.phone_number}`, err.response?.data || err.message);
      }
    }
  } catch (err) {
    logger.error('Followup: cycle error', err);
  }
}

async function processUserFollowup(user) {
  const metadata = user.metadata || {};

  // Skip closed leads, converted customers, or opted-out users
  if (metadata.leadClosed) return;
  if (metadata.meetingBooked) return;
  if (metadata.paymentConfirmed) return;
  if (metadata.followupOptOut) return;
  if (metadata.humanTakeover) return;

  // HOT leads that went silent get faster follow-up (check at 1h instead of 2h)
  const leadTemp = metadata.leadTemperature || 'WARM';

  // Get the timestamp of the last message from the user (not bot)
  const { data: lastMsg, error: msgErr } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (msgErr || !lastMsg) return;

  // ── 24-hour customer-service window gate (WhatsApp) ─────────────────
  // Meta blocks free-form outbound past this window; Templates are
  // required instead. We don't have approved Templates registered
  // yet, so for now the only safe action past 24h is to silently mark
  // the step complete and skip. Marking complete prevents the
  // scheduler from re-trying every cycle for the rest of the user's
  // lifetime and slowly burning quality rating.
  //
  // Channel-level note: Messenger / Instagram are already gated to
  // skip processing entirely in runFollowupCycle (line ~266) for the
  // same 24h-rule reason. This gate does the same for WhatsApp at the
  // user level (since we DO want to process WhatsApp users — most
  // active ones are inside the window).
  const channel = user.channel || 'whatsapp';
  if (channel === 'whatsapp' && !isWithinWaWindow(lastMsg.created_at)) {
    const isSeoLead = metadata.seoAuditTriggered && !metadata.domainChoice;
    const wd = metadata.websiteData || {};
    const isEngagedWebdev =
      !!wd.businessName ||
      !!metadata.selectedDomain ||
      !!metadata.websiteDemoTriggered ||
      !!metadata.paymentLinkSentAt ||
      !!metadata.lastPaymentAmount;

    // Pick the ladder this user belongs to so we mark the right field
    // complete. Exploratory users (said hello, never engaged) need the
    // same treatment as the other ladders or the scheduler keeps
    // re-checking them every cycle for the rest of their lifetime.
    let completed, ladder, patchKey;
    if (isSeoLead) {
      completed = metadata.seoFollowupSteps || [];
      ladder = SEO_FOLLOWUP_LADDER;
      patchKey = 'seoFollowupSteps';
    } else if (isEngagedWebdev) {
      completed = metadata.followupSteps || [];
      ladder = FOLLOWUP_LADDER;
      patchKey = 'followupSteps';
    } else {
      completed = metadata.exploratorySteps || [];
      ladder = EXPLORATORY_LADDER;
      patchKey = 'exploratorySteps';
    }

    if (completed.length < ladder.length) {
      const allSteps = ladder.map((r) => r.step);
      await updateUserMetadata(user.id, { [patchKey]: allSteps });
      logger.info(
        `[FOLLOWUP] Skipping ${user.phone_number} — past 24h WhatsApp window (last inbound: ${lastMsg.created_at}). All ${patchKey} marked complete.`
      );
    }
    // WA window is closed — chat is out, but kick off / continue the email
    // ladder if the user left an email + reached the preview/payment stage.
    try {
      await processEmailFollowup(user);
    } catch (err) {
      logger.warn(`[FOLLOWUP-EMAIL] WA-closed branch failed for ${user.phone_number}: ${err.message}`);
    }
    return;
  }

  // SEO-audit branch: a user who ran an audit but never entered the website
  // flow (no domain choice yet, no pending website payment) gets the SEO
  // ladder. `domainChoice` is set as soon as they answer the WEB_DOMAIN_CHOICE
  // prompt — even "skip" counts as having crossed into the website track.
  const isSeoLead = metadata.seoAuditTriggered && !metadata.domainChoice;
  if (isSeoLead) {
    const seoCompleted = metadata.seoFollowupSteps || [];
    if (seoCompleted.length >= SEO_FOLLOWUP_LADDER.length) return;

    const nextSeoStep = getNextFollowup(lastMsg.created_at, seoCompleted, leadTemp, SEO_FOLLOWUP_LADDER);
    if (!nextSeoStep) return;

    const personality = metadata.leadBrief
      ? extractPersonalityFromBrief(metadata.leadBrief)
      : (metadata.personalityMode || 'DEFAULT');

    const seoFloor = await require('../db/settings').getNumberSetting('seo_floor_price', 200);
    const message = renderSeoFollowupMessage(personality, metadata.seoTopFix, metadata.lastSeoUrl, seoFloor);

    logger.info(`Followup: sending ${nextSeoStep.step} to ${user.phone_number} (mode: ${personality}, temp: ${leadTemp}, topFix: "${metadata.seoTopFix || ''}")`);

    await sendTextMessage(user.phone_number, message);
    await logMessage(user.id, message, 'assistant');

    await updateUserMetadata(user.id, {
      seoFollowupSteps: [...seoCompleted, nextSeoStep.step],
    });
    return;
  }

  const completedSteps = metadata.followupSteps || [];

  // If all steps are done, skip
  if (completedSteps.length >= FOLLOWUP_LADDER.length) return;

  // Website-payment ladder guard: all three messages in FOLLOWUP_MESSAGES
  // reference "payment link" / "your site is ready to go live" / "$100".
  // Sending them to a user who never engaged with the webdev flow is
  // confusing (the scheduler doesn't know they were just exploring). Gate
  // the ladder on ANY sign of webdev engagement:
  //   - websiteData.businessName: they started the collection flow
  //   - selectedDomain: they picked a domain
  //   - websiteDemoTriggered: sales bot fired [TRIGGER_WEBSITE_DEMO]
  //   - paymentLinkSentAt / lastPaymentAmount: a link/payment exists
  //
  // If none apply, route to the exploratory ladder below — three soft
  // re-engagement nudges inside the 24h window aimed at sparking a reply.
  const wd = metadata.websiteData || {};
  const engagedWithWebdev =
    !!wd.businessName ||
    !!metadata.selectedDomain ||
    !!metadata.websiteDemoTriggered ||
    !!metadata.paymentLinkSentAt ||
    !!metadata.lastPaymentAmount;

  if (!engagedWithWebdev) {
    // Kill switch + per-step hour overrides via admin_settings. Reuses the
    // same getSetting/getNumberSetting pattern applyWebsiteDiscount uses.
    const { getSetting, getNumberSetting } = require('../db/settings');
    const disabled = await getSetting('exploratory_disabled', false);
    if (disabled) return;

    const explCompleted = metadata.exploratorySteps || [];
    if (explCompleted.length >= EXPLORATORY_LADDER.length) return;

    const h1 = await getNumberSetting('exploratory_step1_hours', 2);
    const h2 = await getNumberSetting('exploratory_step2_hours', 8);
    const h3 = await getNumberSetting('exploratory_step3_hours', 20);
    const tunedLadder = [
      { step: 'expl_2h_soft',  afterHours: h1 },
      { step: 'expl_8h_value', afterHours: h2 },
      { step: 'expl_20h_last', afterHours: h3 },
    ];

    const nextStep = getNextFollowup(lastMsg.created_at, explCompleted, leadTemp, tunedLadder);
    if (!nextStep) return;

    const { env: envCfg } = require('../config/env');

    // Compose via LLM, lever-tagged, with the user's recent levers banned
    // so the rotation rule holds. Falls back if compose returns null.
    const recentLevers = Array.isArray(metadata.recentLevers) ? metadata.recentLevers.slice(-2) : [];
    const composed = await composeExploratoryFollowup(nextStep.step, user, envCfg, recentLevers);
    if (!composed) return;

    logger.info(
      `[EXPL] Sending ${nextStep.step} to ${user.phone_number} ` +
        `(lever: ${composed.lever}, temp: ${leadTemp}, lang: ${metadata.preferredLanguage || 'english'})`
    );

    await sendTextMessage(user.phone_number, composed.text);
    await logMessage(user.id, composed.text, 'assistant');

    // Push the lever used into recentLevers so the next message (from the
    // bot OR from a later follow-up step) doesn't repeat it.
    const nextRecentLevers = [...recentLevers, composed.lever].slice(-2);
    await updateUserMetadata(user.id, {
      exploratorySteps: [...explCompleted, nextStep.step],
      recentLevers: nextRecentLevers,
    });
    return;
  }

  const nextStep = getNextFollowup(lastMsg.created_at, completedSteps, leadTemp);
  if (!nextStep) return;

  // Only website leads (they have a selectedDomain or a pending website
  // payment) get the 22h discount. Anyone else in SALES_CHAT with no
  // website context has nothing to discount — skip them cleanly.
  if (nextStep.step === 'followup_22h_discount') {
    const discount = await applyWebsiteDiscount(user);
    if (!discount) {
      // Mark complete anyway so we don't retry every cycle forever.
      await updateUserMetadata(user.id, {
        followupSteps: [...completedSteps, nextStep.step],
      });
      return;
    }

    const personality = metadata.leadBrief
      ? extractPersonalityFromBrief(metadata.leadBrief)
      : (metadata.personalityMode || 'DEFAULT');

    const englishMessage = renderDiscountMessage(personality, discount.newTotal, discount.originalTotal, discount.discountPct);
    const { localize } = require('../utils/localizer');
    const message = await localize(englishMessage, user, null);

    logger.info(`Followup: sending 22h discount to ${user.phone_number} (mode: ${personality}, new: $${discount.newTotal})`);

    await sendTextMessage(user.phone_number, message);
    await logMessage(user.id, message, 'assistant');

    // Send the new Stripe link as its own message (CTA button for mobile).
    try {
      const { sendCTAButton } = require('../messages/sender');
      if (discount.newLinkUrl) {
        const ctaBody = await localize(`Tap below to pay $${discount.newTotal}`, user, null);
        await sendCTAButton(
          user.phone_number,
          ctaBody,
          `💳 Pay $${discount.newTotal}`,
          discount.newLinkUrl
        );
        await logMessage(user.id, `Discount payment link sent: $${discount.newTotal}`, 'assistant');
      }
    } catch (err) {
      logger.error(`[DISCOUNT] Failed to send CTA button: ${err.message}`);
    }

    await updateUserMetadata(user.id, {
      followupSteps: [...completedSteps, nextStep.step],
      discountAppliedAt: new Date().toISOString(),
    });
    return;
  }
}

/**
 * Extract personality mode from the lead brief string.
 */
function extractPersonalityFromBrief(brief) {
  const match = brief.match(/Personality mode:\s*(COOL|PROFESSIONAL|UNSURE|NEGOTIATOR)/i);
  return match ? match[1].toUpperCase() : 'DEFAULT';
}

/**
 * Meeting Reminder System
 *
 * Checks for confirmed meetings happening within the next 30-60 minutes
 * and sends a WhatsApp reminder to the user.
 * Tracked via metadata.meetingRemindersSent to avoid duplicates.
 */
async function runMeetingReminders() {
  try {
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select('id, user_id, phone_number, name, preferred_date, preferred_time, preferred_timezone, topic, channel')
      .eq('status', 'confirmed');

    if (error || !meetings || meetings.length === 0) return;

    const now = new Date();

    for (const meeting of meetings) {
      try {
        if (!meeting.preferred_date || !meeting.preferred_time) continue;

        // Parse the meeting datetime
        const timeStr = meeting.preferred_time.replace(/\s*(AM|PM)/i, ' $1').trim();
        const meetingDateStr = `${meeting.preferred_date} ${timeStr}`;
        const meetingDate = new Date(meetingDateStr);

        // If parsing failed, try alternative format
        if (isNaN(meetingDate.getTime())) continue;

        const diffMs = meetingDate.getTime() - now.getTime();
        const diffMins = diffMs / (1000 * 60);

        // Send reminder if meeting is 25-35 minutes away (catches the 30-min window)
        if (diffMins >= 25 && diffMins <= 35) {
          // Check if we already sent a reminder for this meeting + pick up
          // the line this user messages on so the reminder goes back there.
          const { data: user } = await supabase
            .from('users')
            .select('id, metadata, via_phone_number_id, phone_number')
            .eq('id', meeting.user_id)
            .single();

          const sentReminders = user?.metadata?.meetingRemindersSent || [];
          if (sentReminders.includes(meeting.id)) continue;

          // 24h window gate: meeting reminders are transactional, but
          // Meta still requires a utility-category Template past the
          // customer-service window. Without an approved template
          // registered, sending free-form is a policy violation. Look
          // up the user's most recent inbound and skip if we're past
          // the window. Mark the reminder as "sent" so we don't retry
          // every cycle.
          const channel = meeting.channel || 'whatsapp';
          if (channel === 'whatsapp') {
            const { data: lastIn } = await supabase
              .from('conversations')
              .select('created_at')
              .eq('user_id', meeting.user_id)
              .eq('role', 'user')
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            if (!lastIn || !isWithinWaWindow(lastIn.created_at)) {
              await updateUserMetadata(meeting.user_id, {
                meetingRemindersSent: [...sentReminders, meeting.id],
              });
              logger.info(
                `[REMINDER] Skipping meeting reminder for ${meeting.phone_number} — past 24h WhatsApp window. Marked sent so we don't retry.`
              );
              continue;
            }
          }

          // Send the reminder
          const displayTime = meeting.preferred_time;
          const displayDate = meeting.preferred_date;
          const topic = meeting.topic || 'your upcoming call';

          const { localize } = require('../utils/localizer');
          const reminderEn = `Hey${meeting.name ? ' ' + meeting.name : ''}! Just a quick reminder - you have a call about *${topic}* in about 30 minutes (${displayTime}, ${displayDate}). Talk soon!`;
          const reminderText = await localize(
            reminderEn,
            user || { id: meeting.user_id, phone_number: meeting.phone_number, metadata: {} },
            null
          );
          await runWithContext(
            { channel, phoneNumberId: user?.via_phone_number_id || null },
            () => sendTextMessage(meeting.phone_number, reminderText)
          );
          await logMessage(meeting.user_id, `Meeting reminder sent for ${displayDate} at ${displayTime}`, 'assistant');

          // Mark as sent
          await updateUserMetadata(meeting.user_id, {
            meetingRemindersSent: [...sentReminders, meeting.id],
          });

          logger.info(`[REMINDER] Sent meeting reminder to ${meeting.phone_number} for ${displayDate} at ${displayTime}`);
        }
      } catch (err) {
        logger.error(`[REMINDER] Error processing meeting ${meeting.id}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('[REMINDER] Meeting reminder cycle error:', err.message);
  }
}

/**
 * Payment Confirmation System
 *
 * Polls Stripe for pending payments every 2 minutes.
 * When a payment is detected as paid, sends a WhatsApp confirmation
 * and updates the DB record.
 *
 * Two safety rails to prevent ghost receipts from stale dev/test payments:
 *   1. Only poll payments created in the last PAYMENT_POLL_MAX_AGE_HOURS hours.
 *   2. Auto-expire anything older so it stops getting polled forever.
 */
const PAYMENT_POLL_MAX_AGE_HOURS = 48;

async function runPaymentPolling() {
  try {
    // STEP 1: Auto-expire pending rows that are too old to still be legitimate.
    // If a user was going to pay, they would have done it within 48 hours.
    // Leaving them as 'pending' means the poller keeps pinging Stripe forever
    // and ghost confirmations can fire if the link gets paid much later (e.g.
    // during unrelated dev testing on another account).
    const ageCutoff = new Date(Date.now() - PAYMENT_POLL_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
    const { error: expireError, count: expiredCount } = await supabase
      .from('payments')
      .update({ status: 'expired' }, { count: 'exact' })
      .eq('status', 'pending')
      .lt('created_at', ageCutoff);
    if (expireError) {
      logger.warn(`[PAYMENT] Failed to auto-expire stale pending payments: ${expireError.message}`);
    } else if (expiredCount && expiredCount > 0) {
      logger.info(`[PAYMENT] Auto-expired ${expiredCount} stale pending payment(s) older than ${PAYMENT_POLL_MAX_AGE_HOURS}h`);
    }

    // STEP 2: Only look at FRESH pending payments.
    const { data: pending, error } = await supabase
      .from('payments')
      .select('id, user_id, phone_number, stripe_payment_link_id, amount, currency, service_type, package_tier, description, channel, created_at')
      .eq('status', 'pending')
      .gte('created_at', ageCutoff)
      .not('stripe_payment_link_id', 'is', null);

    if (error || !pending || pending.length === 0) return;

    let stripe;
    try {
      const { env: envConfig } = require('../config/env');
      if (!envConfig.stripe.secretKey) return;
      const Stripe = require('stripe');
      stripe = new Stripe(envConfig.stripe.secretKey);
    } catch {
      return; // Stripe not configured
    }

    for (const payment of pending) {
      try {
        // Safety rail: if the Stripe payment link has already been deactivated
        // (e.g. by cancelPendingPaymentsForUser when a new link was issued),
        // treat this row as superseded and stop polling it. This prevents a
        // ghost receipt firing from a stale dev test link that someone paid
        // long ago.
        try {
          const linkObj = await stripe.paymentLinks.retrieve(payment.stripe_payment_link_id);
          if (linkObj && linkObj.active === false) {
            await supabase
              .from('payments')
              .update({ status: 'superseded' })
              .eq('id', payment.id);
            logger.info(`[PAYMENT] Skipping inactive Stripe link ${payment.stripe_payment_link_id} (row ${payment.id}) — marked superseded`);
            continue;
          }
        } catch (linkErr) {
          // Only mark superseded when Stripe EXPLICITLY says the link is
          // gone (resource_missing). Rate limits, transient 503s, or
          // network blips during a deploy restart should not flip the
          // payment to a terminal state — we'll retry next cycle. A prior
          // version of this handler marked any error as superseded, which
          // killed perfectly valid pending payments whenever Stripe or the
          // network hiccupped.
          const isGone =
            linkErr?.statusCode === 404 ||
            linkErr?.code === 'resource_missing' ||
            linkErr?.raw?.code === 'resource_missing';
          if (isGone) {
            logger.warn(`[PAYMENT] Link ${payment.stripe_payment_link_id} gone at Stripe (${linkErr.message}) — marking row ${payment.id} superseded`);
            await supabase
              .from('payments')
              .update({ status: 'superseded' })
              .eq('id', payment.id);
            continue;
          }
          logger.warn(`[PAYMENT] Transient error retrieving link ${payment.stripe_payment_link_id}: ${linkErr.message} — leaving pending, will retry`);
          continue;
        }

        // Check Stripe for completed sessions on this payment link
        const sessions = await stripe.checkout.sessions.list({
          payment_link: payment.stripe_payment_link_id,
          limit: 5,
        });

        const paidSession = sessions.data.find(
          s => s.payment_status === 'paid' || s.status === 'complete'
        );

        if (!paidSession) continue;

        // Hand off to the shared post-payment handler (same code path the
        // Stripe webhook uses). Idempotent — if the webhook already fired
        // for this same session and processed it, handleConfirmedPayment
        // detects payment.status === 'paid' and short-circuits.
        await handleConfirmedPayment(payment, paidSession);
      } catch (err) {
        logger.error(`[PAYMENT] Error checking payment ${payment.id}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('[PAYMENT] Payment polling cycle error:', err.message);
  }
}

/**
 * Start the follow-up scheduler. Runs every `intervalMs` (default 30 minutes).
 * Also runs meeting reminders every 5 minutes and payment polling every 2 minutes.
 */
function startFollowupScheduler(intervalMs = 30 * 60 * 1000) {
  logger.info(`Follow-up scheduler started (interval: ${intervalMs / 60000} min)`);
  logger.info('Meeting reminder checker started (interval: 5 min)');
  logger.info('Payment polling started (interval: 2 min)');

  // Run once immediately, then on interval
  runFollowupCycle();
  runMeetingReminders();
  runPaymentPolling();

  const followupTimer = setInterval(runFollowupCycle, intervalMs);
  const reminderTimer = setInterval(runMeetingReminders, 5 * 60 * 1000);
  // Payment polling is now a FALLBACK — the primary path is the Stripe
  // webhook (src/payments/stripeWebhook.js) which confirms payments in
  // ~1-2 seconds. We still poll every 15 minutes to catch anything the
  // webhook missed (Render briefly down during a deploy, Stripe
  // temporary delivery failure). handleConfirmedPayment is idempotent,
  // so running both is safe — whichever fires second is a no-op.
  const paymentTimer = setInterval(runPaymentPolling, 15 * 60 * 1000);

  return { followupTimer, reminderTimer, paymentTimer };
}

module.exports = {
  startFollowupScheduler,
  runFollowupCycle,
  runMeetingReminders,
  runPaymentPolling,
  // Exported for preview/test scripts (e.g. scripts/_send-followup-emails.js)
  EMAIL_FOLLOWUP_LADDER,
  renderFollowupEmailContent,
  processEmailFollowup,
};
