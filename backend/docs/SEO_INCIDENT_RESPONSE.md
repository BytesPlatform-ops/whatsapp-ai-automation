# SEO Incident Response

---

## Severity levels

| Severity | Definition | Response time | Escalation |
|---|---|---|---|
| P0 — Critical | Data loss risk, production down, live provider sending unauthorized data/emails, billing system charging incorrectly | Immediate (< 15 min) | On-call engineer + product lead |
| P1 — High | Scheduler completely stalled > 30 min, encryption broken in production, all writes blocked unexpectedly | < 1 hour | On-call engineer |
| P2 — Medium | One provider consistently failing, quota errors blocking a subset of tenants, PDF generation broken | < 4 hours | Assigned engineer |
| P3 — Low | Advisory warnings in activation report, non-critical write type blocked, stale lock recovery rate spike | Next business day | Backlog |

---

## Escalation contacts

_(Fill these in for your deployment)_

- On-call engineer: `<name>`
- Product lead: `<name>`
- Supabase support: https://supabase.com/support
- Google Cloud Console (for GSC API issues): https://console.cloud.google.com

---

## P0 — Critical incidents

### P0-A: Unauthorized email sends (outreach system)

**Indicators:** Outreach emails sent to non-test recipients without explicit campaign
approval; complaints from email recipients; unexpected `email_send` metering spikes.

**Immediate action (< 5 min):**
```env
SEO_OUTREACH_SEND_ENABLED=0
```
This blocks all new sends. No restart required.

**Verify stop:**
```bash
python -c "from seo.flags import outreach_send_enabled; print(outreach_send_enabled())"
# Expected: False
```

**Then:**
1. Set `SEO_SCHEDULER_OBSERVE_ONLY=1` to halt all scheduler execution.
2. Review `seo_outreach_campaigns` and `seo_outreach_send_log` tables for scope.
3. Identify the campaign(s) involved. Note `campaign_id`, `tenant_id`, `sent_at`.
4. Contact affected email recipients if personally identifiable.
5. Conduct root cause analysis before re-enabling `SEO_OUTREACH_SEND_ENABLED`.

**Data impact:** Emails already sent cannot be recalled. Stored campaign rows and
contact lists are untouched.

---

### P0-B: Potential data loss

**Indicators:** Supabase queries returning unexpected empty results; rows that
should exist are missing; `migration mismatch` errors suggest schema was altered.

**Immediate action:**
```env
SEO_READ_ONLY_MODE=1
```
This freezes all writes across all tenants. No restart required.

**Then:**
1. Do NOT run any migration or import scripts until the cause is understood.
2. Check recent Supabase activity logs for unexpected DELETE or DROP operations.
3. If rows are genuinely missing: restore from the most recent backup.
   - Run restore validation first: `python scripts/seo_restore_validation.py --backup-dir /path`
   - See [SEO_ROLLBACK_RUNBOOK.md](SEO_ROLLBACK_RUNBOOK.md) RB-9 for full freeze procedure.
4. After restore: validate relationships and token integrity before re-enabling.

---

### P0-C: Billing system incorrect charges

**Indicators:** Tenants billed for operations they did not perform; credit balance
dropping faster than expected; `enforce()` calls recording incorrect amounts.

**Immediate action:**
```env
BILLING_ENFORCEMENT_ENABLED=0
```
This disables hard limit enforcement. Metering continues but blocks are lifted.

**Then:**
1. Audit `credits/ledger` and `credits/reservations` for the affected tenant(s).
2. Check if `operation_id` uniqueness is intact (duplicate charges would have the
   same `operation_id`).
3. Determine if the issue is in `metering_search.py` unit costs or in
   `credits/enforcement.py` logic.
4. Correct the data before re-enabling enforcement.

---

## P1 — High incidents

### P1-A: Scheduler stalled > 30 min

See [SEO_OPERATIONS_RUNBOOK.md](SEO_OPERATIONS_RUNBOOK.md) F-1.

**Quick triage:**
```bash
curl http://localhost:8000/seo/scheduler/health | python -m json.tool
```
If `jobs_running_count == max_workers` and hasn't changed in 10 min → thread pool saturated.

**Quick fix:** Restart backend. Stuck jobs will be re-claimed after lock TTL expires
(default 300s = 5 min from when they were claimed).

---

### P1-B: Encryption broken in production

See [SEO_OPERATIONS_RUNBOOK.md](SEO_OPERATIONS_RUNBOOK.md) F-3.

**Quick check:**
```bash
python -c "from seo.google.crypto import encryption_status; print(encryption_status())"
```

If `mode != fernet` and `required = True`: new token seals will raise. Existing
sealed tokens are unaffected.

**Quick stop-gap:** `SEO_READ_ONLY_MODE=1` prevents any new tokens from being written
in a broken state. Gives time to fix the key configuration.

---

### P1-C: All SEO writes blocked unexpectedly

**Quick triage:**
```bash
python -c "from seo.flags import flags_status; import json; print(json.dumps(flags_status(), indent=2))"
```

Check in this order:
1. `read_only_mode: true`? → Unset `SEO_READ_ONLY_MODE`.
2. `all_workspaces_allowed: false` and tenant missing? → Update `SEO_ALLOWED_WORKSPACE_IDS`.
3. Specific write flag off? → Enable the relevant flag.
4. FastAPI returning 403 with `"error": "seo_write_blocked"`? → Check `detail.reason` for the specific flag.

---

## P2 — Medium incidents

### P2-A: One provider consistently failing

**Triage:** Check scheduler health for `quota_errors`; check app logs for the specific
provider error.

**Options (from least to most disruptive):**
1. Reduce concurrency for that provider's jobs: lower `SEO_SCHEDULER_MAX_CONCURRENCY`.
2. Wait for quota window to reset (typically 1 hour or 24 hours for Google APIs).
3. Set observe-only to pause all execution while the provider recovers:
   `SEO_SCHEDULER_OBSERVE_ONLY=1`
4. If the provider is permanently broken: disable only its job source via the
   scheduler registry (requires a code change to mark that source as disabled).

---

### P2-B: Quota errors blocking subset of tenants

**Triage:** Identify which tenant(s) are generating the most provider calls:
```sql
-- In Supabase SQL editor (seo_scheduler_jobs table):
SELECT data->>'tenant_id' AS tenant, COUNT(*) AS job_count
FROM seo_scheduler_jobs
WHERE data->>'status' IN ('queued', 'claimed')
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

**Options:**
1. Add the heavy tenant to a separate rate-limited allowlist.
2. Lower `SEO_SCHEDULER_BATCH_SIZE` to reduce jobs per tick.
3. For immediate relief: `SEO_SCHEDULER_OBSERVE_ONLY=1`.

---

### P2-C: PDF generation broken

```env
SEO_PDF_ENABLED=0
```

HTML reports continue to work. Investigate the PDF renderer separately.

---

## P3 — Low incidents

### P3-A: Activation report shows warnings

```bash
python -c "
from seo.activation import activation_status
import json
report = activation_status()
for s in report['steps']:
    if s['status'] == 'warn':
        print('[WARN]', s['step'], ':', s['detail'])
"
```

Warnings are non-blocking. Address them in the next maintenance window.

---

## Post-incident steps (all severities)

1. **Document the incident:** timestamp, symptom, flags changed, data impact.
2. **Verify data integrity:** run restore-validation against a recent backup export.
3. **Restore normal operation:** follow [SEO_ACTIVATION_RUNBOOK.md](SEO_ACTIVATION_RUNBOOK.md)
   starting from the step you rolled back to.
4. **Review flags:** confirm final flag state with `flags_status()`.
5. **Update monitoring:** if the incident exposed a gap in alerting, add a new metric check.
6. **Schedule post-mortem** for P0/P1 incidents within 48 hours.
