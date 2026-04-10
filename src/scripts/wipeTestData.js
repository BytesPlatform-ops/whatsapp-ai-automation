/* eslint-disable no-console */
/**
 * One-shot cleanup script for test/dev data.
 *
 *   1. Deactivates every active Stripe payment link (so none can be paid
 *      later and trigger a ghost receipt).
 *   2. Wipes all customer tables in foreign-key-safe order:
 *        payments -> lead_summaries -> meetings -> website_audits
 *        -> generated_sites -> conversations -> users
 *      The RAG knowledge base (knowledge_chunks) is left untouched.
 *
 * Run with:
 *   node src/scripts/wipeTestData.js
 *
 * Add --dry-run to print counts without making any changes.
 */

require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');

const { supabase } = require('../config/database');
const { env } = require('../config/env');

function log(msg) {
  console.log(`[WIPE] ${msg}`);
}

async function deactivateStripeLinks() {
  if (!env.stripe?.secretKey) {
    log('No STRIPE_SECRET_KEY — skipping Stripe cleanup');
    return { deactivated: 0, skipped: 0 };
  }

  const Stripe = require('stripe');
  const stripe = new Stripe(env.stripe.secretKey);

  let deactivated = 0;
  let skipped = 0;
  let startingAfter;

  log('Fetching active payment links from Stripe...');

  while (true) {
    const params = { active: true, limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;

    const page = await stripe.paymentLinks.list(params);
    if (!page.data.length) break;

    for (const link of page.data) {
      if (DRY_RUN) {
        log(`[DRY-RUN] Would deactivate link ${link.id} (${link.url})`);
        skipped++;
        continue;
      }
      try {
        await stripe.paymentLinks.update(link.id, { active: false });
        deactivated++;
        log(`Deactivated ${link.id}`);
      } catch (err) {
        skipped++;
        log(`Failed to deactivate ${link.id}: ${err.message}`);
      }
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return { deactivated, skipped };
}

async function wipeTable(table) {
  const { count, error: countError } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (countError) {
    log(`Skipping ${table}: ${countError.message}`);
    return 0;
  }

  const rowCount = count || 0;
  if (rowCount === 0) {
    log(`${table}: already empty`);
    return 0;
  }

  if (DRY_RUN) {
    log(`[DRY-RUN] Would delete ${rowCount} row(s) from ${table}`);
    return rowCount;
  }

  // Supabase requires a filter on delete. Match any id (all rows have one).
  const { error: delError } = await supabase
    .from(table)
    .delete()
    .not('id', 'is', null);

  if (delError) {
    log(`Failed to wipe ${table}: ${delError.message}`);
    return 0;
  }

  log(`Deleted ${rowCount} row(s) from ${table}`);
  return rowCount;
}

async function wipeDatabase() {
  // Order matters: children before parents, even though most have ON DELETE
  // CASCADE. Being explicit is safer and gives accurate counts per table.
  const tables = [
    'payments',
    'lead_summaries',
    'meetings',
    'website_audits',
    'generated_sites',
    'conversations',
    'users',
  ];

  const results = {};
  for (const table of tables) {
    results[table] = await wipeTable(table);
  }
  return results;
}

async function main() {
  log(DRY_RUN ? 'Running in DRY-RUN mode — no changes will be made' : 'Running in LIVE mode — changes WILL be made');
  log('');

  const stripeResult = await deactivateStripeLinks();
  log('');
  log(`Stripe: deactivated ${stripeResult.deactivated}, skipped ${stripeResult.skipped}`);
  log('');

  const dbResults = await wipeDatabase();
  log('');
  log('Database summary:');
  for (const [table, count] of Object.entries(dbResults)) {
    log(`  ${table.padEnd(20)} ${count}`);
  }
  log('');
  log(DRY_RUN ? 'DRY-RUN complete. Re-run without --dry-run to actually wipe.' : 'Wipe complete. Restart the bot to clear in-memory state.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[WIPE] Fatal error:', err);
    process.exit(1);
  });
