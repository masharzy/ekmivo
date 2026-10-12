## Physical phone / multi-account source follow-up — 2026-10-12 (CODE, NOT ACCEPTED)

Owner correction: one physical phone is paired once; multiple receiving-account/SIM or approved notification-source bindings are attached without re-pairing. New additive `0045_pg06_physical_phone_multi_account.sql` introduces `pg06_phones` and keeps legacy `pg06_devices` as stable **per-source evidence enrollments**; it backfills claimed legacy IDs without replacing device public keys, encrypted queued evidence IDs or historical receipts. A source/SIM cannot ambiguously bind two active accounts on one phone; account detach/revoke never retargets queued evidence.

Source changes: `backend/internal/checkout/physical_devices.go` and `receipt_pipeline.go` add owner-authorized phone management/one-use pairing, signed configuration/heartbeat, approved parser and server-key checks; optional full receiving identity in approved receipt parsing must equal the encrypted server account, while actual payer/time still originate only in the approved parser. Full merchant receiving numbers are decrypted only for authenticated scoped setup, and checkout already uses an immutable locked destination cipher; Web now offers an accessible copy control. Android Native Compose upgrades legacy enrollment when server supports 0045 and fetches account/source config; new source opt-in is local, while retained encrypted outbox uses original enrollment IDs.

New Ink & Bone Payment Methods and SMS Devices cards, guided setup, account management, mobile states, EN/BN and theme via tokens supersede generic CRUD on those routes. QR scanner is **not** implemented; one-use manual code is supported. Planned/created source is not production activation. Existing public Go service cannot use these endpoints until separate Sandbox/Live financial databases, approved parser registry and migration 0045 are actually configured.

Automated checks: `apps/web/scripts/pg04-financial-smoke.mjs` includes disposable two-account phone/mapping/tenant/revoke SQL assertions; `ReceiptRoutingTest.kt` checks unique per-SIM routing, ambiguity, removed queued mapping; Go `receiving_test.go` checks parsed payer/receiver distinct from SMS source. These tests require execution at the final exact commit; **no PASS claimed yet**. Source/build/CI failures, if any, must be recorded after actual run. Real SIMs/OEM, permission loss, reboot, provider receipts and one webhook per unique payment are **MANUAL PENDING**. See `USER-DEVICE-TESTS.txt`.

---
# PG06 — native receipt collection & signed evidence (NOT ACCEPTED)

## Current source follow-up — 2026-10-12

**Observed exact-source verification:** `9131284dbb908df3e36a3b188e93f8001f659a36`, [CI 38193033849](https://github.com/masharzy/ekmivo/actions/runs/38193033849), 4/4 PASS. Signed HTTP → restricted Go → SQL matching PASS with software signer/fictional sample; native unit/debug build PASS. Not a physical-device or provider PASS. The final result supersedes the in-progress wording below.

See [current audit](../PG06-PG09-AUDIT.md) for exact code/CI identity. Go now validates the approved full capture pattern/source before persistence and rejects unrelated/OTP text. Signed HTTP integration uses a software P-256 key, genuine restricted Go + PostgreSQL and a **fictional sandbox** receipt; it checks claim, heartbeat, body tamper, wrong realm/source, replay, matching once and revocation. The initial run exposed stale test authority after earlier control mutation; the test now refreshes through the real restricted provisioner, preserving fail-closed production authorization. Latest run must pass before this new coverage is called verified.

Physical Android Keystore/SIM/OEM, real consented samples, offline/reboot/permission-loss and production evidence remain **MANUAL PENDING** in the single ledger. No Android UI expansion, production deploy or real provider test occurred. Historical source-only descriptions below are superseded only where supported by newer evidence.

**Status:** preliminary source-only security work; all PG06 acceptance gates OPEN. Related S31/S32.

## Implemented
- One Kotlin/Jetpack Compose Android APK, no RN/Flutter or separate receipt bridge.
- `apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/EvidenceGate.kt`: rejects masked/missing actual payer, absent original transaction time, invalid amount, missing receiving-source binding, absent method, and outbound/reversed direction. Normalizes exact full Bangladesh mobile without guessing masked digits.
- `.../receipt/AndroidKeystoreSigner.kt`: P-256 SHA256withECDSA signing with AndroidKeyStore nonexportable private key when explicitly enrolled; DER/Base64 envelope.
- `.../receipt/DeviceSignature.kt`: method/path/transport timestamp/event-id/raw-body digest canonicalization (UTF-8).
- `backend/internal/deviceevidence/signature.go`: Go raw-body request canonicalization, P-256 X.509 DER signature verification, 5-minute transport signature freshness.
- Negative/unit tests for masked payer, missing original time, outgoing direction, missing source, bad amount, tampered signature input, malformed header, replay timestamp.

## Why this is not a payment test
Only **structural evidence readiness** and cryptographic helper functions have been coded. Nothing is read from SMS/notifications; no permissions requested, no enrolled key registered with Go, no local encryption/queue/replay, no parser verified against actual bKash/Nagad/Rocket receipt samples, no Go ingress endpoint, no DB allocation, no five-field matching, no webhook. The source binding is an untrusted client hint; Go must resolve it securely from enrolled device identity. A valid device ECDSA signature is **not** provider attestation.

## Pending
1. PG01–PG05 backend/authorization/intent dependencies.
2. Consented real samples with original payer/time/account/method; OEM/dual-SIM/notification feasibility G0-6.
3. Keystore pairing/revocation and signed device ingress with actual Go enrollment lookup and event dedup.
4. Real permitted receipt capture with unrelated SMS/OTP suppression and encrypted offline queue.
5. Concurrent matching, invalid/masked/duplicate tests, source replay, real device and webhook E2E; PG07 and PG16 evidence.

## Verification
CI source checks must be linked here after the current Kotlin and Go test run passes. The earlier Kotlin foundation debug APK: [38115451816](https://github.com/masharzy/ekmivo/actions/runs/38115451816) is not a PG06 device test.


## Verified helper tests — 2026-10-11

**Source/test PASS**, not receipt collection acceptance. GitHub Actions [run 38115889313](https://github.com/masharzy/ekmivo/actions/runs/38115889313), commit `55ab39d5dbcda2487140f0fb0d3e35bbdd5dd103`: Go `go test ./...` including device canonical-signature/tamper/stale timestamp tests; Kotlin `:app:testDebugUnitTest` including incomplete five-field and altered-body cases; Kotlin `:app:assembleDebug`; web lint/build and PostgreSQL isolated migration/rollback smoke **all passed**. Debug APK [artifact 11693770119](https://github.com/masharzy/ekmivo/actions/runs/38115889313/artifacts/11693770119). Device Keystore runtime, device enrollment, network transport and actual merchant receipt verification were **not tested**.

## New code checkpoint — 2026-10-11 (UNVERIFIED)

See [PG06–PG09 source checkpoint](../PG06-PG09-CODE-CHECKPOINT.md). Native collection, server matching, merchant delivery and operational screens are now implementation drafts on `codex/pg06-pg09-code`. These edits have **no build/CI/database/browser/real-device evidence yet** by the owner's explicit code-first instruction. Any older PASS above belongs only to its referenced older commit.

Acceptance: OPEN. New migration 0014 is not applied; no live verification or deployment claimed. Outstanding checks and prerequisites are recorded in [the consolidated manual ledger](../../MANUAL-VERIFICATION.md). Preserve the difference between a fictional parser fixture and approved real receipt samples.

## Current branch audit follow-up — 2026-10-11 (NOT ACCEPTED)

[Required PG06–PG09 audit](../PG06-PG09-AUDIT.md); [verification-only draft PR #9](https://github.com/masharzy/ekmivo/pull/9); [single manual ledger](../../MANUAL-VERIFICATION.md). Baseline 513ae04, code fixes up to 24cb641a; later evidence commits do not prove an untested test result.

Parser now converts Bengali/Arabic/Persian decimal numeral scripts before existing exact positive minor-unit bounds (Go tests authored). Live device pairing now rejects a SandboxOnly parser rule. Go/Kotlin CI for the new branch and real device consent, SIM/package identity, Keystore, queue overflow, timestamp/payer authenticity remain open. Original fiction-only sandbox parser is never real provider evidence.

Automated verification: source-authored tests/CI invocation are not PASS until a completed exact-commit run is recorded in the audit. New migration 0014 is NOT APPLIED. Real handset/provider/merchant payment, notices and deployment are NOT TESTED. Acceptance: **OPEN**.

## PG06 source verification — 2026-10-11 (AUTOMATED PASS; ACCEPTANCE OPEN)

**Exact tested source SHA:** 8aaf240be72920c7508502e2f67d75f400da18a8, branch codex/pg06-pg09-code. [GitHub Actions 38158507367](https://github.com/masharzy/ekmivo/actions/runs/38158507367): **4/4 jobs PASS.** Go all-unit, checkout race and vet; Kotlin Compose debug APK assembly and unit tests; both Docker image builds; Next lint/typecheck/OpenAPI/production build and disposable PostgreSQL 17 financial regression. CI logs explicitly say **PG06 isolated PostgreSQL signed-ingress function smoke PASS** and **223 combined** finance assertions (NOT 223 PG06-only assertions).

**Reviewed and corrected source:** Bengali/Arabic/Persian exact decimal parsing; regex expression bounds, full-pattern pre-save filtering, malformed UTF-8 denial and no wider OTP-catching rule; live pairing rejects fictional sandbox-only rules; Keystore signed native receipt intake in the same Kotlin app; AES-GCM encrypted queue and durable ACK; consumed pairing response can recover for 5 minutes with the SAME signed public key, different key denied; pending pairing reply restored after app recreation with capture OFF until explicit confirmation; 500-record outbox overflow counter, poison error reason, merchant Devices health, account disable and revoke guards. Original untrusted device time is never substituted for original parsed provider time.

**Actual synthetic database proof:** migration 0014 applied twice via existing migration coordinator to isolated disposable Sandbox + Live finance databases, never control or production; FORCE RLS, role denial, no control data leak; fake account/device pairing, same-key recovery, changed-key denial, persisted overflow/queue health, invalid fixture event durable storage + byte-identical replay, changed digest rejected, revoked key denied, transaction rollback preserves no test fixtures. These are SIMULATED fixtures. CI unit crypto validation and SQL exercises are separate, NOT a complete real signed Android→HTTP→database test.

### PG06 gates that remain OPEN

- **MANUAL PENDING / G0-6:** consented physical phone(s)/OEM, actual supported provider receipts, exact full payer/original transaction time/receiving number and source ownership, Android SIM subscription and package authenticity. No genuinely approved live bKash/Nagad/Rocket parser can be claimed from a fictional fixture.
- **MANUAL PENDING:** Keystore and permission paths on actual Android, SMS/notification capture and unrelated/OTP exclusion, network offline/reboot/app upgrade/force-stop gaps, dual SIM, recovery after lost pairing reply, 500-event overflow warning, poison error display, lost durable ACK, key invalidation and disable/revocation.
- **AUTOMATED GAP:** end-to-end **signed Go HTTP ingress** with a real disposable database and crash/replay/rate-limit cases; Android instrumentation/real pressure. Current proof is Go signature helper unit + SQL functions and Android source build.
- **OPERATOR / POLICY GAP:** retention/export/deletion of encrypted queues and server ciphertext, key custody/rotation/restore, configured operational alert/consent withdrawal procedure, device distribution permission policy. Merchant warning is visible; no real alert channel configured.
- **DEPENDENCIES:** PG07 automatic payment confirmation and PG08 merchant callbacks unaccepted; checkout is sandbox do-not-send-money. A valid device signature never proves a provider payment.

**Status:** PG06 available source + automated sandbox checks VERIFIED; PG06 real-device/provider acceptance **NOT ACCEPTED**. See [mandatory audit](../PG06-PG09-AUDIT.md) and the [one manual ledger](../../MANUAL-VERIFICATION.md).
