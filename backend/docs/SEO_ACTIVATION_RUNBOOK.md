# SEO Activation Runbook

Ordered sequence for bringing the SEO system from zero to full live operation.
Each step lists the exact env flags to set, the verification command, and the
expected outcome before moving to the next step. Do not skip steps.

---

## Prerequisites

- A current database backup or snapshot exists (Step 2 is advisory; this is mandatory).
- `backend/.venv` is active: `source .venv/bin/activate`
- All migrations up to date: check `supabase/migrations/` for any unapplied files.
- You can run `python -m seo.activation` to get a readiness report at any time:
  ```bash
  python -c "from seo.activation import activation_status; import json; print(json.dumps(activation_status(), indent=2))"
  ```

---

## Step 1 — Validate environment

**Flags to set:**
```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**Do NOT set yet:** `SEO_PRODUCTION_MODE`, `SEO_READ_ONLY_MODE`, `SEO_SCHEDULER_ENABLED`

**Verify:**
```bash
python -c "from seo.activation import validate_environment; r = validate_environment(); print(r['status'], r['detail'])"
```
Expected: `ok Required env vars present and consistent`

**Effect:** Confirms Supabase credentials are in place and no contradictory flag combinations exist.

---

## Step 2 — Confirm DB backup (human action required)

This step cannot be automated. Before any schema changes or persistence switch:

1. Create a Supabase snapshot or `pg_dump` backup.
2. Download and store the backup in a secure location.
3. Optionally run the restore-validation tool against the export:
   ```bash
   python scripts/seo_restore_validation.py --backup-dir /path/to/backup --verbose
   ```

**Verify:** Backup file exists and restore-validation reports `RESULT: PASSED`.

---

## Step 3 — Apply migrations (dry-run first)

If `scripts/seo_migrate.py` exists:
```bash
# Dry run (default — writes nothing)
python scripts/seo_migrate.py

# Apply
python scripts/seo_migrate.py --apply
```

Otherwise use the general importer for file → Supabase data:
```bash
# Dry run
PIXIE_DATA_DIR=.pixie_data python scripts/import_file_persistence_to_supabase.py

# Apply
PIXIE_DATA_DIR=.pixie_data python scripts/import_file_persistence_to_supabase.py --apply
```

**Verify:**
```bash
python -c "from seo.activation import check_migration_script; r = check_migration_script(); print(r['status'])"
```
Expected: `ok` or `warn` (never `blocked`)

---

## Step 4 — Verify schema / persistence layer

**Verify:**
```bash
python -c "from seo.activation import verify_schema_tables; r = verify_schema_tables(); print(r['status'], r['detail'])"
```
Expected: `ok persistence.table() callable; memory backend works`

---

## Step 5 — Import file data (if applicable)

If you have data in `.pixie_data/`:
```bash
PIXIE_DATA_DIR=.pixie_data python scripts/import_file_persistence_to_supabase.py --apply
```

Verify the import summary shows `migrated > 0` and `conflicts = 0` (or expected conflicts only).

---

## Step 6 — Enable durable persistence

**Flags to set:**
```env
PIXIE_PERSIST=supabase
```

**Verify:**
```bash
python -c "from seo.activation import check_durable_persistence; r = check_durable_persistence(); print(r['status'])"
```
Expected: `ok`

**Effect:** All persistence calls write to Supabase instead of in-memory. Required before the scheduler can maintain durable job state.

---

## Step 7 — Enable encryption requirement

**Flags to set:**
```env
GOOGLE_TOKEN_ENCRYPTION_KEY=<fernet-key>     # 32-byte URL-safe base64 key
SEO_REQUIRE_TOKEN_ENCRYPTION=1
```

Generate a key:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Verify:**
```bash
python -c "from seo.google.crypto import encryption_status, assert_token_encryption_ready; assert_token_encryption_ready(); print(encryption_status())"
```
Expected: `{'required': True, 'active': True, 'mode': 'fernet'}`

**Effect:** All new OAuth token seals use authenticated Fernet encryption. Obfuscation fallback is disabled. Startup fails fast if the key is missing.

---

## Step 8 — Scheduler: observe-only mode

**Flags to set:**
```env
SEO_SCHEDULER_ENABLED=1
SEO_SCHEDULER_OBSERVE_ONLY=1
```

Restart the backend server so the scheduler thread starts.

**Verify:**
```bash
# Check health endpoint (if running)
curl http://localhost:8000/seo/scheduler/health | python -m json.tool
```
Expected: `enabled: true`, `running_thread: true`

Also verify via activation:
```bash
python -c "from seo.activation import check_scheduler_observe_only; r = check_scheduler_observe_only(); print(r['status'])"
```
Expected: `ok Scheduler is in observe-only mode`

**Effect:** Scheduler thread runs and calls `due_fn()` to scan for ready jobs, but does NOT call `run_fn()`. No job side-effects occur. Use this to verify the scheduler can read from the DB without any execution risk.

---

## Step 9 — Dry-tick verification

With observe-only active, let the scheduler run for at least 2 intervals (default 60s each).

**Verify:** Scheduler logs show tick cycles with no errors. Health endpoint shows `last_successful_loop` updated, `claimed=0` (nothing executed).

---

## Step 10 — Mock-provider scheduler tick

**Flags to add (confirm these are set):**
```env
PIXIE_MODEL_MODE=fake          # ensures no live AI/LLM calls
```

Temporarily disable `SEO_SCHEDULER_OBSERVE_ONLY` to allow job execution:
```env
# Remove or set to 0:
SEO_SCHEDULER_OBSERVE_ONLY=0
```

Restart server. Let one full tick cycle run.

**Verify:** Health endpoint shows `completed > 0`, no `failed` spikes. Check logs for `job finished status='completed'` entries.

After verification, re-enable observe-only if you want to pause before live providers.

---

## Step 11 — Enable one internal workspace

**Flags to set:**
```env
SEO_ALLOWED_WORKSPACE_IDS=<your-internal-tenant-id>
```

**Verify:**
```bash
python -c "from seo.flags import workspace_allowed; print(workspace_allowed('<your-internal-tenant-id>'))"
```
Expected: `True`

Verify an external tenant is blocked:
```bash
python -c "from seo.flags import workspace_allowed; print(workspace_allowed('external_tenant'))"
```
Expected: `False`

**Effect:** Only the listed workspace(s) can trigger SEO writes. All other tenants receive a 403 from `guard_write()`. Expand this list incrementally.

---

## Step 12 — Billing visibility

**Flags to set:**
```env
CREDIT_SYSTEM_ENABLED=1
```

**Verify:**
```bash
python -c "from seo.activation import check_billing_visibility; r = check_billing_visibility(); print(r['status'])"
```
Expected: `ok`

**Effect:** Usage metering records events to the credit ledger. No enforcement yet — tenants are not blocked for over-limit usage. Monitor metering data before enforcing.

---

## Step 13 — Billing enforcement (advisory)

After verifying metering accuracy over 1–2 days:

**Flags to set:**
```env
BILLING_ENFORCEMENT_ENABLED=1
```

**Verify:**
```bash
python -c "from seo.activation import check_billing_enforcement; r = check_billing_enforcement(); print(r['status'])"
```
Expected: `ok`

**Effect:** Tenants exceeding plan limits are blocked at the credit enforcement layer.

---

## Step 14 — Enable live providers

**Flags to set:**
```env
SEO_PRODUCTION_MODE=1
# Ensure SEO_READ_ONLY_MODE is NOT set (or set to 0)
```

Also enable specific write gates as needed:
```env
SEO_GBP_WRITE_ENABLED=1          # if GBP write is required
SEO_WORDPRESS_WRITE_ENABLED=1    # if WordPress write is required
SEO_OUTREACH_SEND_ENABLED=1      # if outreach email sending is required
SEO_PDF_ENABLED=1                 # if PDF reports are required
```

**Verify:**
```bash
python -c "from seo.flags import live_provider_enabled; print(live_provider_enabled('*'))"
```
Expected: `True`

Full flag status:
```bash
python -c "from seo.flags import flags_status; import json; print(json.dumps(flags_status(), indent=2))"
```

**Effect:** `live_provider_enabled('*')` returns `True`. The scheduler will call live provider APIs (Google Search Console, ranking APIs, etc.). Charges may be incurred.

---

## Step 15 — Monitor

For 24–48 hours after live provider activation:

- Watch scheduler health: `completed`, `failed`, `quota_errors` counters.
- Watch credit metering: verify costs are within expected ranges.
- Watch logs for provider errors.

If anything is unexpected, see [SEO_ROLLBACK_RUNBOOK.md](SEO_ROLLBACK_RUNBOOK.md).

---

## Step 16 — Expand workspace allowlist

Once internal rollout is verified:
```env
SEO_ALLOWED_WORKSPACE_IDS=<t1>,<t2>,<t3>,...
```

Or to open to all workspaces, remove the variable entirely:
```env
# Unset SEO_ALLOWED_WORKSPACE_IDS
```

**Verify:**
```bash
python -c "from seo.flags import workspace_allowed; print(workspace_allowed('any_tenant'))"
```
Expected: `True` (when list is empty, all workspaces are allowed)

---

## Full activation_status() verification

At any point you can get a complete readiness report:
```bash
python -c "
from seo.activation import activation_status
import json
report = activation_status()
print(json.dumps(report, indent=2))
print('READY:', report['ready'])
"
```

A `ready: true` with `blocking_count: 0` means all prerequisites are met.
