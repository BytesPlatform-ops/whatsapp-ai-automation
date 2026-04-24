# Domain Renewal Flow — Plan

Status: **Not built yet.** Hold for future session.

## Problem

When Pixie registers a domain on behalf of a customer (NameSilo, "need" branch), it's registered for 1 year with `auto_renew = 0`. Currently:

- We show only the **first-year promotional price** in the domain search list (e.g. `.co` at $11.99/yr).
- We do NOT show the **renewal price** which can be 2-13× higher (e.g. `.shop` is $2.99 first year → $38.99 renewal).
- We have NO mechanism to notify the customer 11 months later that their domain is expiring.
- Result: customer's brand domain just dies one day with no warning.

## Goal

Transparent, opt-in renewal — no surprise charges, customer chooses to renew each year.

## Proposed Flow

```
─── Year 1 (registration) ──────────────────────────
Customer pays $199 + first-year domain ($X)
     ↓
NameSilo: registerDomain(auto_renew=0)
     ↓
Domain registered for 1 year
DB: domain_registrations row with expires_at = now + 365 days

─── ~30 days before expiry (and 7d, 1d) ────────────
Cron job runs daily, finds domains where expires_at
is approaching one of the reminder thresholds.
     ↓
For each domain:
  - Create a Stripe payment link for the renewal cost
    (NameSilo's renewal price — fetched live)
  - Send WhatsApp + email to the customer:
    "Heads up — mybiz.com renews on Apr 25, 2027.
     Renewal cost: $33.99.
     Pay here to extend 1 year → [Stripe link]
     Don't want to renew? Just ignore — domain
     will expire on its own."
  - Mark this reminder stage as sent (don't repeat)
     ↓
Customer pays (or doesn't)
     ↓
If paid → postPayment branch fires NameSilo domain.renew API
       → expires_at += 1 year
       → WhatsApp confirmation
If not paid → domain expires naturally, no charge to customer
```

## Implementation Pieces

### 1. Show renewal price in chat (small — 5 min)

**File**: `src/conversation/handlers/webDev.js` near where domain results render.

NameSilo already returns `renew` price (we have it as `r.renew`). Just append to the line when it differs from first-year:

```js
results.forEach((r, i) => {
  const renewNote = r.renew && parseFloat(r.renew) > parseFloat(r.price)
    ? ` (renews at $${r.renew})`
    : '';
  msg += `${i + 1}. ✅ ${r.domain} — $${r.price}/yr${renewNote}\n`;
});
```

Note: namesilo.js currently doesn't pass `r.renew` through to webDev — we'd need to extend `checkDomainAvailability` to include `renew` in the returned row.

### 2. DB migration 019 (small — 5 min)

```sql
-- src/db/migrations/019_domain_renewals.sql
CREATE TABLE IF NOT EXISTS domain_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  site_id UUID REFERENCES generated_sites(id) ON DELETE SET NULL,
  domain VARCHAR(253) NOT NULL,
  registrar VARCHAR(32) DEFAULT 'namesilo',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_renewal_paid_at TIMESTAMPTZ,
  reminders_sent JSONB DEFAULT '{}',  -- e.g. {"30d": "2027-03-26T...", "7d": null, "1d": null}
  status VARCHAR(32) DEFAULT 'active',  -- active | expired | manually_cancelled
  CONSTRAINT unique_active_domain UNIQUE (domain, status)
);

CREATE INDEX IF NOT EXISTS idx_domain_expiring
  ON domain_registrations(expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_domain_user
  ON domain_registrations(user_id, status);
```

### 3. Insert registration row when domain is registered (small — 15 min)

**File**: `src/payments/postPayment.js` — branch 4b (new-domain flow).

After `purchaseAndConfigureDomain()` succeeds:

```js
const { supabase } = require('../config/database');
const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 365);
await supabase.from('domain_registrations').insert({
  user_id: p.user_id,
  site_id: site?.id || null,
  domain: selectedDomain,
  registrar: 'namesilo',
  expires_at: expiresAt.toISOString(),
});
```

### 4. Renewal reminder cron job (medium — 1.5 hrs)

**New file**: `src/jobs/domainRenewalReminders.js`

```js
const REMINDER_STAGES = [
  { key: '30d', daysBefore: 30 },
  { key: '14d', daysBefore: 14 },
  { key: '7d',  daysBefore: 7  },
  { key: '1d',  daysBefore: 1  },
];

async function runDomainRenewalReminders() {
  // 1. Query domain_registrations where status='active' and
  //    any reminder stage is due (expires_at in the threshold window).
  // 2. For each due reminder:
  //    a. Fetch live renewal price from NameSilo for the TLD
  //    b. Create Stripe payment link:
  //       service_type='domain_renewal',
  //       metadata={ domain, user_id, registration_id, registrar }
  //    c. Send WhatsApp + email with link + expiry date + amount
  //    d. Update reminders_sent to mark this stage as sent
  // 3. After expires_at < now, mark status='expired'
}

function startDomainRenewalReminders() {
  setInterval(runDomainRenewalReminders, 24 * 60 * 60 * 1000);  // daily
  runDomainRenewalReminders();
}
```

Hook into `src/index.js` startup like the other schedulers.

### 5. Renewal payment branch in postPayment.js (small — 30 min)

When a Stripe payment with `service_type='domain_renewal'` confirms:

```js
} else if (p.service_type === 'domain_renewal') {
  const domain = p.metadata?.domain;
  const namesilo = require('../integrations/namesilo');
  const result = await namesilo.renewDomain(domain, 1);  // NEEDS new helper
  if (result.success) {
    // Update DB row
    await supabase
      .from('domain_registrations')
      .update({
        expires_at: new Date(Date.now() + 365*24*60*60*1000).toISOString(),
        last_renewal_paid_at: new Date().toISOString(),
        reminders_sent: {},  // reset for next year
      })
      .eq('id', p.metadata.registration_id);
    // Confirm to customer
    await sendTextMessage(targetPhone,
      `✅ *${domain}* renewed for another year! ` +
      `New expiry: ${newExpiry}. I'll remind you again in ~11 months.`);
  } else {
    // Manual fallback if NameSilo renew API fails
    await sendTextMessage(targetPhone,
      `Got your renewal payment for *${domain}* — our team is processing ` +
      `it now and will confirm within a few hours.`);
  }
}
```

### 6. Add `renewDomain()` helper in `namesilo.js` (small — 15 min)

NameSilo API has `renewDomain` endpoint. Add a thin wrapper:

```js
async function renewDomain(domain, years = 1) {
  const reply = await nsRequest('renewDomain', {
    domain: domain.toLowerCase().trim(),
    years: String(years),
  });
  return {
    success: true,
    domain,
    chargedAmount: reply.amount || '',
    orderId: reply.order_number || '',
  };
}
```

## Scope Summary

| Piece | LOC | Time |
|---|---|---|
| 1. Show renewal price in chat | ~10 | 5 min |
| 2. Migration 019 | ~25 | 5 min |
| 3. Insert registration row | ~30 | 15 min |
| 4. Reminder cron job | ~150 | 1.5 hrs |
| 5. Renewal payment branch | ~80 | 30 min |
| 6. NameSilo `renewDomain` helper | ~25 | 15 min |
| **Total** | **~320** | **~2.5 hrs** |

## Edge Cases to Handle

- **Customer's NameSilo balance insufficient** when renewal fires → send email "renewal failed, manual top-up needed" (already covered by existing balance pre-flight in `purchaseAndConfigureDomain`, just needs analog in `renewDomain`).
- **Customer abandons** — domain expires, status → 'expired'. Don't keep sending reminders for expired domains.
- **Customer wants to cancel before expiry** — admin tool to mark `status='manually_cancelled'` + skip reminders.
- **Customer transfers domain out** — once it's not under our NameSilo account, status → 'manually_cancelled' or 'transferred'. Same effect: stop reminders.
- **Reminder spam protection** — `reminders_sent` JSONB tracks which stages have fired. Cron skips already-sent stages.
- **NameSilo renew API failure mid-flow after Stripe captured payment** — payment succeeded but renewal failed: queue manual reconciliation, refund or retry within 24h.

## When to Build

This is non-blocking for the launch. The first customers won't hit renewal for 11 months, so we have plenty of runway. Suggested order:

1. **Now** (next session): Phase 1 only — show renewal price in chat (5 min). Customers know what they're getting into.
2. **Within 6 months**: Build the full reminder + renewal payment + NameSilo renew flow (Phases 2-6).
3. **At month 11** (latest): Must be live before the first batch of customers hit renewal.

## Open Questions

1. **Reminder cadence**: 30 / 14 / 7 / 1 days? Or fewer (just 30 + 7)? Three feels balanced.
2. **Reminder channel**: WhatsApp + email both, or one? WhatsApp may have 24h window issues — email is the reliable backbone.
3. **Auto-renewal opt-in**: Should we offer "auto-renew with my card on file" as a paid premium? Easier for the customer, but adds CC vault complexity.
4. **Discount for renewal-on-time**: Reward early renewals? Probably not worth the complexity.
5. **What happens for "own domain" customers?** Their renewal is at THEIR registrar, not us — we don't track those. Should we offer a reminder service anyway as a value-add? Probably out of scope.
