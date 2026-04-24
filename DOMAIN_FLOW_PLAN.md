# Domain Flow Migration — Implementation Plan

## Goal

Move the domain selection step from AFTER preview+approval to BEFORE preview generation. Preview + Stripe link both reflect the combined `website + domain` price. 23h follow-up applies a 20% discount to the website portion only, regenerates the Stripe link, and updates the activation banner on the live preview.

---

## Architecture — Before vs After

### Current Flow (to be replaced)
```
Collect info → Generate preview → User approves →
Ask domain → Namecheap → User picks → Stripe link (site + domain) →
Pay → Register + DNS → Live
(redundancy: if no domain picked pre-payment, postPayment re-asks)
```

### New Flow
```
Collect info → Ask domain (has/need/skip) →
  if need: Namecheap search → user picks →
Generate preview with activation banner ($site + $domain) →
Send Stripe link in chat (same amount) →
Pay within 23h: Register + DNS → Live
Unpaid at 23h: Apply 20% discount to website only →
  New Stripe link + updated banner → wait for payment
```

---

## New / Changed States

| State | Purpose | New? |
|---|---|---|
| `WEB_DOMAIN_CHOICE` | Ask: have own / need new / skip | NEW (replaces DOMAIN_OFFER's current purpose) |
| `WEB_DOMAIN_OWN_INPUT` | Collect user's existing domain | NEW |
| `WEB_DOMAIN_SEARCH` | Namecheap search + user picks | Rename from `DOMAIN_SEARCH` |
| `WEB_CONFIRM` | Confirm all info before build | Existing (route now goes through domain step) |
| `DOMAIN_OFFER` (legacy) | Keep as deprecated alias for in-flight users | Existing |

---

## File-by-File Changes

### 1. `src/conversation/states.js`
- Add: `WEB_DOMAIN_CHOICE`, `WEB_DOMAIN_OWN_INPUT`, `WEB_DOMAIN_SEARCH`
- Keep `DOMAIN_OFFER` for backward compat during migration

### 2. `src/conversation/handlers/webDev.js` (major)
- In last collection step (`WEB_COLLECT_CONTACT` completion), route to `WEB_DOMAIN_CHOICE` instead of directly to `WEB_CONFIRM` / generate
- Add `handleDomainChoice()` — yes/no/have-own branches
- Add `handleDomainOwnInput()` — validate format, save, proceed
- After domain resolved (any branch), proceed to `WEB_CONFIRM` → generation
- Remove post-approval domain offer block (lines ~2608–2676)
- Pass `combinedAmount` to generation step

### 3. `src/conversation/handlers/customDomain.js` (repurpose)
- `runDomainSearch()` and `handleDomainSearch()` stay but route to `WEB_DOMAIN_SELECTED` → saves domain to metadata (no Stripe link yet)
- Remove `processDomainSelection()` Stripe-link logic — moved to generation step
- Keep exit/explainer handlers

### 4. `src/website-gen/generator.js`
- Accept `selectedDomain` + `domainPrice` in config
- Pass through to deployer

### 5. `src/website-gen/deployer.js`
- After Netlify deploy, always create Stripe link for `websitePrice + domainPrice`
- Pass amount to activation banner
- Save `lastPaymentLinkId`, `lastPaymentAmount`, `paymentType='full'` in user metadata

### 6. `src/website-gen/activationBanner.js`
- Banner takes `amount` + `paymentUrl` as params (already does)
- No structural change needed — just ensure amount includes domain price
- Add `originalAmount` vs `displayAmount` fields for discount display ("~~$212~~ $172")

### 7. `src/website-gen/redeployer.js` (new use case)
- Add `redeployWithNewBanner(siteId, newAmount, newPaymentUrl)` helper
- Triggered by discount flow to push updated banner without regenerating content

### 8. `src/followup/scheduler.js` (major addition)
- New ladder step: at 23h mark for unpaid website+domain leads
- Logic:
  1. Fetch user's current payment record
  2. Skip if `discountApplied === true` (no double-discount)
  3. Compute: `newWebsiteAmount = floor(websitePrice × 0.8)`, `newTotal = newWebsiteAmount + domainPrice`
  4. Deactivate old Stripe link (call `stripe.paymentLinks.update({active:false})`)
  5. Create new Stripe link with `newTotal`
  6. Update payment record: `discountApplied=true`, `discountPct=20`, `originalAmount`, `newAmount`
  7. Call `redeployWithNewBanner(siteId, newTotal, newUrl)` to update preview
  8. Send WhatsApp with new link + "20% off website today — $X save"

### 9. `src/payments/postPayment.js` (simplify)
- Remove domain re-offer block (lines 210–221) — domain is always pre-selected in new flow
- Direct path: payment confirmed → if `selectedDomain` → register + DNS → done
- If no domain picked (user chose "skip"): just confirm payment, no domain step

### 10. `src/payments/stripe.js`
- Add helper `deactivatePaymentLink(linkId)` — calls Stripe API to disable old link
- `createPaymentLink()` accepts optional `metadata: { originalAmount, discountApplied }`

### 11. `src/db/migrations/018_payment_discounts.sql` (new migration)
```sql
ALTER TABLE payments
  ADD COLUMN original_amount INTEGER,
  ADD COLUMN discount_applied BOOLEAN DEFAULT FALSE,
  ADD COLUMN discount_pct INTEGER DEFAULT 0,
  ADD COLUMN domain_amount INTEGER DEFAULT 0,
  ADD COLUMN website_amount INTEGER DEFAULT 0;
```

### 12. `src/website-gen/domainChecker.js`
- No changes needed — already returns pricing per domain

### 13. `src/conversation/router.js`
- Register new state handlers:
  - `WEB_DOMAIN_CHOICE → handleDomainChoice`
  - `WEB_DOMAIN_OWN_INPUT → handleDomainOwnInput`
  - `WEB_DOMAIN_SEARCH → handleDomainSearch` (moved from customDomain)

---

## Task Breakdown (Phases)

### Phase 1 — State scaffolding (foundation, no user-facing change)
- [ ] Add new states to `states.js`
- [ ] Register handlers in `router.js`
- [ ] Create migration `018_payment_discounts.sql` + apply
- [ ] Add `website_amount`, `domain_amount` columns to payment records

### Phase 2 — Move domain choice before preview
- [ ] Add `handleDomainChoice()` in webDev.js (yes/no/have-own)
- [ ] Add `handleDomainOwnInput()` for existing-domain path
- [ ] Wire `WEB_COLLECT_CONTACT` → `WEB_DOMAIN_CHOICE` (instead of straight to generate)
- [ ] Move Namecheap search to pre-generation position
- [ ] Save domain to metadata without creating Stripe link yet

### Phase 3 — Generate with combined Stripe link
- [ ] Generator/deployer accepts `selectedDomain` + `domainPrice`
- [ ] After Netlify deploy, create ONE Stripe link = `website + domain`
- [ ] Activation banner reads combined amount
- [ ] Preview URL + Stripe CTA sent in chat (same amount)

### Phase 4 — Remove redundant post-payment domain offer
- [ ] Delete domain-re-offer block in `postPayment.js`
- [ ] Ensure payment confirmation → auto-register if `selectedDomain` exists

### Phase 5 — 23h discount follow-up
- [ ] Add `applyDiscount()` function in `followup/scheduler.js`
- [ ] Compute new amount (20% off website only)
- [ ] Implement `deactivatePaymentLink()` in `stripe.js`
- [ ] Create new Stripe link
- [ ] Update payment record (mark `discount_applied=true`)
- [ ] Redeploy activation banner with new price
- [ ] Send WhatsApp nudge with new link

### Phase 6 — Edge cases + hardening
- [ ] Prevent double-discount (check `discount_applied` flag)
- [ ] Handle Namecheap API failure gracefully
- [ ] Handle Stripe deactivate failure (log + continue)
- [ ] Handle user revising website AFTER banner deployed (re-use existing redeployer)
- [ ] Handle user picking a different domain mid-search
- [ ] Abandoned "skip" path — ensure pure website Stripe link still works

### Phase 7 — Testing
- [ ] Manual test 3 paths: has-own / need-new / skip
- [ ] Manual test discount firing at 23h (override cadence for test)
- [ ] Verify banner updates on preview
- [ ] Verify old Stripe link dies, new one works
- [ ] Verify post-payment deploys to custom domain
- [ ] Verify admin dashboard shows discounted vs original amount

### Phase 8 — Cleanup
- [ ] Deprecate `DOMAIN_OFFER` state (keep alias for in-flight users for 7 days)
- [ ] Remove stale `SITE_COST = 100` constant from `customDomain.js:10` — use `env.activationPrice`
- [ ] Update `PIXIE_FEATURES.md` + `PROJECT_OVERVIEW.md` to reflect new flow

---

## Data / Metadata Fields

User metadata will carry:
```js
{
  websiteData: {...},          // existing
  domainChoice: 'need' | 'own' | 'skip',
  selectedDomain: 'glowstudio.com',
  ownDomain: 'glowstudio.com',     // if user said "have own"
  domainPrice: 13,                  // USD per year, from Namecheap
  websitePrice: 199,                // current activation default
  lastPaymentLinkId: '...',
  lastPaymentAmount: 212,           // combined
  discountApplied: false,
  followupStage: '2h' | '12h' | '23h_discount'
}
```

Payment record will carry:
```js
{
  amount: 212,                  // current (possibly discounted)
  original_amount: 212,         // before any discount
  website_amount: 199,          // split
  domain_amount: 13,            // split
  discount_applied: false,
  discount_pct: 0,              // 0 or 20
  service_type: 'website',
  selectedDomain: 'glowstudio.com'
}
```

---

## Testing Plan

### Happy paths
1. **Need new domain + pay in chat**
   - User flows through collection → picks .com → preview shown → pays → site live on domain
2. **Has own domain + pay**
   - User provides existing domain → preview shown → pays → DNS instructions sent
3. **Skip domain + pay**
   - User skips → preview shown → pays → site stays on .netlify.app

### Discount paths
4. **23h trigger, need-new path**
   - User picks domain, doesn't pay → at 23h, discount fires
   - Verify: new Stripe link amount = `floor(199 × 0.8) + 13 = 159 + 13 = 172`
   - Verify: banner on preview updated to show $172 (with strike on $212)
   - Verify: old link returns "link no longer active"
5. **23h trigger, skip-domain path**
   - User skips domain, doesn't pay → discount = `floor(199 × 0.8) = 159`
6. **User pays AFTER discount applied**
   - Discount fires → user pays $172 → confirm payment → register domain → done
7. **User pays BEFORE 23h**
   - Pays at 18h → discount job skips (already paid)

### Edge cases
8. Namecheap returns zero available domains → fall back to "try different name"
9. User types "skip" during Namecheap search → exit domain flow, just do website
10. User revises website during preview → redeploy site with same banner amount
11. Two discount triggers (23h + 47h fallback) → second triggers no-op because `discount_applied=true`

---

## Risks

| Risk | Mitigation |
|---|---|
| Deactivating old Stripe link fails mid-flow | Log + create new link anyway; admin dashboard flag |
| Redeploy banner fails (Netlify error) | Fallback: banner still points to NEW Stripe URL (lowest-priority update) |
| User already clicked old Stripe link when discount fires | Stripe checkout will fail gracefully; they'll return for retry |
| Namecheap price changes between search and payment | Lock domain_price at selection time, use cached price through flow |
| Preview shown but user never approves → never paid | Existing 22h deletion job still cleans up |
| In-flight users in old `DOMAIN_OFFER` state | Keep handler alias for 7 days, log warning |

---

## Open Questions for User

1. **Discount stacks with negotiation?** If user also objects on price (triggers split-payment offer), does the 20% still apply to split amounts? → Suggested: discount applies first, split is offered on the discounted amount.
2. **Preview URL during discount?** Same .netlify.app URL, or redeploy to new URL? → Suggested: same URL, just update banner.
3. **Multiple domains on one order?** E.g., user wants .com AND .net → scope says one domain, keep it simple.
4. **Banner discount display**: strikethrough the original price? → `~~$212~~ **$172** — 20% off today only`
5. **Discount window close**: expires at what point? → Suggested: 24h after discount applied (so total 23h + 24h = ~47h total window)
6. **Refund behavior with discount**: unchanged, standard refund handler applies

---

## Estimated Scope

| Phase | Est. LOC | Est. Time |
|---|---|---|
| 1. State scaffolding | ~80 | 30 min |
| 2. Domain choice pre-preview | ~300 | 2 hrs |
| 3. Combined Stripe link | ~150 | 1 hr |
| 4. Remove redundant offer | ~30 | 15 min |
| 5. Discount follow-up | ~250 | 2.5 hrs |
| 6. Edge cases | ~100 | 1 hr |
| 7. Testing | — | 2 hrs |
| 8. Cleanup | ~50 | 30 min |
| **Total** | **~960 LOC** | **~9.5 hrs** |

---

## Ready to Build?

Before I start writing code, I'd like to confirm:

1. Proceed with this plan as-is, or adjust anything?
2. Answer the 6 open questions above?
3. Any preference on rollout — single big branch, or phase-by-phase commits?
