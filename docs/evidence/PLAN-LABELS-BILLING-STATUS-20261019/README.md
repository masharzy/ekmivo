# Plan field labels and subscription-payment checks — 2026-10-19

## Changes
- Admin numeric/select fields retain visible labels after values are entered. Reference Admin tokens, compact controls and mobile grid remain in use.
- Free plans distinguish the quota cycle from free-access duration. Paid-only grace is hidden for Free/Custom; switching away from Paid clears irrelevant grace. Review displays actual Free access duration and reset rule.
- Reset choices describe calendar month, activation-anchored N-day cycles, or one total subscription allowance. Term allowance is not described as resetting on expiry or renewal.
- Billing reconciliation returns ordinary unpaid checkout states instead of VERIFIED_PLATFORM_PAYMENT_REQUIRED. Cancelled/expired attempts never grant access. Query failures and corrupt/mismatched proof return a distinct unavailable response.
- Invoice drawer preserves the verification result, with EN/BN messages for pending, cancelled, expired, review and unavailable states. Paid allocation matching and manager authorization remain required.

## Diagnosis (production read-only)
The invoice in the owner's screenshot was issued on 2026-10-19 at 02:22:12 UTC. Its associated checkout is cancelled, with one payment attempt and no allocations. `pg13_platform_payment` returns NULL while `pg05_checkout_view` reports cancelled. Both functions grant execute to the live reader. No customer data was altered and no payment was marked paid.

An issued invoice represents an amount due, not a completed transfer. Platform subscription purchases use the configured system receiving workspace's phones/accounts, not the buyer workspace's devices.

## Checks
- Next.js production build: PASS.
- Targeted ESLint: PASS.
- Admin design verification: PASS.
- `go test ./internal/checkout`: PASS, including matching/mismatched/malformed/absent allocation proof and unpaid HTTP outcome tests.
- Node payment-status tests: 2 PASS (EN/BN; cancelled/expired avoid duplicate-payment advice, unavailable distinguished from pending, raw technical codes not exposed).
- Production read-only query confirms cancelled/no proof and reader execute privileges. No schema changes required.

## Manual pending
Owner checks actual authenticated Admin wizard on mobile/light/dark, finite/always-Free and Paid review; opens the cancelled billing invoice and checks its state; real-money successful purchase and physical SMS delivery remain owner verification. No authenticated browser or physical-device pass is claimed.
