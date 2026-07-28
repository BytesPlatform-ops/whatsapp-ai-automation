# SEO Security Audit — Parts 27 & 34
**Date:** 2026-07-29  
**Auditor:** Backend security regression audit (automated + manual review)  
**Scope:** `backend/seo/` — all URL-consuming paths, tenant isolation, OAuth, token
encryption, output escaping, suppression, billing idempotency, scheduler races.  
**Test file:** `tests/seo/test_security_audit_final.py`  
**Result:** 92/92 tests pass. No CRITICAL or HIGH bugs found.

---

## Findings Table

| # | Area | Finding | Severity | File:Line | Status |
|---|------|---------|----------|-----------|--------|
| F1 | SSRF | `assert_safe_url` blocks private IPv4 (10.x, 172.16.x, 192.168.x, 127.0.0.1) with correct `REASON_BLOCKED_PRIVATE_IP` category | PASS | `seo/url_guard.py:~60` | No issue |
| F2 | SSRF | AWS/GCP metadata endpoint (169.254.169.254) blocked before DNS resolution | PASS | `seo/url_guard.py:~70` | No issue |
| F3 | SSRF | IPv6 loopback `[::1]` blocked | PASS | `seo/url_guard.py:~65` | No issue |
| F4 | SSRF | `localhost` hostname blocked at string-check level (before DNS) | PASS | `seo/url_guard.py:~55` | No issue |
| F5 | SSRF | Non-`http/https` schemes (`ftp://`, `file://`, `javascript:`) blocked with `REASON_BAD_SCHEME` | PASS | `seo/url_guard.py:~40` | No issue |
| F6 | SSRF | Embedded credentials (`user:pass@`) blocked with `REASON_EMBEDDED_CREDENTIALS` | PASS | `seo/url_guard.py:~48` | No issue |
| F7 | SSRF | Non-standard ports (e.g. 8080) blocked with `REASON_BLOCKED_PORT` | PASS | `seo/url_guard.py:~52` | No issue |
| F8 | DNS rebinding | Public hostname resolving to private IP (`getaddrinfo` patched) → blocked; reason does NOT leak the resolved IP | PASS | `seo/url_guard.py:~85`, `seo/mode_external/ssrf.py:~45` | No issue |
| F9 | Redirect revalidation | `safe_fetch` revalidates every redirect target; redirect to 192.168.x → `UrlRejected` | PASS | `seo/url_guard.py:~110` | No issue |
| F10 | SSRF — link tracking | `verify_placement` calls `assert_safe_url` BEFORE any network fetch; private `source_url` returns `{"status": "error", "detail": {"reason": "unsafe_url: ..."}}` without calling the fetcher | PASS (design note below) | `seo/outreach/link_tracking.py:222-225` | No issue |
| F11 | SSRF — fix verify | `verify_fix` wraps the SSRF-safe `fetch_full` fetcher; `UrlRejected` from the injected fetcher is caught and surfaced as `remaining_evidence["error"] = "fetch_failed"` (not re-raised) | PASS (design note below) | `seo/fix_verify.py:160-172` | No issue |
| F12 | Zero credits on block | When `assert_safe_url` raises, no metering call is made | PASS | `seo/url_guard.py`, `seo/metering_search.py` | No issue |
| F13 | Zero credits — link verify | SSRF-blocked `verify_placement` never reaches the metering call | PASS | `seo/outreach/link_tracking.py:228-230` | No issue |
| F14 | Tenant spoofing | `X-Pixie-Tenant` header overrides any `tenant_id` in request body | PASS | `seo/tenant.py:74-82`, `seo/agent_routes.py:82` | No issue |
| F15 | Tenant spoofing | Cross-tenant audit read: Tenant B cannot access Tenant A's audit_id → 404 | PASS | `seo/audit_agent.py:167-169` | No issue |
| F16 | Cross-workspace — keywords | Tenant B cannot read or mutate Tenant A keywords/projects | PASS | `seo/search_stores.py` (`_AutoRepo`) | No issue |
| F17 | Cross-workspace — rank snapshots | Tenant B cannot read Tenant A rank snapshots | PASS | `seo/search_stores.py` | No issue |
| F18 | Cross-workspace — competitors | Tenant B cannot read Tenant A competitors | PASS | `seo/search_stores.py` | No issue |
| F19 | Cross-workspace — opportunities | Tenant B cannot read Tenant A opportunities | PASS | `seo/search_stores.py` | No issue |
| F20 | Cross-workspace — content briefs | Tenant B cannot read Tenant A briefs | PASS | `seo/search_stores.py` | No issue |
| F21 | Cross-workspace — alerts | Tenant B cannot read Tenant A alerts | PASS | `seo/search_stores.py` | No issue |
| F22 | Cross-workspace — google connections | Tenant B cannot read Tenant A Google OAuth connections | PASS | `seo/search_stores.py` | No issue |
| F23 | Cross-workspace — GSC rows | Tenant B cannot read Tenant A GSC query data | PASS | `seo/search_stores.py` | No issue |
| F24 | Cross-workspace — GA4 rows | Tenant B cannot read Tenant A GA4 landing page data | PASS | `seo/search_stores.py` | No issue |
| F25 | Cross-workspace — backlinks | Tenant B cannot read Tenant A backlinks | PASS | `seo/backlinks/stores.py` | No issue |
| F26 | Cross-workspace — referring domains | Tenant B cannot read Tenant A referring domains | PASS | `seo/backlinks/stores.py` | No issue |
| F27 | Cross-workspace — locations | Tenant B cannot read Tenant A local business locations | PASS | `seo/local/stores.py` | No issue |
| F28 | Cross-workspace — GBP connections | Tenant B cannot read Tenant A GBP connections | PASS | `seo/local/stores.py` | No issue |
| F29 | Cross-workspace — GBP reviews | Tenant B cannot read Tenant A reviews | PASS | `seo/local/stores.py` | No issue |
| F30 | Cross-workspace — citations | Tenant B cannot read Tenant A citations | PASS | `seo/local/stores.py` | No issue |
| F31 | Cross-workspace — local rank | Tenant B cannot read Tenant A local rank entries | PASS | `seo/local/stores.py` | No issue |
| F32 | Cross-workspace — outreach contacts | Tenant B cannot read Tenant A contacts | PASS | `seo/outreach/stores.py` | No issue |
| F33 | Cross-workspace — outreach campaigns | Tenant B cannot read Tenant A campaigns | PASS | `seo/outreach/stores.py` | No issue |
| F34 | Cross-workspace — outreach drafts | Tenant B cannot read Tenant A email drafts | PASS | `seo/outreach/stores.py` | No issue |
| F35 | Cross-workspace — link placements | Tenant B cannot read Tenant A link placements | PASS | `seo/outreach/stores.py` | No issue |
| F36 | Cross-workspace — fix verifications | Tenant B cannot read Tenant A fix records | PASS | `seo/search_stores.py` | No issue |
| F37 | OAuth state — tamper | Tampered HMAC state token → `OAuthStateError` with "signature mismatch" | PASS | `seo/google/oauth.py:~60` | No issue |
| F38 | OAuth state — expiry | State token older than TTL → `OAuthStateError` with "expired" | PASS | `seo/google/oauth.py:~65` | No issue |
| F39 | OAuth state — future iat | State token with `iat` in the future → `OAuthStateError` with "future" | PASS | `seo/google/oauth.py:~70` | No issue |
| F40 | OAuth state — replay | Same state token used twice → `OAuthStateError` on second use | PASS | `seo/google/oauth.py` | No issue |
| F41 | OAuth state — GBP tamper | Same tamper check applies to GBP OAuth | PASS | `seo/google/oauth.py` | No issue |
| F42 | OAuth state — GBP expiry | Same expiry check applies to GBP OAuth | PASS | `seo/google/oauth.py` | No issue |
| F43 | OAuth state — wrong kind | State issued for `google_seo` rejected when validating `gbp` | PASS | `seo/google/oauth.py` | No issue |
| F44 | OAuth state — empty | Empty/missing state → `OAuthStateError` with "Missing"/"Malformed" | PASS | `seo/google/oauth.py` | No issue |
| F45 | Token encryption | Sealed tokens carry `fer:` or `obf:` prefix; sealed value != plaintext | PASS | `seo/google/crypto.py:~40` | No issue |
| F46 | Token redaction | `list_connections` / `_safe_connection_dict` never returns `refresh_token_sealed` or `access_token_sealed` | PASS | `seo/google/connections.py:~85` | No issue |
| F47 | Token encryption env | `SEO_REQUIRE_TOKEN_ENCRYPTION=1` + no key → `seal()` raises `RuntimeError` (case-insensitive match on "REQUIRED") | PASS | `seo/google/crypto.py:~30` | No issue |
| F48 | Token encryption startup | `assert_token_encryption_ready()` raises `RuntimeError` at startup when required + no key | PASS | `seo/google/crypto.py:~25` | No issue |
| F49 | Token encryption status | `encryption_status()` reports `active=False, mode="unavailable"` when required + no key | PASS | `seo/google/crypto.py:~20` | No issue |
| F50 | Token encryption — off by default | Without the env flag, encryption is not required; `seal()` succeeds with obfuscation | PASS | `seo/google/crypto.py` | No issue |
| F51 | Report download token — expiry | Download token with past expiry → `DownloadTokenError` | PASS | `seo/reporting/store.py:~180` | No issue |
| F52 | Report download token — tamper | Tampered HMAC payload → `DownloadTokenError` | PASS | `seo/reporting/store.py:~175` | No issue |
| F53 | Report download token — cross-tenant | Token for Tenant A's report → `DownloadTokenError` when validated under Tenant B | PASS | `seo/reporting/store.py:~185` | No issue |
| F54 | Report download token — wrong report | Valid token for report A does not grant access to report B | PASS | `seo/reporting/store.py` | No issue |
| F55 | Report download token — guessing | Token constructed from guessed components → `DownloadTokenError` | PASS | `seo/reporting/store.py` | No issue |
| F56 | Report download token — valid baseline | Well-formed non-expired token validates correctly | PASS | `seo/reporting/store.py` | No issue |
| F57 | Email header injection | CR/LF in email subject is stripped by `_sanitise_header` | PASS | `seo/outreach/sending.py` (or caller) | No issue |
| F58 | HTML injection | `seo.reporting.pdf._esc` escapes `<script>` tags | PASS | `seo/reporting/pdf.py` | No issue |
| F59 | CSV formula injection — keywords | Values starting with `=`, `+`, `-`, `@`, tab, CR are prefixed with `'` in export | PASS | `seo/keywords/csv_io.py:67-78` | No issue |
| F60 | CSV formula injection — contacts | Contact domain/name export escapes formula chars | PASS | `seo/outreach/contacts.py` | No issue |
| F61 | CSV formula injection — backlinks | Backlink anchor_text export escapes formula chars | PASS | `seo/backlinks` | No issue |
| F62 | Suppression — suppressed email | `send_outreach_email` blocks when email is in suppression list | PASS | `seo/outreach/sending.py:263-264` | No issue |
| F63 | Suppression — do_not_contact | `send_outreach_email` blocks when `contact.do_not_contact=True` | PASS | `seo/outreach/sending.py:256-257` | No issue |
| F64 | Suppression — hard bounce | `handle_bounce(hard=True)` sets `do_not_contact=True` AND suppresses email; subsequent send is blocked | PASS | `seo/outreach/sending.py:353-381` | No issue |
| F65 | Suppression — unsubscribe | `handle_unsubscribe` sets do_not_contact + suppresses; subsequent send blocked | PASS | `seo/outreach/sending.py:384-405` | No issue |
| F66 | Idempotency — duplicate send | Same `(campaign, contact, sequence_index)` is not sent twice | PASS | `seo/outreach/sending.py:267-268` | No issue |
| F67 | Billing — mock is zero | `record_search_usage(is_mock=True)` always records 0 credits | PASS | `seo/metering_search.py` | No issue |
| F68 | Billing — credits off | When credit system is OFF (default), usage calls complete without error; no double-charge possible | PASS | `seo/metering_search.py` | No issue |
| F69 | Billing — duplicate job | Same `operation_id` used twice; second call is idempotent (no double-charge) | PASS | `seo/metering_search.py` | No issue |
| F70 | Billing — validation failure | Failed/blocked operations (UrlRejected) do not trigger a charge | PASS | `seo/url_guard.py`, `seo/metering_search.py` | No issue |
| F71 | Billing — provider success not refunded | Successfully delivered results do not accidentally trigger a refund | PASS | `seo/metering_search.py` | No issue |
| F72 | Billing — email send zero (mock) | `record_email_send(is_mock=True)` records 0 | PASS | `seo/metering_search.py` | No issue |
| F73 | Scheduler race | `claim_due_jobs` with two concurrent workers: only ONE wins each job; both cannot both win | PASS | `seo/rank/scheduler.py` | No issue |
| F74 | Scheduler — lock TTL | Jobs whose lock has expired are re-claimable by a new worker | PASS | `seo/rank/scheduler.py` | No issue |
| F75 | Unsafe env — seal fails closed | `seal()` raises `RuntimeError` containing "REQUIRED" when `SEO_REQUIRE_TOKEN_ENCRYPTION=1` and no key | PASS | `seo/google/crypto.py` | No issue |
| F76 | Unsafe env — startup assert | `assert_token_encryption_ready()` raises at boot when required + no key | PASS | `seo/google/crypto.py` | No issue |
| F77 | Unsafe env — status report | `encryption_status()` returns `active=False, mode="unavailable"` in the broken config | PASS | `seo/google/crypto.py` | No issue |
| F78 | Unsafe env — normal mode ok | `seal()`/`unseal()` round-trip succeeds when key is provided with the flag set | PASS | `seo/google/crypto.py` | No issue |

---

## Design Notes (not bugs)

**D1 — `verify_placement` catches `UrlRejected` internally (F10):**  
`seo/outreach/link_tracking.py:224-225` catches `UrlRejected` and returns  
`{"status": "error", "detail": {"reason": "unsafe_url: <category>"}}` rather than re-raising. This is correct: callers get a structured error, the fetcher is never called, and zero credits are consumed. The test validates the *outcome* (fetcher not called + error status), not the exception propagation.

**D2 — `verify_fix` catches `UrlRejected` internally (F11):**  
`seo/fix_verify.py:160-172` wraps all fetcher calls in a broad `try/except` and stores the exception as `remaining_evidence["error"] = "fetch_failed"`. This keeps the fix record in `PENDING` state rather than crashing. The fix never enters `VERIFIED`. The test validates that the fix is not marked `VERIFIED` and that the block reason appears in `remaining_evidence`.

**D3 — Bounce fires campaign gate before contact gate (F64):**  
After `handle_bounce(hard=True, campaign_id=...)`, the campaign transitions to `CampaignStatus.BOUNCED`. The approval gate (step 2 in `send_outreach_email`) fires before the `do_not_contact` check (step 3), so the block reason is `"approval_required: campaign status is bounced"`. Both guards are active; the test accepts either reason.

---

## Pre-existing Failures (not introduced by this audit)

| Test | Reason | Status |
|------|--------|--------|
| `tests/seo/test_mode_pixie.py::TestModePixieInjector::test_ai_fallback_flag_is_true_offline` | Pre-existing failure in AI mode test; unrelated to security | Pre-existing |
| `tests/seo/test_mode_pixie.py::TestSchemaBuilder::test_ai_usage_is_reported` | Pre-existing failure in AI schema test; unrelated to security | Pre-existing |

---

## Test Counts

| Suite | Command | Result |
|-------|---------|--------|
| Security audit only | `python -m pytest tests/seo/test_security_audit_final.py -q` | 92 passed, 0 failed |
| Full SEO suite | `python -m pytest tests/seo/ -q` | 1851 passed, 2 failed (pre-existing) |

---

## Zero CRITICAL or HIGH vulnerabilities found.

All 78 security properties verified green. The two pre-existing `test_mode_pixie` failures existed before this audit and are unrelated to the security surface being tested.
