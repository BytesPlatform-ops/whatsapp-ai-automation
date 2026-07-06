# Pixie Services — Setup, Architecture & Deployment

How the Pixie service integrations (SEO, Meta/Marketing, Content) are wired,
how to run them locally, how the database schema is managed, and how to deploy.

> **Which folder is the real product?**
> - **`landing/`** — the **real Pixie app** (Next.js 14). The authenticated UI is
>   the **Pixie Lab** at `landing/app/pixie-lab/*`. **This is what ships.**
> - **`backend/`** — the **real backend** (Python FastAPI): SEO / Meta / Content
>   services + the website generator. Ships as a separate service.
> - **`dashboard/`** — **DEMO / REFERENCE only.** A throwaway UI mockup used to
>   document the backend API contracts. **Do not deploy it as the product.**
> - **`src/`** (repo root) — the **WhatsApp/Messenger/Instagram bot** (Express).
>   A separate service (deployed on Render); unrelated to the Pixie Lab app.

---

## 1. Services implemented

| Service | Backend routes | Pixie Lab UI |
|---|---|---|
| **SEO** | `/api/agents/seo/*` (+ `/api/seo/*`) | `/pixie-lab/seo/{audit,history,connections}` |
| **Meta / Marketing** | `/api/meta/*`, `/api/agents/marketing/meta/*` | `/pixie-lab/marketing/{inbox,comments,content,approvals}` |
| **Content (media)** | `/api/content/*` | `/pixie-lab/content/{create,library}` |

The browser never calls FastAPI directly. Next route handlers under
`landing/app/api/lab/*` proxy to it, resolving the workspace **tenant
server-side** (never trusting a client `tenant_id`).

---

## 2. Environment variables

Fill these in the matching `.env` (copy from the committed `.env.example`).
**Never commit real secrets.** Only `NEXT_PUBLIC_*` values reach the browser.

### `landing/.env` (Next.js app)

| Env var | Used by | Required for | Server/Client | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | landing | Auth/DB | Client | Safe public value |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | landing | Auth | Client | Safe public value |
| `SUPABASE_SERVICE_ROLE_KEY` | landing (admin) | Admin ops | **Server** | Full DB access — never expose |
| `DATABASE_URL` | Prisma | App queries + migrations | **Server** | Supabase pooler (6543) |
| `DIRECT_URL` | Prisma | Migrations | **Server** | Supabase session pooler (5432) |
| `PIXIE_BACKEND_URL` | landing proxies | Reaching FastAPI | **Server** | Default `http://localhost:8000`. **No `NEXT_PUBLIC_` variant — browser never calls the backend.** |
| `OPENAI_API_KEY` | landing tools | AI tools | **Server** | |
| `OPEN_PAGERANK_API_KEY` | landing SEO tools | DA/PA checker | **Server** | Optional |
| `STRIPE_SECRET_KEY` | landing | Billing | **Server** | |
| `STRIPE_WEBHOOK_SECRET` | landing | Stripe webhook | **Server** | |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | landing | Checkout | Client | Safe public value |
| `STRIPE_PRICE_PRO_MONTHLY` / `_BUSINESS_` / `_AGENCY_` | landing | Plan prices | **Server** | |
| `RESEND_API_KEY` | landing | Email | **Server** | |
| `RESEND_FROM` | landing | Email from | **Server** | |
| `PIXIE_REQUEST_EMAIL` | landing | Access requests | **Server** | |
| `WAITLIST_LEAD_EMAIL` | landing | Waitlist leads | **Server** | |
| `ADMIN_EMAILS` | landing | `/admin-panel` gate | **Server** | Comma-separated |

### `backend/.env` (Python FastAPI)

| Env var | Used by | Required for | Server/Client | Notes |
|---|---|---|---|---|
| `PIXIE_MODEL_MODE` | backend | AI provider | Server | `fake` (default, $0) or `openai` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_EMBED_MODEL` | backend | Real AI | Server | Only when mode=openai |
| `SUPABASE_URL` | backend | DB/Storage | Server | Same Supabase project as landing |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | DB/Storage | Server | Service-role (bypasses RLS) |
| `PIXIE_PERSIST` | backend | Durable data | Server | `memory` \| `file` \| `supabase` |
| `PIXIE_DATA_DIR` | backend | file mode | Server | Default `.pixie_data` |
| `PIXIE_STORAGE_PROVIDER` | backend | Media bytes | Server | `supabase` \| `local` |
| `PIXIE_STORAGE_BUCKET` | backend | Media bytes | Server | Default `pixie-content` |
| `PAGESPEED_API_KEY` | backend SEO | PageSpeed | Server | Optional → mock without it |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | backend SEO | Keyword data | Server | Optional → mock |
| `RANK_API_KEY` / `SERP_API_KEY` / `RANK_API_ENDPOINT` | backend SEO | Rank tracking | Server | Optional |
| `META_APP_ID` | backend Meta | OAuth | Server | Without it → "setup required" |
| `META_APP_SECRET` | backend Meta | OAuth | **Server** | Secret |
| `META_REDIRECT_URI` | backend Meta | OAuth callback | Server | |
| `META_GRAPH_VERSION` | backend Meta | Graph API | Server | e.g. `v23.0` (note: **not** `META_GRAPH_API_VERSION`) |
| `META_WEBHOOK_VERIFY_TOKEN` | backend Meta | Webhook | Server | |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `GOOGLE_OAUTH_REDIRECT` | backend | Gmail/Cal | Server | Optional |

### `dashboard/.env.local` (demo only — not deployed)
`NEXT_PUBLIC_SITE_URL`, `PIXIE_BACKEND_URL`.

---

## 3. Database schema — Prisma is the single source of truth

- **Prisma** (`landing/prisma/schema.prisma`) owns **all** schema and migrations
  for the shared Supabase Postgres database — both the app tables (workspaces,
  members, services, billing) **and** the backend service tables (SEO / Meta /
  Content). Migrations live in `landing/prisma/migrations/`.
- The backend service tables are the JSONB **envelope** shape
  (`id`, `tenant_id`, `data jsonb`, `created_at`, `updated_at`) added in
  `0003_service_integrations`. `tenant_id` is an **indexed string, not a foreign
  key** — the backend also writes system/demo tenants, and isolation is enforced
  by the server-resolved tenant + `(tenant_id, created_at)` index + RLS.
- **`backend/meta/migrations.sql` is now REFERENCE/LEGACY only.** Do not run it
  by hand — the Prisma migration supersedes it (and is idempotent, so it is safe
  on a DB where the SQL was already applied).

### Applying `0003` to the database

**Heads-up about this repo's history:** `npx prisma migrate status` against the
live Supabase DB reports **0 migrations applied**, even though the app tables
already exist. In other words the existing tables were created with
`prisma db push` (history-less), not tracked `migrate deploy`. So a plain
`migrate deploy` would try to re-create `workspaces` etc. and fail. Pick ONE of:

**Option 1 — quickest, matches the repo's `db push` workflow (adds the new
tables; does NOT apply RLS):**
```bash
cd landing
npm run db:push          # prisma db push — additive, non-destructive; creates the 11 new tables
```
Then apply RLS once (Prisma can't model Postgres RLS) — paste
**`supabase/rls/pixie-services-rls.sql`** into the Supabase SQL editor and run it.
This is the ONLY remaining manual SQL, and only because RLS isn't expressible in
Prisma. (The same statements are also embedded in the `0003` migration for
Option 2.)

**Option 2 — adopt migration history (recommended long-term; applies RLS too):**
```bash
cd landing
# Baseline the already-existing tables as applied WITHOUT running their DDL:
npx prisma migrate resolve --applied 0001_pixie_lab_init
npx prisma migrate resolve --applied 0002_workspace_services
# Apply only 0003 — it is idempotent (CREATE TABLE IF NOT EXISTS) and includes RLS:
npm run db:migrate       # prisma migrate deploy
```

Other useful commands:
```bash
npm run db:generate     # prisma generate — regenerate the client (offline)
npm run db:status       # prisma migrate status — applied vs pending (read-only, safe)
```

**Recommendation:** for the current shared dev DB use **Option 1** (`db:push` +
paste the RLS file once) — it's the least risky given there's no migration
history, and it matches how the existing tables were created. Adopt **Option 2**
(baseline + `migrate deploy`) when you move to a production DB and want tracked,
repeatable migrations (it also applies RLS automatically).

> Never run `prisma migrate dev` against the shared Supabase DB — it can reset.
> Use it only on a disposable local database. Always run `npm run db:status`
> first to see current state.

---

## 4. Backend persistence strategy (Option C)

**One Postgres database, two access paths, one schema owner:**

- **Schema owner:** Prisma (see §3). Prisma migrations create/track every table.
- **Next.js app:** reads/writes the *app* tables (workspaces, services, billing)
  via the **Prisma client** (server-only).
- **Python backend:** reads/writes the *service* tables (SEO/Meta/Content
  envelope tables + `pixie_kv`) via the **Supabase service-role REST API**
  (`backend/persistence.py`, `backend/storage.py`). It does **not** use Prisma
  (different language) and does **not** own migrations. It selects its store via
  `PIXIE_PERSIST` (`memory` | `file` | `supabase`); production = `supabase`.
- Because both point at the same Supabase Postgres, the Python backend simply
  reads/writes the columns Prisma created. No schema is defined in two places.

No backend code change was required — the persistence layer already matches this
model; we only moved schema ownership to Prisma.

---

## 5. Running locally

Frontend and backend are **separate apps** (Node + Python) — there is **no single
`npm run dev`** that runs both. Two options:

**A) One helper script (starts both, cleans up on Ctrl-C):**
```bash
./scripts/dev-pixie.sh
```

**B) Two terminals:**
```bash
# Terminal 1 — Backend (FastAPI)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
.venv/bin/uvicorn app:app --reload --port 8000
# Runs on: http://localhost:8000

# Terminal 2 — Frontend (Pixie Lab)
cd landing
npm install        # first time
npm run dev
# Runs on: http://localhost:3002
```

**Required env to connect them:** in `landing/.env`, set
`PIXIE_BACKEND_URL=http://localhost:8000` (server-only). The browser calls only
same-origin `/api/lab/*`; Next proxies to FastAPI.

> The backend targets Python 3.12. On Python 3.9, `pip install eval_type_backport`
> in the venv to run the code/tests (it uses `str | None` unions).

---

## 6. Deployment architecture — Option A (separate deployments)

The Python backend is a distinct runtime and **must be deployed separately** from
the Next.js frontend.

| Piece | Target | Notes |
|---|---|---|
| **Frontend** (`landing/`) | **Vercel** | Already has `landing/vercel.json`. Next.js app. |
| **Backend** (`backend/`) | **Render / Railway / Fly.io / any Docker host** | Has `backend/Dockerfile` (`uvicorn app:app` on :8000). |
| **Database** | **Supabase Postgres** | Prisma migrations applied via `npm run db:migrate`. |
| **Storage** | **Supabase Storage** (`pixie-content` bucket) | Or `local` for dev. |
| **WhatsApp bot** (`src/`) | **Render** (existing, `…onrender.com`) | Separate service; not part of Pixie Lab. |
| **Demo dashboard** (`dashboard/`) | **Do not deploy** | Reference only. |

**Wiring:**
- Set `PIXIE_BACKEND_URL=https://<your-backend-host>` in the **frontend's**
  server env (Vercel Project → Settings → Environment Variables). It is
  **server-only** — do not create a `NEXT_PUBLIC_` variant.
- **CORS:** not required for the product, because the browser never calls the
  backend cross-origin (Next proxies server-side). If you ever expose the backend
  to a browser directly, add FastAPI `CORSMiddleware` (there is none today).
- **Internal shared-secret (implemented):** set the same
  `PIXIE_INTERNAL_API_SECRET` in **both** `backend/.env` and the frontend server
  env. When set, the backend rejects any request without a matching
  `X-Pixie-Internal-Secret` header (401) — except `/health` and the public OAuth
  callback/webhook endpoints. The Next.js proxies attach the header server-side
  (`internalHeaders()` in `lib/pixie-lab/backend.ts`); it is **never** sent from
  the browser. When the var is unset the check is a no-op (local dev). Generate
  with `openssl rand -hex 32`. This is in addition to the server-resolved tenant.

**Must the Python backend be deployed separately? — Yes.** It is a separate
language/runtime; Vercel serverless functions can't run the FastAPI app. Deploy
it as its own service and point `PIXIE_BACKEND_URL` at it.

---

## 6a. Meta OAuth — going live

The Marketing service works in a **setup-required** state until Meta keys are set.
`GET /api/meta/status` returns `configured:false` + `missing_config:["META_APP_ID","META_APP_SECRET"]`
(names only, never values). Managers see the exact missing vars in the UI;
non-managers see a generic "not configured yet" message. No fake/connected state
is ever shown.

To run a real end-to-end OAuth test once you have a Meta app:

1. In `backend/.env`, set:
   ```
   META_APP_ID=<your app id>
   META_APP_SECRET=<your app secret>
   META_REDIRECT_URI=http://localhost:8000/api/meta/connect/callback
   META_GRAPH_VERSION=v23.0
   META_WEBHOOK_VERIFY_TOKEN=<any random string>
   ```
   (Env names are exactly what the code reads — note `META_GRAPH_VERSION`, not
   `META_GRAPH_API_VERSION`.) `backend/.env` is auto-loaded on startup.
2. In the Meta app dashboard → Facebook Login → Valid OAuth Redirect URIs, add
   the same `META_REDIRECT_URI`.
3. Restart the backend, start the frontend, open `/pixie-lab/marketing/inbox`.
   The setup bar should now show **Connect Facebook / Instagram**.
4. Click Connect → the popup opens `/api/lab/meta/connect` → backend
   `/api/meta/connect/start` → Meta OAuth. Approve; the callback
   (`/api/meta/connect/callback`) stores the token server-side and the popup
   closes. The bar flips to **Live** with your display name + permission pills.
5. Verify `GET /api/meta/status` now returns `configured:true, connected:true`
   and **never** a token.

> `META_APP_SECRET` is server-only (backend). It is never sent to the browser and
> never returned by any status endpoint.

## 7. External integrations needed

- **Supabase** — Postgres (Prisma) + Storage + Auth.
- **Stripe** — billing (frontend).
- **Resend** — transactional email (frontend).
- **Meta (Facebook/Instagram) app** — Marketing OAuth + Graph API (backend).
- **OpenAI** — real AI mode (backend `PIXIE_MODEL_MODE=openai`) + frontend tools.
- **Optional SEO data:** Google PageSpeed, DataForSEO, a rank/SERP API, OpenPageRank.
- **Optional:** Google OAuth (Gmail/Calendar), Higgsfield (video/content).

---

## 8. Known TODOs

- **Apply the new tables to the live DB:** follow §3 (Option 1 `npm run db:push`
  + RLS snippet, or Option 2 baseline + `npm run db:migrate`). Not run here on
  purpose — the shared Supabase DB has no Prisma migration history recorded
  (`migrate status` = 0 applied), so an unbaselined `migrate deploy` would fail
  on the pre-existing app tables. Verify with `npx prisma migrate status` after.
- **`/api/seo/*` (Mode A/B) uses an in-memory repo** (`backend/seo/repository.py`)
  — not durable across restarts. The audit agent under `/api/agents/seo/*` (the
  one wired into the UI) uses the durable `persistence.py`.
- **Backend network hardening** — add a shared-secret header or private networking
  between the Vercel proxy and the FastAPI backend before public deployment.
