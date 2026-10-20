# Android reference phases 2–4 — 2026-10-19 checkpoint

## Current implementation

Phases 2–4 source implemented together; combined CI pending at this checkpoint. Phase 1 previously passed native compile/unit CI. Exact screenshot parity and live provider/device acceptance remain manual pending.

- Phase 2: product-neutral QR/manual preview, explicit consent, control-plane device identity for AI-only/Payment/both, same-ID reconnect, server workspace capabilities, product-aware permissions and navigation. Foreground refresh runs immediately on STARTED and every two seconds while visible: no restart/APK update for entitlement changes. This is bounded polling, not a zero-latency push guarantee. Android permission consent always remains user-controlled.
- Phase 3: native SMS dashboard from encrypted local evidence, durable daily delivery counters (additive Room migration), connection/offline/failure/retry states; capability-aware Settings, same device identity on Payment adoption, existing queued receipt preservation. Unknown historical totals display a dash rather than fabricated zero.
- Phase 4: signed real database Inbox list/filter/pagination, text chat, durable reader cursors, AI handover toggle, reply quote/copy/swipe, idempotent send and known-failure retry, provider-derived delivery/read status, closed-window/offline states. Web Inbox uses the same database/API. Media/forward/reactions/profile belong to the later reference phases and are not claimed implemented here.

## Backend and database

Additive migrations 0114/0116/0118/0119/0120 target CONTROL only. 0115/0117 target each independent FINANCIAL realm. Control devices never bind a phone/SIM to a receiving account. Authoritative signed workspace-state remains readable with either/both products off; disabled Payment cannot collect or deliver new receipts. Financial projection readiness is distinct from entitlement. Legacy phone key/revocation is checked before adopting control identity.

Normalized channel connections/threads/messages/read cursors, tenant+realm scope, encrypted channel credentials, signed provider webhook ingestion, durable outgoing queue, early delivery-status replay, scoped encrypted push registration/jobs and OAuth single-use actor-bound states are implemented. Ambiguous send outcomes are marked uncertain instead of blindly sending duplicates. This does not implement an AI reply-generation engine.

## Operator rollout (not performed)

Use the EXISTING financial migration operator with `MOBILE_PREVIEW_ALLOW_MIGRATION=true`, explicit `MOBILE_PREVIEW_CONTROL_MIGRATION_FILE` (0114), `MOBILE_PREVIEW_FINANCIAL_MIGRATION_FILE` (0115), `MOBILE_FOUNDATION_ALLOW_MIGRATION=true`, `MOBILE_FOUNDATION_MIGRATION_DIRECTORY`, and the existing three `PG04_*_MIGRATION_DATABASE_URL` values. Migration owner/independent-realm checks remain. No automatic API-startup migrations; deploy migrations before new runtime/client.

Server provider configuration: inspect `inbox_oauth.go`/`inbox_provider.go` for META variables, approved scopes, redirect/webhook URLs and API version. Enable `INBOX_SENDER_ENABLED=true` only on the configured sender runtime. Push optionally requires `INBOX_FCM_CREDENTIALS_FILE` pointing to server-only service-account JSON. Android public Firebase identifiers use `EKMIVO_FIREBASE_APPLICATION_ID`, `EKMIVO_FIREBASE_API_KEY`, `EKMIVO_FIREBASE_PROJECT_ID`, `EKMIVO_FIREBASE_SENDER_ID`; without configuration no mock token/notification is generated.

## Verification

Local Go all-package tests passed. TypeScript passed. Neon isolated branch `br-cold-paper-b3pks3sr`, database `ekmivo`: rolled-back migrations and functional tests passed product switching, AI-only pairing, both-off access, cross-realm/tenant denial, incoming deduplication, outgoing idempotency conflicts, handover, durable reads, early provider seen event replay, 24h denial, revocation and push-job fanout. No production migration or rollout performed. Combined remote CI results must be appended below after completion.

## Next agent / remaining gates

Do not reset financial matching, identity, queues or plan semantics. Read `ANDROID-REDESIGN-HANDOFF.md` and original references in `docs/design/android-20261019/`. Continue later reference phases only after combined CI is green. Keep live Meta approval/account tests, Firebase delivery, real-device permission transitions/process death, EN/BN and screenshot comparison pending in `MANUAL-VERIFICATION.md`. Do not claim pixel parity or production acceptance from compilation. No separate release APK requested at this stage.

## Combined verification checkpoint

Commit `4b8ed10c0c165bd60eea8bf240ac18a6854e30e5`, run `39265784728`: native Compose compile/unit, Go all-package/race/vet/HTTP smoke and both runtime/operator image builds passed. Web lint/build/OpenAPI and initial database suites passed; PG04 HTTP fixture failed because the fixture omitted runtime-required `pg06_workspace_ready`. Follow-up installs the genuine pipeline/readiness migrations in both disposable realms before current API requests; readiness security remains enforced. Run `39266611114` tests that fix plus unread opening position/divider, quote jump/highlight, exact long-press duration, swipe/haptics, pull refresh, pagination refresh, lifecycle-aware polling and connected-channel management. Final run outcome is recorded on PR #86; do not infer success from this pending checkpoint.

Additional Neon rollback evidence: 0117 adopted AI-first phone identity idempotently in both sandbox/live financial test databases, with one physical phone and authorized key. OAuth actor isolation and single-use replay tests passed in control.

The second run passed native/Go/image checks and real checkout browser journeys at 320/768/1440, EN/BN and Light/Dark, then stopped on an obsolete expired-result heading assertion. The current Official theme says “This payment link has expired”; the fixture now asserts that exact heading and the do-not-send-money guidance. New phase 2–4 SQL assertions are also included in the existing isolated CI database suite and roll back after testing.

Database role verification correction: the running API uses `ekmivo_financial_projection` for its restricted control pool and `ekmivo_finance_reader` for each finance pool. Function-only EXECUTE grants now include those actual roles; raw messaging tables remain inaccessible. CI installs the real additive contracts before current API HTTP tests, and SQL asserts actual pool-role execution. Earlier owner-role-only SQL checks did not establish runtime grants.

## Verified combined CI checkpoint — 2026-10-19

Commit `4cf7f9b780600ec55c60cf4abfb007d87f5c6b54`, [Foundation CI run 39267709334](https://github.com/masharzy/ekmivo/actions/runs/39267709334): **all four jobs passed** — native Kotlin Compose assemble/unit tests, Go compile/unit/race/vet/HTTP smoke, runtime/migration image builds, and full Next.js lint/build/OpenAPI/PostgreSQL/session/browser suites. Mobile foundation SQL and restricted-role execution were included.

Final follow-up contains this consolidated handoff, both-off permission-screen guard, stable end-of-history pagination and quote content/jump across older pages. Inspect the latest PR head CI before continuing; the green checkpoint above predates this final follow-up. Real-device/provider/production acceptance remains pending as documented.

## Reference phases 5–6 — source checkpoint (2026-10-20)

Native media selection (up to ten images), camera capture, removable preview, grouped image bubbles, image viewer/zoom, on-demand microphone permission, real AAC recording/amplitude, playback, documents, catalog picker, reactions, forward-as-copy and actual message information are wired to signed Inbox actions. Selection uses stable per-batch/per-file send keys: a retry does not create a second logical send. Recording is discarded on leaving/backgrounding, and recordings under one second are rejected. One active audio player.

Control migration 0121 adds private media metadata, encrypted inbound provider references, product snapshots, scoped customer orders/contact, versioned notes and provider-confirmed reactions. The sender uploads WhatsApp media bytes through Meta Media API; Messenger/Instagram fetch short-lived signed private-media capabilities. Existing private S3-compatible transport and malware scan are reused. Configure `PRIVATE_S3_*`, `PRIVATE_UPLOAD_CLAMD_ADDRESS`, approved Meta app and `INBOX_PUBLIC_API_ORIGIN` before media is operational. No new storage service has been provisioned. The application caps individual attachments at 5 MiB, stricter than some provider limits. Incoming references are hydrated on demand; expired provider URLs fail honestly, never render fabricated bytes. Instagram documents are conservatively disabled in this account integration; reaction capabilities come from the server. WhatsApp products use textual catalog snapshots without a claimed Meta commerce-catalog connection; Messenger/Instagram use generic cards.

Customer profile reads same-workspace/same-realm orders, complete aggregate totals, conversation counts (a new session after a gap exceeding 24 hours), known contact/interests, introduction, and persistent notes with optimistic version checks, including clearing. No cross-merchant identity inference or fabricated orders. Order/catalog/contact write actions are web-session-only; Android reads them and changes notes/AI. These explicit source actions are a foundation for the future commerce ingestion flow, not evidence that an external commerce connector exists.

Verification at this checkpoint: migration and functional media/profile/notes/isolation/idempotency assertions passed in a rolled-back Neon test-branch transaction. Local Go all-package checks executed; final combined CI outcome must be checked on the PR. Live provider/media round trips, storage/scanner configuration, device camera/mic interruption/rotation and screenshot parity remain manual pending. No production migration/deploy or release APK.

First phase 5–6 combined run: commit `940a6b711df8dfb8da1da1c12d3c014d8fde0782`, [Foundation CI 39306268353](https://github.com/masharzy/ekmivo/actions/runs/39306268353), all four jobs passed (native compile/unit, Go tests/race/vet/smoke, runtime/operator image builds, full web/database/browser suite). Final follow-up preserves conflicted note drafts, matches reference percentage rounding, replays early incoming reactions, checks advanced functions under the restricted role in CI, pauses background playback, supports media reply context and fixes recording/album/forward-search details. Check the follow-up head result rather than inferring it from this earlier green run.

## Phase 7 release checkpoint — 2026-10-20

Owner requested Phase 7 and a signed APK. Version bumped to 0.3.0 (code 5), preserving the existing production key. Fixed saved-state draft/pending-key reset and unread acknowledgement of fetched-but-unseen messages. Introduced a single signed native Inbox API with test-only instrumentation fixtures, real product/permission policy checks, current-component screenshot captures and an emulator gate before signed release assembly. Test configuration uses `https://example.invalid`; release retains the configured production origin. No fixture is shipped as live data.

Current source/verification matrix, workflow gating and remaining physical-device/provider/visual/production gates: `docs/evidence/ANDROID-REFERENCE-PHASE7/README.md`. Final run, signature, exact source and artifact checks must be confirmed on PR #86; do not infer completion from this pending checkpoint. The requested APK may be delivered as a production-signed build while those explicitly human/provider gates remain unverified.
