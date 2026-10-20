# Android reference Phase 7 — integration and release

## Production workspace repair — 2026-10-20

The owner reported a paired 0.3.0 APK looping at workspace loading. Production Render was still at `5413188`; control lacked `mobile_workspace_state`/`mobile_devices`, and financial realms lacked preview/adoption functions. Applied the exact repository migrations 0114/0116/0118–0121 to control and 0115/0117 to both independent financial databases, after isolated Neon branch migration and rolled-back fixture checks. The compiled existing operator's local preflight failed; it was not counted as success. Execution used Neon transactions around the same SQL files with the same database, realm and owner guards. No schema was copied between production realms. Existing control workspace/user and financial phone/intent/payment counts were unchanged.

PR #86 merged as `f65e23ee3d9a5b60b18a27b193e0cc83a9ffc02f`. Render deploy `dep-dbbd8lei0phs738cn50g` became live at 02:40 UTC. Health returned 200; unsigned workspace-state correctly returned ACCESS_DENIED. All 13 active workspace scopes returned state under the actual restricted projection role, using its operator login. Runtime logs confirmed both receipt workers and workspace reconciler started. No emulator rerun was performed after the owner requested stopping them. A real handset retry is still needed to confirm its signed request and stored pairing end to end.

Runtime logs also exposed the existing maintenance worker lacking EXECUTE on `payment_allowance_reconcile_expired(integer)`. Additive financial migration 0122 grants only that bounded function to `ekmivo_financial_worker`; it does not change allowance or payment logic. Applied to sandbox/live after isolated managed-plan branch checks. Actual restricted worker logins executed rolled-back probes successfully in both production realms. The guarded operator now includes this migration for future installs. Complete Meta/Firebase/private media operation still depends on the separate provider/storage configuration gates below.

Requested 2026-10-20. Version **0.3.0 / versionCode 5**, application ID `com.ekmivo.mobile`; retain the existing pinned production signing certificate. No production migration, deployment, Meta approval or paid storage provisioning is implied by an APK build.

## Source corrections

- Native screens share the same signed Inbox API contract with a composition-scoped injection seam. Test fixtures exist only in `androidTest`; release never uses fixture data or a test endpoint.
- Chat draft and pending send key survive saved-state restoration. A conversation change resets that conversation's state; workspace/realm still scope the composition.
- Read cursors advance from messages actually visible while STARTED, rather than acknowledging every message fetched in a page.
- Product navigation is tested through the real pure policy: AI-only, Payment-only, both and both-off. AI-only onboarding asks for notifications; adding Payment exposes SMS/battery/OEM requirements without a restart.
- Screenshot instrumentation renders the current reference header/nav/SMS components rather than superseded UI.

## Automated release gates

Foundation CI retains Kotlin unit/compile, Go tests/race/vet/smoke, production image builds and the full web/database/browser suite. The signed release workflow additionally compiles instrumentation, runs actual Android-35 emulator UI tests and captures deterministic fixtures at 360dp and 320dp with 130% font size. UI cases include restored text send, durable note clearing, source-failure versus empty state, and 1/2/3/4/5/10-image grids in EN/BN and light/dark, plus pairing/setup/disconnected/SMS/settings captures.

The existing production keystore stays in GitHub Actions secrets. Signed APK assembly waits for the native UI job, verifies the pinned certificate and emits version/source metadata plus APK SHA-256. Manual workflow dispatch remains supported; an owner-labeled `android-release` PR from the same repository also requests a build. Forks do not receive signing secrets. Checkout uses the exact PR head, not an inferred merge commit.

Results and final commit/run/artifact identity are recorded in PR #86 after the runs finish. A compilation or screenshot capture alone is not pixel-match acceptance.

## Remaining human/provider gates

Real Samsung screen-off/reboot/force-stop behavior, live signed SMS evidence, real Meta/Firebase media/push round trips, configured private storage/scanner, complete reference parity/accessibility and production migration/rollout remain pending in `docs/MANUAL-VERIFICATION.md`. An emulator UI fixture does not prove those capabilities. Never advertise all production gates as accepted from these tests.

## First emulator run

`bf0e86f`, run 39354451017: actual Android-35 execution passed 23/24 tests, including draft restore/send, profile note clear, source-failure handling and 20 current setup/SMS/settings captures. The image-catalog bitmap check used merged semantics under a clickable container, where its descendant test tags are hidden; it now inspects the unmerged tree. The bitmap/count assertion remains intact. The release job correctly stayed blocked. Final rerun and screenshot review are pending at this source checkpoint.

Second emulator run `9fafbdc`, 39355263506: **24/24 native UI tests passed** at 360dp, including all image counts/modes. Evidence export then failed because AGP uninstalled the app and removed its private external-files directory. Test PNG export now uses the API-35 MediaStore shared Pictures collection, which survives uninstall, without adding any production storage permission. The 320dp/font130 pass and release signing remain gated on the final run.
