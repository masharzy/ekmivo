# Buyer-selected upgrade timing

A buyer changing to a paid higher plan while a finite current term remains can choose Activate now or After current plan ends before payment. Now retains the existing prorated upgrade price and current expiry. Period-end charges the full new term upfront, preserves the current plan, and schedules the pinned new version only after verified payment. The new full term begins at the current paid period boundary, not the payment date. First purchases, renewals, existing period-end downgrades and system unlimited access retain their previous behavior.

The quote pins activation timing, start/end, price, version and subscription revision. The buyer sees dates and price; the payment action rejects a stale or mismatched quote. Issuance/reconciliation preserves proof/amount/idempotency checks. A previously paid scheduled change cannot be silently undone/overwritten; duplicate proof cannot grant access twice. A transfer made after its promised boundary, or a stale paid revision, requires review instead of silently granting an incorrect term. Billing returns a distinct conflict with buyer guidance rather than reporting an outage.

Activation is evaluated under the existing workspace lock by payment_plan_effective on the first entitlement read at/after the boundary. No browser visit or background timer is required for API entitlement checks. The pinned paid plan/version and quoted expiry activate once with audit. Paid schedules and start/end dates appear in Billing and invoice details; unpaid future selections grant no access.

Validation:
- Isolated Neon rollback fixture: no-plan/invalid-timing/cross-tenant denial; immediate proration; full-price future start/end; unpaid selection has no effect; wrong amount denied; invoice/proof replay; current entitlement preserved after prepayment; paid schedule metadata; stale quote rejection; paid undo/overwrite blocked; boundary activation once with a full term; late transfer review.
- Existing dashboard billing fixture run inside a rollback wrapper: renewal, downgrade, free transition, proration and quote/proof regression passed. Test branch lacked migration 0076, so that existing prerequisite was applied there before testing 0105. Production already had 0076.
- Full Go suite, Next production build, targeted lint, 16 feature/resource/quote tests, 6 responsive cascade tests and admin design verifier passed.
- Runtime role can execute the new quote function but cannot select the private quote table. Production system entitlement remains infinity.

Control migration 0105 applied with SHA256 8f72e53abc81d3ddffa17211f366e8df972136013f1414a08d0bdb82e40dcb02. No synthetic purchases or grants were created in production.

Manual pending: owner EN/BN light/dark mobile/desktop check of the timing buttons and quoted dates, plus a real payment-backed immediate/future upgrade. No browser, physical-device or wallet-transfer pass claimed.
