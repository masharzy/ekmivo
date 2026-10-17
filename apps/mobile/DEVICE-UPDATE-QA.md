# Android Device Disconnect + App Updates — Release Checklist

## Behavior implemented
- **Header:** shared Live/Settings brand row respects Android status-bar inset. No extra Settings logo.
- **Phone → web:** Settings Disconnect validates no unsent SQLite or Room evidence, signs `POST /v1/device/phone-disconnect` using the same enrolled P-256 key, waits for server 200, then destroys the local credential. On server error it preserves key and shows an error; local unsent SMS remain encrypted.
- **Web → phone:** Dashboard revoke remains the existing merchant-authorized `POST /workspaces/.../phones/{id}/revoke`; app calls its signed heartbeat every 12 seconds **only while visible**. Server 401/403 drives the existing Revoked StateFlow without restarting; Android's existing background foreground-service interval remains two minutes and may be delayed by OEM/OS limits. No WebSocket, Firebase push, paid worker, or unapproved polling service.
- **Dashboard:** previously revoked phones remain listed with Disconnected status and a **Generate new pairing QR** action. This starts the existing secure five-minute, eight-character pairing creation modal. Old tokens/phone IDs are not reactivated; re-pair explicitly generates a new enrollment.
- **App updates:** Settings has a compact App updates row. It checks `GET /v1/mobile/releases/latest` (read-only). If a higher version is configured, shows **Update now**. The APK is fetched via HTTPS, limited to 150MB, SHA-256 verified, and Android package/version checked before starting the **system installer**, which requires explicit consent. It cannot silently install or bypass the OS.

## Release prerequisites and current deployment status
1. Migration `infra/migrations/0083_phone_self_revoke.sql` was applied and verified in both Neon sandbox and live financial databases on 2026-10-18. Compatible Go API deployment still needs verification before the new APK is used for disconnect. An un-migrated server replies 503 and the app safely keeps enrollment.
2. Deploy the web dashboard update and confirm the latest server state is returned in the phone list. Web view polls while visible at 10-second intervals; there is no claim of instantaneous push notification.
3. Publish a **release-signed** APK (single persistent Android signing identity, package `com.ekmivo.mobile`, versionCode higher than installed) to an HTTPS-hosted release URL. Configure on Render:
   - `EKMIVO_ANDROID_VERSION_CODE` (integer greater than installed version; this build uses 4)
   - `EKMIVO_ANDROID_VERSION_NAME`
   - `EKMIVO_ANDROID_APK_URL` (HTTPS, direct APK, no redirect)
   - `EKMIVO_ANDROID_APK_SHA256` (64-character SHA-256 hex digest)
4. If unset, the endpoint returns HTTP 204 and the app truthfully says **No release published**, never a dummy update.
5. **CI debug APKs generally have ephemeral debug keys** and are not suitable for seamless replacement unless signed with the same certificate; release signing is mandatory for the user's update experience.
6. Sideload installs require Android's per-app "Install unknown apps" approval and a final system install confirmation. Google Play-distributed app updates should use Play In-App Updates, not sideloading.

## Manual Samsung QA
- Verify both Live and Settings headers are fully below grey system status bar in EN/BN, light/dark, at 360dp and 412dp. Screenshot compare against existing reference.
- Pair handset, switch to Settings and Disconnect. Verify SMS queue guard, server 200, web row switches to Disconnected within ~10s; old key becomes invalid for heartbeat.
- In web, select disconnected phone, choose Generate new pairing QR, submit existing name and confirm new one-time eight-character code with five-minute expiry. Re-pair through official app flow.
- Revoke from web while Android app remains on Live with screen on. It should switch to Disconnected within ~12s + request latency, with no recent-app clearing. Repeat with screen off 30min: background job timing may be OEM-restricted; note observation.
- With no update release env configured, verify no fake update offer. With a later correctly signed manifest, tap Update Now; verify hash checks, OS permission prompt, OS package installer and continued app data. Test invalid hash, downgrade and package mismatch rejection.
- Pending SMS must never be lost or reassociated across workspaces; errors must not silently delete cryptographic evidence.

## Verification status
Source tests and build to run on the EC Education validation fork. End-to-end migration, signed APK installation and real Samsung device trials are **pending** until independently verified.
