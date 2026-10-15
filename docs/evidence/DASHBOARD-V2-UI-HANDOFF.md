# Payment Dashboard V2 — UI-only handoff (2026-10-15)

Source of visual truth: user-approved `Ekmivo Pay · Overview.html` and three-page demo. No new gateway workflows, endpoints, SQL migrations, financial totals or permissions in this change.

## Implemented code
- Shared light/dark/system dashboard palette, Geist/Hind Siliguri, 232px sidebar, compact pages, cards and 6-column tables.
- Keep navigation content while loading, 2px top route progress, sidebar link prefetch on hover/focus; global payment toast is bottom-center and auto-dismisses after 3 seconds.
- Overview: compact setup notice + checklist modal, real-data 7-day volume chart, compact stats and action center; alert-only connection panel.
- Payments and incoming SMS: modal/drawer details, up to six columns, payer number and TrxID sourced from existing approved reads.
- Customers and invoices: table row details drawers; create/edit modal; customer CSV drag-and-drop/template + existing preview/import; CSV Export runs from a modal and uses the existing queued export API. Invoice cancellation uses shared one-sentence confirmation.
- Payment links: six-column table, details drawer with publish/archive/copy/edit actions; native archive confirmation; create/edit modal preserves reference, description, amount, optional redirect URL, expiry, max uses, quantity, image URL and custom checkout fields. Overview Create opens the modal via create=1 route state.
- Refunds: compact table, details drawer, native seller-decision dialog; original refund POST contract remains.
- Reports: the six requested Summary / Payments / Methods / Customers / Refunds / Payouts tabs, merchant-facing labels, compact financial layout, and existing calculations. Payouts clearly show data unavailable because no payout report source is in this scope. Export opens a native modal, with real CSV full/summary export or browser Print/Save PDF (no fake Excel file).
- Payment methods: receiving-account add/edit modals and native enable/disable confirmation; existing source of accounts and management POSTs.
- SMS devices: pairing form modal, details drawer, confirmation before disconnect, existing signed QR pairing and management calls.

## Verification evidence and blockers
- Vercel preview deployment READY at commit `9bac1d4483` (earlier code state). The latest branch commit is **not** verified by a fresh build.
- GitHub Foundation CI run 38769675402 failed for all four jobs **without starting any steps**; the job step lists are empty. GitHub log retrieval returned BlobNotFound, so no code-failure conclusion is supported.
- Latest GitHub commit status reports Vercel `failure` targeting `upgradeToPro=build-rate-limit` (hosting quota). Do not confuse a build-rate-limit failure with a TypeScript failure.
- Next.js/TypeScript build and lint on the latest branch SHA remains blocked/unrun.
- Browser QA on real deployed route: 360px desktop/mobile, both themes, BN/EN, field validation and native dialog keyboard/focus behavior.
- Actual Live/Sandbox real-data loads, authorization and amount reconciliation; no dummy records introduced.
- End-to-end create/edit/publish payment link, server validation of redirect URL/expiry, CSV import, refund decision and device pairing.
- Pending pre-existing Customer Details 404 and One-time Request workspace error remain separate from UI work.
- Product features intentionally not invented in a UI-only PR: server-backed payout list, saved reports, scheduled-report email, native XLSX download. The Payouts tab explicitly reports unavailable data rather than generating fake records.

This remains an unmerged review branch until latest-SHA build, responsive browser and real-data verification pass; no production rollout has been claimed.


## PR #61 integration verification — 2026-10-15

Owner requested a safe merge into main. Isolated checkout merged main `cd03152` into PR head `d51ca99` without conflicts, preserving the standalone developer portal. Review confirmed UI-only changes with no backend/API/schema changes. Fixed the lint-blocking synchronous route-effect state update with a cancellable timer; switched the dashboard to the already bundled Geist font instead of external Google Fonts requests.

- Full `npm run lint` after fixes: PASS, 0 errors / 23 warnings (warnings remain visible; not claimed clean).
- First direct webpack attempt was invalid environment evidence: skipped token prebuild and a cross-drive dependency junction caused resolution failures. Normal isolated install/build replaces that attempt.
- GitHub run 38772932493 did not start jobs: account payment/spending limit. Vercel status linked to build-rate-limit. These are infrastructure blockers, not passing CI evidence.
- Responsive/theme/locale and authorized real-data mutation scenarios remain manual pending in the consolidated ledger. No production financial mutations were made for this review. No Docker or database changes.


### Confirmed merge gate — 2026-10-16

Vercel deployment `dpl_9bveeJ3hZWun2ijef8gbbQZao1Df` is READY for exact source head `9b06830b309e0622e0d3ec0289dc11e834c531dd`. Its logs confirm `npm run build`, canonical token sync, successful Next.js compilation, TypeScript completion (20.2s), all 8 static pages and deployment completion. Preview: https://ekmivo-i0sqrwrpc-masharzys-projects.vercel.app . This is the successful production-build evidence; the slow local dependency install was superseded by this cloud build, not claimed passed.

Latest Foundation CI run `38782304211` still has zero executed steps in all four jobs; check annotations explicitly report account payments/spending limit. No protection override or admin bypass is authorized by this evidence. Browser/real-data checks above remain manual pending; this merge is source integration, not full payment acceptance.
