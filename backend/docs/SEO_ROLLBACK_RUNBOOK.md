# SEO Rollback Runbook

Each rollback action is a targeted flag change. Stored data is NEVER deleted or
modified by any of these actions — flags only gate NEW writes/sends. All changes
are reversible by re-setting the flag.

---

## General rollback principle

- **Flag changes take effect on next request** (flags are read live, not cached).
- **Running scheduler jobs** that are already claimed continue to completion. The
  observe-only / scheduler-disabled flags prevent NEW job claims.
- **Stored data is preserved.** Disabling a flag does not delete any DB rows,
  credentials, or queued items.
- After any flag change, verify with `flags_status()`:
  ```bash
  python -c "from seo.flags import flags_status; import json; print(json.dumps(flags_status(), indent=2))"
  ```

---

## RB-1: Disable scheduler entirely

**When to use:** Scheduler is consuming unexpected resources, producing errors, or
you need to halt all background SEO processing.

**Action:**
```env
SEO_SCHEDULER_ENABLED=0     # or unset the variable
```

Restart the backend. The scheduler daemon thread will not start.

**Expected effect:**
- No new jobs are claimed or executed.
- Jobs already claimed and running at the time of restart may complete (they run
  in a daemon thread that stops when the process exits).
- All job rows remain in the DB with their current status.

**Confirmation:**
```bash
curl http://localhost:8000/seo/scheduler/health | python -m json.tool
# Expected: "enabled": false, "running_thread": false
```

**Data preserved:** All scheduler job rows, status history, and results are intact.

---

## RB-2: Disable one provider (observe-only)

**When to use:** A specific provider is returning errors, hitting quota limits, or
producing bad data, but you want to keep the scheduler running for other sources.

**Action:**
```env
SEO_SCHEDULER_OBSERVE_ONLY=1
```

Restart (or wait for hot-reload). The scheduler will continue ticking (scanning for
due jobs) but will NOT execute any run_fn callbacks.

**Expected effect:**
- `due_fn()` runs each tick — job rows are still polled.
- `run_fn()` is NOT called — no provider API calls, no job state updates.
- `claimed` counter stops incrementing. `completed` counter stays flat.

**Confirmation:**
```bash
python -c "from seo.flags import scheduler_observe_only; print(scheduler_observe_only())"
# Expected: True
```

**Data preserved:** All job rows remain exactly as they are. No writes occur.

**To restore:** Remove `SEO_SCHEDULER_OBSERVE_ONLY` or set to `0`.

---

## RB-3: Disable outreach email sending

**When to use:** Outreach emails are going to the wrong addresses, a campaign was
misconfigured, or you need to pause email sending immediately.

**Action:**
```env
SEO_OUTREACH_SEND_ENABLED=0     # or unset the variable
```

No restart required — flag is read per-request.

**Expected effect:**
- Calls to `guard_write("outreach_send", tenant_id)` raise HTTP 403.
- New email sends are blocked immediately.
- Emails that were already sent are not recalled (email is a one-way operation).
- Outreach campaign rows, contact lists, and draft content remain in the DB.

**Confirmation:**
```bash
python -c "from seo.flags import outreach_send_enabled; print(outreach_send_enabled())"
# Expected: False
```

**Data preserved:** All campaign rows, contacts, drafts, and send history are intact.

**To restore:** Set `SEO_OUTREACH_SEND_ENABLED=1`.

---

## RB-4: Disable GBP writes

**When to use:** GBP API is returning unexpected errors, a GBP write caused an
unintended change to a business profile, or you need to halt all GBP mutations.

**Action:**
```env
SEO_GBP_WRITE_ENABLED=0     # or unset the variable
```

No restart required.

**Expected effect:**
- Calls to `guard_write("gbp_write", tenant_id)` raise HTTP 403.
- GBP API write operations (update business info, post updates, respond to reviews)
  are blocked.
- GBP sync reads (pulling data from GBP) are NOT affected by this flag.
- GBP connection tokens and stored GBP data remain in the DB.

**Confirmation:**
```bash
python -c "from seo.flags import gbp_write_enabled; print(gbp_write_enabled())"
# Expected: False
```

**Data preserved:** GBP tokens, location data, stored review responses are all intact.

**To restore:** Set `SEO_GBP_WRITE_ENABLED=1`.

---

## RB-5: Disable WordPress writes

**When to use:** WordPress REST writes are failing, a content push caused an
unintended page change, or you need to pause all WP mutations.

**Action:**
```env
SEO_WORDPRESS_WRITE_ENABLED=0     # or unset the variable
```

No restart required.

**Expected effect:**
- Calls to `guard_write("wordpress_write", tenant_id)` raise HTTP 403.
- WordPress REST API write calls (publish posts, update pages, inject schema markup)
  are blocked.
- Crawl, audit, and read operations are unaffected.
- WP connection credentials and stored content remain in the DB.

**Confirmation:**
```bash
python -c "from seo.flags import wordpress_write_enabled; print(wordpress_write_enabled())"
# Expected: False
```

**Data preserved:** WP credentials, connection records, and content assets are intact.

**To restore:** Set `SEO_WORDPRESS_WRITE_ENABLED=1`.

---

## RB-6: Disable PDF generation

**When to use:** PDF renderer is failing, producing oversized reports, or consuming
excessive server resources.

**Action:**
```env
SEO_PDF_ENABLED=0     # or unset the variable
```

No restart required.

**Expected effect:**
- Calls to `guard_write("pdf", tenant_id)` raise HTTP 403.
- PDF generation and download endpoints return an error (403 or 503 depending on
  how the route uses `guard_write`).
- HTML report generation and all other report types are unaffected.
- Existing generated PDF files (if stored) are unaffected.

**Confirmation:**
```bash
python -c "from seo.flags import pdf_enabled; print(pdf_enabled())"
# Expected: False
```

**To restore:** Set `SEO_PDF_ENABLED=1`.

---

## RB-7: Disable SEO billing enforcement

**When to use:** A billing enforcement bug is incorrectly blocking valid SEO
operations, or you need to temporarily bypass limits during an investigation.

**Action:**
```env
BILLING_ENFORCEMENT_ENABLED=0     # or unset the variable
```

No restart required — credits.config reads live.

**Expected effect:**
- `credits.config.billing_enforcement_enabled()` returns `False`.
- Over-limit tenants are no longer blocked; they can continue using SEO features.
- Metering still records usage events (CREDIT_SYSTEM_ENABLED controls that).
- No usage records are deleted or modified.

**Confirmation:**
```bash
python -c "from credits import config; print(config.billing_enforcement_enabled())"
# Expected: False
```

**Data preserved:** All credit ledger entries, wallet balances, and usage records intact.

**To restore:** Set `BILLING_ENFORCEMENT_ENABLED=1`.

---

## RB-8: Disable live provider mode (return to mock)

**When to use:** Live provider calls are producing unexpected results or costs, or
you need to switch back to mock-provider mode for testing.

**Action:**
```env
SEO_PRODUCTION_MODE=0     # or unset the variable
```

No restart required.

**Expected effect:**
- `live_provider_enabled('*')` returns `False`.
- Provider calls that check `live_provider_enabled()` will use mock/fake responses.
- Scheduler jobs that depend on live providers will produce mock data.
- No provider API credentials are deleted.

**Confirmation:**
```bash
python -c "from seo.flags import live_provider_enabled; print(live_provider_enabled('*'))"
# Expected: False
```

**Data preserved:** All stored provider data, API keys, and job results are intact.

**To restore:** Set `SEO_PRODUCTION_MODE=1`.

---

## RB-9: Enable read-only mode (emergency freeze)

**When to use:** You need to immediately freeze ALL SEO writes across all tenants
and all write types. This is the broadest rollback available.

**Action:**
```env
SEO_READ_ONLY_MODE=1
```

No restart required. Takes effect on the next request.

**Expected effect:**
- `assert_write_allowed()` and `guard_write()` raise `FlagBlocked` / HTTP 403 for
  ALL write kinds and ALL tenants.
- This overrides every other write flag (outreach, GBP, WP, PDF, etc.) even if
  those flags are set to enabled.
- Read operations (crawl results, keyword data, rank history, analytics) continue
  to work normally.
- The scheduler may continue scanning (if `SEO_SCHEDULER_ENABLED=1`) but write-side
  operations will fail at the guard boundary.

**Confirmation:**
```bash
python -c "from seo.flags import read_only_mode; print(read_only_mode())"
# Expected: True
python -c "
from seo.flags import assert_write_allowed, FlagBlocked
try:
    assert_write_allowed('any_write', 'any_tenant')
    print('ERROR: should have raised')
except FlagBlocked as e:
    print('OK: blocked -', e)
"
```

**Data preserved:** All stored data is completely untouched.

**To restore:** Remove `SEO_READ_ONLY_MODE` or set to `0`. Then re-verify each
write type individually before re-enabling live providers.

---

## RB-10: Restrict to specific workspace(s) only

**When to use:** A bug or incident is tenant-specific; you want to restrict SEO
access to your internal workspace only while investigating.

**Action:**
```env
SEO_ALLOWED_WORKSPACE_IDS=<your-internal-tenant-id>
```

No restart required.

**Expected effect:**
- Only the listed tenant(s) can make SEO writes.
- All other tenants receive HTTP 403 from `guard_write()`.
- Existing data for blocked tenants is unaffected.

**To restore to full access:** Unset `SEO_ALLOWED_WORKSPACE_IDS` (empty = all allowed).

---

## Post-rollback checklist

After any rollback action:

1. Verify the flag took effect:
   ```bash
   python -c "from seo.flags import flags_status; import json; print(json.dumps(flags_status(), indent=2))"
   ```
2. Check scheduler health if it was running:
   ```bash
   curl http://localhost:8000/seo/scheduler/health | python -m json.tool
   ```
3. Confirm that stored data is intact (query a few rows from the affected table).
4. Document the rollback in the incident log with timestamp and reason.
5. When ready to re-activate, follow [SEO_ACTIVATION_RUNBOOK.md](SEO_ACTIVATION_RUNBOOK.md)
   starting from the step you rolled back to.
