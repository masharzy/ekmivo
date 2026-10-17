# Ekmivo Android rebuild — execution ledger

Current phase: **0 (audit and theme)**.
Acceptance: **OPEN** until Android build, unit tests and preview verification are evidenced.
Date: 2026-10-17
Scope: Phase 0 only; phases 1–6 were NOT started.

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

## Checks
- File transfer and content staging: attempted; verify final Git tree/commit.
- Gradle assembleDebug: NOT RUN (local Android SDK / Gradle unavailable in this session).
- Unit tests: NOT RUN.
- CI: not yet checked.
- Emulator 360dp/412dp: NOT RUN.
- Screenshots side-by-side/match table: NOT RUN; no production screens touched.
- Real device screen-off 30min: NOT RUN (Phase 6).
- Backend / DB / migrations: UNCHANGED.

## Next
Close Phase 0 acceptance only after the Android CI build/test and preview validation.
Then **Phase 1** (connection state/data layer) in a new deliberate phase,
following docs/design/ekmivo-phase-prompts.md; no UI changes in Phase 1.
