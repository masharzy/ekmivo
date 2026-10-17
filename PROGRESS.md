# Ekmivo Android rebuild — execution ledger

Current phase: **1 (state machine and data layer, no UI changes)**.
Acceptance: **OPEN** until Android build, unit tests and preview verification are evidenced.
Date: 2026-10-17
Scope: Phase 1 data-only implementation; phases 2–6 NOT started. Phase 0 evidence gates remain OPEN.

## Initial source audit
Read: apps/mobile/AGENTS.md, AndroidManifest.xml, MainActivity.kt, EkmivoApp.kt,
EkmivoTheme.kt, ForwarderScreen.kt, ReceiptStore.kt, ReceiptSyncWorker.kt,
ReceiptCapture.kt, ReceiptForwardPolicy.kt, ReceiptInboxRecovery.kt,
ReceiptBootReceiver.kt, AppPreferences.kt, apps/mobile/README.md,
docs/design/tokens.css, apps/web/src/components/sms-devices.tsx,
apps/web/src/lib/pairing-qr.mjs, apps/web/src/lib/dashboard-navigation.ts,
backend/internal/checkout/physical_devices.go,
backend/internal/checkout/phone_forward.go, receipt_pipeline.go,
infra/migrations/0045_pg06_physical_phone_multi_account.sql,
docs/adr/0001-native-android.md. See docs/design/ANDROID-PHASE0-AUDIT.md.

## Phase 0 planned/staged changes
- Canonical uploaded HTML, final prompt, exact Compose spec, phase prompts and resolved CLAUDE.md.
- Web-sourced EkmivoTokens.kt and EkmivoTypography.kt.
- Neutral full light/dark EkmivoTheme.kt.
- Custom reference primitives EkmivoComponents.kt.
- Non-shipping EkmivoTokenPreview.kt showing colours, type and primitives.
- Phase 0 root-cause audit.

## Explicit decisions
- Preserve original signed receipt path and encrypted queue; Phase 0 has no capture, permission, pairing, Go or web behaviour changes.
- The screenshot geometry comes from the spec; web dashboard controls semantic theme colours/typography and global radii.
- Keep current QR token contract (43-char token, expires in 5 minutes). Do not ship mock eight-character codes.
- Separate "server forwarded" from "payment verified". Server ACK does not verify funds.
- Do not show a shop name until the server supplies an authenticated name.
- Keep existing current /w/{workspaceId}/payments/devices path; do not invent /en or /bn routes.
- New copy overrides in final prompt §0a. Source HTML is never production data.

## Needs-web-change / backend dependencies
- Web: real "Open in app" pairing deep link; code copy already exists.
- Go: a pre-consent validation endpoint returning shop name, without consuming token; structured claim errors.
- Go: sender profile and verified/forwarded metrics; distinguish revocation vs projection-stale cases.
- Android Phase 1/3: Room migration and Setup Health require queue-safe rollout.
- Play-distribution/SMS permission exception cannot be confirmed.
See audit for exact files and evidence.


## Phase 0 source-of-truth token mapping (web -> Compose)
- Source: docs/design/tokens.css, operational dashboard roles (not screenshot demo palette).
- Light: canvas #F5F5F1, surface #FFFEFB, raised #FFFFFF, subtle #EEEFEA, border #E2E5DE, text #203148, secondary #5C6874; functional success #285D42, warning #77511D, danger #9C3134.
- Dark: canvas #181C20, surface #20262B, raised #293138, subtle #252C31, border #333D44, text #E6EAE7, secondary #ACB7BF; functional success #B2DEC1, warning #F0D092, danger #F5B4AE.
- Radii: control 6dp, panel 10dp, dialog 12dp (from web). Reference-only fixed primitives preserve their geometry. Font: existing web Hind Siliguri regular 400 and medium 500.
- Composable role type table: EkmivoTypography.kt matches reference line-height ratios; no 600/700 text.
- Material plumbing overrides neutral light/dark surface containers; prevents default tonal fallback.

## Actual QR/code + web/API handoff (later phases must NOT guess)
- Web route: /w/{workspaceId}/payments/devices; managing phones requires authorized workspace owner/admin. Web SMS devices -> Connect phone -> phone name -> Create pairing QR.
- Proxy POST /api/go/workspaces/{workspaceId}/phones?environment=live|sandbox -> Go POST /v1/workspaces/{workspaceID}/phones; request has name, response id/pairing_token/expires_at.
- Go randomCapability() generates 32 random bytes as unpadded base64url: 43 characters. Regex accepts 24–160 as a range, but emitted token is 43 characters; valid 5 minutes per migration 0045.
- Web QR payload: ekmivo://pair?token={token}, created by apps/web/src/lib/pairing-qr.mjs. Android deep-link VIEW intent not yet registered. UI offers full-token copy but no "Open in app" action.
- Android scan currently only fills input field. Signed POST /v1/device/claim sends pairing_token + public_key. Response gives id/physical_device/workspace_id/environment, not shop display name. No non-consuming code validation identified; claim consumes token. Do not invent shop name.
- Device configuration endpoint /v1/device/configuration, signed SMS intake /v1/device/phone-events. Durable receipt ACK is not financial verification.
- Required later web/Go: pre-consent display-name validation, structured invalid/expired/revoked errors, server-managed sender profiles/real totals, dashboard app-opening link.

## Checks
- Design docs, theme and components: committed on draft PR #72. Screenshot JPG attachments have not been added to docs/design/screenshots/; setup incomplete.
- Gradle assembleDebug: NOT RUN successfully (no local Gradle/Android SDK; GitHub CI stopped before steps).
- Unit tests: NOT RUN (CI did not execute steps).
- CI: Actions run 39018411221 FAILED. All four jobs stopped after ~3 seconds with zero steps. Android job log returned 404 BlobNotFound. This is not evidence of a Kotlin compile/test failure or success; runner/account blocker unconfirmed.
- Emulator 360dp/412dp: NOT RUN; reference side-by-side match table pending.
- Screenshots side-by-side/match table: NOT RUN; no production screens touched.
- Real device screen-off 30min: NOT RUN (Phase 6).
- Backend / DB / migrations: UNCHANGED.


## Phase 1 — implementation (2026-10-17)
- ConnectionState.kt: sealed Unpaired, Pairing, Active, Degraded(reason), PermissionsIncomplete(missing), Revoked with deterministic reducer. ReceiptRepository exposes a StateFlow to later UI phases. No view is wired to the new state yet: that is intentionally deferred to Phase 4.
- ReceiptAuthInterceptor in ReceiptRepository.kt: **central** treatment of 401/403 on signed authenticated requests (claim explicitly excluded); sets Revoked and clears active pairing/Keystore signing key. HTTP 5xx/network errors set Degraded without requesting re-pair. Non-consuming QR validation API remains absent.
- ReceiptStore.kt: explicit revoke quarantine, retained original legacy encrypted outbox, server-configured forward_sources, and deterministic enrollment ownership gate. Revocation does NOT erase staged or pending SMS. Future re-pair to a different store does NOT retarget held evidence. A new pairing clears revoked state but never rebinds old receipts.
- ReceivedSmsRoom.kt + ReceiptStageRepository.kt: new Room SQLite staging database with Keystore AES-GCM encrypted SMS and stable UUID before original encrypted SQLite outbox upload. Explicit **two-stage, idempotent** mirroring and crash recovery, not a destructive conversion of historical receipt-outbox.db v2. Per-message received/mirrored/sending/failed/sent state, attempts and safe reason code. Room staging uses a separate Keystore alias. Existing outbox remains immutable authority for device-signed ACKed upload.
- ReceiptCapture.kt: enqueue staged data first and schedule existing expedited network-constrained WorkManager. SMS and notification callback work executes off main thread. No consent scope expansion.
- ReceiptSyncWorker.kt: recover Room stage before sending, keep original event ID/enrollment, exponential retry and stable durable-ACK semantics, quarantine cross-shop evidence, update Room status only after server durable ACK. No payment confirmation inferred from forwarding ACK.
- ReceiptForwardPolicy.kt + ReceiptInboxRecovery.kt: sender allowlist supplied by server config; no provider hardcoding in collection/recovery; OTP and unrelated messages rejected.
- Existing ForwarderScreen.kt touched **only to supply context to centralized transport interceptor**; no layout/copy/interaction or new app screen was changed. Go/web/backend unchanged.
- Gradle app module: Room runtime + kapt compiler added; Kotlin 2.0.21 and Room 2.6.1. New JVM unit tests: ConnectionStateTest, ReceiptAuthInterceptorTest, updated ReceiptForwardPolicyTest.

### Phase 1 tests & known manual gates
- JVM tests authored but **not executed successfully** (local Android SDK/Gradle not installed; GitHub workflow previously terminated jobs before starting).
- Room database schema creation / Keystore encryption / preexisting outbox v2 preservation need actual Android emulator instrumentation. No screenshots required for this no-UI phase.
- 401/403 from an authenticated device quarantines credentials. Distinguish transport 403 and temporary 503. Finer-grained legacy-binding 403 vs physical-device revocation remains a **backend contract question**.
- Worker process death at Room insert/mirror/ACK boundaries and >500-receipt backpressure require simulated/device stress tests.
- A Room staged or pending message from a revoked/different seller is **held and never re-signed under another identity**. Restoring the same original enrollment requires explicit authenticated operator recovery; no untrusted automatic replay.
- Notifications/battery/OEM health checks intentionally wait for Phase 3; only RECEIVE_SMS state is currently evaluated, with no invented permission claims.
- Next steps Phase 2 only after acceptance decision. No UI changes this phase.

## Next
Phase 0 follow-up: full typography-scale preview, Section 5 topHairline, exact type line heights, neutral Material surface roles and a static reduced-motion pulse. No new shipping screen.
Close Phase 0 acceptance only after the Android CI build/test and preview validation.
Then **Phase 1** (connection state/data layer) in a new deliberate phase,
following docs/design/ekmivo-phase-prompts.md; no UI changes in Phase 1.
