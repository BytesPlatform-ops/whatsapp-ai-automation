"""Pixie credit + billing engine — workspace-scoped, financially safe by design.

The money core: an append-only credit ledger (`ledger`), a fast wallet projection
(`wallet`), pre-operation reservations with settlement/release/refund
(`reservations`, `service`), and a reconciliation worker (`worker`). Plans +
entitlements live in `plans` / `entitlements`.

Invariants (see the Financial Safety Rules in the Phase 6 brief):
  * All credit amounts are INTEGER milli-credits; provider cost is INTEGER
    micro-USD. No floating-point money anywhere.
  * The ledger is append-only: reversals are compensating entries, never edits.
  * The wallet is a projection of the ledger and is reconcilable from it.
  * Every mutation is idempotency-keyed; a replay returns the prior result.
  * Everything is disabled by default (`CREDIT_SYSTEM_ENABLED=false`) so wiring
    can land safely before durable migrations + Stripe config exist.
"""
