# Ekmivo Store-first SaaS checkout — Phase 7 controlled release runbook

Scope: the Store-first subscription purchase flow (Phases 0–7). **Phase 7 is the last phase.** Briofold seller checkout, Android and merchant coupon work are separate.

**Authority boundary:** This document and the Phase 7 PR are code/release preparation. They do not authorize schema application, real payment, switching on flags, a production deploy, a merge, or a refund. The operator owns physical/provider verification and cutover.

## 1. Dependency and immutable database order

1. Verify sealed Phase 2 offer/pricing contracts, Phase 3 platform coupon PR #137, Phase 4 opaque Store-bound intents PR #140, Phase 5 dedicated Order Summary PR #141, Phase 6 wallet/financial handoff PR #139. A code-level seal is NOT the same as merged/migrated/released.
2. Confirm actual migration ledger on the isolated **control** database, with backup and rollback restore drill before any action. Do not replay an already-applied filename under altered bytes. The relevant sequence is 0133–0135, 0140–0144, Phase 3 0145–0149, Phase 4 0151, Phase 5 0152, Phase 6 0153, Phase 7 0154, then safe runtime grants 0155. 0150 remains intentionally unallocated to avoid conflicts. None of these Phase 7/control changes applies to the financial realm.
3. In a disposable control DB, run the Phase 3–7 SQL test chain in `.github/workflows/store-subscription-phase7.yml`. Its database guard **requires** `localhost/ekmivo_pg00`; never inject production URLs or import production users. Run the independent PG13 financial suite against a separately approved isolated test realm before actual payment activation.
4. `0154_platform_subscription_release_operations.sql` adds read-only, Super Admin-checked monitoring/export functions; no built-in support action marks paid or starts a refund. **0155** then grants the HTTP-facing SECURITY DEFINER entrypoints to Go's *actual* unprivileged `ekmivo_financial_runtime`, while leaving raw ledger tables and settlement/recovery functions inaccessible to that role. Verify with `tools/testing/subscription-runtime-grants.sql` before enabling any checkout flag. Legacy `ekmivo_runtime` has elevated Neon privileges and must not be selected for the Go API. The web's current owner-level database credential also requires a separately tested, least-privilege rotation before declaring full production security acceptance; neither global Neon role revocation nor an untested URL swap belongs in this migration.

## 2. Feature flag activation sequence

All listed purchase flags must stay **false** until dependencies, migrations, role grants, E2E and approval are verified:

| Order | Flag | Safe gate |
| --- | --- | --- |
| 1 | `EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED` | Selected internal accounts can request authoritative, expiring quote snapshots |
| 2 | `EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED` | Three unchecked, versioned consents are independently enforced before confirmed invoice |
| 3 | `EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED` | Existing confirmed invoice is bound once to the scoped payment capability |
| 4 | `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED` | Live provider accounts have been filtered, approved and verified in **both** API and worker paths |

Keep all flags off for preview. Admin coupon catalog and legal publication are separate controlled capabilities; enabling them does not allow checkout until the order/handoff gates are explicitly approved. Order Summary is `/checkout/order/{opaqueIntent}`; the distinct Pay screen is `/pay/subscription/{opaquePaymentToken}`. No generic merchant `/pay/{token}` fallback is permitted for this flow.

## 3. Emergency response / safe rollback

- To stop *new purchase issuance* immediately: disable `EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED`, `EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED` and `EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED`, block new UI starts, and verify 403/404/controlled unavailable responses. Keep prior invoice snapshots.
- **Do not turn off `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED` as a generic emergency action** if verified payments may be in flight. The current worker uses this same flag for asynchronous reconciliation. Continue approved, isolated settlement while new confirmations are blocked; diagnose financial worker state and only disable the payment worker on an explicit incident-authorized stop, with manual reconciliation queued.
- Do not delete pending invoice/coupon reservations as a rollback shortcut. Never re-run a new payment with a fresh token after an unknown provider response without checking the immutable financial intent. Late verified money on expired/cancelled handoffs must create exactly one recovery case; refund requires operator finance verification and audit.
- Database rollback: use verified pre-cutover restore point in a *test* clone. New additive migrations can remain unapplied in production until cutover; never `DROP` subscription ledgers while invoices exist. For a production incident, follow the DB owner's approved PITR and change-control procedure, recording exact SHA and timing.

## 4. Monitoring and action ownership

- Admin > Billing & Revenue > Recovery is Super Admin + MFA only. It reports authoritative control-plane `awaiting_payment`, `paid`, `expired`, `cancelled`, `recovery_required`, oldest pending minutes, and up to 50 unresolved cases. `SOURCE_UNAVAILABLE` is deliberately **not** mapped to zero. There are separate bounded, formula-escaped CSV exports for recovery cases and paid coupon redemption audit. Exports write `admin.csv_export` audit entries, never echo payer contacts or wallet secrets.
- SaaS-only wallet tiles require an approved live parser and one unambiguous online configured account per method; when two accounts share a method, payment selection deliberately fails closed until operators reconcile account ownership. The same restriction is rechecked on payer lock. Existing merchant checkouts retain their separate account behavior. Independently verify wallet account identity in a real financial sandbox before enabling customer payments.
- Watch oldest awaiting duration; verified financial payments without settled control entitlements; wallet provider exception counts; coupon reservation saturation; quote failures, legal-version changes, duplicate invoice/idempotency conflicts; abandoned intent growth; and email/support queues. Set thresholds after collecting baseline. A stale/unknown financial response is a pending alert, **not** proof of failure or permission to refund.
- Support may investigate order reference and user-visible progress; Super Admin may inspect read-only recovery metadata. Only vetted finance operators with independent evidence and change logging can initiate manual correction/refund in the financial realm. No admin UI shortcut is provided.
- Redirects, status pages and receipts must not expose token digests or payment capability in telemetry, URL referrers, CSV exports or logs. Verify security response headers on every protected route.

## 5. Release acceptance

Automated mandatory: exact-source PR SHA; clean Next TypeScript/ESLint/build; Go race/vet and API contracts; valid OpenAPI; admin design verifier; isolated PostgreSQL real transaction/roles/quote expiry/legal revisions/concurrency/coupon settlement/late-money recovery; no merchant checkout regressions; responsive EN/BN light/dark/system, keyboard and zoom checks where browser CI is available. Record links to each run and failure/fix history in evidence.

Operator-owned manual gates before customer rollout: separate control/financial DB credentials and network boundary; deploy smoke with seeded **test** accounts; real provider wallet allowlist/account direction; provider callbacks and unknown-response reconciliation; 320/375/768/1024/1440 viewports in EN/BN Light/Dark/System and 200% zoom; keyboard-only/assistive tech; real invoice receipt, support and refund routing; approved staged cohort → general availability; backup/PITR drill. Record screenshots with payer/token data removed.

If any mandatory gate fails, the release remains BLOCKED and all purchase flags remain OFF. Only the designated operator may authorize deployment and production migration.
