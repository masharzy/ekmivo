> **Actual Neon migration execution — 2026-10-13:** Applied `0051_pg06_late_sms_refund.sql` successfully to `ekmivo_sandbox_financial` AND `ekmivo_live_financial` on Neon project `sparkling-mountain-38618629`, production branch `br-solitary-river-b3ztvg8j`. Before applying, executed all 21 SQL statements transactionally on isolated test branch `br-shiny-moon-b3eev2dt` for BOTH realms; all succeeded. Primary realm migrations returned successfully. Postflight in both primary financial databases: `pg06_phone_candidate`, 18-arg `pg06_phone_forward`, refund-case trigger, refund source columns, unique refund index and reader grants all present. Pre/post counts: payment_attempts=0; verified financial_payments=0; existing live phones=4, sandbox phones=0. No live SMS/provider/checkout/refund lifecycle tests performed, and no web/Android backend code deployed in this operation. Render Go backend still tracks main; feature code is in PR #19. This **supersedes older "not applied" statements**; migration success does not mean product acceptance. CI runners have exhausted their limit / jobs ended before any build steps.

# PG06 / PG07 / PG11: phone SMS, offline recovery and delayed refund handoff

Implementation PR: #19. Source only, NOT device/provider verified or deployed. Latest repair: offline capture remains eligible after phone config-version rotation (signed enrollment and immutable checkout remain authoritative); concurrency lock now uses workspace/environment/payer/method/amount rather than a receiver account. Queue history retains every unsent row while only older successful history is pruned; a worker drains up to 30 receipts before heartbeat.

## Owner decisions (2026-10-13)

- Payment Methods / SMS devices count: account/device quotas are **plan-managed in future**. Plans are OFF during this implementation. No "unlimited plan" contract or hard-coded infinite entitlement.
- Phone app does not display SIM slot selector or require mapped receiver/SIM account numbers.
- Merchant pairs multiple Android phones via current one-time code/QR. Signed forwarding collects only allowlisted bKash/Nagad/Rocket payment SMS, not arbitrary inbox/OTP.
- The backend uses **the signed phone's enrolled workspace** and matches the original receipt's full payer, amount, provider and original transaction timestamp to exactly one immutable checkout attempt. The displayed/selected receiving number does NOT disqualify a customer who paid another account owned by that merchant.
- Server attributes received funds to the matching *attempt's* receiving-account route for existing financial schema compatibility; that account is **NOT evidence of the actual SIM recipient**. Do not represent inferred account as provider-confirmed receiver.
- Provider message ID (TrxID/TxnID) is internal dedup data. Customer does not type TrxID.
- If original transfer time is in the issued attempt window but receipt processes **after** intent expiry/cancellation, create one seller-managed refund request. Do not auto-send money and do not falsely mark payment verified. The seller's return is independent/external and seller-reported return is not provider confirmation.
- Duplicate SMS/ambiguous matching never pays two attempts.

## Android capture and lifetime

- Android SMS_RECEIVED_ACTION can reach the manifest receiver while the app UI is closed; signed evidence is put into an encrypted SQLite outbox before WorkManager sends it.
- Unique constrained network WorkManager resends pending items in order and deletes them only after a durable backend ACK. Network loss does not delete the queue; the UI displays `Waiting to send`, `Forwarded`, sender/amount/time hints, backlog, errors and Retry. These are **transport**, not financial verification results.
- Boot receiver schedules WorkManager again after BOOT_COMPLETED or MY_PACKAGE_REPLACED.
- An app **cannot execute while the phone is powered off**, and Android force-stop/OEM background limits can prevent capture/restart. The optional `Recover missed SMS from inbox` action requests restricted READ_SMS permission **only on user tap**, scans a bounded recent inbox window and forwards only allowlisted payment-looking provider messages. It is not a guarantee of lossless history.
- `READ_SMS` is policy-restricted for Play distribution; owner must review eligibility and use approved capabilities/distribution. Tests on several OEMs are mandatory.
- Supported built-in server receipt grammars: two owner-supplied formats (bKash with optional Ref, Nagad with Ref). Rocket and other provider message variants can forward, but remain unverified/pending until a reviewed grammar based on actual consented receipts exists.

## Migration and operations

- 0051_pg06_late_sms_refund.sql is an additive migration for **each independent Sandbox and Live financial DB** after prerequisite 0045–0050 and PG11. Requires the migration-owner credentials and explicit `PG06_LATE_SMS_REFUND_ALLOW_MIGRATION=true` with `PG06_LATE_SMS_REFUND_MIGRATION_FILE=infra/migrations/0051_pg06_late_sms_refund.sql`. It must not touch auth/control DB.
- This SQL intentionally extends PG11 refund requests to permit a receipt-backed claim with no successful payment row; the normal seller refund UI lists both kinds, and only a seller can report external return.
- **Applied on 2026-10-13:** The isolated Sandbox/Live primary Neon databases now have 0051, as recorded above. No real money was transferred or refunded in testing.

## Manual verification / blockers

- [ ] Build Kotlin APK and verify pair, RECEIVE_SMS consent, relevant SMS only, background stopped UI, reboot, Wi-Fi/cellular outage, retry, no duplicated ACK and encrypted history on two actual devices.
- [ ] Exercise optional READ_SMS consent and bounded recovery, denied permission, Android force-stop and Play policy review. Do not claim impossible powered-off execution.
- [x] Apply 0051 transactionally to disposable isolated Sandbox and Live branch copies; verify new functions/permissions and repeat on both primary financial realms.
- [ ] Still required: SQL rollback/race/cross-tenant behavior and actual end-to-end provider/device tests (no such pass claimed).
- [ ] Controlled provider receipt samples: bKash with/without Ref, Nagad, Rocket (format missing), varying Android sender labels and time precision. Sender is from SMS body, not originatingAddress.
- [ ] Three merchant accounts on two paired devices; paid to a different account than selected on checkout; server must still find exact UNIQUE payer/amount/method/time attempt.
- [ ] No intent, wrong payer, wrong amount, transaction before issuance, duplicate receipt, same payer+amount+time overlapping attempts, unsupported format, masked payer and spoofed provider SMS: must NOT mark Verified.
- [ ] Real signed SMS whose transaction time is within attempt but arrives after expiry/cancel: creates exactly one seller refund request with payer contact, reason and amount; payment stays unverified. Merchant action must never initiate an automatic refund transfer.
- [ ] Slow/lost ACK, HTTP 503, background shutdown during resend; encrypted outbox survives until durable ACK.
- [ ] CI and browser/responsive EN/BN dark/light checks; all upstream runners failed before running steps in the first PR run, so no test passes are claimed.

## Known limitations

- Sender label plus device signature do not cryptographically prove bKash/Nagad/Rocket issued the receipt. Fraud threat testing and merchant policy still apply.
- A different personal receiving account on the same merchant phone is intentionally not excluded; if its valid-looking SMS matches an *unrelated* active request across all four fields, attribution may be incorrect. This is a user-selected product trade-off.
- If original transfer timestamp is **outside** the immutable payment window, evidence stays unmatched and needs reconciliation; a later unrelated transfer is not automatically converted into a refund claim.

## Source-level verification performed

- Parser grammar replayed against the three owner-supplied bKash/Nagad strings and three negative messages (OTP, masked payer, outgoing); exactly the intended grammar matched each sample in an independent JavaScript regex sanity check. This is **not Go test execution or Android/provider testing**.
- Static assertions checked 0051 transaction envelope, sender-based issuance and matcher lock, absence of stale configuration rejection, and one-case-per-receipt unique index.
- GitHub Actions [first run](https://github.com/masharzy/ekmivo/actions/runs/38344385146), [second run](https://github.com/masharzy/ekmivo/actions/runs/38344793063) and [third run](https://github.com/masharzy/ekmivo/actions/runs/38344904738) all reported failure with *zero job steps*, and downloadable runner logs returned not-found. Treat as runner/execution blocker, not successful validation or demonstrated code failure.
- Required before release: real Go/Next/Kotlin tests, disposable sandbox/live Postgres upgrade and payment/refund race fixtures, Android receive/reboot/airplane-mode/force-stop recovery, Play permission eligibility, responsive EN/BN/theme review.

## Latest source fixes, still unverified

- The signed physical-phone configuration version is preserved for audits, but a newer configuration no longer invalidates already queued consented provider SMS. Revoked phone/realm checks still apply.
- Server serializes issuance/matching by workspace, realm, actual payer, provider and amount regardless of displayed receiving account.
- Successful Android sync drains batches and schedules continuation without treating a nonempty queue as a failed transport. Unsent encrypted rows are not pruned from local history; merchant can load more and see pending first.
- The optional inbox-recovery ContentResolver query is restricted to known bKash/Nagad/Rocket senders before reading the message body.
- A uniquely associated post-expiry/cancellation receipt creates one seller-managed refund request and merchant dashboard notification, plus an audited refund.updated webhook event. It never transfers money automatically.
