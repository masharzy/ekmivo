# Dashboard shell and remaining pages — UI redesign handoff (2026-10-16)

Visual source of truth: owner-approved `ekmivo-dashboard-v2.html` Overview and modal interaction reference `ekmivo-workspaces.html`. **No changes to the Overview component or business logic.**

## Code implemented
- Dashboard shell: 40px compact workspace switcher with ellipsis; no "Current business" or separate settings icon; popover with current checkmark, Manage workspaces, and New workspace (opens existing create dialog through `?create=1`). Esc/outside closes desktop menu. Mobile workspace switcher menu styled as a bottom sheet. Sidebar fixed top + scrollable middle, hidden native scrollbar and conditional fade when more items are available, 34px menu rows, footer removed. Header initial/avatar visible at 32px with account popover. Product/search/language/theme/bell/help preserved.
- Navigation: distinct icon for Transactions, API Docs and API Keys; API Docs remains `/developers`, API Keys untouched. Removed separate One-time Requests sidebar item in favor of Payment Links tab while preserving its route. Prefetch and existing transition progress retained.
- Payment methods: compact account ledger, copy number button, phone/status summary, Manage drawer; existing Add/Edit modals and Enable/Disable confirmation. Same read and POST contracts.
- SMS devices: five-column table (phone, status, last sync relative with exact tooltip, waiting count, action); create pairing, QR, details and disconnect all in modal/drawer. Expired pairing offers reconnect via safe revoke confirmation and existing connect flow. Existing signed pairing and phone management API preserved.
- Payment links: shared page title and underline tabs, tab-dependent New link/New request, six-column payment link table with a row popover (checkout/copy) and existing details drawer. Long human references truncated only visually.
- One-time requests: modal-only request creation, source document issuance in a separate modal instead of inline Advanced section, five-column table, search/status filter, row menu for checkout/copy/cancel, details/history drawer, 20/Load more. Kept same request, source and cancellation APIs. No raw UUID in request rows.
- Merchant text: one shared status-name mapping for links, request and SMS phones; plain-language labels on dashboard sections; generic breadcrumb/eyebrow hidden on payment dashboard, approved Overview unchanged.
- Light/dark tokens, base sizes, hairline borders, responsive 360px minimum, native dialog focus handling and reduced-motion styling.

## Not introduced / retained semantics
- Existing service pairing is **workspace-level**. Per-account SIM/device binding is intentionally not invented: latest payment rules prohibit a device-to-receiving-account mapping. Payment methods can link to the existing SMS devices page; accounts show paired workspace phones, not a misleading per-account binding claim.
- No new endpoints, schema, payment confirmation rules, webhook delivery rules, permissions, fake records or payout data.
- Existing error/loading states remain driven by real API responses.

## Verification evidence and pending checks
- Vercel frontend preview build on this branch reached READY at commit `0a26cb0695ac`; earlier temporary PostCSS failure was corrected (invalid wildcard selector). A build on any later HEAD commit is pending until verified; READY does not equal browser E2E acceptance.
- Authenticated browser QA pending: desktop/360px EN/BN, both themes, all nav popovers and keyboard/Esc, focus restoration, modal input validation, permissions of viewer/editor vs owner/admin, actual payment methods/phone reads, pairing QR, one-time source issue, request create/cancel, checkout links, and link details.
- Navigation data-ready transition/partial RSC swap flicker still needs a real browser check; progress/prefetch are wired but have not been timing-tested against live routes.
- Other lower-traffic pages (Integrations, Payment alerts, Help, Billing, workspace tools) need an authenticated visual audit to confirm no residual duplicate text or old interaction patterns beyond the shared-shell/theme changes.
- Scroll overflow fade, bottom-sheet behavior, and row action popovers particularly need real 360px-browser checks. No screenshots or manual mobile passes claimed.

## Owner checklist
1. Open Payment methods, verify compact rows and Add/Manage/Edit/Disable.
2. Open SMS devices, test Connect → QR, close/reopen and expired pairing.
3. Open Payment links, use both tabs, create link/request/source document, copy/open checkout, and open details.
4. Test workspace switcher/desktop/mobile, header avatar/sign-out, API Docs/Keys, theme and language.
5. Confirm customer payer-number read remains a separate backend fix (PR #65), not included in this UI-only change.

This is a UI implementation and review branch; no user-device or payment-provider testing has been performed.
