# Briofold Phase 9 — code-level seal and release handoff

**Scope:** Briofold unified commerce payment UI, not the unrelated Store-first subscription checkout plan. The user explicitly owns physical phone/provider/bank/manual tests; these are separate from this **code-level** gate. This document is not a production deployment certificate.

## Dependency and source authority

- Repository: `masharzy/ekmivo`; implementation branch: `agents/phase9-payments`; PR: [#138](https://github.com/masharzy/ekmivo/pull/138), based on Phase 8 `agents/phase8-commerce` (PR #136), source SHA `411090a2fa6a13f10e4ac972d3653d86e4f424a6`.
- Phase 8 prerequisite Foundation CI [39707671306](https://github.com/masharzy/ekmivo/actions/runs/39707671306): Web, Go, Android and Docker jobs all succeeded. This does not imply Phase 8's production migration/deployment is complete.
- Canonical `/payments`, `/payments/transactions/{uuid}`, `/sms-data`, `/sms-data/{uuid}`, `/payments/links`, `/payments/refunds`, `/invoices`, `/customers/financial`, `/settings/payment-methods`, `/settings/devices`, `/settings/webhooks`, `/settings/activity` retain the existing authenticated merchant finance readers and opaque UUID detail IDs. Legacy workspace URLs remain available. The server resolves workspace membership and `live` realm; browser path/query cannot authorize a different workspace or environment.
- Reusable payment links and one-time payment requests coexist on `/payments/links`. `?view=requests` is a presentation selector; an absent reusable-link entitlement does not hide the existing one-time-request workflow. Deep links from invoice activity select their actual authorized document/request record rather than a dead legacy route.
- Central order finance references navigate to their authoritative payments/invoices/refunds. COD, packaging slips, merchant-imported statements and provisional transport acknowledgments never become gateway-paid evidence from a link click.

## Code-level acceptance evidence

| Boundary | Automated assertion / evidence |
| --- | --- |
| Source → Go API | `pg04-financial-smoke.mjs` provisions physically separate disposable sandbox/live PostgreSQL realms and restricted finance readers; matcher, five-field matching, evidence uniqueness, provenance, allocation caps, refund/invoice and outbox tests use fictional records. |
| Browser → Next → authorized Go → finance | `briofold-phase9-browser.mjs` seeds a fictional, internally consistent account, intent, immutable attempt, SMS evidence/observation, payment, allocation, device/transport/result and webhook endpoint **only in the ephemeral live-test realm**. No physical SMS is sent and no provider callback is claimed. Real Next + Go processes and owner/viewer session cookies read the same authorized record and amount. |
| Old/new parity | Canonical and legacy payment and incoming list/detail routes expose identical record-row/detail facts; verified BDT amount agrees with the finance reader; reading cannot create a duplicate confirmation. |
| Isolation and actions | Viewer authorized read but no payer digest/raw number; cross-tenant scoped request rejected; viewer webhook mutation denied and endpoint unchanged; absent UUID detail returns no foreign record. |
| Links and entitlements | Static routing contract plus mounted browser `/payments/links?view=requests` verify server-preserved mode, authorized request table, no hidden quota-dependent reusable-link prerequisite, invoice/request deep-link destinations. |
| Responsive and locale | 96 browser route cases: six payment/receipt/method/webhook destinations × four widths (`320`, `360`, `768`, `1440`) × EN/BN × light/dark. Assert successful HTTP, no root horizontal overflow, no UI alert or hydration error, theme selection; capture four narrow payment screenshots. Reduced-motion media path checked separately. |
| Static/release | Node route/security contract, TypeScript, full ESLint, Next production build, OpenAPI/payment schema check, existing Go/Android/Docker jobs, and GitHub Foundation CI. |

## Scope boundaries, rollback and handoff

- No financial table/ledger/worker/parser migrations or writes to production. Test fixtures are confined by explicit loopback host and `ekmivo_pg04_live` database-name checks. Existing schema and provider-truth logic remain authoritative.
- **Physical/manual validation intentionally excluded from this code-level seal:** actual Android SMS permission/pair/disconnect/reconnect/delete on hardware, genuine bank/bKash/Nagad/Rocket success or cancellation, provider settlement, outbound webhook receiver delivery, physical accessibility/device handling and configured production credentials. Ownership stays with the user. Automated tests do not substitute for those tests, and their result must not be described as passing.
- Do not merge Phase 9 before Phase 8's integrated release prerequisites; do not migrate/deploy from this branch as part of code-level seal. Phase 8 migration `0141_briofold_commerce.sql` was *not* on production at the supplied handoff. Recheck current production before separate cutover authorization. Preserve all Store-first subscription branches and merchant finance realms.
- Code rollback: revert or withhold Phase 9's additive UI/routes/tests while preserving legacy workspace navigation. No data rollback needed because this phase introduces no schema change. Phase 10 is outside this scope.

## Final verification record

The authoritative code-seal commit, final Foundation CI run, all four job conclusions and screenshots artifact reference belong in [PR #138](https://github.com/masharzy/ekmivo/pull/138). **Do not mark this document's gate passed until that exact PR head reports green.**
