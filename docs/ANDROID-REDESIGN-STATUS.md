# Native Android reference redesign — 2026-10-19

Owner authorized Phase 1 completion/push followed by starting Phase 2. Each phase has its own source commit. The numbered phases here refer to the new reference handoff, not historical PG/Android phases.

## Phase 1 — implemented, build/visual verification pending

- Existing Compose app and offline bundled Hind Siliguri 400/500 retained; language/theme DataStore persistence retained.
- Corrected native light/dark semantic roles to the owner's current HTML, independent of dashboard CSS. Added seen role and chat/profile text/measurement roles.
- Ported all 35 distinct SVG sprite symbols from the supplied references into native VectorDrawables. Navigation now uses the actual reference activity/settings paths.
- Added reference header, profile card, filter chip, enabled/disabled primary button, capability-hosted bottom nav and locale display-digit helper. The legacy shipping nav remains unchanged until Phase 2 capabilities are authoritative; disabled Inbox stays disabled.
- Updated developer token previews. No WebView/JS bridge or fake chat data.
- Local checks: `node --test apps/mobile/phase6-contracts.test.mjs` (3 passed); `git diff --check` passed.
- Local Android SDK/Gradle absent. GitHub CI assemble/unit result and emulator screenshot comparisons are pending; implementation is not claimed visually verified or production accepted.

## Phase 2 — next

Start with product-neutral Welcome + manual-code copy/flow and a tested workspace capability permission policy. Pre-claim workspace lookup is missing from the current Go device API: current `claim` consumes the token; it cannot be used as a preview before consent. Do not fetch/claim silently merely to show a store name.

## Forward meaning and current blocker

Reference forward means sending a NEW copy through a channel's ordinary send-message operation, not provider-native forwarded-message metadata. It needs actual server send/media/capability/window authorization support. Current Android Inbox is disabled and its repository only observes threads/messages and marks read; no send/forward implementation exists. Keep disabled until the relevant phase implements and verifies it. Official Meta-owned WhatsApp collection documents ordinary text/media sends: https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ba8d099d-007e-4b52-b9f2-3cf3c60e4fbc . This is not evidence every channel/type can forward.

## References and continuation

`docs/ANDROID-REDESIGN-HANDOFF.md` contains the complete specification and all originals. Extracted originals are in `docs/design/android-20261019/`. No sample customer/store values should enter production. Continue from the latest checkpoint in this file, not old Phase6 docs. No migration, financial matching, account mapping or existing plan-limit behavior changed.

## Phase 1 pushed evidence

Source commit: `4dee27488267fdca88adee6588c19620c3e04f13`; PR #86. GitHub Actions run `39258379855`: Native Kotlin Compose assemble + unit tests **passed**, debug APK artifact uploaded; runtime/migration Docker compile passed. Device screenshot parity still manual pending. Unrelated Go HTTP smoke failed after Go unit tests passed; do not report entire CI green.

## Phase 2 — started, not complete

Implemented the real lookup slice: new non-consuming financial pairing-preview function (0115), minimal authoritative control workspace/products function (0114), Go `/v1/device/pairing-preview`, explicit guarded migration-operator mode, and native QR/manual-code → loading → fetched confirmation/retry flow. Manual code now has explicit Verify action; workspace/realm returned by claim must match the preview before local enrollment is saved. Invalid preview cannot revoke a retained pairing. Product-neutral Welcome copy and exact native setup icons are used.

Verification: existing mobile contracts 3/3 pass; Neon `test-dashboard-sms-evidence-20261015` (`br-cold-paper-b3pks3sr`) control + sandbox financial transaction tests passed for authoritative name/products, unknown scope, read-only repeated preview, expiration, revocation, claimed code, suspended workspace and invalid digest. Both transactions rolled back; confirmed both new functions absent afterward. Fresh branch creation was refused by Neon branch quota, so these checks used an existing non-production test branch without persistent changes. Production migrations/API rollout **not performed**.

Remaining Phase 2: product-aware durable device identity/enrollment for AI-only (existing phone codes require financial payment projection); permissions/wizard/background work and navigation driven by authoritative capabilities; per-reason failure/expired recovery handling; lifecycle/rotation/small-screen validation; real camera/device pairing QA; production migration/runtime rollout only after reviewed checks. The current preview reads existing Payment phone codes; it is not an AI-only enrollment implementation.

Owner integration direction: `ANDROID-MESSAGING-FOUNDATION.md` is binding for later work. Build real DB/API/channel flows, including technically supported reference interactions, before enabling the UI. Do not mark planned entities/contracts as implemented.

### Next agent action

Start from PR #86 head. Inspect latest Android/Go CI before merging. Continue Phase 2's control-plane device enrollment/capability path without changing payment financial matching, old enrollment IDs or queued evidence. See explicit migration mode `MOBILE_PREVIEW_ALLOW_MIGRATION=true` with `MOBILE_PREVIEW_CONTROL_MIGRATION_FILE` (0114), `MOBILE_PREVIEW_FINANCIAL_MIGRATION_FILE` (0115), and existing three `PG04_*_MIGRATION_DATABASE_URL` variables. It runs only these additive migrations, not base/River migrations. Do not release the new pairing UI against an old API without these functions deployed.

### Checkpoint validation detail

Phase 2 source checkpoint `7a42f2b2a23bc8eac21480e9d9734925bb48c215` is pushed. Its compile CI is run `39259379422`; runtime/migration Docker compilation passed. Latest local Node source contracts: 7/7 passed (mobile contracts + short-code consent checks). OpenAPI validation attempted locally but could not run because this isolated checkout has no `@apidevtools/swagger-parser`; CI owns that check. The follow-up adds the explicit API schema and rejects unexpected preview fields/trailing JSON. Source flags remain gated by migration/runtime availability; full Phase 2 is not accepted.

HTTP Go smoke failure on Phase 1 run was connection refused on port 18080 after its startup polling window, while Go unit tests and Docker compile passed. The log did not surface the redirected server log, so the root cause is not proven and no unrelated API/security behavior was changed to silence it.

### Phase 2 compile evidence

Run `39259379422` for `7a42f2b`: native Android debug assemble and unit tests **passed**, Go unit/race/vet step **passed**, API and migration Docker builds **passed**. HTTP smoke and broader web checks are separate; no whole-CI-green claim. Follow-up request-decoder/OpenAPI changes remain subject to their latest CI. Device/visual and full Phase 2 gates remain open.
