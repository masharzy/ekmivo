# Android reference Phase 7 — integration and release

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
