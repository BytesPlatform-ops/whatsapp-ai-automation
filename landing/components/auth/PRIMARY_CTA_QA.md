# Mobile primary CTA — QA record

Single source of truth: [`usePrimaryCta.ts`](./usePrimaryCta.ts) → `resolvePrimaryCta(authed)`
(pure, assertable) wrapped by the `usePrimaryCta()` hook.

Consumed by:
- Hero CTA — `mobile/MobilePinnedRoleExperience.tsx` (`data-testid="mobile-primary-cta"`)
- Menu CTA — `mobile/MobileMenuOverlay.tsx` (`data-testid="mobile-menu-primary-cta"`)

## Expected resolver values
| authed | label | href | showArrow |
|---|---|---|---|
| `false` | Join Pixie | `/login` | true |
| `true` | Enter Pixie Lab | `/pixie-lab/for-you` | true |

`Join Pixie` routes to `/login` — **not** the waitlist / `/join-pixie`.

## Verified (Playwright, headless Chromium @2x, isMobile)
Signed-out (live) and signed-in (seeded `@supabase/ssr` cookie session +
`/auth/v1/user` intercept):

- **Signed-out** — hero & menu: `Join Pixie` → `/login`, arrow present, hero===menu, 0px overflow, no console errors.
- **Signed-in** — hero & menu: `Enter Pixie Lab` → `/pixie-lab/for-you`, arrow present, hero===menu, no console errors.
- Widths checked for 0 horizontal overflow: 360×740, 375×667, 390×844, 430×932.
- Header stays a subtle glass on scroll (no dark flash); only one primary CTA in the hero.

## How to re-run the signed-in check manually
The app uses cookie-based sessions (`@supabase/ssr`). Log in normally, then load
`/` on a mobile viewport — the hero + menu CTA should read “Enter Pixie Lab →”.
