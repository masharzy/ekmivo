# Ekmivo Android rebuild — Phase 0 audit
Date: 2026-10-17
Scope: audit and theme only. No production screens, signing, intake or API changed.

## Actual repository boundaries
- Android: apps/mobile (Kotlin, single launch MainActivity, Jetpack Compose).
- Web design tokens: docs/design/tokens.css (synchronized into apps/web/src/styles/tokens.css).
- Web pairing UI: apps/web/src/components/sms-devices.tsx; QR encoder apps/web/src/lib/pairing-qr.mjs.
- Go pairing: backend/internal/checkout/physical_devices.go, receipt_pipeline.go.
- Go signed intake: backend/internal/checkout/phone_forward.go.
- Payment matching, ledger, refunds and webhooks remain authoritative in Go/PostgreSQL.

## Root causes of five problems in the final prompt §2

1. **Revoked device is a dead end.** In receipt/ForwarderScreen.kt, serverCheck is a string; revoked, authorization and offline are handled in unrelated UI branches. For HTTP 403, only PHONE_REVOKED becomes "revoked"; other 403s become authorization mismatch; 503 PHONE_PROJECTION_STALE becomes "authorization". The revoked branch tries ReceiptStore.disconnect(), but its existing pending-count guard blocks disconnect and hence re-pair. There is no central auth/revocation state machine. Keep pending receipts encrypted and attributed to their original workspace; never silently replay to another workspace.
2. **Permissions require manual detective work.** MainActivity/EkmivoApp and ForwarderScreen request RECEIVE_SMS only in ad-hoc control flow. AndroidManifest lacks POST_NOTIFICATIONS and the foreground-service declarations anticipated by the new guide. There is no Setup Health repository, detection for battery exception / manufacturer restrictions, or resuming wizard. READ_SMS is currently an opt-in history recovery permission; do not eagerly expand history access.
3. **QR scan does not advance.** GmsBarcodeScanning.startScan() in ForwarderScreen only writes a token into an OutlinedTextField; user must then tick Checkbox and click Connect. The existing claim immediately consumes a code and returns identity, so a genuine **pre-consent validation step is unavailable** in the present backend.
4. **Settings are sparse.** EkmivoApp.kt has language/theme FilterChips and ReceiptRecoveryControl in a flat Column; no grouped device health, last sync, diagnostics, disconnect sheet or supported status.
5. **Visual structure diverges.** EkmivoApp.kt ships stock Material3 Scaffold/Surface/FilterChip, elevation=12dp floating three-tab bar, placeholder Inbox, mixed "SMS Forwarder" text. EkmivoTheme.kt uses older hardcoded colors/600–700 weights instead of web-derived semantic tokens and 400/500 reference type roles.

## Existing delivery logic that must be preserved
- ReceiptCapture.kt receives payment-like SMS without the app UI being open and uses narrow origin/body filters; unrelated SMS/OTP must not be uploaded.
- ReceiptStore.kt persists AES-GCM encrypted evidence in SQLiteOpenHelper and isolates source enrollment. It is **not Room** (migration to Room belongs to Phase 1; preserve encrypted pending receipts).
- ReceiptSyncWorker.kt uses signed HTTPS intake with original immutable event IDs, WorkManager, network constraints, exponential backoff and durable-ACK removal. Boot receiver re-schedules. Preserve existing fields, signing, queue IDs and server authority. Durable evidence ACK is **not** payment verification.
- Server currently provides hardcoded forward_sources ["bKash","NAGAD","Rocket"] rather than a generic sender profile with display initials and colours. Production UI must not hardcode provider names or tile colours; request profile contract in later phase.
- The Android README is historically stale about whether capture is implemented; code files above are stronger evidence.

## Confirmed pairing contract
- Web login/session and authorized payment workspace are required; create action uses POST /api/go/workspaces/{workspaceId}/phones?environment=live|sandbox, proxied to Go POST /v1/workspaces/{workspaceID}/phones. Current canonical dashboard URL is /w/{workspaceId}/payments/devices; locale is not part of it.
- Web menu: Payments -> Devices & methods -> SMS devices, with "Connect phone" / "ফোন যুক্ত করুন"; this opens a form and generates "Create pairing QR" / "Pairing QR তৈরি".
- POST create requires phone name and returns id, pairing_token and expires_at. Go generates 32 random bytes as unpadded base64url (**43 characters**, not eight); acceptance regex allows 24–160 characters. Database expiry: **5 minutes** (0045_pg06_physical_phone_multi_account.sql).
- QR payload is ekmivo://pair?token=<capability>, not ekmivo://pair?code=... . The Android parser supports this query, but the Manifest has no matching VIEW intent/deep link.
- Current POST /v1/device/claim consumes the capability and responds with phone id, workspace_id, environment and physical_device=true. It **does not return a shop name**, and no separate non-consuming code-validation endpoint was identified. Never invent a merchant/shop name before consent.
- Current web modal has a copyable full token, but no "Open in app" link. No Android account login was found; identity is derived from a dashboard-issued token.
- Preview HTML has an **eight-cell sample code** and sample shop name. Both are demo only and conflict with the actual API; Phase 2 needs a first-class full-token input or a separately designed short-code service, while preserving the cell-style visual hierarchy as far as feasible.

## Phase 0 implementation
- EkmivoTokens.kt: screen and semantic roles from dashboard tokens, status from shared token CSS.
- EkmivoTypography.kt: staged web Hind Siliguri (regular/medium), reference role type scale, explicit Bengali line-height.
- EkmivoTheme.kt: light/dark Material theme host with all relevant neutral semantic roles overridden. Web radii control=6dp, panel=10dp, dialog=12dp; spec fixed component radii are retained in custom composables.
- EkmivoComponents.kt: custom button/pill/status/nav/frame/ring foundations without stock Material controls.
- EkmivoTokenPreview.kt: **developer-only** token/type/component showcase; not routed to the app.
- Document originals + interactive HTML copied to docs/design/. The uploaded phone captures are available in the chat but not yet committed as repo screenshot fixtures.

## Needed web and Go decisions/changes (do not fake client-side)
1. **Go**: validate QR/code without consuming token, returning workspace display name/avatar only after authorization; return structured expired/used/wrong-environment errors. Claim remains after the single consent action. Consider association of consent version/time.
2. **Web**: add a true Android "Open in app" action to the already-copyable code and a reliable phone-only alternative; use the real ekmivo://pair?token=... scheme, not the prompt's illustrative code= parameter.
3. **Go**: expose sender profiles (display name, initials, brand colour), current accepted payment-SMS sender list, and authoritative verified/forwarded aggregates distinctly. Avoid disclosing full payment-related SMS unnecessarily.
4. **Android/Go**: distinguish token revocation from stale projection/temporary authorization failure; 401/403 cannot all be assumed revoked without a stable error contract. Existing PHONE_PROJECTION_STALE is 503 and must remain retryable.
5. **Distribution**: code/repo confirms only debug APK artifacts. Play Store distribution or approved SMS-permission exception **not established**. Do not claim Play eligibility.

## Verification / acceptance gate
A code review is not a Gradle build or screenshot QA. Run:
  cd apps/mobile && gradle --no-daemon :app:assembleDebug :app:testDebugUnitTest
Then capture 360dp and 412dp reference comparisons at screen phases. Phase 0 preview requires compilation/render evidence; **none is claimed** in this audit. No backend/database migration is performed.
