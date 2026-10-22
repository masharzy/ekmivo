# Briofold Phase 9 — initial finance UI integration handoff

Status: **IN PROGRESS — first scoped slice only. Not sealed, merged, migrated or deployed.**

Repository `masharzy/ekmivo`; working branch `agents/phase9-payments`, based on the sealed Phase 8 branch head `411090a2fa6a13f10e4ac972d3653d86e4f424a6` (PR #136). The concurrent Store-first subscription branches are unrelated and must remain untouched. The Phase 9 PR must target Phase 8 until Phase 8 is integrated and its gates are rechecked.

## Initial slice implemented

- Explicit UUID-shaped, locale-neutral canonical financial record routes for payments, incoming SMS evidence, invoices, financial customers, payment links, refund cases, payment accounts, devices, webhooks and activity. Unknown/longer IDs, unrelated route roots, AI-only businesses and disabled businesses fail routing before any financial source read.
- Financial record rendering reuses existing `PaymentOperations`, `PaymentDocuments`, `PaymentRefunds` and payment-method/device/webhook readers. The server still selects and authenticates the active workspace and approved financial environment; callers cannot choose a different workspace or realm through a detail URL. Existing source authorization remains authoritative.
- Existing finance list/detail links can opt into canonical URLs without changing the legacy `/w/{workspaceId}/payments/...` reader contracts. Payment-account direct links select only accounts returned by the authorized source list.
- Phase 8 order detail offers links to the original verified payment, invoice and refund source records. Operational COD/packing labels remain separate from financial confirmation and receipts. No finance data is copied or updated by these navigations.
- A dedicated Node contract suite is part of Foundation CI: `scripts/briofold-phase9-payment-links.test.mjs`.

## Verification so far

- Phase 9 contract cases: 4/4 passed locally on the initial implementation.
- Nine canonical route/locale/settings/AI/Phase 9 contract files passed together locally (`node --test ...`, 9/9 files passed).
- `npx tsc --noEmit -p tsconfig.json`, focused ESLint (0 errors; 5 existing warnings), `npm run payment:contract-check` and `git diff --check` passed.
- Full Next production build passed on the amended source under Node 24. It initially failed only within the restricted sandbox because Node child-process stdout was dropped; running the unchanged build in the approved non-sandbox environment passed, including type checking and generation. Final GitHub CI and integrated browser/provider checks are still required.
- Final GitHub commit, run and check results must be recorded in the PR, not inferred from this file.

## Outstanding Phase 9 gates — do not seal

1. Complete UI read parity: old and unified views must show identical authorized records and totals for payment history, links/one-time requests, incoming evidence, devices, methods, invoices/refunds, webhooks and activity. Verify positive and negative cross-tenant, realm and role cases using real disposable PostgreSQL fixtures and authenticated browser sessions.
2. Audit all residual legacy URLs and old/new detail actions, including one-time request intents, customer associations, invoice-payment history, error/loading/empty states and dashboard-level navigation. No premature route deletion or redirect.
3. Verify production rules in test environments: exact five-field/same-amount matching, evidence uniqueness, no double-confirm, no raw payer-number leak, provider cancellation/success policies, device pairing/disconnect/reconnect/delete, invoice/refund authorization and webhook replay/idempotency.
4. Add web acceptance screenshots/responsive, keyboard, EN/BN, light/dark, browser navigation and reduced-motion evidence, plus old/new parity assertions. Do not claim actual SMS/provider or physical phone flows from mocks.
5. Run all Foundation CI jobs on final Phase 9 head, resolve integration conflicts after Phase 8 merges, obtain manual/provider approvals and follow the roadmap's release order.

## Production and rollback boundary

Phase 7 production remains at the release documented in `BRIOFOLD-PHASE8-HANDOFF.md`. Phase 8's additive control migration 0141 and runtime remain unapplied/undeployed in production as of the supplied handoff; verify live state afresh before any release. This Phase 9 slice adds no migrations, financial schemas, ledger/worker/receipt-parser changes, deployed flags, provider sends or mutations. Rollback at this stage is simply withholding or reverting the separate Phase 9 UI commit; never reset concurrent subscription work.
