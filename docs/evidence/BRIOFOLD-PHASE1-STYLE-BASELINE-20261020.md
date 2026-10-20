# Briofold Phase 1A — owner-approved current design stability

Date: 2026-10-20. **Status:** Guard-only safe checkpoint, NOT the completed physical CSS isolation phase.

## Owner instruction and non-goals

The current merchant Payment Gateway dashboard, marketing homepage and Admin panel visually work and are already separate in the user-observed interface. **Do not redesign them or refactor functioning application styling just because the import graph looks untidy.** Any later isolation must preserve their pixel appearance and operations.

- Merchant dashboard standard: current approved Payment Gateway Overview/components/tokens, **not the homepage**. Preserve the exact existing computed CSS baseline, Bengali Hind Siliguri, current payment dashboard English font, dark/light/system, spacing, tables, drawers and controls.
- Marketing stays marketing, Admin stays admin, Checkout stays standalone. No global selector or token hijack may re-skin payment dashboard.
- This Phase 1A commit changes **no production CSS, no React components, no dashboard routes, no payment APIs, no DB, no assets**.
- Only adds a code-level design contract test + existing mobile responsive cascade smoke test into CI.

## Actual baseline facts found in repo

- Root: `apps/web/src/app/layout.tsx` imports `./globals.css`. That stylesheet currently imports home, dashboard, checkout and admin styles together. **Physical build/chunk isolation has NOT been done.** Do not claim otherwise.
- Payment styles are already scoped under `.ds-app[data-service="payments"]` in `dashboard-v2.css` and additional dashboard CSS; current approved payment base color/radius/typography differs from homepage.
- Admin styles use `.pa-root.pa-admin-design` (and dedicated `styles/admin` token/component files).
- Homepage brand styles are opt-in to `.em`/home-scoped selectors.
- The cascade and paint already look correct to the owner. Altering stylesheet load timing/import order or moving CSS to nested layouts could silently change Next.js client transitions, public chrome, payment tables and Admin.
- Existing `apps/web/scripts/dashboard-responsive-cascade.test.mjs` asserts selected approved mobile/desktop shell behavior, but previously was not invoked from the main CI workflow.

## New automated safety net

`node --test apps/web/scripts/briofold-design-boundary.test.mjs apps/web/scripts/dashboard-responsive-cascade.test.mjs` (run inside `apps/web` using `node --test scripts/...`).

Catches:
1. Accidental reordered import precedence between home, approved payment overrides and Admin.
2. Accidental approved light/dark Payment dashboard token drift.
3. Marketing token scopes becoming generic root tokens.
4. Admin token scope or locked measurements changing unexpectedly.
5. New direct marketing stylesheet imports in dashboard shell.
6. Mobile/desktop payment dashboard shell cascade regression (existing test now runs in CI).

This is **static contract protection**, not screenshot parity, not end-to-end API coverage, and not a guarantee that all CSS selectors are physically isolated.

## Next, before changing CSS imports

1. Capture real authenticated before/after screenshots at 320/360/768/1440 for all three surfaces, Bengali/English and dark/light; safely use seeded/mock data without modifying user merchant records.
2. Inventory which global rules the existing dashboard actually depends on. Prepare a shadow-route or opt-in stylesheet refactor with no hard switch for production.
3. Prove no visual changes and no hydration/CSS ordering flashes on initial navigation, back/forward, client transitions and hard reload.
4. Only then split route-specific CSS if this yields real isolation benefit. Keep successful old styles available behind rollback/flag.
5. Merge solely after responsive/UI, Go/Next, financial browser and admin CI passes.

## Phase status

- Phase 1A design risk audit/guard: code in PR, subject to CI; baseline styling unchanged.
- Phase 1B physical `globals.css` decoupling: **not started / not shipped**. Need browser visual regression evidence and explicit low-risk rollout.
- Unified dashboard, feature parity, billing, routing migration: not touched.
