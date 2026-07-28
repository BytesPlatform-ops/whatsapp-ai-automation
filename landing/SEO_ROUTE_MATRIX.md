# SEO Route Matrix

Auto-generated documentation of every SEO proxy route. For the machine-readable contract test
see `landing/lib/pixie-lab/__tests__/seoRouteContract.test.ts` and the backend endpoint fixture
at `landing/lib/pixie-lab/__tests__/seoBackendEndpoints.fixture.ts`.

**Columns**
- **Proxy path** — what the browser calls (under `/api/lab/seo/`)
- **Method** — HTTP method the proxy exports
- **Backend endpoint** — what FastAPI receives (under `/api/agents/seo/`)
- **Auth** — `seo.view` (read) or `seo.manage` (write / admin)
- **Status** — `OK` = aligned; `FIXED` = was mismatched, fixed in Part 12; `LEGACY` = deprecated/internal

---

## Sites

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/sites` | GET | `GET /api/agents/seo/sites` | seo.view | OK |
| `/api/lab/seo/sites` | POST | `POST /api/agents/seo/sites` | seo.manage | OK |
| `/api/lab/seo/sites/{siteId}` | GET | `GET /api/agents/seo/sites/{site_id}` | seo.view | OK |
| `/api/lab/seo/sites/{siteId}` | PATCH | `PATCH /api/agents/seo/sites/{site_id}` | seo.manage | OK |
| `/api/lab/seo/sites/{siteId}` | DELETE | `DELETE /api/agents/seo/sites/{site_id}` | seo.manage | OK |

## Crawls

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/crawl` | POST | `POST /api/agents/seo/crawl/start` | seo.manage | OK |
| `/api/lab/seo/crawl` | GET | `GET /api/agents/seo/crawls` | seo.view | OK |
| `/api/lab/seo/crawl/{jobId}` | GET | `GET /api/agents/seo/crawl/{job_id}` | seo.view | OK |
| `/api/lab/seo/crawl/{jobId}` | POST (action=cancel) | `POST /api/agents/seo/crawl/{job_id}/cancel` | seo.manage | OK |

## Pages

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/pages` | GET | `GET /api/agents/seo/pages` | seo.view | OK |

## Issues

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/issues` | GET | `GET /api/agents/seo/issues` | seo.view | OK |
| `/api/lab/seo/issues/{issueId}` | POST (action=resolve) | `POST /api/agents/seo/issues/{issue_id}/resolve` | seo.manage | OK |

## Crawl Reports

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/reports` | GET | `GET /api/agents/seo/reports` | seo.view | OK |

## Audit

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/audit` | POST | `POST /api/agents/seo/audit/start` | seo.manage | OK |
| `/api/lab/seo/audit` | GET | `GET /api/agents/seo/audit/{audit_id}` | seo.view | OK |

## Keywords: Projects

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/keywords/projects` | GET | `GET /api/agents/seo/keywords/projects` | seo.view | OK |
| `/api/lab/seo/keywords/projects` | POST | `POST /api/agents/seo/keywords/projects` | seo.manage | OK |

## Keywords

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/keywords` | GET | `GET /api/agents/seo/keywords/projects/{project_id}/keywords` | seo.view | FIXED |
| `/api/lab/seo/keywords` | POST | `POST /api/agents/seo/keywords/projects/{project_id}/keywords` | seo.manage | FIXED |
| `/api/lab/seo/keywords/research` | POST | `POST /api/agents/seo/keywords/research` | seo.manage | FIXED (`seed`→`seed_keyword`) |
| `/api/lab/seo/keywords/import` | POST | `POST /api/agents/seo/keywords/projects/{project_id}/keywords/import` | seo.manage | FIXED (was flat path, wrong field `csv_content`→`csv_text`) |
| `/api/lab/seo/keywords/export` | GET | `GET /api/agents/seo/keywords/projects/{project_id}/keywords/export` | seo.view | FIXED (was flat path) |
| `/api/lab/seo/keywords/clusters` | GET | `GET /api/agents/seo/keywords/projects/{project_id}/clusters` | seo.view | FIXED (was flat path) |
| `/api/lab/seo/keywords/projects/{project_id}/clusters` | POST | `POST /api/agents/seo/keywords/projects/{project_id}/clusters/auto` | seo.manage | FIXED (was missing `/auto`, sync params) |

## Rankings

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/rankings/check` | POST | `POST /api/agents/seo/rank/check` | seo.manage | OK |
| `/api/lab/seo/rankings/jobs` | GET | `GET /api/agents/seo/rank/jobs` | seo.view | OK |
| `/api/lab/seo/rankings/history` | GET | `GET /api/agents/seo/rank/history` | seo.view | OK |
| `/api/lab/seo/rankings/overview` | GET | `GET /api/agents/seo/rank/overview` | seo.view | OK |
| `/api/lab/seo/rankings/keyword/{id}` | GET | `GET /api/agents/seo/rank/keyword/{keyword_id}` | seo.view | OK |

## Intelligence: Competitors

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/competitors` | GET | `GET /api/agents/seo/competitors` | seo.view | OK |
| `/api/lab/seo/competitors` | POST | `POST /api/agents/seo/competitors` | seo.manage | OK |
| `/api/lab/seo/competitors/gap` | GET | `GET /api/agents/seo/competitors/gap` | seo.view | FIXED (was POST with wrong body shape `site_id+competitor_ids`) |
| `/api/lab/seo/competitors/gap` | POST | `GET /api/agents/seo/competitors/gap` | seo.view | FIXED (bridge: converts body to GET params) |

## Intelligence: Opportunities

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/opportunities` | GET | `GET /api/agents/seo/opportunities` | seo.view | OK |
| `/api/lab/seo/opportunities/generate` | POST | `POST /api/agents/seo/opportunities/generate` | seo.manage | OK |
| `/api/lab/seo/opportunities/{id}/dismiss` | POST | `POST /api/agents/seo/opportunities/{opp_id}/dismiss` | seo.manage | OK |
| `/api/lab/seo/opportunities/{id}/action` | POST | `POST /api/agents/seo/opportunities/{opp_id}/action` | seo.manage | OK |

## Intelligence: Optimise

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/optimise` | GET | `GET /api/agents/seo/optimise` | seo.view | OK |
| `/api/lab/seo/optimize` | POST | `POST /api/agents/seo/optimize/apply` | seo.manage | LEGACY (American-spelling alias; non-standard backend path) |

## Intelligence: Briefs

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/briefs` | GET | `GET /api/agents/seo/briefs` | seo.view | OK |
| `/api/lab/seo/briefs` | POST | `POST /api/agents/seo/briefs/generate` | seo.manage | FIXED (was POST to `/briefs` which doesn't exist; routed to `/briefs/generate`) |
| `/api/lab/seo/briefs/generate` | POST | `POST /api/agents/seo/briefs/generate` | seo.manage | FIXED (was sending `brief_id` only; now sends full `GenerateBriefBody`) |
| `/api/lab/seo/briefs/{id}/approve` | POST | `POST /api/agents/seo/briefs/{brief_id}/approve` | seo.manage | OK |
| `/api/lab/seo/briefs/{id}/archive` | POST | `POST /api/agents/seo/briefs/{brief_id}/archive` | seo.manage | OK |
| `/api/lab/seo/briefs/{id}/duplicate` | POST | `POST /api/agents/seo/briefs/{brief_id}/duplicate` | seo.manage | OK |
| `/api/lab/seo/briefs/{id}/handoff` | POST | `POST /api/agents/seo/briefs/{brief_id}/handoff` | seo.manage | OK |

## Intelligence: Alerts

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/alerts` | GET | `GET /api/agents/seo/alerts` | seo.view | OK |
| `/api/lab/seo/alerts/generate` | POST | `POST /api/agents/seo/alerts/generate` | seo.manage | OK |
| `/api/lab/seo/alerts/{id}/read` | POST | `POST /api/agents/seo/alerts/{alert_id}/read` | seo.manage | OK |
| `/api/lab/seo/alerts/{id}/dismiss` | POST | `POST /api/agents/seo/alerts/{alert_id}/dismiss` | seo.manage | OK |

## Google / GSC / GA4

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/google/connections` | GET | `GET /api/agents/seo/google/connections` | seo.view | OK |
| `/api/lab/seo/google/connect` | POST | `POST /api/agents/seo/google/connect` | seo.manage | OK |
| `/api/lab/seo/google/properties` | GET | `GET /api/agents/seo/google/properties` | seo.view | OK |
| `/api/lab/seo/google/properties/select` | POST | `POST /api/agents/seo/google/properties/select` | seo.manage | OK |
| `/api/lab/seo/google/connections/{id}/sync` | POST | `POST /api/agents/seo/google/connections/{connection_id}/sync` | seo.manage | OK |
| `/api/lab/seo/google/connections/{id}/disconnect` | POST | `POST /api/agents/seo/google/connections/{connection_id}/disconnect` | seo.manage | OK |

## Backlinks

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/backlinks/sync` | POST | `POST /api/agents/seo/backlinks/sync` | seo.manage | OK |
| `/api/lab/seo/backlinks/overview` | GET | `GET /api/agents/seo/backlinks/overview` | seo.view | OK |
| `/api/lab/seo/backlinks` | GET | `GET /api/agents/seo/backlinks` | seo.view | OK |
| `/api/lab/seo/backlinks/referring-domains` | GET | `GET /api/agents/seo/backlinks/referring-domains` | seo.view | OK |
| `/api/lab/seo/backlinks/new-lost` | GET | `GET /api/agents/seo/backlinks/new-lost` | seo.view | OK |
| `/api/lab/seo/backlinks/anchors` | GET | `GET /api/agents/seo/backlinks/anchors` | seo.view | OK |
| `/api/lab/seo/backlinks/risk` | GET | `GET /api/agents/seo/backlinks/risk` | seo.view | OK |
| `/api/lab/seo/backlinks/gap` | POST | `GET /api/agents/seo/backlinks/gap` | seo.view | FIXED (backend is GET; proxy converts POST body to GET query params) |
| `/api/lab/seo/backlinks/opportunities` | GET | `GET /api/agents/seo/backlinks/opportunities` | seo.view | OK |
| `/api/lab/seo/backlinks/export` | GET | `GET /api/agents/seo/backlinks/export` | seo.view | OK |

## Local: Locations

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/local` | GET | `GET /api/agents/seo/locations` | seo.view | FIXED (was `/local` which doesn't exist; now `/locations`) |
| `/api/lab/seo/locations` | GET | `GET /api/agents/seo/locations` | seo.view | OK |
| `/api/lab/seo/locations` | POST | `POST /api/agents/seo/locations` | seo.manage | OK |
| `/api/lab/seo/locations/{id}` | GET | `GET /api/agents/seo/locations/{location_id}` | seo.view | OK |
| `/api/lab/seo/locations/{id}` | PATCH | `PATCH /api/agents/seo/locations/{location_id}` | seo.manage | OK |
| `/api/lab/seo/locations/{id}` | DELETE | `DELETE /api/agents/seo/locations/{location_id}` | seo.manage | OK |

## Local: Reviews

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/reviews` | GET | `GET /api/agents/seo/locations/{location_id}/reviews` | seo.view | FIXED (was `/reviews` flat path which doesn't exist) |
| `/api/lab/seo/reviews` | POST (action=draft) | `POST /api/agents/seo/reviews/{review_id}/draft` | seo.manage | FIXED (review_id now path param, not body) |
| `/api/lab/seo/reviews` | POST (action=approve) | `POST /api/agents/seo/reviews/{review_id}/approve` | seo.manage | FIXED (review_id now path param) |
| `/api/lab/seo/reviews` | POST (action=handled) | `POST /api/agents/seo/reviews/{review_id}/handled` | seo.manage | FIXED (new action, review_id path param) |

## Local: NAP Audit

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| *(no dedicated proxy yet)* | — | `POST /api/agents/seo/locations/{id}/nap/audit` | seo.manage | — |
| *(no dedicated proxy yet)* | — | `GET /api/agents/seo/locations/{id}/nap` | seo.view | — |

## Local: Citations

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/citations` | GET | `GET /api/agents/seo/locations/{location_id}/citations` | seo.view | FIXED (was flat `/citations` path) |
| `/api/lab/seo/citations` | POST | `POST /api/agents/seo/locations/{location_id}/citations` | seo.manage | FIXED (was pointing to non-existent `/nap/check`) |
| `/api/lab/seo/citations` | POST (action=check_consistency) | `POST /api/agents/seo/locations/{location_id}/citations/check-all` | seo.manage | FIXED |
| `/api/lab/seo/citations/export` | GET | `GET /api/agents/seo/locations/{location_id}/citations/export` | seo.view | FIXED (was flat path; location_id required) |

## Local: Local Rank

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/local-rank` | GET | `GET /api/agents/seo/locations/{location_id}/local-rank/overview` | seo.view | FIXED (was `/local-rank` flat path) |
| `/api/lab/seo/local-rank` | POST | `POST /api/agents/seo/local-rank/check` | seo.manage | FIXED (was GET-only; POST handler added) |

## Local: GBP

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| *(no dedicated proxy yet)* | — | `GET /api/agents/seo/gbp/connect` | — | — |
| *(no dedicated proxy yet)* | — | `POST /api/agents/seo/gbp/callback` | — | — |
| *(no dedicated proxy yet)* | — | `GET /api/agents/seo/gbp/connections` | — | — |

## Local: Local Competitors, Schema, Page Opportunities

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| *(no dedicated proxy yet)* | — | `GET /api/agents/seo/locations/{id}/competitors` | — | — |
| *(no dedicated proxy yet)* | — | `GET /api/agents/seo/locations/{id}/schema` | — | — |
| *(no dedicated proxy yet)* | — | `GET /api/agents/seo/locations/{id}/page-opportunities` | — | — |

## Outreach: Contacts

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/outreach/contacts` | GET | `GET /api/agents/seo/outreach/contacts` | seo.view | OK |
| `/api/lab/seo/outreach/contacts` | POST | `POST /api/agents/seo/outreach/contacts` | seo.manage | OK |
| `/api/lab/seo/outreach/contacts` | POST (action=suppress) | `POST /api/agents/seo/outreach/suppress` | seo.manage | FIXED (was `/contacts/suppress` which doesn't exist) |
| `/api/lab/seo/outreach/contacts/export` | GET | `GET /api/agents/seo/outreach/contacts/export/csv` | seo.view | FIXED (was missing `/csv` suffix) |

## Outreach: Campaigns

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/outreach/campaigns` | GET | `GET /api/agents/seo/outreach/campaigns` | seo.view | OK |
| `/api/lab/seo/outreach/campaigns` | POST | `POST /api/agents/seo/outreach/campaigns` | seo.manage | OK |
| `/api/lab/seo/outreach/campaigns` | POST (action=update) | `PATCH /api/agents/seo/outreach/campaigns/{campaign_id}` | seo.manage | FIXED (was POST to `/campaigns/update` which doesn't exist) |

## Outreach: Drafts

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/outreach/drafts` | GET | `GET /api/agents/seo/outreach/drafts` | seo.view | OK |
| `/api/lab/seo/outreach/drafts` | POST | `POST /api/agents/seo/outreach/drafts/generate` | seo.manage | OK |
| `/api/lab/seo/outreach/drafts` | POST (action=approve) | `POST /api/agents/seo/outreach/drafts/{draft_id}/approve` | seo.manage | FIXED (was `/drafts/approve` flat path; draft_id now path param) |

## Outreach: Send

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/outreach/send` | POST | `POST /api/agents/seo/outreach/send` | seo.manage | FIXED (was validating `draft_id`; now validates `campaign_id+contact_id`) |

## Outreach: Placements

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/outreach/placements` | GET | `GET /api/agents/seo/outreach/placements` | seo.view | OK |
| `/api/lab/seo/outreach/placements` | POST | `POST /api/agents/seo/outreach/placements` | seo.manage | OK |

## Scheduler (Admin)

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/scheduler/health` | GET | `GET /api/agents/seo/scheduler/health` | seo.manage | OK |
| `/api/lab/seo/scheduler/tick` | POST | `POST /api/agents/seo/scheduler/tick` | seo.manage | OK |
| `/api/lab/seo/scheduler/retry` | POST | `POST /api/agents/seo/scheduler/jobs/{job_id}/retry` | seo.manage | FIXED (was `/scheduler/retry` flat path; job_id now path param) |
| `/api/lab/seo/scheduler/pause` | POST | `POST /api/agents/seo/scheduler/pause` | seo.manage | OK |
| `/api/lab/seo/scheduler/resume` | POST | `POST /api/agents/seo/scheduler/resume` | seo.manage | OK |

## PDF Reports

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/reports/pdf` | GET | `GET /api/agents/seo/reports/pdf` | seo.view | FIXED (GET handler was missing) |
| `/api/lab/seo/reports/pdf` | POST | `POST /api/agents/seo/reports/pdf` | seo.view | FIXED (was sending `crawl_job_id, audience`; now `site_id, kind, date_from, date_to`) |

## Page Speed

| Proxy path | Method | Backend endpoint | Auth | Status |
|---|---|---|---|---|
| `/api/lab/seo/pagespeed` | GET | `GET /api/agents/seo/pagespeed` | seo.view | OK |

---

## Deprecated / Legacy Routes

These proxy files exist but are not aligned with current backend routes. They are documented here and in the contract test but NOT in the `KNOWN_BACKEND_ENDPOINTS` fixture.

| Proxy path | Status | Notes |
|---|---|---|
| `/api/lab/seo/connections` | LEGACY | Website-platform connector. Uses different auth model from Google OAuth. Backend endpoint `/connections` exists but with different contract. |
| `/api/lab/seo/integrations` | LEGACY | Aggregator view — fetches from multiple backend endpoints; not a 1:1 backend map. No corresponding single backend route. |
| `/api/lab/seo/history` | LEGACY | Calls `/api/agents/seo/history` which is not in the current backend OpenAPI surface. May have been removed. |
| `/api/lab/seo/optimize` | LEGACY | American-spelling alias for `/optimise`. Calls `/api/agents/seo/optimize/apply` and `/prepare` which do not exist in `intelligence/routes.py`. Should call `/optimise/ai`. |

### Old `/api/seo/*` Routes (pre-proxy architecture)

There are no `/api/seo/*` routes in `landing/app/api/`. All routes were already migrated to `/api/lab/seo/*` in the current codebase. The deprecated patterns above are proxy-layer issues, not route-structure regressions.

---

## Summary

| Category | Total proxy routes | Fixed in Part 12 | OK from start | Legacy/Deprecated |
|---|---|---|---|---|
| Sites | 5 | 0 | 5 | 0 |
| Crawls | 4 | 0 | 4 | 0 |
| Pages / Issues | 3 | 0 | 3 | 0 |
| Keywords (all) | 7 | 5 | 2 | 0 |
| Rankings | 5 | 0 | 5 | 0 |
| Competitors | 3 | 1 | 2 | 0 |
| Opportunities | 4 | 0 | 4 | 0 |
| Optimise | 2 | 0 | 1 | 1 |
| Briefs | 7 | 2 | 5 | 0 |
| Alerts | 4 | 0 | 4 | 0 |
| Google/GSC/GA4 | 6 | 0 | 6 | 0 |
| Backlinks | 10 | 1 | 9 | 0 |
| Local (locations) | 6 | 1 | 5 | 0 |
| Reviews | 4 | 4 | 0 | 0 |
| Citations | 4 | 4 | 0 | 0 |
| Local Rank | 2 | 2 | 0 | 0 |
| Outreach (all) | 8 | 4 | 4 | 0 |
| Scheduler | 5 | 1 | 4 | 0 |
| PDF Reports | 2 | 2 | 0 | 0 |
| Page Speed | 1 | 0 | 1 | 0 |
| Deprecated/Internal | 4 | — | — | 4 |
| **TOTAL** | **96** | **27** | **64** | **5** |

**Tenant isolation**: No client-supplied `tenant_id` is accepted. All proxy route handlers call `guard(perm)` which resolves the tenant server-side from the session. `backendSend`/`backendGet` inject `tenant_id` from `g.tenant` only.
