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
