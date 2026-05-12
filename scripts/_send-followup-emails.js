// One-off preview script: renders all 3 email-follow-up steps with sample
// data, writes them to /tmp/pixie-followup-emails/*.html so you can open
// them in a browser, then sends each to bytesuite@bytesplatform.com via
// SendGrid (the same path the real scheduler uses).
//
// Run: node scripts/_send-followup-emails.js
require('dotenv').config();
const path = require('path');
const fs   = require('fs');

const {
  EMAIL_FOLLOWUP_LADDER,
  renderFollowupEmailContent,
} = require('../src/followup/scheduler');
const { sendEmail } = require('../src/notifications/email');

const TO = 'bytesuite@bytesplatform.com';

// Sample data — mirrors what a real preview-sent user would have on their
// metadata when the ladder fires.
const sample = {
  businessName:   "Alex Rivera's Studio",
  previewUrl:     'https://alex-rivera-studio.netlify.app',
  paymentLinkUrl: 'https://buy.stripe.com/test_preview_link_example',
};

const OUT_DIR = '/tmp/pixie-followup-emails';
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  console.log(`\nRendering ${EMAIL_FOLLOWUP_LADDER.length} follow-up emails for "${sample.businessName}"`);
  console.log(`HTML previews → ${OUT_DIR}`);
  console.log(`SendGrid recipient → ${TO}\n`);

  const results = [];

  for (const rung of EMAIL_FOLLOWUP_LADDER) {
    const { html, text } = renderFollowupEmailContent(rung.step, sample);
    const subject = rung.subject(sample.businessName);

    // Save HTML for browser preview
    const fp = path.join(OUT_DIR, `${rung.step}.html`);
    fs.writeFileSync(fp, html, 'utf8');

    // Send via SendGrid — same code path the scheduler uses
    const tagged = `[Pixie preview] ${subject}`;
    const ok = await sendEmail({ to: TO, subject: tagged, html, text });

    results.push({ step: rung.step, subject: tagged, html: fp, sent: ok });
    console.log(`  ${rung.step.padEnd(13)} ${ok ? '✓ sent' : '✗ FAILED'}  →  ${fp}`);
  }

  console.log('\n=== OPEN IN BROWSER ===');
  for (const r of results) console.log(`${r.step.padEnd(13)} file://${r.html}`);
  console.log();
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
