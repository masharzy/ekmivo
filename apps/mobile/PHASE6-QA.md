> Historical pre-workspace Phase 6 checklist. Current reference phases 1–7 and release gates are in `docs/ANDROID-REDESIGN-STATUS.md` and `docs/evidence/ANDROID-REFERENCE-PHASE7/README.md`; older disabled-Inbox statements below no longer describe the current app.

# Phase 6 QA checklist — Android

## Implementation scope
- Shared top bar for Live and Settings: one 34dp logo, brand `ekmivo`, EN/BN switch. Settings has one plain heading, no second logo.
- Live status badge is positioned at the top-right of the 136dp pulse ring, inside a 166dp overlay. Forwarded-in-history label is two lines.
- Inbox groundwork only: data classes, repository contract, disabled route, notification channel and FCM token callback bound to current phone enrollment. `InboxFeatureFlag.inboxEnabled` stays `false`; no third tab or fake messages.
- Firebase project registration, server token endpoint, actual inbox push delivery and chat API do not exist in this phase. They must be provided before enabling the flag.

## Automated gates
1. `cd apps/mobile && gradle --no-daemon :app:assembleDebug :app:testDebugUnitTest :app:assembleDebugAndroidTest` — build/JVM tests and compile screenshot instrumentation.
2. `node --test apps/mobile/phase6-contracts.test.mjs` — shared header, badge, text wrap and hidden Inbox contract.
3. Emulator screenshot tests (`connectedDebugAndroidTest`) **require a booted emulator**. Compile alone is **not** a passed visual test.

## Mandatory screenshot captures and side-by-side comparison
For **each of** Home, Pairing, Permission wizard, Disconnected and Settings:
- Boot at exactly 360dp and 412dp logical width; verify density with `adb shell wm size` and `adb shell wm density`.
- Capture dark and light; English and Bangla. Include system status/nav bars and ensure none overlay interactive controls.
- Open the matching approved HTML reference; compare 34dp header / 10dp radius, 136dp rings / 112dp core, typography, text wrapping, margins, section hairlines, pill stroke and background, selected bottom-nav surface, and locale copy.
- Screenshot instrumentation tests in `Phase6ScreenshotTest` capture **all five screens** (Home, Pairing Welcome, Permission Wizard, Disconnected and Settings) as PNG into the app external-files `phase6_screenshots` folder when executed on emulators. The screenshot test captures first-screen previews under actual device state only; real paired/denied states still require manual navigation. No synthetic pairing token, fictitious permission acceptance or manufactured receipt may be injected into production UI.
- Treat any discrepancy as **not accepted** until corrected. Captures are NOT pixel-comparison assertions.

| Element | Spec/reference | Phase 6 implementation | Screenshot match |
|---|---|---|---|
| Header logo | 34dp, 10dp radius | Shared EkmivoBrandHeader | **Not verified** |
| Settings page title | one title, no duplicated logo | Plain SettingsHeading | **Not verified** |
| Ring/core | 136dp/112dp | Existing ring unchanged | **Not verified** |
| Status badge | User requested upper-right overlap | Stable top-right badge on overlay | **Not verified** |
| Hero copy | two lines within 112dp core | Forced line break EN/BN | **Not verified** |
| Colours | Web-derived dark/light palette | Existing EkmivoTokens | **Not verified** |
| Language | EN/BN switch in both tabs | Shared header | **Not verified** |
| Bottom tabs | Live and Settings only | Existing two-tab bar | **Not verified** |

## Manual Samsung test — screen off 30 minutes
1. Use a real Samsung with Android notification and SMS permissions granted, battery exemption configured, paired with **a sandbox workspace**; note the phone name and server heartbeat time.
2. Open both Live and Settings: confirm one identical header, no duplicate logo, Live badge overlaps the ring, Bangla & English work in light/dark. Confirm empty history reads ৳0 and no phantom receipts.
3. Leave the phone with the **screen off for 30 minutes**. Keep a second device open on dashboard SMS devices; record last-heartbeat samples (at 0, 5, 15 and 30 minutes), statuses and service-notification presence. Notification alone is not proof of upload.
4. Send a permitted real **sandbox-only** payment SMS evidence message through the normal flow. Confirm no duplicate receipt, correct pending/sent transition and server ACK; don't confuse forwarding ACK with a verified payment.
5. Revoke phone from web while app is visible: it must transition to Disconnected without an app restart, with encrypted unsent receipts retained. Re-pairing only after explicit user action.
6. In Settings test Diagnostics, log export (no SMS contents, payer numbers or signing keys), inbox rescan with explicit READ_SMS permission, disconnect confirmation and queued-receipt guard.
7. Verify no Inbox nav item, no Firebase registration without actual project config, no chat notifications and no financial SMS behaviour changes.

## Limitations
- This environment has no Android emulator that has produced side-by-side proof. **Screenshot-perfect acceptance is pending**.
- A configured Firebase project and authenticated inbox API are future dependencies. Shipping the disabled SDK seam does not mean FCM push works.
- Android OEM/OS background restrictions can delay work; live Samsung test controls acceptance.
