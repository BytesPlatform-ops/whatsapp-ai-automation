/**
 * One-shot read-only analysis of the last 90 user conversations.
 * Usage: node scripts/analyze_conversations.js
 */

require('dotenv').config();
const { supabase } = require('../src/config/database');
const { env } = require('../src/config/env');

const LIMIT = 90;

// State flow groups for readability
const FLOW_PREFIX = {
  WEB_: 'Website Builder',
  SALON_: 'Website Builder (Salon)',
  SEO_: 'SEO Audit',
  CB_: 'Chatbot SaaS',
  LOGO_: 'Logo Gen',
  AD_: 'Ad Gen',
  APP_: 'App Dev',
  MARKETING_: 'Marketing',
  SCHEDULE_: 'Meeting',
  DOMAIN_: 'Domain (legacy)',
};

function classifyFlow(state) {
  if (!state) return 'Unknown';
  for (const [prefix, label] of Object.entries(FLOW_PREFIX)) {
    if (state.startsWith(prefix)) return label;
  }
  if (state === 'SALES_CHAT') return 'Sales Chat';
  if (state === 'GENERAL_CHAT') return 'General Chat';
  if (state === 'INFORMATIVE_CHAT') return 'Informative Chat';
  if (state === 'WELCOME') return 'Welcome (never progressed)';
  if (state === 'SERVICE_SELECTION') return 'Service Selection';
  return state;
}

function pct(n, total) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

function bar(n, total, width = 20) {
  const filled = Math.round((n / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

async function main() {
  // 1. Fetch last 90 users (skip tester phones)
  const testerPhones = env.testerPhones || [];

  let query = supabase
    .from('users')
    .select('id, phone_number, channel, state, metadata, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(LIMIT + testerPhones.length + 10); // overfetch to account for filtered testers

  const { data: allUsers, error: usersErr } = await query;
  if (usersErr) throw usersErr;

  const users = allUsers
    .filter((u) => {
      const normalized = (u.phone_number || '').replace(/[^\d]/g, '');
      return !testerPhones.includes(normalized);
    })
    .slice(0, LIMIT);

  const userIds = users.map((u) => u.id);

  // 2. Fetch all messages for these users
  const { data: allMessages, error: msgsErr } = await supabase
    .from('conversations')
    .select('id, user_id, role, message_text, created_at, seq')
    .in('user_id', userIds)
    .order('seq', { ascending: true });

  if (msgsErr) throw msgsErr;

  // Group messages by user
  const msgsByUser = {};
  for (const m of allMessages) {
    if (!msgsByUser[m.user_id]) msgsByUser[m.user_id] = [];
    msgsByUser[m.user_id].push(m);
  }

  // 3. Fetch feedback for these users
  const { data: feedbackRows } = await supabase
    .from('feedback')
    .select('user_id, source, trigger_type, rating, comment, state, created_at')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  const feedbackByUser = {};
  for (const f of feedbackRows || []) {
    if (!feedbackByUser[f.user_id]) feedbackByUser[f.user_id] = [];
    feedbackByUser[f.user_id].push(f);
  }

  // 4. Fetch lead summaries for these users
  const { data: leadSummaries } = await supabase
    .from('lead_summaries')
    .select('user_id, outcome, services_discussed, industry, total_messages')
    .in('user_id', userIds);

  const leadByUser = {};
  for (const l of leadSummaries || []) {
    leadByUser[l.user_id] = l;
  }

  // ── ANALYSIS ─────────────────────────────────────────────────────────────

  // A. Channel breakdown
  const channels = {};
  for (const u of users) {
    channels[u.channel || 'unknown'] = (channels[u.channel || 'unknown'] || 0) + 1;
  }

  // B. Current state distribution (where users are RIGHT NOW)
  const stateCounts = {};
  for (const u of users) {
    stateCounts[u.state || 'null'] = (stateCounts[u.state || 'null'] || 0) + 1;
  }

  // C. Flow distribution
  const flowCounts = {};
  for (const u of users) {
    const flow = classifyFlow(u.state);
    flowCounts[flow] = (flowCounts[flow] || 0) + 1;
  }

  // D. Message count distribution
  const msgCountBuckets = { '1–2': 0, '3–5': 0, '6–10': 0, '11–20': 0, '21–50': 0, '50+': 0 };
  const dropOffAfterFirst = { yes: 0, no: 0 };
  let totalUserMessages = 0;
  let totalAssistantMessages = 0;
  let usersWithResets = 0;

  const shortConvos = []; // users who sent ≤2 messages total

  for (const u of users) {
    const msgs = msgsByUser[u.id] || [];
    const userMsgs = msgs.filter((m) => m.role === 'user');
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
    const systemMsgs = msgs.filter((m) => m.role === 'system');

    totalUserMessages += userMsgs.length;
    totalAssistantMessages += assistantMsgs.length;

    const hasReset = systemMsgs.some((m) => (m.message_text || '').includes('RESET'));
    if (hasReset) usersWithResets++;

    const n = userMsgs.length;
    if (n <= 2) {
      msgCountBuckets['1–2']++;
      shortConvos.push({ id: u.id, phone: u.phone_number, state: u.state, msgCount: n, channel: u.channel });
    } else if (n <= 5) msgCountBuckets['3–5']++;
    else if (n <= 10) msgCountBuckets['6–10']++;
    else if (n <= 20) msgCountBuckets['11–20']++;
    else if (n <= 50) msgCountBuckets['21–50']++;
    else msgCountBuckets['50+']++;

    // Drop-off: did user send only 1 message (bot greeted, user never replied again)?
    if (userMsgs.length <= 1 && assistantMsgs.length >= 1) {
      dropOffAfterFirst.yes++;
    } else {
      dropOffAfterFirst.no++;
    }
  }

  // E. Friction / feedback signals
  const triggerCounts = {};
  const ratingCounts = {};
  let implicitFrictionTotal = 0;
  let explicitFeedbackTotal = 0;

  for (const rows of Object.values(feedbackByUser)) {
    for (const f of rows) {
      if (f.source === 'implicit') {
        implicitFrictionTotal++;
        triggerCounts[f.trigger_type || 'unknown'] = (triggerCounts[f.trigger_type || 'unknown'] || 0) + 1;
      }
      if (f.source === 'explicit') {
        explicitFeedbackTotal++;
        ratingCounts[f.rating || 'no-rating'] = (ratingCounts[f.rating || 'no-rating'] || 0) + 1;
      }
    }
  }

  // F. Outcome distribution
  const outcomeCounts = {};
  for (const l of Object.values(leadByUser)) {
    outcomeCounts[l.outcome || 'unknown'] = (outcomeCounts[l.outcome || 'unknown'] || 0) + 1;
  }

  // G. Website builder funnel drop-off analysis
  const webStates = [
    'WEB_COLLECT_NAME', 'WEB_COLLECT_EMAIL', 'WEB_COLLECT_INDUSTRY',
    'WEB_COLLECT_SERVICES', 'WEB_COLLECT_COLORS', 'WEB_COLLECT_LOGO',
    'WEB_COLLECT_CONTACT', 'WEB_DOMAIN_CHOICE', 'WEB_CONFIRM',
    'WEB_GENERATING', 'WEB_PREVIEW', 'WEB_REVISIONS',
  ];
  const webFunnelCounts = {};
  for (const u of users) {
    if (u.state && u.state.startsWith('WEB_')) {
      webFunnelCounts[u.state] = (webFunnelCounts[u.state] || 0) + 1;
    }
  }

  // H. Detect correction loops (user sent "no", "wrong", "change" etc within a flow)
  const correctionKeywords = /\b(no|wrong|change|fix|not right|that's not|incorrect|redo|again|different)\b/i;
  let correctionLoopCount = 0;
  for (const u of users) {
    const msgs = msgsByUser[u.id] || [];
    const userTexts = msgs.filter((m) => m.role === 'user').map((m) => m.message_text || '');
    const hasCorrectionLoop = userTexts.filter((t) => correctionKeywords.test(t)).length >= 2;
    if (hasCorrectionLoop) correctionLoopCount++;
  }

  // I. Long-stale conversations (last updated > 7 days ago, still mid-flow)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let staleCount = 0;
  const staleStates = {};
  for (const u of users) {
    if (new Date(u.updated_at) < sevenDaysAgo && u.state !== 'SALES_CHAT' && u.state !== 'WELCOME') {
      staleCount++;
      staleStates[u.state] = (staleStates[u.state] || 0) + 1;
    }
  }

  // ── REPORT ────────────────────────────────────────────────────────────────

  console.log('\n# Pixie Conversation Analysis — Last 90 Users');
  console.log(`Analyzed: ${users.length} users | Generated: ${new Date().toISOString()}\n`);

  // Channel
  console.log('## 1. Channels');
  for (const [ch, n] of Object.entries(channels).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bar(n, users.length)} ${ch}: ${n} (${pct(n, users.length)})`);
  }

  // Flow
  console.log('\n## 2. Current Flow (where users are stuck / last seen)');
  for (const [flow, n] of Object.entries(flowCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bar(n, users.length)} ${flow}: ${n} (${pct(n, users.length)})`);
  }

  // Message volume
  console.log('\n## 3. Conversation Depth (user message count)');
  for (const [bucket, n] of Object.entries(msgCountBuckets)) {
    console.log(`  ${bar(n, users.length)} ${bucket} msgs: ${n} (${pct(n, users.length)})`);
  }
  console.log(`\n  Avg user turns per conversation: ${(totalUserMessages / users.length).toFixed(1)}`);
  console.log(`  Avg bot turns per conversation:  ${(totalAssistantMessages / users.length).toFixed(1)}`);

  // Drop-off
  console.log('\n## 4. Drop-off After First Bot Message');
  console.log(`  Ghost users (sent ≤1 msg then vanished): ${dropOffAfterFirst.yes} (${pct(dropOffAfterFirst.yes, users.length)})`);
  console.log(`  Engaged users:                           ${dropOffAfterFirst.no} (${pct(dropOffAfterFirst.no, users.length)})`);

  // Resets
  console.log('\n## 5. Frustration Signals');
  console.log(`  /reset events:             ${usersWithResets} users (${pct(usersWithResets, users.length)})`);
  console.log(`  Correction-loop detected:  ${correctionLoopCount} users (${pct(correctionLoopCount, users.length)})`);
  console.log(`  Implicit friction signals: ${implicitFrictionTotal} total`);
  if (Object.keys(triggerCounts).length) {
    for (const [t, n] of Object.entries(triggerCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    • ${t}: ${n}`);
    }
  }

  // Explicit feedback
  if (explicitFeedbackTotal > 0) {
    console.log('\n## 6. Explicit Ratings');
    for (const [r, n] of Object.entries(ratingCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${bar(n, explicitFeedbackTotal)} ${r}: ${n}`);
    }
  } else {
    console.log('\n## 6. Explicit Ratings\n  No explicit feedback in this cohort.');
  }

  // Lead outcomes
  if (Object.keys(outcomeCounts).length) {
    console.log('\n## 7. Lead Outcomes (from lead_summaries)');
    const total = Object.values(outcomeCounts).reduce((a, b) => a + b, 0);
    for (const [o, n] of Object.entries(outcomeCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${bar(n, total)} ${o}: ${n} (${pct(n, total)})`);
    }
  }

  // Website builder funnel
  if (Object.keys(webFunnelCounts).length) {
    console.log('\n## 8. Website Builder Funnel (active users per state)');
    const orderedWebStates = [
      ...webStates.filter((s) => webFunnelCounts[s]),
      ...Object.keys(webFunnelCounts).filter((s) => !webStates.includes(s)),
    ];
    const webTotal = Object.values(webFunnelCounts).reduce((a, b) => a + b, 0);
    for (const s of orderedWebStates) {
      if (!webFunnelCounts[s]) continue;
      console.log(`  ${bar(webFunnelCounts[s], webTotal)} ${s}: ${webFunnelCounts[s]}`);
    }
  }

  // Stale conversations
  console.log('\n## 9. Stale Mid-Flow Conversations (>7 days inactive, not in SALES_CHAT)');
  console.log(`  Count: ${staleCount} (${pct(staleCount, users.length)})`);
  if (staleCount > 0) {
    for (const [s, n] of Object.entries(staleStates).sort((a, b) => b[1] - a[1])) {
      console.log(`    • ${s}: ${n}`);
    }
  }

  // Short convo sample
  if (shortConvos.length > 0) {
    console.log('\n## 10. Short-Convo Sample (≤2 user messages — likely cold drop-offs)');
    console.log(`  Total: ${shortConvos.length}`);
    console.log('  Last 5 state snapshots:');
    for (const c of shortConvos.slice(-5)) {
      console.log(`    • state=${c.state || 'null'} | ch=${c.channel} | msgs=${c.msgCount}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Analysis failed:', err.message);
  process.exit(1);
});
