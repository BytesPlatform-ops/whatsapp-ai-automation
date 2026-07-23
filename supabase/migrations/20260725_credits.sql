-- ============================================================================
-- Credits & billing (Phase 6/6.1) — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Apply ONCE in Supabase → SQL Editor. Idempotent (IF NOT EXISTS). Safe to re-run.
-- DO NOT apply to a live project without explicit approval (see APPLY_CHECKLIST.md).
--
-- The credit engine persists through the shared `persistence.table()` envelope
-- ({ id, tenant_id, created_at, updated_at, data jsonb }, PK = id) — see
-- backend/credits/{ledger,wallet,reservations}.py. Table names MUST match the
-- repositories: credit_ledger, credit_wallet, credit_reservations.
--
-- MONEY SAFETY:
--   * credit_ledger is APPEND-ONLY — no UPDATE/DELETE is issued by the backend;
--     reversals are compensating rows. Balances are Σ over data->>'amount_mc' and
--     data->>'reserved_delta_mc' (integer milli-credits — never floats).
--   * (tenant_id, idempotency_key) is UNIQUE so a replayed grant/charge/webhook can
--     never create a second entry.
--   * credit_wallet is a PROJECTION (one row per tenant, id = tenant_id) and is NOT
--     the source of truth — it is reconcilable from credit_ledger.
--
-- SECURITY: written/read ONLY by the backend service-role key (bypasses RLS). The
-- browser never queries these — access is via the Next.js /api/billing proxy which
-- resolves the workspace tenant server-side. RLS is ENABLED with no anon/authenticated
-- policy → deny-all. No token/secret is ever stored in `data`.
-- ============================================================================

-- ── Immutable credit ledger (append-only) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Wallet projection (one row per tenant; id = tenant_id) ───────────────────
CREATE TABLE IF NOT EXISTS "credit_wallet" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Credit reservations (pre-operation holds) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "credit_reservations" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes: ledger ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_tenant"      ON "credit_ledger" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_created"     ON "credit_ledger" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_type"        ON "credit_ledger" ((data->>'entry_type'));
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_reference"   ON "credit_ledger" ((data->>'reference_type'), (data->>'reference_id'));
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_reservation" ON "credit_ledger" ((data->>'reservation_id'));
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_operation"   ON "credit_ledger" ((data->>'provider_operation_id'));
CREATE INDEX IF NOT EXISTS "idx_credit_ledger_stripe"      ON "credit_ledger" ((data->>'stripe_event_id'));
-- Unique idempotency per tenant (partial: empty keys are exempt).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_credit_ledger_idempotency"
  ON "credit_ledger" ("tenant_id", (data->>'idempotency_key'))
  WHERE (data->>'idempotency_key') IS NOT NULL AND (data->>'idempotency_key') <> '';

-- ── Indexes: reservations ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_credit_res_tenant"    ON "credit_reservations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_credit_res_status"    ON "credit_reservations" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_credit_res_expiry"    ON "credit_reservations" ((data->>'expires_at'));
CREATE INDEX IF NOT EXISTS "idx_credit_res_source"    ON "credit_reservations" ((data->>'source_product'), (data->>'source_object_id'));
CREATE INDEX IF NOT EXISTS "idx_credit_res_provider"  ON "credit_reservations" ((data->>'provider_operation_id'));
CREATE UNIQUE INDEX IF NOT EXISTS "uq_credit_res_idempotency"
  ON "credit_reservations" ("tenant_id", (data->>'idempotency_key'))
  WHERE (data->>'idempotency_key') IS NOT NULL AND (data->>'idempotency_key') <> '';

-- ── Indexes: wallet ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_credit_wallet_tenant" ON "credit_wallet" ("tenant_id");

-- ── Row Level Security (enable; no anon/authenticated policies → deny-all) ────
ALTER TABLE "credit_ledger"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_wallet"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_reservations" ENABLE ROW LEVEL SECURITY;
