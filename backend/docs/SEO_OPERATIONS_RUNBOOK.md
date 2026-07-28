# SEO Operations Runbook (Day-2 Ops)

Routine procedures for operating the SEO system after initial activation.

---

## Health endpoints

### Scheduler health
```
GET /seo/scheduler/health
```
Returns the scheduler's current state. Key fields:

| Field | Meaning |
|---|---|
| `enabled` | True when SEO_SCHEDULER_ENABLED=1 and not under pytest |
| `running_thread` | True when the daemon thread is alive |
| `last_heartbeat` | Timestamp of last scheduler loop completion |
| `last_successful_loop` | Timestamp of last loop that processed work without error |
| `claimed` | Cumulative jobs picked up (since last restart) |
| `completed` | Cumulative jobs finished successfully |
| `failed` | Cumulative job failures |
| `retried` | Cumulative retry attempts |
| `quota_errors` | Cumulative provider quota/rate errors |
| `jobs_running` | List of job IDs currently executing |
| `encryption` | Crypto status (mode, required, active) |

Healthy state: `enabled=true`, `running_thread=true`, `failed` not growing faster
than `completed`, `last_successful_loop` recent (within 2× `interval_s`).

### Encryption health
```
GET /seo/health/encryption
```
or inline in scheduler health under `"encryption"`.

Fields: `required`, `active`, `mode` (`fernet` / `insecure_obfuscation` / `unavailable`).

### Persistence health (backend-wide)
```
python -c "import persistence; import json; print(json.dumps(persistence.status(), indent=2))"
```

### SEO flag status
```
GET /seo/flags/status
```
or:
```bash
python -c "from seo.flags import flags_status; import json; print(json.dumps(flags_status(), indent=2))"
```

### Full activation readiness report
```bash
python -c "
from seo.activation import activation_status
import json
report = activation_status()
for s in report['steps']:
    mark = 'OK' if s['status'] == 'ok' else ('WARN' if s['status'] == 'warn' else 'BLOCK')
    print(f'[{mark}] {s[\"step\"]}: {s[\"detail\"][:80]}')
print()
print('READY:', report['ready'], '| blocking:', report['blocking_count'], '| warn:', report['warn_count'])
"
```

---

## Metrics to watch

| Metric | Source | Alert threshold |
|---|---|---|
| Scheduler `failed` rate | `/seo/scheduler/health` | > 20% of `claimed` |
| `quota_errors` | `/seo/scheduler/health` | > 5 in a 5-min window |
| `last_successful_loop` age | `/seo/scheduler/health` | > 2× `interval_s` |
| `jobs_running_count` | `/seo/scheduler/health` | > `max_workers` (stuck jobs) |
| Outreach send errors | App logs `seo_outreach_send` | Any repeated 4xx/5xx |
| GBP write errors | App logs `seo_gbp_sync` | Any repeated 4xx/5xx |
| Encryption mode | `/seo/health/encryption` | `mode != fernet` in production |

---

## Common failures and responses

### F-1: Scheduler stalled (last_heartbeat is old)

**Symptom:** `/seo/scheduler/health` shows `last_heartbeat` more than 5 minutes old,
`running_thread=true` but `last_successful_loop` not updating.

**Cause candidates:**
- Deadlock in a job's `run_fn` holding a lock the scheduler loop needs.
- Thread pool saturated with slow/hung jobs (all `max_workers` slots occupied).
- Database connection pool exhausted (every job is waiting for a DB connection).
- Backoff loop from repeated errors (check `consecutive_loop_errors` — not exposed
  directly, but `failed` counter growing rapidly with no `completed` is a signal).

**Response:**
1. Check `jobs_running` — are the same job IDs present across multiple health polls?
   That indicates hung jobs.
2. Check app logs for the stuck job IDs:
   ```
   grep "SeoScheduler: executing job" app.log | tail -50
   ```
3. If jobs are stuck: restart the backend (daemon thread is killed on process exit).
   Jobs will be re-claimed on next scheduler start (stale lock reclaim after TTL).
4. If the DB is overloaded: reduce `SEO_SCHEDULER_MAX_CONCURRENCY` (default 4).
5. If errors are repeating: set `SEO_SCHEDULER_OBSERVE_ONLY=1` to stop execution
   while you investigate. See [SEO_ROLLBACK_RUNBOOK.md](SEO_ROLLBACK_RUNBOOK.md) RB-2.

**Confirm fix:** `last_successful_loop` starts updating; `failed` rate drops.

---

### F-2: Provider quota errors

**Symptom:** `quota_errors` counter growing, logs show `rate limit` or `quota exceeded`
from a provider (Google Search Console, ranking API, etc.).

**Cause:** Too many parallel jobs hitting the same provider API within the rate window.

**Response:**
1. Reduce concurrency: `SEO_SCHEDULER_MAX_CONCURRENCY=1` or `2`.
2. Increase interval: `SEO_SCHEDULER_INTERVAL_SECONDS=300` (5 minutes between ticks).
3. Check if a single tenant has many queued jobs all targeting the same provider.
4. Contact the provider's support if you are within published rate limits (may be
   an account-level quota, not a rate limit).
5. For immediate relief: `SEO_SCHEDULER_OBSERVE_ONLY=1` stops all execution.

**Confirm fix:** `quota_errors` rate drops; `completed` resumes growing.

---

### F-3: Token encryption not ready

**Symptom:** Health endpoint shows `encryption.mode = insecure_obfuscation` or
`encryption.mode = unavailable`; `SEO_REQUIRE_TOKEN_ENCRYPTION=1` is set but
new OAuth token seals are failing.

**Cause:** `GOOGLE_TOKEN_ENCRYPTION_KEY` is missing, invalid, or the `cryptography`
package is not installed.

**Response:**
1. Verify the key is set:
   ```bash
   python -c "import os; print('key present:', bool(os.environ.get('GOOGLE_TOKEN_ENCRYPTION_KEY')))"
   ```
2. Verify the key is a valid Fernet key (URL-safe base64, 32 bytes):
   ```bash
   python -c "
   from cryptography.fernet import Fernet
   import os
   key = os.environ.get('GOOGLE_TOKEN_ENCRYPTION_KEY', '')
   try:
       Fernet(key.encode())
       print('key valid')
   except Exception as e:
       print('key invalid:', e)
   "
   ```
3. Verify `cryptography` is installed:
   ```bash
   python -c "from cryptography.fernet import Fernet; print('ok')"
   ```
4. If the key needs to be rotated: generate a new key and re-run token sealing
   on existing credentials (requires a one-off migration script).
5. If you cannot fix immediately: set `SEO_READ_ONLY_MODE=1` to block new token
   writes until encryption is restored (existing sealed tokens remain readable).

**Confirm fix:**
```bash
python -c "from seo.google.crypto import encryption_status; print(encryption_status())"
# Expected: {'required': True, 'active': True, 'mode': 'fernet'}
```

---

### F-4: Migration mismatch (schema error on query)

**Symptom:** Supabase queries fail with column-not-found or table-not-found errors
in scheduler jobs or API routes.

**Cause:** A migration was applied to one environment but not another, or the file
persistence schema diverged from the Supabase schema.

**Response:**
1. Check migration files in `supabase/migrations/` — are all files applied?
2. Dry-run the migration script to see what would change:
   ```bash
   python scripts/seo_migrate.py      # dry run (if the script exists)
   ```
3. If a table is genuinely missing: apply the migration to Supabase via the
   Supabase CLI or Dashboard.
4. If data was already written in the wrong schema: restore from backup (see
   [SEO_ROLLBACK_RUNBOOK.md](SEO_ROLLBACK_RUNBOOK.md)) and re-apply migrations.
5. While investigating: set `SEO_SCHEDULER_OBSERVE_ONLY=1` to prevent further
   failed writes.

**Never modify production schema manually** without a migration file.

---

### F-5: Workspace blocked unexpectedly

**Symptom:** A legitimate tenant receives HTTP 403 with `{"error": "seo_write_blocked"}`,
but `SEO_READ_ONLY_MODE` is not set.

**Cause:** The tenant ID is not in `SEO_ALLOWED_WORKSPACE_IDS`.

**Response:**
1. Check current allowlist:
   ```bash
   python -c "from seo.flags import _csv; print(_csv('SEO_ALLOWED_WORKSPACE_IDS'))"
   ```
2. Add the tenant to the list (comma-separated, no spaces):
   ```env
   SEO_ALLOWED_WORKSPACE_IDS=existing_tenant,new_tenant_id
   ```
3. To open to all: unset `SEO_ALLOWED_WORKSPACE_IDS`.
4. Flag is read live — no restart required.

---

## Routine maintenance

### Weekly scheduler health review
```bash
curl http://localhost:8000/seo/scheduler/health | python -m json.tool
```
- `failed / claimed` ratio should be < 5%.
- `quota_errors` should be near zero.
- `stale_lock_recoveries` > 0 is normal (stale locks from crashes reclaim safely).

### Monthly encryption key rotation
1. Generate a new Fernet key.
2. Add the new key as `GOOGLE_TOKEN_ENCRYPTION_KEY` in the next deploy.
3. Existing `fer:` tokens sealed with the old key must be re-sealed:
   - Fetch each token, unseal with old key, re-seal with new key, upsert.
   - This is a one-off migration; script it before switching the key in production.
4. After migration: swap to the new key and verify `encryption_status()`.

### Adding a new workspace to the allowlist
```env
SEO_ALLOWED_WORKSPACE_IDS=<existing>,<new_tenant_id>
```
Verify:
```bash
python -c "from seo.flags import workspace_allowed; print(workspace_allowed('<new_tenant_id>'))"
```

### Disabling a workspace
Remove its ID from `SEO_ALLOWED_WORKSPACE_IDS`. The workspace's stored data is
not affected — only new write requests are blocked.
