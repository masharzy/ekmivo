# Briofold Android rebuild — execution ledger

Current phase: **3 (permissions, Setup Health, Done)**.
Acceptance: **OPEN** until Android build, unit tests and preview verification are evidenced.
Date: 2026-10-17
Scope: Phase 1 data-only implementation; phases 2–6 NOT started. Phase 0 evidence gates remain OPEN.

## Initial source audit
Read: apps/mobile/AGENTS.md, AndroidManifest.xml, MainActivity.kt, BriofoldApp.kt,
BriofoldTheme.kt, ForwarderScreen.kt, ReceiptStore.kt, ReceiptSyncWorker.kt,
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
- Web-sourced BriofoldTokens.kt and BriofoldTypography.kt.
- Neutral full light/dark BriofoldTheme.kt.
- Custom reference primitives BriofoldComponents.kt.
- Non-shipping BriofoldTokenPreview.kt showing colours, type and primitives.
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
- Composable role type table: BriofoldTypography.kt matches reference line-height ratios; no 600/700 text.
- Material plumbing overrides neutral light/dark surface containers; prevents default tonal fallback.

## Actual QR/code + web/API handoff (later phases must NOT guess)
- Web route: /w/{workspaceId}/payments/devices; managing phones requires authorized workspace owner/admin. Web SMS devices -> Connect phone -> phone name -> Create pairing QR.
- Proxy POST /api/go/workspaces/{workspaceId}/phones?environment=live|sandbox -> Go POST /v1/workspaces/{workspaceID}/phones; request has name, response id/pairing_token/expires_at.
- Go randomCapability() generates 32 random bytes as unpadded base64url: 43 characters. Regex accepts 24–160 as a range, but emitted token is 43 characters; valid 5 minutes per migration 0045.
- Web QR payload: briofold://pair?token={token}, created by apps/web/src/lib/pairing-qr.mjs. Android deep-link VIEW intent not yet registered. UI offers full-token copy but no "Open in app" action.
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
- ReceiptSyncWorker.kt: recover Room stage before sending, keep original event ID/enrollment, exponential retry and stable durable-ACK semantics, quarantine cross-shop evidence, update Room status only after server durable ACK. Select eligible queue entries rather than blocking a newly paired workspace on another shop's held rows. No payment confirmation inferred from forwarding ACK.
- ReceiptForwardPolicy.kt + ReceiptInboxRecovery.kt: sender allowlist supplied by server config; no provider hardcoding in collection/recovery; OTP and unrelated messages rejected.
- Existing ForwarderScreen.kt touched **only to supply context to centralized transport interceptor**; no layout/copy/interaction or new app screen was changed. Go/web/backend unchanged.
- Gradle app module: Room runtime + kapt compiler added; Kotlin 2.0.21 and Room 2.6.1. New JVM unit tests: ConnectionStateTest, ReceiptAuthInterceptorTest, updated ReceiptForwardPolicyTest.

### Phase 1 tests & known manual gates
- JVM tests authored but **not executed successfully** (local Android SDK/Gradle not installed; GitHub workflow runs 39022485840 and 39022772191 ended before steps in all four jobs, as with Phase 0).
- Room database schema creation / Keystore encryption / preexisting outbox v2 preservation need actual Android emulator instrumentation. No screenshots required for this no-UI phase.
- 401/403 from an authenticated device quarantines credentials. Distinguish transport 403 and temporary 503. Finer-grained legacy-binding 403 vs physical-device revocation remains a **backend contract question**.
- Worker process death at Room insert/mirror/ACK boundaries and >500-receipt backpressure require simulated/device stress tests.
- A Room staged or pending message from a revoked/different seller is **held and never re-signed under another identity**. Restoring the same original enrollment requires explicit authenticated operator recovery; no untrusted automatic replay.
- Notifications/battery/OEM health checks intentionally wait for Phase 3; only RECEIVE_SMS state is currently evaluated, with no invented permission claims.
- Next steps Phase 2 only after acceptance decision. No UI changes this phase.

## Phase 1 latest verification
- Implementation commits: b0be7d9, 9a48133, f6ae7bb (draft stacked PR #73).
- Last CI: https://github.com/masharzy/ekmivo/actions/runs/39022772191 — **FAILED before jobs executed steps** (all 4 jobs had 0 steps; ~2–3 seconds each). Cannot assert Kotlin compile, Room schema generation or JVM tests have passed.
- No emulator instrumentation evidence; no binary release, deployment or production migration.
- Phase 1 implementation is on a review branch, NOT merged to main and NOT accepted.
- Phase 2/3/4/5/6 remain not started.

## Next
Phase 0 follow-up: full typography-scale preview, Section 5 topHairline, exact type line heights, neutral Material surface roles and a static reduced-motion pulse. No new shipping screen.
Close Phase 0 acceptance only after the Android CI build/test and preview validation.
Then **Phase 1** (connection state/data layer) in a new deliberate phase,
following docs/design/briofold-phase-prompts.md; no UI changes in Phase 1.


## Phase 0+1 fork CI evidence (2026-10-17)
- EC Education fork base was identical to upstream main `25f1163f` at test branch creation.
- Run 39031955533: Android `gradle --no-daemon :app:assembleDebug :app:testDebugUnitTest` **PASSED** (BUILD SUCCESSFUL in 3m 40s), Go **PASSED**, Docker **PASSED**; Web lint failed on existing hosted-invoice source.
- Run 39032346329: Android **PASSED**, Go **PASSED**, Docker **PASSED**, Web lint **PASSED** after targeted hosted-invoice fix. Broader source-assertion release gate then reported six outdated patterns.
- Run 39033193573: only `tools/testing/pg06-physical-phone-contract.test.mjs` and `tools/testing/public-pay-design.test.mjs` executed: **10 tests / 10 passed / 0 failed**. Android, Go, Docker, full web explicitly **skipped** in this final targeted run to save CI usage.
- Source-assertion checks now reference the actual central device-signature transport context, Room queue guard, dashboard SMS-device module and normalized payer/locale-neutral route contracts. No payment/backend logic was changed to satisfy outdated literal assertions.
- The fork-only CI skip workflow is NOT promoted to upstream; original full CI remains unchanged. A new upstream full CI green run is **not** claimed.
- Phase 0 preview image comparison (360dp/412dp), Room/Keystore device instrumentation, and 30-minute Samsung background checks remain **PENDING**. User approved promotion after passing Android plus targeted contract checks; passing unit tests is not evidence of on-device production validation.

## Phase 2 — Pairing screens implementation, pending device visual acceptance (2026-10-17)
- Added Welcome, Camera permission, in-app CameraX/ML Kit scanner with 150dp bracket overlay + torch, consent Confirm sheet, Connecting, and complete token code entry. No Phase 3 permission wizard, Phase 4 Home, or backend rewrite.
- Added Android ACTION_VIEW deep link for `briofold://pair?token=`; token is validated for exactly 43 unpadded base64url characters (the current actual emitted format), and never consumed before the user presses Confirm and connect. A copyable full code and explicit clipboard Paste are supported for one-device merchants.
- User authorized generic workspace wording in place of a server-verified shop name; real identity is established by one-time signed POST /v1/device/claim. No invented shop name/avatar. QR success goes immediately to Confirm and only button action consumes the token.
- UI text is loaded from separate BN and EN resources using the selected Briofold app language, not Android system locale. Demo payment providers and guarantee claims are not shipped. Copy identifies SMS forwarding, not payment settlement.
- Successful claim stores original backend enrollment, consent timestamp/version, schedules WorkManager, then hands control to the preexisting permissions/Forwarder flow. Phase 3 will replace those legacy permissions screens.
- Camera uses CameraX PreviewView and local ML Kit analysis only after CAMERA grant; no frame/photo is persisted/uploaded; scanner releases use cases on disposal.
- Code entry represents a real 43-character capability across eight grouped visual cells instead of fake eight-character demo value; long tokens necessarily differ from reference's 8-cell single-character placeholder. 'Paste code' link was required by Final Prompt §3.3c.
- Phase 2 icon tile and screen hierarchy follow spec 3.3/3.3a/3.3b and web-derived theme tokens. Real-camera device photos/screenshot match table at 360dp and 412dp still NOT VERIFIED; user will review generated APK.
- Fork Android-only CI will build `:app:assembleDebug :app:testDebugUnitTest`; its debug APK is for testing, not a release signing/distribution claim. Do not copy fork CI-skip workflow upstream.

### Fork Android CI result (2026-10-17)
- Phase 2 validation: https://github.com/easyeducation556644-ux/ekmivo/actions/runs/39035147227: **SUCCESS**, `:app:assembleDebug :app:testDebugUnitTest` both passed (BUILD SUCCESSFUL in 2m 37s); debug APK `briofold-kotlin-debug` (artifact #12101587617).
- Web, Go and Docker deliberately **skipped** for this phase on the fork to conserve CI usage; the upstream CI YAML stays unmodified.
- Original reference screenshot comparison at 360dp and 412dp is **NOT DONE**; APK sent to owner for visual and device pairing acceptance. The generic copy for shop name was explicitly approved by the owner.

## Eight-character pairing polish — 2026-10-17
- Freshly generated physical-phone pairing capability is 8 uppercase non-confusable symbols from a 32-character crypto/rand alphabet; 40 bits of random entropy. Existing digest, database-enforced 5-minute expiry, single-claim consumption and server validation preserved. Legacy longer claim tokens remain briefly valid for compatibility; no database migration.
- SMS devices modal shows 8 individual cells with Copy button; QR uses the same token. Android eight-cell input accepts typing/paste via a single backing editor and automatically opens Confirm after 8 characters; server claim still requires explicit consent.
- EN/BN switcher at top right, new installs default English; dark palette uses reference #0F0F0E, #181817, #222220 and theme follows system setting unless explicitly changed. Steps shortened per owner feedback.
- Fork targeted CI https://github.com/easyeducation556644-ux/ekmivo/actions/runs/39037292999 **SUCCESS**: Go TestPhysicalPairingCodeShape PASS, focused Node QR/web contract tests 4/4 PASS, Android :app:assembleDebug and :app:testDebugUnitTest PASS. Full unrelated web/Go/Docker jobs were intentionally skipped. Fork-only CI workflow not promoted.
- Debug artifact #12103270511; locally extracted APK SHA-256 5f19c1ab6a95ef76f2af7a9bd91131951cbe98924fc92bc319ac30e9f2fb8f9d (43,092,147 bytes). Device screenshot acceptance pending. Backend deployment required to issue the new codes in production.

## Phase 3 — Setup Health, permission wizard and Done (2026-10-17)
- Flow correction: Welcome step 3 is now “Scan the pairing QR code shown on your dashboard.” (BN equivalent). No separate build made solely for copy.
- SetupHealth.kt: re-evaluate on each activity RESUME: RECEIVE_SMS, POST_NOTIFICATIONS on API 33+, PowerManager battery exemption, manufacturer detection and existing encrypted queue error/backlog. OK/MISSING/UNKNOWN are explicit; a Samsung sleeping-app setting is never falsely shown OS-verified.
- SetupPlan and SetupPlanTest: ordered SMS → notification → battery → Samsung OEM (Samsung only). Already granted steps skipped; Samsung guide completion is an honest manual acknowledgement, **not** a verified OS state. Re-surface when a delivery backlog/error appears.
- SetupWizard.kt: same spec-sized header, 4 progress bars (22×4dp), centered 76dp icon tile, 19sp title, 13sp body, live status tags, primary system dialog/settings action, why-needed disclosure. Denied and don't-ask-again handled via app settings, no silent skip, callback/resume recheck. Done screen uses generic copy (user approved not showing unverifiable workspace name), Start goes to current app.
- BriofoldApp.kt: after claim, show wizard, not old Forwarder screen; existing paired phones with missing setup re-enter wizard. Home fix card only when health requires attention; Settings reliability card shows real status and Fix link. No Phase 4 Home redesign.
- Foreground service: low-importance channel with notification returning to app, started only from a visible Activity following completed setup; network delivery still handled by WorkManager with encrypted Room/legacy outbox retries. Does not start from BOOT_COMPLETED. Android 15+ may impose a dataSync FGS time limit; **never** claim guaranteed always-on operation.
- AndroidManifest: narrowly required POST_NOTIFICATIONS, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, and non-exported dataSync service. Camera still only requested by explicit scanner action; READ_SMS remains opt-in for recovery, not part of setup wizard.
- Existing paired credentials and unsent receipt database are preserved. No Go or Web API changes in Phase 3.
- Distribution observed in this workflow: sideloaded test APK. Google Play's restricted SMS/FGS declarations would require separate review before Play submission.
- CI: build + unit tests on EC Education fork; do not run unrelated backend/web/Docker jobs; do not promote fork-only workflow gating to upstream.
- User explicitly owns live SMS/API device tests and device screenshot checks; these are NOT counted toward code/architecture/CI implementation acceptance. Their absence must still be disclosed honestly.

### Phase 3 CI evidence and hardening
- First fork Android run 39042607345: `assembleDebug` + `testDebugUnitTest` **PASSED**; unrelated Go/Web/Docker skipped.
- Final refinements: language switch also on the wizard, revoke/permissions change stop running forwarding FGS, on Android 15 `Service.onTimeout` stops the dataSync service and requeues background work instead of promising limitless FGS runtime.
- Owner will verify the real on-device flow and appearance; real live payment SMS and API delivery are excluded by request from the code-completion gate.

### Delayed forwarding detection
- A pending encrypted receipt older than 10 minutes triggers Setup Health warning even without a transport error, based on the existing SQLite pending table's creation timestamp. No SMS plaintext is read; the existing WorkManager transport and outbox are untouched.

### Final Phase 3 Android validation
- Fork CI https://github.com/easyeducation556644-ux/ekmivo/actions/runs/39043254003 passed :app:assembleDebug and :app:testDebugUnitTest (other unrelated Web, Go, Docker jobs deliberately skipped).
- Debug APK size 43,125,139 bytes, sha256 fbc9a69669f573852d0c5eda7178429e879ae8848acbb8f65b8877cf4c5e55b1.
- Live device SMS/API and screenshot QA are owner-run; not verified in this session and intentionally excluded from user-defined code-completion acceptance.

## Phase 4 — Home, Disconnected and two-tab nav (2026-10-17)
- Exact reference structure targeted: 34dp logo header with state-derived chip, 136dp two-ring pulse and 112dp hero core, 3 equal stats, 30dp neutral sender tile, hairline feed rows, detail bottom sheet, and 2-item slim navigation bar (Live + Settings, no empty Inbox tab). Navigation leaves Phase 5 Settings presentation unchanged.
- The repository StateFlow drives Live/Syncing/Offline/Needs attention/Revoked. Revoked displays a no-retry Disconnected screen with a Reconnect entry and a *conditional* link for real queued receipts; original revoked receipt evidence stays encrypted.
- Stats and feed are sourced off-main-thread from the existing Keystore encrypted SQLite outbox and encrypted Room staging. Rows include real source, SMS amount if parsed, masked sender, actual intake time, attempts, safe delivery status and retry scheduling. No demo transactions, provider names/colours, or fictional balances.
- **Honest semantic limits:** financial verification totals are NOT available from the Android server contract. The hero shows retained forwarded SMS amount only when every retained forwarded SMS has a parsable amount, labelled "Forwarded in history", never "Verified today". The forwarded stat counts retained history (last 60 ACKs + unsent rows), not an authoritative all-time count. Unknown sender uses neutral brand tile. Shop name is "Briofold", because the pairing API has no verified display name.
- No API, financial, auth, migration or SMS ingestion changes. Existing Phase 3 setup and permissions stay in place.
- Build and unit tests to run only for Android on the EC Education validation fork; fork-only workflow skip conditions must not be promoted upstream.
- Still pending: emulator screenshots at 360dp/412dp (both themes), pixel comparison against HTML, real-device revoked/re-pairing and SMS evidence tests. Do not claim screenshot-perfect or fully accepted until those checks are complete.

### Phase 4 correctness refinements
- CI run 39046527537 passed Android `assembleDebug` + `testDebugUnitTest` on initial implementation.
- CI run 39046974983 passed Android `assembleDebug` + `testDebugUnitTest` on real durable Room `sent_at` query. Intake timestamp is no longer mislabelled as forwarding timestamp; when unknown UI says so. Room failed-state records provide the failed count rather than the limited feed slice. An unavailable data source is explicitly shown as unavailable, not zero transactions.
- Final ring colour reflects state: green when Active, amber when degraded; reduced motion remains respected.
- No owner screenshot QA claim. Payment verification totals remain unavailable; all visible figures refer only to locally retained forwarded SMS.

## Phase 5 — Settings, diagnostics and live device-health regression fix
- Settings cards follow design spec §3.7: real device identity (model, not invented shop), last signed heartbeat, SMS/notification/battery/Samsung setup values, language and System/Light/Dark segmented choices, diagnostics entry and destructive disconnect confirmation sheet. The SMS queue is protected by the existing encrypted Room/SQLite unsent guard. Local disconnect does not pretend to revoke the handset remotely: the confirmation explicitly instructs removal in the web dashboard.
- Diagnostics: signed connection test, opt-in READ_SMS missed-inbox recovery, sanitized OS/app/health metadata text share (no SMS bodies, payer numbers, IDs, private keys) and app version. A connectivity test is **not** a synthetic payment forward or proof of verification.
- Fix: foreground service sends **signed phone heartbeat every 2 minutes** independently of receipt WorkManager, and app while STARTED probes again after >=30s without an attempt; server 401/403 flows through the existing auth interceptor to Revoked StateFlow and immediately renders Disconnected without app restart. No client-only spoofed online state.
- Web phone health thresholds align with 15-minute WorkManager fallback: online while last heartbeat <20min, delayed 20–45min, offline >=45min. Actual missing permissions and revoke states take precedence. A notification is not counted as proof of server connectivity.
- Phase 4 empty/zero retained SMS history hero now shows ৳0 (but source unavailable must still show unknown, never fake a zero).
- Android 15 foreground dataSync restrictions and OEM battery constraints still apply; no claim of eternal FGS life. WorkManager keeps durable retry support.
- CI on EC Education fork runs Android assembleDebug + unit tests plus targeted Node source/behaviour checks; unrelated Go/Next.js/Docker checks skipped. The CI-skip workflow is fork-only and MUST NOT be copied upstream.
- Screenshots at 360dp/412dp and live Samsung/device SMS delivery remain pending owner testing; neither is claimed pass.

### Phase 5 CI and delivery evidence (2026-10-17)
- EC Education fork [Android + targeted contract CI](https://github.com/easyeducation556644-ux/ekmivo/actions/runs/39050833184): **SUCCESS** after fixing a missing Settings import. `assembleDebug` and `testDebugUnitTest` passed; focused heartbeat/status/settings assertions passed. Unrelated Go/Web full pipeline and Docker builds deliberately skipped; fork-specific CI exclusions are NOT promoted.
- Debug APK (fork artifact #12108150268) size 43,259,703 bytes; sha256 `30d9afd1e9b2f1b78d7b93acd1cc682d6c670c41bba59def691fa32d31a252b6`.
- The production web deployment and real Samsung service running with the screen off are **not verified**. System-permitted background work cannot be guaranteed by a persistent notification alone. Owner will verify actual app/web status changes and 360dp/412dp reference screenshot match.
- Local app Disconnect only clears this handset when the encrypted pending queue is empty; merchant must also remove the entry on the dashboard. There is no signed handset self-revoke endpoint in the existing backend, and the app never claims remote revocation.

## Phase 6 — hidden Inbox groundwork, shared header and screenshot QA (2026-10-17)
- Source: Phase 6 section of `docs/design/briofold-phase-prompts.md`. No visible Inbox tab, no fake chats, no fake financial/SMS sender records.
- User screenshot correction: Live and Settings now have **one shared top BriofoldBrandHeader** with identical EN/BN switcher. Removed Settings duplicate logo/header and retained its one page title. Live status badge is deliberately placed at the upper-right of the pulse ring (not random during recomposition); 136dp ring and 112dp core preserved; "Forwarded in history" wraps to two lines in English and Bangla.
- Future Inbox types/interfaces in `apps/mobile/app/src/main/java/com/briofold/mobile/inbox`: thread/message/state model, repository interface, disabled repository/route and `inboxEnabled=false`; hidden `Tab.INBOX` branch cannot be selected from the two-tab nav. No new API or server behavior.
- Firebase Messaging service + notification channel + phone-enrollment-scoped token callback/registry added. **Actual FCM is unavailable by design** until a Firebase project config, authenticated token registration endpoint, actual message API and owner approval to enable the flag are supplied. Never manufacture or send any token to an unknown endpoint.
- Build and unit tests include Inbox feature flag/domain tests; screenshot instrumentation sources compile and capture **all five screens** at the emulator's actual dp dimensions in both themes and languages, but comparison is not automated.
- QA checklist: `apps/mobile/PHASE6-QA.md`, including explicit **Samsung screen-off 30-minute** test, dashboard heartbeat, web disconnect, no visible Inbox, queue-safety, and 360dp/412dp EN/BN light/dark captures.
- **Acceptance blocker:** No emulator screenshot captures nor side-by-side comparison against original HTML are available from this session. This phase cannot truthfully be called screenshot-perfect or fully visually accepted until someone runs the tests and compares. Real Samsung device test remains owner-run.
- CI fork: only Android debug build + unit tests + androidTest compilation, plus targeted phase6 contracts. Do NOT promote fork-only workflow gates into masharzy/main.

### Phase 6 tested source and remaining QA (2026-10-17)
- EC Education fork: [CI run 39054599390](https://github.com/easyeducation556644-ux/ekmivo/actions/runs/39054599390) **SUCCESS**; Android `assembleDebug`, `testDebugUnitTest` and `assembleDebugAndroidTest` (instrumentation APK compilation), plus targeted Node header/hidden-Inbox checks, all passed.
- Two earlier runs failed during dependency and duplicate-Settings-header checks; corrected before the successful run. Unrelated Go, Web and Docker jobs deliberately skipped on fork.
- APK artifact ID 12108803647, `briofold-kotlin-debug`; extracted debug APK SHA-256: `41855fec704483d92f09c4694644b39445f8f41b9dcb840df23e1c2da8592d4c`.
- **Not verified:** screenshots actually captured on 360dp/412dp emulators and compared side-by-side against approved HTML, real Samsung 30min screen-off test, actual FCM registration or chat delivery (intentionally disabled), and backend push schema.
- Main repository CI settings preserved unchanged; no backend/web code modified in this phase.

## Android header, two-way phone disconnect and self-updates (2026-10-18)
- Fix: `BriofoldBrandHeader` now uses Android status-bar padding, preventing clipping on Samsung in both Live and Settings.
- Fix: Settings Disconnect first validates Room/SQLite unsent queue, then calls signed `POST /v1/device/phone-disconnect` via the already enrolled P-256 key; only on HTTP 200 does it clear local credentials and stop the foreground service. This requires additive migration `0083_phone_self_revoke.sql` and updated Go API; if unavailable, credentials are kept, avoiding a phantom web-online state.
- Dashboard's existing signed-in merchant revoke remains authoritative, now lists revoked phones with status **Disconnected** and offers **Generate new pairing QR** via the same one-time 8-character/5-minute workflow. Old IDs/codes cannot be reactivated. Visible web polls 10 seconds.
- Android visible lifecycle sends signed status probe every 12 seconds (not gated by last persisted attempt) so dashboard revocation is detected without clearing recent apps. Background FGS remains every 2 minutes with Android OEM delays possible.
- New read-only Go release endpoint `GET /v1/mobile/releases/latest` reads version, HTTPS URL and SHA-256 from environment and returns HTTP 204 when not configured. Android Settings shows **Update now** only when higher version exists; downloads to private external-app folder, verifies SHA-256 and APK package/version, and hands off to Android's installer. **Silent install is not supported** and requires explicit user OS approval; long-lived release signing key and configured release-hosting URL are required for actual upgrades. This debug build uses versionCode 4/versionName 0.2.2.
- Tests: Go release manifest unit tests, focused Node contracts, Kotlin Android assemble/unit tests in EC Education fork. Source-only workflow skip must not be promoted to main.
- Production blockers: run migration in both financial environments, deploy compatible Go API + web, configure release env and host a signed production APK; then verify Samsung screen-on/off and web UI/real install. No claim of completed production rollout before these checks.

### Validation and deployment state (2026-10-18)
- EC Education fork [CI run 39057324210](https://github.com/easyeducation556644-ux/ekmivo/actions/runs/39057324210): Android assembleDebug and testDebugUnitTest **PASS**, targeted Go mobile-release tests and Node signed-disconnect/QR/update contracts **PASS**. Unrelated full Web/Go/Docker checks skipped. The main CI workflow was not changed.
- APK versionCode 4 / v0.2.2, CI artifact 12109299410, SHA-256 `e90bc976cc0813a0552eedc4c6645923dad71c6084d5e315b874ddc8c2a8f7fc`. Debug build is not an update-safe release with a stable signing key.
- `0083_phone_self_revoke.sql` additive SQL function applied in Neon production branch to **ekmivo_sandbox_financial** and **ekmivo_live_financial** databases; both inspected as installed with EXECUTE privileges for `ekmivo_finance_reader`, without modifying existing receipt/payment rows.
- **Not yet verified**: Render Go deployment of this commit, Vercel Web deployment and user Samsung end-to-end revoke tests, exact pixel screenshot comparisons, future real signed release APK hosting and release-environment configuration.

## Env rename (EKMIVO_* -> BRIOFOLD_*)
- Code, workflows and docs now read BRIOFOLD_*. Go services load `internal/envcompat`, which copies a legacy EKMIVO_X into BRIOFOLD_X when the new name is unset (temporary; delete once Render uses new names).
- Auto-webhook signing label is now `briofold:auto-webhook:v1`: every workspace's automatic signing secret CHANGES; receivers must re-copy it from the dashboard.
- Vercel ekmivo-web: BRIOFOLD_SUBSCRIPTION_PAYMENT_ENABLED added; old EKMIVO_ one kept until verified.
- Left on purpose: DB roles/schemas/GUCs (ekmivo_*, ekmivo.*), historical migrations/evidence, github.com/masharzy/ekmivo URLs (until repo rename), GOOGLE_AUTH_ORIGIN (ekmivo-web.vercel.app).
- Needs owner: GitHub Actions secrets rename (BRIOFOLD_ANDROID_KEYSTORE_*), Render envs, Google/Meta settings.

## AI Commerce Core Phase 0 — 2026-11-09 (CI pending)

Fixed sidebar ref rendering through atomic navigation state and added 43 missing CONTROL migrations to the existing checksummed coordinator. Full lint, TypeScript, production build, 208 non-browser contracts and Go migrator tests pass. With owner approval, deleted only archived test-managed-plans-20261016 and created a ready no-compute checkpoint of test-customer-orders-20261108. Applied 43 migrations there; second execution is a checksum-protected no-op (75 ledger rows, all hashes match). No production writes/model change/merge/deploy. Final CI is the remaining seal gate. See docs/evidence/ai-commerce-phase0/README.md and test-catchup.json.

Phase 0 CI follow-up: broad Foundation acceptance exposed existing Inbox/CRM/modal regressions after the original gates passed. Restored same-origin inbox requests, date/keyboard controls, CRM filters/export/follow-up settings/accessibility, operable mapping dialogs and metadata-only reload-safe attachment retries. Updated current-UI acceptance contracts without dropping authorization/privacy/idempotency/value assertions. Linux build/TypeScript, 210 non-browser tests and eight draft/attachment checks pass. Final full CI remains pending; Phase 0 is NOT SEALED. Coordination with Claude partial Phase 1: GitHub issue #164.

## AI Commerce Phase 1 — catalog (2026-11-09) — closed at code level by owner decision, NOT verified end to end (PC and cloud sandbox attempts blocked: disk space / Go egress policy); branch agents/ai-commerce-phase1 (PR #163, stacked on Phase 0 PR #162)
Done: migrations 0228–0232 (catalog columns/search, one write path, scoped API SQL, Woo apply-once table, indexes); Go product API `/v1/products` + dashboard catalog actions + SSRF-safe image fetch + Woo full import and webhook auto-apply; web catalog panel (manual form, CSV/XLSX import with preview, Woo import); `docs/api/products-api.md`. Flags (all off by default): BRIOFOLD_CATALOG_ENABLED, BRIOFOLD_PRODUCT_API_ENABLED, BRIOFOLD_WOO_SYNC_ENABLED.
Verified: CI Go compile and unit tests pass (SSRF, validation, Woo mapping, migration list); web tsc/eslint clean; importer node tests 5/5; Neon test branch rollback checks for upsert/replay/scopes/stock/deactivate/Woo claim; search on 10,000 products p50 11 ms, p95 40 ms (found and fixed a missing index and a non-indexed filter that made it ~900 ms).
Web panel checked in Chrome at 360/412 px against a mocked API (flows pass; no app CSS, no real backend). NOT verified: any end-to-end run (HTTP→DB→storage) or real Woo store; VPS. Next.js CI job fails at PG04 step on browser-suite timeouts (runChannelPolicies etc.), same as Phase 0; not caused by migrations. No Go integration tests against a database were written (only DB-free handler tests).
Decisions: apply-state for Woo notices is a separate table because notices are immutable; CSV importer accepts both the plan's columns and the older whole-paisa columns; images https-only.
Open: inbox product picker + AI reply path still read `inbox_products` (migrations 0135/0202) → do with Phase 3 orchestrator. Needs-web-change: none. Needs owner: set the three flags when ready; a warehouse must exist before stock can be set.
Evidence: docs/evidence/ai-commerce-phase1/README.md.

## AI commerce Phases 2-6 + production readiness (code level, owner decision 2026-11-09)
Owner asked for code-level completion; end-to-end testing is done later by the owner using `docs/testing/ai-commerce-e2e-test-guide.md`.
- Phase 2: `tools/testing/seed-ai-commerce-sandbox.mjs` (+ safety test). Not executed against a DB.
- Phase 3: `ai_tools.go`, migration 0233 (`ai_tool_calls`, `briofold_ai_tool`). Applied and spot-tested on Neon test branch `br-tiny-mouse-b37574ht`.
- Phase 4: migration 0234 (payment_state, claims, settings, order tools, resolve/expire/review functions), `ai_payment_verify.go`. Scenario tested on the test branch (rolled back).
- Phase 5: migration 0235 (customer profile, name sync). Tested on the test branch (rolled back).
- Phase 6: eval scripts + runner (not run). Readiness: flags/allowlist/kill switch/limits, runbook, load test script (not run).
- Owner notifications (0237 + ai_notices.go): paid / COD / payment-review each produce exactly one commerce_ai_notices row and one `order-state` commerce event (feeds the existing notifications badge). The verifier tick drains the outbox: email to verified owner/admin accounts via the receipt-notice SMTP, FCM push to claimed devices; unconfigured channels are recorded as `skipped`, never retried forever (5 attempts → failed). Text carries only the order reference and amount. Covered by TestAICommerceIntegration (once-only, second drain sends nothing, no phone in the mail).
- Owner UI (flag BRIOFOLD_AI_TOOLS_ENABLED on web + API): Settings → AI selling (opt-in, receiving accounts shown as suffix + label only, delivery, COD, bargaining cap, draft expiry, wrong-TrxID limit, handover-above amount; revision-checked, audited) and Orders → Payment review (approve/reject; approving a changed/expired order is refused; buyer gets one "payment verified" message inside the 24 h window). Evidence: runBriofoldAiSellingBrowser in the PG04 settings acceptance (real Next proxy + Go API + Postgres, viewer/origin denial, en/bn, light/dark, 320/412/1440 without overflow).
- Open / not built: see "NOT BUILT" in the test guide (customer drawer, carousels and buttons, image/voice tools, model admin setting, inbox_products switch, payment links).
- Needs-web-change: Settings > AI selling page; review queue + sidebar badge; customer drawer; admin model setting.
- Branch note: Phases 3-6 are stacked on branch `agents/ai-commerce-phase5` (one PR) instead of one PR per phase.

## AI commerce review fixes (2026-11-09)
Review `docs/reviews/ai-commerce-phase2-6-review.md` (4 blockers, 8 high, 10 medium, 7 low) fixed in place in 0233-0235 (never applied to production) plus realm migration 0236.
Verified on Neon test branch `ai-commerce-fixes-test-20261109` (`br-damp-mud-b3c38es3`, created after deleting archived `repeat-payments-guard-20261013` with owner approval).
Open: H3 reverse race needs a realm lock; orders not via `commerce_write`; all UI; Go compile only in CI. Test guide rewritten for Gemini run.

## AI commerce handoff (2026-11-09, branch agents/ai-commerce-phase5, PR #165)
Done and verified locally (real Postgres + Go + Next + browser): tools and payment verification with race tests, exactly-once owner notices (0237), owner settings + payment review API/UI (0238), customer drawer summary/risk/products bought/order deep link (0239). Fixed a live bug: the /api/go proxy never forwarded `view`/`ids`, so the CRM Orders tab crashed and per-customer stats were never sent.

How to verify: `/tmp/pgl/reinit.sh` (fresh local PG16), then `SUITES=runBriofoldAiCommerce,runBriofoldAiSellingBrowser /tmp/pgl/runci.sh`; expect "AI SELLING SETTINGS/REVIEW ... PASS". In CI the same suites run inside the PG04 settings acceptance (phase9 fixture). Web needs `node scripts/sync-tokens.mjs` once (tokens.css is generated).

Remaining, in this order:
1. Admin model setting with one-click rollback (admin design system rules in apps/web/AGENTS.md; inside the existing "AI Credits" admin page, no new sidebar item).
2. Channel features (largest): Messenger generic template / WhatsApp interactive list / website cards with ≤3 buttons; signed button payloads (HMAC, reuse the broadcast offer signing) handled as a customer turn; image product search (product-photos exists); payment links in Both mode via payment_intents; voice/video limits; switch the inbox product picker to commerce_products.
3. Meta Graph customer name fetch + cache; owner merge action for merge_suggestions (nothing auto-merges).
4. Seed product images; run migrations 0233–0239 twice on a Neon test branch (ask the owner before deleting/creating branches); 1,000-customer profile p95 < 300 ms.
5. Evals with Gemini via OpenRouter (key needed from the owner): `evals/bangla-commerce/run-evals.mjs`.

### AI commerce continuation — shop assistant model
- Added the AI Credits model selector and rollback, append-only model revisions and audit events, and the AI selling worker override.
- Assumption: only models with published tariffs are selectable. The first rollback restores the existing default selection behavior.
- Enable `BRIOFOLD_AI_MODEL_SETTING_ENABLED=true` on the web and Go services after migration 0240 is available. The worker uses the override for AI selling jobs.
- Verification: Go vet/tests, web token sync/lint/TypeScript, and the admin design check passed. Isolated PostgreSQL 16 PG04 passed with 796 assertions, including `TestAICommerceIntegration/shop_assistant_model_version_and_rollback` and `runBriofoldShopAssistantModelBrowser` (English/Bangla, light/dark, 320/412/1440, HTTP 403, save/rollback/audit). Channel features, customer identity, and seed/performance work remain open.

### AI commerce continuation — channel features
- Implemented AI catalog cards for Messenger, Instagram, WhatsApp and the website widget. Unsupported transports receive text. Product buttons expire after 30 minutes and HMAC-bind the action, variant, workspace and thread. Meta callback storage redacts the button capability.
- The worker reuses product-photo fingerprints and scoped catalog search for customer photos. AI selling hands voice/video to staff before downloading or processing them. The web inbox picker reads commerce products and keeps send authorization and idempotency.
- Both-mode checkout uses existing payment intents and the exact draft expiry. The order is held while checkout is payable. The URL is derived at delivery and never written to the inbox or model context. Authoritative financial completion verifies the order. Assumption: reserve stock for 15 minutes after expiry for matching lag, then send later receipts to owner review.
- Enable `BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED=true` with `BRIOFOLD_AI_TOOLS_ENABLED=true` on Go after migrations 0241–0244. Migration 0243 belongs to the financial realms.
- Evidence: PostgreSQL 16 `TestAICommerceIntegration` passed, including scoped photo and picker, signed Meta postbacks, and receipt-to-order checkout settlement. `TestAIChannelProductButtonsRejectTamperExpiryAndForeignScope`, `TestAIChannelProductCardsProviderLimitsAndFlagOffFallback`, and `TestAICommerceVoiceAndVideoHandedOverBeforeDownload` passed. The website widget browser suite passed across both languages/themes and 320/412/1440. Go vet/tests and web lint/TypeScript passed.

### AI commerce continuation — customer identity
- `BRIOFOLD_CUSTOMER_IDENTITY_ENABLED=true` enables Messenger/Instagram Graph names and owner-only merges from the drawer. Names cache for 24 hours, with a shared 20-request/minute budget and exponential retries after failure. Failed lookups preserve names. Manual CRM renames and merged records are excluded from automatic name changes.
- Assumption: same-phone matches are suggestions, and the existing shared verified identity requirement still applies to a merge. Confirmation is explicit, and orders, sources and prior activity remain accessible from the canonical surviving profile.
- Evidence: PostgreSQL 16 `TestAICommerceIntegration/Meta_customer_name_cache_retries_and_owner_merge_preserves_records`, `TestMetaInstagramCustomerNameUsesBoundCredential`, and `runBriofoldAiSellingBrowser` passed. Browser exercised owner confirmation, viewer HTTP 403 and English/Bangla light/dark layouts at 320/412/1440. Migration 0245 reapplication and Go/web checks passed.

### AI commerce — verification and item 4 (2026-11-09, Opus)
- Reviewed GPT's items 1–3 by running them. Fixed a privacy regression: 0245's merged-history read returned customer event `detail` to viewers. 0246 restores the 0189/0208 contract.
- Fixed the AI fixtures for the payments plan gates the full CI chain enforces: an active unpublished plan, plus the per-transaction realm plan snapshot.
- Item 4:
  - `SeedCatalogImages` / `cmd/seed-product-images` store generated PNGs exactly like owner uploads (private storage, media row, image list, photo index). Running them twice is a no-op.
  - Profile p95 with 1,000 customers and 3,000 orders: 1.2–1.9 ms (limit 300 ms).
- CI (8c4c412): every AI suite passes in the full chain: TestAICommerceIntegration, runBriofoldAiSellingBrowser, runBriofoldShopAssistantModelBrowser, runBriofoldCustomers.
- Still failing, and failing identically on the base branch agents/ai-commerce-phase1 (not caused by this PR): runBriofoldChannelExtensions, runBriofoldCommerce, runBriofoldInboxDrafts, runBriofoldKeyLifecycle, runBriofoldPhase9Browser, runChannelPolicies, runMemberChannelScopes, runSavedReplySequences, runWooWebhookSources.
- Open:
  - Apply 0233–0246 twice on the Neon test branch br-damp-mud-b3c38es3. This cloud workspace cannot reach Neon hosts; run financial-migrate from a machine that can.
  - Gemini evals (needs an OpenRouter key).
  - Fix the 9 base-branch suite failures before merging the stack.

## AI commerce production rollout — 2026-11-09

**Partial: privileged API activation and production verification pending.**

- Owner reported production migrations 0233–0246 applied to control and live/sandbox finance, including the prerequisite catch-up, and web live at 15eac98.
- Built Linux API from exact source 15eac9816404df435c3d85b67a7b6c04e33da24b. The env compatibility tests passed. Uploaded binary SHA-256: 4db3550c7aa11804d24541a1588d9c06b7052919cab4459bd97734fd847c1639.
- Staged the repository's Compose image switch and health rollback under /opt/briofold/release-15eac98. Last observed Compose API image was avatar-media-989c9ac4. Deploy time and ten-minute health/log observation remain pending because SSH sudo requires the owner terminal.
- Owner command: sudo bash /opt/briofold/release-15eac98/deploy.sh && sudo bash /opt/briofold/release-15eac98/verify.sh
- Owner-shop page checks and Vercel/Go error review pending. Go stages 1–4 and the Vercel env stage have not started. No flag edits or rollbacks.
- AI provider, private S3, SMTP, FCM and Meta secret presence checks pending. No secrets created or rotated.
- Owner-shop settings, Messenger order, stock, payment verification/review, notices and model rollback smoke tests pending. No order reference yet.

### Production health gate — 2026-11-09

- Owner terminal confirmed running revision 15eac9816404df435c3d85b67a7b6c04e33da24b and binary checksum. Container started at 22:33:34 Bangladesh time. Startup health passed after an initial connection reset.
- Owner waived the ten-minute wait and requested direct testing. The ten-minute log result was not verified.
- Overview rendered with data. Orders, Products, Customers, Payments, Reports and Settings opened. Inbox opened but its settled data state was not verified.
- STOP: the customer drawer opened for a UI Test customer in the Briofold shop. The Orders tab reported “Orders could not be loaded.” Cause and Go/Vercel log review remain unverified.
- All flag stages, secret presence checks and live commerce smoke tests remain pending. No flag changes, rollback, or test order.

### AI commerce rollout — production SQL prerequisite check, 2026-11-09

- API revision 15eac9816404df435c3d85b67a7b6c04e33da24b and running binary verified. Started 22:33:34 Bangladesh time and passed startup health. The ten-minute verifier subsequently reported 3 Go log error indicators.
- Owner CRM profile request returned HTTP 503. Body: {"error":{"code":"FINANCIAL_SERVICE_UNAVAILABLE","correlation_id":"6e01c87a220fcaa50c603d57","message":"A required service is unavailable."}}
- Owner's filtered Go logs show repeated sqlstate=42883 routine=ParseFuncOrColumn table=. The filter drops timestamps, so individual lines cannot be attributed to the request correlation ID.
- Read-only catalog check as the configured API projection role on its VPS control database ekmivo confirmed briofold_customer_profile(uuid,text,uuid,uuid), briofold_customer_products(uuid,text,uuid,uuid), and briofold_ai_tool absent. The drawer calls the first two. The missing AI tool is an independent stage-1 prerequisite, regardless of the owner's waiver for the drawer.
- Vercel production log counts showed one error entry each on /dashboard and /inbox in the inspected 30-minute window. They were not matched to the CRM correlation ID.
- Stopped before Go stage 1. Go stages 2–4 and Vercel env/redeploy remain pending. No flags, migrations or drawer code changed. No rollback required. AI provider, S3, SMTP, FCM and Meta secret presence checks and the owner-shop smoke test remain pending. No order reference.

### VPS AI commerce migration and post-migration checks — 2026-11-09

- VPS Postgres targets: control/auth ekmivo, finance ekmivo_live_financial and ekmivo_sandbox_financial.
- Private custom-format backups in /opt/briofold/backups/ai-commerce-15eac98.JfzWYb: ekmivo.dump 1829731 bytes, ekmivo_sandbox_financial.dump 4887933 bytes, ekmivo_live_financial.dump 5126591 bytes. Archive listing and SHA-256 checks passed.
- Reconciled eight pre-existing inbox schema changes (0219–0226) in the ledger after comparing function bodies, grants, Telegram capabilities and realtime triggers. The first coordinator run stopped at 0069 checksum mismatch. Windows archive line endings caused it. The retry matched pinned LF/CRLF bytes to existing ledger hashes without changing those hashes.
- Pinned 15eac98 coordinator completed at 23:34:34 Bangladesh time. Control pending migrations 0227–0246 excluding 0236/0243 were applied. 0236/0243 ran in each finance realm. pg236_ai_receipt exists in both.
- Five requested control functions exist with runtime EXECUTE. briofold_ai_selling_on exists and has no direct runtime grant by design (0234 explicitly revokes it). Its live SECURITY DEFINER caller is owned by ekmivo_owner and that owner has EXECUTE.
- The same test customer Orders tab rendered its order summary and normal empty state. Overview, Inbox, Orders, Products, Customers, Payments, Reports and Settings opened without the checked page error messages. API health HTTP 200. Post-migration Go log gate pending. Vercel recent error count included /settings/knowledge, not attributed to the drawer.
- Stage 1 runner staged, with post-migration Go log precheck and stage-specific rollback. No flags enabled yet. Stages 2–4, Vercel redeploy, secret checks and live order/payment/notice/model smoke test pending. No restore or order reference.
