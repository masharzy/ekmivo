# Ekmivo agent entry point

## Latest owner decision — 2026-10-13 (supersedes receiver-number/SIM matching requirements)
Paired Android phones forward only allowlisted bKash/Nagad/Rocket transaction SMS; **no app SIM selector, receiving-number autodetection, device-to-account mapping, merchant parser setup or extra payment approval**. Backend authenticates the signed phone's workspace, parses complete provider receipt and uniquely matches the immutable attempt by **provider, full payer number, exact amount and ORIGINAL transaction time after issuance/within the attempt's window**. Checkout's displayed/selected receiving number is NOT a matching condition; the receiving account stored on an observation is attributed from the matching attempt for financial-schema compatibility, NOT evidence of actual SIM recipient. Duplicate provider receipt/ambiguous overlap must not pay twice.
Offline captured SMS remains encrypted and auto-retries. App shows last queued/sent receipts and offers user-initiated narrowly scoped historical SMS recovery when OS policy and READ_SMS permission allow; no impossible always-on guarantee when device is powered off or force-stopped. If a receipt for a valid pre-expiry transfer is processed after checkout expiry/cancellation, create **one seller-managed refund request** with sender contact; NEVER automatically send refund money. Device/method plan limits are OFF for now; **do not hardcode permanent unlimited plans**. Older five-field receiver identity language in documents is historical and superseded by this paragraph. Implementation PR #19 is not yet real-device/production verified.



## Canonical plan

**Use `docs/DUAL-SAAS-MVP-PLAN.bn.md` as the main implementation plan.** Do not create a competing plan or infer scope from a previous chat summary when these documents contain a newer explicit correction.

Read in this order before implementation:

1. `docs/DUAL-SAAS-MVP-PLAN.bn.md` — product, architecture, payment behavior, delivery gates.
2. `docs/MVP-FEATURE-SCOPE.md` — complete first-release capability inventory and acceptance.
3. `docs/DESIGN-SYSTEM.md` — required visual system, responsive patterns, light/dark and EN/BN behavior.
4. `docs/design/tokens.css` — exact semantic design tokens.
5. `docs/IMPLEMENTATION-BACKLOG.md` — dependency-ordered work and required evidence.
6. `docs/PAYMENT-SYSTEM-DESIGN.bn.md`, `docs/PRODUCT-UX-SPEC.bn.md`, `docs/PAYMENT-API-AND-SANDBOX.md` — detailed payment architecture, every-screen UX and contract/sandbox/docs specification.
7. `docs/IMPLEMENTATION-STATUS.md` and `docs/AGENT-HANDOFF.md` — latest code evidence and execution handoff.

## Fixed user decisions

- All listed features belong in the first full public MVP. Do not silently move them to a later release. Internal build milestones can be partial.
- Payment verification is automatic using transaction time, actual sender number, amount, receiving account and method. A valid unique match automatically verifies/confirms and dispatches the merchant webhook.
- Do not introduce customer TrxID entry, screenshot submission, routine merchant approval or an auto-verification opt-in into the normal payment flow. Receipt IDs may be extracted internally for deduplication. Additional gateway integrations are not prerequisites for the phone verification path.
- Follow the latest user-selected V3 public landing direction: a premium animated Ink & Bone (Option F) monochrome product narrative, with light #FAFAF8/#FFFFFF/#222222/#262626 and dark #141414/#242424/#F5F5F1/#F1F1E9, full-page Light/Dark/System coverage with Hind Siliguri. Operational UI remains readable, information-led and accessible. Both light/dark modes and a complete EN/BN switcher are first-release features.
- Build the design foundation before product page styling. Preserve feature coverage; minimal visuals do not mean fewer features.
- Selected core: Go, PostgreSQL, Next.js/TypeScript and **Android Kotlin + Jetpack Compose**. No React Native/Flutter UI and no separate Kotlin bridge app. Android receipt collection is a native module inside this same Kotlin application; iOS is separately scoped for later. Single implementation collaborator is Codex; account/business actions belong to the user.
- Latest sequence (2026-10-11): first complete running payment gateway with isolated sandbox, tests, developer/API docs; then full Android merchant app with inbox; then remaining full dual-service MVP. A minimal native Android receipt collector inside the full Kotlin app is a phase-1 dependency; there is no React Native-to-Kotlin bridge. Follow PG00–PG17, AN01–AN05, then FM01–FM05 in the backlog; no feature silently removed.
- Existing self-hosted auth source is preserved/hardened with Go authorization; earlier proposed Clerk is not implemented. Preserve applied migrations in infra/migrations; no duplicate migration runner.

## Document ownership and work evidence

The user's latest explicit instruction takes precedence. Within the documents, the master plan owns architecture; the feature inventory owns feature completeness; the design guide owns UI behavior; token CSS owns exact values; the backlog owns sequencing. Resolve discrepancies by updating the affected documents together without undoing the user's decisions.

Take the next dependency-ready work item. Record the item and scope IDs, concrete changes, relevant checks and unresolved dependencies. Planned work, mock provider output and sample screens are not evidence of a live integration. Do not mark incomplete tasks done or claim an untested capability.

Current repository status: partial web/auth/dashboard foundation; financial engine/API/worker/bridge/sandbox not implemented. Latest evidence is docs/IMPLEMENTATION-STATUS.md. PG00 CI accepted. PG01 is in progress with Go authz, admin TOTP, applied additive migrations 0003/0004 and production least-privileged role verified. PG01 acceptance remains OPEN until live admin MFA and authorized Go runtime checks; PG02 must not start until PG01 passes. D01/D02 remain open.

## Latest owner execution constraint — 2026-10-11

Keep Android entirely Kotlin/Jetpack Compose, but **stop Android UI expansion**. Follow payment-first PG01, PG02, ... serially; only advance after each item's acceptance evidence is complete. PG06 Android signer/structural validation and AN03 debug APK remain **partial source evidence**, not real receipt collection/payment or Android release acceptance. Never silently mark PG06/AN03 complete.


## Latest PG02 execution authorization and UI acceptance (2026-10-11)
The owner explicitly allowed **PG02 implementation to begin while a separate agent independently verifies PG01**. This overrides the earlier no-start-before-PG01 rule for implementation only; PG01 stays UNACCEPTED until its verified evidence closes every gate, and PG02/PG03 must never be declared accepted or advanced beyond their prerequisites prematurely. Preserve concurrent agent changes and do not reset source/migrations.

**Before each PG's user interface**, read the relevant named screen in `docs/PRODUCT-UX-SPEC.bn.md`, `docs/DESIGN-SYSTEM.md` and tokens. An endpoint, route, empty shell, preview/mock, placeholder table or visually clickable but inert action does NOT meet acceptance. Verify authorized **real data + interactions + loading/error/empty/success/forbidden/offline** where applicable; responsive 320/768/1024/desktop; full EN/BN and Light/Dark/System, keyboard, drafts, roles and deep links. If its real backend is unimplemented, label unavailable honestly and leave that PG screen/gate OPEN.

## Owner execution update — 2026-10-11, sequential delivery and one manual-verification ledger

**Implement each PG in dependency order and self-verify every technically available check; never idle waiting for the owner to do manual testing.** Owner accepts an implementation milestone with roughly 70–80% verification (and may accept a lower verification percentage) provided all remaining checks are clearly marked **manual pending**, not claimed passed. This relaxes waiting for human verification, **not** financial correctness, real-provider evidence, consent/security or the distinction between implementation and production acceptance. Continue work in serial implementation order when remaining gates are truly human/manual only; do not advance past missing code, core failed CI or unsafe production blockers.

The one consolidated manual test ledger is **`docs/MANUAL-VERIFICATION.md`**. Each PG must specify exact outstanding manual tests and test account/device/source needed; preserve existing entries and update outcomes when real evidence arrives. Automated test outcomes and commit/CI/deploy refs belong in per-PG `docs/evidence/PGxx/README.md`. Do not ask the owner to test each PG separately; bundle a single combined test pass.

**Before any PG UI implementation, read the matching screen in `docs/PRODUCT-UX-SPEC.bn.md`.** No “done” by endpoint or empty route. All available data/actions and loading/error/empty/success/forbidden/offline states, role-gated routes, keyboard and responsive EN/BN + Light/Dark/System behavior must actually work. If data service/provider is not built until a later PG, label that route **source unavailable / deferred dependency** — not “zero records”, simulated live data or accepted. Work alongside existing concurrent branch changes without overwriting their files.
