# Merchant mobile app

Android-only **Kotlin + Jetpack Compose** merchant app. Minimal receipt collection is integrated here for PG06; financial decisions stay in Go. Android UI/inbox reaches full phase-2 acceptance at AN03–AN05, never merely from an empty dashboard.


No React Native or Flutter layer. The iOS client is an independent FM04 scope item. See `docs/adr/0001-native-android.md` and Android build instructions below.

## Build

Android Studio or JDK 17, Android SDK 35 and Gradle 8.9:

```sh
cd apps/mobile
gradle :app:assembleDebug :app:testDebugUnitTest
```

The Gradle build **reuses existing Hind Siliguri TTF files from apps/web/src/fonts** using a declared resource generation task; it does not commit font copies or fetch proprietary assets. Debug builds are unsigned for store distribution and CI exposes an `briofold-kotlin-debug` artifact when the native job passes.

To check an actual running Go API (no login/payment APIs wired yet), pass a public HTTPS **origin only** to the build:

```sh
gradle :app:assembleDebug -PbriofoldApiBaseUrl=https://api.example.com
```

Never put service credentials in Gradle properties or the APK. The app only checks `GET /healthz` and `GET /readyz`, never guesses a successful payment from a 200 response. A configured origin is not a merchant session. Android receipts/SMS/notifications are **not read** by this foundation; PG06 adds scoped, consented collection to this same app after real source evidence and Go endpoints are accepted.

## Implemented source boundaries

- Kotlin/Compose navigation: overview, payments (requests/incoming/devices), inbox, settings. No mock transaction/customer rows or unauthorized mutate buttons.
- Saved Appearance (system/light/dark) and Language (Bangla/English) via Android DataStore.
- Reused Ink & Bone palette and Hind Siliguri; animated navigation and content state.
- Network timeouts and explicit Unconfigured/Checking/Unreachable/NotReady/Ready HTTP status; no misleading paid states.

**Not yet built:** merchant login token handoff/authorization, business/product/environment switch, real Go payment/inbox/domain endpoints, notification/receipt capture, background delivery, FCM, device tests, macrobenchmark, Play release, and full 1:1 production chat-app interaction fidelity. AN03 stays open until all phase-2 gates pass.

First verified native debug APK: [Actions artifact 11693123111](https://github.com/masharzy/ekmivo/actions/runs/38115451816/artifacts/11693123111), from successful CI run 38115451816. Download the ZIP from GitHub Actions and extract `app-debug.apk`. Debug APK is an installable developer build, not production-signed and not a working payment gateway.


### Native receipt security foundation (not a collector)
`receipt/EvidenceGate.kt` rejects incomplete/ambiguous amount, actual-payer, time, incoming direction and source-binding fields. `AndroidKeystoreSigner.kt` creates a non-exportable P-256 key *only when enrollment is invoked*; `DeviceSignature.kt` canonicalizes the exact raw HTTP body. Go `internal/deviceevidence` has matching P-256 DER verification and transport replay freshness helpers. None of these helpers reads notifications, starts a background service or marks money paid. PG06 remains open until real authorized device/receipt tests.

Native APK rebuilt with strict receipt prefilter/signature helpers: [CI 38115889313](https://github.com/masharzy/ekmivo/actions/runs/38115889313) / [debug artifact 11693770119](https://github.com/masharzy/ekmivo/actions/runs/38115889313/artifacts/11693770119). Go signer-verification unit tests also passed; Android device/Keystore runtime tests are not yet done.
