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
