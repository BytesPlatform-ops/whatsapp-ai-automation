# Publishing status reconciliation — decision

**Decision: polling + worker reconciliation. No webhook.**

## Why not a webhook

Meta's publishing APIs are not asynchronous in a way a webhook would help:

- **Facebook Page feed / photos / videos** — the publish call returns the post id
  synchronously in the HTTP response. There is nothing to wait for.
- **Instagram content publishing** — a two-step container workflow
  (`/media` → poll `status_code` → `/media_publish`). The *documented* way to learn a
  container finished processing is to **poll `status_code`**; Meta does not send a
  "container ready" or "post published" webhook. The Meta adapter already does this
  bounded polling inside a single `publish()` call (`MetaPublishAdapter._max_polls`).

Meta's webhooks (page/instagram fields) deliver *inbound engagement* events
(comments, mentions, messaging) — not "your scheduled post has now been published".
So a webhook would carry no signal we need to finalize a publish job, and adding one
would introduce a public callback, signature verification, and cross-tenant mapping
surface for **zero correctness gain**. Per the task's decision rule ("do not add
webhooks merely to satisfy the word webhook"), we do not add one.

## What we strengthened instead

The one genuine asynchronous gap is a **worker dying mid-publish**: the job is left in
`PUBLISHING` with a lock, and because `PUBLISHING ∉ DUE_STATUSES` the normal
`due_jobs` scan never picks it up again — it would be stranded forever.

`worker.reconcile_pending()` closes this:

1. It finds jobs in `PUBLISHING` whose lock is **stale** (older than
   `PUBLISH_LOCK_TIMEOUT_SECONDS`) or absent — a fresh lock means a worker is still
   actively publishing, so those are left alone.
2. If the job already has a `platform_post_id`, the platform actually completed and
   only our bookkeeping lagged → finalize as `PUBLISHED` (**delayed-completion
   recovery**).
3. Otherwise → requeue (`QUEUED`, due now) for a fresh attempt. This is safe: the
   idempotency fingerprint plus the post-id guard at the top of `_execute` prevent a
   double-post.

`reconcile_pending` runs at the head of **every** `run_due_once` tick, so a restart or
crash self-heals with no operator action. It is cross-tenant (a trusted global worker
process), like the rest of the worker-facing store methods.

## Tests

`tests/publishing/test_reconciliation.py` covers: stranded-with-post-id → published,
stranded-without-post-id → requeued then published on the next tick (restart
recovery), a fresh lock is left untouched, and tenant isolation of the recovered job.
