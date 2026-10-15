# Payment Dashboard V2 — UI-only handoff (2026-10-15)

Source of visual truth: user-approved `Ekmivo Pay · Overview.html` and three-page demo. No new gateway workflows, endpoints, SQL migrations, financial totals or permissions in this change.

## Implemented code
- Shared light/dark/system dashboard palette, Geist/Hind Siliguri, 232px sidebar, compact pages, cards and 6-column tables.
- Keep navigation content while loading, 2px top route progress, sidebar link prefetch on hover/focus.
- Overview: compact setup notice + checklist modal, real-data 7-day volume chart, compact stats and action center; alert-only connection panel.
- Payments and incoming SMS: modal/drawer details, up to six columns, payer number and TrxID sourced from existing approved reads.
- Customers and invoices: table row details drawers; create/edit modal; customer CSV drag-and-drop/template + existing preview/import.
- Payment links: six-column table, details drawer with publish/archive/copy/edit actions; create/edit modal preserves reference, description, amount, optional return URL, expiry, max uses, quantity, image URL and custom checkout fields.
- Refunds: compact table, details drawer, native seller-decision dialog; original refund POST contract remains.
- Reports: merchant-facing labels and compact financial layout; existing reconciliation calculation and export source remain unchanged.
- Payment methods: receiving-account add/edit modals; existing source of accounts and management POSTs.
- SMS devices: pairing form modal, details drawer, existing signed QR pairing and management calls.

## Verification pending — do not mark accepted
- Next.js/TypeScript build and lint in repository checkout (not run through GitHub connector).
- Browser QA on real deployed route: 360px desktop/mobile, both themes, BN/EN, field validation and native dialog keyboard/focus behavior.
- Actual Live/Sandbox real-data loads, authorization and amount reconciliation; no dummy records introduced.
- End-to-end create/edit/publish payment link, server validation of redirect URL/expiry, CSV import, refund decision and device pairing.
- Pending pre-existing Customer Details 404 and One-time Request workspace error remain separate from UI work.

This is a review branch. Do not merge or deploy without the pending verification.
